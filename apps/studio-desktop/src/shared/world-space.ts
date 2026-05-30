import { resolveCompositionIntent } from '@afterimage/domain-operations';
import {
  collectProjectIntegrityIssues,
  getDefaultSequence,
  getDefaultVariant,
  getSequenceById,
  getVariantById,
  type EntropyState,
  type ExportSelection,
  type ModulationRoute,
  type NormalizedProjectFile,
  type NormalizedSceneDefinition,
  type NormalizedSceneLayerDefinition,
  type ProjectIntegrityIssue,
  type Sequence,
  type Variant
} from '@afterimage/project-model';
import type { DesktopJob, DiagnosticsSnapshot } from '../lib/studio-client';

export interface WorldSceneSnapshot {
  scene: NormalizedSceneDefinition;
  layers: NormalizedSceneLayerDefinition[];
  diagnostics: ProjectIntegrityIssue[];
  routes: ModulationRoute[];
  entropyStates: EntropyState[];
}

export interface WorldRenderReadiness {
  previewReady: boolean;
  exportReady: boolean;
  activeJobCount: number;
  failedJobCount: number;
  enabledExportCount: number;
  blockingIssueCount: number;
  warningCount: number;
  reasons: string[];
}

export interface WorldSnapshot {
  compositionId: string;
  compositionName: string;
  sequence?: Sequence;
  variant?: Variant;
  resolverOk: boolean;
  dirty: boolean;
  scenes: WorldSceneSnapshot[];
  selectedScene?: WorldSceneSnapshot;
  selectedLayer?: NormalizedSceneLayerDefinition;
  selectedLayerDiagnostics: ProjectIntegrityIssue[];
  selectedLayerRoutes: ModulationRoute[];
  selectedLayerEntropyStates: EntropyState[];
  exportTargets: ExportSelection[];
  integrityDiagnostics: ProjectIntegrityIssue[];
  readiness: WorldRenderReadiness;
}

export interface DeriveWorldSnapshotInput {
  project: NormalizedProjectFile;
  dirty?: boolean;
  selectedSceneId?: string;
  selectedLayerId?: string;
  jobs?: DesktopJob[];
  diagnostics?: DiagnosticsSnapshot;
}

function compareLayersForScene(layerIds: string[]) {
  const indexByLayerId = new Map(layerIds.map((layerId, index) => [layerId, index]));

  return (left: NormalizedSceneLayerDefinition, right: NormalizedSceneLayerDefinition): number => {
    const leftIndex = indexByLayerId.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = indexByLayerId.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.orderIndex - right.orderIndex || left.id.localeCompare(right.id);
  };
}

function pathTargetsScene(path: string, sceneId: string): boolean {
  return path.includes(`composition.scenes.${sceneId}`);
}

