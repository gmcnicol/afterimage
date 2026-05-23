import type {
  ArchiveAcceptanceScope,
  ArchiveReferenceKind,
  NormalizedProjectFile
} from '@afterimage/project-model';

export type ArchiveCandidateState = 'accepted' | 'rejected' | 'candidate';

export interface ArchiveCandidateIdentity {
  archiveId: string;
  referenceKind: ArchiveReferenceKind;
  candidateId: string;
  targetIds?: string[];
}

export interface ArchiveTargetOption {
  id: string;
  label: string;
  targetIds: string[];
  scope: ArchiveAcceptanceScope;
}

function targetMatches(referenceTargetIds: string[], requestedTargetIds?: string[]): boolean {
  if (!requestedTargetIds || requestedTargetIds.length === 0) {
    return true;
  }
  return requestedTargetIds.every((targetId) => referenceTargetIds.includes(targetId));
}

export function classifyArchiveCandidateState(project: NormalizedProjectFile, identity: ArchiveCandidateIdentity): ArchiveCandidateState {
  const accepted = project.composition.acceptedArchiveReferences.some((reference) => reference.archiveId === identity.archiveId
    && reference.archiveItemId === identity.candidateId
    && reference.referenceKind === identity.referenceKind
    && targetMatches(reference.targetIds, identity.targetIds));

  if (accepted) {
    return 'accepted';
  }

  const rejected = project.composition.rejectedArchiveReferences.some((reference) => reference.archiveId === identity.archiveId
    && reference.archiveItemId === identity.candidateId
    && reference.referenceKind === identity.referenceKind
    && targetMatches(reference.targetIds, identity.targetIds));

  return rejected ? 'rejected' : 'candidate';
}

export function buildArchiveTargetOptions(project: NormalizedProjectFile): ArchiveTargetOption[] {
  const compositionId = project.composition.id;
  const sceneOptions = project.composition.scenes.map((scene) => ({
    id: `scene:${scene.id}`,
    label: `Scene: ${scene.name}`,
    targetIds: [scene.id],
    scope: {
      compositionId,
      sceneId: scene.id
    }
  }));
  const layerOptions = project.composition.layers.map((layer) => ({
    id: `layer:${layer.id}`,
    label: `Layer: ${layer.name}`,
    targetIds: [layer.id],
    scope: {
      compositionId,
      sceneId: layer.sceneId,
      layerId: layer.id
    }
  }));
  const clipOptions = project.variants.flatMap((variant) => variant.clips.map((clip) => ({
    id: `clip:${variant.id}:${clip.id}`,
    label: `Clip: ${variant.name} / ${clip.id}`,
    targetIds: [clip.id],
    scope: {
      compositionId,
      sequenceId: variant.sequenceId,
      variantId: variant.id,
      clipId: clip.id
    }
  })));

  return [
    {
      id: `composition:${compositionId}`,
      label: `Composition: ${project.composition.name}`,
      targetIds: [compositionId],
      scope: {
        compositionId
      }
    },
    ...sceneOptions,
    ...layerOptions,
    ...clipOptions
  ];
}

export function getArchiveCandidateStateLabel(state: ArchiveCandidateState): string {
  switch (state) {
    case 'accepted':
      return 'Accepted';
    case 'rejected':
      return 'Rejected';
    case 'candidate':
      return 'Candidate';
  }
}
