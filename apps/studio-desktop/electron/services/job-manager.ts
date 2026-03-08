import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getExportProfileById } from '@afterimage/export-profiles';
import type { NormalizedProjectFile } from '@afterimage/project-model';
import {
  buildAnalysisPlan,
  buildExportPlan,
  buildPreviewPlan,
  buildThumbnailPlan,
  buildWaveformPlan,
  executeCommandSpec,
  resolveFfmpegTools
} from '@afterimage/ffmpeg-compiler';
import { generateCutCandidatesFromAnalysis, parseFfprobeOutput, parseSceneDetectionOutput } from '@afterimage/media-analysis';
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

export function createJobManager({ logger, onJobsChanged }: JobManagerOptions) {
  let jobs: JobWithRetry[] = [];
  const running = new Map<string, AbortController>();
  const queue: JobTask[] = [];
  const limits: Record<QueueClass, number> = {
    analysis: 2,
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
          const thumbnailPattern = join(input.projectRoot, '.afterimage', 'thumbnails', `${assetId}-%03d.jpg`);
          const thumbnailManifestPath = join(input.projectRoot, '.afterimage', 'analysis', `${assetId}.thumbnails.json`);
          const waveformPath = join(input.projectRoot, '.afterimage', 'waveforms', `${assetId}.png`);

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

          const probeResult = await executeCommandSpec(analysisPlan.commands[0], { signal });
          await writeFile(probeOutputPath, probeResult.stdout, 'utf8');
          const sceneResult = await executeCommandSpec(analysisPlan.commands[1], { signal });
          const sceneLog = [sceneResult.stdout, sceneResult.stderr].filter(Boolean).join('\n');
          await writeFile(analysisLogPath, sceneLog, 'utf8');

          const probe = parseFfprobeOutput(probeResult.stdout);
          const scene = parseSceneDetectionOutput(sceneLog);

          let waveform: { durationMs: number; peaks: number[] } | undefined;
          const asset = nextProject.assets.find((candidate) => candidate.id === assetId);
          if (asset?.mediaType === 'audio' || asset?.tags?.includes('music')) {
            const waveformPlan = buildWaveformPlan(nextProject, {
              assetId,
              outputPath: waveformPath
            }, tools);
            await executeCommandSpec(waveformPlan.command, { signal });
            waveform = {
              durationMs: probe.durationMs,
              peaks: [0.18, 0.32, 0.55, 0.74, 0.61, 0.48]
            };
          } else {
            await executeCommandSpec(thumbnailPlan.command, { signal });
          }

          const analysisFile = {
            id: `analysis-${assetId}`,
            assetId,
            probe,
            sceneCuts: scene.sceneCuts,
            thumbnails: scene.sceneCuts.map((cut, index) => ({
              id: `${assetId}-thumbnail-${index + 1}`,
              timeMs: cut.timeMs,
              path: join(input.projectRoot, '.afterimage', 'thumbnails', `${assetId}-${String(index + 1).padStart(3, '0')}.jpg`)
            })),
            waveform,
            summary: {
              ...scene.summary,
              durationMs: probe.durationMs,
              thumbnailCount: scene.sceneCuts.length,
              waveformGenerated: Boolean(waveform)
            }
          };

          await writeFile(analysisSidecarPath, `${JSON.stringify(analysisFile, null, 2)}\n`, 'utf8');
          await writeFile(thumbnailManifestPath, `${JSON.stringify(analysisFile.thumbnails ?? [], null, 2)}\n`, 'utf8');

          const generatedCuts = generateCutCandidatesFromAnalysis(analysisFile, {
            analysisRefId: `analysis-${assetId}`
          });

          nextProject = parseProject({
            ...nextProject,
            assets: nextProject.assets.map((candidate) => candidate.id === assetId ? {
              ...candidate,
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
            ]
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
        const plan = buildPreviewPlan(input.project, {
          outputPath: input.outputPath,
          sequenceId: input.sequenceId,
          variantId: input.variantId
        }, tools);
        report('Rendering preview cache', 0.2);
        await executeCommandSpec(plan.command, { signal });
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
        const plan = buildExportPlan(input.project, {
          outputPath: `${input.outputPath}-${profile.id}.${profile.container}`,
          profile,
          sequenceId: input.sequenceId,
          variantId: input.variantId
        }, tools);
        report(`Rendering ${profile.name}`, 0.25);
        await executeCommandSpec(plan.command, { signal });
        await logger.log('info', 'Rendered export profile.', profile.id);
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
