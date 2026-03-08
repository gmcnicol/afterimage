import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import {
  getPresetById,
  getSourceById,
  normalizeProject,
  type NormalizedProjectFile,
  type PresetFilter,
  type ProjectFile,
  type ProjectSource
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
  sourceId: string;
  probeOutputPath: string;
  analysisOutputPath: string;
  overwrite?: boolean;
  sceneThreshold?: number;
}

export interface AnalysisPlan {
  projectId: string;
  sourceId: string;
  sceneThreshold: number;
  artifacts: {
    probeOutputPath: string;
    analysisOutputPath: string;
  };
  commands: [CommandSpec, CommandSpec];
}

export interface RenderProfile {
  width: number;
  height: number;
  frameRate: number;
  container: 'mp4' | 'mov';
  videoCodec: 'libx264';
  audioCodec: 'aac';
  crf?: number;
  videoPreset?: 'medium' | 'fast' | 'slow';
  audioBitrateKbps?: number;
}

export interface RenderRequest {
  outputPath: string;
  overwrite?: boolean;
  profile: RenderProfile;
}

export interface RenderPlan {
  projectId: string;
  sequenceId: string;
  outputPath: string;
  command: CommandSpec;
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
}

export type CommandRunner = (
  binary: string,
  args: string[],
  options: CommandRunnerOptions
) => Promise<CommandExecutionResult>;

const DEFAULT_SCENE_THRESHOLD = 0.4;
const EXECUTABLE_ACCESS_MODE = 0o111;

function formatSeconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(3);
}

function formatDecimal(value: number, digits = 3): string {
  return value.toFixed(digits);
}

function normalizeForPlanning(project: ProjectFile | NormalizedProjectFile): NormalizedProjectFile {
  return 'analysisRefs' in project && 'midiMappings' in project ? normalizeProject(project) : normalizeProject(project as ProjectFile);
}

function ensureSource(project: NormalizedProjectFile, sourceId: string): ProjectSource {
  const source = getSourceById(project, sourceId);
  if (!source) {
    throw new Error(`Missing source "${sourceId}" in project "${project.id}".`);
  }

  return source;
}

