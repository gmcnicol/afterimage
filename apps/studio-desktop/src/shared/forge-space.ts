import { exportProfiles, type ExportProfileDefinition, type ExportProfileId } from '@afterimage/export-profiles';
import { resolveCompositionIntent } from '@afterimage/domain-operations';
import {
  collectProjectIntegrityIssues,
  getDefaultSequence,
  getDefaultVariant,
  getSequenceById,
  getVariantById,
  type CaptureEvent,
  type CaptureLog,
  type CaptureSession,
  type ExportSelection,
  type NormalizedProjectFile,
  type ProjectIntegrityIssue,
  type Sequence,
  type Variant
} from '@afterimage/project-model';
import type { DesktopJob, DiagnosticsSnapshot, StudioRenderArtifact } from '../lib/studio-client';

export type ForgeLaneState = 'queued' | 'running' | 'failed' | 'completed' | 'cancelled' | 'idle';
export type ForgeDetailKind = 'profile' | 'capture-log' | 'job' | 'artifact' | 'diagnostic' | 'capture-event' | 'readiness';

export interface ForgeProfileSnapshot {
  id: ExportProfileId;
  profile: ExportProfileDefinition;
  selection?: ExportSelection;
  enabled: boolean;
  selected: boolean;
}

export interface ForgeArtifactSnapshot {
  id: string;
  jobId: string;
  profileId: string;
  role: StudioRenderArtifact['role'] | 'final-output';
  path: string;
  cacheKey?: string;
  producedBy?: string;
  provenance: Record<string, unknown>;
  final: boolean;
}

export interface ForgeDiagnosticSnapshot {
  id: string;
  jobId: string;
  profileId: string;
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  path?: string;
  nodeId?: string;
  passId?: string;
  requirementId?: string;
}

export interface ForgeProfileLane {
  profileId: string;
  profile?: ExportProfileDefinition;
  enabled: boolean;
  state: ForgeLaneState;
  jobs: DesktopJob[];
  latestJob?: DesktopJob;
  outputPath?: string;
  artifacts: ForgeArtifactSnapshot[];
  diagnostics: ForgeDiagnosticSnapshot[];
}

export interface ForgeReadiness {
  ready: boolean;
  reasons: string[];
}

export interface ForgeDetail {
  id: string;
  kind: ForgeDetailKind;
  label: string;
  semantic: string;
  backend: string;
  properties: Array<[string, string | number | boolean]>;
}

export interface ForgeSnapshot {
  compositionId: string;
  compositionName: string;
  sequence?: Sequence;
  variant?: Variant;
  resolverOk: boolean;
  latestCaptureSession?: CaptureSession;
  latestCaptureLog?: CaptureLog;
  selectedCaptureSession?: CaptureSession;
  selectedCaptureLog?: CaptureLog;
  selectedProfile?: ForgeProfileSnapshot;
  enabledProfiles: ForgeProfileSnapshot[];
  allProfiles: ForgeProfileSnapshot[];
  captureEvents: CaptureEvent[];
  replayCriticalEvents: CaptureEvent[];
  lanes: ForgeProfileLane[];
  activeJobCount: number;
  failedJobCount: number;
  completedJobCount: number;
  cancelledJobCount: number;
  artifacts: ForgeArtifactSnapshot[];
  diagnostics: ForgeDiagnosticSnapshot[];
  integrityDiagnostics: ProjectIntegrityIssue[];
  warnings: string[];
  missingMedia: string[];
  toolchainWarnings: string[];
  toolchainAvailable: boolean;
  readiness: ForgeReadiness;
  replayReadiness: ForgeReadiness;
  outputPath?: string;
  selectedDetail: ForgeDetail;
}

export interface DeriveForgeSnapshotInput {
  project: NormalizedProjectFile;
  projectRoot?: string;
  selectedCaptureSessionId?: string;
  selectedCaptureLogId?: string;
  selectedProfileId?: string;
  selectedDetailId?: string;
  jobs?: DesktopJob[];
  diagnostics?: DiagnosticsSnapshot;
}

