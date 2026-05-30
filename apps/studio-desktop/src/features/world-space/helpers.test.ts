import { describe, expect, it } from 'vitest';
import type { NormalizedProjectFile } from '@afterimage/project-model';
import { fixtureProject } from '../../../../../packages/test-fixtures/src';
import { deriveWorldSnapshot } from './helpers';

describe('world-space helpers', () => {
  it('resolves the active sequence and variant from composition identity', () => {
    const project = fixtureProject as NormalizedProjectFile;
    const snapshot = deriveWorldSnapshot({
      project
    });

    expect(snapshot.resolverOk).toBe(true);
    expect(snapshot.sequence?.id).toBe('sequence-main');
    expect(snapshot.variant?.id).toBe('variant-main');
    expect(snapshot.exportTargets.map((selection) => selection.profileId)).toEqual(['landscape-master', 'portrait-short-form']);
  });

  it('falls back to the first scene with layers and first selected layer', () => {
    const baseProject = fixtureProject as NormalizedProjectFile;
    const project = {
      ...baseProject,
      composition: {
        ...baseProject.composition,
        scenes: [
          {
            id: 'scene-empty',
            name: 'Empty Scene',
            climate: {},
            activation: [],
            transitions: [],
            layerIds: [],
            archiveReferenceIds: []
          },
          ...baseProject.composition.scenes
        ]
      }
    } as NormalizedProjectFile;
    const snapshot = deriveWorldSnapshot({
      project,
      selectedSceneId: 'scene-missing',
      selectedLayerId: 'layer-missing'
    });

    expect(snapshot.selectedScene?.scene.id).toBe('scene-main');
    expect(snapshot.selectedLayer?.id).toBe('layer-clip-intro');
  });

  it('keeps rejected cuts out of the active region surface', () => {
    const baseProject = fixtureProject as NormalizedProjectFile;
    const project = {
      ...baseProject,
      cutCandidates: baseProject.cutCandidates.map((cut) => cut.id === 'cut-intro' ? {
        ...cut,
        status: 'rejected',
        favorite: false
      } : cut)
    } as NormalizedProjectFile;
    const snapshot = deriveWorldSnapshot({
      project,
      selectedLayerId: 'layer-clip-intro'
    });

    expect(snapshot.selectedScene?.layers.map((layer) => layer.id)).not.toContain('layer-clip-intro');
    expect(snapshot.selectedLayer?.id).not.toBe('layer-clip-intro');
  });

  it('filters scene and layer integrity diagnostics to the selected scope', () => {
    const baseProject = fixtureProject as NormalizedProjectFile;
    const project = {
      ...baseProject,
      composition: {
        ...baseProject.composition,
        scenes: [
          ...baseProject.composition.scenes,
          {
            id: 'scene-broken',
            name: 'Broken Scene',
            climate: {},
            activation: [],
            transitions: [],
            layerIds: ['layer-missing'],
            archiveReferenceIds: []
          }
        ],
        layers: [
          ...baseProject.composition.layers,
          {
            id: 'layer-broken',
            name: 'Broken Layer',
            sceneId: 'scene-main',
            orderIndex: 1,
            scope: 'diagnostic',
            contribution: 'diagnostic',
            influence: ['diagnostic'],
            blendIntent: 'normal',
            mix: 1,
            stackId: 'stack-missing',
            archiveReferenceIds: [],
            renderIntent: {
              passKind: 'diagnostic'
            }
          }
        ]
      }
    } as NormalizedProjectFile;

    const sceneSnapshot = deriveWorldSnapshot({ project, selectedSceneId: 'scene-broken' });
    expect(sceneSnapshot.selectedScene?.diagnostics.map((issue) => issue.path)).toEqual([
      'composition.scenes.scene-broken.layerIds'
    ]);

    const layerSnapshot = deriveWorldSnapshot({ project, selectedSceneId: 'scene-main', selectedLayerId: 'layer-broken' });
    expect(layerSnapshot.selectedLayerDiagnostics.map((issue) => issue.path)).toEqual([
      'composition.layers.layer-broken.stackId'
    ]);
  });

  it('summarizes render readiness from export selections, diagnostics, and jobs', () => {
    const baseProject = fixtureProject as NormalizedProjectFile;
    const project = {
      ...baseProject,
      exportSelections: [
        ...baseProject.exportSelections,
        {
          profileId: 'square-social',
          enabled: false,
          overwriteExisting: true
        }
      ],
      composition: {
        ...baseProject.composition,
        exportProfileIds: ['square-social']
      }
    } as NormalizedProjectFile;
    const snapshot = deriveWorldSnapshot({
      project,
      jobs: [
        {
          id: 'job-export-failed',
          type: 'export',
          target: '/tmp/out.mp4',
          status: 'failed',
          log: []
        }
      ],
      diagnostics: {
        toolchain: {
          available: true,
          warnings: [],
          versions: {}
        },
        warnings: ['Missing optional tool'],
        missingMedia: [],
        recentCommands: [],
        logs: [],
        environmentSummary: {}
      }
    });

    expect(snapshot.readiness.previewReady).toBe(true);
    expect(snapshot.readiness.exportReady).toBe(false);
    expect(snapshot.readiness.enabledExportCount).toBe(0);
    expect(snapshot.readiness.failedJobCount).toBe(1);
    expect(snapshot.readiness.warningCount).toBe(1);
    expect(snapshot.readiness.reasons).toEqual(expect.arrayContaining([
      'no enabled export targets',
      '1 desktop diagnostic issue',
      '1 failed render job'
    ]));
  });
});
