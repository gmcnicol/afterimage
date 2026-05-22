import {
  getAutomationLaneById,
  getCutCandidateById,
  getFilterDefinition,
  getFilterParameterValue,
  getFilterStackById,
  getPrimaryAutomationProperty,
  getPresetById,
  getSupportedAutomationProperties,
  isSupportedFilterType,
  type AutomationLane,
  type FilterInstance,
  type NormalizedProjectFile,
  type PresetFilter,
  type SequenceClip,
  type Variant
} from '@afterimage/project-model';
import type {
  CommandSpec,
  ExportRequest,
  FinalizeRenderPlan,
  FinalizeRenderRequest,
  PreviewPlan,
  PreviewRequest,
  RenderGraphArtifact,
  RenderGraphProvenance,
  RenderGraphToolchainIdentity,
  RenderPlan,
  RenderProfile,
  RenderRequest,
  ResolvedFfmpegTools
} from './types.js';
import { createCacheIdentity, hashIdentity } from './identity.js';
import { ensureAsset, formatDecimal, formatSeconds, makePlanningTools } from './utils.js';

function compilePresetFilters(filters: PresetFilter[]): FilterInstance[] {
  return filters.flatMap((filter, index) => {
    if (!isSupportedFilterType(filter.type)) {
      return [];
    }

    const primaryProperty = getPrimaryAutomationProperty(filter.type);
    if (!primaryProperty) {
      return [];
    }

    return [{
      id: `preset-filter-${index + 1}`,
      type: filter.type,
      enabled: true,
      orderIndex: index,
      parameters: {
        [primaryProperty]: filter.amount
      },
      mix: filter.mix ?? 1,
      seed: filter.seed
    }];
  });
}

function evaluateAutomationLane(lane: AutomationLane, timeMs: number, fallback: number): number {
  const enabled = lane.enabled ?? true;
  if (!enabled || lane.keyframes.length === 0) {
    return fallback;
  }

  const ordered = [...lane.keyframes].sort((left, right) => left.timeMs - right.timeMs);

  if (timeMs <= ordered[0].timeMs) {
    return ordered[0].value;
  }

  if (timeMs >= ordered[ordered.length - 1].timeMs) {
    return ordered[ordered.length - 1].value;
  }

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const left = ordered[index];
    const right = ordered[index + 1];
    if (timeMs >= left.timeMs && timeMs <= right.timeMs) {
      const span = Math.max(1, right.timeMs - left.timeMs);
      const ratio = (timeMs - left.timeMs) / span;
      return left.value + ((right.value - left.value) * ratio);
    }
  }

  return fallback;
}

function applyAutomationToFilter(project: NormalizedProjectFile, filter: FilterInstance, timeMs: number): FilterInstance {
  const supportedProperties = new Set(getSupportedAutomationProperties(filter.type));
  let next = {
    ...filter,
    parameters: { ...(filter.parameters ?? {}) }
  };

  for (const laneId of filter.automationLaneIds ?? []) {
    const lane = getAutomationLaneById(project, laneId);
    if (!lane) {
      continue;
    }
    if (!supportedProperties.has(lane.target.property)) {
      continue;
    }

    const fallback = lane.target.property === 'mix'
      ? Number(next.mix ?? 1)
      : Number(next.parameters?.[lane.target.property] ?? 0);
    const value = evaluateAutomationLane(lane, timeMs, fallback);

    if (lane.target.property === 'mix') {
      next.mix = value;
    } else {
      next.parameters = {
        ...next.parameters,
        [lane.target.property]: value
      };
    }
  }

  return next;
}

function compileFilterExpression(filter: FilterInstance): string {
  const definition = getFilterDefinition(filter.type);
  if (!definition) {
    throw new Error(`Unsupported filter type "${filter.type}" in render compiler.`);
  }

  const mix = Number(filter.mix ?? 1);
  const primaryProperty = definition.parameters[0]?.key;
  const primaryValue = primaryProperty ? Number(getFilterParameterValue(filter, primaryProperty) ?? 0) : 0;
  const effectiveAmount = primaryValue * mix;

  switch (filter.type) {
    case 'chroma-bleed': {
      const shiftPixels = Math.round(effectiveAmount * 12);
      return `chromashift=cbh=${shiftPixels}:crh=${-shiftPixels}:edge=smear,eq=saturation=${formatDecimal(1 + (effectiveAmount * 0.12))}`;
    }
    case 'bloom-soft':
      return `gblur=sigma=${formatDecimal(0.6 + (effectiveAmount * 5))},eq=contrast=${formatDecimal(1 + (effectiveAmount * 0.12))}:brightness=${formatDecimal(effectiveAmount * 0.12)}:saturation=${formatDecimal(1 + (effectiveAmount * 0.08))}`;
    case 'glitch-bands': {
      const noiseStrength = Math.min(100, 20 + (effectiveAmount * 80));
      const opacity = Math.min(0.35, 0.08 + (effectiveAmount * 0.22));
      return `noise=alls=${formatDecimal(noiseStrength, 1)}:allf=t+u,tblend=all_mode=difference:all_opacity=${formatDecimal(opacity)}`;
    }
    case 'blur':
      return `gblur=sigma=${formatDecimal(0.4 + (effectiveAmount * 5))}`;
    case 'contrast':
      return `eq=contrast=${formatDecimal(1 + effectiveAmount)}`;
    case 'brightness':
      return `eq=brightness=${formatDecimal(effectiveAmount * 0.25)}`;
  }

  throw new Error(`Unsupported filter type "${filter.type}" in render compiler.`);
}