function compareIsoDates(left: string | undefined, right: string | undefined): number {
  return (Date.parse(right ?? '') || 0) - (Date.parse(left ?? '') || 0);
}

function compareStatus(status: DesktopJob['status']): number {
  switch (status) {
    case 'running':
      return 0;
    case 'queued':
      return 1;
    case 'failed':
      return 2;
    case 'completed':
      return 3;
    case 'cancelled':
      return 4;
  }

  return 5;
}

function compareJobs(left: DesktopJob, right: DesktopJob): number {
  return compareStatus(left.status) - compareStatus(right.status)
    || compareIsoDates(left.startedAt ?? left.endedAt, right.startedAt ?? right.endedAt)
    || right.id.localeCompare(left.id);
}

function captureLogForSession(project: NormalizedProjectFile, sessionId: string | undefined): CaptureLog | undefined {
  return sessionId ? project.captureLogs.find((log) => log.captureSessionId === sessionId) : undefined;
}

function selectLatestCaptureSession(project: NormalizedProjectFile): CaptureSession | undefined {
  return [...project.captureSessions]
    .sort((left, right) => compareIsoDates(left.completedAt ?? left.startedAt, right.completedAt ?? right.startedAt) || left.id.localeCompare(right.id))[0];
}

function selectLatestCaptureLog(project: NormalizedProjectFile, latestSession?: CaptureSession): CaptureLog | undefined {
  const sessionLog = captureLogForSession(project, latestSession?.id);
  return sessionLog ?? [...project.captureLogs]
    .sort((left, right) => compareIsoDates(
      project.captureSessions.find((session) => session.id === left.captureSessionId)?.completedAt
        ?? project.captureSessions.find((session) => session.id === left.captureSessionId)?.startedAt,
      project.captureSessions.find((session) => session.id === right.captureSessionId)?.completedAt
        ?? project.captureSessions.find((session) => session.id === right.captureSessionId)?.startedAt
    ) || left.id.localeCompare(right.id))[0];
}

function profileIdForJob(job: DesktopJob): string {
  if (exportProfiles.some((profile) => profile.id === job.target)) {
    return job.target;
  }

  const outputPath = job.result?.outputPath ?? job.result?.artifacts?.find((artifact) => artifact.path)?.path ?? '';
  return exportProfiles.find((profile) => outputPath.includes(profile.id))?.id ?? job.target;
}

function getJobOutputPath(job: DesktopJob | undefined): string | undefined {
  return job?.result?.outputPath
    ?? job?.result?.artifacts?.find((artifact) => artifact.path)?.path
    ?? (job?.status === 'completed' ? job.target : undefined);
}

function normalizeArtifacts(job: DesktopJob, profileId: string): ForgeArtifactSnapshot[] {
  const artifacts: ForgeArtifactSnapshot[] = [];
  const seenPaths = new Set<string>();

  if (job.result?.outputPath) {
    artifacts.push({
      id: `artifact:${job.id}:output`,
      jobId: job.id,
      profileId,
      role: 'final-output',
      path: job.result.outputPath,
      provenance: {},
      final: true
    });
    seenPaths.add(job.result.outputPath);
  }

  for (const artifact of job.result?.artifacts ?? []) {
    const final = artifact.path === job.result?.outputPath || artifact.role === 'export-output' || artifact.role === 'finalize-output';
    artifacts.push({
      id: `artifact:${job.id}:${artifact.id}`,
      jobId: job.id,
      profileId,
      role: artifact.role,
      path: artifact.path,
      cacheKey: artifact.cacheKey,
      producedBy: artifact.producedBy,
      provenance: artifact.provenance,
      final
    });
    seenPaths.add(artifact.path);
  }

  if (job.status === 'completed' && artifacts.length === 0 && job.target && !seenPaths.has(job.target)) {
    artifacts.push({
      id: `artifact:${job.id}:target`,
      jobId: job.id,
      profileId,
      role: 'final-output',
      path: job.target,
      provenance: {},
      final: true
    });
  }

  return artifacts;
}

