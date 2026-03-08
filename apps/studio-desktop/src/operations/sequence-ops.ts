import {
  getCutCandidateById,
  getDefaultSequence,
  getDefaultVariant,
  getSequenceById,
  getVariantById,
  normalizeProject,
  type Marker,
  type NormalizedProjectFile,
  type Section,
  type SequenceClip
} from '@afterimage/project-model';

export function addCutToSequence(
  project: NormalizedProjectFile,
  cutId: string,
  options: { sequenceId?: string; variantId?: string } = {}
): NormalizedProjectFile {
  const cut = getCutCandidateById(project, cutId);
  const sequence = options.sequenceId ? getSequenceById(project, options.sequenceId) : getDefaultSequence(project);
  const variant = options.variantId ? getVariantById(project, options.variantId) : (sequence ? getDefaultVariant(project, sequence.id) : undefined);

  if (!cut || !sequence || !variant) {
    return project;
  }

  const nextClip: SequenceClip = {
    id: `clip-${cut.id}`,
    assetId: cut.assetId,
    cutId: cut.id,
    timelineStartMs: variant.clips.reduce((max, clip) => Math.max(max, clip.timelineStartMs + clip.durationMs), 0),
    sourceStartMs: cut.startMs,
    durationMs: cut.durationMs,
    transition: 'cut',
    tags: [...(cut.tags ?? [])]
  };

  return normalizeProject({
    ...project,
    variants: project.variants.map((candidate) => candidate.id === variant.id ? {
      ...candidate,
      clips: [...candidate.clips, nextClip]
    } : candidate)
  });
}

export function moveClip(project: NormalizedProjectFile, variantId: string, clipId: string, direction: -1 | 1): NormalizedProjectFile {
  const variant = getVariantById(project, variantId);
  if (!variant) {
    return project;
  }

  const clips = [...variant.clips];
  const index = clips.findIndex((clip) => clip.id === clipId);
  const swapIndex = index + direction;

  if (index < 0 || swapIndex < 0 || swapIndex >= clips.length) {
    return project;
  }

  [clips[index], clips[swapIndex]] = [clips[swapIndex], clips[index]];
  let timelineStartMs = 0;
  const resequenced = clips.map((clip) => {
    const nextClip = {
      ...clip,
      timelineStartMs
    };
    timelineStartMs += clip.durationMs;
    return nextClip;
  });

  return normalizeProject({
    ...project,
    variants: project.variants.map((candidate) => candidate.id === variantId ? {
      ...candidate,
      clips: resequenced
    } : candidate)
  });
}

export function trimClip(project: NormalizedProjectFile, variantId: string, clipId: string, deltaMs: number): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    variants: project.variants.map((variant) => variant.id === variantId ? {
      ...variant,
      clips: variant.clips.map((clip) => clip.id === clipId ? {
        ...clip,
        durationMs: Math.max(250, clip.durationMs + deltaMs)
      } : clip)
    } : variant)
  });
}

export function duplicateVariant(project: NormalizedProjectFile, variantId: string): NormalizedProjectFile {
  const variant = getVariantById(project, variantId);
  if (!variant) {
    return project;
  }

  const duplicateId = `${variant.id}-copy`;
  const duplicate = {
    ...variant,
    id: duplicateId,
    name: `${variant.name} Copy`,
    favorite: false,
    clips: variant.clips.map((clip) => ({
      ...clip,
      id: `${clip.id}-copy`
    })),
    markers: (variant.markers ?? []).map((marker) => ({
      ...marker,
      id: `${marker.id}-copy`
    })),
    sections: (variant.sections ?? []).map((section) => ({
      ...section,
      id: `${section.id}-copy`
    }))
  };

  return normalizeProject({
    ...project,
    variants: [...project.variants, duplicate],
    sequences: project.sequences.map((sequence) => sequence.id === variant.sequenceId ? {
      ...sequence,
      variantIds: [...sequence.variantIds, duplicateId]
    } : sequence)
  });
}

export function addMarker(project: NormalizedProjectFile, variantId: string, marker: Marker): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    variants: project.variants.map((variant) => variant.id === variantId ? {
      ...variant,
      markers: [...(variant.markers ?? []), marker]
    } : variant)
  });
}

export function addSection(project: NormalizedProjectFile, variantId: string, section: Section): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    variants: project.variants.map((variant) => variant.id === variantId ? {
      ...variant,
      sections: [...(variant.sections ?? []), section]
    } : variant)
  });
}
