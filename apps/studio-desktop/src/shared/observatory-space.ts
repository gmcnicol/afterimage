import { resolveCompositionIntent } from '@afterimage/domain-operations';
import { exportProfiles } from '@afterimage/export-profiles';
import {
  buildSpatialFieldRuntimePlan,
  collectProjectIntegrityIssues,
  DEFAULT_RUNTIME_PERFORMANCE_PROFILES,
  getDefaultSequence,
  getDefaultVariant,
  getSequenceById,
  getVariantById,
  type CaptureEvent,
  type CaptureLog,
  type CaptureSession,
  type EntropyState,
  type ModulationEndpoint,
  type ModulationRoute,
  type NormalizedProjectFile,
  type NormalizedSceneDefinition,
  type NormalizedSceneLayerDefinition,
  type ProjectIntegrityIssue,
  type RuntimePerformanceProfile,
  type RuntimePerformanceProfileKind,
  type Sequence,
  type SpatialFieldRuntimePlan,
  type SpatialFieldRuntimeReport,
  type Variant
} from '@afterimage/project-model';
import type { StudioRenderDiagnostic } from '@afterimage/studio-contracts';
import type { DesktopJob, DiagnosticsSnapshot, LogEntry } from '../lib/studio-client';
import {
  resolveBehaviouralFieldCopy,
  type BehaviouralFieldCopy
} from './observatory-field-language';

export type ObservatoryLaneId = 'world-state' | 'trust' | 'render-graph' | 'backend' | 'activity';
export type ObservatorySignalSeverity = 'healthy' | 'info' | 'warning' | 'blocked';
export type ObservatorySignalKind =
  | 'scene'
  | 'layer'
  | 'spatial-field'
  | 'route'
  | 'entropy-state'
  | 'archive-reference'
  | 'capture-memory'
  | 'integrity-issue'
  | 'missing-media'
  | 'toolchain'
  | 'backend-warning'
  | 'render-diagnostic'
  | 'job'
  | 'log';

export interface ObservatorySignalDetail {
  title: string;
  semantic: string;
  backend: string;
  properties: Array<[string, string]>;
}

export interface ObservatorySignal {
  id: string;
  laneId: ObservatoryLaneId;
  kind: ObservatorySignalKind;
  severity: ObservatorySignalSeverity;
  label: string;
  summary: string;
  metadata: string[];
  detail: ObservatorySignalDetail;
}

export interface ObservatoryLane {
  id: ObservatoryLaneId;
  title: string;
  summary: string;
  severity: ObservatorySignalSeverity;
  signals: ObservatorySignal[];
}

export interface ObservatoryTelemetry {
  sceneCount: number;
  layerCount: number;
  pressure: number;
  entropy: number;
  cohesion: number;
  memory: number;
  volatility: number;
  routeCount: number;
  entropyStateCount: number;
  archiveReferenceCount: number;
  captureSessionCount: number;
  captureLogCount: number;
  captureEventCount: number;
  replayCriticalEventCount: number;
  renderDiagnosticCount: number;
  spatialFieldCount: number;
  fieldRuntimeDiagnosticCount: number;
}

export interface ObservatorySceneSnapshot {
  scene: NormalizedSceneDefinition;
  layers: NormalizedSceneLayerDefinition[];
  routes: ModulationRoute[];
  entropyStates: EntropyState[];
  archiveReferenceCount: number;
  diagnostics: ProjectIntegrityIssue[];
}

export interface ObservatoryTrustSummary {
  state: 'trusted' | 'watch' | 'blocked';
  blockerCount: number;
  warningCount: number;
  reasons: string[];
}

export interface ObservatoryRenderDiagnosticSnapshot {
  job: DesktopJob;
  diagnostic: StudioRenderDiagnostic;
}

export interface ObservatorySnapshot {
  compositionId: string;
  compositionName: string;
  sequence?: Sequence;
  variant?: Variant;
  resolverOk: boolean;
  dirty: boolean;
  telemetry: ObservatoryTelemetry;
  scenes: ObservatorySceneSnapshot[];
  latestCaptureSession?: CaptureSession;
  latestCaptureLog?: CaptureLog;
  latestCaptureEvents: CaptureEvent[];
  renderDiagnostics: ObservatoryRenderDiagnosticSnapshot[];
  fieldRuntime: SpatialFieldRuntimePlan;
  fieldLanguage: Record<string, BehaviouralFieldCopy>;
  trust: ObservatoryTrustSummary;
  lanes: ObservatoryLane[];
  signals: ObservatorySignal[];
  selectedSignal: ObservatorySignal;
}

export interface DeriveObservatorySnapshotInput {
  project: NormalizedProjectFile;
  dirty?: boolean;
  jobs?: DesktopJob[];
  diagnostics?: DiagnosticsSnapshot;
  logs?: LogEntry[];
  selectedSignalId?: string;
  runtimeProfileKind?: RuntimePerformanceProfileKind;
  runtimeProfileId?: string;
}

const laneOrder: ObservatoryLaneId[] = ['world-state', 'trust', 'render-graph', 'backend', 'activity'];

