import {
  collectProjectIntegrityIssues,
  getAssetById,
  getDefaultSequence,
  getDefaultVariant,
  getSequenceById,
  getVariantById,
  normalizeProject,
  type CaptureLog,
  type CaptureSession,
  type CompositionAcceptedArchiveReference,
  type CompositionDeterministicSeed,
  type EntropyState,
  type ExportSelection,
  type MediaAsset,
  type ModulationRoute,
  type NormalizedCompositionIdentity,
  type NormalizedProjectFile,
  type NormalizedSceneDefinition,
  type NormalizedSceneLayerDefinition,
  type ProjectIntegrityIssue,
  type SceneClimate,
  type SceneDefinition,
  type SceneLayerRenderIntent,
  type Sequence,
  type Variant
} from '@afterimage/project-model';

export interface ResolveCompositionIntentInput {
  project: NormalizedProjectFile;
  sequenceId?: string;
  variantId?: string;
  captureSessionId?: string;
  captureLogId?: string;
  availableArchiveIds?: string[];
}

export interface CompositionIntent {
  projectId: string;
  projectName: string;
  composition: NormalizedCompositionIdentity;
  sequence: Sequence;
  variant: Variant;
  referencedAssets: MediaAsset[];
  exportSelections: ExportSelection[];
  deterministicSeeds: CompositionDeterministicSeed[];
  scenes: NormalizedSceneDefinition[];
  layers: NormalizedSceneLayerDefinition[];
  modulationRoutes: ModulationRoute[];
  entropyStates: EntropyState[];
  captureSession?: CaptureSession;
  captureLog?: CaptureLog;
  archiveReferenceIds: string[];
  acceptedArchiveReferences: CompositionAcceptedArchiveReference[];
}

export type ResolveCompositionIntentResult =
  | {
      ok: true;
      intent: CompositionIntent;
      diagnostics: [];
    }
  | {
      ok: false;
      diagnostics: ProjectIntegrityIssue[];
      intent?: undefined;
    };

export interface UpdateCompositionSceneInput {
  name?: string;
  climate?: Partial<SceneClimate>;
}

export interface AddCompositionSceneInput {
  sceneId?: string;
  name?: string;
  climate?: Partial<SceneClimate>;
}

export interface UpdateCompositionLayerInput {
  name?: string;
  orderIndex?: number;
  mix?: number;
  sceneId?: string;
  renderIntent?: Partial<SceneLayerRenderIntent>;
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined))]
    .sort(compareStrings);
}

