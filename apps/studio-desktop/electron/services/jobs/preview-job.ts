import { rename, rm } from 'node:fs/promises';
import {
  buildPreviewPlan,
  executeCommandSpec,
  getTargetRenderDurationMs,
  resolveFfmpegTools
} from '@afterimage/ffmpeg-compiler';
import {
  getDefaultSequence,
  getDefaultVariant,
  getSequenceById,
  getVariantById,
  type NormalizedProjectFile
} from '@afterimage/project-model';
import type { DesktopJob, RunPreviewRequest } from '@afterimage/studio-contracts';
import type { Logger } from '../logger.js';
import { ensureArtifactDirs } from './artifacts.js';
import { createProgressRunner } from './progress.js';
import type { EnqueueJob } from './types.js';

function resolveTargetRenderDurationMs(project: NormalizedProjectFile, variantId?: string, sequenceId?: string): number {
  const sequence = sequenceId ? getSequenceById(project, sequenceId) : getDefaultSequence(project);
  const variant = variantId ? getVariantById(project, variantId) : (sequence ? getDefaultVariant(project, sequence.id) : getDefaultVariant(project));

  if (!variant) {
    return 0;
  }

  return getTargetRenderDurationMs(project, variant);
}

export function createPreviewJobs({ logger, enqueue }: { logger: Logger; enqueue: EnqueueJob }) {
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

  return { runPreview };
}
