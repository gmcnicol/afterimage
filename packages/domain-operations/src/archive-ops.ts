import {
  collectArchiveIntegrityIssues,
  normalizeProject,
  slugify,
  type ArchiveAcceptanceScope,
  type ArchiveMetadataFile,
  type ArchiveReferenceKind,
  type CompositionAcceptedArchiveReference,
  type CompositionRejectedArchiveReference,
  type NormalizedArchiveMetadataFile,
  type NormalizedProjectFile
} from '@afterimage/project-model';

export interface ArchiveReferenceInput {
  targetIds?: string[];
  scope?: ArchiveAcceptanceScope;
  note?: string;
  sidecarContentId?: string;
}

export interface ArchiveAcceptanceResult {
  project: NormalizedProjectFile;
  reference: CompositionAcceptedArchiveReference;
  created: boolean;
}

export interface ArchiveRejectionResult {
  project: NormalizedProjectFile;
  reference: CompositionRejectedArchiveReference;
  created: boolean;
}

export type ArchiveDiagnosticSeverity = 'warning' | 'export-blocker';

export type ArchiveDiagnosticCode =
  | 'archive-integrity'
  | 'changed-generator-identity'
  | 'incompatible-schema-version'
  | 'missing-accepted-target'
  | 'missing-archive-item'
  | 'missing-rights-license'
  | 'missing-sidecar'
  | 'missing-source-asset'
  | 'stale-sidecar'
  | 'unresolved-external-source-id';

export interface ArchiveDiagnostic {
  code: ArchiveDiagnosticCode;
  severity: ArchiveDiagnosticSeverity;
  path: string;
  message: string;
}

export interface CollectArchiveDiagnosticsInput {
  project: NormalizedProjectFile;
  archives?: Array<NormalizedArchiveMetadataFile | ArchiveMetadataFile>;
  publishable?: boolean;
}

const archiveKindCollections = {
  segment: 'segments',
  motif: 'motifs',
  atmosphere: 'atmospheres',
  material: 'materials',
  motion: 'motion',
  'behaviour-seed': 'behaviourSeeds',
  recurrence: 'recurrence',
  affinity: 'affinity'
} as const satisfies Record<ArchiveReferenceKind, keyof NormalizedArchiveMetadataFile>;

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function normalizeArchiveLike(archive: NormalizedArchiveMetadataFile | ArchiveMetadataFile): NormalizedArchiveMetadataFile {
  return {
    ...archive,
    segments: archive.segments ?? [],
    motifs: archive.motifs ?? [],
    atmospheres: archive.atmospheres ?? [],
    materials: archive.materials ?? [],
    motion: archive.motion ?? [],
    behaviourSeeds: archive.behaviourSeeds ?? [],
    recurrence: archive.recurrence ?? [],
    affinity: archive.affinity ?? []
  };
}

export function getArchiveSidecarContentId(archive: Pick<ArchiveMetadataFile, 'id' | 'version' | 'generatedAt' | 'provenance'>): string {
  return [
    archive.id,
    `v${archive.version}`,
    archive.generatedAt ?? 'undated',
    archive.provenance.generator ?? 'unknown-generator',
    archive.provenance.generatorVersion ?? 'unknown-version'
  ].join(':');
}

function resolveScope(project: NormalizedProjectFile, scope: ArchiveAcceptanceScope | undefined): ArchiveAcceptanceScope {
  return scope ?? { compositionId: project.composition.id };
}

function scopeTargetIds(scope: ArchiveAcceptanceScope): string[] {
  return [
    scope.compositionId,
    scope.sequenceId,
    scope.variantId,
    scope.sceneId,
    scope.layerId,
    scope.clipId
  ].filter((value): value is string => value !== undefined);
}

function normalizeTargetIds(inputTargetIds: string[] | undefined, scope: ArchiveAcceptanceScope): string[] {
  return [...new Set(inputTargetIds ?? scopeTargetIds(scope))].sort(compareStrings);
}