function normalizeDiagnostics(job: DesktopJob, profileId: string): ForgeDiagnosticSnapshot[] {
  return (job.result?.diagnostics ?? []).map((diagnostic) => ({
    id: `diagnostic:${job.id}:${diagnostic.id}`,
    jobId: job.id,
    profileId,
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    path: diagnostic.path,
    nodeId: diagnostic.nodeId,
    passId: diagnostic.passId,
    requirementId: diagnostic.requirementId
  }));
}

function laneState(job: DesktopJob | undefined): ForgeLaneState {
  return job?.status ?? 'idle';
}

function buildReadiness(input: {
  variant?: Variant;
  enabledProfileCount: number;
  integrityDiagnostics: ProjectIntegrityIssue[];
  warnings: string[];
  missingMedia: string[];
  toolchainAvailable: boolean;
  toolchainWarnings: string[];
  activeJobCount: number;
  failedJobCount: number;
  selectedCaptureLog?: CaptureLog;
  replay: boolean;
}): ForgeReadiness {
  const reasons: string[] = [];
  const hasClips = (input.variant?.clips.length ?? 0) > 0;

  if (!hasClips) {
    reasons.push('active variant has no clips');
  }
  if (input.enabledProfileCount === 0) {
    reasons.push('no enabled forge profiles');
  }
  if (input.integrityDiagnostics.length > 0) {
    reasons.push(`${input.integrityDiagnostics.length} composition integrity issue${input.integrityDiagnostics.length === 1 ? '' : 's'}`);
  }
  if (input.missingMedia.length > 0) {
    reasons.push(`${input.missingMedia.length} missing media reference${input.missingMedia.length === 1 ? '' : 's'}`);
  }
  if (!input.toolchainAvailable) {
    reasons.push('render toolchain unavailable');
  }
  if (input.toolchainWarnings.length > 0) {
    reasons.push(`${input.toolchainWarnings.length} toolchain warning${input.toolchainWarnings.length === 1 ? '' : 's'}`);
  }
  if (input.warnings.length > 0) {
    reasons.push(`${input.warnings.length} desktop warning${input.warnings.length === 1 ? '' : 's'}`);
  }
  if (input.failedJobCount > 0) {
    reasons.push(`${input.failedJobCount} failed forge job${input.failedJobCount === 1 ? '' : 's'}`);
  }
  if (input.activeJobCount > 0) {
    reasons.push(`${input.activeJobCount} active forge job${input.activeJobCount === 1 ? '' : 's'}`);
  }
  if (input.replay) {
    if (!input.selectedCaptureLog) {
      reasons.push('no capture log selected for replay forge');
    } else if (input.selectedCaptureLog.events.length === 0) {
      reasons.push('selected capture log has no events');
    }
  }

  return {
    ready: reasons.length === 0,
    reasons
  };
}

function detailProperties(values: Array<[string, string | number | boolean | undefined]>): Array<[string, string | number | boolean]> {
  return values
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined && entry[1] !== '');
}

