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
import type { DesktopJob, PreviewRenderAgentInput, RunPreviewRequest } from '@afterimage/studio-contracts';
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
    const agentInput: PreviewRenderAgentInput = input;
    const tools = resolveFfmpegTools();
    return enqueue({
      type: 'preview',
      target: agentInput.outputPath,
      queueClass: 'heavy',
      retryPayload: { kind: 'preview', ...input },
      run: async (signal, report) => {
        await ensureArtifactDirs(agentInput.projectRoot);
        const tempOutputPath = `${agentInput.outputPath}.rendering-${Date.now()}.mp4`;
        const durationMs = resolveTargetRenderDurationMs(agentInput.project, agentInput.variantId, agentInput.sequenceId);
        const plan = buildPreviewPlan(agentInput.project, {
          outputPath: tempOutputPath,
          sequenceId: agentInput.sequenceId,
          variantId: agentInput.variantId
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
          await rm(agentInput.outputPath, { force: true });
          await rename(tempOutputPath, agentInput.outputPath);
        } catch (error) {
          await rm(tempOutputPath, { force: true }).catch(() => undefined);
          throw error;
        }
        await logger.log('info', 'Rendered preview cache.', agentInput.outputPath);
        return {
          kind: 'preview',
          outputPath: agentInput.outputPath
        };
      }
    });
  }

  return { runPreview };
}