function buildReferenceId(prefix: 'accepted' | 'rejected', archiveId: string, kind: ArchiveReferenceKind, archiveItemId: string, scope: ArchiveAcceptanceScope, targetIds: string[]): string {
  const scopeKey = [
    scope.compositionId,
    scope.sequenceId,
    scope.variantId,
    scope.sceneId,
    scope.layerId,
    scope.clipId
  ].filter(Boolean).join('-') || 'global';
  const targetKey = targetIds.length > 0 ? targetIds.join('-') : 'untargeted';

  return slugify(`${prefix}-${archiveId}-${kind}-${archiveItemId}-${scopeKey}-${targetKey}`) || `${prefix}-${archiveItemId}`;
}

function archiveCandidateExists(archive: NormalizedArchiveMetadataFile, kind: ArchiveReferenceKind, candidateId: string): boolean {
  const collection = archive[archiveKindCollections[kind]];
  return Array.isArray(collection) && collection.some((candidate) => candidate.id === candidateId);
}

function buildReferenceBase(
  project: NormalizedProjectFile,
  archive: NormalizedArchiveMetadataFile,
  kind: ArchiveReferenceKind,
  candidateId: string,
  input: ArchiveReferenceInput,
  prefix: 'accepted' | 'rejected'
): CompositionAcceptedArchiveReference {
  if (!archiveCandidateExists(archive, kind, candidateId)) {
    throw new Error(`Archive ${kind} candidate "${candidateId}" was not found in sidecar "${archive.id}".`);
  }

  const scope = resolveScope(project, input.scope);
  const targetIds = normalizeTargetIds(input.targetIds, scope);
  const sidecarContentId = input.sidecarContentId ?? getArchiveSidecarContentId(archive);

  return {
    id: buildReferenceId(prefix, archive.id, kind, candidateId, scope, targetIds),
    archiveId: archive.id,
    archiveItemId: candidateId,
    sourceAssetId: archive.sourceAssetId,
    sidecarVersion: archive.version,
    sidecarContentId,
    referenceKind: kind,
    targetIds,
    scope,
    generator: archive.provenance.generator,
    generatorVersion: archive.provenance.generatorVersion,
    note: input.note
  };
}

function sameScope(left: ArchiveAcceptanceScope, right: ArchiveAcceptanceScope): boolean {
  return left.compositionId === right.compositionId
    && left.sequenceId === right.sequenceId
    && left.variantId === right.variantId
    && left.sceneId === right.sceneId
    && left.layerId === right.layerId
    && left.clipId === right.clipId;
}

function sameStringSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function findExistingAcceptedReference(project: NormalizedProjectFile, reference: CompositionAcceptedArchiveReference): CompositionAcceptedArchiveReference | undefined {
  return project.composition.acceptedArchiveReferences.find((candidate) => candidate.archiveId === reference.archiveId
    && candidate.archiveItemId === reference.archiveItemId
    && candidate.referenceKind === reference.referenceKind
    && candidate.sourceAssetId === reference.sourceAssetId
    && candidate.sidecarVersion === reference.sidecarVersion
    && candidate.sidecarContentId === reference.sidecarContentId
    && sameScope(candidate.scope, reference.scope)
    && sameStringSet(candidate.targetIds, reference.targetIds));
}

function findExistingRejectedReference(project: NormalizedProjectFile, reference: CompositionRejectedArchiveReference): CompositionRejectedArchiveReference | undefined {
  return project.composition.rejectedArchiveReferences.find((candidate) => candidate.archiveId === reference.archiveId
    && candidate.archiveItemId === reference.archiveItemId
    && candidate.referenceKind === reference.referenceKind
    && candidate.sourceAssetId === reference.sourceAssetId
    && candidate.sidecarVersion === reference.sidecarVersion
    && candidate.sidecarContentId === reference.sidecarContentId
    && sameScope(candidate.scope, reference.scope)
    && sameStringSet(candidate.targetIds, reference.targetIds));
}