function collectAuthoredClipFilters(project: NormalizedProjectFile, variant: Variant, clip: SequenceClip): FilterInstance[] {
  const sequenceStack = variant.stackId ? getFilterStackById(project, variant.stackId) : undefined;
  const clipStack = clip.stackOverrideId ? getFilterStackById(project, clip.stackOverrideId) : undefined;
  const preset = clip.presetId ? getPresetById(project, clip.presetId) : undefined;
  const presetFilters = preset ? compilePresetFilters(preset.filters) : [];
  const stackFilters = [
    ...(sequenceStack?.filters ?? []),
    ...(clipStack?.filters ?? [])
  ];

  return [...presetFilters, ...stackFilters]
    .filter((filter) => filter.enabled !== false)
    .sort((left, right) => left.orderIndex - right.orderIndex || left.id.localeCompare(right.id))
    .map((filter) => ({
      ...filter,
      parameters: { ...(filter.parameters ?? {}) }
    }));
}

interface ClipRenderSegment {
  sourceStartMs: number;
  durationMs: number;
  filterExpressions: string[];
}

function collectClipRenderSegments(project: NormalizedProjectFile, variant: Variant, clip: SequenceClip): ClipRenderSegment[] {
  const filters = collectAuthoredClipFilters(project, variant, clip);
  const boundaryTimes = new Set<number>([clip.timelineStartMs, clip.timelineStartMs + clip.durationMs]);

  for (const filter of filters) {
    for (const laneId of filter.automationLaneIds ?? []) {
      const lane = getAutomationLaneById(project, laneId);
      if (!lane || lane.enabled === false) {
        continue;
      }
      if (lane.target.filterId !== filter.id) {
        continue;
      }
      for (const keyframe of lane.keyframes) {
        if (keyframe.timeMs > clip.timelineStartMs && keyframe.timeMs < clip.timelineStartMs + clip.durationMs) {
          boundaryTimes.add(keyframe.timeMs);
        }
      }
    }
  }

  const orderedBoundaries = [...boundaryTimes].sort((left, right) => left - right);
  const segments: ClipRenderSegment[] = [];

  for (let index = 0; index < orderedBoundaries.length - 1; index += 1) {
    const segmentStartMs = orderedBoundaries[index];
    const segmentEndMs = orderedBoundaries[index + 1];
    const segmentDurationMs = segmentEndMs - segmentStartMs;
    if (segmentDurationMs <= 0) {
      continue;
    }

    const sampleTimeMs = segmentStartMs + Math.round(segmentDurationMs / 2);
    segments.push({
      sourceStartMs: clip.sourceStartMs + (segmentStartMs - clip.timelineStartMs),
      durationMs: segmentDurationMs,
      filterExpressions: filters
        .map((filter) => applyAutomationToFilter(project, filter, sampleTimeMs))
        .filter((filter) => filter.enabled !== false)
        .map(compileFilterExpression)
    });
  }

  return segments;
}

function getVariantDuration(variant: Variant): number {
  return variant.clips.reduce((max, clip) => Math.max(max, clip.timelineStartMs + clip.durationMs), 0);
}

function getMusicDurationMs(project: NormalizedProjectFile, variant: Variant): number | undefined {
  const musicAssetId = variant.musicAlignment?.primaryAssetId;
  if (!musicAssetId) {
    return undefined;
  }

  const durationMs = ensureAsset(project, musicAssetId).durationMs;
  return typeof durationMs === 'number' && durationMs > 0 ? durationMs : undefined;
}

/** @internal */
export interface RenderInputDescriptor {
  assetId: string;
  path: string;
  loop?: boolean;
}

