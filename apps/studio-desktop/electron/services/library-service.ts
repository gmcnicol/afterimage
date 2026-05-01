import { readdir, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Dialog } from 'electron';
import { buildAnalysisPlan, executeCommandSpec, resolveFfmpegTools } from '@afterimage/ffmpeg-compiler';
import { createAnalysisFile, parseFfprobeOutput, parseSceneDetectionOutput } from '@afterimage/media-analysis';
import {
  createEmptyProject,
  normalizeProjectPathRef,
  slugify,
  type AnalysisRef,
  type AnalysisStatus,
  type AssetRole,
  type MediaAsset,
  type MediaType,
  type ProbeMetadata,
  type ProjectPathRef
} from '@afterimage/project-model';
import type {
  LibraryAddRootRequest,
  LibraryAsset,
  LibraryDirectory,
  LibraryImportAssetsRequest,
  LibraryRemoveAssetsRequest,
  LibraryRoot,
  LibraryScanStatus,
  LibrarySearchRequest,
  LibrarySearchResult
} from '@afterimage/studio-contracts';
import type { Logger } from './logger.js';

type LibraryJobRunner = (input: {
  type: 'library-scan' | 'library-analysis';
  target: string;
  run(signal: AbortSignal, report: (message: string, progress: number) => Promise<void> | void): Promise<NonNullable<import('@afterimage/studio-contracts').DesktopJob['result']>>;
}) => void;

interface LibraryServiceOptions {
  dialog: Pick<Dialog, 'showOpenDialog'>;
  logger: Logger;
  databasePath: string;
  dataRoot: string;
  runLibraryJob?: LibraryJobRunner;
  autoAnalyze?: boolean;
}

interface RootRow {
  id: string;
  path: string;
  role: string;
  enabled: number;
  last_scan_status: string;
  last_scan_started_at?: string;
  last_scan_ended_at?: string;
  last_scan_error?: string;
  created_at: string;
  updated_at: string;
}

interface DirectoryRow {
  id: string;
  root_id: string;
  path: string;
  parent_path?: string;
  file_count: number;
  supported_file_count: number;
  scanned_at: string;
}

interface AssetRow {
  id: string;
  root_id: string;
  directory_id: string;
  path: string;
  filename: string;
  media_type: string;
  asset_role: string;
  file_size: number;
  mtime_ms: number;
  hash_key: string;
  duration_ms?: number;
  width?: number;
  height?: number;
  frame_rate?: number;
  has_audio: number;
  analysis_status: string;
  missing: number;
  analysis_ref_id?: string;
  analysis_path?: string;
  thumbnail_manifest_path?: string;
  waveform_path?: string;
  analysis_summary?: string;
  scanned_at: string;
  updated_at: string;
}

const videoExtensions = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi']);
const audioExtensions = new Set(['.wav', '.mp3', '.aif', '.aiff', '.flac', '.m4a']);
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const supportedExtensions = new Set([...videoExtensions, ...audioExtensions, ...imageExtensions]);
const ignoredDirectoryNames = new Set([
  '.git',
  '.turbo',
  'coverage',
  'dist',
  'dist-electron',
  'node_modules',
  'release'
]);

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function nowIso(): string {
  return new Date().toISOString();
}

function toSqlBool(value: boolean): number {
  return value ? 1 : 0;
}

function inferMediaType(filePath: string, role: AssetRole): MediaType {
  const extension = path.extname(filePath).toLowerCase();
  if (role === 'music' || audioExtensions.has(extension)) {
    return 'audio';
  }
  if (imageExtensions.has(extension)) {
    return 'image';
  }
  return 'video';
}

function isIgnoredDirectory(directoryPath: string): boolean {
  return ignoredDirectoryNames.has(path.basename(directoryPath).toLowerCase());
}

