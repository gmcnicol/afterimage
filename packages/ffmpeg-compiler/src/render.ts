import { createHash } from 'node:crypto';
import { getExportProfileById, type ExportProfileId } from '@afterimage/export-profiles';
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
  type ProjectFile,
  type SequenceClip,
  type Variant
} from '@afterimage/project-model';
import type {
  CommandSpec,
  ExportRequest,
  FinalizeRenderRequest,
  PreviewPlan,
  PreviewRequest,
  RenderGraphArtifact,
  RenderGraphBackendRequirement,
  RenderGraphCacheIdentity,
  RenderGraphCapabilityDiagnostic,
  RenderGraphInputReference,
  RenderGraphNode,
  RenderGraphPass,
  RenderGraphPlan,
  RenderGraphArtifactRole,
  RenderGraphPlanMode,
  RenderPlan,
  RenderProfile,
  RenderRequest,
  ResolvedFfmpegTools
} from './types.js';
import { ensureAsset, formatDecimal, formatSeconds, makePlanningTools, normalizeForPlanning, resolveTimeline } from './utils.js';

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

interface RenderInputDescriptor {
  assetId: string;
  path: string;
  loop?: boolean;
}

function collectRenderInputs(project: NormalizedProjectFile, variant: Variant): RenderInputDescriptor[] {
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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`;
}

function createCacheIdentity(namespace: string, inputs: string[], value: unknown): RenderGraphCacheIdentity {
  return {
    namespace,
    key: createHash('sha256').update(stableStringify(value)).digest('hex'),
    version: 1,
    algorithm: 'sha256',
    inputs,
    status: 'placeholder'
  };
}

function withoutUndefinedEntries<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));
}

function normalizeRenderProfileForGraph(profile: RenderProfile): RenderProfile {
  return {
    width: profile.width,
    height: profile.height,
    frameRate: profile.frameRate,
    container: profile.container,
    videoCodec: profile.videoCodec,
    audioCodec: profile.audioCodec,
    pixelFormat: profile.pixelFormat,
    ...(profile.videoProfile !== undefined ? { videoProfile: profile.videoProfile } : {}),
    ...(profile.crf !== undefined ? { crf: profile.crf } : {}),
    ...(profile.videoPreset !== undefined ? { videoPreset: profile.videoPreset } : {}),
    ...(profile.videoMaxrateKbps !== undefined ? { videoMaxrateKbps: profile.videoMaxrateKbps } : {}),
    ...(profile.videoBufsizeKbps !== undefined ? { videoBufsizeKbps: profile.videoBufsizeKbps } : {}),
    ...(profile.audioBitrateKbps !== undefined ? { audioBitrateKbps: profile.audioBitrateKbps } : {})
  };
}

function toRenderProfile(request: PreviewRequest | ExportRequest | RenderRequest, mode: RenderGraphPlanMode): RenderProfile {
  if (mode === 'preview') {
    const previewRequest = request as PreviewRequest;
    return {
      width: previewRequest.width ?? 960,
      height: previewRequest.height ?? 540,
      frameRate: previewRequest.frameRate ?? 24,
      container: 'mp4',
      videoCodec: 'libx264',
      audioCodec: 'aac',
      pixelFormat: 'yuv420p',
      crf: 26,
      videoPreset: 'fast',
      audioBitrateKbps: 128
    };
  }

  if (mode === 'export') {
    const profile = (request as ExportRequest).profile;
    return normalizeRenderProfileForGraph({
      width: profile.width,
      height: profile.height,
      frameRate: profile.frameRate,
      container: profile.container,
      videoCodec: profile.videoCodec,
      audioCodec: profile.audioCodec,
      pixelFormat: profile.pixelFormat,
      videoProfile: profile.videoProfile,
      crf: profile.crf,
      videoPreset: profile.videoPreset,
      videoMaxrateKbps: profile.videoMaxrateKbps,
      videoBufsizeKbps: profile.videoBufsizeKbps,
      audioBitrateKbps: profile.audioBitrateKbps
    });
  }

  return normalizeRenderProfileForGraph((request as RenderRequest).profile);
}

function getArtifactRole(mode: RenderGraphPlanMode): RenderGraphArtifactRole {
  if (mode === 'preview') {
    return 'preview-output';
  }
  if (mode === 'export') {
    return 'export-output';
  }
  return 'render-output';
}

function usesMaskTransitions(variant: Variant): boolean {
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

function buildRenderCommand(
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

export function buildPreviewPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: PreviewRequest,
  tools?: ResolvedFfmpegTools
): PreviewPlan {
  const normalizedProject = normalizeForPlanning(project);
  const { sequenceId, variant } = resolveTimeline(normalizedProject, request.sequenceId, request.variantId);

  return buildRenderCommand(normalizedProject, variant, sequenceId, request, {
    width: request.width ?? 960,
    height: request.height ?? 540,
    frameRate: request.frameRate ?? 24,
    container: 'mp4',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    pixelFormat: 'yuv420p',
    crf: 26,
    videoPreset: 'fast',
    audioBitrateKbps: 128
  }, tools) as PreviewPlan;
}

export function buildConcatList(paths: string[]): string {
  return paths.map((path) => `file '${path.replace(/'/g, `'\\''`)}'`).join('\n') + '\n';
}

