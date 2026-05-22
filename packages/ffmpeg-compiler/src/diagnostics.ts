import { hashIdentity } from './identity.js';
import type { CaptureReplayDiagnosticSource, RenderGraphCapabilityDiagnostic } from './types.js';

export const FFMPEG_PASS_COMPATIBILITY = 'FFMPEG_PASS_COMPATIBILITY';
export const CAPTURE_REPLAY_UNSUPPORTED_VALUE = 'CAPTURE_REPLAY_UNSUPPORTED_VALUE';
export const CAPTURE_REPLAY_MISSING_REFERENCE = 'CAPTURE_REPLAY_MISSING_REFERENCE';
export const CAPTURE_REPLAY_PLANNING_FAILED = 'CAPTURE_REPLAY_PLANNING_FAILED';

interface RenderDiagnosticContext {
  nodeId?: string;
  passId?: string;
  requirementId?: string;
}

function withoutUndefinedEntries<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));
}

function normalizeReplayIssueCode(code: string): string {
  return code.toUpperCase().replace(/-/g, '_');
}

function createDiagnosticId(scope: string, identity: unknown): string {
  return `diagnostic:${scope}:${hashIdentity(identity)}`;
}

export function mapCaptureReplayDiagnosticSeverity(code: string): RenderGraphCapabilityDiagnostic['severity'] {
  return code === 'missing-reference' ? 'error' : 'warning';
}

export function toCaptureReplayDiagnosticCode(code: string): string {
  if (code === 'unsupported-value') {
    return CAPTURE_REPLAY_UNSUPPORTED_VALUE;
  }
  if (code === 'missing-reference') {
    return CAPTURE_REPLAY_MISSING_REFERENCE;
  }

  return `CAPTURE_REPLAY_${normalizeReplayIssueCode(code)}`;
}

export function buildFfmpegCompatibilityDiagnostic(context: RenderDiagnosticContext): RenderGraphCapabilityDiagnostic {
  return withoutUndefinedEntries({
    id: 'diagnostic:ffmpeg-pass-boundary',
    severity: 'info',
    code: FFMPEG_PASS_COMPATIBILITY,
    message: 'Render graph planning wraps the current FFmpeg command; execution is still performed by the existing command runner.',
    nodeId: context.nodeId,
    passId: context.passId,
    requirementId: context.requirementId
  }) as unknown as RenderGraphCapabilityDiagnostic;
}

export function buildCaptureReplayDiagnostics(
  sources: CaptureReplayDiagnosticSource[],
  context: Required<RenderDiagnosticContext>
): RenderGraphCapabilityDiagnostic[] {
  const diagnostics = new Map<string, RenderGraphCapabilityDiagnostic>();

  for (const source of sources) {
    const key = JSON.stringify(withoutUndefinedEntries({
      eventId: source.eventId,
      path: source.path,
      code: source.code,
      message: source.message
    }));
    if (diagnostics.has(key)) {
      continue;
    }

    diagnostics.set(key, withoutUndefinedEntries({
      id: createDiagnosticId('capture-replay', key),
      severity: mapCaptureReplayDiagnosticSeverity(source.code),
      code: toCaptureReplayDiagnosticCode(source.code),
      message: source.message,
      path: source.path,
      nodeId: context.nodeId,
      passId: context.passId,
      requirementId: context.requirementId
    }) as unknown as RenderGraphCapabilityDiagnostic);
  }

  return [...diagnostics.values()];
}

export function buildCaptureReplayPlanningFailureDiagnostic(error: unknown): RenderGraphCapabilityDiagnostic {
  const message = error instanceof Error ? error.message : String(error);

  return {
    id: createDiagnosticId('capture-replay-planning', message),
    severity: 'error',
    code: CAPTURE_REPLAY_PLANNING_FAILED,
    message
  };
}
