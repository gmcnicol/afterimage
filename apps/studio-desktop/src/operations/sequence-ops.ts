import {
  getCutCandidateById,
  getDefaultSequence,
  getDefaultVariant,
  getSequenceById,
  getVariantById,
  normalizeProject,
  type Marker,
  type MediaAsset,
  type NormalizedProjectFile,
  type Section,
  type SequenceClip,
  type TransitionStyle
} from '@afterimage/project-model';

function toSequenceName(name: string): string {
  return name.replace(/\bAssembly\b/g, 'Sequence');
}

export type SequenceBuildMode = 'balanced' | 'tight' | 'longer';

const MIN_BUILD_DURATION_MS: Record<SequenceBuildMode, number> = {
  tight: 800,
  balanced: 1200,
  longer: 2200
};

const TARGET_AVERAGE_CLIP_DURATION_MS: Record<SequenceBuildMode, number> = {
  tight: 1200,
  balanced: 2400,
  longer: 4200
};

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

function getMusicDurationMs(project: NormalizedProjectFile, variant: ReturnType<typeof getVariantById>) {
  const musicAssetId = variant?.musicAlignment?.primaryAssetId;
  if (!musicAssetId) {
    return undefined;
  }

  const durationMs = project.assets.find((asset) => asset.id === musicAssetId)?.durationMs;
  return typeof durationMs === 'number' && durationMs > 0 ? durationMs : undefined;
}

function getReviewedCuts(project: NormalizedProjectFile, mode: SequenceBuildMode = 'balanced') {
  const reviewedCuts = project.cutCandidates
    .filter((cut) => cut.status === 'kept' || cut.status === 'favorite' || cut.favorite);
  const minimumDurationMs = MIN_BUILD_DURATION_MS[mode];
  const filteredCuts = reviewedCuts.filter((cut) => cut.durationMs >= minimumDurationMs);
  const buildableCuts = filteredCuts.length > 0
    ? filteredCuts
    : reviewedCuts.filter((cut) => cut.durationMs >= Math.max(500, Math.round(minimumDurationMs * 0.75)));

  return buildableCuts
    .sort((left, right) => {
      const favoriteDelta = Number(Boolean(right.favorite || right.status === 'favorite')) - Number(Boolean(left.favorite || left.status === 'favorite'));
      if (favoriteDelta !== 0) {
        return favoriteDelta;
      }

      if (mode === 'tight') {
        return left.durationMs - right.durationMs
          || (right.sceneScore ?? 0) - (left.sceneScore ?? 0)
          || left.id.localeCompare(right.id);
      }

      if (mode === 'longer') {
        return right.durationMs - left.durationMs
          || (right.sceneScore ?? 0) - (left.sceneScore ?? 0)
          || left.id.localeCompare(right.id);
      }

      return (right.sceneScore ?? 0) - (left.sceneScore ?? 0)
        || right.durationMs - left.durationMs
        || left.id.localeCompare(right.id);
    });
}

function getBuildTargets(project: NormalizedProjectFile, variant: ReturnType<typeof getVariantById>, mode: SequenceBuildMode) {
  const existingClipCount = variant?.clips.length ?? 0;
  const existingDurationMs = variant?.clips.reduce((total, clip) => total + clip.durationMs, 0) ?? 0;
  const explicitDurationTargetMs = variant?.assistedGeneration?.durationTargetMs;
  const musicDurationMs = getMusicDurationMs(project, variant);
  const hasUsableExistingShape = existingClipCount > 0 && existingDurationMs > 5000 && (!musicDurationMs || existingDurationMs >= musicDurationMs * 0.5);
  const targetDurationMs = musicDurationMs && musicDurationMs > 0
    ? musicDurationMs
    : explicitDurationTargetMs && explicitDurationTargetMs > 0
      ? explicitDurationTargetMs
      : existingDurationMs > 0
        ? existingDurationMs
        : undefined;
  const estimatedClipCountFromMusic = musicDurationMs
    ? Math.max(1, Math.round(musicDurationMs / TARGET_AVERAGE_CLIP_DURATION_MS[mode]))
    : undefined;
  const targetClipCount = hasUsableExistingShape
    ? mode === 'tight'
      ? Math.max(1, Math.round(existingClipCount * 1.35))
      : mode === 'longer'
        ? Math.max(1, Math.round(existingClipCount * 0.75))
        : existingClipCount
    : estimatedClipCountFromMusic
      ?? (mode === 'tight'
        ? 18
        : mode === 'longer'
          ? 8
          : 12);

  return {
    targetClipCount,
    targetDurationMs
  };
}