/** @internal */
export function collectRenderInputs(project: NormalizedProjectFile, variant: Variant): RenderInputDescriptor[] {
  const seen = new Set<string>();
  const inputs: RenderInputDescriptor[] = [];

  for (const clip of variant.clips) {
    if (!seen.has(clip.assetId)) {
      const asset = ensureAsset(project, clip.assetId);
      seen.add(clip.assetId);
      inputs.push({ assetId: clip.assetId, path: asset.path.absolutePath });
    }
    if (clip.overlayAssetId && !seen.has(clip.overlayAssetId)) {
      const asset = ensureAsset(project, clip.overlayAssetId);
      seen.add(clip.overlayAssetId);
      inputs.push({ assetId: clip.overlayAssetId, path: asset.path.absolutePath, loop: true });
    }
    if (clip.transitionAssetId && !seen.has(clip.transitionAssetId)) {
      const asset = ensureAsset(project, clip.transitionAssetId);
      seen.add(clip.transitionAssetId);
      inputs.push({ assetId: clip.transitionAssetId, path: asset.path.absolutePath });
    }
    if (clip.transitionOverlayAssetId && !seen.has(clip.transitionOverlayAssetId)) {
      const asset = ensureAsset(project, clip.transitionOverlayAssetId);
      seen.add(clip.transitionOverlayAssetId);
      inputs.push({ assetId: clip.transitionOverlayAssetId, path: asset.path.absolutePath, loop: true });
    }
  }

  const musicAssetId = variant.musicAlignment?.primaryAssetId;
  if (musicAssetId && !seen.has(musicAssetId)) {
    const asset = ensureAsset(project, musicAssetId);
    inputs.push({ assetId: musicAssetId, path: asset.path.absolutePath });
  }

  return inputs;
}

/** @internal */
export function usesMaskTransitions(variant: Variant): boolean {
  return variant.clips.some((clip) => clip.transition === 'mask');
}

function countRenderedSegments(variant: Variant): number {
  return variant.clips.reduce((count, clip, index) => {
    const nextClip = variant.clips[index + 1];
    const bodyCount = clip.durationMs - resolveMaskTransitionDurationMs(clip, nextClip) > 0 ? 1 : 0;
    const transitionCount = resolveMaskTransitionDurationMs(clip, nextClip) > 0 ? 1 : 0;
    return count + bodyCount + transitionCount;
  }, 0);
}

export function shouldUseChunkedExport(project: NormalizedProjectFile, variant: Variant, profile: RenderProfile): boolean {
  if (profile.videoCodec !== 'libx264') {
    return false;
  }

  const targetDurationMs = getTargetRenderDurationMs(project, variant);
  const segmentCount = countRenderedSegments(variant);
  const pixelCount = profile.width * profile.height;

  return segmentCount >= 140 || (segmentCount >= 90 && targetDurationMs >= 180_000) || (pixelCount >= 1920 * 1080 && targetDurationMs >= 600_000);
}

function shouldConstrainRenderResources(project: NormalizedProjectFile, variant: Variant, profile: RenderProfile): boolean {
  return shouldUseChunkedExport(project, variant, profile);
}

function applyEncoderArgs(
  args: string[],
  project: NormalizedProjectFile,
  variant: Variant,
  profile: RenderProfile
): void {
  const constrained = shouldConstrainRenderResources(project, variant, profile);

  if (constrained) {
    args.push(
      '-threads', '4',
      '-filter_threads', '1',
      '-filter_complex_threads', '1'
    );
  }

  if (profile.videoCodec === 'libx264') {
    args.push(
      '-preset', constrained ? 'fast' : (profile.videoPreset ?? 'medium'),
      '-crf', String(profile.crf ?? 18)
    );
    if (profile.videoMaxrateKbps) {
      args.push('-maxrate', `${profile.videoMaxrateKbps}k`);
    }
    if (profile.videoBufsizeKbps) {
      args.push('-bufsize', `${profile.videoBufsizeKbps}k`);
    }
    return;
  }

  if (profile.videoCodec === 'prores_ks') {
    args.push('-profile:v', profile.videoProfile ?? '3');
  }
}

function resolveMaskTransitionDurationMs(clip: SequenceClip, nextClip: SequenceClip | undefined): number {
  if (clip.transition !== 'mask' || !nextClip) {
    return 0;
  }

  return Math.max(0, Math.min(clip.transitionDurationMs ?? 250, clip.durationMs, nextClip.durationMs));
}

function getRenderedVariantDurationMs(variant: Variant): number {
  let durationMs = variant.clips.reduce((sum, clip) => sum + clip.durationMs, 0);

  for (let index = 0; index < variant.clips.length - 1; index += 1) {
    durationMs -= resolveMaskTransitionDurationMs(variant.clips[index], variant.clips[index + 1]);
  }

  return Math.max(0, durationMs);
}

export function getTargetRenderDurationMs(project: NormalizedProjectFile, variant: Variant): number {
  return getMusicDurationMs(project, variant)
    ?? (usesMaskTransitions(variant) ? getRenderedVariantDurationMs(variant) : getVariantDuration(variant));
}

function getClipFilterExpressionsAtTime(project: NormalizedProjectFile, variant: Variant, clip: SequenceClip, timeMs: number): string[] {
  return collectAuthoredClipFilters(project, variant, clip)
    .map((filter) => applyAutomationToFilter(project, filter, timeMs))
    .filter((filter) => filter.enabled !== false)
    .map(compileFilterExpression);
}

