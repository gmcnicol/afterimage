import { resolveCompositionIntent } from '@afterimage/domain-operations';
import {
  collectProjectIntegrityIssues,
  getDefaultSequence,
  getDefaultVariant,
  getSequenceById,
  getVariantById,
  type CaptureLog,
  type CaptureSession,
  type EntropyState,
  type ModulationRoute,
  type NormalizedProjectFile,
  type NormalizedSceneDefinition,
  type NormalizedSceneLayerDefinition,
  type ProjectIntegrityIssue,
  type Sequence,
  type Variant
} from '@afterimage/project-model';
import type { DesktopJob, DiagnosticsSnapshot } from '../lib/studio-client';

export interface PerformanceSceneSnapshot {
  scene: NormalizedSceneDefinition;
  layers: NormalizedSceneLayerDefinition[];
  routes: ModulationRoute[];
  entropyStates: EntropyState[];
  diagnostics: ProjectIntegrityIssue[];
  captureSessionCount: number;
  captureLogCount: number;
}

export interface PerformanceJobSummary {
  job?: DesktopJob;
  busy: boolean;
  label: string;
  progress?: number;
  lastArtifactPath?: string;
  error?: string;
}

export interface PerformanceReadiness {
  previewReady: boolean;
  replayReady: boolean;
  previewReasons: string[];
  replayReasons: string[];
}

export interface PerformanceSnapshot {
  compositionId: string;
  compositionName: string;
  sequence?: Sequence;
  variant?: Variant;
  resolverOk: boolean;
  scenes: PerformanceSceneSnapshot[];
  selectedScene?: PerformanceSceneSnapshot;
  selectedLayer?: NormalizedSceneLayerDefinition;
  selectedLayerRoutes: ModulationRoute[];
  selectedLayerEntropyStates: EntropyState[];
  selectedLayerDiagnostics: ProjectIntegrityIssue[];
  latestCaptureSession?: CaptureSession;
  latestCaptureLog?: CaptureLog;
  selectedCaptureSession?: CaptureSession;
  selectedCaptureLog?: CaptureLog;
  previewOutputPath?: string;
  replayOutputPath?: string;
  previewJob: PerformanceJobSummary;
  replayJob: PerformanceJobSummary;
  diagnostics: ProjectIntegrityIssue[];
  desktopWarningCount: number;
  readiness: PerformanceReadiness;
}

export interface DerivePerformanceSnapshotInput {
  project: NormalizedProjectFile;
  projectRoot?: string;
  selectedSceneId?: string;
  selectedLayerId?: string;
  selectedCaptureSessionId?: string;
  selectedCaptureLogId?: string;
  jobs?: DesktopJob[];
  diagnostics?: DiagnosticsSnapshot;
}

function compareIsoDates(left: string | undefined, right: string | undefined): number {
  return (Date.parse(right ?? '') || 0) - (Date.parse(left ?? '') || 0);
}

function compareLayersForScene(layerIds: string[]) {
  const indexByLayerId = new Map(layerIds.map((layerId, index) => [layerId, index]));

  return (left: NormalizedSceneLayerDefinition, right: NormalizedSceneLayerDefinition): number => {
    const leftIndex = indexByLayerId.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = indexByLayerId.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.orderIndex - right.orderIndex || left.id.localeCompare(right.id);
  };
}

function routeTargetsScene(route: ModulationRoute, sceneId: string): boolean {
  return route.scope.sceneId === sceneId || route.source.id === sceneId || route.target.id === sceneId;
}

function routeTargetsLayer(route: ModulationRoute, layerId: string): boolean {
  return route.scope.layerId === layerId || route.source.id === layerId || route.target.id === layerId;
}

function entropyTargetsScene(state: EntropyState, sceneId: string): boolean {
  return state.scope.sceneId === sceneId || state.source.id === sceneId || state.target.id === sceneId;
}

function entropyTargetsLayer(state: EntropyState, layerId: string): boolean {
  return state.scope.layerId === layerId || state.source.id === layerId || state.target.id === layerId;
}

function issueTargetsScene(issue: ProjectIntegrityIssue, sceneId: string): boolean {
  return issue.path.includes(`composition.scenes.${sceneId}`);
}