function compareLayersForScene(layerIds: string[]) {
  const indexByLayerId = new Map(layerIds.map((layerId, index) => [layerId, index]));

  return (left: NormalizedSceneLayerDefinition, right: NormalizedSceneLayerDefinition): number => {
    const leftIndex = indexByLayerId.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = indexByLayerId.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.orderIndex - right.orderIndex || left.id.localeCompare(right.id);
  };
}

function compareIsoDates(left: string | undefined, right: string | undefined): number {
  return (Date.parse(right ?? '') || 0) - (Date.parse(left ?? '') || 0);
}

function compareJobRelevance(left: DesktopJob, right: DesktopJob): number {
  return compareJobStatus(left.status) - compareJobStatus(right.status)
    || compareIsoDates(left.startedAt ?? left.endedAt, right.startedAt ?? right.endedAt)
    || left.id.localeCompare(right.id);
}

function compareJobStatus(status: DesktopJob['status']): number {
  switch (status) {
    case 'running':
      return 0;
    case 'queued':
      return 1;
    case 'failed':
      return 2;
    case 'cancelled':
      return 3;
    case 'completed':
      return 4;
  }
}

function severityRank(severity: ObservatorySignalSeverity): number {
  switch (severity) {
    case 'blocked':
      return 3;
    case 'warning':
      return 2;
    case 'info':
      return 1;
    case 'healthy':
      return 0;
  }
}

function maxSeverity(signals: ObservatorySignal[]): ObservatorySignalSeverity {
  return signals.reduce<ObservatorySignalSeverity>(
    (highest, signal) => severityRank(signal.severity) > severityRank(highest) ? signal.severity : highest,
    'healthy'
  );
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? '-' : `${Math.round(value * 100)}%`;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2).replace(/\.?0+$/, '') : '0';
}

function average(values: Array<number | undefined>): number {
  const defined = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return defined.length === 0 ? 0 : defined.reduce((sum, value) => sum + value, 0) / defined.length;
}

function endpointLabel(endpoint: ModulationEndpoint): string {
  return endpoint.property ? `${endpoint.kind}:${endpoint.id}.${endpoint.property}` : `${endpoint.kind}:${endpoint.id}`;
}

function routeTargetsScene(route: ModulationRoute, sceneId: string): boolean {
  return route.scope.sceneId === sceneId || route.source.id === sceneId || route.target.id === sceneId;
}

function entropyTargetsScene(state: EntropyState, sceneId: string): boolean {
  return state.scope.sceneId === sceneId || state.source.id === sceneId || state.target.id === sceneId;
}

function pathTargetsScene(path: string, sceneId: string): boolean {
  return path.includes(`composition.scenes.${sceneId}`);
}

function pathTargetsLayer(path: string, layerId: string): boolean {
  return path.includes(`composition.layers.${layerId}`);
}

function selectLatestCaptureSession(project: NormalizedProjectFile): CaptureSession | undefined {
  return [...project.captureSessions]
    .sort((left, right) => compareIsoDates(left.completedAt ?? left.startedAt, right.completedAt ?? right.startedAt) || left.id.localeCompare(right.id))[0];
}

function captureLogForSession(project: NormalizedProjectFile, sessionId: string | undefined): CaptureLog | undefined {
  return sessionId ? project.captureLogs.find((log) => log.captureSessionId === sessionId) : undefined;
}

function collectArchiveReferenceIds(project: NormalizedProjectFile): Set<string> {
  return new Set([
    ...project.composition.acceptedArchiveReferences.map((reference) => reference.id),
    ...project.composition.rejectedArchiveReferences.map((reference) => reference.id),
    ...project.composition.scenes.flatMap((scene) => scene.archiveReferenceIds),
    ...project.composition.layers.flatMap((layer) => layer.archiveReferenceIds)
  ].filter(Boolean));
}

function collectRenderDiagnostics(jobs: DesktopJob[]): ObservatoryRenderDiagnosticSnapshot[] {
  return jobs
    .filter((job) => job.type === 'preview' || job.type === 'export')
    .flatMap((job) => (job.result?.diagnostics ?? []).map((diagnostic) => ({ job, diagnostic })));
}

function signal(input: Omit<ObservatorySignal, 'detail'> & { detail?: Partial<ObservatorySignalDetail> }): ObservatorySignal {
  return {
    ...input,
    detail: {
      title: input.detail?.title ?? input.label,
      semantic: input.detail?.semantic ?? input.summary,
      backend: input.detail?.backend ?? `${input.kind} / ${input.id}`,
      properties: input.detail?.properties ?? []
    }
  };
}

