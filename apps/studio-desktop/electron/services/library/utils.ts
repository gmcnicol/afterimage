import path from 'node:path';
import {
  normalizeProjectPathRef,
  slugify,
  type AssetRole,
  type MediaType,
  type ProbeMetadata,
  type ProjectPathRef
} from '@afterimage/project-model';
import type { LibraryAsset } from '@afterimage/studio-contracts';

export const videoExtensions = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi']);
export const audioExtensions = new Set(['.wav', '.mp3', '.aif', '.aiff', '.flac', '.m4a']);
export const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
export const supportedExtensions = new Set([...videoExtensions, ...audioExtensions, ...imageExtensions]);
export const ignoredDirectoryNames = new Set([
  '.git',
  '.turbo',
  'coverage',
  'dist',
  'dist-electron',
  'node_modules',
  'release'
]);

export function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function toSqlBool(value: boolean): number {
  return value ? 1 : 0;
}

export function inferMediaType(filePath: string, role: AssetRole): MediaType {
  const extension = path.extname(filePath).toLowerCase();
  if (role === 'music' || audioExtensions.has(extension)) {
    return 'audio';
  }
  if (imageExtensions.has(extension)) {
    return 'image';
  }
  return 'video';
}

export function isIgnoredDirectory(directoryPath: string): boolean {
  return ignoredDirectoryNames.has(path.basename(directoryPath).toLowerCase());
}

export function isSupportedForRole(filePath: string, role: AssetRole): boolean {
  const extension = path.extname(filePath).toLowerCase();
  if (role === 'source') {
    return videoExtensions.has(extension);
  }
  if (role === 'transition-mask' || role === 'transition-overlay') {
    return videoExtensions.has(extension) || imageExtensions.has(extension);
  }
  if (role === 'music') {
    return audioExtensions.has(extension);
  }
  return supportedExtensions.has(extension);
}

export function pathsOverlap(leftPath: string, rightPath: string): boolean {
  const relative = path.relative(leftPath, rightPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function firstVideoStream(probe: ProbeMetadata) {
  return probe.streams.find((stream) => stream.codecType === 'video');
}

export function parseFrameRate(value: string | undefined): number | undefined {
  if (!value || value === '0/0') {
    return undefined;
  }
  const [numerator, denominator] = value.split('/').map((part) => Number.parseFloat(part));
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return undefined;
  }
  return Number((numerator / denominator).toFixed(3));
}

export function buildPathRef(projectRoot: string | undefined, absolutePath: string): ProjectPathRef {
  if (!projectRoot) {
    return { absolutePath };
  }
  const relativePath = path.relative(projectRoot, absolutePath);
  return normalizeProjectPathRef({
    absolutePath,
    relativePath: relativePath.startsWith('..') ? undefined : relativePath.replace(/\\/g, '/')
  });
}

export function buildAssetId(asset: Pick<LibraryAsset, 'assetRole' | 'path' | 'filename'>): string {
  const stem = path.basename(asset.filename, path.extname(asset.filename));
  return `asset-${slugify(stem) || 'catalog'}-${slugify(asset.assetRole)}-${stableHash(`${asset.assetRole}:${asset.path}`).slice(0, 8)}`;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
