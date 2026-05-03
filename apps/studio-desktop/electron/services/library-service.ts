import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { importCatalogAssetIntoProject, type CatalogSceneSegment } from '@afterimage/domain-operations';
import type { MediaAsset } from '@afterimage/project-model';
import { parseAnalysis } from '@afterimage/schema-validators';
import type {
  LibraryAddRootRequest,
  LibraryAnalysisAgentInput,
  LibraryDirectory,
  LibraryImportAssetToProjectRequest,
  LibraryImportAssetsRequest,
  LibraryRemoveAssetsRequest,
  LibraryScanAgentInput,
  LibraryRoot,
  ProjectMutationResult
} from '@afterimage/studio-contracts';
import { createLibraryAnalyzer } from './library/analyzer.js';
import { importCatalogAssets } from './library/assets.js';
import {
  clearCatalogRows,
  getAssetsByIds,
  getRoot as getCatalogRoot,
  initializeLibraryDatabase,
  listDirectories as listCatalogDirectories,
  listRoots as listCatalogRoots,
  queryAssets,
  setRootScanStatus as setCatalogRootScanStatus
} from './library/catalog.js';
import { createLibraryRemoval } from './library/removal.js';
import { createLibraryScanner } from './library/scanner.js';
import type { LibraryServiceOptions } from './library/types.js';
import {
  getErrorMessage,
  isIgnoredDirectory,
  pathsOverlap,
  stableHash,
  nowIso
} from './library/utils.js';

