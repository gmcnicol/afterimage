import type { ExportProfileDefinition } from '@afterimage/export-profiles';

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
  videoMaxrateKbps?: number;
  videoBufsizeKbps?: number;
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

export interface FinalizeRenderRequest {
  concatListPath: string;
  outputPath: string;
  overwrite?: boolean;
  profile: RenderProfile;
  durationMs: number;
  musicPath?: string;
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