function isFavoriteCut(cut: NormalizedProjectFile['cutCandidates'][number]) {
  return Boolean(cut.favorite || cut.status === 'favorite');
}

function getDistributedIndices(count: number, slots: number): number[] {
  if (count <= 0 || slots <= 0) {
    return [];
  }

  if (slots === 1) {
    return [Math.floor((count - 1) / 2)];
  }

  return Array.from({ length: slots }, (_, index) => Math.round((index * (count - 1)) / (slots - 1)));
}

function composeBuildSelection(
  favorites: ReturnType<typeof getReviewedCuts>,
  supportingCuts: ReturnType<typeof getReviewedCuts>,
  targetClipCount: number
) {
  const totalCount = Math.max(0, Math.min(targetClipCount, favorites.length + supportingCuts.length));
  if (totalCount === 0) {
    return [];
  }

  const favoriteQuota = supportingCuts.length === 0
    ? Math.min(favorites.length, totalCount)
    : Math.min(favorites.length, Math.max(1, Math.ceil(totalCount * 0.45)));
  const favoriteSlots = new Set(getDistributedIndices(totalCount, favoriteQuota));
  const favoriteQueue = favorites.slice(0, favoriteQuota);
  const supportQueue = [...supportingCuts];
  const fallbackQueue = favorites.slice(favoriteQuota);
  const selection: ReturnType<typeof getReviewedCuts> = [];

  for (let index = 0; index < totalCount; index += 1) {
    if (favoriteSlots.has(index) && favoriteQueue.length > 0) {
      selection.push(favoriteQueue.shift()!);
      continue;
    }

    if (supportQueue.length > 0) {
      selection.push(supportQueue.shift()!);
      continue;
    }

    if (favoriteQueue.length > 0) {
      selection.push(favoriteQueue.shift()!);
      continue;
    }

    if (fallbackQueue.length > 0) {
      selection.push(fallbackQueue.shift()!);
    }
  }

  return selection;
}

function selectReviewedCutsForBuild(project: NormalizedProjectFile, variant: ReturnType<typeof getVariantById>, mode: SequenceBuildMode) {
  const reviewedCuts = getReviewedCuts(project, mode);
  const { targetClipCount, targetDurationMs } = getBuildTargets(project, variant, mode);
  const favoriteCuts = reviewedCuts.filter((cut) => isFavoriteCut(cut));
  const supportingCuts = reviewedCuts.filter((cut) => !isFavoriteCut(cut));
  const selectedCuts = composeBuildSelection(favoriteCuts, supportingCuts, targetClipCount);

  if (!targetDurationMs) {
    return selectedCuts;
  }

  const selectedCutIds = new Set(selectedCuts.map((cut) => cut.id));
  const orderedCuts = [
    ...selectedCuts,
    ...reviewedCuts.filter((cut) => !selectedCutIds.has(cut.id))
  ];
  const anchorFavoriteIds = new Set(selectedCuts.filter((cut) => isFavoriteCut(cut)).map((cut) => cut.id));
  let accumulatedDurationMs = 0;
  const durationMatchedCuts: typeof reviewedCuts = [];
  let remainingAnchorFavorites = anchorFavoriteIds.size;

  for (const cut of orderedCuts) {
    durationMatchedCuts.push(cut);
    accumulatedDurationMs += cut.durationMs;
    if (anchorFavoriteIds.has(cut.id)) {
      remainingAnchorFavorites -= 1;
    }

    if (accumulatedDurationMs >= targetDurationMs && remainingAnchorFavorites <= 0) {
      break;
    }
  }

  return durationMatchedCuts.length > 0 ? durationMatchedCuts : selectedCuts;
}

function buildClipsFromReviewedCuts(project: NormalizedProjectFile, variant: ReturnType<typeof getVariantById>, mode: SequenceBuildMode) {
  const reviewedCuts = selectReviewedCutsForBuild(project, variant, mode);
  let timelineStartMs = 0;

  return reviewedCuts.map((cut) => {
    const clip: SequenceClip = {
      id: `clip-${cut.id}`,
      assetId: cut.assetId,
      cutId: cut.id,
      timelineStartMs,
      sourceStartMs: cut.startMs,
      durationMs: cut.durationMs,
      transition: 'cut',
      tags: [...(cut.tags ?? [])]
    };
    timelineStartMs += cut.durationMs;
    return clip;
  });
}