function buildSceneSignal(sceneSnapshot: ObservatorySceneSnapshot): ObservatorySignal {
  const { scene, layers, routes, entropyStates } = sceneSnapshot;

  return signal({
    id: `scene:${scene.id}`,
    laneId: 'world-state',
    kind: 'scene',
    severity: sceneSnapshot.diagnostics.length > 0 ? 'warning' : 'healthy',
    label: scene.name,
    summary: `${scene.climate.atmosphere ?? 'neutral'} world pressure ${formatPercent(scene.climate.pressure)} with ${layers.length} layer${layers.length === 1 ? '' : 's'}.`,
    metadata: [
      `pressure ${formatPercent(scene.climate.pressure)}`,
      `entropy ${formatPercent(scene.climate.entropyBias)}`,
      `${routes.length} routes`,
      `${entropyStates.length} entropy`
    ],
    detail: {
      semantic: `This scene defines the active climate: ${scene.climate.atmosphere ?? 'neutral'} atmosphere, pressure ${formatPercent(scene.climate.pressure)}, entropy ${formatPercent(scene.climate.entropyBias)}, cohesion ${formatPercent(scene.climate.cohesion)}.`,
      backend: `scene ${scene.id}; layers ${scene.layerIds.join(', ') || 'none'}; archive references ${scene.archiveReferenceIds.join(', ') || 'none'}`,
      properties: [
        ['cohesion', formatPercent(scene.climate.cohesion)],
        ['memory', formatPercent(scene.climate.memory)],
        ['volatility', formatPercent(scene.climate.volatility)],
        ['motifs', scene.climate.motifIds?.join(', ') || '-'],
        ['materials', scene.climate.materialTags?.join(', ') || '-']
      ]
    }
  });
}

function buildLayerSignal(layer: NormalizedSceneLayerDefinition, sceneName: string): ObservatorySignal {
  return signal({
    id: `layer:${layer.id}`,
    laneId: 'world-state',
    kind: 'layer',
    severity: 'healthy',
    label: layer.name,
    summary: `${layer.contribution} layer in ${sceneName}, mixed at ${formatPercent(layer.mix)}.`,
    metadata: [layer.scope, layer.renderIntent.passKind, `mix ${formatPercent(layer.mix)}`],
    detail: {
      semantic: `This layer contributes ${layer.contribution} to ${sceneName}. Its render pass is ${layer.renderIntent.passKind}, so it affects output through the existing render graph path for that pass.`,
      backend: `layer ${layer.id}; scene ${layer.sceneId}; stack ${layer.stackId ?? 'none'}; asset ${layer.assetId ?? 'none'}; clip ${layer.clipId ?? 'none'}`,
      properties: [
        ['blend', layer.blendIntent],
        ['influence', layer.influence.join(', ') || '-'],
        ['archive refs', layer.archiveReferenceIds.join(', ') || '-']
      ]
    }
  });
}

function buildRouteSignal(route: ModulationRoute): ObservatorySignal {
  const seeded = Boolean(route.seedId);

  return signal({
    id: `route:${route.id}`,
    laneId: 'world-state',
    kind: 'route',
    severity: route.enabled === false ? 'info' : seeded ? 'healthy' : 'warning',
    label: route.name ?? route.id,
    summary: `${endpointLabel(route.source)} drives ${endpointLabel(route.target)} through ${route.mapping.kind}.`,
    metadata: [route.capturePolicy, seeded ? `seed ${route.seedId}` : 'unseeded', route.enabled === false ? 'disabled' : 'enabled'],
    detail: {
      semantic: `This modulation route explains live or captured behaviour by connecting ${endpointLabel(route.source)} to ${endpointLabel(route.target)}.`,
      backend: `route ${route.id}; scope ${JSON.stringify(route.scope)}; mapping ${JSON.stringify(route.mapping)}`,
      properties: [
        ['capture policy', route.capturePolicy],
        ['seed', route.seedId ?? 'none'],
        ['enabled', route.enabled === false ? 'false' : 'true']
      ]
    }
  });
}

function buildEntropySignal(state: EntropyState): ObservatorySignal {
  return signal({
    id: `entropy:${state.id}`,
    laneId: 'world-state',
    kind: 'entropy-state',
    severity: state.seedId ? 'healthy' : 'warning',
    label: state.id,
    summary: `${endpointLabel(state.source)} changes ${endpointLabel(state.target)} by ${formatNumber(state.value)}.`,
    metadata: [`value ${formatNumber(state.value)}`, state.capturePolicy, state.seedId ? `seed ${state.seedId}` : 'unseeded'],
    detail: {
      semantic: `This entropy state is a stored behavioural pressure. It is why the target can drift or recover during replay and render planning.`,
      backend: `entropy state ${state.id}; scope ${JSON.stringify(state.scope)}`,
      properties: [
        ['accumulation', state.accumulationPolicyId ?? '-'],
        ['recovery', state.recoveryPolicyId ?? '-'],
        ['enabled', state.enabled === false ? 'false' : 'true']
      ]
    }
  });
}

