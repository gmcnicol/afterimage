import { spawn } from 'node:child_process';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getExportProfileById } from '@afterimage/export-profiles';
import {
  getDefaultSequence,
  getDefaultVariant,
  getSequenceById,
  getVariantById,
  type NormalizedProjectFile
} from '@afterimage/project-model';
import {
  buildAnalysisPlan,
  buildAudioChangeAnalysisPlan,
  buildExportPlan,
  buildPreviewPlan,
  buildThumbnailPlan,
  buildWaveformPlan,
  type CommandExecutionResult,
  type CommandRunner,
  type CommandRunnerOptions,
  type CommandSpec,
  executeCommandSpec,
  resolveFfmpegTools
} from '@afterimage/ffmpeg-compiler';
import {
  createAnalysisFile,
  generateCutCandidatesFromAnalysis,
  parseAudioChangeAnalysis,
  parseFfprobeOutput,
  parseSceneDetectionOutput
} from '@afterimage/media-analysis';
import { parseProject } from '@afterimage/schema-validators';
import type {
  DesktopJob,
  RunAnalysisRequest,
  RunExportRequest,
  RunPreviewRequest
} from '../../src/shared/contracts.js';
import type { Logger } from './logger.js';

type QueueClass = 'analysis' | 'heavy';
type JobResult = NonNullable<DesktopJob['result']>;
type RetryPayload =
  | ({ kind: 'analysis' } & RunAnalysisRequest)
  | ({ kind: 'preview' } & RunPreviewRequest)
  | ({ kind: 'export' } & RunExportRequest);
type JobWithRetry = DesktopJob & { retryPayload?: RetryPayload };

interface JobTask {
  jobId: string;
  queueClass: QueueClass;
  retryPayload?: RetryPayload;
  run(signal: AbortSignal, report: (message: string, progress: number) => void): Promise<JobResult>;
}

interface JobManagerOptions {
  logger: Logger;
  onJobsChanged(jobs: DesktopJob[]): void;
}

