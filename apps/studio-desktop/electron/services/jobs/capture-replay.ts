import { resolveCaptureReplayRenderState } from '@afterimage/domain-operations';
import type { CaptureReplayRenderContext, CaptureReplayRenderGraphPlanResult, RenderGraphPlan } from '@afterimage/ffmpeg-compiler';
import type { PreviewRenderAgentInput } from '@afterimage/studio-contracts';

export function hasCaptureReplaySelector(input: PreviewRenderAgentInput): boolean {
  return input.captureSessionId !== undefined || input.captureLogId !== undefined;
}

export function resolveStudioCaptureReplayContext(input: PreviewRenderAgentInput): CaptureReplayRenderContext {
  const result = resolveCaptureReplayRenderState({
    project: input.project,
    captureSessionId: input.captureSessionId,
    captureLogId: input.captureLogId,
    sequenceId: input.sequenceId,
    variantId: input.variantId,
    availableArchiveIds: input.availableArchiveIds
  });

  if (!result.ok) {
    throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join('\n') || 'Unable to resolve capture replay render state.');
  }

  return {
    identity: {
      projectId: result.renderState.projectId,
      compositionId: result.renderState.compositionId,
      sequenceId: result.renderState.sequenceId,
      variantId: result.renderState.variantId,
      captureSessionId: result.renderState.captureSessionId,
      captureLogId: result.renderState.captureLogId,
      replayEventIds: result.renderState.replayEventIds
    },
    filterOverrides: result.renderState.filterOverrides,
    skippedEvents: result.renderState.skippedEvents,
    diagnostics: result.diagnostics.map((diagnostic) => ({
      path: diagnostic.path,
      code: diagnostic.code,
      message: diagnostic.message
    }))
  };
}

export function requireCaptureReplayPlan(result: CaptureReplayRenderGraphPlanResult): RenderGraphPlan {
  if (result.ok) {
    return result.plan;
  }

  throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join('\n') || 'Unable to plan capture replay render.');
}