function buildCaptureSignal(session: CaptureSession | undefined, log: CaptureLog | undefined): ObservatorySignal {
  const eventCount = log?.events.length ?? 0;

  return signal({
    id: `capture:${log?.id ?? session?.id ?? 'none'}`,
    laneId: 'world-state',
    kind: 'capture-memory',
    severity: eventCount > 0 ? 'healthy' : 'info',
    label: log ? 'Capture memory' : 'No capture memory',
    summary: log ? `${eventCount} captured event${eventCount === 1 ? '' : 's'} available for explanation and replay.` : 'No capture log is attached to this world yet.',
    metadata: [session?.status ?? 'no session', log?.id ?? 'no log', `${eventCount} events`],
    detail: {
      semantic: log ? `The latest capture memory can explain replay-critical behaviour through ${eventCount} captured event${eventCount === 1 ? '' : 's'}.` : 'There is no capture memory to explain live input history for this world.',
      backend: `session ${session?.id ?? 'none'}; log ${log?.id ?? 'none'}; timebase ${session?.timebase.kind ?? 'none'}`,
      properties: [
        ['started', session?.startedAt ?? '-'],
        ['completed', session?.completedAt ?? '-'],
        ['replay critical', String(log?.events.filter((event) => event.replayCritical).length ?? 0)]
      ]
    }
  });
}

function buildTrustSignals(input: {
  project: NormalizedProjectFile;
  integrityDiagnostics: ProjectIntegrityIssue[];
  diagnostics?: DiagnosticsSnapshot;
  failedJobs: DesktopJob[];
}): ObservatorySignal[] {
  const seedIds = new Set(input.project.composition.deterministicSeeds.map((seed) => seed.id));
  const unseededRoutes = input.project.composition.modulationRoutes.filter((route) => !route.seedId);
  const unseededEntropy = input.project.composition.entropyStates.filter((state) => !state.seedId);

  return [
    ...input.integrityDiagnostics.map((issue) => signal({
      id: `integrity:${issue.path}:${issue.message}`,
      laneId: 'trust' as const,
      kind: 'integrity-issue' as const,
      severity: 'blocked' as const,
      label: issue.code,
      summary: issue.message,
      metadata: [issue.path],
      detail: {
        semantic: 'The world has a project integrity issue, so at least one reference cannot be trusted until this is fixed.',
        backend: `${issue.path}: ${issue.message}`,
        properties: [['code', issue.code]]
      }
    })),
    ...(input.diagnostics?.missingMedia ?? []).map((path) => signal({
      id: `missing-media:${path}`,
      laneId: 'trust' as const,
      kind: 'missing-media' as const,
      severity: 'blocked' as const,
      label: 'Missing media',
      summary: path,
      metadata: ['desktop diagnostic'],
      detail: {
        semantic: 'Output is blocked because a media file referenced by the project is not available on disk.',
        backend: path,
        properties: [['source', 'diagnostics.missingMedia']]
      }
    })),
    ...(input.diagnostics?.toolchain.available === false ? [signal({
      id: 'toolchain:unavailable',
      laneId: 'trust' as const,
      kind: 'toolchain' as const,
      severity: 'blocked' as const,
      label: 'Toolchain unavailable',
      summary: 'FFmpeg is unavailable, so render output cannot be trusted.',
      metadata: ['ffmpeg'],
      detail: {
        semantic: 'The desktop render backend is missing its FFmpeg toolchain.',
        backend: JSON.stringify(input.diagnostics.toolchain.versions),
        properties: [['available', 'false']]
      }
    })] : []),
    ...(input.diagnostics?.warnings ?? []).map((warning) => signal({
      id: `diagnostic-warning:${warning}`,
      laneId: 'trust' as const,
      kind: 'backend-warning' as const,
      severity: 'warning' as const,
      label: 'Desktop warning',
      summary: warning,
      metadata: ['diagnostics'],
      detail: {
        semantic: 'The desktop backend reported a warning that may affect output confidence.',
        backend: warning,
        properties: [['source', 'diagnostics.warnings']]
      }
    })),
    ...input.failedJobs.map((job) => signal({
      id: `failed-job:${job.id}`,
      laneId: 'trust' as const,
      kind: 'job' as const,
      severity: 'blocked' as const,
      label: `${job.type} failed`,
      summary: job.error ?? job.log.at(-1) ?? `Job ${job.id} failed.`,
      metadata: [job.target, job.endedAt ?? job.startedAt ?? 'no timestamp'],
      detail: {
        semantic: 'A recent render job failed, so the last output path for that job should not be trusted.',
        backend: `job ${job.id}; target ${job.target}; status ${job.status}`,
        properties: [['type', job.type], ['error', job.error ?? '-']]
      }
    })),
    ...unseededRoutes.map((route) => signal({
      id: `unseeded-route:${route.id}`,
      laneId: 'trust' as const,
      kind: 'route' as const,
      severity: 'warning' as const,
      label: 'Unseeded route',
      summary: `${route.name ?? route.id} has no deterministic seed.`,
      metadata: [route.capturePolicy],
      detail: {
        semantic: 'This route can still explain behaviour, but deterministic replay confidence is lower without a seed.',
        backend: `route ${route.id}; known seeds ${[...seedIds].join(', ') || 'none'}`,
        properties: [['source', endpointLabel(route.source)], ['target', endpointLabel(route.target)]]
      }
    })),
    ...unseededEntropy.map((state) => signal({
      id: `unseeded-entropy:${state.id}`,
      laneId: 'trust' as const,
      kind: 'entropy-state' as const,
      severity: 'warning' as const,
      label: 'Unseeded entropy',
      summary: `${state.id} has no deterministic seed.`,
      metadata: [state.capturePolicy],
      detail: {
        semantic: 'This entropy state is visible, but deterministic replay confidence is lower without a seed.',
        backend: `entropy state ${state.id}; known seeds ${[...seedIds].join(', ') || 'none'}`,
        properties: [['source', endpointLabel(state.source)], ['target', endpointLabel(state.target)]]
      }
    }))
  ];
}