async function ensureArtifactDirs(projectRoot: string): Promise<void> {
  await Promise.all([
    mkdir(join(projectRoot, '.afterimage', 'analysis'), { recursive: true }),
    mkdir(join(projectRoot, '.afterimage', 'thumbnails'), { recursive: true }),
    mkdir(join(projectRoot, '.afterimage', 'waveforms'), { recursive: true }),
    mkdir(join(projectRoot, '.afterimage', 'preview'), { recursive: true }),
    mkdir(join(projectRoot, 'exports'), { recursive: true })
  ]);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveAvailableOutputPath(basePath: string): Promise<string> {
  if (!(await pathExists(basePath))) {
    return basePath;
  }

  const extensionIndex = basePath.lastIndexOf('.');
  const baseName = extensionIndex >= 0 ? basePath.slice(0, extensionIndex) : basePath;
  const extension = extensionIndex >= 0 ? basePath.slice(extensionIndex) : '';

  for (let attempt = 1; attempt < 1000; attempt += 1) {
    const candidate = `${baseName}-${String(attempt).padStart(3, '0')}${extension}`;
    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }

  throw new Error(`Unable to allocate export filename for "${basePath}".`);
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function parseFfmpegTimeToMs(value: string): number | undefined {
  const match = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(value.trim());
  if (!match) {
    return undefined;
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseFloat(match[3]);

  if ([hours, minutes, seconds].some((part) => Number.isNaN(part))) {
    return undefined;
  }

  return Math.round((((hours * 60) + minutes) * 60 + seconds) * 1000);
}

function resolveRenderedVariantDurationMs(project: NormalizedProjectFile, variant: NonNullable<ReturnType<typeof getVariantById>>): number {
  let durationMs = variant.clips.reduce((sum, clip) => sum + clip.durationMs, 0);

  for (let index = 0; index < variant.clips.length - 1; index += 1) {
    const clip = variant.clips[index];
    const nextClip = variant.clips[index + 1];

    if (clip.transition !== 'mask' || !nextClip) {
      continue;
    }

    durationMs -= Math.max(0, Math.min(clip.transitionDurationMs ?? 250, clip.durationMs, nextClip.durationMs));
  }

  return Math.max(0, durationMs);
}

function resolveTargetRenderDurationMs(project: NormalizedProjectFile, variantId?: string, sequenceId?: string): number {
  const sequence = sequenceId ? getSequenceById(project, sequenceId) : getDefaultSequence(project);
  const variant = variantId ? getVariantById(project, variantId) : (sequence ? getDefaultVariant(project, sequence.id) : getDefaultVariant(project));

  if (!variant) {
    return 0;
  }

  const musicDurationMs = variant.musicAlignment?.primaryAssetId
    ? project.assets.find((asset) => asset.id === variant.musicAlignment?.primaryAssetId)?.durationMs
    : undefined;

  return typeof musicDurationMs === 'number' && musicDurationMs > 0
    ? musicDurationMs
    : variant.clips.some((clip) => clip.transition === 'mask')
      ? resolveRenderedVariantDurationMs(project, variant)
      : Math.max(0, ...variant.clips.map((clip) => clip.timelineStartMs + clip.durationMs));
}

function createProgressRunner(
  command: CommandSpec,
  options: {
    phaseLabel: string;
    report: (message: string, progress: number) => void;
    durationMs: number;
    startProgress: number;
    endProgress: number;
  }
): CommandRunner {
  return async (binary: string, args: string[], runnerOptions: CommandRunnerOptions): Promise<CommandExecutionResult> => {
    if (runnerOptions.signal?.aborted) {
      throw new DOMException('Command aborted before start.', 'AbortError');
    }

    return await new Promise((resolve, reject) => {
      const child = spawn(binary, args, {
        cwd: runnerOptions.cwd,
        env: runnerOptions.env,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let stderrWindow = '';
      let lastReportedProgress = options.startProgress;
      let lastReportedAt = 0;

      const maybeReportProgress = () => {
        if (options.durationMs <= 0) {
          return;
        }

        const matches = [...stderrWindow.matchAll(/time=(\d+:\d+:\d+(?:\.\d+)?)/g)];
        const latest = matches.at(-1)?.[1];
        if (!latest) {
          return;
        }

        const encodedMs = parseFfmpegTimeToMs(latest);
        if (encodedMs === undefined) {
          return;
        }

        const ratio = clampProgress(encodedMs / options.durationMs);
        const nextProgress = clampProgress(options.startProgress + ((options.endProgress - options.startProgress) * ratio));
        const now = Date.now();

        if ((nextProgress - lastReportedProgress) < 0.01 && (now - lastReportedAt) < 250) {
          return;
        }

        lastReportedProgress = nextProgress;
        lastReportedAt = now;
        options.report(`${options.phaseLabel} ${Math.round(nextProgress * 100)}%`, nextProgress);
      };

      const abortHandler = () => {
        child.kill('SIGTERM');
        reject(new DOMException(`Command "${command.label}" aborted.`, 'AbortError'));
      };

      runnerOptions.signal?.addEventListener('abort', abortHandler, { once: true });

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
        stderrWindow = `${stderrWindow}${text}`.slice(-4096);
        maybeReportProgress();
      });

      child.on('error', (error) => {
        runnerOptions.signal?.removeEventListener('abort', abortHandler);
        reject(error);
      });

      child.on('close', (exitCode) => {
        runnerOptions.signal?.removeEventListener('abort', abortHandler);
        resolve({
          exitCode: exitCode ?? 1,
          stdout,
          stderr
        });
      });
    });
  };
}

export function createJobManager({ logger, onJobsChanged }: JobManagerOptions) {
  let jobs: JobWithRetry[] = [];
  const running = new Map<string, AbortController>();
  const queue: JobTask[] = [];
  const limits: Record<QueueClass, number> = {
    analysis: 1,
    heavy: 1
  };
  const activeCounts: Record<QueueClass, number> = {
    analysis: 0,
    heavy: 0
  };

  function snapshot(): DesktopJob[] {
    return jobs
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ retryPayload: _retryPayload, ...job }) => job);
  }

  function updateJob(jobId: string, patch: Partial<JobWithRetry>): void {
    jobs = jobs.map((job) => job.id === jobId ? { ...job, ...patch } : job);
    onJobsChanged(snapshot());
  }

  function enqueue(input: {
    type: DesktopJob['type'];
    target: string;
    queueClass: QueueClass;
    retryPayload?: RetryPayload;
    run: JobTask['run'];
  }): DesktopJob {
    const job: JobWithRetry = {
      id: `job-${input.type}-${jobs.length + 1}`,
      type: input.type,
      target: input.target,
      status: 'queued',
      log: [],
      retryPayload: input.retryPayload
    };
    jobs = [...jobs, job];
    queue.push({
      jobId: job.id,
      queueClass: input.queueClass,
      run: input.run,
      retryPayload: input.retryPayload
    });
    onJobsChanged(snapshot());
    pump();
    const { retryPayload: _retryPayload, ...publicJob } = job;
    return publicJob;
  }

  function pump(): void {
    for (const queueClass of ['analysis', 'heavy'] as QueueClass[]) {
      while (activeCounts[queueClass] < limits[queueClass]) {
        const index = queue.findIndex((task) => task.queueClass === queueClass);
        if (index < 0) {
          break;
        }

        const [task] = queue.splice(index, 1);
        activeCounts[queueClass] += 1;
        void startTask(task);
      }
    }
  }

  async function startTask(task: JobTask): Promise<void> {
    const controller = new AbortController();
    running.set(task.jobId, controller);
    updateJob(task.jobId, {
      status: 'running',
      startedAt: new Date().toISOString()
    });

    try {
      const result = await task.run(controller.signal, (message, progress) => {
        updateJob(task.jobId, {
          log: [...(jobs.find((job) => job.id === task.jobId)?.log ?? []), message].slice(-12),
          progress
        });
      });
      updateJob(task.jobId, {
        status: 'completed',
        endedAt: new Date().toISOString(),
        progress: 1,
        result
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const aborted = error instanceof Error && error.name === 'AbortError';
      updateJob(task.jobId, {
        status: aborted ? 'cancelled' : 'failed',
        endedAt: new Date().toISOString(),
        error: message,
        log: [...(jobs.find((job) => job.id === task.jobId)?.log ?? []), message].slice(-12)
      });
      await logger.log('error', `Job ${task.jobId} failed.`, message);
    } finally {
      running.delete(task.jobId);
      activeCounts[task.queueClass] -= 1;
      pump();
    }
  }

  async function runAnalysis(input: RunAnalysisRequest): Promise<DesktopJob[]> {
    const existingAnalysisJob = jobs.find((job) =>
      job.type === 'analysis' && (job.status === 'queued' || job.status === 'running')
    );

    if (existingAnalysisJob) {
      await logger.log('warn', 'Skipped duplicate analysis request.', existingAnalysisJob.id);
      const { retryPayload: _retryPayload, ...publicJob } = existingAnalysisJob;
      return [publicJob];
    }

    const tools = resolveFfmpegTools();
    const queuedJob = enqueue({
      type: 'analysis',
      target: input.assetIds.join(','),
      queueClass: 'analysis',
      retryPayload: { kind: 'analysis', ...input },
      run: async (signal, report) => {
        await ensureArtifactDirs(input.projectRoot);
        let nextProject = parseProject(input.project);

        for (const assetId of input.assetIds) {
          report(`Analyzing ${assetId}`, 0.1);
          const probeOutputPath = join(input.projectRoot, '.afterimage', 'analysis', `${assetId}.ffprobe.json`);
          const analysisLogPath = join(input.projectRoot, '.afterimage', 'analysis', `${assetId}.scene.log`);
          const analysisSidecarPath = join(input.projectRoot, '.afterimage', 'analysis', `${assetId}.analysis.json`);
          const astatsLogPath = join(input.projectRoot, '.afterimage', 'analysis', `${assetId}.astats.log`);
          const aspectralstatsLogPath = join(input.projectRoot, '.afterimage', 'analysis', `${assetId}.aspectralstats.log`);
          const ebur128LogPath = join(input.projectRoot, '.afterimage', 'analysis', `${assetId}.ebur128.log`);
          const silencedetectLogPath = join(input.projectRoot, '.afterimage', 'analysis', `${assetId}.silencedetect.log`);
          const thumbnailPattern = join(input.projectRoot, '.afterimage', 'thumbnails', `${assetId}-%03d.jpg`);
          const thumbnailManifestPath = join(input.projectRoot, '.afterimage', 'analysis', `${assetId}.thumbnails.json`);
          const waveformPath = join(input.projectRoot, '.afterimage', 'waveforms', `${assetId}.png`);
          const asset = nextProject.assets.find((candidate) => candidate.id === assetId);

          if (!asset) {
            throw new Error(`Missing asset "${assetId}" while analyzing project.`);
          }

          const probeResult = await executeCommandSpec({
            label: `probe:${assetId}`,
            binary: tools.ffprobe.path,
            args: [
              '-v', 'error',
              '-print_format', 'json',
              '-show_format',
              '-show_streams',
              asset.path.absolutePath
            ],
            expectedOutputs: [probeOutputPath]
          }, { signal });
          await writeFile(probeOutputPath, probeResult.stdout, 'utf8');

          const probe = parseFfprobeOutput(probeResult.stdout);
          let waveform: { durationMs: number; peaks: number[] } | undefined;
          const isAudioAnalysis = asset.mediaType === 'audio' || asset.tags?.includes('music');
          let analysisFile;

          if (isAudioAnalysis) {
            const audioChangePlan = buildAudioChangeAnalysisPlan(nextProject, {
              assetId,
              astatsOutputPath: astatsLogPath,
              aspectralstatsOutputPath: aspectralstatsLogPath,
              ebur128OutputPath: ebur128LogPath,
              silencedetectOutputPath: silencedetectLogPath
            }, tools);
            const waveformPlan = buildWaveformPlan(nextProject, {
              assetId,
              outputPath: waveformPath
            }, tools);
            const [astatsResult, aspectralstatsResult, ebur128Result, silencedetectResult] = await Promise.all(
              audioChangePlan.commands.map((command) => executeCommandSpec(command, { signal }))
            );
            const astatsLog = [astatsResult.stdout, astatsResult.stderr].filter(Boolean).join('\n');
            const aspectralstatsLog = [aspectralstatsResult.stdout, aspectralstatsResult.stderr].filter(Boolean).join('\n');
            const ebur128Log = [ebur128Result.stdout, ebur128Result.stderr].filter(Boolean).join('\n');
            const silencedetectLog = [silencedetectResult.stdout, silencedetectResult.stderr].filter(Boolean).join('\n');
            await writeFile(astatsLogPath, astatsLog, 'utf8');
            await writeFile(aspectralstatsLogPath, aspectralstatsLog, 'utf8');
            await writeFile(ebur128LogPath, ebur128Log, 'utf8');
            await writeFile(silencedetectLogPath, silencedetectLog, 'utf8');
            await executeCommandSpec(waveformPlan.command, { signal });
            waveform = {
              durationMs: probe.durationMs,
              peaks: [0.18, 0.32, 0.55, 0.74, 0.61, 0.48]
            };

            const audioChangeAnalysis = parseAudioChangeAnalysis(assetId, {
              astats: astatsLog,
              aspectralstats: aspectralstatsLog,
              ebur128: ebur128Log,
              silencedetect: silencedetectLog
            });

            analysisFile = createAnalysisFile(`analysis-${assetId}`, assetId, probe, [], {
              waveform,
              audioChangeTrack: audioChangeAnalysis.audioChangeTrack,
              syncEventTrack: audioChangeAnalysis.syncEventTrack
            });
          } else {
            const analysisPlan = buildAnalysisPlan(nextProject, {
              assetId,
              probeOutputPath,
              analysisOutputPath: analysisLogPath
            }, tools);
            const thumbnailPlan = buildThumbnailPlan(nextProject, {
              assetId,
              outputPattern: thumbnailPattern,
              manifestOutputPath: thumbnailManifestPath
            }, tools);
            const sceneResult = await executeCommandSpec(analysisPlan.commands[1], { signal });
            const sceneLog = [sceneResult.stdout, sceneResult.stderr].filter(Boolean).join('\n');
            await writeFile(analysisLogPath, sceneLog, 'utf8');
            const scene = parseSceneDetectionOutput(sceneLog);
            await executeCommandSpec(thumbnailPlan.command, { signal });
            analysisFile = createAnalysisFile(`analysis-${assetId}`, assetId, probe, scene.sceneCuts, {
              thumbnails: scene.sceneCuts.map((cut, index) => ({
                id: `${assetId}-thumbnail-${index + 1}`,
                timeMs: cut.timeMs,
                path: join(input.projectRoot, '.afterimage', 'thumbnails', `${assetId}-${String(index + 1).padStart(3, '0')}.jpg`)
              })),
              waveform
            });
          }

          await writeFile(analysisSidecarPath, `${JSON.stringify(analysisFile, null, 2)}\n`, 'utf8');
          await writeFile(thumbnailManifestPath, `${JSON.stringify(analysisFile.thumbnails ?? [], null, 2)}\n`, 'utf8');

          const generatedCuts = analysisFile.sceneCuts.length > 0
            ? generateCutCandidatesFromAnalysis(analysisFile, {
              analysisRefId: `analysis-${assetId}`
            })
            : [];

          nextProject = parseProject({
            ...nextProject,
            assets: nextProject.assets.map((candidate) => candidate.id === assetId ? {
              ...candidate,
              durationMs: probe.durationMs,
              hasAudio: probe.streams.some((stream) => stream.codecType === 'audio') || candidate.hasAudio,
              analysisStatus: 'completed'
            } : candidate),
            analysisRefs: [
              ...nextProject.analysisRefs.filter((ref) => ref.assetId !== assetId),
              {
                id: `analysis-${assetId}`,
                assetId,
                path: analysisSidecarPath,
                thumbnailManifestPath,
                waveformPath: waveform ? waveformPath : undefined,
                summary: analysisFile.summary
              }
            ],
            cutCandidates: [
              ...nextProject.cutCandidates.filter((cut) => cut.assetId !== assetId),
              ...generatedCuts
            ],
            variants: nextProject.variants.map((variant) => {
              const shouldAttachMusicAnalysis = variant.musicAlignment?.primaryAssetId === assetId
                || (!variant.musicAlignment?.primaryAssetId && isAudioAnalysis && variant.id === nextProject.sequences[0]?.defaultVariantId);

              if (!shouldAttachMusicAnalysis) {
                return variant;
              }

              return {
                ...variant,
                musicAlignment: {
                  primaryAssetId: variant.musicAlignment?.primaryAssetId ?? assetId,
                  analysisRefId: `analysis-${assetId}`,
                  syncMode: variant.musicAlignment?.syncMode ?? 'texture',
                  beatMarkers: variant.musicAlignment?.beatMarkers ?? [],
                  chapterPoints: variant.musicAlignment?.chapterPoints ?? [],
                  snapToBeatGrid: variant.musicAlignment?.snapToBeatGrid ?? true
                }
              };
            })
          });
          report(`Finished ${assetId}`, 0.8);
        }

        await logger.log('info', 'Completed analysis workflow.', input.assetIds.join(','));
        return {
          kind: 'analysis',
          project: nextProject
        };
      }
    });

    return [queuedJob];
  }

  function runPreview(input: RunPreviewRequest): DesktopJob {
    const tools = resolveFfmpegTools();
    return enqueue({
      type: 'preview',
      target: input.outputPath,
      queueClass: 'heavy',
      retryPayload: { kind: 'preview', ...input },
      run: async (signal, report) => {
        await ensureArtifactDirs(input.projectRoot);
        const tempOutputPath = `${input.outputPath}.rendering-${Date.now()}.mp4`;
        const durationMs = resolveTargetRenderDurationMs(input.project, input.variantId, input.sequenceId);
        const plan = buildPreviewPlan(input.project, {
          outputPath: tempOutputPath,
          sequenceId: input.sequenceId,
          variantId: input.variantId
        }, tools);
        report('Rendering preview cache', 0.02);
        try {
          await executeCommandSpec(plan.command, {
            signal,
            runner: createProgressRunner(plan.command, {
              phaseLabel: 'Rendering preview cache',
              report,
              durationMs,
              startProgress: 0.02,
              endProgress: 0.98
            })
          });
          await rm(input.outputPath, { force: true });
          await rename(tempOutputPath, input.outputPath);
        } catch (error) {
          await rm(tempOutputPath, { force: true }).catch(() => undefined);
          throw error;
        }
        await logger.log('info', 'Rendered preview cache.', input.outputPath);
        return {
          kind: 'preview',
          outputPath: input.outputPath
        };
      }
    });
  }

  function runExport(input: RunExportRequest): DesktopJob[] {
    const tools = resolveFfmpegTools();
    return input.profileIds.map((profileId) => enqueue({
      type: 'export',
      target: profileId,
      queueClass: 'heavy',
      retryPayload: {
        kind: 'export',
        ...input,
        profileIds: [profileId]
      },
      run: async (signal, report) => {
        await ensureArtifactDirs(input.projectRoot);
        const profile = getExportProfileById(profileId);
        const sequence = input.sequenceId
          ? getSequenceById(input.project, input.sequenceId)
          : getDefaultSequence(input.project);
        const variant = input.variantId
          ? getVariantById(input.project, input.variantId)
          : getDefaultVariant(input.project);

        if (!sequence || !variant) {
          throw new Error('Cannot resolve export timeline.');
        }

        const baseOutputPath = `${input.outputPath}-${profile.id}.${profile.container}`;
        const outputPath = await resolveAvailableOutputPath(baseOutputPath);
        const durationMs = resolveTargetRenderDurationMs(input.project, variant.id, sequence.id);
        const plan = buildExportPlan(input.project, {
          outputPath,
          profile,
          sequenceId: sequence.id,
          variantId: variant.id
        }, tools);
        report(`Rendering ${profile.name}`, 0.02);
        await executeCommandSpec(plan.command, {
          signal,
          runner: createProgressRunner(plan.command, {
            phaseLabel: `Rendering ${profile.name}`,
            report,
            durationMs,
            startProgress: 0.02,
            endProgress: 0.98
          })
        });
        await logger.log('info', 'Rendered export profile.', outputPath);
        return {
          kind: 'export',
          outputPath: plan.outputPath
        };
      }
    }));
  }

  async function cancel(jobId: string): Promise<boolean> {
    const controller = running.get(jobId);
    if (!controller) {
      return false;
    }
    controller.abort();
    return true;
  }

  async function retry(jobId: string): Promise<DesktopJob | null> {
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (!job?.retryPayload) {
      return null;
    }

    if (job.retryPayload.kind === 'analysis') {
      const [retried] = await runAnalysis(job.retryPayload);
      return retried;
    }
    if (job.retryPayload.kind === 'preview') {
      return runPreview(job.retryPayload);
    }
    if (job.retryPayload.kind === 'export') {
      const [retried] = runExport(job.retryPayload);
      return retried ?? null;
    }

    return null;
  }

  return {
    list(): DesktopJob[] {
      return snapshot();
    },
    runAnalysis,
    runPreview: async (input: RunPreviewRequest) => runPreview(input),
    runExport: async (input: RunExportRequest) => runExport(input),
    cancel,
    retry
  };
}
