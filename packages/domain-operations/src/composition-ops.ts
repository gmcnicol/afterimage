import {
  collectProjectIntegrityIssues,
  getAssetById,
  getDefaultSequence,
  getDefaultVariant,
  getSequenceById,
  getVariantById,
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

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined))]
    .sort(compareStrings);
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
