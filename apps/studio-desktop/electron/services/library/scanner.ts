import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { LibraryAsset, LibraryRoot } from '@afterimage/studio-contracts';
import type { Logger } from '../logger.js';
import {
  findExistingAssetScan,
  getAssetById,
  listActiveAssetPaths,
  markAssetMissing,
  resolveScannedAnalysisStatus
} from './catalog.js';
import {
  getErrorMessage,
  inferMediaType,
  isIgnoredDirectory,
  isSupportedForRole,
  nowIso,
  stableHash,
  toSqlBool
} from './utils.js';

interface LibraryScannerOptions {
  db: DatabaseSync;
  logger: Logger;
  autoAnalyze: boolean;
  runAnalysisJob?: (root: LibraryRoot, assets: LibraryAsset[]) => void;
  getRoot(rootId: string): LibraryRoot;
  setRootScanStatus(rootId: string, status: LibraryRoot['lastScanStatus'], patch?: { error?: string }): void;
}

export function createLibraryScanner({
  db,
  logger,
  autoAnalyze,
  runAnalysisJob,
  getRoot,
  setRootScanStatus
}: LibraryScannerOptions) {
  async function scanRoot(rootId: string, signal?: AbortSignal, report?: (message: string, progress: number) => void): Promise<LibraryRoot> {
    const root = getRoot(rootId);
    const scannedAt = nowIso();
    const discoveredPaths = new Set<string>();
    const pendingAnalysisAssets: LibraryAsset[] = [];

    setRootScanStatus(root.id, 'running');
    await logger.log('info', 'Scanning media library root.', root.path);

    async function scanDirectory(directoryPath: string): Promise<void> {
      signal?.throwIfAborted();
      const entries = await readdir(directoryPath, { withFileTypes: true });
      let fileCount = 0;
      let supportedFileCount = 0;
      const directoryId = `dir-${stableHash(`${root.id}:${directoryPath}`)}`;
      const parentPath = directoryPath === root.path ? undefined : path.dirname(directoryPath);

      for (const entry of entries) {
        if (entry.isFile()) {
          fileCount += 1;
          if (isSupportedForRole(path.join(directoryPath, entry.name), root.role)) {
            supportedFileCount += 1;
          }
        }
      }

      db.prepare(`
        INSERT INTO library_directories (id, root_id, path, parent_path, file_count, supported_file_count, scanned_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
          root_id = excluded.root_id,
          parent_path = excluded.parent_path,
          file_count = excluded.file_count,
          supported_file_count = excluded.supported_file_count,
          scanned_at = excluded.scanned_at
      `).run(directoryId, root.id, directoryPath, parentPath ?? null, fileCount, supportedFileCount, scannedAt);

      report?.(`Scanning ${directoryPath}`, 0.25);

      for (const entry of entries) {
        const absolutePath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
          if (isIgnoredDirectory(absolutePath)) {
            continue;
          }
          await scanDirectory(absolutePath);
          continue;
        }
        if (!entry.isFile() || !isSupportedForRole(absolutePath, root.role)) {
          continue;
        }

        const fileStat = await stat(absolutePath);
        const mediaType = inferMediaType(absolutePath, root.role);
        const assetId = `catalog-${stableHash(`${root.role}:${absolutePath}`)}`;
        const hashKey = `${fileStat.size}:${Math.trunc(fileStat.mtimeMs)}`;
        const existing = findExistingAssetScan(db, assetId);
        const analysisStatus = resolveScannedAnalysisStatus({ mediaType, existing, hashKey });

        db.prepare(`
          INSERT INTO library_assets (
            id, root_id, directory_id, path, filename, media_type, asset_role, file_size, mtime_ms, hash_key,
            has_audio, analysis_status, missing, scanned_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
          ON CONFLICT(path) DO UPDATE SET
            root_id = excluded.root_id,
            directory_id = excluded.directory_id,
            filename = excluded.filename,
            media_type = excluded.media_type,
            asset_role = excluded.asset_role,
            file_size = excluded.file_size,
            mtime_ms = excluded.mtime_ms,
            hash_key = excluded.hash_key,
            analysis_status = excluded.analysis_status,
            missing = 0,
            scanned_at = excluded.scanned_at,
            updated_at = excluded.updated_at
        `).run(
          assetId,
          root.id,
          directoryId,
          absolutePath,
          entry.name,
          mediaType,
          root.role,
          fileStat.size,
          fileStat.mtimeMs,
          hashKey,
          toSqlBool(root.role === 'music' || mediaType === 'audio'),
          analysisStatus,
          scannedAt,
          scannedAt
        );
        discoveredPaths.add(absolutePath);

        const asset = getAssetById(db, assetId);
        if (asset.mediaType !== 'image' && asset.analysisStatus === 'pending') {
          pendingAnalysisAssets.push(asset);
        }
      }
    }

    try {
      await scanDirectory(root.path);
      for (const assetPath of listActiveAssetPaths(db, root.id)) {
        if (!discoveredPaths.has(assetPath)) {
          markAssetMissing(db, assetPath);
        }
      }

      setRootScanStatus(root.id, 'completed');
      await logger.log('info', 'Completed media library scan.', `${root.path} :: ${discoveredPaths.size} asset(s)`);

      if (autoAnalyze && pendingAnalysisAssets.length > 0) {
        runAnalysisJob?.(root, pendingAnalysisAssets);
      }

      return getRoot(root.id);
    } catch (error) {
      setRootScanStatus(root.id, 'failed', { error: getErrorMessage(error) });
      throw error;
    }
  }

  return { scanRoot };
}
