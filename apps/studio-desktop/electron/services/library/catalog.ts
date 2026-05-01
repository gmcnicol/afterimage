import type { DatabaseSync } from 'node:sqlite';
import type {
  LibraryAsset,
  LibraryDirectory,
  LibraryRoot,
  LibraryScanStatus,
  LibrarySearchRequest,
  LibrarySearchResult
} from '@afterimage/studio-contracts';
import type { AnalysisRef, AnalysisStatus, AssetRole, MediaType } from '@afterimage/project-model';
import type { AssetRow, DirectoryRow, RootRow, RootStatusPatch } from './types.js';
import { nowIso } from './utils.js';

export function initializeLibraryDatabase(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS library_roots (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_scan_status TEXT NOT NULL DEFAULT 'idle',
      last_scan_started_at TEXT,
      last_scan_ended_at TEXT,
      last_scan_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS library_directories (
      id TEXT PRIMARY KEY,
      root_id TEXT NOT NULL REFERENCES library_roots(id) ON DELETE CASCADE,
      path TEXT NOT NULL UNIQUE,
      parent_path TEXT,
      file_count INTEGER NOT NULL DEFAULT 0,
      supported_file_count INTEGER NOT NULL DEFAULT 0,
      scanned_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS library_assets (
      id TEXT PRIMARY KEY,
      root_id TEXT NOT NULL REFERENCES library_roots(id) ON DELETE CASCADE,
      directory_id TEXT NOT NULL REFERENCES library_directories(id) ON DELETE CASCADE,
      path TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      media_type TEXT NOT NULL,
      asset_role TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mtime_ms REAL NOT NULL,
      hash_key TEXT NOT NULL,
      duration_ms INTEGER,
      width INTEGER,
      height INTEGER,
      frame_rate REAL,
      has_audio INTEGER NOT NULL DEFAULT 0,
      analysis_status TEXT NOT NULL DEFAULT 'pending',
      missing INTEGER NOT NULL DEFAULT 0,
      scanned_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS library_analysis_refs (
      asset_id TEXT PRIMARY KEY REFERENCES library_assets(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      path TEXT NOT NULL,
      thumbnail_manifest_path TEXT,
      waveform_path TEXT,
      summary TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_library_assets_role ON library_assets(asset_role);
    CREATE INDEX IF NOT EXISTS idx_library_assets_status ON library_assets(analysis_status);
    CREATE INDEX IF NOT EXISTS idx_library_assets_root ON library_assets(root_id);
  `);
}

export function resolveScannedAnalysisStatus(input: {
  mediaType: MediaType;
  existing?: Pick<AssetRow, 'hash_key' | 'analysis_status'>;
  hashKey: string;
}): AnalysisStatus {
  if (input.mediaType === 'image') {
    return 'completed';
  }

  if (!input.existing || input.existing.hash_key !== input.hashKey) {
    return 'pending';
  }

  if (input.existing.analysis_status === 'completed' || input.existing.analysis_status === 'pending') {
    return input.existing.analysis_status as AnalysisStatus;
  }

  return 'pending';
}

export function rootFromRow(row: RootRow): LibraryRoot {
  return {
    id: row.id,
    path: row.path,
    role: row.role as AssetRole,
    enabled: Boolean(row.enabled),
    lastScanStatus: row.last_scan_status as LibraryScanStatus,
    lastScanStartedAt: row.last_scan_started_at,
    lastScanEndedAt: row.last_scan_ended_at,
    lastScanError: row.last_scan_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function directoryFromRow(row: DirectoryRow): LibraryDirectory {
  return {
    id: row.id,
    rootId: row.root_id,
    path: row.path,
    parentPath: row.parent_path,
    fileCount: row.file_count,
    supportedFileCount: row.supported_file_count,
    scannedAt: row.scanned_at
  };
}

export function assetFromRow(row: AssetRow): LibraryAsset {
  const analysisSummary = row.analysis_summary ? JSON.parse(row.analysis_summary) as AnalysisRef['summary'] : undefined;
  const analysisRef = row.analysis_ref_id && row.analysis_path
    ? {
      id: row.analysis_ref_id,
      assetId: row.id,
      path: row.analysis_path,
      thumbnailManifestPath: row.thumbnail_manifest_path,
      waveformPath: row.waveform_path,
      summary: analysisSummary
    }
    : undefined;

  return {
    id: row.id,
    rootId: row.root_id,
    directoryId: row.directory_id,
    path: row.path,
    filename: row.filename,
    mediaType: row.media_type as MediaType,
    assetRole: row.asset_role as AssetRole,
    fileSize: row.file_size,
    mtimeMs: row.mtime_ms,
    hashKey: row.hash_key,
    durationMs: row.duration_ms,
    width: row.width,
    height: row.height,
    frameRate: row.frame_rate,
    hasAudio: Boolean(row.has_audio),
    analysisStatus: row.analysis_status as AnalysisStatus,
    missing: Boolean(row.missing),
    analysisRef,
    scannedAt: row.scanned_at,
    updatedAt: row.updated_at
  };
}

export function getRoot(db: DatabaseSync, rootId: string): LibraryRoot {
  const row = db.prepare('SELECT * FROM library_roots WHERE id = ?').get(rootId) as RootRow | undefined;
  if (!row) {
    throw new Error(`Unknown library root "${rootId}".`);
  }
  return rootFromRow(row);
}

export function setRootScanStatus(db: DatabaseSync, rootId: string, status: LibraryScanStatus, patch: RootStatusPatch = {}): void {
  const timestamp = nowIso();
  db.prepare(`
    UPDATE library_roots
    SET last_scan_status = ?,
        last_scan_started_at = CASE WHEN ? = 'running' THEN ? ELSE last_scan_started_at END,
        last_scan_ended_at = CASE WHEN ? IN ('completed', 'failed') THEN ? ELSE last_scan_ended_at END,
        last_scan_error = ?,
        updated_at = ?
    WHERE id = ?
  `).run(status, status, timestamp, status, timestamp, patch.error ?? null, timestamp, rootId);
}

export function listRoots(db: DatabaseSync): LibraryRoot[] {
  const rows = db.prepare('SELECT * FROM library_roots ORDER BY updated_at DESC, path COLLATE NOCASE').all() as unknown as RootRow[];
  return rows.map(rootFromRow);
}

export function listDirectories(db: DatabaseSync, rootId?: string): LibraryDirectory[] {
  const rows = rootId
    ? db.prepare('SELECT * FROM library_directories WHERE root_id = ? ORDER BY path COLLATE NOCASE').all(rootId) as unknown as DirectoryRow[]
    : db.prepare('SELECT * FROM library_directories ORDER BY path COLLATE NOCASE').all() as unknown as DirectoryRow[];
  return rows.map(directoryFromRow);
}

export function queryAssets(db: DatabaseSync, input: LibrarySearchRequest = {}): LibrarySearchResult {
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (input.query?.trim()) {
    where.push('(a.filename LIKE ? OR a.path LIKE ?)');
    const term = `%${input.query.trim()}%`;
    params.push(term, term);
  }
  if (input.rootId) {
    where.push('a.root_id = ?');
    params.push(input.rootId);
  }
  if (input.roles?.length) {
    where.push(`a.asset_role IN (${input.roles.map(() => '?').join(', ')})`);
    params.push(...input.roles);
  }
  if (input.mediaTypes?.length) {
    where.push(`a.media_type IN (${input.mediaTypes.map(() => '?').join(', ')})`);
    params.push(...input.mediaTypes);
  }
  if (input.analysisStatuses?.length) {
    where.push(`a.analysis_status IN (${input.analysisStatuses.map(() => '?').join(', ')})`);
    params.push(...input.analysisStatuses);
  }
  if (!input.includeMissing) {
    where.push('a.missing = 0');
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM library_assets a ${whereSql}`).get(...params) as unknown as { total: number };
  const limit = Math.max(1, Math.min(input.limit ?? 200, 500));
  const offset = Math.max(0, input.offset ?? 0);
  const sortDirection = input.sortDirection === 'desc' ? 'DESC' : 'ASC';
  const sortExpression = (() => {
    switch (input.sortBy) {
      case 'role':
        return 'a.asset_role COLLATE NOCASE';
      case 'type':
        return 'a.media_type COLLATE NOCASE';
      case 'cuts':
        return "COALESCE(json_extract(r.summary, '$.sceneCount'), 0)";
      case 'duration':
        return 'COALESCE(a.duration_ms, -1)';
      case 'analysis':
        return 'a.analysis_status COLLATE NOCASE';
      case 'filename':
      default:
        return 'a.filename COLLATE NOCASE';
    }
  })();
  const rows = db.prepare(`
    SELECT a.*, r.id AS analysis_ref_id, r.path AS analysis_path, r.thumbnail_manifest_path, r.waveform_path, r.summary AS analysis_summary
    FROM library_assets a
    LEFT JOIN library_analysis_refs r ON r.asset_id = a.id
    ${whereSql}
    ORDER BY ${sortExpression} ${sortDirection}, a.filename COLLATE NOCASE ASC, a.id ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as unknown as AssetRow[];

  return {
    assets: rows.map(assetFromRow),
    total: totalRow.total
  };
}

export function clearCatalogRows(db: DatabaseSync): void {
  const timestamp = nowIso();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM library_analysis_refs').run();
    db.prepare('DELETE FROM library_assets').run();
    db.prepare('DELETE FROM library_directories').run();
    db.prepare(`
      UPDATE library_roots
      SET last_scan_status = 'pending',
          last_scan_started_at = NULL,
          last_scan_ended_at = NULL,
          last_scan_error = NULL,
          updated_at = ?
    `).run(timestamp);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function findExistingAssetScan(db: DatabaseSync, assetId: string): Pick<AssetRow, 'hash_key' | 'analysis_status'> | undefined {
  return db.prepare('SELECT hash_key, analysis_status FROM library_assets WHERE id = ?').get(assetId) as Pick<AssetRow, 'hash_key' | 'analysis_status'> | undefined;
}

export function getAssetById(db: DatabaseSync, assetId: string): LibraryAsset {
  const row = db.prepare(`
    SELECT a.*, r.id AS analysis_ref_id, r.path AS analysis_path, r.thumbnail_manifest_path, r.waveform_path, r.summary AS analysis_summary
    FROM library_assets a
    LEFT JOIN library_analysis_refs r ON r.asset_id = a.id
    WHERE a.id = ?
  `).get(assetId) as unknown as AssetRow;
  return assetFromRow(row);
}

export function listActiveAssetPaths(db: DatabaseSync, rootId: string): string[] {
  const rows = db.prepare('SELECT path FROM library_assets WHERE root_id = ? AND missing = 0').all(rootId) as Array<{ path: string }>;
  return rows.map((row) => row.path);
}

export function markAssetMissing(db: DatabaseSync, assetPath: string): void {
  db.prepare('UPDATE library_assets SET missing = 1, updated_at = ? WHERE path = ?').run(nowIso(), assetPath);
}

export function removeRoot(db: DatabaseSync, rootId: string): boolean {
  const root = db.prepare('SELECT id FROM library_roots WHERE id = ?').get(rootId) as Pick<RootRow, 'id'> | undefined;
  if (!root) {
    return false;
  }

  db.exec('BEGIN');
  try {
    db.prepare(`
      DELETE FROM library_analysis_refs
      WHERE asset_id IN (SELECT id FROM library_assets WHERE root_id = ?)
    `).run(rootId);
    db.prepare('DELETE FROM library_assets WHERE root_id = ?').run(rootId);
    db.prepare('DELETE FROM library_directories WHERE root_id = ?').run(rootId);
    db.prepare('DELETE FROM library_roots WHERE id = ?').run(rootId);
    db.exec('COMMIT');
    return true;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function removeAssets(db: DatabaseSync, assetIds: string[]): number {
  if (assetIds.length === 0) {
    return 0;
  }
  const placeholders = assetIds.map(() => '?').join(', ');
  db.exec('BEGIN');
  try {
    db.prepare(`DELETE FROM library_analysis_refs WHERE asset_id IN (${placeholders})`).run(...assetIds);
    const result = db.prepare(`DELETE FROM library_assets WHERE id IN (${placeholders})`).run(...assetIds);
    db.exec('COMMIT');
    return Number(result.changes);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function getAssetsByIds(db: DatabaseSync, assetIds: string[]): LibraryAsset[] {
  if (assetIds.length === 0) {
    return [];
  }
  const placeholders = assetIds.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT a.*, r.id AS analysis_ref_id, r.path AS analysis_path, r.thumbnail_manifest_path, r.waveform_path, r.summary AS analysis_summary
    FROM library_assets a
    LEFT JOIN library_analysis_refs r ON r.asset_id = a.id
    WHERE a.id IN (${placeholders}) AND a.missing = 0
    ORDER BY a.filename COLLATE NOCASE
  `).all(...assetIds) as unknown as AssetRow[];
  return rows.map(assetFromRow);
}