function acceptArchiveCandidate(project: NormalizedProjectFile, archive: ArchiveMetadataFile, kind: ArchiveReferenceKind, candidateId: string, input: ArchiveReferenceInput = {}): ArchiveAcceptanceResult {
  const normalizedArchive = normalizeArchiveLike(archive);
  const reference = buildReferenceBase(project, normalizedArchive, kind, candidateId, input, 'accepted');
  const existing = findExistingAcceptedReference(project, reference);

  if (existing) {
    return {
      project,
      reference: existing,
      created: false
    };
  }

  return {
    project: normalizeProject({
      ...project,
      composition: {
        ...project.composition,
        acceptedArchiveReferences: [
          ...project.composition.acceptedArchiveReferences,
          reference
        ]
      }
    }),
    reference,
    created: true
  };
}

function rejectArchiveCandidate(project: NormalizedProjectFile, archive: ArchiveMetadataFile, kind: ArchiveReferenceKind, candidateId: string, input: ArchiveReferenceInput = {}): ArchiveRejectionResult {
  const normalizedArchive = normalizeArchiveLike(archive);
  const reference = buildReferenceBase(project, normalizedArchive, kind, candidateId, input, 'rejected');
  const existing = findExistingRejectedReference(project, reference);

  if (existing) {
    return {
      project,
      reference: existing,
      created: false
    };
  }

  return {
    project: normalizeProject({
      ...project,
      composition: {
        ...project.composition,
        rejectedArchiveReferences: [
          ...project.composition.rejectedArchiveReferences,
          reference
        ]
      }
    }),
    reference,
    created: true
  };
}

export function acceptArchiveSegmentCandidate(project: NormalizedProjectFile, archive: ArchiveMetadataFile, candidateId: string, input?: ArchiveReferenceInput): ArchiveAcceptanceResult {
  return acceptArchiveCandidate(project, archive, 'segment', candidateId, input);
}

export function rejectArchiveSegmentCandidate(project: NormalizedProjectFile, archive: ArchiveMetadataFile, candidateId: string, input?: ArchiveReferenceInput): ArchiveRejectionResult {
  return rejectArchiveCandidate(project, archive, 'segment', candidateId, input);
}

export function acceptArchiveMotifCandidate(project: NormalizedProjectFile, archive: ArchiveMetadataFile, candidateId: string, input?: ArchiveReferenceInput): ArchiveAcceptanceResult {
  return acceptArchiveCandidate(project, archive, 'motif', candidateId, input);
}

export function rejectArchiveMotifCandidate(project: NormalizedProjectFile, archive: ArchiveMetadataFile, candidateId: string, input?: ArchiveReferenceInput): ArchiveRejectionResult {
  return rejectArchiveCandidate(project, archive, 'motif', candidateId, input);
}

export function acceptArchiveAtmosphereCandidate(project: NormalizedProjectFile, archive: ArchiveMetadataFile, candidateId: string, input?: ArchiveReferenceInput): ArchiveAcceptanceResult {
  return acceptArchiveCandidate(project, archive, 'atmosphere', candidateId, input);
}

export function rejectArchiveAtmosphereCandidate(project: NormalizedProjectFile, archive: ArchiveMetadataFile, candidateId: string, input?: ArchiveReferenceInput): ArchiveRejectionResult {
  return rejectArchiveCandidate(project, archive, 'atmosphere', candidateId, input);
}

export function acceptArchiveMaterialCandidate(project: NormalizedProjectFile, archive: ArchiveMetadataFile, candidateId: string, input?: ArchiveReferenceInput): ArchiveAcceptanceResult {
  return acceptArchiveCandidate(project, archive, 'material', candidateId, input);
}