function buildVideoChain(
  inputIndex: number,
  sourceStartMs: number,
  durationMs: number,
  filterExpressions: string[],
  profile: RenderProfile,
  outputLabel: string
): string {
  const filters = [
    `trim=start=${formatSeconds(sourceStartMs)}:duration=${formatSeconds(durationMs)}`,
    'setpts=PTS-STARTPTS',
    ...filterExpressions,
    `fps=${formatDecimal(profile.frameRate)}`,
    `scale=${profile.width}:${profile.height}`,
    'setsar=1',
    `format=${profile.pixelFormat}`
  ];

  return `[${inputIndex}:v]${filters.join(',')}[${outputLabel}]`;
}

function buildAudioChain(inputIndex: number, sourceStartMs: number, durationMs: number, outputLabel: string): string {
  return `[${inputIndex}:a]atrim=start=${formatSeconds(sourceStartMs)}:duration=${formatSeconds(durationMs)},asetpts=PTS-STARTPTS[${outputLabel}]`;
}

function resolveCutStartMs(project: NormalizedProjectFile, cutId: string | undefined): number {
  if (!cutId) {
    return 0;
  }

  return getCutCandidateById(project, cutId)?.startMs ?? 0;
}

function buildMaskAssetChain(inputIndex: number, sourceStartMs: number, durationMs: number, profile: RenderProfile, outputLabel: string): string {
  return `[${inputIndex}:v]trim=start=${formatSeconds(sourceStartMs)}:duration=${formatSeconds(durationMs)},setpts=PTS-STARTPTS,fps=${formatDecimal(profile.frameRate)},scale=${profile.width}:${profile.height},setsar=1,format=gray[${outputLabel}]`;
}

function buildOverlayAssetChain(inputIndex: number, sourceStartMs: number, durationMs: number, profile: RenderProfile, outputLabel: string): string {
  return `[${inputIndex}:v]trim=start=${formatSeconds(sourceStartMs)}:duration=${formatSeconds(durationMs)},setpts=PTS-STARTPTS,fps=${formatDecimal(profile.frameRate)},scale=${profile.width}:${profile.height},setsar=1,format=gray,eq=contrast=1.02:brightness=0.01,format=${profile.pixelFormat}[${outputLabel}]`;
}

function appendOverlayBlend(filterSegments: string[], baseLabel: string, overlayInputIndex: number, overlaySourceStartMs: number, durationMs: number, profile: RenderProfile, outputLabel: string): void {
  const overlayLabel = `${outputLabel}_overlay`;
  filterSegments.push(buildOverlayAssetChain(overlayInputIndex, overlaySourceStartMs, durationMs, profile, overlayLabel));
  // Apply overlays only to luma so grayscale texture does not contaminate chroma planes.
  filterSegments.push(
    `[${baseLabel}][${overlayLabel}]blend=c0_expr='min(255,A+B*0.28)':c1_expr='A':c2_expr='A'[${outputLabel}]`
  );
}

function buildFinalVideoChain(
  inputLabel: string,
  outputLabel: string,
  profile: RenderProfile,
  baseDurationMs: number,
  targetDurationMs?: number
): string {
  const filters: string[] = [];

  if (typeof targetDurationMs === 'number' && targetDurationMs > 0) {
    const stopPadDurationMs = Math.max(0, targetDurationMs - baseDurationMs);
    const fadeDurationMs = Math.min(2000, targetDurationMs);
    const fadeStartMs = Math.max(0, targetDurationMs - fadeDurationMs);

    if (stopPadDurationMs > 0) {
      filters.push(`tpad=stop_mode=clone:stop_duration=${formatSeconds(stopPadDurationMs)}`);
    }
    filters.push(`trim=duration=${formatSeconds(targetDurationMs)}`);
    filters.push(`fade=t=out:st=${formatSeconds(fadeStartMs)}:d=${formatSeconds(fadeDurationMs)}`);
  }

  filters.push(`format=${profile.pixelFormat}`);

  return `[${inputLabel}]${filters.join(',')}[${outputLabel}]`;
}

function appendVideoSegmentWithOptionalOverlay(
  filterSegments: string[],
  options: {
    clipInputIndex: number;
    overlayInputIndex?: number;
    overlaySourceStartMs?: number;
    sourceStartMs: number;
    durationMs: number;
    filterExpressions: string[];
    profile: RenderProfile;
    outputLabel: string;
  }
): void {
  const baseLabel = options.overlayInputIndex === undefined ? options.outputLabel : `${options.outputLabel}_base`;
  filterSegments.push(buildVideoChain(
    options.clipInputIndex,
    options.sourceStartMs,
    options.durationMs,
    options.filterExpressions,
    options.profile,
    baseLabel
  ));

  if (options.overlayInputIndex === undefined) {
    return;
  }

  appendOverlayBlend(
    filterSegments,
    baseLabel,
    options.overlayInputIndex,
    options.overlaySourceStartMs ?? 0,
    options.durationMs,
    options.profile,
    options.outputLabel
  );
}

