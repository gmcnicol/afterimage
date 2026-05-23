import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Dialog, Shell } from 'electron';
import { createEmptyProject, type NormalizedProjectFile } from '@afterimage/project-model';
import { describe, expect, it, vi } from 'vitest';
import { createProjectService } from '../electron/services/project-service';
import type { Logger } from '../electron/services/logger';
import { fixtureArchive } from '../../../packages/test-fixtures/src';

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

async function createService(dialog: Partial<Dialog> = {}) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'afterimage-project-service-'));
  const service = createProjectService({
    dialog: dialog as Dialog,
    shell: {} as Shell,
    logger: createTestLogger(),
    recentProjectsPath: path.join(tempRoot, 'recent-projects.json')
  });

  return {
    tempRoot,
    service,
    async cleanup() {
      await rm(tempRoot, { recursive: true, force: true });
    }
  };
}

function withAlternateStyleStack(project: NormalizedProjectFile): NormalizedProjectFile {
  const mainVariant = project.variants[0];
  return {
    ...project,
    sequences: project.sequences.map((sequence) => sequence.id === mainVariant.sequenceId ? {
      ...sequence,
      variantIds: [...sequence.variantIds, 'variant-alt']
    } : sequence),
    variants: [
      ...project.variants,
      {
        ...mainVariant,
        id: 'variant-alt',
        name: 'Sequence 002',
        stackId: 'stack-alt'
      }
    ],
    filterStacks: [
      ...project.filterStacks,
      {
        id: 'stack-alt',
        name: 'Alternate Stack',
        scope: 'sequence',
        filters: []
      }
    ]
  };
}