export function rejectArchiveMaterialCandidate(project: NormalizedProjectFile, archive: ArchiveMetadataFile, candidateId: string, input?: ArchiveReferenceInput): ArchiveRejectionResult {
  return rejectArchiveCandidate(project, archive, 'material', candidateId, input);
}

export function acceptArchiveMotionCandidate(project: NormalizedProjectFile, archive: ArchiveMetadataFile, candidateId: string, input?: ArchiveReferenceInput): ArchiveAcceptanceResult {
  return acceptArchiveCandidate(project, archive, 'motion', candidateId, input);
}

export function rejectArchiveMotionCandidate(project: NormalizedProjectFile, archive: ArchiveMetadataFile, candidateId: string, input?: ArchiveReferenceInput): ArchiveRejectionResult {
  return rejectArchiveCandidate(project, archive, 'motion', candidateId, input);
}

export function acceptArchiveBehaviourSeedCandidate(project: NormalizedProjectFile, archive: ArchiveMetadataFile, candidateId: string, input?: ArchiveReferenceInput): ArchiveAcceptanceResult {
  return acceptArchiveCandidate(project, archive, 'behaviour-seed', candidateId, input);
}

export function rejectArchiveBehaviourSeedCandidate(project: NormalizedProjectFile, archive: ArchiveMetadataFile, candidateId: string, input?: ArchiveReferenceInput): ArchiveRejectionResult {
  return rejectArchiveCandidate(project, archive, 'behaviour-seed', candidateId, input);
}

export function acceptArchiveRecurrenceCandidate(project: NormalizedProjectFile, archive: ArchiveMetadataFile, candidateId: string, input?: ArchiveReferenceInput): ArchiveAcceptanceResult {
  return acceptArchiveCandidate(project, archive, 'recurrence', candidateId, input);
}

export function rejectArchiveRecurrenceCandidate(project: NormalizedProjectFile, archive: ArchiveMetadataFile, candidateId: string, input?: ArchiveReferenceInput): ArchiveRejectionResult {
  return rejectArchiveCandidate(project, archive, 'recurrence', candidateId, input);
}

export function acceptArchiveAffinityCandidate(project: NormalizedProjectFile, archive: ArchiveMetadataFile, candidateId: string, input?: ArchiveReferenceInput): ArchiveAcceptanceResult {
  return acceptArchiveCandidate(project, archive, 'affinity', candidateId, input);
}

export function rejectArchiveAffinityCandidate(project: NormalizedProjectFile, archive: ArchiveMetadataFile, candidateId: string, input?: ArchiveReferenceInput): ArchiveRejectionResult {
  return rejectArchiveCandidate(project, archive, 'affinity', candidateId, input);
}

function getProjectTargetIds(project: NormalizedProjectFile): Set<string> {
  return new Set([
    project.composition.id,
    ...project.assets.map((asset) => asset.id),
    ...project.sequences.map((sequence) => sequence.id),
    ...project.variants.map((variant) => variant.id),
    ...project.composition.scenes.map((scene) => scene.id),
    ...project.composition.layers.map((layer) => layer.id),
    ...project.variants.flatMap((variant) => variant.clips.map((clip) => clip.id))
  ]);
}

function archiveHasItem(archive: NormalizedArchiveMetadataFile, reference: CompositionAcceptedArchiveReference): boolean {
  return archiveCandidateExists(archive, reference.referenceKind, reference.archiveItemId);
}

function pushDiagnostic(diagnostics: ArchiveDiagnostic[], diagnostic: ArchiveDiagnostic): void {
  diagnostics.push(diagnostic);
}