function buildMaskedRenderCommand(
  project: NormalizedProjectFile,
  variant: Variant,
  sequenceId: string,
  request: RenderRequest | ExportRequest | PreviewRequest,
  profile: RenderProfile,
  tools?: ResolvedFfmpegTools
): RenderPlan | PreviewPlan {
  const resolvedTools = makePlanningTools(tools);
  const inputs = collectRenderInputs(project, variant);
  const inputIndexByAssetId = new Map(inputs.map((input, index) => [input.assetId, index]));
  const filterSegments: string[] = [];
  const videoConcatInputs: string[] = [];
  const audioConcatInputs: string[] = [];
  const musicAssetId = variant.musicAlignment?.primaryAssetId;
  const musicInputIndex = musicAssetId ? inputIndexByAssetId.get(musicAssetId) : undefined;
  const musicDurationMs = getMusicDurationMs(project, variant);
  const includeClipAudio = musicInputIndex === undefined
    && variant.clips.every((clip) => ensureAsset(project, clip.assetId).hasAudio);

  let segmentIndex = 0;

  for (let index = 0; index < variant.clips.length; index += 1) {
    const clip = variant.clips[index];
    const nextClip = variant.clips[index + 1];
    const previousClip = variant.clips[index - 1];
    const clipInputIndex = inputIndexByAssetId.get(clip.assetId);
    const clipOverlayInputIndex = clip.overlayAssetId ? inputIndexByAssetId.get(clip.overlayAssetId) : undefined;
    const clipOverlaySourceStartMs = resolveCutStartMs(project, clip.overlayCutId);
    if (clipInputIndex === undefined) {
      throw new Error(`Missing input index for asset "${clip.assetId}".`);
    }

    const incomingTransitionMs = previousClip ? resolveMaskTransitionDurationMs(previousClip, clip) : 0;
    const outgoingTransitionMs = resolveMaskTransitionDurationMs(clip, nextClip);
    const bodyDurationMs = clip.durationMs - incomingTransitionMs - outgoingTransitionMs;

    if (bodyDurationMs > 0) {
      const sampleTimeMs = clip.timelineStartMs + incomingTransitionMs + Math.round(bodyDurationMs / 2);
      const filterExpressions = getClipFilterExpressionsAtTime(project, variant, clip, sampleTimeMs);
      appendVideoSegmentWithOptionalOverlay(filterSegments, {
        clipInputIndex,
        overlayInputIndex: clipOverlayInputIndex,
        overlaySourceStartMs: clipOverlaySourceStartMs,
        sourceStartMs: clip.sourceStartMs + incomingTransitionMs,
        durationMs: bodyDurationMs,
        filterExpressions,
        profile,
        outputLabel: `v${segmentIndex}`
      });
      videoConcatInputs.push(`[v${segmentIndex}]`);

      if (includeClipAudio) {
        filterSegments.push(buildAudioChain(
          clipInputIndex,
          clip.sourceStartMs + incomingTransitionMs,
          bodyDurationMs,
          `a${segmentIndex}`
        ));
        audioConcatInputs.push(`[a${segmentIndex}]`);
      }

      segmentIndex += 1;
    }

    if (outgoingTransitionMs > 0 && nextClip) {
      if (!clip.transitionAssetId) {
        throw new Error(`Clip "${clip.id}" uses a mask transition without transitionAssetId.`);
      }

      const nextInputIndex = inputIndexByAssetId.get(nextClip.assetId);
      const nextOverlayInputIndex = nextClip.overlayAssetId ? inputIndexByAssetId.get(nextClip.overlayAssetId) : undefined;
      const nextOverlaySourceStartMs = resolveCutStartMs(project, nextClip.overlayCutId);
      const maskInputIndex = inputIndexByAssetId.get(clip.transitionAssetId);
      const transitionOverlayInputIndex = clip.transitionOverlayAssetId ? inputIndexByAssetId.get(clip.transitionOverlayAssetId) : undefined;
      if (nextInputIndex === undefined) {
        throw new Error(`Missing input index for asset "${nextClip.assetId}".`);
      }
      if (maskInputIndex === undefined) {
        throw new Error(`Missing input index for transition asset "${clip.transitionAssetId}".`);
      }

      const leftLabel = `mtleft${segmentIndex}`;
      const rightLabel = `mtright${segmentIndex}`;
      const maskLabel = `mtmask${segmentIndex}`;
      const mergedLabel = `mtmerge${segmentIndex}`;
      const transitionOutputLabel = `v${segmentIndex}`;
      const transitionBaseLabel = transitionOverlayInputIndex === undefined ? transitionOutputLabel : `mtoverlaybase${segmentIndex}`;

      appendVideoSegmentWithOptionalOverlay(filterSegments, {
        clipInputIndex,
        overlayInputIndex: clipOverlayInputIndex,
        overlaySourceStartMs: clipOverlaySourceStartMs,
        sourceStartMs: clip.sourceStartMs + clip.durationMs - outgoingTransitionMs,
        durationMs: outgoingTransitionMs,
        filterExpressions: getClipFilterExpressionsAtTime(project, variant, clip, clip.timelineStartMs + clip.durationMs - Math.round(outgoingTransitionMs / 2)),
        profile,
        outputLabel: leftLabel
      });
      appendVideoSegmentWithOptionalOverlay(filterSegments, {
        clipInputIndex: nextInputIndex,
        overlayInputIndex: nextOverlayInputIndex,
        overlaySourceStartMs: nextOverlaySourceStartMs,
        sourceStartMs: nextClip.sourceStartMs,
        durationMs: outgoingTransitionMs,
        filterExpressions: getClipFilterExpressionsAtTime(project, variant, nextClip, nextClip.timelineStartMs + Math.round(outgoingTransitionMs / 2)),
        profile,
        outputLabel: rightLabel
      });
      filterSegments.push(buildMaskAssetChain(maskInputIndex, resolveCutStartMs(project, clip.transitionCutId), outgoingTransitionMs, profile, maskLabel));
      filterSegments.push(`[${leftLabel}][${rightLabel}][${maskLabel}]maskedmerge[${mergedLabel}]`);
      filterSegments.push(`[${mergedLabel}]null[${transitionBaseLabel}]`);
      if (transitionOverlayInputIndex !== undefined) {
        appendOverlayBlend(
          filterSegments,
          transitionBaseLabel,
          transitionOverlayInputIndex,
          resolveCutStartMs(project, clip.transitionOverlayCutId),
          outgoingTransitionMs,
          profile,
          transitionOutputLabel
        );
      }

      videoConcatInputs.push(`[${transitionOutputLabel}]`);

      if (includeClipAudio) {
        filterSegments.push(buildAudioChain(
          clipInputIndex,
          clip.sourceStartMs + clip.durationMs - outgoingTransitionMs,
          outgoingTransitionMs,
          `a${segmentIndex}`
        ));
        audioConcatInputs.push(`[a${segmentIndex}]`);
      }

      segmentIndex += 1;
    }
  }

  if (segmentIndex === 0) {
    throw new Error(`Variant "${variant.id}" does not produce any renderable segments.`);
  }

  if (includeClipAudio) {
    filterSegments.push(`${videoConcatInputs.join('')}${audioConcatInputs.join('')}concat=n=${segmentIndex}:v=1:a=1[vconcat][aconcat]`);
  } else {
    filterSegments.push(`${videoConcatInputs.join('')}concat=n=${segmentIndex}:v=1:a=0[vconcat]`);
  }

  filterSegments.push(buildFinalVideoChain('vconcat', 'vout', profile, getRenderedVariantDurationMs(variant), musicDurationMs));

  if (musicInputIndex !== undefined) {
    filterSegments.push(`[${musicInputIndex}:a]atrim=start=0:duration=${formatSeconds(getTargetRenderDurationMs(project, variant))},asetpts=PTS-STARTPTS[amusic]`);
  }

  const args = [
    request.overwrite === false ? '-n' : '-y',
    ...inputs.flatMap((input) => input.loop ? ['-stream_loop', '-1', '-i', input.path] : ['-i', input.path]),
    '-filter_complex', filterSegments.join(';'),
    '-map', '[vout]',
    '-c:v', profile.videoCodec
  ];

  applyEncoderArgs(args, project, variant, profile);

  if (musicInputIndex !== undefined) {
    args.push('-map', '[amusic]');
  } else if (includeClipAudio) {
    args.push('-map', '[aconcat]');
  }

  if (musicInputIndex !== undefined || includeClipAudio) {
    args.push('-c:a', profile.audioCodec);
    if (profile.audioCodec === 'aac') {
      args.push('-b:a', `${profile.audioBitrateKbps ?? 192}k`);
    }
  }

  args.push('-f', profile.container, request.outputPath);

  return {
    projectId: project.id,
    sequenceId,
    variantId: variant.id,
    outputPath: request.outputPath,
    command: {
      label: `render:${project.id}:${variant.id}`,
      binary: resolvedTools.ffmpeg.path,
      args,
      expectedOutputs: [request.outputPath]
    }
  };
}

