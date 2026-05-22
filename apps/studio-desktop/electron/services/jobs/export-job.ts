import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getExportProfileById } from '@afterimage/export-profiles';
import {
  buildConcatList,
  buildExportRenderGraphPlan,
  buildFinalizeRenderPlan,
  buildRenderGraphPlan,
  executeCommandSpec,
  getTargetRenderDurationMs,
  resolveFfmpegTools,
  shouldUseChunkedExport as shouldUseCompilerChunkedExport,
  type RenderGraphArtifact,
  type RenderProfile
} from '@afterimage/ffmpeg-compiler';
import {
  getDefaultSequence,
  getDefaultVariant,
  normalizeProject,
  getSequenceById,
  getVariantById,
  type SequenceClip,
  type Variant
} from '@afterimage/project-model';
import type { DesktopJob, ExportRenderAgentInput, RunExportRequest } from '@afterimage/studio-contracts';
import type { Logger } from '../logger.js';
import { ensureArtifactDirs, resolveAvailableOutputPath } from './artifacts.js';
import { createProgressRunner } from './progress.js';
import { toStudioRenderArtifact } from './render-artifacts.js';
import type { EnqueueJob } from './types.js';

function resolveClipOutgoingTransitionMs(clip: SequenceClip, nextClip: SequenceClip | undefined): number {
  if (clip.transition !== 'mask' || !nextClip) {
    return 0;
  }

  return Math.max(0, Math.min(clip.transitionDurationMs ?? 250, clip.durationMs, nextClip.durationMs));
}

function shouldUseChunkedExportForVariant(project: RunExportRequest['project'], variant: Variant, profile: RenderProfile): boolean {
  return shouldUseCompilerChunkedExport(project, variant, profile);
}

function estimateChunkClipContributionMs(clips: SequenceClip[], index: number): number {
  const clip = clips[index];
  const nextClip = clips[index + 1];
  return Math.max(0, clip.durationMs - resolveClipOutgoingTransitionMs(clip, nextClip));
}

function estimateChunkClipSegmentCount(clips: SequenceClip[], index: number): number {
  return resolveClipOutgoingTransitionMs(clips[index], clips[index + 1]) > 0 ? 2 : 1;
}

function splitClipIndicesForChunkedExport(variant: Variant, options: { maxDurationMs: number; maxSegments: number }): Array<{ start: number; end: number }> {
  const chunks: Array<{ start: number; end: number }> = [];
  let start = 0;

  while (start < variant.clips.length) {
    let end = start;
    let durationMs = 0;
    let segmentCount = 0;

    while (end < variant.clips.length) {
      const nextDurationMs = durationMs + estimateChunkClipContributionMs(variant.clips, end);
      const nextSegmentCount = segmentCount + estimateChunkClipSegmentCount(variant.clips, end);
      const wouldOverflow = end > start && (nextDurationMs > options.maxDurationMs || nextSegmentCount > options.maxSegments);

      if (wouldOverflow) {
        break;
      }

      durationMs = nextDurationMs;
      segmentCount = nextSegmentCount;
      end += 1;
    }

    chunks.push({ start, end: Math.max(start, end - 1) });
    start = Math.max(start + 1, end);
  }

  return chunks;
}

function buildChunkedVariant(variant: Variant, chunkIndex: number, chunkStart: number, chunkEnd: number): Variant {
  const sourceClips = variant.clips.slice(chunkStart, chunkEnd + 1).map((clip) => ({ ...clip, tags: clip.tags ? [...clip.tags] : undefined }));
  const lastClip = sourceClips[sourceClips.length - 1];
  const originalLastClip = variant.clips[chunkEnd];
  const nextClip = variant.clips[chunkEnd + 1];
  const outgoingTransitionMs = originalLastClip ? resolveClipOutgoingTransitionMs(originalLastClip, nextClip) : 0;

  if (lastClip && outgoingTransitionMs > 0) {
    lastClip.durationMs = Math.max(250, lastClip.durationMs - outgoingTransitionMs);
    lastClip.transition = 'cut';
    lastClip.transitionDurationMs = undefined;
    lastClip.transitionAssetId = undefined;
    lastClip.transitionOverlayAssetId = undefined;
  }

  let timelineStartMs = 0;
  const clips = sourceClips.map((clip) => {
    const nextClipForChunk = {
      ...clip,
      timelineStartMs
    };
    timelineStartMs += clip.durationMs;
    return nextClipForChunk;
  });

  return {
    ...variant,
    name: `${variant.name} Chunk ${chunkIndex + 1}`,
    clips,
    markers: [],
    sections: [],
    musicAlignment: undefined
  };
}

