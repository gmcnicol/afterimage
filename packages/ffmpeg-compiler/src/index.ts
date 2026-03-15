import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { getExportProfileById, type ExportProfileDefinition, type ExportProfileId } from '@afterimage/export-profiles';
import {
  getAssetById,
  getAutomationLaneById,
  getCutCandidateById,
  getDefaultSequence,
  getDefaultVariant,
  getFilterDefinition,
  getFilterStackById,
  getFilterParameterValue,
  getPrimaryAutomationProperty,
  getPresetById,
  getSequenceById,
  getSupportedAutomationProperties,
  getVariantById,
  isSupportedFilterType,
  normalizeProject,
  type AutomationLane,
  type FilterInstance,
  type FilterStack,
  type NormalizedProjectFile,
  type PresetFilter,
  type ProjectFile,
  type SequenceClip,
  type Variant
} from '@afterimage/project-model';

type ResolutionSource = 'env' | 'path';

export interface CommandSpec {
  label: string;
  binary: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  expectedOutputs?: string[];
}

export interface AnalysisRequest {
  assetId: string;
  probeOutputPath: string;
  analysisOutputPath: string;
  overwrite?: boolean;
  sceneThreshold?: number;
}

export interface AudioChangeAnalysisRequest {
  assetId: string;
  astatsOutputPath: string;
  aspectralstatsOutputPath: string;
  ebur128OutputPath: string;
  silencedetectOutputPath: string;
  overwrite?: boolean;
}

export interface ThumbnailRequest {
  assetId: string;
  outputPattern: string;
  manifestOutputPath: string;
  overwrite?: boolean;
  width?: number;
}

export interface WaveformRequest {
  assetId: string;
  outputPath: string;
  overwrite?: boolean;
  width?: number;
  height?: number;
}

export interface PreviewRequest {
  sequenceId?: string;
  variantId?: string;
  outputPath: string;
  overwrite?: boolean;
  width?: number;
  height?: number;
  frameRate?: number;
}

export interface ExportRequest {
  sequenceId?: string;
  variantId?: string;
  outputPath: string;
  overwrite?: boolean;
  profile: ExportProfileDefinition;
}

export interface AnalysisPlan {
  projectId: string;
  assetId: string;
  sceneThreshold: number;
  artifacts: {
    probeOutputPath: string;
    analysisOutputPath: string;
  };
  commands: [CommandSpec, CommandSpec];
}

export interface AudioChangeAnalysisPlan {
  projectId: string;
  assetId: string;
  artifacts: {
    astatsOutputPath: string;
    aspectralstatsOutputPath: string;
    ebur128OutputPath: string;
    silencedetectOutputPath: string;
  };
  commands: [CommandSpec, CommandSpec, CommandSpec, CommandSpec];
}

export interface ThumbnailPlan {
  projectId: string;
  assetId: string;
  command: CommandSpec;
  manifestOutputPath: string;
}

export interface WaveformPlan {
  projectId: string;
  assetId: string;
  command: CommandSpec;
}

export interface RenderProfile {
  width: number;
  height: number;
  frameRate: number;
  container: 'mp4' | 'mov';
  videoCodec: 'libx264' | 'prores_ks';
  audioCodec: 'aac' | 'pcm_s24le';
  pixelFormat: 'yuv420p' | 'yuv422p10le';
  videoProfile?: '3';
  crf?: number;
  videoPreset?: 'medium' | 'fast' | 'slow';
  audioBitrateKbps?: number;
}

export interface RenderRequest {
  outputPath: string;
  overwrite?: boolean;
  profile: RenderProfile;
  sequenceId?: string;
  variantId?: string;
}

export interface PreviewPlan {
  projectId: string;
  sequenceId: string;
  variantId: string;
  outputPath: string;
  command: CommandSpec;
}

export interface RenderPlan {
  projectId: string;
  sequenceId: string;
  variantId: string;
  outputPath: string;
  command: CommandSpec;
}

export interface ToolVersionInfo {
  path: string;
  versionLine?: string;
  available: boolean;
}

export interface ToolHealthReport {
  available: boolean;
  versions: {
    ffmpeg: ToolVersionInfo;
    ffprobe: ToolVersionInfo;
    ffplay?: ToolVersionInfo;
  };
  warnings: string[];
}

