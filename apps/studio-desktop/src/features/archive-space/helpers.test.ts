import { describe, expect, it } from 'vitest';
import type { NormalizedProjectFile } from '@afterimage/project-model';
import { fixtureProject } from '../../../../../packages/test-fixtures/src';
import { buildArchiveTargetOptions, classifyArchiveCandidateState } from './helpers';

describe('archive-space helpers', () => {
  it('classifies archive candidates as accepted, rejected, or untouched', () => {
    const project = fixtureProject as NormalizedProjectFile;

    expect(classifyArchiveCandidateState(project, {
      archiveId: 'archive-source-alpha',
      referenceKind: 'motif',
      candidateId: 'motif-hallway'
    })).toBe('accepted');
    expect(classifyArchiveCandidateState(project, {
      archiveId: 'archive-source-alpha',
      referenceKind: 'motion',
      candidateId: 'motion-drift'
    })).toBe('rejected');
    expect(classifyArchiveCandidateState(project, {
      archiveId: 'archive-source-alpha',
      referenceKind: 'segment',
      candidateId: 'segment-alpha-hallway'
    })).toBe('candidate');
  });

  it('builds archive acceptance targets for composition, scenes, layers, and clips', () => {
    const project = fixtureProject as NormalizedProjectFile;
    const targets = buildArchiveTargetOptions(project);

    expect(targets[0]).toMatchObject({
      id: 'composition:composition-main',
      targetIds: ['composition-main'],
      scope: { compositionId: 'composition-main' }
    });
    expect(targets.some((target) => target.id === 'scene:scene-main')).toBe(true);
    expect(targets.some((target) => target.id === 'layer:layer-clip-intro')).toBe(true);
    expect(targets.some((target) => target.id === 'clip:variant-main:clip-intro')).toBe(true);
  });
});