function buildDetails(input: {
  snapshot: Omit<ForgeSnapshot, 'selectedDetail'>;
  selectedDetailId?: string;
}): ForgeDetail {
  const details: ForgeDetail[] = [];

  for (const profile of input.snapshot.allProfiles) {
    details.push({
      id: `profile:${profile.id}`,
      kind: 'profile',
      label: profile.profile.name,
      semantic: profile.enabled
        ? 'This profile is enabled and will receive normal and replay forge output.'
        : 'This profile is available but disabled for the next forge traversal.',
      backend: `profile ${profile.id}; ${profile.profile.width}x${profile.profile.height}; ${profile.profile.container}/${profile.profile.videoCodec}`,
      properties: detailProperties([
        ['enabled', profile.enabled],
        ['selected', profile.selected],
        ['profile id', profile.id],
        ['size', `${profile.profile.width} x ${profile.profile.height}`],
        ['container', profile.profile.container],
        ['codec', profile.profile.videoCodec]
      ])
    });
  }

  if (input.snapshot.selectedCaptureLog) {
    details.push({
      id: `capture-log:${input.snapshot.selectedCaptureLog.id}`,
      kind: 'capture-log',
      label: input.snapshot.selectedCaptureLog.id,
      semantic: `${input.snapshot.selectedCaptureLog.events.length} captured event${input.snapshot.selectedCaptureLog.events.length === 1 ? '' : 's'} can be used as replay source data for Forge Replay.`,
      backend: `capture log ${input.snapshot.selectedCaptureLog.id}; session ${input.snapshot.selectedCaptureLog.captureSessionId}`,
      properties: detailProperties([
        ['session', input.snapshot.selectedCaptureLog.captureSessionId],
        ['events', input.snapshot.selectedCaptureLog.events.length],
        ['replay critical', input.snapshot.replayCriticalEvents.length]
      ])
    });
  }

  for (const event of input.snapshot.captureEvents) {
    details.push({
      id: `capture-event:${event.id}`,
      kind: 'capture-event',
      label: event.id,
      semantic: event.replayCritical
        ? 'This captured input is replay-critical and can alter the forged traversal.'
        : 'This captured input is available for explanation but is not marked replay-critical.',
      backend: `event ${event.id}; index ${event.index}; source ${event.source.kind}:${event.source.id}`,
      properties: detailProperties([
        ['kind', event.kind],
        ['time', `${event.captureTimeMs} ms`],
        ['composition time', event.compositionTimeMs === undefined ? undefined : `${event.compositionTimeMs} ms`],
        ['route', event.routeId],
        ['seed', event.seedId],
        ['replay critical', event.replayCritical]
      ])
    });
  }

  for (const lane of input.snapshot.lanes) {
    for (const job of lane.jobs) {
      details.push({
        id: `job:${job.id}`,
        kind: 'job',
        label: job.id,
        semantic: job.status === 'failed'
          ? 'This forge job needs recovery before the output set is ready.'
          : job.status === 'completed'
            ? 'This forge job completed and produced reviewable artifacts.'
            : job.status === 'running' || job.status === 'queued'
              ? 'This forge job is still producing review artifacts.'
              : 'This forge job was cancelled and is not part of the ready output set.',
        backend: `job ${job.id}; type ${job.type}; target ${job.target}`,
        properties: detailProperties([
          ['profile', lane.profile?.name ?? lane.profileId],
          ['status', job.status],
          ['progress', typeof job.progress === 'number' ? `${Math.round(job.progress * 100)}%` : undefined],
          ['output', getJobOutputPath(job)],
          ['error', job.error]
        ])
      });
    }
  }

  for (const artifact of input.snapshot.artifacts) {
    details.push({
      id: artifact.id,
      kind: 'artifact',
      label: artifact.path.split(/[\\/]/).filter(Boolean).at(-1) ?? artifact.path,
      semantic: artifact.final
        ? 'This is final Forge output suitable for artifact review.'
        : 'This is an intermediate render artifact useful for diagnosing the final output.',
      backend: `artifact ${artifact.id}; job ${artifact.jobId}; role ${artifact.role}`,
      properties: detailProperties([
        ['profile', artifact.profileId],
        ['role', artifact.role],
        ['path', artifact.path],
        ['cache key', artifact.cacheKey],
        ['produced by', artifact.producedBy]
      ])
    });
  }

  for (const diagnostic of input.snapshot.diagnostics) {
    details.push({
      id: diagnostic.id,
      kind: 'diagnostic',
      label: diagnostic.code,
      semantic: diagnostic.message,
      backend: `diagnostic ${diagnostic.id}; job ${diagnostic.jobId}; profile ${diagnostic.profileId}`,
      properties: detailProperties([
        ['severity', diagnostic.severity],
        ['path', diagnostic.path],
        ['node', diagnostic.nodeId],
        ['pass', diagnostic.passId],
        ['requirement', diagnostic.requirementId]
      ])
    });
  }

  const selected = details.find((detail) => detail.id === input.selectedDetailId);
  if (selected) {
    return selected;
  }

  return details.find((detail) => detail.kind === 'job' && detail.properties.some(([key, value]) => key === 'status' && value === 'failed'))
    ?? details.find((detail) => detail.kind === 'diagnostic')
    ?? details.find((detail) => detail.kind === 'artifact')
    ?? details.find((detail) => detail.id === `profile:${input.snapshot.selectedProfile?.id}`)
    ?? details.find((detail) => detail.kind === 'capture-log')
    ?? {
      id: 'readiness:forge',
      kind: 'readiness',
      label: input.snapshot.readiness.ready ? 'Forge ready' : 'Forge blocked',
      semantic: input.snapshot.readiness.ready
        ? 'The active traversal can be forged with the enabled profiles.'
        : input.snapshot.readiness.reasons[0] ?? 'Forge output is not ready yet.',
      backend: `composition ${input.snapshot.compositionId}; sequence ${input.snapshot.sequence?.id ?? 'none'}; variant ${input.snapshot.variant?.id ?? 'none'}`,
      properties: detailProperties([
        ['enabled profiles', input.snapshot.enabledProfiles.length],
        ['active jobs', input.snapshot.activeJobCount],
        ['failed jobs', input.snapshot.failedJobCount],
        ['artifacts', input.snapshot.artifacts.length]
      ])
    };
}

