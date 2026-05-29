import { describe, expect, it } from 'vitest';
import type { NormalizedProjectFile } from '@afterimage/project-model';
import { fixtureProject } from '../../../../../packages/test-fixtures/src';
import type { DesktopJob, DiagnosticsSnapshot } from '../../lib/studio-client';
import {
  behaviouralFieldOverlayCopy,
  resolveFieldOverlayMode,
  resolveNextFieldSelectionFromSignal,
  resolveNextSignalSelectionFromField,
  spatialSignalIdForField,
  deriveObservatorySnapshot
} from './helpers';

function projectCopy(): NormalizedProjectFile {
  return JSON.parse(JSON.stringify(fixtureProject)) as NormalizedProjectFile;
}

function diagnostics(input: Partial<DiagnosticsSnapshot> = {}): DiagnosticsSnapshot {
  const { toolchain, ...rest } = input;
  const mergedToolchain = {
    available: true,
    warnings: [],
    versions: {
      ffmpeg: {
        path: '/usr/local/bin/ffmpeg',
        versionLine: 'ffmpeg 7.1',
        available: true
      }
    },
    ...toolchain
  };

  return {
    warnings: [],
    missingMedia: [],
    recentCommands: [],
    logs: [],
    environmentSummary: {},
    ...rest,
    toolchain: mergedToolchain
  };
}

function job(input: Partial<DesktopJob> & Pick<DesktopJob, 'id' | 'type' | 'status'>): DesktopJob {
  return {
    target: '/tmp/output.mp4',
    log: [],
    ...input
  } as DesktopJob;
}