function isSupportedForRole(filePath: string, role: AssetRole): boolean {
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

function pathsOverlap(leftPath: string, rightPath: string): boolean {
  const relative = path.relative(leftPath, rightPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function firstVideoStream(probe: ProbeMetadata) {
  return probe.streams.find((stream) => stream.codecType === 'video');
}

function parseFrameRate(value: string | undefined): number | undefined {
  if (!value || value === '0/0') {
    return undefined;
  }
  const [numerator, denominator] = value.split('/').map((part) => Number.parseFloat(part));
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return undefined;
  }
  return Number((numerator / denominator).toFixed(3));
}

function buildPathRef(projectRoot: string | undefined, absolutePath: string): ProjectPathRef {
  if (!projectRoot) {
    return { absolutePath };
  }
  const relativePath = path.relative(projectRoot, absolutePath);
  return normalizeProjectPathRef({
    absolutePath,
    relativePath: relativePath.startsWith('..') ? undefined : relativePath.replace(/\\/g, '/')
  });
}

function buildAssetId(asset: Pick<LibraryAsset, 'assetRole' | 'path' | 'filename'>): string {
  const stem = path.basename(asset.filename, path.extname(asset.filename));
  return `asset-${slugify(stem) || 'catalog'}-${slugify(asset.assetRole)}-${stableHash(`${asset.assetRole}:${asset.path}`).slice(0, 8)}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveScannedAnalysisStatus(input: {
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

function rootFromRow(row: RootRow): LibraryRoot {
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

function directoryFromRow(row: DirectoryRow): LibraryDirectory {
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

function assetFromRow(row: AssetRow): LibraryAsset {
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

export function createLibraryService({ dialog, logger, databasePath, dataRoot, runLibraryJob, autoAnalyze = true }: LibraryServiceOptions) {
  const db = new DatabaseSync(databasePath, { timeout: 5000 });

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

  function getRoot(rootId: string): LibraryRoot {
    const row = db.prepare('SELECT * FROM library_roots WHERE id = ?').get(rootId) as RootRow | undefined;
    if (!row) {
      throw new Error(`Unknown library root "${rootId}".`);
    }
    return rootFromRow(row);
  }

  function setRootScanStatus(rootId: string, status: LibraryScanStatus, patch: { error?: string } = {}): void {
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

  async function probeAsset(asset: LibraryAsset, signal?: AbortSignal): Promise<void> {
    const tools = resolveFfmpegTools();
    const analysisRoot = path.join(dataRoot, 'analysis');
    await mkdir(analysisRoot, { recursive: true });
    const probeOutputPath = path.join(analysisRoot, `${asset.id}.ffprobe.json`);
    const analysisLogPath = path.join(analysisRoot, `${asset.id}.scene.log`);
    const analysisSidecarPath = path.join(analysisRoot, `${asset.id}.analysis.json`);

    db.prepare('UPDATE library_assets SET analysis_status = ?, updated_at = ? WHERE id = ?').run('running', nowIso(), asset.id);
    try {
      const probeResult = await executeCommandSpec({
        label: `library-probe:${asset.filename}`,
        binary: tools.ffprobe.path,
        args: ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', asset.path]
      }, { signal });
      await writeFile(probeOutputPath, probeResult.stdout, 'utf8');

      const probe = parseFfprobeOutput(probeResult.stdout);
      const videoStream = firstVideoStream(probe);
      let sceneCuts: ReturnType<typeof parseSceneDetectionOutput>['sceneCuts'] = [];

      if (asset.mediaType === 'video') {
        const project = createEmptyProject({
          id: 'catalog-analysis',
          name: 'Catalog Analysis'
        });
        const analysisProject = {
          ...project,
          assets: [{
            id: asset.id,
            filename: asset.filename,
            mediaType: asset.mediaType,
            assetRole: asset.assetRole,
            path: { absolutePath: asset.path },
            hasAudio: asset.hasAudio,
            importStatus: 'ready' as const,
            analysisStatus: 'running' as const
          }]
        };
        const plan = buildAnalysisPlan(analysisProject, {
          assetId: asset.id,
          probeOutputPath,
          analysisOutputPath: analysisLogPath
        }, tools);
        const sceneResult = await executeCommandSpec(plan.commands[1], { signal });
        const sceneLog = [sceneResult.stdout, sceneResult.stderr].filter(Boolean).join('\n');
        await writeFile(analysisLogPath, sceneLog, 'utf8');
        sceneCuts = parseSceneDetectionOutput(sceneLog).sceneCuts;
      }

      const analysisFile = createAnalysisFile(`analysis-${asset.id}`, asset.id, probe, sceneCuts);
      await writeFile(analysisSidecarPath, `${JSON.stringify(analysisFile, null, 2)}\n`, 'utf8');

      db.exec('BEGIN');
      try {
        db.prepare(`
          UPDATE library_assets
          SET duration_ms = ?, width = ?, height = ?, frame_rate = ?, has_audio = ?, analysis_status = ?, updated_at = ?
          WHERE id = ?
        `).run(
          probe.durationMs,
          videoStream?.width ?? null,
          videoStream?.height ?? null,
          parseFrameRate(videoStream?.avgFrameRate) ?? null,
          toSqlBool(probe.streams.some((stream) => stream.codecType === 'audio')),
          'completed',
          nowIso(),
          asset.id
        );
        db.prepare(`
          INSERT INTO library_analysis_refs (asset_id, id, path, summary, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(asset_id) DO UPDATE SET
            id = excluded.id,
            path = excluded.path,
            summary = excluded.summary,
            updated_at = excluded.updated_at
        `).run(asset.id, `analysis-${asset.id}`, analysisSidecarPath, JSON.stringify(analysisFile.summary ?? null), nowIso());
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } catch (error) {
      db.prepare('UPDATE library_assets SET analysis_status = ?, updated_at = ? WHERE id = ?').run('failed', nowIso(), asset.id);
      throw error;
    }
  }

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
        const existing = db.prepare('SELECT hash_key, analysis_status FROM library_assets WHERE id = ?').get(assetId) as Pick<AssetRow, 'hash_key' | 'analysis_status'> | undefined;
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

        const asset = assetFromRow(db.prepare(`
          SELECT a.*, r.id AS analysis_ref_id, r.path AS analysis_path, r.thumbnail_manifest_path, r.waveform_path, r.summary AS analysis_summary
          FROM library_assets a
          LEFT JOIN library_analysis_refs r ON r.asset_id = a.id
          WHERE a.id = ?
        `).get(assetId) as unknown as AssetRow);
        if (asset.mediaType !== 'image' && asset.analysisStatus === 'pending') {
          pendingAnalysisAssets.push(asset);
        }
      }
    }

    try {
      await scanDirectory(root.path);
      const staleRows = db.prepare('SELECT path FROM library_assets WHERE root_id = ? AND missing = 0').all(root.id) as Array<{ path: string }>;
      for (const row of staleRows) {
        if (!discoveredPaths.has(row.path)) {
          db.prepare('UPDATE library_assets SET missing = 1, updated_at = ? WHERE path = ?').run(nowIso(), row.path);
        }
      }

      setRootScanStatus(root.id, 'completed');
      await logger.log('info', 'Completed media library scan.', `${root.path} :: ${discoveredPaths.size} asset(s)`);

      if (autoAnalyze && pendingAnalysisAssets.length > 0) {
        runLibraryJob?.({
          type: 'library-analysis',
          target: root.path,
          run: async (analysisSignal, analysisReport) => {
            for (const [index, asset] of pendingAnalysisAssets.entries()) {
              analysisSignal.throwIfAborted();
              analysisReport(`Analyzing ${asset.filename}`, index / pendingAnalysisAssets.length);
              try {
                await probeAsset(asset, analysisSignal);
              } catch (error) {
                await logger.log('warn', 'Failed to analyze library asset.', `${asset.path} :: ${getErrorMessage(error)}`);
              }
            }
            return { kind: 'library-analysis', assetIds: pendingAnalysisAssets.map((asset) => asset.id) };
          }
        });
      }

      return getRoot(root.id);
    } catch (error) {
      setRootScanStatus(root.id, 'failed', { error: getErrorMessage(error) });
      throw error;
    }
  }

  function listRoots(): LibraryRoot[] {
    const rows = db.prepare('SELECT * FROM library_roots ORDER BY updated_at DESC, path COLLATE NOCASE').all() as unknown as RootRow[];
    return rows.map(rootFromRow);
  }

  function queryAssets(input: LibrarySearchRequest = {}): LibrarySearchResult {
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

  function clearCatalogRows(): void {
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

  return {
    async addRoot(input: LibraryAddRootRequest): Promise<LibraryRoot | null> {
      const result = await dialog.showOpenDialog({
        title: 'Add Media Library Folder',
        properties: ['openDirectory']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const rootPath = result.filePaths[0];
      if (isIgnoredDirectory(rootPath)) {
        throw new Error(`Choose a media folder, not "${path.basename(rootPath)}".`);
      }

      const existingRoots = listRoots();
      const overlappingRoot = existingRoots.find((root) => root.path !== rootPath && (pathsOverlap(root.path, rootPath) || pathsOverlap(rootPath, root.path)));
      if (overlappingRoot) {
        throw new Error(`Catalog folder overlaps an existing ${overlappingRoot.role} root: ${overlappingRoot.path}`);
      }

      const timestamp = nowIso();
      const rootId = `root-${stableHash(`${input.role}:${rootPath}`)}`;
      db.prepare(`
        INSERT INTO library_roots (id, path, role, enabled, last_scan_status, created_at, updated_at)
        VALUES (?, ?, ?, 1, 'pending', ?, ?)
        ON CONFLICT(path) DO UPDATE SET
          role = excluded.role,
          enabled = 1,
          last_scan_status = 'pending',
          updated_at = excluded.updated_at
      `).run(rootId, rootPath, input.role, timestamp, timestamp);

      if (runLibraryJob) {
        runLibraryJob({
          type: 'library-scan',
          target: rootPath,
          run: async (signal, report) => {
            const scannedRoot = await scanRoot(rootId, signal, report);
            return { kind: 'library-scan', rootId: scannedRoot.id };
          }
        });
        return getRoot(rootId);
      }

      return scanRoot(rootId);
    },
    removeRoot(rootId: string): boolean {
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
    },
    async rescanRoot(rootId: string): Promise<LibraryRoot> {
      if (runLibraryJob) {
        const root = getRoot(rootId);
        setRootScanStatus(rootId, 'pending');
        runLibraryJob({
          type: 'library-scan',
          target: root.path,
          run: async (signal, report) => {
            const scannedRoot = await scanRoot(rootId, signal, report);
            return { kind: 'library-scan', rootId: scannedRoot.id };
          }
        });
        return getRoot(rootId);
      }

      return scanRoot(rootId);
    },
    async rescanAll(): Promise<LibraryRoot[]> {
      const roots = listRoots();
      return Promise.all(roots.map((root) => this.rescanRoot(root.id)));
    },
    async clearAndRescanAll(): Promise<LibraryRoot[]> {
      clearCatalogRows();
      await logger.log('warn', 'Cleared media library catalog before full rescan.', `${listRoots().length} root(s) queued.`);
      return this.rescanAll();
    },
    listRoots,
    listDirectories(rootId?: string): LibraryDirectory[] {
      const rows = rootId
        ? db.prepare('SELECT * FROM library_directories WHERE root_id = ? ORDER BY path COLLATE NOCASE').all(rootId) as unknown as DirectoryRow[]
        : db.prepare('SELECT * FROM library_directories ORDER BY path COLLATE NOCASE').all() as unknown as DirectoryRow[];
      return rows.map(directoryFromRow);
    },
    searchAssets: queryAssets,
    async importAssets(input: LibraryImportAssetsRequest): Promise<MediaAsset[]> {
      if (input.assetIds.length === 0) {
        return [];
      }
      const placeholders = input.assetIds.map(() => '?').join(', ');
      const rows = db.prepare(`
        SELECT a.*, r.id AS analysis_ref_id, r.path AS analysis_path, r.thumbnail_manifest_path, r.waveform_path, r.summary AS analysis_summary
        FROM library_assets a
        LEFT JOIN library_analysis_refs r ON r.asset_id = a.id
        WHERE a.id IN (${placeholders}) AND a.missing = 0
        ORDER BY a.filename COLLATE NOCASE
      `).all(...input.assetIds) as unknown as AssetRow[];

      return rows.map((row) => {
        const asset = assetFromRow(row);
        return {
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
        } satisfies MediaAsset;
      });
    },
    removeAssets(input: LibraryRemoveAssetsRequest): number {
      if (input.assetIds.length === 0) {
        return 0;
      }
      const placeholders = input.assetIds.map(() => '?').join(', ');
      db.exec('BEGIN');
      try {
        db.prepare(`DELETE FROM library_analysis_refs WHERE asset_id IN (${placeholders})`).run(...input.assetIds);
        const result = db.prepare(`DELETE FROM library_assets WHERE id IN (${placeholders})`).run(...input.assetIds);
        db.exec('COMMIT');
        return Number(result.changes);
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close(): void {
      db.close();
    }
  };
}
