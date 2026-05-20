import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { ResolveFfmpegToolsOptions, ResolvedFfmpegTools, ResolvedToolBinary } from './types.js';

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
