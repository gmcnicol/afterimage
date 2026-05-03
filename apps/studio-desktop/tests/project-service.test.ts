import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Dialog, Shell } from 'electron';
import { createEmptyProject, type NormalizedProjectFile } from '@afterimage/project-model';
import { describe, expect, it, vi } from 'vitest';
import { createProjectService } from '../electron/services/project-service';
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

async function createService() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'afterimage-project-service-'));
  const service = createProjectService({
    dialog: {} as Dialog,
    shell: {} as Shell,
    logger: createTestLogger(),
    recentProjectsPath: path.join(tempRoot, 'recent-projects.json')
  });

  return {
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