/** @internal */
export function buildRenderCommand(
  project: NormalizedProjectFile,
  variant: Variant,
  sequenceId: string,
  request: RenderRequest | ExportRequest | PreviewRequest,
  profile: RenderProfile,
  tools?: ResolvedFfmpegTools
): RenderPlan | PreviewPlan {
  if (usesMaskTransitions(variant)) {
    return buildMaskedRenderCommand(project, variant, sequenceId, request, profile, tools);
  }

  const resolvedTools = makePlanningTools(tools);
  const inputs = collectRenderInputs(project, variant);
  const inputIndexByAssetId = new Map(inputs.map((input, index) => [input.assetId, index]));
  const filterSegments: string[] = [];
  const videoConcatInputs: string[] = [];
  const audioConcatInputs: string[] = [];
  const musicAssetId = variant.musicAlignment?.primaryAssetId;
  const musicInputIndex = musicAssetId ? inputIndexByAssetId.get(musicAssetId) : undefined;
  const musicDurationMs = getMusicDurationMs(project, variant);
  const includeClipAudio = musicInputIndex === undefined
    && variant.clips.every((clip) => ensureAsset(project, clip.assetId).hasAudio);

  let segmentIndex = 0;

  variant.clips.forEach((clip) => {
    const inputIndex = inputIndexByAssetId.get(clip.assetId);
    const overlayInputIndex = clip.overlayAssetId ? inputIndexByAssetId.get(clip.overlayAssetId) : undefined;
    const overlaySourceStartMs = resolveCutStartMs(project, clip.overlayCutId);
    if (inputIndex === undefined) {
      throw new Error(`Missing input index for asset "${clip.assetId}".`);
    }

    for (const segment of collectClipRenderSegments(project, variant, clip)) {
      appendVideoSegmentWithOptionalOverlay(filterSegments, {
        clipInputIndex: inputIndex,
        overlayInputIndex,
        overlaySourceStartMs,
        sourceStartMs: segment.sourceStartMs,
        durationMs: segment.durationMs,
        filterExpressions: segment.filterExpressions,
        profile,
        outputLabel: `v${segmentIndex}`
      });
      videoConcatInputs.push(`[v${segmentIndex}]`);

      if (includeClipAudio) {
        filterSegments.push(`[${inputIndex}:a]atrim=start=${formatSeconds(segment.sourceStartMs)}:duration=${formatSeconds(segment.durationMs)},asetpts=PTS-STARTPTS[a${segmentIndex}]`);
        audioConcatInputs.push(`[a${segmentIndex}]`);
      }

      segmentIndex += 1;
    }
  });

  if (segmentIndex === 0) {
    throw new Error(`Variant "${variant.id}" does not produce any renderable segments.`);
  }

  if (includeClipAudio) {
    filterSegments.push(`${videoConcatInputs.join('')}${audioConcatInputs.join('')}concat=n=${segmentIndex}:v=1:a=1[vconcat][aconcat]`);
  } else {
    filterSegments.push(`${videoConcatInputs.join('')}concat=n=${segmentIndex}:v=1:a=0[vconcat]`);
  }

  filterSegments.push(buildFinalVideoChain('vconcat', 'vout', profile, getVariantDuration(variant), musicDurationMs));

  if (musicInputIndex !== undefined) {
    filterSegments.push(`[${musicInputIndex}:a]atrim=start=0:duration=${formatSeconds(getTargetRenderDurationMs(project, variant))},asetpts=PTS-STARTPTS[amusic]`);
  }

  const args = [
    request.overwrite === false ? '-n' : '-y',
    ...inputs.flatMap((input) => input.loop ? ['-stream_loop', '-1', '-i', input.path] : ['-i', input.path]),
    '-filter_complex', filterSegments.join(';'),
    '-map', '[vout]',
    '-c:v', profile.videoCodec
  ];

  applyEncoderArgs(args, project, variant, profile);

  if (musicInputIndex !== undefined) {
    args.push('-map', '[amusic]');
  } else if (includeClipAudio) {
    args.push('-map', '[aconcat]');
  }

  if (musicInputIndex !== undefined || includeClipAudio) {
    args.push('-c:a', profile.audioCodec);
    if (profile.audioCodec === 'aac') {
      args.push('-b:a', `${profile.audioBitrateKbps ?? 192}k`);
    }
  }

  args.push('-f', profile.container, request.outputPath);

  const plan = {
    projectId: project.id,
    sequenceId,
    variantId: variant.id,
    outputPath: request.outputPath,
    command: {
      label: `render:${project.id}:${variant.id}`,
      binary: resolvedTools.ffmpeg.path,
      args,
      expectedOutputs: [request.outputPath]
    }
  };

  return plan;
}