export function buildFinalizeRenderPlan(
  request: FinalizeRenderRequest,
  tools?: ResolvedFfmpegTools
): { outputPath: string; command: CommandSpec } {
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

  return {
    outputPath: request.outputPath,
    command: {
      label: `finalize:${request.outputPath}`,
      binary: resolvedTools.ffmpeg.path,
      args,
      expectedOutputs: [request.outputPath]
    }
  };
}

export function buildExportPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: ExportRequest,
  tools?: ResolvedFfmpegTools
): RenderPlan {
  const normalizedProject = normalizeForPlanning(project);
  const { sequenceId, variant } = resolveTimeline(normalizedProject, request.sequenceId, request.variantId);

  return buildRenderCommand(normalizedProject, variant, sequenceId, request, {
    width: request.profile.width,
    height: request.profile.height,
    frameRate: request.profile.frameRate,
    container: request.profile.container,
    videoCodec: request.profile.videoCodec,
    audioCodec: request.profile.audioCodec,
    pixelFormat: request.profile.pixelFormat,
    videoProfile: request.profile.videoProfile,
    crf: request.profile.crf,
    videoPreset: request.profile.videoPreset,
    videoMaxrateKbps: request.profile.videoMaxrateKbps,
    videoBufsizeKbps: request.profile.videoBufsizeKbps,
    audioBitrateKbps: request.profile.audioBitrateKbps
  }, tools) as RenderPlan;
}

export function buildRenderPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: RenderRequest,
  tools?: ResolvedFfmpegTools
): RenderPlan {
  const normalizedProject = normalizeForPlanning(project);
  const { sequenceId, variant } = resolveTimeline(normalizedProject, request.sequenceId, request.variantId);

  return buildRenderCommand(normalizedProject, variant, sequenceId, request, request.profile, tools) as RenderPlan;
}