export function createExportJobs({ logger, enqueue }: { logger: Logger; enqueue: EnqueueJob }) {
  function runExport(input: RunExportRequest): DesktopJob[] {
    const tools = resolveFfmpegTools();
    return input.profileIds.map((profileId) => {
      const agentInput: ExportRenderAgentInput = {
        project: input.project,
        projectRoot: input.projectRoot,
        outputPath: input.outputPath,
        sequenceId: input.sequenceId,
        variantId: input.variantId,
        profileId
      };

      return enqueue({
        type: 'export',
        target: agentInput.profileId,
        queueClass: 'heavy',
        retryPayload: {
          kind: 'export',
          ...input,
          profileIds: [agentInput.profileId]
        },
        run: async (signal, report) => {
          await ensureArtifactDirs(agentInput.projectRoot);
          const profile = getExportProfileById(agentInput.profileId);
          const sequence = agentInput.sequenceId
            ? getSequenceById(agentInput.project, agentInput.sequenceId)
            : getDefaultSequence(agentInput.project);
          const variant = agentInput.variantId
            ? getVariantById(agentInput.project, agentInput.variantId)
            : getDefaultVariant(agentInput.project);

          if (!sequence || !variant) {
            throw new Error('Cannot resolve export timeline.');
          }

          const baseOutputPath = `${agentInput.outputPath}-${profile.id}.${profile.container}`;
          const outputPath = await resolveAvailableOutputPath(baseOutputPath);
          const durationMs = getTargetRenderDurationMs(agentInput.project, variant);
          const shouldChunk = shouldUseChunkedExportForVariant(agentInput.project, variant, profile);
          const artifacts: RenderGraphArtifact[] = [];

          if (!shouldChunk) {
            const plan = buildExportRenderGraphPlan(agentInput.project, {
              outputPath,
              profile,
              sequenceId: sequence.id,
              variantId: variant.id
            }, tools);
            const pass = plan.passes[0];
            report(`Rendering ${profile.name}`, 0.02);
            await executeCommandSpec(pass.command, {
              signal,
              runner: createProgressRunner(pass.command, {
                phaseLabel: `Rendering ${profile.name}`,
                report,
                durationMs,
                startProgress: 0.02,
                endProgress: 0.98
              })
            });
            artifacts.push(...plan.artifacts);
          } else {
            const chunkRanges = splitClipIndicesForChunkedExport(variant, {
              maxDurationMs: 90_000,
              maxSegments: 36
            });
            const tempRoot = join(agentInput.projectRoot, '.afterimage', 'exports-temp', `${variant.id}-${profile.id}-${Date.now()}`);
            await mkdir(tempRoot, { recursive: true });

            const chunkOutputPaths: string[] = [];

            try {
              for (const [chunkIndex, chunkRange] of chunkRanges.entries()) {
                const chunkVariant = buildChunkedVariant(variant, chunkIndex, chunkRange.start, chunkRange.end);
                const chunkProject = normalizeProject({
                  ...agentInput.project,
                  assets: agentInput.project.assets.map((asset) => ({
                    ...asset,
                    hasAudio: asset.assetRole === 'music' ? asset.hasAudio : false
                  })),
                  variants: agentInput.project.variants.map((candidate) => candidate.id === variant.id ? chunkVariant : candidate)
                });
                const chunkOutputPath = join(tempRoot, `chunk-${String(chunkIndex + 1).padStart(3, '0')}.${profile.container}`);
                const chunkDurationMs = getTargetRenderDurationMs(chunkProject, chunkVariant);
                const chunkPlan = buildRenderGraphPlan(chunkProject, {
                  outputPath: chunkOutputPath,
                  profile,
                  sequenceId: sequence.id,
                  variantId: chunkVariant.id
                }, profile, 'render', tools);
                const chunkPass = chunkPlan.passes[0];

                report(`Rendering ${profile.name} chunk ${chunkIndex + 1}/${chunkRanges.length}`, 0.02 + ((chunkIndex / chunkRanges.length) * 0.8));
                await executeCommandSpec(chunkPass.command, {
                  signal,
                  runner: createProgressRunner(chunkPass.command, {
                    phaseLabel: `Rendering ${profile.name} chunk ${chunkIndex + 1}/${chunkRanges.length}`,
                    report,
                    durationMs: chunkDurationMs,
                    startProgress: 0.02 + ((chunkIndex / chunkRanges.length) * 0.8),
                    endProgress: 0.02 + (((chunkIndex + 1) / chunkRanges.length) * 0.8)
                  })
                });
                chunkOutputPaths.push(chunkOutputPath);
                artifacts.push(...chunkPlan.artifacts);
              }

              const concatListPath = join(tempRoot, 'chunks.ffconcat');
              await writeFile(concatListPath, buildConcatList(chunkOutputPaths), 'utf8');
              const musicPath = variant.musicAlignment?.primaryAssetId
                ? agentInput.project.assets.find((asset) => asset.id === variant.musicAlignment?.primaryAssetId)?.path.absolutePath
                : undefined;
              const finalizePlan = buildFinalizeRenderPlan({
                concatListPath,
                outputPath,
                profile,
                durationMs,
                musicPath,
                inputArtifacts: artifacts
              }, tools);

              report(`Finalizing ${profile.name}`, 0.84);
              await executeCommandSpec(finalizePlan.command, {
                signal,
                runner: createProgressRunner(finalizePlan.command, {
                  phaseLabel: `Finalizing ${profile.name}`,
                  report,
                  durationMs,
                  startProgress: 0.84,
                  endProgress: 0.98
                })
              });
              artifacts.push(finalizePlan.artifact);
            } finally {
              await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
            }
          }

          await logger.log('info', 'Rendered export profile.', outputPath);
          return {
            kind: 'export',
            outputPath,
            artifacts: artifacts.map(toStudioRenderArtifact)
          };
        }
      });
    });
  }

  return { runExport };
}
