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

function collectRenderInputs(project: NormalizedProjectFile, variant: Variant): { assetId: string; path: string }[] {
  const seen = new Set<string>();
  const inputs: { assetId: string; path: string }[] = [];

  for (const clip of variant.clips) {
    if (!seen.has(clip.assetId)) {
      const asset = ensureAsset(project, clip.assetId);
      seen.add(clip.assetId);
      inputs.push({ assetId: clip.assetId, path: asset.path.absolutePath });
    }
  }

  const musicAssetId = variant.musicAlignment?.primaryAssetId;
  if (musicAssetId && !seen.has(musicAssetId)) {
    const asset = ensureAsset(project, musicAssetId);
    inputs.push({ assetId: musicAssetId, path: asset.path.absolutePath });
  }

  return inputs;
}

function buildRenderCommand(
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
  const includeClipAudio = musicInputIndex === undefined && variant.clips.every((clip) => ensureAsset(project, clip.assetId).hasAudio);

  let segmentIndex = 0;

  variant.clips.forEach((clip) => {
    const inputIndex = inputIndexByAssetId.get(clip.assetId);
    if (inputIndex === undefined) {
      throw new Error(`Missing input index for asset "${clip.assetId}".`);
    }

    for (const segment of collectClipRenderSegments(project, variant, clip)) {
      const videoFilters = [
        `trim=start=${formatSeconds(segment.sourceStartMs)}:duration=${formatSeconds(segment.durationMs)}`,
        'setpts=PTS-STARTPTS',
        ...segment.filterExpressions,
        `fps=${formatDecimal(profile.frameRate)}`,
        `scale=${profile.width}:${profile.height}`,
        'setsar=1',
        `format=${profile.pixelFormat}`
      ];

      filterSegments.push(`[${inputIndex}:v]${videoFilters.join(',')}[v${segmentIndex}]`);
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

  filterSegments.push(`[vconcat]format=${profile.pixelFormat}[vout]`);

  if (musicInputIndex !== undefined) {
    filterSegments.push(`[${musicInputIndex}:a]atrim=start=0:duration=${formatSeconds(getVariantDuration(variant))},asetpts=PTS-STARTPTS[amusic]`);
  }

  const args = [
    request.overwrite === false ? '-n' : '-y',
    ...inputs.flatMap((input) => ['-i', input.path]),
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
    throw new Error(`Command "${command.label}" failed with exit code ${result.exitCode}.`);
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
