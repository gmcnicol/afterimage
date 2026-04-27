import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLibraryService } from '../electron/services/library-service';
import type { Logger } from '../electron/services/logger';

function createTestLogger(): Logger {
  return {
    setProjectRoot() {},
    async log(level, message, details) {
      return {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        level,
        message,
        details
      };
    },
    list() {
      return [];
    }
  };
}

async function createService(rootPath: string) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'afterimage-library-service-'));
  const service = createLibraryService({
    dialog: {
      async showOpenDialog() {
        return {
          canceled: false,
          filePaths: [rootPath]
        };
      }
    },
    logger: createTestLogger(),
    databasePath: path.join(tempRoot, 'library.sqlite'),
    dataRoot: path.join(tempRoot, 'library-data'),
    autoAnalyze: false
  });

  return {
    service,
    async cleanup() {
      service.close();
      await rm(tempRoot, { recursive: true, force: true });
    }
  };
}

describe('library service', () => {
  it('recursively indexes supported assets and directories', async () => {
    const mediaRoot = await mkdtemp(path.join(os.tmpdir(), 'afterimage-library-media-'));
    const nestedRoot = path.join(mediaRoot, 'nested', 'deeper');
    await mkdir(nestedRoot, { recursive: true });
    await writeFile(path.join(mediaRoot, 'clip.mp4'), 'fake video', 'utf8');
    await writeFile(path.join(nestedRoot, 'mask.mov'), 'fake mask', 'utf8');
    await writeFile(path.join(nestedRoot, 'notes.txt'), 'ignore me', 'utf8');
    const { service, cleanup } = await createService(mediaRoot);

    try {
      const root = await service.addRoot({ role: 'source' });
      expect(root?.lastScanStatus).toBe('completed');

      const directories = service.listDirectories(root?.id);
      expect(directories.map((directory) => directory.path)).toEqual([
        mediaRoot,
        path.join(mediaRoot, 'nested'),
        nestedRoot
      ]);

      const search = service.searchAssets();
      expect(search.total).toBe(2);
      expect(search.assets.map((asset) => asset.filename).sort()).toEqual(['clip.mp4', 'mask.mov']);
      expect(search.assets.every((asset) => asset.assetRole === 'source')).toBe(true);
      expect(search.assets.every((asset) => asset.analysisStatus === 'pending')).toBe(true);
    } finally {
      await cleanup();
      await rm(mediaRoot, { recursive: true, force: true });
    }
  });

  it('filters assets by query and role and marks missing files on rescan', async () => {
    const mediaRoot = await mkdtemp(path.join(os.tmpdir(), 'afterimage-library-filter-'));
    const trackPath = path.join(mediaRoot, 'track.wav');
    const secondTrackPath = path.join(mediaRoot, 'second-track.mp3');
    await writeFile(trackPath, 'fake audio', 'utf8');
    await writeFile(secondTrackPath, 'fake audio', 'utf8');
    const { service, cleanup } = await createService(mediaRoot);

    try {
      const root = await service.addRoot({ role: 'music' });
      expect(service.searchAssets({ query: 'second' }).assets.map((asset) => asset.filename)).toEqual(['second-track.mp3']);
      expect(service.searchAssets({ roles: ['source'] }).total).toBe(0);
      expect(service.searchAssets({ roles: ['music'] }).total).toBe(2);

      await rm(secondTrackPath);
      await service.rescanRoot(root?.id ?? '');
      expect(service.searchAssets().assets.map((asset) => asset.filename)).toEqual(['track.wav']);
      expect(service.searchAssets({ includeMissing: true }).assets.find((asset) => asset.filename === 'second-track.mp3')?.missing).toBe(true);
    } finally {
      await cleanup();
      await rm(mediaRoot, { recursive: true, force: true });
    }
  });

  it('maps catalog assets into project media assets without project schema changes', async () => {
    const mediaRoot = await mkdtemp(path.join(os.tmpdir(), 'afterimage-library-import-'));
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'afterimage-project-import-'));
    await writeFile(path.join(mediaRoot, 'overlay.webm'), 'fake overlay', 'utf8');
    const { service, cleanup } = await createService(mediaRoot);

    try {
      await service.addRoot({ role: 'transition-overlay' });
      const asset = service.searchAssets().assets[0];
      const imported = await service.importAssets({ projectRoot, assetIds: [asset.id] });

      expect(imported).toHaveLength(1);
      expect(imported[0]).toMatchObject({
        filename: 'overlay.webm',
        mediaType: 'video',
        assetRole: 'transition-overlay',
        importStatus: 'ready',
        analysisStatus: 'pending'
      });
      expect(imported[0].path.absolutePath).toBe(path.join(mediaRoot, 'overlay.webm'));
      expect(imported[0].path.relativePath).toBeUndefined();
    } finally {
      await cleanup();
      await rm(mediaRoot, { recursive: true, force: true });
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
