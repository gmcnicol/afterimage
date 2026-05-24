import { describe, expect, it } from 'vitest';
import type { NormalizedProjectFile } from '@afterimage/project-model';
import type { DesktopJob, DiagnosticsSnapshot } from '../lib/studio-client';
import { fixtureProject } from '../../../../packages/test-fixtures/src';
import { deriveForgeSnapshot } from './forge-space';

function job(input: Partial<DesktopJob> & Pick<DesktopJob, 'id' | 'type' | 'target' | 'status'>): DesktopJob {
  return {
    log: [],
    ...input
  } as DesktopJob;
}

function diagnostics(input: Partial<DiagnosticsSnapshot> = {}): DiagnosticsSnapshot {
  return {
    toolchain: {
      available: true,
      warnings: [],
      versions: {},
      ...input.toolchain
    },
    warnings: [],
    missingMedia: [],
    recentCommands: [],
    logs: [],
    environmentSummary: {},
    ...input
  };
}

describe('forge-space snapshot', () => {
  it('resolves the active sequence and variant, then falls back through project defaults', () => {
    const project = fixtureProject as NormalizedProjectFile;
    const snapshot = deriveForgeSnapshot({ project, projectRoot: '/tmp/project' });

    expect(snapshot.resolverOk).toBe(true);
    expect(snapshot.sequence?.id).toBe('sequence-main');
    expect(snapshot.variant?.id).toBe('variant-main');
    expect(snapshot.outputPath).toBe('/tmp/project/exports/project-core-engine-fixture-variant-main');

    const fallback = deriveForgeSnapshot({
      project: {
        ...project,
        composition: {
          ...project.composition,
          sequenceId: 'missing-sequence',
          variantId: 'missing-variant'
        }
      } as NormalizedProjectFile
    });

    expect(fallback.resolverOk).toBe(false);
    expect(fallback.sequence?.id).toBe('sequence-main');
    expect(fallback.variant?.id).toBe('variant-main');
  });

  it('summarizes enabled profile readiness and blocks when no profiles are enabled', () => {
    const project = fixtureProject as NormalizedProjectFile;
    const ready = deriveForgeSnapshot({ project });
    const blocked = deriveForgeSnapshot({
      project: {
        ...project,
        exportSelections: project.exportSelections.map((selection) => ({ ...selection, enabled: false }))
      } as NormalizedProjectFile
    });

    expect(ready.enabledProfiles.map((profile) => profile.id)).toEqual(['landscape-master', 'portrait-short-form']);
    expect(ready.readiness.ready).toBe(true);
    expect(blocked.readiness.ready).toBe(false);
    expect(blocked.readiness.reasons).toContain('no enabled forge profiles');
  });

  it('selects the latest capture session/log and honors explicit replay source selection', () => {
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

    const latest = deriveForgeSnapshot({ project });
    const selected = deriveForgeSnapshot({ project, selectedCaptureLogId: 'capture-log-main' });

    expect(latest.latestCaptureSession?.id).toBe('capture-session-newer');
    expect(latest.latestCaptureLog?.id).toBe('capture-log-newer');
    expect(latest.selectedCaptureLog?.id).toBe('capture-log-newer');
    expect(selected.selectedCaptureLog?.id).toBe('capture-log-main');
    expect(selected.selectedCaptureSession?.id).toBe('capture-session-main');
  });

  it('reports replay readiness for no log, empty log, and eventful log cases', () => {
    const baseProject = fixtureProject as NormalizedProjectFile;
    const noLog = deriveForgeSnapshot({
      project: {
        ...baseProject,
        captureLogs: []
      } as NormalizedProjectFile
    });
    const emptyLog = deriveForgeSnapshot({
      project: {
        ...baseProject,
        captureLogs: [{ id: 'empty-log', captureSessionId: 'capture-session-main', events: [] }]
      } as NormalizedProjectFile
    });
    const eventful = deriveForgeSnapshot({ project: baseProject });

    expect(noLog.replayReadiness.ready).toBe(false);
    expect(noLog.replayReadiness.reasons).toContain('no capture log selected for replay forge');
    expect(emptyLog.replayReadiness.ready).toBe(false);
    expect(emptyLog.replayReadiness.reasons).toContain('selected capture log has no events');
    expect(eventful.replayReadiness.ready).toBe(true);
    expect(eventful.replayCriticalEvents).toHaveLength(1);
  });

  it('groups export jobs by profile and classifies queued, running, failed, completed, cancelled, and idle lanes', () => {
    const project = fixtureProject as NormalizedProjectFile;
    const snapshot = deriveForgeSnapshot({
      project,
      selectedProfileId: 'square-social',
      jobs: [
        job({ id: 'queued', type: 'export', target: 'landscape-master', status: 'queued' }),
        job({ id: 'running', type: 'export', target: 'portrait-short-form', status: 'running' }),
        job({ id: 'failed', type: 'export', target: 'square-social', status: 'failed' }),
        job({ id: 'completed', type: 'export', target: 'archive-master', status: 'completed' }),
        job({ id: 'cancelled', type: 'export', target: 'legacy-profile', status: 'cancelled' })
      ]
    });

    expect(Object.fromEntries(snapshot.lanes.map((lane) => [lane.profileId, lane.state]))).toMatchObject({
      'landscape-master': 'queued',
      'portrait-short-form': 'running',
      'square-social': 'failed',
      'archive-master': 'completed',
      'legacy-profile': 'cancelled'
    });
    expect(snapshot.activeJobCount).toBe(2);
    expect(snapshot.failedJobCount).toBe(1);
    expect(snapshot.completedJobCount).toBe(1);
    expect(snapshot.cancelledJobCount).toBe(1);
  });

  it('extracts final output, render artifacts, provenance, and render diagnostics from completed export jobs', () => {
    const project = fixtureProject as NormalizedProjectFile;
    const snapshot = deriveForgeSnapshot({
      project,
      jobs: [
        job({
          id: 'completed',
          type: 'export',
          target: 'landscape-master',
          status: 'completed',
          result: {
            kind: 'export',
            outputPath: '/tmp/project/exports/final.mp4',
            artifacts: [
              {
                id: 'preview-pass',
                role: 'render-output',
                path: '/tmp/project/.afterimage/cache/pass.mp4',
                cacheKey: 'cache-pass',
                producedBy: 'render-pass',
                provenance: { clipId: 'clip-intro' }
              },
              {
                id: 'final-pass',
                role: 'export-output',
                path: '/tmp/project/exports/final.mp4',
                cacheKey: 'cache-final',
                producedBy: 'export-pass',
                provenance: { profileId: 'landscape-master' }
              }
            ],
            diagnostics: [
              {
                id: 'diag-replay',
                severity: 'warning',
                code: 'capture-replay-gap',
                message: 'Capture replay target is missing.',
                nodeId: 'node-capture'
              }
            ]
          }
        })
      ]
    });

    expect(snapshot.artifacts.map((artifact) => artifact.path)).toEqual([
      '/tmp/project/exports/final.mp4',
      '/tmp/project/.afterimage/cache/pass.mp4',
      '/tmp/project/exports/final.mp4'
    ]);
    expect(snapshot.artifacts.find((artifact) => artifact.cacheKey === 'cache-pass')?.provenance).toEqual({ clipId: 'clip-intro' });
    expect(snapshot.artifacts.filter((artifact) => artifact.final)).toHaveLength(2);
    expect(snapshot.diagnostics).toMatchObject([
      {
        code: 'capture-replay-gap',
        profileId: 'landscape-master',
        nodeId: 'node-capture'
      }
    ]);
  });

  it('turns integrity issues, missing media, unavailable toolchain, desktop warnings, and failed jobs into blockers', () => {
    const baseProject = fixtureProject as NormalizedProjectFile;
    const project = {
      ...baseProject,
      composition: {
        ...baseProject.composition,
        layers: [
          ...baseProject.composition.layers,
          {
            ...baseProject.composition.layers[0],
            id: 'layer-broken',
            stackId: 'stack-missing'
          }
        ]
      }
    } as NormalizedProjectFile;
    const snapshot = deriveForgeSnapshot({
      project,
      diagnostics: diagnostics({
        toolchain: { available: false, warnings: ['ffmpeg path is missing'], versions: {} },
        warnings: ['Project root is disposable'],
        missingMedia: ['/tmp/missing.mp4']
      }),
      jobs: [
        job({ id: 'failed', type: 'export', target: 'landscape-master', status: 'failed', error: 'ffmpeg failed' })
      ]
    });

    expect(snapshot.readiness.ready).toBe(false);
    expect(snapshot.readiness.reasons).toEqual(expect.arrayContaining([
      '1 composition integrity issue',
      '1 missing media reference',
      'render toolchain unavailable',
      '1 toolchain warning',
      '1 desktop warning',
      '1 failed forge job'
    ]));
  });

  it('selects details for profile, capture log, job, artifact, diagnostic, and fallback order', () => {
    const project = fixtureProject as NormalizedProjectFile;
    const jobs = [
      job({
        id: 'failed',
        type: 'export',
        target: 'landscape-master',
        status: 'failed',
        result: {
          kind: 'export',
          outputPath: '/tmp/final.mp4',
          artifacts: [],
          diagnostics: [{ id: 'diag', severity: 'error', code: 'render-error', message: 'Render failed.' }]
        }
      })
    ];

    expect(deriveForgeSnapshot({ project, selectedDetailId: 'profile:landscape-master' }).selectedDetail.kind).toBe('profile');
    expect(deriveForgeSnapshot({ project, selectedDetailId: 'capture-log:capture-log-main' }).selectedDetail.kind).toBe('capture-log');
    expect(deriveForgeSnapshot({ project, jobs, selectedDetailId: 'job:failed' }).selectedDetail.kind).toBe('job');
    expect(deriveForgeSnapshot({ project, jobs, selectedDetailId: 'artifact:failed:output' }).selectedDetail.kind).toBe('artifact');
    expect(deriveForgeSnapshot({ project, jobs, selectedDetailId: 'diagnostic:failed:diag' }).selectedDetail.kind).toBe('diagnostic');
    expect(deriveForgeSnapshot({ project, jobs }).selectedDetail.kind).toBe('job');
  });
});