export function createLibraryService({ dialog, logger, databasePath, dataRoot, runLibraryJob, autoAnalyze = true }: LibraryServiceOptions) {
  const db = new DatabaseSync(databasePath, { timeout: 5000 });
  initializeLibraryDatabase(db);

  const getRoot = (rootId: string) => getCatalogRoot(db, rootId);
  const listRoots = () => listCatalogRoots(db);
  const { probeAsset } = createLibraryAnalyzer({ db, dataRoot });
  const removal = createLibraryRemoval({ db });
  const { scanRoot } = createLibraryScanner({
    db,
    logger,
    autoAnalyze,
    getRoot,
    setRootScanStatus: (rootId, status, patch) => setCatalogRootScanStatus(db, rootId, status, patch),
    runAnalysisJob(root, pendingAnalysisAssets) {
      const agentInput: LibraryAnalysisAgentInput = {
        rootId: root.id,
        rootPath: root.path,
        assets: pendingAnalysisAssets
      };
      runLibraryJob?.({
        type: 'library-analysis',
        target: agentInput.rootPath,
        run: async (analysisSignal, analysisReport) => {
          for (const [index, asset] of agentInput.assets.entries()) {
            analysisSignal.throwIfAborted();
            analysisReport(`Analyzing ${asset.filename}`, index / agentInput.assets.length);
            try {
              await probeAsset(asset, analysisSignal);
            } catch (error) {
              await logger.log('warn', 'Failed to analyze library asset.', `${asset.path} :: ${getErrorMessage(error)}`);
            }
          }
          return { kind: 'library-analysis', assetIds: agentInput.assets.map((asset) => asset.id) };
        }
      });
    }
  });

  async function loadCatalogSceneSegments(asset: { analysisRef?: { path: string } }): Promise<CatalogSceneSegment[]> {
    if (!asset.analysisRef?.path) {
      return [];
    }

    try {
      const raw = await readFile(asset.analysisRef.path, 'utf8');
      const analysis = parseAnalysis(JSON.parse(raw) as unknown);
      const durationMs = Math.max(analysis.summary?.durationMs ?? analysis.probe.durationMs ?? 0, 0);
      const cutPoints = analysis.sceneCuts
        .map((scene) => Math.max(0, Math.min(durationMs, Math.round(scene.timeMs))))
        .filter((timeMs) => timeMs > 0 && timeMs < durationMs)
        .sort((left, right) => left - right);
      const boundaries = [0, ...cutPoints, durationMs].filter((timeMs, index, values) => index === 0 || timeMs > values[index - 1]);

      return boundaries.slice(0, -1).map((startMs, index) => {
        const endMs = boundaries[index + 1];
        return {
          id: `scene-${index + 1}-${startMs}`,
          index,
          startMs,
          endMs,
          durationMs: Math.max(0, endMs - startMs),
          score: analysis.sceneCuts.find((scene) => Math.round(scene.timeMs) === startMs)?.score
        };
      }).filter((scene) => scene.durationMs > 0);
    } catch (error) {
      await logger.log('warn', 'Failed to load catalog analysis sidecar.', `${asset.analysisRef.path} :: ${getErrorMessage(error)}`);
      return [];
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

      const overlappingRoot = listRoots().find((root) => root.path !== rootPath && (pathsOverlap(root.path, rootPath) || pathsOverlap(rootPath, root.path)));
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
        const agentInput: LibraryScanAgentInput = {
          rootId,
          rootPath
        };
        runLibraryJob({
          type: 'library-scan',
          target: agentInput.rootPath,
          run: async (signal, report) => {
            const scannedRoot = await scanRoot(agentInput.rootId, signal, report);
            return { kind: 'library-scan', rootId: scannedRoot.id };
          }
        });
        return getRoot(agentInput.rootId);
      }

      return scanRoot(rootId);
    },
    removeRoot(rootId: string): boolean {
      return removal.removeRoot(rootId);
    },
    async rescanRoot(rootId: string): Promise<LibraryRoot> {
      if (runLibraryJob) {
        const root = getRoot(rootId);
        setCatalogRootScanStatus(db, rootId, 'pending');
        const agentInput: LibraryScanAgentInput = {
          rootId: root.id,
          rootPath: root.path
        };
        runLibraryJob({
          type: 'library-scan',
          target: agentInput.rootPath,
          run: async (signal, report) => {
            const scannedRoot = await scanRoot(agentInput.rootId, signal, report);
            return { kind: 'library-scan', rootId: scannedRoot.id };
          }
        });
        return getRoot(agentInput.rootId);
      }

      return scanRoot(rootId);
    },
    async rescanAll(): Promise<LibraryRoot[]> {
      const roots = listRoots();
      return Promise.all(roots.map((root) => this.rescanRoot(root.id)));
    },
    async clearAndRescanAll(): Promise<LibraryRoot[]> {
      clearCatalogRows(db);
      await logger.log('warn', 'Cleared media library catalog before full rescan.', `${listRoots().length} root(s) queued.`);
      return this.rescanAll();
    },
    listRoots,
    listDirectories(rootId?: string): LibraryDirectory[] {
      return listCatalogDirectories(db, rootId);
    },
    searchAssets: (input = {}) => queryAssets(db, input),
    async importAssets(input: LibraryImportAssetsRequest): Promise<MediaAsset[]> {
      return importCatalogAssets({
        projectRoot: input.projectRoot,
        assets: getAssetsByIds(db, input.assetIds)
      });
    },
    async importAssetToProject(
      input: LibraryImportAssetToProjectRequest,
      commitProjectMutation: (project: LibraryImportAssetToProjectRequest['project'], projectFilePath?: string) => Promise<ProjectMutationResult>
    ): Promise<ProjectMutationResult> {
      const [asset] = getAssetsByIds(db, [input.assetId]);
      if (!asset) {
        throw new Error(`Catalog asset not found: ${input.assetId}`);
      }

      const [importedAsset] = await importCatalogAssets({
        projectRoot: input.projectRoot,
        assets: [asset]
      });
      if (!importedAsset) {
        throw new Error(`Catalog asset could not be imported: ${input.assetId}`);
      }

      const result = importCatalogAssetIntoProject({
        project: input.project,
        asset,
        importedAsset,
        sceneSegments: await loadCatalogSceneSegments(asset),
        cutIds: input.cutIds
      });
      const mutation = await commitProjectMutation(result.project, input.projectFilePath);
      return {
        ...mutation,
        addedCutIds: result.addedCutIds
      };
    },
    removeAssets(input: LibraryRemoveAssetsRequest): number {
      return removal.removeAssets(input.assetIds);
    },
    close(): void {
      db.close();
    }
  };
}