export function buildVariantFromReviewedCuts(project: NormalizedProjectFile, variantId: string, mode: SequenceBuildMode = 'balanced'): NormalizedProjectFile {
  const variant = getVariantById(project, variantId);
  if (!variant) {
    return project;
  }

  const clips = buildClipsFromReviewedCuts(project, variant, mode);
  const musicDurationMs = getMusicDurationMs(project, variant);

  return normalizeProject({
    ...project,
    variants: project.variants.map((candidate) => candidate.id === variantId ? {
      ...candidate,
      clips,
      markers: [],
      sections: [],
      assistedGeneration: {
        ...candidate.assistedGeneration,
        strategy: 'manual',
        sourcePoolIds: clips.map((clip) => clip.cutId ?? clip.id),
        durationTargetMs: musicDurationMs ?? clips.reduce((total, clip) => total + clip.durationMs, 0)
      }
    } : candidate)
  });
}

export function buildNewVariantFromReviewedCuts(project: NormalizedProjectFile, variantId: string, mode: SequenceBuildMode = 'balanced'): NormalizedProjectFile {
  const variant = getVariantById(project, variantId);
  if (!variant) {
    return project;
  }

  const duplicateId = `${variant.id}-build-${Date.now()}`;
  const clips = buildClipsFromReviewedCuts(project, variant, mode);
  const musicDurationMs = getMusicDurationMs(project, variant);
  const duplicate = {
    ...variant,
    id: duplicateId,
    name: `${toSequenceName(variant.name)} Build`,
    favorite: false,
    clips,
    markers: [],
    sections: [],
    assistedGeneration: {
      ...variant.assistedGeneration,
      strategy: 'manual' as const,
      sourcePoolIds: clips.map((clip) => clip.cutId ?? clip.id),
      durationTargetMs: musicDurationMs ?? clips.reduce((total, clip) => total + clip.durationMs, 0)
    }
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

export function removeClip(project: NormalizedProjectFile, variantId: string, clipId: string): NormalizedProjectFile {
  const variant = getVariantById(project, variantId);
  if (!variant) {
    return project;
  }

  const remaining = variant.clips.filter((clip) => clip.id !== clipId);
  if (remaining.length === variant.clips.length) {
    return project;
  }

  let timelineStartMs = 0;
  const resequenced = remaining.map((clip, index, clips) => {
    const isLastClip = index === clips.length - 1;
    const nextClip = {
      ...clip,
      timelineStartMs
    };

    timelineStartMs += clip.durationMs;

    if (!isLastClip || clip.transition !== 'mask') {
      return nextClip;
    }

    return {
      ...nextClip,
      transition: 'cut' as const,
      transitionDurationMs: undefined,
      transitionAssetId: undefined,
      transitionOverlayAssetId: undefined
    };
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

export function setClipTransition(
  project: NormalizedProjectFile,
  variantId: string,
  clipId: string,
  transition: TransitionStyle
): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    variants: project.variants.map((variant) => variant.id === variantId ? {
      ...variant,
      clips: variant.clips.map((clip) => {
        if (clip.id !== clipId) {
          return clip;
        }

        if (transition === 'cut') {
          return {
            ...clip,
            transition,
            transitionDurationMs: undefined,
            transitionAssetId: undefined,
            transitionOverlayAssetId: undefined
          };
        }

        return {
          ...clip,
          transition,
          transitionDurationMs: Math.max(100, clip.transitionDurationMs ?? 600),
          transitionAssetId: transition === 'mask' ? clip.transitionAssetId : undefined,
          transitionOverlayAssetId: transition === 'mask' ? clip.transitionOverlayAssetId : undefined
        };
      })
    } : variant)
  });
}

export function setClipTransitionDuration(
  project: NormalizedProjectFile,
  variantId: string,
  clipId: string,
  durationMs: number
): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    variants: project.variants.map((variant) => variant.id === variantId ? {
      ...variant,
      clips: variant.clips.map((clip) => clip.id === clipId ? {
        ...clip,
        transitionDurationMs: Math.max(100, durationMs)
      } : clip)
    } : variant)
  });
}

export function setClipTransitionAsset(
  project: NormalizedProjectFile,
  variantId: string,
  clipId: string,
  assetId?: string
): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    variants: project.variants.map((variant) => variant.id === variantId ? {
      ...variant,
      clips: variant.clips.map((clip) => clip.id === clipId ? {
        ...clip,
        transitionAssetId: assetId || undefined
      } : clip)
    } : variant)
  });
}