function createUniqueSceneId(project: NormalizedProjectFile, preferredId: string): string {
  const sceneIds = new Set(project.composition.scenes.map((scene) => scene.id));
  let candidate = preferredId;
  let suffix = 2;

  while (sceneIds.has(candidate)) {
    candidate = `${preferredId}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export function setActiveCompositionSequenceVariant(
  project: NormalizedProjectFile,
  sequenceId: string,
  variantId?: string
): NormalizedProjectFile {
  const sequence = getSequenceById(project, sequenceId);
  if (!sequence) {
    return project;
  }

  const variant = variantId
    ? getVariantById(project, variantId)
    : getDefaultVariant(project, sequenceId);
  if (!variant || variant.sequenceId !== sequence.id || !sequence.variantIds.includes(variant.id)) {
    return project;
  }

  return normalizeProject({
    ...project,
    composition: {
      ...project.composition,
      sequenceId: sequence.id,
      variantId: variant.id
    }
  });
}

export function updateCompositionScene(
  project: NormalizedProjectFile,
  sceneId: string,
  input: UpdateCompositionSceneInput
): NormalizedProjectFile {
  if (!project.composition.scenes.some((scene) => scene.id === sceneId)) {
    return project;
  }

  return normalizeProject({
    ...project,
    composition: {
      ...project.composition,
      scenes: project.composition.scenes.map((scene) => scene.id === sceneId ? {
        ...scene,
        name: input.name ?? scene.name,
        climate: {
          ...scene.climate,
          ...(input.climate ?? {})
        }
      } : scene)
    }
  });
}

export function addCompositionScene(
  project: NormalizedProjectFile,
  input: AddCompositionSceneInput = {}
): NormalizedProjectFile {
  const nextOrdinal = project.composition.scenes.length + 1;
  const sceneId = createUniqueSceneId(project, input.sceneId ?? `scene-region-${nextOrdinal}`);
  const scene: SceneDefinition = {
    id: sceneId,
    name: input.name ?? `Region ${nextOrdinal}`,
    climate: {
      atmosphere: 'default',
      pressure: 0.25,
      entropyBias: 0,
      cohesion: 0.5,
      memory: 0,
      volatility: 0,
      ...(input.climate ?? {})
    },
    activation: [
      {
        id: `activation-${sceneId}`,
        kind: 'timeline'
      }
    ],
    transitions: [],
    layerIds: [],
    archiveReferenceIds: []
  };

  return normalizeProject({
    ...project,
    composition: {
      ...project.composition,
      scenes: [...project.composition.scenes, scene]
    }
  });
}

export function removeCompositionScene(
  project: NormalizedProjectFile,
  sceneId: string
): NormalizedProjectFile {
  if (project.composition.scenes.length <= 1 || !project.composition.scenes.some((scene) => scene.id === sceneId)) {
    return project;
  }

  const removedLayerIds = new Set(
    project.composition.layers
      .filter((layer) => layer.sceneId === sceneId)
      .map((layer) => layer.id)
  );

  return normalizeProject({
    ...project,
    composition: {
      ...project.composition,
      acceptedArchiveReferences: project.composition.acceptedArchiveReferences.filter((reference) =>
        reference.scope.sceneId !== sceneId
        && (!reference.scope.layerId || !removedLayerIds.has(reference.scope.layerId))
        && !reference.targetIds.includes(sceneId)
        && !reference.targetIds.some((targetId) => removedLayerIds.has(targetId))
      ),
      rejectedArchiveReferences: project.composition.rejectedArchiveReferences.filter((reference) =>
        reference.scope.sceneId !== sceneId
        && (!reference.scope.layerId || !removedLayerIds.has(reference.scope.layerId))
        && !reference.targetIds.includes(sceneId)
        && !reference.targetIds.some((targetId) => removedLayerIds.has(targetId))
      ),
      spatialFields: project.composition.spatialFields.filter((field) =>
        field.scope?.sceneId !== sceneId
        && (!field.scope?.layerId || !removedLayerIds.has(field.scope.layerId))
      ),
      fieldGenerators: project.composition.fieldGenerators.filter((generator) =>
        generator.scope.sceneId !== sceneId
        && (!generator.scope.layerId || !removedLayerIds.has(generator.scope.layerId))
      ),
      scenes: project.composition.scenes
        .filter((scene) => scene.id !== sceneId)
        .map((scene) => ({
          ...scene,
          layerIds: scene.layerIds.filter((layerId) => !removedLayerIds.has(layerId)),
          transitions: scene.transitions.filter((transition) => transition.toSceneId !== sceneId)
        })),
      layers: project.composition.layers.filter((layer) => layer.sceneId !== sceneId),
      modulationRoutes: project.composition.modulationRoutes.filter((route) =>
        route.scope.sceneId !== sceneId
        && route.source.id !== sceneId
        && route.target.id !== sceneId
        && (!route.scope.layerId || !removedLayerIds.has(route.scope.layerId))
        && !removedLayerIds.has(route.source.id)
        && !removedLayerIds.has(route.target.id)
      ),
      entropyStates: project.composition.entropyStates.filter((state) =>
        state.scope.sceneId !== sceneId
        && state.source.id !== sceneId
        && state.target.id !== sceneId
        && (!state.scope.layerId || !removedLayerIds.has(state.scope.layerId))
        && !removedLayerIds.has(state.source.id)
        && !removedLayerIds.has(state.target.id)
      )
    }
  });
}

export function updateCompositionLayer(
  project: NormalizedProjectFile,
  layerId: string,
  input: UpdateCompositionLayerInput
): NormalizedProjectFile {
  const existingLayer = project.composition.layers.find((layer) => layer.id === layerId);
  if (!existingLayer || (input.sceneId && !project.composition.scenes.some((scene) => scene.id === input.sceneId))) {
    return project;
  }

  const targetSceneId = input.sceneId ?? existingLayer.sceneId;
  const sceneChanged = targetSceneId !== existingLayer.sceneId;

  return normalizeProject({
    ...project,
    composition: {
      ...project.composition,
      layers: project.composition.layers.map((layer) => layer.id === layerId ? {
        ...layer,
        name: input.name ?? layer.name,
        sceneId: targetSceneId,
        orderIndex: input.orderIndex ?? layer.orderIndex,
        mix: input.mix === undefined ? layer.mix : clampUnit(input.mix),
        renderIntent: {
          ...layer.renderIntent,
          ...(input.renderIntent ?? {})
        }
      } : layer),
      scenes: sceneChanged
        ? project.composition.scenes.map((scene) => {
          const withoutLayer = scene.layerIds.filter((candidateLayerId) => candidateLayerId !== layerId);

          return scene.id === targetSceneId ? {
            ...scene,
            layerIds: [...withoutLayer, layerId]
          } : {
            ...scene,
            layerIds: withoutLayer
          };
        })
        : project.composition.scenes
    }
  });
}

function pushMissingReference(issues: ProjectIntegrityIssue[], path: string, message: string): void {
  issues.push({
    code: 'missing-reference',
    path,
    message
  });
}

function collectReferencedAssetIds(project: NormalizedProjectFile, variant: Variant): string[] {
  return uniqueSorted([
    ...project.composition.assetIds,
    variant.musicAlignment?.primaryAssetId,
    ...variant.clips.flatMap((clip) => [
      clip.assetId,
      clip.overlayAssetId,
      clip.transitionAssetId,
      clip.transitionOverlayAssetId
    ]),
    ...project.composition.scenes.flatMap((scene) => scene.transitions.flatMap((transition) => [
      transition.maskAssetId,
      transition.overlayAssetId
    ])),
    ...project.composition.layers.map((layer) => layer.assetId)
  ]);
}

function collectArchiveReferenceIds(composition: NormalizedCompositionIdentity): string[] {
  return uniqueSorted([
    ...composition.scenes.flatMap((scene) => scene.archiveReferenceIds),
    ...composition.layers.flatMap((layer) => layer.archiveReferenceIds)
  ]);
}

function collectExportSelections(project: NormalizedProjectFile): ExportSelection[] {
  const selectionById = new Map(project.exportSelections.map((selection) => [selection.profileId, selection]));

  return project.composition.exportProfileIds
    .map((profileId) => selectionById.get(profileId))
    .filter((selection): selection is ExportSelection => selection !== undefined);
}

function resolveSequence(project: NormalizedProjectFile, sequenceId: string | undefined, diagnostics: ProjectIntegrityIssue[]): Sequence | undefined {
  const resolvedSequence = sequenceId
    ? getSequenceById(project, sequenceId)
    : getSequenceById(project, project.composition.sequenceId) ?? getDefaultSequence(project);

  if (!resolvedSequence) {
    pushMissingReference(
      diagnostics,
      'sequenceId',
      `Composition intent references missing sequence "${sequenceId ?? project.composition.sequenceId}".`
    );
  }

  return resolvedSequence;
}

function resolveVariant(
  project: NormalizedProjectFile,
  sequence: Sequence | undefined,
  variantId: string | undefined,
  sequenceWasOverridden: boolean,
  diagnostics: ProjectIntegrityIssue[]
): Variant | undefined {
  const resolvedVariant = variantId
    ? getVariantById(project, variantId)
    : sequence
      ? sequenceWasOverridden
        ? getDefaultVariant(project, sequence.id)
        : getVariantById(project, project.composition.variantId) ?? getDefaultVariant(project, sequence.id)
      : getVariantById(project, project.composition.variantId);

  if (!resolvedVariant) {
    pushMissingReference(
      diagnostics,
      'variantId',
      `Composition intent references missing variant "${variantId ?? project.composition.variantId}".`
    );
    return undefined;
  }

  if (sequence && (resolvedVariant.sequenceId !== sequence.id || !sequence.variantIds.includes(resolvedVariant.id))) {
    pushMissingReference(
      diagnostics,
      'variantId',
      `Composition intent references variant "${resolvedVariant.id}" outside sequence "${sequence.id}".`
    );
  }

  return resolvedVariant;
}

function resolveCaptureSession(project: NormalizedProjectFile, captureSessionId: string | undefined, captureLog: CaptureLog | undefined, diagnostics: ProjectIntegrityIssue[]): CaptureSession | undefined {
  const resolvedCaptureSessionId = captureSessionId ?? captureLog?.captureSessionId;
  if (!resolvedCaptureSessionId) {
    return undefined;
  }

  const captureSession = project.captureSessions.find((session) => session.id === resolvedCaptureSessionId);
  if (!captureSession) {
    pushMissingReference(
      diagnostics,
      'captureSessionId',
      `Composition intent references missing capture session "${resolvedCaptureSessionId}".`
    );
  }

  return captureSession;
}

function resolveCaptureLog(project: NormalizedProjectFile, captureLogId: string | undefined, captureSessionId: string | undefined, diagnostics: ProjectIntegrityIssue[]): CaptureLog | undefined {
  const captureLog = captureLogId
    ? project.captureLogs.find((log) => log.id === captureLogId)
    : captureSessionId
      ? project.captureLogs.find((log) => log.captureSessionId === captureSessionId)
      : undefined;

  if (captureLogId && !captureLog) {
    pushMissingReference(
      diagnostics,
      'captureLogId',
      `Composition intent references missing capture log "${captureLogId}".`
    );
  }

  return captureLog;
}

export function resolveCompositionIntent(input: ResolveCompositionIntentInput): ResolveCompositionIntentResult {
  const diagnostics = collectProjectIntegrityIssues(input.project, {
    availableArchiveIds: input.availableArchiveIds
  });
  const sequence = resolveSequence(input.project, input.sequenceId, diagnostics);
  const variant = resolveVariant(input.project, sequence, input.variantId, input.sequenceId !== undefined, diagnostics);
  const captureLog = resolveCaptureLog(input.project, input.captureLogId, input.captureSessionId, diagnostics);
  const captureSession = resolveCaptureSession(input.project, input.captureSessionId, captureLog, diagnostics);

  diagnostics.sort((left, right) => compareStrings(left.path, right.path) || compareStrings(left.message, right.message));
  if (diagnostics.length > 0 || !sequence || !variant) {
    return {
      ok: false,
      diagnostics
    };
  }

  return {
    ok: true,
    diagnostics: [],
    intent: {
      projectId: input.project.id,
      projectName: input.project.name,
      composition: input.project.composition,
      sequence,
      variant,
      referencedAssets: collectReferencedAssetIds(input.project, variant)
        .map((assetId) => getAssetById(input.project, assetId))
        .filter((asset): asset is MediaAsset => asset !== undefined),
      exportSelections: collectExportSelections(input.project),
      deterministicSeeds: input.project.composition.deterministicSeeds,
      scenes: input.project.composition.scenes,
      layers: input.project.composition.layers,
      modulationRoutes: input.project.composition.modulationRoutes,
      entropyStates: input.project.composition.entropyStates,
      captureSession,
      captureLog,
      archiveReferenceIds: collectArchiveReferenceIds(input.project.composition),
      acceptedArchiveReferences: input.project.composition.acceptedArchiveReferences
    }
  };
}