export function deriveForgeSnapshot(input: DeriveForgeSnapshotInput): ForgeSnapshot {
  const compositionResult = resolveCompositionIntent({ project: input.project });
  const integrityDiagnostics = collectProjectIntegrityIssues(input.project);
  const sequence = compositionResult.ok
    ? compositionResult.intent.sequence
    : getSequenceById(input.project, input.project.composition.sequenceId) ?? getDefaultSequence(input.project);
  const variant = compositionResult.ok
    ? compositionResult.intent.variant
    : sequence
      ? getVariantById(input.project, input.project.composition.variantId) ?? getDefaultVariant(input.project, sequence.id)
      : undefined;
  const selectedProfileId = input.selectedProfileId ?? input.project.exportSelections.find((selection) => selection.enabled)?.profileId;
  const allProfiles = exportProfiles.map((profile): ForgeProfileSnapshot => {
    const selection = input.project.exportSelections.find((candidate) => candidate.profileId === profile.id);
    return {
      id: profile.id,
      profile,
      selection,
      enabled: selection?.enabled ?? false,
      selected: profile.id === selectedProfileId
    };
  });
  const enabledProfiles = allProfiles.filter((profile) => profile.enabled);
  const selectedProfile = allProfiles.find((profile) => profile.id === selectedProfileId) ?? enabledProfiles[0] ?? allProfiles[0];
  const latestCaptureSession = selectLatestCaptureSession(input.project);
  const latestCaptureLog = selectLatestCaptureLog(input.project, latestCaptureSession);
  const selectedCaptureLog = input.selectedCaptureLogId
    ? input.project.captureLogs.find((log) => log.id === input.selectedCaptureLogId)
    : input.selectedCaptureSessionId
      ? captureLogForSession(input.project, input.selectedCaptureSessionId)
      : latestCaptureLog;
  const selectedCaptureSession = input.project.captureSessions.find((session) => session.id === (input.selectedCaptureSessionId ?? selectedCaptureLog?.captureSessionId))
    ?? latestCaptureSession;
  const exportJobs = (input.jobs ?? []).filter((job) => job.type === 'export');
  const jobsByProfileId = new Map<string, DesktopJob[]>();

  for (const job of exportJobs) {
    const profileId = profileIdForJob(job);
    const jobs = jobsByProfileId.get(profileId) ?? [];
    jobs.push(job);
    jobsByProfileId.set(profileId, jobs);
  }

  const laneIds = new Set<string>([
    ...enabledProfiles.map((profile) => profile.id),
    ...allProfiles.filter((profile) => profile.selected).map((profile) => profile.id),
    ...jobsByProfileId.keys()
  ]);
  const lanes = [...laneIds].map((profileId): ForgeProfileLane => {
    const profileSnapshot = allProfiles.find((profile) => profile.id === profileId);
    const jobs = [...(jobsByProfileId.get(profileId) ?? [])].sort(compareJobs);
    const latestJob = jobs[0];
    const artifacts = jobs.flatMap((job) => normalizeArtifacts(job, profileId));
    const diagnostics = jobs.flatMap((job) => normalizeDiagnostics(job, profileId));

    return {
      profileId,
      profile: profileSnapshot?.profile,
      enabled: profileSnapshot?.enabled ?? false,
      state: laneState(latestJob),
      jobs,
      latestJob,
      outputPath: getJobOutputPath(latestJob),
      artifacts,
      diagnostics
    };
  }).sort((left, right) => {
    const leftIndex = exportProfiles.findIndex((profile) => profile.id === left.profileId);
    const rightIndex = exportProfiles.findIndex((profile) => profile.id === right.profileId);
    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
      || left.profileId.localeCompare(right.profileId);
  });
  const artifacts = lanes.flatMap((lane) => lane.artifacts);
  const renderDiagnostics = lanes.flatMap((lane) => lane.diagnostics);
  const activeJobCount = exportJobs.filter((job) => job.status === 'queued' || job.status === 'running').length;
  const failedJobCount = exportJobs.filter((job) => job.status === 'failed').length;
  const completedJobCount = exportJobs.filter((job) => job.status === 'completed').length;
  const cancelledJobCount = exportJobs.filter((job) => job.status === 'cancelled').length;
  const warnings = input.diagnostics?.warnings ?? [];
  const missingMedia = input.diagnostics?.missingMedia ?? [];
  const toolchainWarnings = input.diagnostics?.toolchain.warnings ?? [];
  const toolchainAvailable = input.diagnostics?.toolchain.available ?? true;
  const outputPath = input.projectRoot && variant ? `${input.projectRoot}/exports/${input.project.id}-${variant.id}` : undefined;
  const baseSnapshot = {
    compositionId: input.project.composition.id,
    compositionName: input.project.composition.name,
    sequence,
    variant,
    resolverOk: compositionResult.ok,
    latestCaptureSession,
    latestCaptureLog,
    selectedCaptureSession,
    selectedCaptureLog,
    selectedProfile,
    enabledProfiles,
    allProfiles,
    captureEvents: selectedCaptureLog?.events ?? [],
    replayCriticalEvents: selectedCaptureLog?.events.filter((event) => event.replayCritical) ?? [],
    lanes,
    activeJobCount,
    failedJobCount,
    completedJobCount,
    cancelledJobCount,
    artifacts,
    diagnostics: renderDiagnostics,
    integrityDiagnostics,
    warnings,
    missingMedia,
    toolchainWarnings,
    toolchainAvailable,
    readiness: buildReadiness({
      variant,
      enabledProfileCount: enabledProfiles.length,
      integrityDiagnostics,
      warnings,
      missingMedia,
      toolchainAvailable,
      toolchainWarnings,
      activeJobCount,
      failedJobCount,
      replay: false
    }),
    replayReadiness: buildReadiness({
      variant,
      enabledProfileCount: enabledProfiles.length,
      integrityDiagnostics,
      warnings,
      missingMedia,
      toolchainAvailable,
      toolchainWarnings,
      activeJobCount,
      failedJobCount,
      selectedCaptureLog,
      replay: true
    }),
    outputPath
  };

  return {
    ...baseSnapshot,
    selectedDetail: buildDetails({
      snapshot: baseSnapshot,
      selectedDetailId: input.selectedDetailId
    })
  };
}
