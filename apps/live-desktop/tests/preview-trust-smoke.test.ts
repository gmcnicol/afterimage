import { describe, expect, it } from 'vitest';
import {
  resolveCaptureReplayRenderState,
  resolveCompositionIntent,
  type CaptureReplayRenderState
} from '@afterimage/domain-operations';
import {
  buildCaptureReplayPreviewRenderGraphPlan,
  CAPTURE_REPLAY_UNSUPPORTED_VALUE,
  evaluatePreviewAdapterReadiness,
  FFMPEG_PASS_COMPATIBILITY,
  PREVIEW_ADAPTER_MISSING_DETERMINISTIC_SEED,
  type CaptureReplayDiagnosticSource,
  type CaptureReplayRenderContext,
  type PreviewAdapterCapabilityContext,
  type PreviewBackendIdentity,
  type RenderGraphNodeKind,
  type RenderGraphPlan
} from '@afterimage/ffmpeg-compiler';
import type { NormalizedProjectFile } from '@afterimage/project-model';
import { parseProject } from '@afterimage/schema-validators';
import { fixtureProject } from '../../../packages/test-fixtures/src/index.js';

const FFMPEG_COMMAND_PREVIEW_BACKEND: PreviewBackendIdentity = {
  backend: 'ffmpeg',
  label: 'FFmpeg command preview adapter',
  runtime: 'command'
};

const PREVIEW_OUTPUT_PATH = '.afterimage/preview/variant-main.mp4';

function uniqueSorted(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined))]
    .sort((left, right) => left.localeCompare(right));
}

function collectRequiredSeedIds(project: NormalizedProjectFile): string[] {
  return uniqueSorted([
    ...project.composition.modulationRoutes.map((route) => route.seedId),
    ...project.composition.entropyStates.map((state) => state.seedId),
    ...project.captureSessions.flatMap((session) => session.seedIds),
    ...project.captureLogs.flatMap((log) => log.events.map((event) => event.seedId))
  ]);
}

function resolveCanonicalReplay(project: NormalizedProjectFile): CaptureReplayRenderState {
  const replay = resolveCaptureReplayRenderState({
    project,
    captureSessionId: 'capture-session-main',
    captureLogId: 'capture-log-main'
  });

  expect(replay.ok).toBe(true);
  if (!replay.ok) {
    throw new Error(`Canonical capture replay did not resolve: ${JSON.stringify(replay.diagnostics)}`);
  }

  return replay.renderState;
}

function toCaptureReplayContext(
  renderState: CaptureReplayRenderState,
  patch: Partial<CaptureReplayRenderContext> = {}
): CaptureReplayRenderContext {
  return {
    identity: {
      projectId: renderState.projectId,
      compositionId: renderState.compositionId,
      sequenceId: renderState.sequenceId,
      variantId: renderState.variantId,
      captureSessionId: renderState.captureSessionId,
      captureLogId: renderState.captureLogId,
      replayEventIds: renderState.replayEventIds
    },
    filterOverrides: renderState.filterOverrides,
    skippedEvents: renderState.skippedEvents,
    diagnostics: renderState.skippedEvents,
    ...patch
  };
}