export function buildRenderGraphPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: PreviewRequest | ExportRequest | RenderRequest,
  profile: RenderProfile,
  mode: RenderGraphPlanMode,
  tools?: ResolvedFfmpegTools
): RenderGraphPlan {
  const normalizedProject = normalizeForPlanning(project);
  const { sequenceId, variant } = resolveTimeline(normalizedProject, request.sequenceId, request.variantId);
  const resolvedTools = makePlanningTools(tools);
  const graphProfile = normalizeRenderProfileForGraph(profile);
  const commandPlan = buildRenderCommand(normalizedProject, variant, sequenceId, request, graphProfile, resolvedTools) as RenderPlan | PreviewPlan;
  const inputs = collectRenderInputs(normalizedProject, variant);
  const inputReferences: RenderGraphInputReference[] = inputs.map((input, inputIndex) => {
    const asset = ensureAsset(normalizedProject, input.assetId);
    return {
      id: `input:${input.assetId}`,
      assetId: input.assetId,
      path: input.path,
      mediaType: asset.mediaType,
      loop: input.loop ?? false,
      inputIndex,
      ...(asset.assetRole !== undefined ? { role: asset.assetRole } : {})
    };
  });
  const durationMs = getTargetRenderDurationMs(normalizedProject, variant);
  const operationNodeId = `operation:${mode}:${variant.id}`;
  const artifactId = `artifact:${mode}:output`;
  const cacheInputs = [
    `project:${normalizedProject.id}`,
    `sequence:${sequenceId}`,
    `variant:${variant.id}`,
    ...inputReferences.map((input) => `asset:${input.assetId}:${input.path}`)
  ];
  const baseCacheValue = {
    mode,
    projectId: normalizedProject.id,
    sequenceId,
    variantId: variant.id,
    outputPath: request.outputPath,
    profile: graphProfile,
    inputs: inputReferences,
    command: commandPlan.command
  };
  const planCacheIdentity = createCacheIdentity('render-graph-plan', cacheInputs, baseCacheValue);
  const passCacheIdentity = createCacheIdentity('render-graph-pass', [...cacheInputs, planCacheIdentity.key], {
    ...baseCacheValue,
    pass: operationNodeId
  });
  const artifactCacheIdentity = createCacheIdentity('render-graph-artifact', [passCacheIdentity.key], {
    outputPath: request.outputPath,
    profile: graphProfile,
    producer: operationNodeId
  });
  const requirementId = 'requirement:ffmpeg-render';
  const diagnosticId = 'diagnostic:ffmpeg-pass-boundary';
  const inputNodeIds = inputReferences.map((input) => input.id);
  const nodes: RenderGraphNode[] = [
    {
      id: `project:${normalizedProject.id}`,
      kind: 'project',
      label: normalizedProject.id,
      metadata: {
        projectId: normalizedProject.id
      }
    },
    {
      id: `sequence:${sequenceId}`,
      kind: 'sequence',
      label: sequenceId,
      metadata: {
        sequenceId
      }
    },
    {
      id: `variant:${variant.id}`,
      kind: 'variant',
      label: variant.id,
      metadata: {
        variantId: variant.id,
        clipCount: variant.clips.length
      }
    },
    ...inputReferences.map((input) => ({
      id: input.id,
      kind: 'input' as const,
      label: input.assetId,
      metadata: withoutUndefinedEntries({
        assetId: input.assetId,
        path: input.path,
        mediaType: input.mediaType,
        role: input.role,
        loop: input.loop,
        inputIndex: input.inputIndex
      })
    })),
    {
      id: operationNodeId,
      kind: 'operation',
      label: commandPlan.command.label,
      cacheIdentity: passCacheIdentity,
      metadata: {
        backend: 'ffmpeg',
        mode,
        usesMaskTransitions: usesMaskTransitions(variant)
      }
    },
    {
      id: artifactId,
      kind: 'artifact',
      label: request.outputPath,
      cacheIdentity: artifactCacheIdentity,
      metadata: {
        path: request.outputPath,
        role: getArtifactRole(mode)
      }
    }
  ];
  const edges = [
    {
      id: `edge:project:${normalizedProject.id}:sequence:${sequenceId}`,
      from: `project:${normalizedProject.id}`,
      to: `sequence:${sequenceId}`,
      kind: 'identity' as const
    },
    {
      id: `edge:sequence:${sequenceId}:variant:${variant.id}`,
      from: `sequence:${sequenceId}`,
      to: `variant:${variant.id}`,
      kind: 'timeline' as const
    },
    {
      id: `edge:variant:${variant.id}:${operationNodeId}`,
      from: `variant:${variant.id}`,
      to: operationNodeId,
      kind: 'timeline' as const
    },
    ...inputReferences.map((input) => ({
      id: `edge:${input.id}:${operationNodeId}`,
      from: input.id,
      to: operationNodeId,
      kind: 'media-input' as const,
      metadata: {
        inputIndex: input.inputIndex,
        loop: input.loop
      }
    })),
    {
      id: `edge:${operationNodeId}:${artifactId}`,
      from: operationNodeId,
      to: artifactId,
      kind: 'artifact-output' as const
    }
  ];
  const backendRequirements: RenderGraphBackendRequirement[] = [
    {
      id: requirementId,
      backend: 'ffmpeg',
      binary: resolvedTools.ffmpeg.path,
      required: true,
      capabilities: [
        'filter_complex',
        `video-codec:${graphProfile.videoCodec}`,
        `audio-codec:${graphProfile.audioCodec}`,
        `container:${graphProfile.container}`,
        `pixel-format:${graphProfile.pixelFormat}`
      ],
      provenance: resolvedTools.ffmpeg.provenance,
      metadata: withoutUndefinedEntries({
        source: resolvedTools.ffmpeg.source,
        envVar: resolvedTools.ffmpeg.envVar
      })
    }
  ];
  const diagnostics: RenderGraphCapabilityDiagnostic[] = [
    {
      id: diagnosticId,
      severity: 'info',
      code: 'FFMPEG_PASS_COMPATIBILITY',
      message: 'Render graph planning wraps the current FFmpeg command; execution is still performed by the existing command runner.',
      nodeId: operationNodeId,
      passId: 'pass:ffmpeg-render',
      requirementId
    }
  ];
  const artifacts: RenderGraphArtifact[] = [
    {
      id: artifactId,
      kind: 'video',
      role: getArtifactRole(mode),
      path: request.outputPath,
      profile: graphProfile,
      producedBy: 'pass:ffmpeg-render',
      cacheIdentity: artifactCacheIdentity
    }
  ];
  const passes: RenderGraphPass[] = [
    {
      id: 'pass:ffmpeg-render',
      backend: 'ffmpeg',
      label: commandPlan.command.label,
      nodeId: operationNodeId,
      order: 0,
      inputNodeIds,
      outputArtifactIds: [artifactId],
      command: commandPlan.command,
      requirements: [requirementId],
      diagnostics: [diagnosticId],
      cacheIdentity: passCacheIdentity,
      semantics: {
        operation: mode,
        profile: graphProfile,
        durationMs,
        usesMaskTransitions: usesMaskTransitions(variant),
        chunkedExportRecommended: mode === 'export' ? shouldUseChunkedExport(normalizedProject, variant, graphProfile) : false
      }
    }
  ];

  return {
    identity: {
      schemaVersion: 1,
      planId: `render-graph:${mode}:${normalizedProject.id}:${sequenceId}:${variant.id}:${planCacheIdentity.key}`,
      projectId: normalizedProject.id,
      sequenceId,
      variantId: variant.id,
      mode
    },
    target: {
      outputPath: request.outputPath,
      profile: graphProfile,
      durationMs
    },
    inputs: inputReferences,
    nodes,
    edges,
    passes,
    artifacts,
    backendRequirements,
    diagnostics,
    cacheIdentity: planCacheIdentity
  };
}

export function buildPreviewRenderGraphPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: PreviewRequest,
  tools?: ResolvedFfmpegTools
): RenderGraphPlan {
  return buildRenderGraphPlan(project, request, toRenderProfile(request, 'preview'), 'preview', tools);
}

export function buildExportRenderGraphPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: ExportRequest,
  tools?: ResolvedFfmpegTools
): RenderGraphPlan {
  return buildRenderGraphPlan(project, request, toRenderProfile(request, 'export'), 'export', tools);
}

export function buildProfileExportPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: Omit<ExportRequest, 'profile'> & { profileId: ExportProfileId },
  tools?: ResolvedFfmpegTools
): RenderPlan {
  return buildExportPlan(project, {
    ...request,
    profile: getExportProfileById(request.profileId)
  }, tools);
}