export function buildConcatList(paths: string[]): string {
  return paths.map((path) => `file '${path.replace(/'/g, `'\\''`)}'`).join('\n') + '\n';
}

export function buildFinalizeRenderPlan(
  request: FinalizeRenderRequest,
  tools?: ResolvedFfmpegTools
): FinalizeRenderPlan {
  const resolvedTools = makePlanningTools(tools);
  const fadeDurationMs = Math.min(2000, request.durationMs);
  const fadeStartMs = Math.max(0, request.durationMs - fadeDurationMs);
  const filterSegments = [
    `[0:v]trim=duration=${formatSeconds(request.durationMs)},fade=t=out:st=${formatSeconds(fadeStartMs)}:d=${formatSeconds(fadeDurationMs)},format=${request.profile.pixelFormat}[vout]`
  ];
  const args = [
    request.overwrite === false ? '-n' : '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', request.concatListPath
  ];

  if (request.musicPath) {
    filterSegments.push(`[1:a]atrim=start=0:duration=${formatSeconds(request.durationMs)},asetpts=PTS-STARTPTS[amusic]`);
    args.push('-i', request.musicPath);
  }

  args.push(
    '-filter_complex', filterSegments.join(';'),
    '-map', '[vout]',
    '-c:v', request.profile.videoCodec
  );

  if (request.profile.videoCodec === 'libx264') {
    args.push(
      '-preset', request.profile.videoPreset ?? 'medium',
      '-crf', String(request.profile.crf ?? 18)
    );
    if (request.profile.videoMaxrateKbps) {
      args.push('-maxrate', `${request.profile.videoMaxrateKbps}k`);
    }
    if (request.profile.videoBufsizeKbps) {
      args.push('-bufsize', `${request.profile.videoBufsizeKbps}k`);
    }
  } else if (request.profile.videoCodec === 'prores_ks') {
    args.push('-profile:v', request.profile.videoProfile ?? '3');
  }

  if (request.musicPath) {
    args.push('-map', '[amusic]', '-c:a', request.profile.audioCodec);
    if (request.profile.audioCodec === 'aac') {
      args.push('-b:a', `${request.profile.audioBitrateKbps ?? 192}k`);
    }
  }

  args.push('-f', request.profile.container, request.outputPath);
  const command: CommandSpec = {
    label: `finalize:${request.outputPath}`,
    binary: resolvedTools.ffmpeg.path,
    args,
    expectedOutputs: [request.outputPath]
  };
  const toolchain = {
    backend: 'ffmpeg',
    binary: resolvedTools.ffmpeg.path,
    source: resolvedTools.ffmpeg.source,
    ...(resolvedTools.ffmpeg.envVar !== undefined ? { envVar: resolvedTools.ffmpeg.envVar } : {}),
    provenance: resolvedTools.ffmpeg.provenance
  } satisfies RenderGraphToolchainIdentity;
  const inputArtifactKeys = request.inputArtifacts?.map((artifact) => artifact.cacheIdentity.key) ?? [];
  const reusableCommand = {
    ...command,
    args: command.args.map((arg) => arg === request.outputPath ? '<render-output>' : arg),
    expectedOutputs: command.expectedOutputs?.map((output) => output === request.outputPath ? '<render-output>' : output)
  };
  const invalidatesOn = [
    'concat-list',
    'chunk-artifacts',
    'profile',
    'duration',
    'music',
    'finalize-command-semantics',
    'ffmpeg-toolchain'
  ];
  const cacheProvenance: RenderGraphProvenance = {
    mode: 'finalize',
    passId: 'pass:ffmpeg-finalize',
    toolchain,
    parentCacheKeys: inputArtifactKeys,
    metadata: {
      concatListPath: request.concatListPath,
      musicPath: request.musicPath,
      durationMs: request.durationMs,
      profile: request.profile
    }
  };
  const cacheIdentity = createCacheIdentity('render-graph-finalize-pass', [
    `concat:${request.concatListPath}`,
    `profile:${hashIdentity(request.profile)}`,
    `toolchain:${hashIdentity(toolchain)}`,
    ...inputArtifactKeys.map((key) => `input-artifact:${key}`)
  ], {
    concatListPath: request.concatListPath,
    durationMs: request.durationMs,
    musicPath: request.musicPath,
    profile: request.profile,
    command: reusableCommand,
    toolchain,
    inputArtifactKeys
  }, invalidatesOn, cacheProvenance);
  const artifactId = `artifact:finalize-output:${hashIdentity({
    role: 'finalize-output',
    profile: request.profile,
    contentCacheKey: cacheIdentity.key,
    outputPath: request.outputPath
  })}`;
  const artifactProvenance: RenderGraphProvenance = {
    mode: 'finalize',
    role: 'finalize-output',
    passId: 'pass:ffmpeg-finalize',
    artifactId,
    toolchain,
    parentCacheKeys: [cacheIdentity.key],
    metadata: {
      outputPath: request.outputPath,
      profile: request.profile
    }
  };
  const artifactCacheIdentity = createCacheIdentity('render-graph-artifact', [
    cacheIdentity.key,
    `output:${request.outputPath}`
  ], {
    outputPath: request.outputPath,
    profile: request.profile,
    role: 'finalize-output',
    contentCacheKey: cacheIdentity.key
  }, [...invalidatesOn, 'output-path'], artifactProvenance);
  const artifact: RenderGraphArtifact = {
    id: artifactId,
    kind: 'video',
    role: 'finalize-output',
    path: request.outputPath,
    profile: request.profile,
    producedBy: 'pass:ffmpeg-finalize',
    cacheIdentity: artifactCacheIdentity,
    provenance: {
      ...artifactProvenance,
      cacheKey: artifactCacheIdentity.key
    }
  };

  return {
    outputPath: request.outputPath,
    command,
    artifact,
    cacheIdentity
  };
}