function buildCapturePreviewPlan(project: NormalizedProjectFile, context: CaptureReplayRenderContext): RenderGraphPlan {
  const result = buildCaptureReplayPreviewRenderGraphPlan(project, {
    sequenceId: context.identity.sequenceId,
    variantId: context.identity.variantId,
    outputPath: PREVIEW_OUTPUT_PATH
  }, context);

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Capture replay preview planning failed: ${JSON.stringify(result.diagnostics)}`);
  }

  return result.plan;
}

function makePreviewAdapterContext(
  project: NormalizedProjectFile,
  plan: RenderGraphPlan,
  overrides: Partial<PreviewAdapterCapabilityContext> = {}
): PreviewAdapterCapabilityContext {
  return {
    backend: FFMPEG_COMMAND_PREVIEW_BACKEND,
    supportedNodeKinds: uniqueSorted(plan.nodes.map((node) => node.kind)) as RenderGraphNodeKind[],
    supportedCapabilities: uniqueSorted(plan.backendRequirements.flatMap((requirement) => requirement.capabilities)),
    requiredSeedIds: collectRequiredSeedIds(project),
    availableSeedIds: project.composition.deterministicSeeds.map((seed) => seed.id),
    runtimeDiagnostics: {
      environment: 'vitest',
      renderer: 'ffmpeg-command-preview',
      available: true
    },
    metadata: {
      trustPath: 'canonical-fixture-capture-replay-preview'
    },
    ...overrides
  };
}

describe('@afterimage/live-desktop preview trust smoke', () => {
  const project = parseProject(fixtureProject);

  it('flows the canonical fixture from Studio composition and capture state into supported preview readiness', () => {
    const composition = resolveCompositionIntent({ project });

    expect(composition.ok).toBe(true);
    if (!composition.ok) {
      throw new Error(`Canonical composition did not resolve: ${JSON.stringify(composition.diagnostics)}`);
    }
    expect(composition.intent.composition.id).toBe('composition-main');
    expect(composition.intent.sequence.id).toBe('sequence-main');
    expect(composition.intent.variant.id).toBe('variant-main');

    const renderState = resolveCanonicalReplay(project);

    expect(renderState).toEqual(expect.objectContaining({
      projectId: 'project-core-engine-fixture',
      compositionId: 'composition-main',
      sequenceId: 'sequence-main',
      variantId: 'variant-main',
      captureSessionId: 'capture-session-main',
      captureLogId: 'capture-log-main'
    }));
    expect(renderState.replayEventIds).toEqual(['capture-event-1']);
    expect(renderState.filterOverrides).toHaveLength(1);

    const plan = buildCapturePreviewPlan(project, toCaptureReplayContext(renderState));

    expect(plan.identity).toEqual(expect.objectContaining({
      projectId: 'project-core-engine-fixture',
      sequenceId: 'sequence-main',
      variantId: 'variant-main',
      mode: 'preview'
    }));
    expect(plan.nodes.map((node) => node.kind)).toContain('capture-replay');
    expect(plan.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: FFMPEG_PASS_COMPATIBILITY })
    ]));
    expect(plan.passes[0].semantics.captureReplay).toEqual(expect.objectContaining({
      captureSessionId: 'capture-session-main',
      captureLogId: 'capture-log-main',
      replayEventIds: ['capture-event-1'],
      filterOverrideCount: 1
    }));

    const readiness = evaluatePreviewAdapterReadiness(plan, makePreviewAdapterContext(project, plan));

    expect(readiness.status).toBe('supported');
    expect(readiness.report.renderGraph).toEqual(expect.objectContaining({
      projectId: 'project-core-engine-fixture',
      sequenceId: 'sequence-main',
      variantId: 'variant-main',
      mode: 'preview'
    }));
    expect(readiness.report.renderGraph.planId).toBe(plan.identity.planId);
    expect(readiness.report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: FFMPEG_PASS_COMPATIBILITY })
    ]));
  });

  it('preserves unsupported capture replay diagnostics through graph planning and readiness reporting', () => {
    const unsupportedEvent: CaptureReplayDiagnosticSource = {
      eventId: 'capture-event-unsupported',
      path: 'captureLogs.capture-log-main.events.capture-event-unsupported.kind',
      code: 'unsupported-value',
      message: 'Capture event "capture-event-unsupported" kind "entropy" is not supported for render replay.'
    };
    const renderState = resolveCanonicalReplay(project);
    const plan = buildCapturePreviewPlan(project, toCaptureReplayContext(renderState, {
      skippedEvents: [...renderState.skippedEvents, unsupportedEvent],
      diagnostics: [...renderState.skippedEvents, unsupportedEvent]
    }));

    expect(plan.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: CAPTURE_REPLAY_UNSUPPORTED_VALUE,
        severity: 'warning',
        path: unsupportedEvent.path
      })
    ]));

    const readiness = evaluatePreviewAdapterReadiness(plan, makePreviewAdapterContext(project, plan));

    expect(readiness.status).toBe('supported');
    expect(readiness.report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: CAPTURE_REPLAY_UNSUPPORTED_VALUE,
        severity: 'warning',
        path: unsupportedEvent.path
      })
    ]));
  });

  it('blocks preview readiness when the required composition seed is unavailable', () => {
    const renderState = resolveCanonicalReplay(project);
    const plan = buildCapturePreviewPlan(project, toCaptureReplayContext(renderState));
    const readiness = evaluatePreviewAdapterReadiness(plan, makePreviewAdapterContext(project, plan, {
      requiredSeedIds: ['seed-composition-main'],
      availableSeedIds: []
    }));

    expect(readiness.status).toBe('unsupported');
    expect(readiness.missingRequiredSeedIds).toEqual(['seed-composition-main']);
    expect(readiness.report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: PREVIEW_ADAPTER_MISSING_DETERMINISTIC_SEED,
        severity: 'error'
      })
    ]));
  });
});