function buildRenderSignals(renderDiagnostics: ObservatoryRenderDiagnosticSnapshot[]): ObservatorySignal[] {
  return renderDiagnostics.map(({ job, diagnostic }) => signal({
    id: `render:${job.id}:${diagnostic.id}`,
    laneId: 'render-graph',
    kind: 'render-diagnostic',
    severity: diagnostic.severity === 'error' ? 'blocked' : diagnostic.severity === 'warning' ? 'warning' : 'info',
    label: diagnostic.code,
    summary: diagnostic.message,
    metadata: [job.type, job.status, diagnostic.path ?? diagnostic.passId ?? diagnostic.nodeId ?? 'graph'],
    detail: {
      semantic: diagnostic.severity === 'error'
        ? 'The render graph found a blocking capability problem for this output path.'
        : 'The render graph found a capability note that explains how output will be planned.',
      backend: `job ${job.id}; diagnostic ${diagnostic.id}; node ${diagnostic.nodeId ?? '-'}; pass ${diagnostic.passId ?? '-'}`,
      properties: [
        ['severity', diagnostic.severity],
        ['path', diagnostic.path ?? '-'],
        ['requirement', diagnostic.requirementId ?? '-']
      ]
    }
  }));
}

function fieldReportSeverity(report: SpatialFieldRuntimeReport): ObservatorySignalSeverity {
  if (report.diagnostics.some((diagnostic) => diagnostic.severity === 'error') || report.profileFit === 'memory-exceeded') {
    return 'blocked';
  }
  if (report.diagnostics.some((diagnostic) => diagnostic.severity === 'warning') || report.profileFit === 'cost-exceeded') {
    return 'warning';
  }
  if (report.profileFit === 'degraded') {
    return 'info';
  }

  return 'healthy';
}

function runtimeProfileDisplay(profile: RuntimePerformanceProfile | undefined): string {
  return profile?.label ?? profile?.kind ?? 'Studio';
}

function buildFieldRuntimeSignals(
  fieldRuntime: SpatialFieldRuntimePlan,
  fieldLanguage: Record<string, BehaviouralFieldCopy>,
  runtimeProfile: RuntimePerformanceProfile | undefined
): ObservatorySignal[] {
  return fieldRuntime.reports.map((report) => {
    const copy = fieldLanguage[report.fieldId] ?? resolveBehaviouralFieldCopy(report);

    return signal({
      id: `spatial-field:${report.fieldId}`,
      laneId: 'render-graph' as const,
      kind: 'spatial-field' as const,
      severity: fieldReportSeverity(report),
      label: copy.label,
      summary: `${copy.description} Current fit is ${copy.status}.`,
      metadata: [
        copy.term.toLowerCase(),
        `${report.bufferCount} buffer${report.bufferCount === 1 ? '' : 's'}`,
        report.previousFrameId ? 'previous frame' : 'current frame only'
      ],
      detail: {
        semantic: `${copy.label} describes ${copy.term.toLowerCase()} across ${copy.context}. ${runtimeProfileDisplay(runtimeProfile)} sets the stability, persistence, detail, depth, and resolution budget for this view.`,
        backend: JSON.stringify({
          fieldId: report.fieldId,
          generatorId: report.generatorId,
          dimensions: report.dimensions,
          storageMode: report.storageMode,
          currentFrameId: report.currentFrameId,
          previousFrameId: report.previousFrameId,
          persistencePlan: report.persistencePlan,
          updatePasses: report.updatePasses,
          costClass: report.costClass,
          profileFit: report.profileFit,
          diagnostics: report.diagnostics
        }),
        properties: [
          ...copy.detailRows,
          ['dimensions', `${report.dimensions.width} x ${report.dimensions.height}`],
          ['cost class', report.costClass]
        ]
      }
    });
  });
}

