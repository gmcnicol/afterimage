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

type ReviewedCutCandidate = NormalizedProjectFile['cutCandidates'][number];

interface BuildCut {
  buildId: string;
  cutId: string;
  assetId: string;
  sourceStartMs: number;
  durationMs: number;
  favorite: boolean;
  sceneScore?: number;
  tags: string[];
}

function formatSequenceOrdinal(ordinal: number): string {
  return `Sequence ${String(Math.max(1, ordinal)).padStart(3, '0')}`;
}

function parseSequenceOrdinal(name?: string): number | undefined {
  if (!name) {
    return undefined;
  }

  const match = name.match(/\bSequence\s+(\d{1,3})\b/i);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function getNextSequenceOrdinal(project: NormalizedProjectFile): number {
  const explicitOrdinals = project.variants
    .map((variant) => parseSequenceOrdinal(variant.name))
    .filter((ordinal): ordinal is number => typeof ordinal === 'number' && Number.isFinite(ordinal));
  const currentMax = explicitOrdinals.length > 0 ? Math.max(...explicitOrdinals) : project.variants.length;
  return currentMax + 1;
}

function getNextSequenceName(project: NormalizedProjectFile): string {
  return formatSequenceOrdinal(getNextSequenceOrdinal(project));
}

function getNextBuildSeed(variant: ReturnType<typeof getVariantById>): number {
  const currentSeed = variant?.assistedGeneration?.seed;
  return typeof currentSeed === 'number' && Number.isFinite(currentSeed)
    ? currentSeed + 1
    : 1;
}

function createMulberry32(seed: number) {
  let value = seed >>> 0;

  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let next = Math.imul(value ^ (value >>> 15), value | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function rankItemsByBlueNoise<T>(items: T[], seed: number): T[] {
  if (items.length <= 1) {
    return items;
  }

  const random = createMulberry32(seed);
  const availableIndices = Array.from({ length: items.length }, (_, index) => index);
  const chosenPositions: number[] = [];
  const rankedIndices: number[] = [];
  const normalizeIndex = (index: number) => items.length === 1 ? 0.5 : index / (items.length - 1);

  while (availableIndices.length > 0) {
    let chosenAvailableIndex = 0;

    if (chosenPositions.length === 0) {
      chosenAvailableIndex = Math.floor(random() * availableIndices.length);
    } else {
      const candidateAttempts = Math.min(48, Math.max(8, availableIndices.length * 2));
      let bestDistance = -1;

      for (let attempt = 0; attempt < candidateAttempts; attempt += 1) {
        const candidateAvailableIndex = Math.floor(random() * availableIndices.length);
        const candidateIndex = availableIndices[candidateAvailableIndex];
        const candidatePosition = normalizeIndex(candidateIndex);
        const nearestDistance = chosenPositions.reduce(
          (closest, position) => Math.min(closest, Math.abs(candidatePosition - position)),
          1
        );

        if (nearestDistance > bestDistance) {
          bestDistance = nearestDistance;
          chosenAvailableIndex = candidateAvailableIndex;
        }
      }
    }

    const [chosenIndex] = availableIndices.splice(chosenAvailableIndex, 1);
    rankedIndices.push(chosenIndex);
    chosenPositions.push(normalizeIndex(chosenIndex));
  }

  return rankedIndices.map((index) => items[index]);
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

const MAX_BUILD_CLIP_DURATION_MS: Partial<Record<SequenceBuildMode, number>> = {
  tight: 1600
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

function createBuildCut(cut: ReviewedCutCandidate, sourceStartMs: number, durationMs: number, sliceIndex = 0): BuildCut {
  return {
    buildId: sliceIndex > 0 ? `${cut.id}#slice-${sliceIndex}` : cut.id,
    cutId: cut.id,
    assetId: cut.assetId,
    sourceStartMs,
    durationMs,
    favorite: Boolean(cut.favorite || cut.status === 'favorite'),
    sceneScore: cut.sceneScore,
    tags: [...(cut.tags ?? [])]
  };
}

function splitCutForBuild(cut: ReviewedCutCandidate, mode: SequenceBuildMode): BuildCut[] {
  const maxDurationMs = MAX_BUILD_CLIP_DURATION_MS[mode];
  if (!maxDurationMs || cut.durationMs <= maxDurationMs) {
    return [createBuildCut(cut, cut.startMs, cut.durationMs)];
  }

  const segmentCount = Math.max(2, Math.ceil(cut.durationMs / maxDurationMs));
  const baseDurationMs = Math.floor(cut.durationMs / segmentCount);
  let remainderMs = cut.durationMs - (baseDurationMs * segmentCount);
  let sourceStartMs = cut.startMs;

  return Array.from({ length: segmentCount }, (_, index) => {
    const durationMs = baseDurationMs + (remainderMs > 0 ? 1 : 0);
    remainderMs = Math.max(0, remainderMs - 1);
    const nextCut = createBuildCut(cut, sourceStartMs, durationMs, index);
    sourceStartMs += durationMs;
    return nextCut;
  });
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
    .flatMap((cut) => splitCutForBuild(cut, mode))
    .sort((left, right) => {
      const favoriteDelta = Number(right.favorite) - Number(left.favorite);
      if (favoriteDelta !== 0) {
        return favoriteDelta;
      }

      if (mode === 'tight') {
        return left.durationMs - right.durationMs
          || (right.sceneScore ?? 0) - (left.sceneScore ?? 0)
          || left.buildId.localeCompare(right.buildId);
      }

      if (mode === 'longer') {
        return right.durationMs - left.durationMs
          || (right.sceneScore ?? 0) - (left.sceneScore ?? 0)
          || left.buildId.localeCompare(right.buildId);
      }

      return (right.sceneScore ?? 0) - (left.sceneScore ?? 0)
        || right.durationMs - left.durationMs
        || left.buildId.localeCompare(right.buildId);
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

function isFavoriteCut(cut: { favorite: boolean }) {
  return cut.favorite;
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
  targetClipCount: number,
  allowFavoriteReuse: boolean
) {
  const uniqueCount = favorites.length + supportingCuts.length;
  const totalCount = allowFavoriteReuse
    ? Math.max(0, targetClipCount)
    : Math.max(0, Math.min(targetClipCount, uniqueCount));
  if (totalCount === 0) {
    return [];
  }

  const desiredFavoriteQuota = favorites.length === 0
    ? 0
    : supportingCuts.length === 0
      ? totalCount
      : Math.min(totalCount, Math.max(1, Math.ceil(totalCount * 0.45)));
  const favoriteQuota = allowFavoriteReuse
    ? desiredFavoriteQuota
    : Math.min(favorites.length, desiredFavoriteQuota);
  const favoriteSlots = new Set(getDistributedIndices(totalCount, favoriteQuota));
  const favoriteQueue = [...favorites];
  const supportQueue = [...supportingCuts];
  const selection: ReturnType<typeof getReviewedCuts> = [];
  let favoriteCursor = 0;

  for (let index = 0; index < totalCount; index += 1) {
    if (favoriteSlots.has(index) && favoriteQueue.length > 0) {
      if (allowFavoriteReuse) {
        selection.push(favoriteQueue[favoriteCursor % favoriteQueue.length]);
        favoriteCursor += 1;
      } else {
        selection.push(favoriteQueue.shift()!);
      }
      continue;
    }

    if (supportQueue.length > 0) {
      selection.push(supportQueue.shift()!);
      continue;
    }

    if (favoriteQueue.length > 0) {
      if (allowFavoriteReuse) {
        selection.push(favoriteQueue[favoriteCursor % favoriteQueue.length]);
        favoriteCursor += 1;
      } else {
        selection.push(favoriteQueue.shift()!);
      }
      continue;
    }
  }

  return selection;
}

function selectReviewedCutsForBuild(project: NormalizedProjectFile, variant: ReturnType<typeof getVariantById>, mode: SequenceBuildMode) {
  const reviewedCuts = getReviewedCuts(project, mode);
  const { targetClipCount, targetDurationMs } = getBuildTargets(project, variant, mode);
  const buildSeed = getNextBuildSeed(variant);
  const musicDurationMs = getMusicDurationMs(project, variant);
  const favoriteCuts = rankItemsByBlueNoise(reviewedCuts.filter((cut) => isFavoriteCut(cut)), buildSeed * 17 + 3);
  const supportingCuts = rankItemsByBlueNoise(reviewedCuts.filter((cut) => !isFavoriteCut(cut)), buildSeed * 31 + 7);
  const totalUniqueDurationMs = reviewedCuts.reduce((total, cut) => total + cut.durationMs, 0);
  const averageCutDurationMs = reviewedCuts.length > 0
    ? reviewedCuts.reduce((total, cut) => total + cut.durationMs, 0) / reviewedCuts.length
    : TARGET_AVERAGE_CLIP_DURATION_MS[mode];
  const needsFavoriteReuse = Boolean(musicDurationMs && musicDurationMs > totalUniqueDurationMs && favoriteCuts.length > 0);
  const expandedTargetClipCount = needsFavoriteReuse
    ? Math.max(targetClipCount, Math.ceil(musicDurationMs! / Math.max(1, averageCutDurationMs)))
    : targetClipCount;
  const selectedCuts = composeBuildSelection(favoriteCuts, supportingCuts, expandedTargetClipCount, needsFavoriteReuse);

  if (!targetDurationMs) {
    return selectedCuts;
  }

  const selectedCutIds = new Set(selectedCuts.map((cut) => cut.buildId));
  const orderedCuts = [
    ...selectedCuts,
    ...reviewedCuts.filter((cut) => !selectedCutIds.has(cut.buildId))
  ];
  const anchorFavoriteIds = new Set(selectedCuts.filter((cut) => isFavoriteCut(cut)).map((cut) => cut.buildId));
  let accumulatedDurationMs = 0;
  const durationMatchedCuts: typeof reviewedCuts = [];
  let remainingAnchorFavorites = anchorFavoriteIds.size;

  for (const cut of orderedCuts) {
    durationMatchedCuts.push(cut);
    accumulatedDurationMs += cut.durationMs;
    if (anchorFavoriteIds.has(cut.buildId)) {
      remainingAnchorFavorites -= 1;
    }

    if (accumulatedDurationMs >= targetDurationMs && remainingAnchorFavorites <= 0) {
      break;
    }
  }

  return durationMatchedCuts.length > 0 ? durationMatchedCuts : selectedCuts;
}

function expandCutsForDuration(cuts: ReturnType<typeof getReviewedCuts>, targetDurationMs: number | undefined, buildSeed: number) {
  if (!targetDurationMs || targetDurationMs <= 0 || cuts.length === 0) {
    return cuts;
  }

  let accumulatedDurationMs = cuts.reduce((total, cut) => total + cut.durationMs, 0);
  if (accumulatedDurationMs >= targetDurationMs) {
    return cuts;
  }

  const favoriteReusePool = rankItemsByBlueNoise(cuts.filter((cut) => isFavoriteCut(cut)), buildSeed * 47 + 11);
  const generalReusePool = rankItemsByBlueNoise(cuts, buildSeed * 53 + 13);
  const reusePool = favoriteReusePool.length > 0 ? favoriteReusePool : generalReusePool;

  if (reusePool.length === 0) {
    return cuts;
  }

  const expandedCuts = [...cuts];
  let reuseCursor = 0;

  while (accumulatedDurationMs < targetDurationMs) {
    let nextCut = reusePool[reuseCursor % reusePool.length];
    const previousCutId = expandedCuts.at(-1)?.buildId;

    if (reusePool.length > 1 && previousCutId === nextCut.buildId) {
      reuseCursor += 1;
      nextCut = reusePool[reuseCursor % reusePool.length];
    }

    expandedCuts.push(nextCut);
    accumulatedDurationMs += nextCut.durationMs;
    reuseCursor += 1;
  }

  return expandedCuts;
}

function assignCutReuseIndices(cuts: ReturnType<typeof getReviewedCuts>) {
  const reuseCounts = new Map<string, number>();

  return cuts.map((cut) => {
    const seenCount = reuseCounts.get(cut.buildId) ?? 0;
    reuseCounts.set(cut.buildId, seenCount + 1);

    return {
      cut,
      reuseIndex: seenCount
    };
  });
}

function clampClipsToDuration(clips: SequenceClip[], maxDurationMs?: number) {
  if (!maxDurationMs || maxDurationMs <= 0) {
    return clips;
  }

  const boundedClips: SequenceClip[] = [];

  for (const clip of clips) {
    if (clip.timelineStartMs >= maxDurationMs) {
      break;
    }

    const availableDurationMs = maxDurationMs - clip.timelineStartMs;
    const nextDurationMs = Math.min(clip.durationMs, availableDurationMs);

    if (nextDurationMs <= 0) {
      break;
    }

    boundedClips.push(nextDurationMs === clip.durationMs ? clip : {
      ...clip,
      durationMs: nextDurationMs
    });

    if (clip.timelineStartMs + nextDurationMs >= maxDurationMs) {
      break;
    }
  }

  return boundedClips;
}

function getRenderedClipSequenceDurationMs(clips: SequenceClip[]) {
  let durationMs = clips.reduce((sum, clip) => sum + clip.durationMs, 0);

  for (let index = 0; index < clips.length - 1; index += 1) {
    const clip = clips[index];
    const nextClip = clips[index + 1];

    if (clip.transition !== 'mask' || !nextClip) {
      continue;
    }

    durationMs -= Math.max(0, Math.min(clip.transitionDurationMs ?? 250, clip.durationMs, nextClip.durationMs));
  }

  return Math.max(0, durationMs);
}

function resequenceClips(clips: SequenceClip[]): SequenceClip[] {
  let timelineStartMs = 0;

  return clips.map((clip, index, allClips) => {
    const isLastClip = index === allClips.length - 1;
    const nextClip: SequenceClip = {
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
}

function extendClipsToMusicDuration(
  project: NormalizedProjectFile,
  variant: NonNullable<ReturnType<typeof getVariantById>>,
  clips: SequenceClip[]
): SequenceClip[] {
  const musicDurationMs = getMusicDurationMs(project, variant);
  if (!musicDurationMs || getRenderedClipSequenceDurationMs(clips) >= musicDurationMs || clips.length === 0) {
    return clips;
  }

  const favoriteCutIds = new Set(
    project.cutCandidates
      .filter((cut) => isFavoriteCut({
        favorite: Boolean(cut.favorite || cut.status === 'favorite')
      }))
      .map((cut) => cut.id)
  );
  const reusePool = clips.filter((clip) => clip.cutId && favoriteCutIds.has(clip.cutId));
  const fallbackPool = reusePool.length > 0 ? reusePool : clips;
  const cloneCounts = new Map<string, number>();
  const expandedClips = [...clips];
  let poolCursor = 0;

  while (getRenderedClipSequenceDurationMs(expandedClips) < musicDurationMs && fallbackPool.length > 0) {
    let template = fallbackPool[poolCursor % fallbackPool.length];

    if (fallbackPool.length > 1 && expandedClips.at(-1)?.id === template.id) {
      poolCursor += 1;
      template = fallbackPool[poolCursor % fallbackPool.length];
    }

    const cloneIndex = (cloneCounts.get(template.id) ?? 0) + 1;
    cloneCounts.set(template.id, cloneIndex);
    expandedClips.push({
      ...template,
      id: `${template.id}-tail-${cloneIndex}`,
      transition: 'cut' as const,
      transitionDurationMs: undefined,
      transitionAssetId: undefined,
      transitionOverlayAssetId: undefined
    });
    poolCursor += 1;
  }

  return resequenceClips(expandedClips);
}

function buildClipsFromReviewedCuts(project: NormalizedProjectFile, variant: ReturnType<typeof getVariantById>, mode: SequenceBuildMode) {
  const reviewedCuts = selectReviewedCutsForBuild(project, variant, mode);
  const musicDurationMs = getMusicDurationMs(project, variant);
  const buildSeed = getNextBuildSeed(variant);
  const durationExpandedCuts = expandCutsForDuration(reviewedCuts, musicDurationMs, buildSeed);
  const assignedCuts = assignCutReuseIndices(durationExpandedCuts);
  let timelineStartMs = 0;
  const clips = assignedCuts.map(({ cut, reuseIndex }) => {
    const clip: SequenceClip = {
      id: reuseIndex > 0
        ? `clip-${cut.buildId}-reuse-${reuseIndex}`
        : `clip-${cut.buildId}`,
      assetId: cut.assetId,
      cutId: cut.cutId,
      timelineStartMs,
      sourceStartMs: cut.sourceStartMs,
      durationMs: cut.durationMs,
      transition: 'cut',
      tags: [...cut.tags]
    };
    timelineStartMs += cut.durationMs;
    return clip;
  });

  return clampClipsToDuration(clips, musicDurationMs);
}

export function buildVariantFromReviewedCuts(project: NormalizedProjectFile, variantId: string, mode: SequenceBuildMode = 'balanced'): NormalizedProjectFile {
  const variant = getVariantById(project, variantId);
  if (!variant) {
    return project;
  }

  const clips = buildClipsFromReviewedCuts(project, variant, mode);
  const musicDurationMs = getMusicDurationMs(project, variant);
  const nextBuildSeed = getNextBuildSeed(variant);

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
        seed: nextBuildSeed,
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
  const nextBuildSeed = getNextBuildSeed(variant);
  const duplicate = {
    ...variant,
    id: duplicateId,
    name: getNextSequenceName(project),
    favorite: false,
    clips,
    markers: [],
    sections: [],
    assistedGeneration: {
      ...variant.assistedGeneration,
      strategy: 'manual' as const,
      seed: nextBuildSeed,
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

function pickRandomSubset<T>(items: T[], count: number, rng: () => number): T[] {
  if (items.length <= count) {
    return [...items];
  }

  const available = [...items];
  const selection: T[] = [];

  while (selection.length < count && available.length > 0) {
    const index = Math.min(available.length - 1, Math.floor(rng() * available.length));
    selection.push(...available.splice(index, 1));
  }

  return selection;
}

function pickRandomIndices(count: number, selectedCount: number, rng: () => number): Set<number> {
  if (selectedCount >= count) {
    return new Set(Array.from({ length: count }, (_, index) => index));
  }

  const available = Array.from({ length: count }, (_, index) => index);
  const chosen: number[] = [];

  while (chosen.length < selectedCount && available.length > 0) {
    const index = Math.min(available.length - 1, Math.floor(rng() * available.length));
    chosen.push(...available.splice(index, 1));
  }

  return new Set(chosen);
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

  const candidateTransitionCount = variant.clips.length - 1;
  const desiredMaskCount = candidateTransitionCount <= 12
    ? candidateTransitionCount
    : Math.min(candidateTransitionCount, 24, Math.max(8, Math.round(candidateTransitionCount * 0.35)));
  const activeTransitionSlots = pickRandomIndices(candidateTransitionCount, desiredMaskCount, rng);
  const activeMaskAssets = pickRandomSubset(maskAssets, Math.min(maskAssets.length, 8), rng);

  const nextProject = normalizeProject({
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

        if (!activeTransitionSlots.has(index)) {
          return {
            ...clip,
            transition: 'cut',
            transitionDurationMs: undefined,
            transitionAssetId: undefined,
            transitionOverlayAssetId: undefined
          };
        }

        const nextClip = clips[index + 1];
        const maskAsset = activeMaskAssets[Math.floor(rng() * activeMaskAssets.length)];
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

  const nextVariant = getVariantById(nextProject, variantId);
  if (!nextVariant) {
    return nextProject;
  }

  return normalizeProject({
    ...nextProject,
    variants: nextProject.variants.map((candidate) => candidate.id === variantId ? {
      ...candidate,
      clips: extendClipsToMusicDuration(nextProject, nextVariant, candidate.clips)
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

  const desiredOverlayCount = variant.clips.length <= 16
    ? variant.clips.length
    : Math.min(variant.clips.length, 32, Math.max(12, Math.round(variant.clips.length * 0.4)));
  const activeOverlaySlots = pickRandomIndices(variant.clips.length, desiredOverlayCount, rng);
  const activeOverlayAssets = pickRandomSubset(overlayAssets, Math.min(overlayAssets.length, 8), rng);

  return normalizeProject({
    ...project,
    variants: project.variants.map((candidate) => candidate.id === variantId ? {
      ...candidate,
      clips: candidate.clips.map((clip, index) => {
        if (!activeOverlaySlots.has(index)) {
          return {
            ...clip,
            overlayAssetId: undefined
          };
        }

        const overlayAsset = activeOverlayAssets[Math.floor(rng() * activeOverlayAssets.length)];
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
    name: getNextSequenceName(project),
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