export interface FfmpegProvenance {
  source: ResolutionSource;
  license: 'LGPL';
  lgplOnly: true;
  notes: string;
}

export interface ResolvedToolBinary {
  path: string;
  source: ResolutionSource;
  envVar?: string;
  provenance: FfmpegProvenance;
}

export interface ResolvedFfmpegTools {
  ffmpeg: ResolvedToolBinary;
  ffprobe: ResolvedToolBinary;
  ffplay?: ResolvedToolBinary;
}

export interface ResolveFfmpegToolsOptions {
  env?: NodeJS.ProcessEnv;
}

export interface CommandExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CommandRunnerOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export type CommandRunner = (
  binary: string,
  args: string[],
  options: CommandRunnerOptions
) => Promise<CommandExecutionResult>;

const DEFAULT_SCENE_THRESHOLD = 0.4;

function formatSeconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(3);
}

function formatDecimal(value: number, digits = 3): string {
  return value.toFixed(digits);
}

function normalizeForPlanning(project: ProjectFile | NormalizedProjectFile): NormalizedProjectFile {
  return normalizeProject(project as ProjectFile);
}

function ensureAsset(project: NormalizedProjectFile, assetId: string) {
  const asset = getAssetById(project, assetId);
  if (!asset) {
    throw new Error(`Missing asset "${assetId}" in project "${project.id}".`);
  }

  return asset;
}

function resolveTimeline(project: NormalizedProjectFile, sequenceId?: string, variantId?: string): { sequenceId: string; variant: Variant } {
  const sequence = sequenceId ? getSequenceById(project, sequenceId) : getDefaultSequence(project);
  if (!sequence) {
    throw new Error(`Project "${project.id}" does not define a sequence.`);
  }

  const variant = variantId
    ? getVariantById(project, variantId)
    : (sequence.defaultVariantId ? getVariantById(project, sequence.defaultVariantId) : getDefaultVariant(project, sequence.id));

  if (!variant) {
    throw new Error(`Sequence "${sequence.id}" does not define a variant.`);
  }

  return {
    sequenceId: sequence.id,
    variant
  };
}

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
    case 'chroma-bleed':
      return `eq=saturation=${formatDecimal(1 - (effectiveAmount * 0.25))}`;
    case 'bloom-soft':
      return `gblur=sigma=${formatDecimal(0.4 + (effectiveAmount * 4))}`;
    case 'glitch-bands':
      return `noise=alls=${formatDecimal(4 + (effectiveAmount * 24), 1)}:allf=t`;
    case 'blur':
      return `gblur=sigma=${formatDecimal(0.4 + (effectiveAmount * 5))}`;
    case 'contrast':
      return `eq=contrast=${formatDecimal(1 + effectiveAmount)}`;
    case 'brightness':
      return `eq=brightness=${formatDecimal((effectiveAmount - 0.5) * 0.2)}`;
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