function buildBackendSignals(diagnostics: DiagnosticsSnapshot | undefined): ObservatorySignal[] {
  if (!diagnostics) {
    return [signal({
      id: 'backend:pending',
      laneId: 'backend',
      kind: 'toolchain',
      severity: 'info',
      label: 'Backend pending',
      summary: 'Diagnostics have not reported backend state yet.',
      metadata: ['waiting'],
      detail: {
        semantic: 'The Observatory is waiting for the desktop diagnostics service to report toolchain state.',
        backend: 'diagnostics snapshot missing',
        properties: []
      }
    })];
  }

  const versionSignals = Object.entries(diagnostics.toolchain.versions).map(([name, version]) => signal({
    id: `toolchain-version:${name}`,
    laneId: 'backend' as const,
    kind: 'toolchain' as const,
    severity: version?.available ? 'healthy' as const : 'warning' as const,
    label: name,
    summary: version?.available ? (version.versionLine ?? version.path) : 'Not available',
    metadata: [version?.path ?? 'missing'],
    detail: {
      semantic: version?.available ? `${name} is available to the render backend.` : `${name} is missing or unavailable.`,
      backend: JSON.stringify(version ?? {}),
      properties: [['available', String(Boolean(version?.available))], ['path', version?.path ?? '-']]
    }
  }));

  return [
    signal({
      id: 'backend:toolchain',
      laneId: 'backend',
      kind: 'toolchain',
      severity: diagnostics.toolchain.available ? 'healthy' : 'blocked',
      label: 'FFmpeg toolchain',
      summary: diagnostics.toolchain.available ? 'Render backend is available.' : 'Render backend is unavailable.',
      metadata: [`${versionSignals.length} tools`, `${diagnostics.toolchain.warnings.length} warnings`],
      detail: {
        semantic: diagnostics.toolchain.available ? 'The backend can attempt preview and export renders.' : 'Preview and export output are blocked until the toolchain is available.',
        backend: JSON.stringify(diagnostics.toolchain.versions),
        properties: [['available', String(diagnostics.toolchain.available)]]
      }
    }),
    ...versionSignals,
    ...diagnostics.toolchain.warnings.map((warning) => signal({
      id: `toolchain-warning:${warning}`,
      laneId: 'backend' as const,
      kind: 'backend-warning' as const,
      severity: 'warning' as const,
      label: 'Toolchain warning',
      summary: warning,
      metadata: ['ffmpeg'],
      detail: {
        semantic: 'The toolchain reported a warning that may change render capability or output confidence.',
        backend: warning,
        properties: [['source', 'diagnostics.toolchain.warnings']]
      }
    })),
    ...diagnostics.recentCommands.slice(-5).reverse().map((command, index) => signal({
      id: `backend-command:${index}:${command}`,
      laneId: 'backend' as const,
      kind: 'log' as const,
      severity: 'info' as const,
      label: 'Recent command',
      summary: command,
      metadata: ['backend command'],
      detail: {
        semantic: 'This is one of the recent backend commands used to produce or inspect output.',
        backend: command,
        properties: [['source', 'diagnostics.recentCommands']]
      }
    }))
  ];
}

function buildActivitySignals(jobs: DesktopJob[], logs: LogEntry[]): ObservatorySignal[] {
  return [
    ...[...jobs].sort(compareJobRelevance).slice(0, 8).map((job) => signal({
      id: `job:${job.id}`,
      laneId: 'activity' as const,
      kind: 'job' as const,
      severity: job.status === 'failed' ? 'blocked' as const : job.status === 'queued' || job.status === 'running' ? 'warning' as const : 'info' as const,
      label: `${job.type} ${job.status}`,
      summary: job.error ?? job.log.at(-1) ?? job.target,
      metadata: [job.target, job.startedAt ?? job.endedAt ?? 'no timestamp'],
      detail: {
        semantic: job.status === 'failed'
          ? 'This job failed and may be blocking output confidence.'
          : job.status === 'running' || job.status === 'queued'
            ? 'This job is still active, so Observatory state may continue to change.'
            : 'This job is part of recent activity for this project.',
        backend: `job ${job.id}; type ${job.type}; target ${job.target}`,
        properties: [['status', job.status], ['progress', job.progress === undefined ? '-' : `${Math.round(job.progress * 100)}%`]]
      }
    })),
    ...logs.slice(-8).reverse().map((entry) => signal({
      id: `log:${entry.id}`,
      laneId: 'activity' as const,
      kind: 'log' as const,
      severity: entry.level === 'error' ? 'blocked' as const : entry.level === 'warn' ? 'warning' as const : 'info' as const,
      label: entry.message,
      summary: entry.details ?? entry.timestamp,
      metadata: [entry.level, entry.timestamp],
      detail: {
        semantic: entry.level === 'error' ? 'The application log reported an error.' : entry.level === 'warn' ? 'The application log reported a warning.' : 'The application log reported recent activity.',
        backend: entry.details ?? entry.message,
        properties: [['level', entry.level], ['timestamp', entry.timestamp]]
      }
    }))
  ];
}