function pathTargetsLayer(path: string, layerId: string): boolean {
  return path.includes(`composition.layers.${layerId}`);
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

function getRejectedCutIds(project: NormalizedProjectFile): Set<string> {
  return new Set(
    project.cutCandidates
      .filter((cut) => cut.status === 'rejected')
      .map((cut) => cut.id)
  );
}

function deriveReadiness(input: {
  variant?: Variant;
  exportTargets: ExportSelection[];
  integrityDiagnostics: ProjectIntegrityIssue[];
  jobs: DesktopJob[];
  diagnostics?: DiagnosticsSnapshot;
}): WorldRenderReadiness {
  const activeJobCount = input.jobs.filter((job) => job.status === 'queued' || job.status === 'running').length;
  const failedJobCount = input.jobs.filter((job) => (job.type === 'preview' || job.type === 'export') && job.status === 'failed').length;
  const warningCount = (input.diagnostics?.warnings.length ?? 0) + (input.diagnostics?.missingMedia.length ?? 0);
  const enabledExportCount = input.exportTargets.filter((selection) => selection.enabled ?? true).length;
  const hasSequenceClips = (input.variant?.clips.length ?? 0) > 0;
  const blockingIssueCount = input.integrityDiagnostics.length + warningCount + failedJobCount;
  const reasons: string[] = [];

  if (!hasSequenceClips) {
    reasons.push('active variant has no clips');
  }
  if (enabledExportCount === 0) {
    reasons.push('no enabled export targets');
  }
  if (input.integrityDiagnostics.length > 0) {
    reasons.push(`${input.integrityDiagnostics.length} composition integrity issue${input.integrityDiagnostics.length === 1 ? '' : 's'}`);
  }
  if (warningCount > 0) {
    reasons.push(`${warningCount} desktop diagnostic issue${warningCount === 1 ? '' : 's'}`);
  }
  if (failedJobCount > 0) {
    reasons.push(`${failedJobCount} failed render job${failedJobCount === 1 ? '' : 's'}`);
  }
  if (activeJobCount > 0) {
    reasons.push(`${activeJobCount} active job${activeJobCount === 1 ? '' : 's'}`);
  }

  return {
    previewReady: hasSequenceClips && input.integrityDiagnostics.length === 0,
    exportReady: hasSequenceClips && enabledExportCount > 0 && blockingIssueCount === 0,
    activeJobCount,
    failedJobCount,
    enabledExportCount,
    blockingIssueCount,
    warningCount,
    reasons
  };
}

export function deriveWorldSnapshot(input: DeriveWorldSnapshotInput): WorldSnapshot {
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
  const rejectedCutIds = getRejectedCutIds(input.project);

  for (const layer of input.project.composition.layers) {
    if (layer.cutId && rejectedCutIds.has(layer.cutId)) {
      continue;
    }

    const sceneLayers = layersBySceneId.get(layer.sceneId) ?? [];
    sceneLayers.push(layer);
    layersBySceneId.set(layer.sceneId, sceneLayers);
  }

  const scenes = input.project.composition.scenes.map((scene): WorldSceneSnapshot => {
    const orderedLayers = (layersBySceneId.get(scene.id) ?? [])
      .sort(compareLayersForScene(scene.layerIds));
    const routes = input.project.composition.modulationRoutes.filter((route) => routeTargetsScene(route, scene.id));
    const entropyStates = input.project.composition.entropyStates.filter((state) => entropyTargetsScene(state, scene.id));
    const diagnostics = integrityDiagnostics.filter((issue) =>
      pathTargetsScene(issue.path, scene.id)
      || orderedLayers.some((layer) => pathTargetsLayer(issue.path, layer.id))
      || routes.some((route) => issue.path.includes(`composition.modulationRoutes.${route.id}`))
      || entropyStates.some((state) => issue.path.includes(`composition.entropyStates.${state.id}`))
    );

    return {
      scene,
      layers: orderedLayers,
      diagnostics,
      routes,
      entropyStates
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
      pathTargetsLayer(issue.path, selectedLayer.id)
      || selectedLayerRoutes.some((route) => issue.path.includes(`composition.modulationRoutes.${route.id}`))
      || selectedLayerEntropyStates.some((state) => issue.path.includes(`composition.entropyStates.${state.id}`))
    )
    : [];
  const exportTargetIds = new Set(input.project.composition.exportProfileIds);
  const exportTargets = input.project.exportSelections.filter((selection) => exportTargetIds.has(selection.profileId));

  return {
    compositionId: input.project.composition.id,
    compositionName: input.project.composition.name,
    sequence,
    variant,
    resolverOk: compositionResult.ok,
    dirty: input.dirty ?? false,
    scenes,
    selectedScene,
    selectedLayer,
    selectedLayerDiagnostics,
    selectedLayerRoutes,
    selectedLayerEntropyStates,
    exportTargets,
    integrityDiagnostics,
    readiness: deriveReadiness({
      variant,
      exportTargets,
      integrityDiagnostics,
      jobs: input.jobs ?? [],
      diagnostics: input.diagnostics
    })
  };
}