describe('observatory-space helpers', () => {
  it('resolves active sequence and variant and summarizes world telemetry', () => {
    const snapshot = deriveObservatorySnapshot({
      project: projectCopy(),
      diagnostics: diagnostics()
    });

    expect(snapshot.resolverOk).toBe(true);
    expect(snapshot.sequence?.id).toBe('sequence-main');
    expect(snapshot.variant?.id).toBe('variant-main');
    expect(snapshot.telemetry).toMatchObject({
      sceneCount: 1,
      layerCount: 1,
      pressure: 0.35,
      entropy: 0.12,
      cohesion: 0.82,
      memory: 0.4,
      volatility: 0.18,
      routeCount: 1,
      entropyStateCount: 1,
      archiveReferenceCount: 3,
      captureSessionCount: 1,
      captureLogCount: 1,
      captureEventCount: 1,
      replayCriticalEventCount: 1
    });
  });

  it('reports a healthy trust state when no blockers or warnings are present', () => {
    const snapshot = deriveObservatorySnapshot({
      project: projectCopy(),
      diagnostics: diagnostics()
    });

    expect(snapshot.trust).toMatchObject({
      state: 'trusted',
      blockerCount: 0,
      warningCount: 0,
      reasons: []
    });
    expect(snapshot.lanes.find((lane) => lane.id === 'trust')?.summary).toBe('No blockers are present.');
  });

  it('categorizes integrity issues, missing media, toolchain problems, desktop warnings, and failed jobs as trust signals', () => {
    const project = projectCopy();
    project.composition.layers = [
      ...project.composition.layers,
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
    ];

    const snapshot = deriveObservatorySnapshot({
      project,
      diagnostics: diagnostics({
        toolchain: {
          available: false,
          warnings: ['ffprobe missing optional codec probe'],
          versions: {}
        },
        warnings: ['Missing optional tool'],
        missingMedia: ['/clips/missing.mp4']
      }),
      jobs: [
        job({
          id: 'job-export-failed',
          type: 'export',
          status: 'failed',
          error: 'Render failed'
        })
      ]
    });

    const trustKinds = snapshot.lanes.find((lane) => lane.id === 'trust')?.signals.map((signal) => signal.kind);

    expect(snapshot.trust.state).toBe('blocked');
    expect(snapshot.trust.blockerCount).toBeGreaterThanOrEqual(4);
    expect(snapshot.trust.warningCount).toBeGreaterThanOrEqual(1);
    expect(trustKinds).toEqual(expect.arrayContaining([
      'integrity-issue',
      'missing-media',
      'toolchain',
      'backend-warning',
      'job'
    ]));
  });

  it('extracts render graph diagnostics from preview and export job results', () => {
    const snapshot = deriveObservatorySnapshot({
      project: projectCopy(),
      diagnostics: diagnostics(),
      jobs: [
        job({
          id: 'job-preview',
          type: 'preview',
          status: 'completed',
          result: {
            kind: 'preview',
            outputPath: '/tmp/preview.mp4',
            diagnostics: [{
              id: 'diagnostic-preview',
              severity: 'warning',
              code: 'FFMPEG_PASS_COMPATIBILITY',
              message: 'Preview pass requires compatibility fallback.',
              passId: 'pass-source'
            }]
          }
        }),
        job({
          id: 'job-export',
          type: 'export',
          status: 'completed',
          result: {
            kind: 'export',
            outputPath: '/tmp/export.mp4',
            diagnostics: [{
              id: 'diagnostic-export',
              severity: 'error',
              code: 'CAPTURE_REPLAY_MISSING_REFERENCE',
              message: 'Capture replay target is missing.',
              nodeId: 'node-capture'
            }]
          }
        })
      ]
    });

    expect(snapshot.renderDiagnostics.map((entry) => entry.diagnostic.code)).toEqual([
      'FFMPEG_PASS_COMPATIBILITY',
      'CAPTURE_REPLAY_MISSING_REFERENCE'
    ]);
    expect(snapshot.lanes.find((lane) => lane.id === 'render-graph')?.signals
      .filter((signal) => signal.kind === 'render-diagnostic')
      .map((signal) => signal.severity)).toEqual(['warning', 'blocked']);
    expect(snapshot.telemetry.renderDiagnosticCount).toBe(2);
  });

  it('adds field runtime reports and signals for spatial inspection', () => {
    const snapshot = deriveObservatorySnapshot({
      project: projectCopy(),
      diagnostics: diagnostics()
    });
    const fieldSignals = snapshot.lanes.find((lane) => lane.id === 'render-graph')?.signals
      .filter((signal) => signal.kind === 'spatial-field') ?? [];
    const memoryReport = snapshot.fieldRuntime.reports.find((report) => report.fieldId === 'field-memory-scene');

    expect(snapshot.telemetry.spatialFieldCount).toBe(8);
    expect(snapshot.telemetry.fieldRuntimeDiagnosticCount).toBeGreaterThanOrEqual(1);
    expect(fieldSignals.map((signal) => signal.id)).toContain('spatial-field:field-motion-source');
    expect(memoryReport).toMatchObject({
      bufferCount: 5,
      previousFrameId: 'composition-main:sequence-main:variant-main:0:0'
    });
    expect(memoryReport?.persistencePlan).toMatchObject({
      kind: 'history-window',
      windowFrames: 4,
      bufferCount: 5
    });
  });

  it('exposes behavioural field labels while preserving runtime metadata in details', () => {
    const snapshot = deriveObservatorySnapshot({
      project: projectCopy(),
      diagnostics: diagnostics()
    });
    const fieldSignals = snapshot.lanes.find((lane) => lane.id === 'render-graph')?.signals
      .filter((signal) => signal.kind === 'spatial-field') ?? [];
    const pressureSignal = fieldSignals.find((signal) => signal.id === 'spatial-field:field-pressure-scene');
    const driftSignal = fieldSignals.find((signal) => signal.id === 'spatial-field:field-flow-x-scene');

    expect(pressureSignal?.label).toBe('Main Scene Pressure');
    expect(pressureSignal?.label).not.toBe('field-pressure-scene');
    expect(pressureSignal?.summary).toBe('Shows where the scene is being pushed or held. Current fit is stable.');
    expect(driftSignal?.label).toBe('Main Scene Drift X');
    expect(snapshot.fieldLanguage['field-memory-scene']).toMatchObject({
      label: 'Main Scene Memory',
      term: 'Memory',
      preferredOverlayMode: undefined
    });
    expect(pressureSignal?.detail.properties).toEqual(expect.arrayContaining([
      ['field id', 'field-pressure-scene'],
      ['generator id', 'generator-live-flights-flow'],
      ['storage mode', 'gpu-texture'],
      ['profile fit', 'fits']
    ]));
  });

  it('uses the selected Observatory runtime profile when deriving field reports', () => {
    const draft = deriveObservatorySnapshot({
      project: projectCopy(),
      diagnostics: diagnostics(),
      runtimeProfileKind: 'draft'
    });
    const studio = deriveObservatorySnapshot({
      project: projectCopy(),
      diagnostics: diagnostics(),
      runtimeProfileKind: 'studio'
    });
    const draftMemory = draft.fieldRuntime.reports.find((report) => report.fieldId === 'field-memory-scene');
    const studioMemory = studio.fieldRuntime.reports.find((report) => report.fieldId === 'field-memory-scene');

    expect(draft.fieldRuntime.runtimeProfileId).toBe('runtime-profile-draft');
    expect(studio.fieldRuntime.runtimeProfileId).toBe('runtime-profile-studio');
    expect(draftMemory?.dimensions).toEqual({ width: 240, height: 135 });
    expect(studioMemory?.dimensions).toEqual({ width: 480, height: 270 });
    expect(draftMemory?.bufferCount).toBe(5);
    expect(studioMemory?.bufferCount).toBe(5);
  });

  it('maps overlay modes to artist-facing control labels without changing runtime values', () => {
    expect(Object.values(behaviouralFieldOverlayCopy).map((copy) => [copy.mode, copy.label])).toEqual([
      ['isolate', 'Field'],
      ['magnitude', 'Motion'],
      ['flow', 'Drift'],
      ['histogram', 'Balance']
    ]);
  });

  it('keeps spatial-field signal and inspector field selection in sync', () => {
    const availableFieldIds = ['field-pressure-scene', 'field-flow-x-scene'];
    const availableSignalIds = [
      'scene:scene-main',
      spatialSignalIdForField('field-pressure-scene'),
      spatialSignalIdForField('field-flow-x-scene')
    ];

    expect(resolveNextFieldSelectionFromSignal('spatial-field:field-flow-x-scene', 'field-pressure-scene', availableFieldIds))
      .toBe('field-flow-x-scene');
    expect(resolveNextFieldSelectionFromSignal('scene:scene-main', 'field-pressure-scene', availableFieldIds))
      .toBe('field-pressure-scene');
    expect(resolveNextSignalSelectionFromField('field-pressure-scene', availableSignalIds))
      .toBe('spatial-field:field-pressure-scene');
  });

  it('defaults flow-oriented fields to Drift until an overlay mode is explicitly chosen', () => {
    const snapshot = deriveObservatorySnapshot({
      project: projectCopy(),
      diagnostics: diagnostics()
    });
    const flowReport = snapshot.fieldRuntime.reports.find((field) => field.fieldId === 'field-flow-x-scene');
    const pressureReport = snapshot.fieldRuntime.reports.find((field) => field.fieldId === 'field-pressure-scene');

    expect(resolveFieldOverlayMode({
      selectedField: flowReport,
      fieldCopy: snapshot.fieldLanguage['field-flow-x-scene']
    })).toBe('flow');
    expect(resolveFieldOverlayMode({
      selectedField: pressureReport,
      fieldCopy: snapshot.fieldLanguage['field-pressure-scene']
    })).toBe('magnitude');
    expect(resolveFieldOverlayMode({
      explicitMode: 'histogram',
      selectedField: flowReport,
      fieldCopy: snapshot.fieldLanguage['field-flow-x-scene']
    })).toBe('histogram');
  });

  it('keeps prohibited implementation terms out of primary field copy', () => {
    const snapshot = deriveObservatorySnapshot({
      project: projectCopy(),
      diagnostics: diagnostics()
    });
    const primaryFieldCopy = snapshot.signals
      .filter((signal) => signal.kind === 'spatial-field')
      .flatMap((signal) => [signal.label, signal.summary, signal.detail.semantic]);
    const overlayCopy = Object.values(behaviouralFieldOverlayCopy)
      .flatMap((copy) => [copy.label, copy.help]);
    const primaryText = [...primaryFieldCopy, ...overlayCopy].join(' ').toLowerCase();

    expect(primaryText).not.toMatch(/\b(tensor|simulation|node-graph|shader)\b/);
  });

  it('summarizes modulation routes, entropy states, archive references, and capture memory', () => {
    const snapshot = deriveObservatorySnapshot({
      project: projectCopy(),
      diagnostics: diagnostics()
    });
    const worldSignals = snapshot.lanes.find((lane) => lane.id === 'world-state')?.signals ?? [];

    expect(worldSignals.map((signal) => signal.kind)).toEqual(expect.arrayContaining([
      'route',
      'entropy-state',
      'archive-reference',
      'capture-memory'
    ]));
    expect(worldSignals.find((signal) => signal.kind === 'route')?.label).toBe('Bloom MIDI');
    expect(worldSignals.find((signal) => signal.kind === 'entropy-state')?.label).toBe('entropy-scene-pressure');
    expect(worldSignals.find((signal) => signal.kind === 'capture-memory')?.summary).toContain('1 captured event');
  });

  it('selects requested signal detail and falls back to the first warning or blocker', () => {
    const selected = deriveObservatorySnapshot({
      project: projectCopy(),
      diagnostics: diagnostics(),
      selectedSignalId: 'route:route-bloom-midi'
    });

    expect(selected.selectedSignal.kind).toBe('route');
    expect(selected.selectedSignal.detail.semantic).toContain('connect');

    const project = projectCopy();
    project.composition.modulationRoutes = project.composition.modulationRoutes.map((route) => ({
      ...route,
      seedId: undefined
    }));
    const fallback = deriveObservatorySnapshot({
      project,
      diagnostics: diagnostics()
    });

    expect(fallback.selectedSignal.id).toBe('unseeded-route:route-bloom-midi');
    expect(fallback.selectedSignal.kind).toBe('route');
  });
});