function buildLanes(signals: ObservatorySignal[], trust: ObservatoryTrustSummary, telemetry: ObservatoryTelemetry, diagnostics?: DiagnosticsSnapshot): ObservatoryLane[] {
  const byLane = new Map<ObservatoryLaneId, ObservatorySignal[]>();
  for (const laneId of laneOrder) {
    byLane.set(laneId, signals.filter((candidate) => candidate.laneId === laneId));
  }

  return laneOrder.map((laneId): ObservatoryLane => {
    const laneSignals = byLane.get(laneId) ?? [];
    const severity = maxSeverity(laneSignals);

    switch (laneId) {
      case 'world-state':
        return {
          id: laneId,
          title: 'World State',
          summary: `${telemetry.sceneCount} scenes, ${telemetry.layerCount} layers, ${telemetry.routeCount} routes, ${telemetry.entropyStateCount} entropy states.`,
          severity,
          signals: laneSignals
        };
      case 'trust':
        return {
          id: laneId,
          title: 'Trust',
          summary: trust.state === 'trusted' ? 'No blockers are present.' : `${trust.blockerCount} blockers and ${trust.warningCount} warnings need attention.`,
          severity: trust.state === 'blocked' ? 'blocked' : trust.state === 'watch' ? 'warning' : 'healthy',
          signals: laneSignals
        };
      case 'render-graph':
        return {
          id: laneId,
          title: 'Runtime',
          summary: telemetry.fieldRuntimeDiagnosticCount > 0
            ? `${telemetry.spatialFieldCount} fields, ${telemetry.fieldRuntimeDiagnosticCount} field diagnostic notes.`
            : telemetry.renderDiagnosticCount > 0
              ? `${telemetry.renderDiagnosticCount} runtime diagnostics found.`
              : `${telemetry.spatialFieldCount} fields available for inspection.`,
          severity,
          signals: laneSignals
        };
      case 'backend':
        return {
          id: laneId,
          title: 'Backend',
          summary: diagnostics?.toolchain.available ? 'Toolchain is available.' : 'Toolchain is unavailable or pending.',
          severity,
          signals: laneSignals
        };
      case 'activity':
        return {
          id: laneId,
          title: 'Activity',
          summary: `${laneSignals.length} recent job or log signals.`,
          severity,
          signals: laneSignals
        };
    }
  });
}

function deriveTrustSummary(signals: ObservatorySignal[]): ObservatoryTrustSummary {
  const blockers = signals.filter((candidate) => candidate.severity === 'blocked');
  const warnings = signals.filter((candidate) => candidate.severity === 'warning');
  const reasons = [...blockers, ...warnings].slice(0, 6).map((candidate) => candidate.summary);

  return {
    state: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'watch' : 'trusted',
    blockerCount: blockers.length,
    warningCount: warnings.length,
    reasons
  };
}

function fallbackSignal(snapshotName: string): ObservatorySignal {
  return signal({
    id: 'observatory:fallback',
    laneId: 'world-state',
    kind: 'scene',
    severity: 'healthy',
    label: snapshotName,
    summary: 'No world signals are available yet.',
    metadata: ['empty'],
    detail: {
      semantic: 'The project is open, but no Observatory signals could be derived.',
      backend: 'empty observatory snapshot',
      properties: []
    }
  });
}