export function collectArchiveDiagnostics(input: CollectArchiveDiagnosticsInput): ArchiveDiagnostic[] {
  const archives = new Map((input.archives ?? []).map((archive) => {
    const normalized = normalizeArchiveLike(archive);
    return [normalized.id, normalized] as const;
  }));
  const assetIds = new Set(input.project.assets.map((asset) => asset.id));
  const targetIds = getProjectTargetIds(input.project);
  const diagnostics: ArchiveDiagnostic[] = [];

  for (const archive of archives.values()) {
    if (!assetIds.has(archive.sourceAssetId)) {
      pushDiagnostic(diagnostics, {
        code: 'unresolved-external-source-id',
        severity: 'warning',
        path: `archives.${archive.id}.sourceAssetId`,
        message: `Archive "${archive.id}" references unresolved source asset "${archive.sourceAssetId}".`
      });
    }
    for (const issue of collectArchiveIntegrityIssues(archive)) {
      pushDiagnostic(diagnostics, {
        code: 'archive-integrity',
        severity: 'warning',
        path: `archives.${archive.id}.${issue.path}`,
        message: issue.message
      });
    }
  }

  for (const reference of input.project.composition.acceptedArchiveReferences) {
    const path = `composition.acceptedArchiveReferences.${reference.id}`;
    const archive = archives.get(reference.archiveId);

    if (!assetIds.has(reference.sourceAssetId)) {
      pushDiagnostic(diagnostics, {
        code: 'missing-source-asset',
        severity: 'warning',
        path: `${path}.sourceAssetId`,
        message: `Accepted archive reference "${reference.id}" references missing source asset "${reference.sourceAssetId}".`
      });
    }
    for (const targetId of reference.targetIds) {
      if (!targetIds.has(targetId)) {
        pushDiagnostic(diagnostics, {
          code: 'missing-accepted-target',
          severity: 'warning',
          path: `${path}.targetIds`,
          message: `Accepted archive reference "${reference.id}" references missing target "${targetId}".`
        });
      }
    }
    if (!archive) {
      pushDiagnostic(diagnostics, {
        code: 'missing-sidecar',
        severity: 'warning',
        path: `${path}.archiveId`,
        message: `Accepted archive reference "${reference.id}" is missing sidecar "${reference.archiveId}".`
      });
      continue;
    }
    if (archive.version !== 1 || reference.sidecarVersion !== archive.version) {
      pushDiagnostic(diagnostics, {
        code: 'incompatible-schema-version',
        severity: 'export-blocker',
        path: `${path}.sidecarVersion`,
        message: `Accepted archive reference "${reference.id}" targets sidecar version ${reference.sidecarVersion}, but archive "${archive.id}" is version ${archive.version}.`
      });
    }
    if (reference.sidecarContentId !== getArchiveSidecarContentId(archive)) {
      pushDiagnostic(diagnostics, {
        code: 'stale-sidecar',
        severity: 'warning',
        path: `${path}.sidecarContentId`,
        message: `Accepted archive reference "${reference.id}" was accepted from stale sidecar content.`
      });
    }
    if (reference.generator !== archive.provenance.generator || reference.generatorVersion !== archive.provenance.generatorVersion) {
      pushDiagnostic(diagnostics, {
        code: 'changed-generator-identity',
        severity: 'warning',
        path: `${path}.generator`,
        message: `Accepted archive reference "${reference.id}" was generated by a different archive generator identity.`
      });
    }
    if (!archiveHasItem(archive, reference)) {
      pushDiagnostic(diagnostics, {
        code: 'missing-archive-item',
        severity: 'warning',
        path: `${path}.archiveItemId`,
        message: `Accepted archive reference "${reference.id}" references missing archive item "${reference.archiveItemId}".`
      });
    }
    if (input.publishable && (!archive.provenance.rightsStatus || !archive.provenance.license)) {
      pushDiagnostic(diagnostics, {
        code: 'missing-rights-license',
        severity: 'export-blocker',
        path: `archives.${archive.id}.provenance`,
        message: `Archive "${archive.id}" is missing rights or license provenance required for publishable accepted references.`
      });
    }
  }

  return diagnostics.sort((left, right) => compareStrings(left.path, right.path) || compareStrings(left.message, right.message));
}
