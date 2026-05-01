import path from 'node:path';
import type { MediaAsset } from '@afterimage/project-model';
import type { LibraryAsset } from '@afterimage/studio-contracts';
import { buildAssetId, buildPathRef } from './utils.js';

export function importCatalogAssets(input: {
  projectRoot?: string;
  assets: LibraryAsset[];
}): MediaAsset[] {
  return input.assets.map((asset) => ({
    id: buildAssetId(asset),
    filename: asset.filename,
    mediaType: asset.mediaType,
    assetRole: asset.assetRole,
    path: buildPathRef(input.projectRoot, asset.path),
    label: path.basename(asset.filename, path.extname(asset.filename)),
    durationMs: asset.durationMs,
    width: asset.width,
    height: asset.height,
    frameRate: asset.frameRate,
    hasAudio: asset.hasAudio,
    importStatus: 'ready',
    analysisStatus: asset.analysisStatus,
    tags: asset.assetRole === 'music' ? ['music'] : []
  }));
}