function issueTargetsLayer(issue: ProjectIntegrityIssue, layerId: string): boolean {
  return issue.path.includes(`composition.layers.${layerId}`);
}

function latestJobForTarget(jobs: DesktopJob[], target?: string): DesktopJob | undefined {
  if (!target) {
    return undefined;
  }

  return jobs
    .filter((job) => job.type === 'preview' && job.target === target)
    .sort((left, right) =>
      compareStatus(left.status) - compareStatus(right.status)
      || compareIsoDates(left.startedAt ?? left.endedAt, right.startedAt ?? right.endedAt)
      || right.id.localeCompare(left.id)
    )[0];
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

function getJobArtifactPath(job?: DesktopJob): string | undefined {
  return job?.result?.outputPath
    ?? job?.result?.artifacts?.find((artifact) => artifact.path)?.path
    ?? (job?.status === 'completed' ? job.target : undefined);
}

function summarizeJob(job: DesktopJob | undefined, idleLabel: string): PerformanceJobSummary {
  if (!job) {
    return {
      busy: false,
      label: idleLabel
    };
  }

  const progress = typeof job.progress === 'number'
    ? Math.max(0, Math.min(100, Math.round(job.progress * 100)))
    : undefined;

  return {
    job,
    busy: job.status === 'queued' || job.status === 'running',
    label: job.status === 'queued'
      ? 'queued'
      : job.status === 'running'
        ? 'rendering'
        : job.status,
    progress,
    lastArtifactPath: getJobArtifactPath(job),
    error: job.status === 'failed' ? (job.error ?? job.log.at(-1)) : undefined
  };
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
  return sessionLog ?? project.captureLogs[0];
}

function buildReadiness(input: {
  variant?: Variant;
  selectedCaptureLog?: CaptureLog;
  integrityDiagnostics: ProjectIntegrityIssue[];
  desktopWarningCount: number;
  previewBusy: boolean;
  replayBusy: boolean;
}): PerformanceReadiness {
  const previewReasons: string[] = [];
  const replayReasons: string[] = [];
  const hasClips = (input.variant?.clips.length ?? 0) > 0;

  if (!hasClips) {
    previewReasons.push('active variant has no clips');
  }
  if (input.integrityDiagnostics.length > 0) {
    previewReasons.push(`${input.integrityDiagnostics.length} composition integrity issue${input.integrityDiagnostics.length === 1 ? '' : 's'}`);
  }
  if (input.desktopWarningCount > 0) {
    previewReasons.push(`${input.desktopWarningCount} desktop diagnostic issue${input.desktopWarningCount === 1 ? '' : 's'}`);
  }
  if (input.previewBusy) {
    previewReasons.push('preview render already active');
  }

  if (!input.selectedCaptureLog) {
    replayReasons.push('no capture session or log is available');
  } else if (input.selectedCaptureLog.events.length === 0) {
    replayReasons.push('selected capture log has no events');
  }
  if (input.replayBusy) {
    replayReasons.push('capture replay render already active');
  }

  return {
    previewReady: hasClips && input.integrityDiagnostics.length === 0 && !input.previewBusy,
    replayReady: hasClips && input.integrityDiagnostics.length === 0 && Boolean(input.selectedCaptureLog?.events.length) && !input.replayBusy,
    previewReasons,
    replayReasons: [...previewReasons.filter((reason) => reason !== 'preview render already active'), ...replayReasons]
  };
}

export function derivePerformanceSnapshot(input: DerivePerformanceSnapshotInput): PerformanceSnapshot {
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

  const scenes = input.project.composition.scenes.map((scene): PerformanceSceneSnapshot => {
    const layers = (layersBySceneId.get(scene.id) ?? []).sort(compareLayersForScene(scene.layerIds));
    const routes = input.project.composition.modulationRoutes.filter((route) => routeTargetsScene(route, scene.id));
    const entropyStates = input.project.composition.entropyStates.filter((state) => entropyTargetsScene(state, scene.id));
    const diagnostics = integrityDiagnostics.filter((issue) =>
      issueTargetsScene(issue, scene.id)
      || layers.some((layer) => issueTargetsLayer(issue, layer.id))
      || routes.some((route) => issue.path.includes(`composition.modulationRoutes.${route.id}`))
      || entropyStates.some((state) => issue.path.includes(`composition.entropyStates.${state.id}`))
    );
    const captureSessionIds = new Set(input.project.captureSessions
      .filter((session) => session.compositionId === input.project.composition.id && (!session.sequenceId || session.sequenceId === sequence?.id))
      .map((session) => session.id));

    return {
      scene,
      layers,
      routes,
      entropyStates,
      diagnostics,
      captureSessionCount: captureSessionIds.size,
      captureLogCount: input.project.captureLogs.filter((log) => captureSessionIds.has(log.captureSessionId)).length
    };
  });
  const selectedScene = scenes.find((candidate) => candidate.scene.id === input.selectedSceneId)
    ?? scenes.find((candidate) => candidate.layers.length > 0)
    ?? scenes[0];
  const selectedLayer = selectedScene?.layers.find((layer) => layer.id === input.selectedLayerId)
    ?? selectedScene?.layers[0];
  const selectedLayerRoutes = selectedLayer
    ? input.project.composition.modulationRoutes.filter((route) => routeTargetsLayer(route, selectedLayer.id))
    : [];
  const selectedLayerEntropyStates = selectedLayer
    ? input.project.composition.entropyStates.filter((state) => entropyTargetsLayer(state, selectedLayer.id))
    : [];
  const selectedLayerDiagnostics = selectedLayer
    ? integrityDiagnostics.filter((issue) =>
      issueTargetsLayer(issue, selectedLayer.id)
      || selectedLayerRoutes.some((route) => issue.path.includes(`composition.modulationRoutes.${route.id}`))
      || selectedLayerEntropyStates.some((state) => issue.path.includes(`composition.entropyStates.${state.id}`))
    )
    : [];
  const latestCaptureSession = selectLatestCaptureSession(input.project);
  const latestCaptureLog = selectLatestCaptureLog(input.project, latestCaptureSession);
  const selectedCaptureLog = input.selectedCaptureLogId
    ? input.project.captureLogs.find((log) => log.id === input.selectedCaptureLogId)
    : input.selectedCaptureSessionId
      ? captureLogForSession(input.project, input.selectedCaptureSessionId)
      : latestCaptureLog;
  const selectedCaptureSession = input.project.captureSessions.find((session) => session.id === (input.selectedCaptureSessionId ?? selectedCaptureLog?.captureSessionId))
    ?? latestCaptureSession;
  const previewOutputPath = input.projectRoot && variant ? `${input.projectRoot}/.afterimage/preview/${variant.id}.mp4` : undefined;
  const replayOutputPath = input.projectRoot && variant && selectedCaptureLog
    ? `${input.projectRoot}/.afterimage/preview/${variant.id}-${selectedCaptureLog.id}-replay.mp4`
    : undefined;
  const previewJob = summarizeJob(latestJobForTarget(input.jobs ?? [], previewOutputPath), 'not rendered');
  const replayJob = summarizeJob(latestJobForTarget(input.jobs ?? [], replayOutputPath), 'not replayed');
  const desktopWarningCount = (input.diagnostics?.warnings.length ?? 0) + (input.diagnostics?.missingMedia.length ?? 0);

  return {
    compositionId: input.project.composition.id,
    compositionName: input.project.composition.name,
    sequence,
    variant,
    resolverOk: compositionResult.ok,
    scenes,
    selectedScene,
    selectedLayer,
    selectedLayerRoutes,
    selectedLayerEntropyStates,
    selectedLayerDiagnostics,
    latestCaptureSession,
    latestCaptureLog,
    selectedCaptureSession,
    selectedCaptureLog,
    previewOutputPath,
    replayOutputPath,
    previewJob,
    replayJob,
    diagnostics: integrityDiagnostics,
    desktopWarningCount,
    readiness: buildReadiness({
      variant,
      selectedCaptureLog,
      integrityDiagnostics,
      desktopWarningCount,
      previewBusy: previewJob.busy,
      replayBusy: replayJob.busy
    })
  };
}