function compilePresetFilters(filters: PresetFilter[]): string[] {
  return filters.map((filter) => {
    const effectiveAmount = filter.amount * (filter.mix ?? 1);

    switch (filter.type) {
      case 'tracking-wobble':
        return `gblur=sigma=${formatDecimal(0.2 + (effectiveAmount * 2))}`;
      case 'chroma-bleed':
        return `eq=saturation=${formatDecimal(1 - (effectiveAmount * 0.25))}`;
      case 'fluorescent-flicker':
        return `eq=brightness=${formatDecimal(effectiveAmount * 0.08)}`;
      case 'desaturation-lfo':
        return `eq=saturation=${formatDecimal(1 - effectiveAmount)}`;
      default:
        throw new Error(`Unsupported preset filter "${filter.type}" in Phase 1 render compiler.`);
    }
  });
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
      notes: `Resolved from PATH. Record the upstream binary source and version before redistribution.`
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

export function buildAnalysisPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: AnalysisRequest,
  tools?: ResolvedFfmpegTools
): AnalysisPlan {
  const normalizedProject = normalizeForPlanning(project);
  const source = ensureSource(normalizedProject, request.sourceId);
  const sceneThreshold = request.sceneThreshold ?? DEFAULT_SCENE_THRESHOLD;

  const resolvedTools = tools ?? {
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

  const ffprobeCommand: CommandSpec = {
    label: `probe:${request.sourceId}`,
    binary: resolvedTools.ffprobe.path,
    args: [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      source.path
    ],
    expectedOutputs: [request.probeOutputPath]
  };

  const ffmpegCommand: CommandSpec = {
    label: `scene-detect:${request.sourceId}`,
    binary: resolvedTools.ffmpeg.path,
    args: [
      '-hide_banner',
      '-loglevel', 'info',
      request.overwrite === false ? '-n' : '-y',
      '-i', source.path,
      '-filter:v', `select='gt(scene,${formatDecimal(sceneThreshold)})',metadata=print:file=-`,
      '-an',
      '-f', 'null',
      '-'
    ],
    expectedOutputs: [request.analysisOutputPath]
  };

  return {
    projectId: normalizedProject.id,
    sourceId: request.sourceId,
    sceneThreshold,
    artifacts: {
      probeOutputPath: request.probeOutputPath,
      analysisOutputPath: request.analysisOutputPath
    },
    commands: [ffprobeCommand, ffmpegCommand]
  };
}

function collectRenderInputs(project: NormalizedProjectFile): ProjectSource[] {
  const seen = new Set<string>();
  const inputs: ProjectSource[] = [];

  for (const item of project.sequence.items) {
    if (!seen.has(item.sourceId)) {
      seen.add(item.sourceId);
      inputs.push(ensureSource(project, item.sourceId));
    }
  }

  return inputs;
}

export function buildRenderPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: RenderRequest,
  tools?: ResolvedFfmpegTools
): RenderPlan {
  const normalizedProject = normalizeForPlanning(project);
  const resolvedTools = tools ?? {
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

  const inputs = collectRenderInputs(normalizedProject);
  const inputIndexBySourceId = new Map(inputs.map((source, index) => [source.id, index]));
  const includeAudio = normalizedProject.sequence.items.every((item) => ensureSource(normalizedProject, item.sourceId).hasAudio !== false);
  const filterSegments: string[] = [];
  const concatInputs: string[] = [];

  normalizedProject.sequence.items.forEach((item, index) => {
    const inputIndex = inputIndexBySourceId.get(item.sourceId);
    if (inputIndex === undefined) {
      throw new Error(`Missing input index for source "${item.sourceId}".`);
    }

    const preset = item.presetId ? getPresetById(normalizedProject, item.presetId) : undefined;
    const presetFilters = preset ? compilePresetFilters(preset.filters) : [];
    const videoFilters = [
      `trim=start=${formatSeconds(item.sourceStartMs)}:duration=${formatSeconds(item.durationMs)}`,
      'setpts=PTS-STARTPTS',
      ...presetFilters
    ];

    filterSegments.push(`[${inputIndex}:v]${videoFilters.join(',')}[v${index}]`);
    concatInputs.push(`[v${index}]`);

    if (includeAudio) {
      filterSegments.push(
        `[${inputIndex}:a]atrim=start=${formatSeconds(item.sourceStartMs)}:duration=${formatSeconds(item.durationMs)},asetpts=PTS-STARTPTS[a${index}]`
      );
      concatInputs.push(`[a${index}]`);
    }
  });

  if (includeAudio) {
    filterSegments.push(
      `${concatInputs.join('')}concat=n=${normalizedProject.sequence.items.length}:v=1:a=1[vconcat][aconcat]`
    );
    filterSegments.push(
      `[vconcat]fps=${formatDecimal(request.profile.frameRate)},scale=${request.profile.width}:${request.profile.height},format=yuv420p[vout]`
    );
  } else {
    filterSegments.push(
      `${concatInputs.join('')}concat=n=${normalizedProject.sequence.items.length}:v=1:a=0[vconcat]`
    );
    filterSegments.push(
      `[vconcat]fps=${formatDecimal(request.profile.frameRate)},scale=${request.profile.width}:${request.profile.height},format=yuv420p[vout]`
    );
  }

  const args = [
    request.overwrite === false ? '-n' : '-y',
    ...inputs.flatMap((source) => ['-i', source.path]),
    '-filter_complex', filterSegments.join(';'),
    '-map', '[vout]',
    '-c:v', request.profile.videoCodec,
    '-preset', request.profile.videoPreset ?? 'medium',
    '-crf', String(request.profile.crf ?? 18)
  ];

  if (includeAudio) {
    args.push(
      '-map', '[aconcat]',
      '-c:a', request.profile.audioCodec,
      '-b:a', `${request.profile.audioBitrateKbps ?? 192}k`
    );
  }

  args.push('-f', request.profile.container, request.outputPath);

  return {
    projectId: normalizedProject.id,
    sequenceId: normalizedProject.sequence.id,
    outputPath: request.outputPath,
    command: {
      label: `render:${normalizedProject.id}`,
      binary: resolvedTools.ffmpeg.path,
      args,
      expectedOutputs: [request.outputPath]
    }
  };
}

async function defaultCommandRunner(binary: string, args: string[], options: CommandRunnerOptions): Promise<CommandExecutionResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (exitCode) => {
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
    env: options.env ? { ...options.env, ...command.env } : (command.env ? { ...process.env, ...command.env } : options.env)
  });

  if ((options.rejectOnNonZeroExit ?? true) && result.exitCode !== 0) {
    throw new Error(`Command "${command.label}" failed with exit code ${result.exitCode}.`);
  }

  return result;
}