function resolveToolFromPath(binaryName: string, env: NodeJS.ProcessEnv): string | undefined {
  const pathValue = env.PATH ?? process.env.PATH ?? '';
  const candidates = pathValue.split(delimiter).filter(Boolean);

  for (const segment of candidates) {
    const candidate = join(segment, binaryName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function resolveRequiredTool(binaryName: 'ffmpeg' | 'ffprobe', envVar: 'AFTERIMAGE_FFMPEG_PATH' | 'AFTERIMAGE_FFPROBE_PATH', env: NodeJS.ProcessEnv): ResolvedToolBinary {
  const envOverride = env[envVar];
  if (envOverride) {
    return {
      path: envOverride,
      source: 'env',
      envVar,
      provenance: {
        source: 'env',
        license: 'LGPL',
        lgplOnly: true,
        notes: `Resolved from ${envVar}. Record the upstream binary source and version before redistribution.`
      }
    };
  }

  const resolvedPath = resolveToolFromPath(binaryName, env);
  if (!resolvedPath) {
    throw new Error(`Unable to resolve ${binaryName}. Set ${envVar} or ensure ${binaryName} is present on PATH.`);
  }

  return {
    path: resolvedPath,
    source: 'path',
    provenance: {
      source: 'path',
      license: 'LGPL',
      lgplOnly: true,
      notes: 'Resolved from PATH. Record the upstream binary source and version before redistribution.'
    }
  };
}

function resolveOptionalTool(binaryName: 'ffplay', envVar: 'AFTERIMAGE_FFPLAY_PATH', env: NodeJS.ProcessEnv): ResolvedToolBinary | undefined {
  const envOverride = env[envVar];
  if (envOverride) {
    return {
      path: envOverride,
      source: 'env',
      envVar,
      provenance: {
        source: 'env',
        license: 'LGPL',
        lgplOnly: true,
        notes: `Resolved from ${envVar}. Record the upstream binary source and version before redistribution.`
      }
    };
  }

  const resolvedPath = resolveToolFromPath(binaryName, env);
  if (!resolvedPath) {
    return undefined;
  }

  return {
    path: resolvedPath,
    source: 'path',
    provenance: {
      source: 'path',
      license: 'LGPL',
      lgplOnly: true,
      notes: 'Resolved from PATH. Record the upstream binary source and version before redistribution.'
    }
  };
}

export function resolveFfmpegTools(options: ResolveFfmpegToolsOptions = {}): ResolvedFfmpegTools {
  const env = options.env ?? process.env;

  return {
    ffmpeg: resolveRequiredTool('ffmpeg', 'AFTERIMAGE_FFMPEG_PATH', env),
    ffprobe: resolveRequiredTool('ffprobe', 'AFTERIMAGE_FFPROBE_PATH', env),
    ffplay: resolveOptionalTool('ffplay', 'AFTERIMAGE_FFPLAY_PATH', env)
  };
}

function makePlanningTools(tools?: ResolvedFfmpegTools): ResolvedFfmpegTools {
  return tools ?? {
    ffmpeg: {
      path: 'ffmpeg',
      source: 'path',
      provenance: {
        source: 'path',
        license: 'LGPL',
        lgplOnly: true,
        notes: 'Unresolved placeholder binary name for deterministic command planning.'
      }
    },
    ffprobe: {
      path: 'ffprobe',
      source: 'path',
      provenance: {
        source: 'path',
        license: 'LGPL',
        lgplOnly: true,
        notes: 'Unresolved placeholder binary name for deterministic command planning.'
      }
    }
  };
}

export function buildAnalysisPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: AnalysisRequest,
  tools?: ResolvedFfmpegTools
): AnalysisPlan {
  const normalizedProject = normalizeForPlanning(project);
  const asset = ensureAsset(normalizedProject, request.assetId);
  const sceneThreshold = request.sceneThreshold ?? DEFAULT_SCENE_THRESHOLD;
  const resolvedTools = makePlanningTools(tools);

  const ffprobeCommand: CommandSpec = {
    label: `probe:${request.assetId}`,
    binary: resolvedTools.ffprobe.path,
    args: [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      asset.path.absolutePath
    ],
    expectedOutputs: [request.probeOutputPath]
  };

  const ffmpegCommand: CommandSpec = {
    label: `scene-detect:${request.assetId}`,
    binary: resolvedTools.ffmpeg.path,
    args: [
      '-hide_banner',
      '-loglevel', 'info',
      request.overwrite === false ? '-n' : '-y',
      '-i', asset.path.absolutePath,
      '-filter:v', `select='gt(scene,${formatDecimal(sceneThreshold)})',metadata=print:file=-`,
      '-an',
      '-f', 'null',
      '-'
    ],
    expectedOutputs: [request.analysisOutputPath]
  };

  return {
    projectId: normalizedProject.id,
    assetId: request.assetId,
    sceneThreshold,
    artifacts: {
      probeOutputPath: request.probeOutputPath,
      analysisOutputPath: request.analysisOutputPath
    },
    commands: [ffprobeCommand, ffmpegCommand]
  };
}

export function buildThumbnailPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: ThumbnailRequest,
  tools?: ResolvedFfmpegTools
): ThumbnailPlan {
  const normalizedProject = normalizeForPlanning(project);
  const asset = ensureAsset(normalizedProject, request.assetId);
  const resolvedTools = makePlanningTools(tools);

  return {
    projectId: normalizedProject.id,
    assetId: request.assetId,
    manifestOutputPath: request.manifestOutputPath,
    command: {
      label: `thumbnails:${request.assetId}`,
      binary: resolvedTools.ffmpeg.path,
      args: [
        request.overwrite === false ? '-n' : '-y',
        '-i', asset.path.absolutePath,
        '-vf', `fps=1,scale=${request.width ?? 640}:-1`,
        '-q:v', '4',
        request.outputPattern
      ],
      expectedOutputs: [request.manifestOutputPath]
    }
  };
}

export function buildAudioChangeAnalysisPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: AudioChangeAnalysisRequest,
  tools?: ResolvedFfmpegTools
): AudioChangeAnalysisPlan {
  const normalizedProject = normalizeForPlanning(project);
  const asset = ensureAsset(normalizedProject, request.assetId);
  const resolvedTools = makePlanningTools(tools);
  const overwriteFlag = request.overwrite === false ? '-n' : '-y';

  return {
    projectId: normalizedProject.id,
    assetId: request.assetId,
    artifacts: {
      astatsOutputPath: request.astatsOutputPath,
      aspectralstatsOutputPath: request.aspectralstatsOutputPath,
      ebur128OutputPath: request.ebur128OutputPath,
      silencedetectOutputPath: request.silencedetectOutputPath
    },
    commands: [
      {
        label: `audio-change:astats:${request.assetId}`,
        binary: resolvedTools.ffmpeg.path,
        args: [
          '-hide_banner',
          '-loglevel', 'info',
          overwriteFlag,
          '-i', asset.path.absolutePath,
          '-vn',
          '-af', 'astats=metadata=1:reset=1,ametadata=print:file=-',
          '-f', 'null',
          '-'
        ],
        expectedOutputs: [request.astatsOutputPath]
      },
      {
        label: `audio-change:aspectralstats:${request.assetId}`,
        binary: resolvedTools.ffmpeg.path,
        args: [
          '-hide_banner',
          '-loglevel', 'info',
          overwriteFlag,
          '-i', asset.path.absolutePath,
          '-vn',
          '-af', 'aspectralstats=win_size=2048:overlap=0.5,ametadata=print:file=-',
          '-f', 'null',
          '-'
        ],
        expectedOutputs: [request.aspectralstatsOutputPath]
      },
      {
        label: `audio-change:ebur128:${request.assetId}`,
        binary: resolvedTools.ffmpeg.path,
        args: [
          '-hide_banner',
          '-loglevel', 'info',
          overwriteFlag,
          '-i', asset.path.absolutePath,
          '-vn',
          '-af', 'ebur128=metadata=1,ametadata=print:file=-',
          '-f', 'null',
          '-'
        ],
        expectedOutputs: [request.ebur128OutputPath]
      },
      {
        label: `audio-change:silencedetect:${request.assetId}`,
        binary: resolvedTools.ffmpeg.path,
        args: [
          '-hide_banner',
          '-loglevel', 'info',
          overwriteFlag,
          '-i', asset.path.absolutePath,
          '-vn',
          '-af', 'silencedetect=noise=-40dB:d=0.4',
          '-f', 'null',
          '-'
        ],
        expectedOutputs: [request.silencedetectOutputPath]
      }
    ]
  };
}

