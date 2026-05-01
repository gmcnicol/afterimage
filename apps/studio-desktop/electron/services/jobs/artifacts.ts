import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export async function ensureArtifactDirs(projectRoot: string): Promise<void> {
  await Promise.all([
    mkdir(join(projectRoot, '.afterimage', 'analysis'), { recursive: true }),
    mkdir(join(projectRoot, '.afterimage', 'thumbnails'), { recursive: true }),
    mkdir(join(projectRoot, '.afterimage', 'waveforms'), { recursive: true }),
    mkdir(join(projectRoot, '.afterimage', 'preview'), { recursive: true }),
    mkdir(join(projectRoot, 'exports'), { recursive: true })
  ]);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolveAvailableOutputPath(basePath: string): Promise<string> {
  if (!(await pathExists(basePath))) {
    return basePath;
  }

  const extensionIndex = basePath.lastIndexOf('.');
  const baseName = extensionIndex >= 0 ? basePath.slice(0, extensionIndex) : basePath;
  const extension = extensionIndex >= 0 ? basePath.slice(extensionIndex) : '';

  for (let attempt = 1; attempt < 1000; attempt += 1) {
    const candidate = `${baseName}-${String(attempt).padStart(3, '0')}${extension}`;
    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }

  throw new Error(`Unable to allocate export filename for "${basePath}".`);
}

export function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, value));
}