export function deriveObservatorySnapshot(input: DeriveObservatorySnapshotInput): ObservatorySnapshot {
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
  const layersBySceneId = new Map<string, NormalizedSceneLayerDefinition[]>();

  for (const layer of input.project.composition.layers) {
    const sceneLayers = layersBySceneId.get(layer.sceneId) ?? [];
    sceneLayers.push(layer);
    layersBySceneId.set(layer.sceneId, sceneLayers);
  }

  const scenes = input.project.composition.scenes.map((scene): ObservatorySceneSnapshot => {
    const layers = (layersBySceneId.get(scene.id) ?? []).sort(compareLayersForScene(scene.layerIds));
    const routes = input.project.composition.modulationRoutes.filter((route) => routeTargetsScene(route, scene.id));
    const entropyStates = input.project.composition.entropyStates.filter((state) => entropyTargetsScene(state, scene.id));
    const diagnostics = integrityDiagnostics.filter((issue) =>
      pathTargetsScene(issue.path, scene.id)
      || layers.some((layer) => pathTargetsLayer(issue.path, layer.id))
      || routes.some((route) => issue.path.includes(`composition.modulationRoutes.${route.id}`))
      || entropyStates.some((state) => issue.path.includes(`composition.entropyStates.${state.id}`))
    );

    return {
      scene,
      layers,
      routes,
      entropyStates,
      archiveReferenceCount: new Set([...scene.archiveReferenceIds, ...layers.flatMap((layer) => layer.archiveReferenceIds)]).size,
      diagnostics
    };
  });

  const latestCaptureSession = selectLatestCaptureSession(input.project);
  const latestCaptureLog = captureLogForSession(input.project, latestCaptureSession?.id) ?? input.project.captureLogs[0];
  const latestCaptureEvents = latestCaptureLog?.events ?? [];
  const jobs = input.jobs ?? [];
  const failedJobs = jobs.filter((job) => (job.type === 'preview' || job.type === 'export') && job.status === 'failed');
  const logs = input.logs ?? input.diagnostics?.logs ?? [];
  const renderDiagnostics = collectRenderDiagnostics(jobs);
  const runtimeProfiles = input.project.runtimeProfiles && input.project.runtimeProfiles.length > 0
    ? input.project.runtimeProfiles
    : DEFAULT_RUNTIME_PERFORMANCE_PROFILES;
  const runtimeProfile = (input.runtimeProfileId
    ? runtimeProfiles.find((profile) => profile.id === input.runtimeProfileId)
    : undefined)
    ?? runtimeProfiles.find((profile) => profile.kind === (input.runtimeProfileKind ?? 'studio'))
    ?? runtimeProfiles[0];
  const enabledProfileId = input.project.composition.exportProfileIds[0] ?? input.project.exportSelections.find((selection) => selection.enabled)?.profileId;
  const outputProfile = exportProfiles.find((profile) => profile.id === enabledProfileId) ?? exportProfiles[0];
  const fieldRuntime = buildSpatialFieldRuntimePlan({
    project: input.project,
    runtimeProfile,
    outputDimensions: {
      width: outputProfile.width,
      height: outputProfile.height
    },
    sourceDimensions: {
      width: outputProfile.width,
      height: outputProfile.height
    },
    frameIndex: 0,
    timeMs: 0,
    highQualityOpticalFlowAvailable: false
  });
  const fieldLanguage = Object.fromEntries(fieldRuntime.reports.map((report) => [
    report.fieldId,
    resolveBehaviouralFieldCopy(report, input.project)
  ]));
  const archiveReferenceIds = collectArchiveReferenceIds(input.project);
  const telemetry: ObservatoryTelemetry = {
    sceneCount: scenes.length,
    layerCount: input.project.composition.layers.length,
    pressure: average(scenes.map((entry) => entry.scene.climate.pressure)),
    entropy: average(scenes.map((entry) => entry.scene.climate.entropyBias)),
    cohesion: average(scenes.map((entry) => entry.scene.climate.cohesion)),
    memory: average(scenes.map((entry) => entry.scene.climate.memory)),
    volatility: average(scenes.map((entry) => entry.scene.climate.volatility)),
    routeCount: input.project.composition.modulationRoutes.length,
    entropyStateCount: input.project.composition.entropyStates.length,
    archiveReferenceCount: archiveReferenceIds.size,
    captureSessionCount: input.project.captureSessions.length,
    captureLogCount: input.project.captureLogs.length,
    captureEventCount: input.project.captureLogs.reduce((sum, log) => sum + log.events.length, 0),
    replayCriticalEventCount: input.project.captureLogs.reduce((sum, log) => sum + log.events.filter((event) => event.replayCritical).length, 0),
    renderDiagnosticCount: renderDiagnostics.length,
    spatialFieldCount: fieldRuntime.reports.length,
    fieldRuntimeDiagnosticCount: fieldRuntime.diagnostics.length
  };

  const worldSignals = [
    ...scenes.map(buildSceneSignal),
    ...scenes.flatMap((scene) => scene.layers.map((layer) => buildLayerSignal(layer, scene.scene.name))),
    ...input.project.composition.modulationRoutes.map(buildRouteSignal),
    ...input.project.composition.entropyStates.map(buildEntropySignal),
    signal({
      id: 'archive-references',
      laneId: 'world-state',
      kind: 'archive-reference',
      severity: telemetry.archiveReferenceCount > 0 ? 'healthy' : 'info',
      label: 'Archive references',
      summary: `${telemetry.archiveReferenceCount} archive reference${telemetry.archiveReferenceCount === 1 ? '' : 's'} shape this world.`,
      metadata: [`${input.project.composition.acceptedArchiveReferences.length} accepted`, `${input.project.composition.rejectedArchiveReferences.length} rejected`],
      detail: {
        semantic: telemetry.archiveReferenceCount > 0
          ? 'Accepted and attached archive references are part of the world explanation.'
          : 'No archive references are attached to the active composition.',
        backend: [...archiveReferenceIds].join(', ') || 'none',
        properties: [
          ['accepted', String(input.project.composition.acceptedArchiveReferences.length)],
          ['rejected', String(input.project.composition.rejectedArchiveReferences.length)]
        ]
      }
    }),
    buildCaptureSignal(latestCaptureSession, latestCaptureLog)
  ];
  const trustSignals = buildTrustSignals({
    project: input.project,
    integrityDiagnostics,
    diagnostics: input.diagnostics,
    failedJobs
  });
  const renderSignals = [
    ...buildRenderSignals(renderDiagnostics),
    ...buildFieldRuntimeSignals(fieldRuntime, fieldLanguage, runtimeProfile)
  ];
  const backendSignals = buildBackendSignals(input.diagnostics);
  const activitySignals = buildActivitySignals(jobs, logs);
  const trust = deriveTrustSummary(trustSignals);
  const signals = [...worldSignals, ...trustSignals, ...renderSignals, ...backendSignals, ...activitySignals];
  const lanes = buildLanes(signals, trust, telemetry, input.diagnostics);
  const selectedSignal = signals.find((candidate) => candidate.id === input.selectedSignalId)
    ?? signals.find((candidate) => candidate.laneId !== 'world-state' && candidate.severity === 'blocked')
    ?? signals.find((candidate) => candidate.laneId !== 'world-state' && candidate.severity === 'warning')
    ?? signals.find((candidate) => candidate.severity === 'blocked')
    ?? signals.find((candidate) => candidate.severity === 'warning')
    ?? signals[0]
    ?? fallbackSignal(input.project.composition.name);

  return {
    compositionId: input.project.composition.id,
    compositionName: input.project.composition.name,
    sequence,
    variant,
    resolverOk: compositionResult.ok,
    dirty: input.dirty ?? false,
    telemetry,
    scenes,
    latestCaptureSession,
    latestCaptureLog,
    latestCaptureEvents,
    renderDiagnostics,
    fieldRuntime,
    fieldLanguage,
    trust,
    lanes,
    signals,
    selectedSignal
  };
}