describe('project service operations', () => {
  it('discovers archive sidecars and reports invalid archive sidecar parse errors only for archive files', async () => {
    const { service, tempRoot, cleanup } = await createService();

    try {
      const projectRoot = path.join(tempRoot, 'project');
      await mkdir(path.join(projectRoot, 'archive'), { recursive: true });
      await writeFile(path.join(projectRoot, 'archive', 'source-alpha.archive.json'), `${JSON.stringify(fixtureArchive, null, 2)}\n`, 'utf8');
      await writeFile(path.join(projectRoot, 'archive', 'broken.archive.json'), '{"id": 42}', 'utf8');
      await writeFile(path.join(projectRoot, 'archive', 'not-an-archive.json'), '{', 'utf8');

      const result = await service.listArchiveSidecars({
        projectRoot,
        project: createEmptyProject({ id: 'project-archive-list', name: 'Archive List' })
      });

      expect(result.sidecars.map((sidecar) => path.basename(sidecar.path)).sort()).toEqual([
        'broken.archive.json',
        'source-alpha.archive.json'
      ]);
      expect(result.sidecars.find((sidecar) => sidecar.path.endsWith('source-alpha.archive.json'))?.archive?.id).toBe('archive-source-alpha');
      expect(result.sidecars.find((sidecar) => sidecar.path.endsWith('broken.archive.json'))?.error?.message).toContain('Archive metadata validation failed');
    } finally {
      await cleanup();
    }
  });

  it('imports valid archive sidecars into the project archive folder for later discovery', async () => {
    const selectedSidecarPath = path.join(os.tmpdir(), `selected-${Date.now()}.archive.json`);
    await writeFile(selectedSidecarPath, `${JSON.stringify(fixtureArchive, null, 2)}\n`, 'utf8');
    const showOpenDialog = vi.fn(async () => ({ canceled: false, filePaths: [selectedSidecarPath] }));
    const { service, tempRoot, cleanup } = await createService({ showOpenDialog } as Partial<Dialog>);

    try {
      const projectRoot = path.join(tempRoot, 'project');
      const result = await service.importArchiveSidecars({ projectRoot });
      expect(result.importedPaths.map((item) => path.basename(item))).toEqual(['archive-source-alpha.archive.json']);
      expect(result.rejected).toEqual([]);

      const copied = await readFile(path.join(projectRoot, '.afterimage', 'archive', 'archive-source-alpha.archive.json'), 'utf8');
      expect(JSON.parse(copied).id).toBe('archive-source-alpha');

      const listed = await service.listArchiveSidecars({
        projectRoot,
        project: createEmptyProject({ id: 'project-archive-import', name: 'Archive Import' })
      });
      expect(listed.sidecars[0]?.archive?.id).toBe('archive-source-alpha');
    } finally {
      await rm(selectedSidecarPath, { force: true });
      await cleanup();
    }
  });

  it('accepts and rejects archive candidates through the service boundary idempotently', async () => {
    const { service, cleanup } = await createService();

    try {
      const project = createEmptyProject({ id: 'project-archive-ops', name: 'Archive Ops' });
      const accepted = service.applyProjectOperation({
        project,
        operation: {
          type: 'acceptArchiveCandidate',
          archive: fixtureArchive,
          referenceKind: 'motif',
          candidateId: 'motif-hallway'
        }
      });
      const acceptedAgain = service.applyProjectOperation({
        project: accepted,
        operation: {
          type: 'acceptArchiveCandidate',
          archive: fixtureArchive,
          referenceKind: 'motif',
          candidateId: 'motif-hallway'
        }
      });
      const rejected = service.applyProjectOperation({
        project: acceptedAgain,
        operation: {
          type: 'rejectArchiveCandidate',
          archive: fixtureArchive,
          referenceKind: 'motion',
          candidateId: 'motion-drift'
        }
      });
      const rejectedAgain = service.applyProjectOperation({
        project: rejected,
        operation: {
          type: 'rejectArchiveCandidate',
          archive: fixtureArchive,
          referenceKind: 'motion',
          candidateId: 'motion-drift'
        }
      });

      expect(acceptedAgain.composition.acceptedArchiveReferences).toHaveLength(1);
      expect(acceptedAgain.composition.acceptedArchiveReferences[0]?.referenceKind).toBe('motif');
      expect(rejectedAgain.composition.rejectedArchiveReferences).toHaveLength(1);
      expect(rejectedAgain.composition.rejectedArchiveReferences[0]?.referenceKind).toBe('motion');
    } finally {
      await cleanup();
    }
  });

  it('adds filters to the requested stack with collision-safe ids', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(42);
    const { service, cleanup } = await createService();

    try {
      const project = withAlternateStyleStack(createEmptyProject({ id: 'project-style-service', name: 'Style Service' }));
      const firstUpdate = service.applyProjectOperation({
        project,
        operation: { type: 'addFilterToSequenceStack', filterType: 'contrast', stackId: 'stack-alt' }
      });
      const secondUpdate = service.applyProjectOperation({
        project: firstUpdate,
        operation: { type: 'addFilterToSequenceStack', filterType: 'brightness', stackId: 'stack-alt' }
      });

      expect(secondUpdate.filterStacks.find((stack) => stack.id === 'stack-sequence-main')?.filters).toHaveLength(0);
      expect(secondUpdate.filterStacks.find((stack) => stack.id === 'stack-alt')?.filters.map((filter) => filter.id)).toEqual([
        'filter-42',
        'filter-42-2'
      ]);
      expect(secondUpdate.filterStacks.find((stack) => stack.id === 'stack-alt')?.filters.map((filter) => filter.type)).toEqual([
        'contrast',
        'brightness'
      ]);
    } finally {
      nowSpy.mockRestore();
      await cleanup();
    }
  });

  it('applies configured preset-library presets through the service boundary', async () => {
    const { service, cleanup } = await createService();

    try {
      const project = createEmptyProject({ id: 'project-style-preset-service', name: 'Style Preset Service' });
      const updated = service.applyProjectOperation({
        project,
        operation: {
          type: 'applyPresetToSequenceStack',
          presetId: 'preset-glitch-overclock',
          stackId: 'stack-sequence-main'
        }
      });

      expect(updated.filterStacks[0].family).toBe('glitch');
      expect(updated.filterStacks[0].filters.map((filter) => filter.type)).toEqual(['glitch-bands', 'chroma-bleed']);
      expect(updated.filterStacks[0].filters[0].parameters?.strength).toBe(0.22);
    } finally {
      await cleanup();
    }
  });
});
