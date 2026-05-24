import { describe, expect, it } from 'vitest';
import type { NormalizedProjectFile } from '@afterimage/project-model';
import type { DesktopJob } from '../../lib/studio-client';
import { fixtureProject } from '../../../../../packages/test-fixtures/src';
import { derivePerformanceSnapshot } from './helpers';

function job(input: Partial<DesktopJob> & Pick<DesktopJob, 'id' | 'type' | 'target' | 'status'>): DesktopJob {
  return {
    log: [],
    ...input
  } as DesktopJob;
}

describe('performance-space helpers', () => {
  it('resolves the active sequence and variant from composition identity', () => {
    const snapshot = derivePerformanceSnapshot({
      project: fixtureProject as NormalizedProjectFile,
      projectRoot: '/tmp/project'
    });

    expect(snapshot.resolverOk).toBe(true);
    expect(snapshot.sequence?.id).toBe('sequence-main');
    expect(snapshot.variant?.id).toBe('variant-main');
    expect(snapshot.previewOutputPath).toBe('/tmp/project/.afterimage/preview/variant-main.mp4');
    expect(snapshot.previewJob.label).toBe('not previewed');
    expect(snapshot.replayJob.label).toBe('not replayed');
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
    const snapshot = derivePerformanceSnapshot({
      project,
      selectedSceneId: 'scene-missing',
      selectedLayerId: 'layer-missing'
    });

    expect(snapshot.selectedScene?.scene.id).toBe('scene-main');
    expect(snapshot.selectedLayer?.id).toBe('layer-clip-intro');
  });

  it('selects the latest capture session and matching log', () => {
    const baseProject = fixtureProject as NormalizedProjectFile;
    const project = {
      ...baseProject,
      captureSessions: [
        ...baseProject.captureSessions,
        {
          ...baseProject.captureSessions[0],
          id: 'capture-session-newer',
          startedAt: '2026-04-01T00:00:00.000Z',
          completedAt: '2026-04-01T00:01:00.000Z'
        }
      ],
      captureLogs: [
        ...baseProject.captureLogs,
        {
          id: 'capture-log-newer',
          captureSessionId: 'capture-session-newer',
          events: []
        }
      ]
    } as NormalizedProjectFile;

    const snapshot = derivePerformanceSnapshot({ project });

    expect(snapshot.latestCaptureSession?.id).toBe('capture-session-newer');
    expect(snapshot.latestCaptureLog?.id).toBe('capture-log-newer');
    expect(snapshot.selectedCaptureLog?.id).toBe('capture-log-newer');
  });

  it('explains preview and replay readiness reasons', () => {
    const baseProject = fixtureProject as NormalizedProjectFile;
    const project = {
      ...baseProject,
      captureLogs: []
    } as NormalizedProjectFile;
    const snapshot = derivePerformanceSnapshot({
      project,
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
    expect(snapshot.readiness.previewReasons).toContain('1 desktop diagnostic issue');
    expect(snapshot.readiness.replayReady).toBe(false);
    expect(snapshot.readiness.replayReasons).toEqual(expect.arrayContaining([
      '1 desktop diagnostic issue',
      'no capture session or log is available'
    ]));
  });

  it('summarizes failed, running, and queued preview jobs for output targets', () => {
    const project = fixtureProject as NormalizedProjectFile;
    const previewTarget = '/tmp/project/.afterimage/preview/variant-main.mp4';
    const replayTarget = '/tmp/project/.afterimage/preview/variant-main-capture-log-main-replay.mp4';
    const snapshot = derivePerformanceSnapshot({
      project,
      projectRoot: '/tmp/project',
      jobs: [
        job({ id: 'preview-failed', type: 'preview', target: previewTarget, status: 'failed', error: 'ffmpeg failed', startedAt: '2026-01-01T00:00:00Z' }),
        job({ id: 'preview-running', type: 'preview', target: previewTarget, status: 'running', progress: 0.42, startedAt: '2026-01-02T00:00:00Z' }),
        job({ id: 'replay-queued', type: 'preview', target: replayTarget, status: 'queued', startedAt: '2026-01-03T00:00:00Z' })
      ]
    });

    expect(snapshot.previewJob.label).toBe('building preview');
    expect(snapshot.previewJob.progress).toBe(42);
    expect(snapshot.readiness.previewReasons).toContain('preview already active');
    expect(snapshot.readiness.previewReady).toBe(false);
    expect(snapshot.replayJob.label).toBe('queued');
    expect(snapshot.readiness.replayReasons).toContain('replay preview already active');
    expect(snapshot.readiness.replayReady).toBe(false);
  });

  it('filters diagnostics to selected scene and layer scopes', () => {
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

    const sceneSnapshot = derivePerformanceSnapshot({ project, selectedSceneId: 'scene-broken' });
    expect(sceneSnapshot.selectedScene?.diagnostics.map((issue) => issue.path)).toEqual([
      'composition.scenes.scene-broken.layerIds'
    ]);

    const layerSnapshot = derivePerformanceSnapshot({ project, selectedSceneId: 'scene-main', selectedLayerId: 'layer-broken' });
    expect(layerSnapshot.selectedLayerDiagnostics.map((issue) => issue.path)).toEqual([
      'composition.layers.layer-broken.stackId'
    ]);
  });
});