export function setClipTransitionOverlayAsset(
  project: NormalizedProjectFile,
  variantId: string,
  clipId: string,
  assetId?: string
): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    variants: project.variants.map((variant) => variant.id === variantId ? {
      ...variant,
      clips: variant.clips.map((clip) => clip.id === clipId ? {
        ...clip,
        transitionOverlayAssetId: assetId || undefined
      } : clip)
    } : variant)
  });
}

export function setClipOverlayAsset(
  project: NormalizedProjectFile,
  variantId: string,
  clipId: string,
  assetId?: string
): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    variants: project.variants.map((variant) => variant.id === variantId ? {
      ...variant,
      clips: variant.clips.map((clip) => clip.id === clipId ? {
        ...clip,
        overlayAssetId: assetId || undefined
      } : clip)
    } : variant)
  });
}

function getFoundryTransitionAssets(assets: MediaAsset[], kind: 'mask' | 'overlay'): MediaAsset[] {
  const explicitRole = kind === 'mask' ? 'transition-mask' : 'transition-overlay';
  const matches = assets.filter((asset) => asset.mediaType === 'video' && asset.assetRole === explicitRole);

  return matches;
}

export function randomizeFoundryTransitions(
  project: NormalizedProjectFile,
  variantId: string,
  rng: () => number = Math.random
): NormalizedProjectFile {
  const variant = getVariantById(project, variantId);
  if (!variant || variant.clips.length < 2) {
    return project;
  }

  const maskAssets = getFoundryTransitionAssets(project.assets, 'mask');
  if (maskAssets.length === 0) {
    return project;
  }

  return normalizeProject({
    ...project,
    variants: project.variants.map((candidate) => candidate.id === variantId ? {
      ...candidate,
      clips: candidate.clips.map((clip, index, clips) => {
        if (index >= clips.length - 1) {
          return {
            ...clip,
            transition: 'cut',
            transitionDurationMs: undefined,
            transitionAssetId: undefined,
            transitionOverlayAssetId: undefined
          };
        }

        const nextClip = clips[index + 1];
        const maskAsset = maskAssets[Math.floor(rng() * maskAssets.length)];
        const durationMs = Math.max(
          250,
          Math.min(maskAsset.durationMs ?? 750, clip.durationMs, nextClip.durationMs)
        );

        return {
          ...clip,
          transition: 'mask',
          transitionDurationMs: durationMs,
          transitionAssetId: maskAsset.id,
          transitionOverlayAssetId: undefined
        };
      })
    } : candidate)
  });
}

export function randomizeFoundryOverlays(
  project: NormalizedProjectFile,
  variantId: string,
  rng: () => number = Math.random
): NormalizedProjectFile {
  const variant = getVariantById(project, variantId);
  if (!variant || variant.clips.length === 0) {
    return project;
  }

  const overlayAssets = getFoundryTransitionAssets(project.assets, 'overlay');
  if (overlayAssets.length === 0) {
    return project;
  }

  return normalizeProject({
    ...project,
    variants: project.variants.map((candidate) => candidate.id === variantId ? {
      ...candidate,
      clips: candidate.clips.map((clip) => {
        const overlayAsset = overlayAssets[Math.floor(rng() * overlayAssets.length)];
        return {
          ...clip,
          overlayAssetId: overlayAsset.id
        };
      })
    } : candidate)
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
    name: `${toSequenceName(variant.name)} Copy`,
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

export function deleteVariant(project: NormalizedProjectFile, variantId: string): NormalizedProjectFile {
  const variant = getVariantById(project, variantId);
  if (!variant) {
    return project;
  }

  const sequence = getSequenceById(project, variant.sequenceId);
  if (!sequence || sequence.variantIds.length <= 1) {
    return project;
  }

  const remainingVariantIds = sequence.variantIds.filter((candidateId) => candidateId !== variantId);
  const nextDefaultVariantId = sequence.defaultVariantId === variantId
    ? remainingVariantIds[0]
    : sequence.defaultVariantId;

  return normalizeProject({
    ...project,
    variants: project.variants.filter((candidate) => candidate.id !== variantId),
    sequences: project.sequences.map((candidate) => candidate.id === sequence.id ? {
      ...candidate,
      variantIds: remainingVariantIds,
      defaultVariantId: nextDefaultVariantId
    } : candidate)
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

export function applySyncMarkers(
  project: NormalizedProjectFile,
  variantId: string,
  markers: Marker[]
): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    variants: project.variants.map((variant) => variant.id === variantId ? {
      ...variant,
      markers: [
        ...(variant.markers ?? []).filter((marker) => !marker.id.startsWith('sync-marker-')),
        ...markers
      ]
    } : variant)
  });
}