export function buildWaveformPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: WaveformRequest,
  tools?: ResolvedFfmpegTools
): WaveformPlan {
  const normalizedProject = normalizeForPlanning(project);
  const asset = ensureAsset(normalizedProject, request.assetId);
  const resolvedTools = makePlanningTools(tools);

  return {
    projectId: normalizedProject.id,
    assetId: request.assetId,
    command: {
      label: `waveform:${request.assetId}`,
      binary: resolvedTools.ffmpeg.path,
      args: [
        request.overwrite === false ? '-n' : '-y',
        '-i', asset.path.absolutePath,
        '-filter_complex', `aformat=channel_layouts=stereo,showwavespic=s=${request.width ?? 960}x${request.height ?? 240}`,
        '-frames:v', '1',
        request.outputPath
      ],
      expectedOutputs: [request.outputPath]
    }
  };
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
  }

  const musicAssetId = variant.musicAlignment?.primaryAssetId;
  if (musicAssetId && !seen.has(musicAssetId)) {
    const asset = ensureAsset(project, musicAssetId);
    inputs.push({ assetId: musicAssetId, path: asset.path.absolutePath });
  }

  return inputs;
}

function usesMaskTransitions(variant: Variant): boolean {
  return variant.clips.some((clip) => clip.transition === 'mask');
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

function buildMaskAssetChain(inputIndex: number, durationMs: number, profile: RenderProfile, outputLabel: string): string {
  return `[${inputIndex}:v]trim=start=0:duration=${formatSeconds(durationMs)},setpts=PTS-STARTPTS,fps=${formatDecimal(profile.frameRate)},scale=${profile.width}:${profile.height},setsar=1,format=gray[${outputLabel}]`;
}

function buildOverlayAssetChain(inputIndex: number, durationMs: number, profile: RenderProfile, outputLabel: string): string {
  return `[${inputIndex}:v]trim=start=0:duration=${formatSeconds(durationMs)},setpts=PTS-STARTPTS,fps=${formatDecimal(profile.frameRate)},scale=${profile.width}:${profile.height},setsar=1,format=gray,eq=contrast=1.02:brightness=0.01,format=${profile.pixelFormat}[${outputLabel}]`;
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

  const overlayLabel = `${options.outputLabel}_overlay`;
  filterSegments.push(buildOverlayAssetChain(options.overlayInputIndex, options.durationMs, options.profile, overlayLabel));
  // Apply overlays only to luma so grayscale texture does not contaminate chroma planes.
  filterSegments.push(
    `[${baseLabel}][${overlayLabel}]blend=c0_expr='min(255,A+B*0.28)':c1_expr='A':c2_expr='A'[${options.outputLabel}]`
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
  const includeClipAudio = musicInputIndex === undefined && variant.clips.every((clip) => ensureAsset(project, clip.assetId).hasAudio);

  let segmentIndex = 0;

  for (let index = 0; index < variant.clips.length; index += 1) {
    const clip = variant.clips[index];
    const nextClip = variant.clips[index + 1];
    const previousClip = variant.clips[index - 1];
    const clipInputIndex = inputIndexByAssetId.get(clip.assetId);
    const clipOverlayInputIndex = clip.overlayAssetId ? inputIndexByAssetId.get(clip.overlayAssetId) : undefined;
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
      const maskInputIndex = inputIndexByAssetId.get(clip.transitionAssetId);
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

      appendVideoSegmentWithOptionalOverlay(filterSegments, {
        clipInputIndex,
        overlayInputIndex: clipOverlayInputIndex,
        sourceStartMs: clip.sourceStartMs + clip.durationMs - outgoingTransitionMs,
        durationMs: outgoingTransitionMs,
        filterExpressions: getClipFilterExpressionsAtTime(project, variant, clip, clip.timelineStartMs + clip.durationMs - Math.round(outgoingTransitionMs / 2)),
        profile,
        outputLabel: leftLabel
      });
      appendVideoSegmentWithOptionalOverlay(filterSegments, {
        clipInputIndex: nextInputIndex,
        overlayInputIndex: nextOverlayInputIndex,
        sourceStartMs: nextClip.sourceStartMs,
        durationMs: outgoingTransitionMs,
        filterExpressions: getClipFilterExpressionsAtTime(project, variant, nextClip, nextClip.timelineStartMs + Math.round(outgoingTransitionMs / 2)),
        profile,
        outputLabel: rightLabel
      });
      filterSegments.push(buildMaskAssetChain(maskInputIndex, outgoingTransitionMs, profile, maskLabel));
      filterSegments.push(`[${leftLabel}][${rightLabel}][${maskLabel}]maskedmerge[${mergedLabel}]`);
      filterSegments.push(`[${mergedLabel}]null[${transitionOutputLabel}]`);

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

  if (profile.videoCodec === 'libx264') {
    args.push(
      '-preset', profile.videoPreset ?? 'medium',
      '-crf', String(profile.crf ?? 18)
    );
  } else if (profile.videoCodec === 'prores_ks') {
    args.push('-profile:v', profile.videoProfile ?? '3');
  }

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
  const includeClipAudio = musicInputIndex === undefined && variant.clips.every((clip) => ensureAsset(project, clip.assetId).hasAudio);

  let segmentIndex = 0;

  variant.clips.forEach((clip) => {
    const inputIndex = inputIndexByAssetId.get(clip.assetId);
    const overlayInputIndex = clip.overlayAssetId ? inputIndexByAssetId.get(clip.overlayAssetId) : undefined;
    if (inputIndex === undefined) {
      throw new Error(`Missing input index for asset "${clip.assetId}".`);
    }

    for (const segment of collectClipRenderSegments(project, variant, clip)) {
      appendVideoSegmentWithOptionalOverlay(filterSegments, {
        clipInputIndex: inputIndex,
        overlayInputIndex,
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

  if (profile.videoCodec === 'libx264') {
    args.push(
      '-preset', profile.videoPreset ?? 'medium',
      '-crf', String(profile.crf ?? 18)
    );
  } else if (profile.videoCodec === 'prores_ks') {
    args.push('-profile:v', profile.videoProfile ?? '3');
  }

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

async function defaultCommandRunner(binary: string, args: string[], options: CommandRunnerOptions): Promise<CommandExecutionResult> {
  if (options.signal?.aborted) {
    throw new DOMException('Command aborted before start.', 'AbortError');
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    const abortHandler = () => {
      child.kill('SIGTERM');
      reject(new DOMException(`Command "${binary}" aborted.`, 'AbortError'));
    };

    options.signal?.addEventListener('abort', abortHandler, { once: true });

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      options.signal?.removeEventListener('abort', abortHandler);
      reject(error);
    });

    child.on('close', (exitCode) => {
      options.signal?.removeEventListener('abort', abortHandler);
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr
      });
    });
  });
}

export async function executeCommandSpec(
  command: CommandSpec,
  options: CommandRunnerOptions & { runner?: CommandRunner; rejectOnNonZeroExit?: boolean } = {}
): Promise<CommandExecutionResult> {
  const runner = options.runner ?? defaultCommandRunner;
  const result = await runner(command.binary, command.args, {
    cwd: options.cwd ?? command.cwd,
    env: options.env ? { ...options.env, ...command.env } : (command.env ? { ...process.env, ...command.env } : options.env),
    signal: options.signal
  });

  if ((options.rejectOnNonZeroExit ?? true) && result.exitCode !== 0) {
    const stderrTail = result.stderr
      .trim()
      .split('\n')
      .slice(-12)
      .join('\n')
      .trim();
    const details = stderrTail ? `\n${stderrTail}` : '';
    throw new Error(`Command "${command.label}" failed with exit code ${result.exitCode}.${details}`);
  }

  return result;
}

export async function getToolchainHealth(
  tools: ResolvedFfmpegTools,
  options: { runner?: CommandRunner; env?: NodeJS.ProcessEnv } = {}
): Promise<ToolHealthReport> {
  const runner = options.runner ?? defaultCommandRunner;
  const warnings: string[] = [];

  async function inspect(tool: ResolvedToolBinary | undefined, binaryName: string): Promise<ToolVersionInfo | undefined> {
    if (!tool) {
      warnings.push(`${binaryName} is not available.`);
      return undefined;
    }

    try {
      const result = await runner(tool.path, ['-version'], { env: options.env });
      const versionLine = (result.stdout || result.stderr).split(/\r?\n/).find(Boolean);
      return {
        path: tool.path,
        versionLine,
        available: result.exitCode === 0
      };
    } catch (error) {
      warnings.push(`${binaryName} version probe failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        path: tool.path,
        available: false
      };
    }
  }

  const ffmpeg = await inspect(tools.ffmpeg, 'ffmpeg');
  const ffprobe = await inspect(tools.ffprobe, 'ffprobe');
  const ffplay = await inspect(tools.ffplay, 'ffplay');
  const available = Boolean(ffmpeg?.available && ffprobe?.available);

  return {
    available,
    versions: {
      ffmpeg: ffmpeg ?? { path: '', available: false },
      ffprobe: ffprobe ?? { path: '', available: false },
      ffplay
    },
    warnings
  };
}
