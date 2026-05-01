import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildAnalysisPlan,
  buildAudioChangeAnalysisPlan,
  buildThumbnailPlan,
  buildWaveformPlan,
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
import type { AnalysisAgentInput, DesktopJob, RunAnalysisRequest } from '@afterimage/studio-contracts';
import type { Logger } from '../logger.js';
import { clampProgress, ensureArtifactDirs } from './artifacts.js';
import type { EnqueueJob } from './types.js';

interface AnalysisJobsOptions {
  logger: Logger;
  enqueue: EnqueueJob;
  findActiveAnalysisJob(): DesktopJob | undefined;
}

export function createAnalysisJobs({ logger, enqueue, findActiveAnalysisJob }: AnalysisJobsOptions) {
  async function runAnalysis(input: RunAnalysisRequest): Promise<DesktopJob[]> {
    const agentInput: AnalysisAgentInput = input;
    const existingAnalysisJob = findActiveAnalysisJob();

    if (existingAnalysisJob) {
      await logger.log('warn', 'Skipped duplicate analysis request.', existingAnalysisJob.id);
      return [existingAnalysisJob];
    }

    const tools = resolveFfmpegTools();
    const queuedJob = enqueue({
      type: 'analysis',
      target: input.assetIds.join(','),
      queueClass: 'analysis',
      retryPayload: { kind: 'analysis', ...input },
      run: async (signal, report) => {
        await ensureArtifactDirs(agentInput.projectRoot);
        let nextProject = parseProject(agentInput.project);
        const assetCount = Math.max(1, agentInput.assetIds.length);

        for (const [assetIndex, assetId] of agentInput.assetIds.entries()) {
          const reportAssetProgress = (phaseProgress: number) => {
            report(`Analyzing ${assetIndex + 1}/${assetCount}`, (assetIndex + clampProgress(phaseProgress)) / assetCount);
          };

          reportAssetProgress(0.02);
          const probeOutputPath = join(agentInput.projectRoot, '.afterimage', 'analysis', `${assetId}.ffprobe.json`);
          const analysisLogPath = join(agentInput.projectRoot, '.afterimage', 'analysis', `${assetId}.scene.log`);
          const analysisSidecarPath = join(agentInput.projectRoot, '.afterimage', 'analysis', `${assetId}.analysis.json`);
          const astatsLogPath = join(agentInput.projectRoot, '.afterimage', 'analysis', `${assetId}.astats.log`);
          const aspectralstatsLogPath = join(agentInput.projectRoot, '.afterimage', 'analysis', `${assetId}.aspectralstats.log`);
          const ebur128LogPath = join(agentInput.projectRoot, '.afterimage', 'analysis', `${assetId}.ebur128.log`);
          const silencedetectLogPath = join(agentInput.projectRoot, '.afterimage', 'analysis', `${assetId}.silencedetect.log`);
          const thumbnailPattern = join(agentInput.projectRoot, '.afterimage', 'thumbnails', `${assetId}-%03d.jpg`);
          const thumbnailManifestPath = join(agentInput.projectRoot, '.afterimage', 'analysis', `${assetId}.thumbnails.json`);
          const waveformPath = join(agentInput.projectRoot, '.afterimage', 'waveforms', `${assetId}.png`);
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
          reportAssetProgress(0.18);

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
            reportAssetProgress(0.58);
            const astatsLog = [astatsResult.stdout, astatsResult.stderr].filter(Boolean).join('\n');
            const aspectralstatsLog = [aspectralstatsResult.stdout, aspectralstatsResult.stderr].filter(Boolean).join('\n');
            const ebur128Log = [ebur128Result.stdout, ebur128Result.stderr].filter(Boolean).join('\n');
            const silencedetectLog = [silencedetectResult.stdout, silencedetectResult.stderr].filter(Boolean).join('\n');
            await writeFile(astatsLogPath, astatsLog, 'utf8');
            await writeFile(aspectralstatsLogPath, aspectralstatsLog, 'utf8');
            await writeFile(ebur128LogPath, ebur128Log, 'utf8');
            await writeFile(silencedetectLogPath, silencedetectLog, 'utf8');
            await executeCommandSpec(waveformPlan.command, { signal });
            reportAssetProgress(0.78);
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
            reportAssetProgress(0.62);
            await executeCommandSpec(thumbnailPlan.command, { signal });
            reportAssetProgress(0.78);
            analysisFile = createAnalysisFile(`analysis-${assetId}`, assetId, probe, scene.sceneCuts, {
              thumbnails: scene.sceneCuts.map((cut, index) => ({
                id: `${assetId}-thumbnail-${index + 1}`,
                timeMs: cut.timeMs,
                path: join(agentInput.projectRoot, '.afterimage', 'thumbnails', `${assetId}-${String(index + 1).padStart(3, '0')}.jpg`)
              })),
              waveform
            });
          }

          await writeFile(analysisSidecarPath, `${JSON.stringify(analysisFile, null, 2)}\n`, 'utf8');
          await writeFile(thumbnailManifestPath, `${JSON.stringify(analysisFile.thumbnails ?? [], null, 2)}\n`, 'utf8');
          reportAssetProgress(0.9);

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
          reportAssetProgress(0.98);
        }

        await logger.log('info', 'Completed analysis workflow.', agentInput.assetIds.join(','));
        return {
          kind: 'analysis',
          project: nextProject
        };
      }
    });

    return [queuedJob];
  }

  return { runAnalysis };
}
