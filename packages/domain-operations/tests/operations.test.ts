import { describe, expect, it } from 'vitest';
import { createEmptyProject, normalizeProject, type NormalizedProjectFile } from '@afterimage/project-model';
import { fixtureArchive, fixtureProject } from '../../test-fixtures/src';
import { validateProject } from '@afterimage/schema-validators';
import {
  acceptArchiveAffinityCandidate,
  acceptArchiveAtmosphereCandidate,
  acceptArchiveBehaviourSeedCandidate,
  acceptArchiveMaterialCandidate,
  acceptArchiveMotifCandidate,
  acceptArchiveMotionCandidate,
  acceptArchiveRecurrenceCandidate,
  acceptArchiveSegmentCandidate,
  collectArchiveDiagnostics,
  rejectArchiveAffinityCandidate,
  rejectArchiveAtmosphereCandidate,
  rejectArchiveBehaviourSeedCandidate,
  rejectArchiveMaterialCandidate,
  rejectArchiveMotifCandidate,
  rejectArchiveMotionCandidate,
  rejectArchiveRecurrenceCandidate,
  rejectArchiveSegmentCandidate,
  normalizeCaptureReplayEvents,
  resolveCaptureReplayIntent,
  resolveCaptureReplayRenderState,
  resolveCompositionIntent,
  setActiveCompositionSequenceVariant,
  updateCutStatus,
  updateCompositionLayer,
  updateCompositionScene
} from '../src';
import {
  addCutToSequence,
  buildNewVariantFromReviewedCuts,
  buildVariantFromReviewedCuts,
  deleteVariant,
  duplicateVariant,
  moveClip,
  removeClip,
  randomizeFoundryOverlays,
  randomizeFoundryTransitions,
  setClipOverlayAsset,
  setClipOverlayCut,
  setClipTransition,
  setClipTransitionAsset,
  setClipTransitionCut,
  setClipTransitionOverlayCut,
  setClipTransitionOverlayAsset
} from '../src/sequence-ops';
import { addAutomationLane, addLaneKeyframe, updateAutomationLaneTarget } from '../src/automation-ops';
import { addEntropyState, addModulationRoute, appendCaptureEvent, completeCaptureSession, createCaptureSession, updateEntropyState, updateModulationRoute } from '../src/capture-ops';
import { mergeImportedAssets, toggleExportProfile } from '../src/project-ops';
import { addFilterToStack, applyPresetDefinitionToStack, applyPresetToStack, safeRandomizeFilter, updateFilterParameter } from '../src/style-ops';
import { importCatalogAssetIntoProject, materializeAnalysisCuts } from '../src/catalog-ops';

function makeProject() {
  const project = createEmptyProject({
    id: 'project-studio-test',
    name: 'Studio Test'
  });

  return {
    ...project,
    filterStacks: [
      {
        id: 'stack-sequence-main',
        name: 'Sequence Stack',
        scope: 'sequence',
        filters: []
      }
    ],
    variants: project.variants.map((variant) => ({
      ...variant,
      stackId: 'stack-sequence-main'
    }))
  };
}

function makeArchiveProject(): NormalizedProjectFile {
  const project = normalizeProject(fixtureProject);

  return normalizeProject({
    ...project,
    composition: {
      ...project.composition,
      acceptedArchiveReferences: [],
      rejectedArchiveReferences: []
    }
  });
}

describe('@afterimage/domain-operations', () => {
  it('resolves the canonical fixture capture replay intent deterministically', () => {
    const result = resolveCaptureReplayIntent({
      project: normalizeProject(fixtureProject),
      captureSessionId: 'capture-session-main',
      availableArchiveIds: ['archive-source-alpha']
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.intent.projectId).toBe('project-core-engine-fixture');
    expect(result.intent.composition.id).toBe('composition-main');
    expect(result.intent.sequence.id).toBe('sequence-main');
    expect(result.intent.variant.id).toBe('variant-main');
    expect(result.intent.captureSession?.id).toBe('capture-session-main');
    expect(result.intent.captureLog.id).toBe('capture-log-main');
    expect(result.intent.replayEvents.map((event) => event.id)).toEqual(['capture-event-1']);
    expect(result.intent.replayEvents[0]).toMatchObject({
      effectiveCompositionTimeMs: 120,
      replayCritical: true,
      replayable: true
    });
    expect(result.intent.skippedEvents).toEqual([]);
    expect(result.intent.referencedRoutes.map((route) => route.id)).toEqual(['route-bloom-midi']);
    expect(result.intent.referencedMappings.map((mapping) => mapping.id)).toEqual(['midi-main']);
    expect(result.intent.referencedSeeds.map((seed) => seed.id)).toEqual(['seed-composition-main']);
    expect(result.diagnostics).toEqual([]);
  });

  it('resolves the canonical fixture capture replay render state deterministically', () => {
    const result = resolveCaptureReplayRenderState({
      project: normalizeProject(fixtureProject),
      captureSessionId: 'capture-session-main',
      availableArchiveIds: ['archive-source-alpha']
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.renderState).toMatchObject({
      projectId: 'project-core-engine-fixture',
      compositionId: 'composition-main',
      sequenceId: 'sequence-main',
      variantId: 'variant-main',
      captureSessionId: 'capture-session-main',
      captureLogId: 'capture-log-main',
      replayEventIds: ['capture-event-1'],
      skippedEvents: []
    });
    expect(result.renderState.filterOverrides).toEqual([{
      eventId: 'capture-event-1',
      routeId: 'route-bloom-midi',
      seedId: 'seed-composition-main',
      captureTimeMs: 120,
      compositionTimeMs: 120,
      filterId: 'filter-main-bloom',
      property: 'mix',
      value: 0.9,
      mappingKind: 'trigger'
    }]);
    expect(result.diagnostics).toEqual([]);
  });

  it('reports unsupported capture replay render semantics without applying them', () => {
    const baseEvent = fixtureProject.captureLogs?.[0]?.events[0];
    expect(baseEvent).toBeDefined();
    if (!baseEvent) {
      return;
    }
    const project = normalizeProject({
      ...fixtureProject,
      captureLogs: [
        {
          id: 'capture-log-main',
          captureSessionId: 'capture-session-main',
          events: [
            {
              ...baseEvent,
              id: 'capture-event-entropy',
              index: 0,
              kind: 'entropy'
            },
            {
              ...baseEvent,
              id: 'capture-event-scene-target',
              index: 1,
              target: {
                kind: 'scene-climate',
                id: 'scene-main',
                property: 'pressure'
              }
            },
            {
              ...baseEvent,
              id: 'capture-event-nonnumeric',
              index: 2,
              payload: {
                value: 'hot'
              }
            }
          ]
        }
      ]
    });
    const result = resolveCaptureReplayRenderState({
      project,
      captureLogId: 'capture-log-main',
      availableArchiveIds: ['archive-source-alpha']
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.renderState.filterOverrides).toEqual([]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'unsupported-value',
        path: 'captureLogs.capture-log-main.events.capture-event-entropy.kind'
      }),
      expect.objectContaining({
        code: 'unsupported-value',
        path: 'captureLogs.capture-log-main.events.capture-event-scene-target.target'
      }),
      expect.objectContaining({
        code: 'unsupported-value',
        path: 'captureLogs.capture-log-main.events.capture-event-nonnumeric.payload.value'
      })
    ]));

    const unsupportedMapping = resolveCaptureReplayRenderState({
      project: normalizeProject({
        ...fixtureProject,
        composition: {
          ...fixtureProject.composition,
          modulationRoutes: fixtureProject.composition.modulationRoutes?.map((route) => route.id === 'route-bloom-midi'
            ? {
                ...route,
                mapping: {
                  ...route.mapping,
                  kind: 'exponential'
                }
              }
            : route)
        }
      }),
      captureLogId: 'capture-log-main',
      availableArchiveIds: ['archive-source-alpha']
    });
    expect(unsupportedMapping.ok).toBe(true);
    if (unsupportedMapping.ok) {
      expect(unsupportedMapping.renderState.filterOverrides).toEqual([]);
      expect(unsupportedMapping.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'unsupported-value',
          path: 'captureLogs.capture-log-main.events.capture-event-1.routeId'
        })
      ]));
    }
  });

  it('resolves the canonical fixture composition intent deterministically', () => {
    const result = resolveCompositionIntent({
      project: normalizeProject(fixtureProject),
      captureSessionId: 'capture-session-main',
      availableArchiveIds: ['archive-source-alpha']
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.intent.projectId).toBe('project-core-engine-fixture');
    expect(result.intent.composition.id).toBe('composition-main');
    expect(result.intent.sequence.id).toBe('sequence-main');
    expect(result.intent.variant.id).toBe('variant-main');
    expect(result.intent.referencedAssets.map((asset) => asset.id)).toEqual(['asset-alpha', 'asset-music']);
    expect(result.intent.exportSelections.map((selection) => selection.profileId)).toEqual(['landscape-master', 'portrait-short-form']);
    expect(result.intent.deterministicSeeds.map((seed) => seed.id)).toEqual(['seed-composition-main']);
    expect(result.intent.scenes.map((scene) => scene.id)).toEqual(['scene-main']);
    expect(result.intent.layers.map((layer) => layer.id)).toEqual(['layer-clip-intro']);
    expect(result.intent.modulationRoutes.map((route) => route.id)).toEqual(['route-bloom-midi']);
    expect(result.intent.entropyStates.map((state) => state.id)).toEqual(['entropy-scene-pressure']);
    expect(result.intent.captureSession?.id).toBe('capture-session-main');
    expect(result.intent.captureLog?.id).toBe('capture-log-main');
    expect(result.intent.archiveReferenceIds).toEqual(['archive-source-alpha']);
    expect(result.intent.acceptedArchiveReferences.map((reference) => reference.id)).toEqual(['accepted-archive-source-alpha-motif-motif-hallway-composition-main-scene-main']);
  });

  it('normalizes capture replay event time and replay-critical filtering deterministically', () => {
    const baseEvent = fixtureProject.captureLogs?.[0]?.events[0];
    expect(baseEvent).toBeDefined();
    if (!baseEvent) {
      return;
    }
    const project = normalizeProject({
      ...fixtureProject,
      captureLogs: [
        {
          id: 'capture-log-main',
          captureSessionId: 'capture-session-main',
          events: [
            {
              ...baseEvent,
              id: 'capture-event-composed',
              index: 1,
              captureTimeMs: 90,
              compositionTimeMs: 20
            },
            {
              ...baseEvent,
              id: 'capture-event-fallback',
              index: 1,
              captureTimeMs: 15,
              compositionTimeMs: undefined
            },
            {
              ...baseEvent,
              id: 'capture-event-noncritical',
              index: 0,
              captureTimeMs: 5,
              compositionTimeMs: undefined,
              replayCritical: false,
              routeId: undefined
            }
          ]
        }
      ]
    });
    const captureLog = project.captureLogs[0];
    const normalized = normalizeCaptureReplayEvents({ project, captureLog });
    const result = resolveCaptureReplayIntent({ project, captureLogId: 'capture-log-main' });

    expect(normalized.map((event) => event.id)).toEqual([
      'capture-event-noncritical',
      'capture-event-fallback',
      'capture-event-composed'
    ]);
    expect(normalized.find((event) => event.id === 'capture-event-fallback')?.effectiveCompositionTimeMs).toBe(15);
    expect(normalized.find((event) => event.id === 'capture-event-composed')?.effectiveCompositionTimeMs).toBe(20);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.intent.replayEvents.map((event) => event.id)).toEqual(['capture-event-fallback', 'capture-event-composed']);
    expect(result.intent.skippedEvents.map((event) => [event.id, event.skipReasons])).toEqual([
      ['capture-event-noncritical', ['not-replay-critical']]
    ]);

    const includeNonCritical = resolveCaptureReplayIntent({
      project,
      captureLogId: 'capture-log-main',
      options: {
        replayCriticalOnly: false
      }
    });
    expect(includeNonCritical.ok).toBe(true);
    if (includeNonCritical.ok) {
      expect(includeNonCritical.intent.replayEvents.map((event) => event.id)).toEqual([
        'capture-event-noncritical',
        'capture-event-fallback',
        'capture-event-composed'
      ]);
    }
  });

  it('reports skipped replay events with diagnostics for unresolved capture references', () => {
    const baseEvent = fixtureProject.captureLogs?.[0]?.events[0];
    expect(baseEvent).toBeDefined();
    if (!baseEvent) {
      return;
    }
    const project = normalizeProject({
      ...fixtureProject,
      captureLogs: [
        {
          id: 'capture-log-main',
          captureSessionId: 'capture-session-main',
          events: [
            {
              ...baseEvent,
              id: 'capture-event-missing-route',
              routeId: 'route-missing'
            },
            {
              ...baseEvent,
              id: 'capture-event-missing-mapping',
              mappingId: 'mapping-missing'
            },
            {
              ...baseEvent,
              id: 'capture-event-missing-seed',
              seedId: 'seed-missing'
            },
            {
              ...baseEvent,
              id: 'capture-event-missing-source',
              source: {
                kind: 'automation-lane',
                id: 'lane-missing'
              }
            },
            {
              ...baseEvent,
              id: 'capture-event-missing-target',
              target: {
                kind: 'filter',
                id: 'filter-missing',
                property: 'mix'
              }
            },
            {
              ...baseEvent,
              id: 'capture-event-missing-session',
              captureId: 'capture-session-missing'
            }
          ]
        }
      ]
    });
    const result = resolveCaptureReplayIntent({ project, captureLogId: 'capture-log-main' });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.intent.replayEvents).toEqual([]);
    expect(result.intent.skippedEvents.map((event) => [event.id, event.skipReasons])).toEqual([
      ['capture-event-missing-mapping', ['missing-mapping']],
      ['capture-event-missing-route', ['missing-route']],
      ['capture-event-missing-seed', ['missing-seed']],
      ['capture-event-missing-session', ['missing-session']],
      ['capture-event-missing-source', ['missing-source']],
      ['capture-event-missing-target', ['missing-target']]
    ]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      {
        code: 'missing-reference',
        message: 'Capture event "capture-event-missing-route" references missing modulation route "route-missing".',
        path: 'captureLogs.capture-log-main.events.capture-event-missing-route.routeId'
      },
      {
        code: 'missing-reference',
        message: 'Capture event "capture-event-missing-mapping" references missing MIDI mapping "mapping-missing".',
        path: 'captureLogs.capture-log-main.events.capture-event-missing-mapping.mappingId'
      },
      {
        code: 'missing-reference',
        message: 'Capture event "capture-event-missing-seed" references missing deterministic seed "seed-missing".',
        path: 'captureLogs.capture-log-main.events.capture-event-missing-seed.seedId'
      },
      {
        code: 'missing-reference',
        message: 'Capture event "capture-event-missing-source" source references missing automation lane "lane-missing".',
        path: 'captureLogs.capture-log-main.events.capture-event-missing-source.source.id'
      },
      {
        code: 'missing-reference',
        message: 'Capture event "capture-event-missing-target" target references missing filter "filter-missing".',
        path: 'captureLogs.capture-log-main.events.capture-event-missing-target.target.id'
      },
      {
        code: 'missing-reference',
        message: 'Capture event "capture-event-missing-session" references missing capture session "capture-session-missing".',
        path: 'captureLogs.capture-log-main.events.capture-event-missing-session.captureId'
      }
    ]));

    const missingLog = resolveCaptureReplayIntent({
      project,
      captureSessionId: 'capture-session-without-log'
    });
    expect(missingLog.ok).toBe(false);
    expect(missingLog.diagnostics).toEqual(expect.arrayContaining([
      {
        code: 'missing-reference',
        message: 'Capture replay references missing capture log for session "capture-session-without-log".',
        path: 'captureLogId'
      }
    ]));
  });

  it('resolves an empty project through fallback composition identity', () => {
    const result = resolveCompositionIntent({
      project: createEmptyProject({
        id: 'project-empty-intent',
        name: 'Empty Intent'
      })
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.intent.composition.id).toBe('composition-main');
    expect(result.intent.sequence.id).toBe('sequence-main');
    expect(result.intent.variant.id).toBe('variant-main');
    expect(result.intent.referencedAssets).toEqual([]);
    expect(result.intent.scenes.map((scene) => scene.id)).toEqual(['scene-main']);
    expect(result.intent.layers).toEqual([]);
  });

  it('returns resolver diagnostics for missing scene, layer, modulation, and capture references', () => {
    const project = normalizeProject({
      ...fixtureProject,
      composition: {
        ...fixtureProject.composition,
        modulationRoutes: [
          ...fixtureProject.composition?.modulationRoutes ?? [],
          {
            id: 'route-broken',
            source: {
              kind: 'automation-lane',
              id: 'lane-missing'
            },
            target: {
              kind: 'filter',
              id: 'filter-main-bloom',
              property: 'mix'
            },
            mapping: {
              kind: 'linear'
            },
            scope: {
              sceneId: 'scene-missing',
              layerId: 'layer-missing'
            },
            capturePolicy: 'record'
          }
        ],
        scenes: [
          {
            id: 'scene-broken',
            name: 'Broken Scene',
            layerIds: ['layer-missing']
          }
        ],
        layers: [
          {
            id: 'layer-broken',
            name: 'Broken Layer',
            sceneId: 'scene-missing',
            orderIndex: 0,
            scope: 'diagnostic',
            contribution: 'diagnostic',
            renderIntent: {
              passKind: 'diagnostic'
            }
          }
        ]
      },
      captureLogs: [
        {
          id: 'capture-log-broken',
          captureSessionId: 'capture-missing',
          events: []
        }
      ]
    });
    const result = resolveCompositionIntent({ project });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      {
        code: 'missing-reference',
        message: 'Modulation route "route-broken" source references missing automation lane "lane-missing".',
        path: 'composition.modulationRoutes.route-broken.source.id'
      },
      {
        code: 'missing-reference',
        message: 'Modulation route "route-broken" references missing scene "scene-missing".',
        path: 'composition.modulationRoutes.route-broken.scope.sceneId'
      },
      {
        code: 'missing-reference',
        message: 'Scene "scene-broken" references missing layer "layer-missing".',
        path: 'composition.scenes.scene-broken.layerIds'
      },
      {
        code: 'missing-reference',
        message: 'Layer "layer-broken" references missing scene "scene-missing".',
        path: 'composition.layers.layer-broken.sceneId'
      },
      {
        code: 'missing-reference',
        message: 'Capture log "capture-log-broken" references missing capture session "capture-missing".',
        path: 'captureLogs.capture-log-broken.captureSessionId'
      }
    ]));
  });

  it('returns archive diagnostics only when archive availability context is supplied', () => {
    const project = normalizeProject(fixtureProject);

    expect(resolveCompositionIntent({ project }).ok).toBe(true);

    const result = resolveCompositionIntent({
      project,
      availableArchiveIds: ['archive-other']
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      {
        code: 'missing-reference',
        message: 'Scene "scene-main" references missing archive "archive-source-alpha".',
        path: 'composition.scenes.scene-main.archiveReferenceIds'
      },
      {
        code: 'missing-reference',
        message: 'Layer "layer-clip-intro" references missing archive "archive-source-alpha".',
        path: 'composition.layers.layer-clip-intro.archiveReferenceIds'
      }
    ]));
  });

  it('accepts and rejects each M2 archive candidate class', () => {
    let project = makeArchiveProject();

    const segment = acceptArchiveSegmentCandidate(project, fixtureArchive, 'segment-alpha-hallway', {
      scope: { compositionId: 'composition-main', sceneId: 'scene-main' },
      targetIds: ['scene-main']
    });
    project = segment.project;
    const motif = acceptArchiveMotifCandidate(project, fixtureArchive, 'motif-hallway');
    project = motif.project;
    const atmosphere = acceptArchiveAtmosphereCandidate(project, fixtureArchive, 'atmosphere-thermal-drift');
    project = atmosphere.project;
    const material = acceptArchiveMaterialCandidate(project, fixtureArchive, 'material-concrete');
    project = material.project;
    const motion = acceptArchiveMotionCandidate(project, fixtureArchive, 'motion-drift');
    project = motion.project;
    const behaviour = acceptArchiveBehaviourSeedCandidate(project, fixtureArchive, 'seed-memory-resurface');
    project = behaviour.project;
    const recurrence = acceptArchiveRecurrenceCandidate(project, fixtureArchive, 'recurrence-hallway-thermal');
    project = recurrence.project;
    const affinity = acceptArchiveAffinityCandidate(project, fixtureArchive, 'affinity-hallway-concrete');
    project = affinity.project;

    expect(project.composition.acceptedArchiveReferences.map((reference) => reference.referenceKind)).toEqual([
      'affinity',
      'atmosphere',
      'behaviour-seed',
      'material',
      'motif',
      'motion',
      'recurrence',
      'segment'
    ]);

    project = rejectArchiveSegmentCandidate(project, fixtureArchive, 'segment-alpha-hallway').project;
    project = rejectArchiveMotifCandidate(project, fixtureArchive, 'motif-hallway').project;
    project = rejectArchiveAtmosphereCandidate(project, fixtureArchive, 'atmosphere-thermal-drift').project;
    project = rejectArchiveMaterialCandidate(project, fixtureArchive, 'material-concrete').project;
    project = rejectArchiveMotionCandidate(project, fixtureArchive, 'motion-drift').project;
    project = rejectArchiveBehaviourSeedCandidate(project, fixtureArchive, 'seed-memory-resurface').project;
    project = rejectArchiveRecurrenceCandidate(project, fixtureArchive, 'recurrence-hallway-thermal').project;
    project = rejectArchiveAffinityCandidate(project, fixtureArchive, 'affinity-hallway-concrete').project;

    expect(project.composition.rejectedArchiveReferences.map((reference) => reference.referenceKind)).toEqual([
      'affinity',
      'atmosphere',
      'behaviour-seed',
      'material',
      'motif',
      'motion',
      'recurrence',
      'segment'
    ]);
  });

  it('keeps duplicate archive acceptance idempotent', () => {
    const first = acceptArchiveSegmentCandidate(makeArchiveProject(), fixtureArchive, 'segment-alpha-hallway', {
      scope: { compositionId: 'composition-main', sceneId: 'scene-main' },
      targetIds: ['scene-main']
    });
    const second = acceptArchiveSegmentCandidate(first.project, fixtureArchive, 'segment-alpha-hallway', {
      scope: { compositionId: 'composition-main', sceneId: 'scene-main' },
      targetIds: ['scene-main']
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.reference).toEqual(first.reference);
    expect(second.project.composition.acceptedArchiveReferences).toHaveLength(1);
  });

  it('collects archive staleness, provenance, source, and target diagnostics', () => {
    const accepted = acceptArchiveSegmentCandidate(makeArchiveProject(), fixtureArchive, 'segment-alpha-hallway', {
      sidecarContentId: 'archive-source-alpha:v1:stale',
      targetIds: ['missing-target']
    });
    const project = normalizeProject({
      ...accepted.project,
      composition: {
        ...accepted.project.composition,
        acceptedArchiveReferences: accepted.project.composition.acceptedArchiveReferences.map((reference) => ({
          ...reference,
          sourceAssetId: 'asset-missing',
          sidecarVersion: 2,
          generator: 'old-generator'
        }))
      }
    });
    const changedArchive = {
      ...fixtureArchive,
      provenance: {
        ...fixtureArchive.provenance,
        generator: 'new-generator',
        rightsStatus: undefined,
        license: undefined
      }
    };
    const unresolvedArchive = {
      ...fixtureArchive,
      id: 'archive-unresolved-source',
      sourceAssetId: 'asset-external'
    };
    const diagnostics = collectArchiveDiagnostics({
      project,
      archives: [changedArchive, unresolvedArchive],
      publishable: true
    });

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'changed-generator-identity',
        severity: 'warning',
        path: expect.stringContaining('.generator')
      }),
      expect.objectContaining({
        code: 'incompatible-schema-version',
        severity: 'export-blocker',
        path: expect.stringContaining('.sidecarVersion')
      }),
      expect.objectContaining({
        code: 'missing-accepted-target',
        severity: 'warning',
        path: expect.stringContaining('.targetIds')
      }),
      expect.objectContaining({
        code: 'missing-rights-license',
        severity: 'export-blocker',
        path: 'archives.archive-source-alpha.provenance'
      }),
      expect.objectContaining({
        code: 'missing-source-asset',
        severity: 'warning',
        path: expect.stringContaining('.sourceAssetId')
      }),
      expect.objectContaining({
        code: 'stale-sidecar',
        severity: 'warning',
        path: expect.stringContaining('.sidecarContentId')
      }),
      expect.objectContaining({
        code: 'unresolved-external-source-id',
        severity: 'warning',
        path: 'archives.archive-unresolved-source.sourceAssetId'
      })
    ]));

    expect(collectArchiveDiagnostics({
      project,
      archives: [],
      publishable: true
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'missing-sidecar',
        severity: 'warning'
      })
    ]));
  });

  it('resolves explicit sequence and variant overrides and rejects invalid ids', () => {
    const project = normalizeProject({
      ...createEmptyProject({
        id: 'project-overrides',
        name: 'Overrides'
      }),
      sequences: [
        {
          id: 'sequence-main',
          name: 'Main Sequence',
          variantIds: ['variant-main'],
          defaultVariantId: 'variant-main'
        },
        {
          id: 'sequence-alt',
          name: 'Alt Sequence',
          variantIds: ['variant-alt'],
          defaultVariantId: 'variant-alt'
        }
      ],
      variants: [
        {
          id: 'variant-main',
          sequenceId: 'sequence-main',
          name: 'Main Variant',
          clips: []
        },
        {
          id: 'variant-alt',
          sequenceId: 'sequence-alt',
          name: 'Alt Variant',
          clips: []
        }
      ]
    });

    const sequenceOverride = resolveCompositionIntent({ project, sequenceId: 'sequence-alt' });
    expect(sequenceOverride.ok).toBe(true);
    if (sequenceOverride.ok) {
      expect(sequenceOverride.intent.sequence.id).toBe('sequence-alt');
      expect(sequenceOverride.intent.variant.id).toBe('variant-alt');
    }

    const variantOverride = resolveCompositionIntent({ project, sequenceId: 'sequence-alt', variantId: 'variant-alt' });
    expect(variantOverride.ok).toBe(true);
    if (variantOverride.ok) {
      expect(variantOverride.intent.variant.id).toBe('variant-alt');
    }

    const invalid = resolveCompositionIntent({ project, sequenceId: 'sequence-missing', variantId: 'variant-missing' });
    expect(invalid.ok).toBe(false);
    expect(invalid.diagnostics).toEqual(expect.arrayContaining([
      {
        code: 'missing-reference',
        message: 'Composition intent references missing sequence "sequence-missing".',
        path: 'sequenceId'
      },
      {
        code: 'missing-reference',
        message: 'Composition intent references missing variant "variant-missing".',
        path: 'variantId'
      }
    ]));
  });

  it('authors active composition sequence, scene climate, and layer render fields', () => {
    const project = normalizeProject({
      ...fixtureProject,
      sequences: [
        ...fixtureProject.sequences,
        {
          id: 'sequence-alt',
          name: 'Alt Sequence',
          variantIds: ['variant-alt'],
          defaultVariantId: 'variant-alt'
        }
      ],
      variants: [
        ...fixtureProject.variants,
        {
          id: 'variant-alt',
          sequenceId: 'sequence-alt',
          name: 'Alt Variant',
          clips: []
        }
      ]
    });

    const activated = setActiveCompositionSequenceVariant(project, 'sequence-alt');
    expect(activated.composition.sequenceId).toBe('sequence-alt');
    expect(activated.composition.variantId).toBe('variant-alt');

    const invalidActivation = setActiveCompositionSequenceVariant(activated, 'sequence-alt', 'variant-main');
    expect(invalidActivation.composition.sequenceId).toBe('sequence-alt');
    expect(invalidActivation.composition.variantId).toBe('variant-alt');

    const sceneUpdated = updateCompositionScene(activated, 'scene-main', {
      name: 'Pressure Hallway',
      climate: {
        pressure: 0.82,
        atmosphere: 'thermal drift'
      }
    });
    expect(sceneUpdated.composition.scenes[0]).toMatchObject({
      id: 'scene-main',
      name: 'Pressure Hallway',
      climate: {
        pressure: 0.82,
        atmosphere: 'thermal drift'
      }
    });

    const layerUpdated = updateCompositionLayer(sceneUpdated, 'layer-clip-intro', {
      name: 'Intro source pass',
      orderIndex: 4,
      mix: 1.4,
      renderIntent: {
        passKind: 'overlay',
        requiredCapabilities: ['ffmpeg-overlay']
      }
    });
    expect(layerUpdated.composition.layers[0]).toMatchObject({
      id: 'layer-clip-intro',
      name: 'Intro source pass',
      orderIndex: 4,
      mix: 1,
      renderIntent: {
        passKind: 'overlay',
        requiredCapabilities: ['ffmpeg-overlay']
      }
    });
  });

  it('merges imported assets and toggles export profiles', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      }
    ]);

    expect(project.assets).toHaveLength(1);
    expect(toggleExportProfile(project, 'square-social').exportSelections.find((selection) => selection.profileId === 'square-social')?.enabled).toBe(true);
  });

  it('authors v3 modulation, entropy, and deterministic capture contracts', () => {
    const project = addAutomationLane(makeProject(), {
      id: 'lane-main-mix',
      name: 'Main Mix',
      target: {
        filterId: 'filter-main-contrast',
        property: 'mix'
      },
      keyframes: []
    });
    const withFilter = {
      ...project,
      filterStacks: project.filterStacks.map((stack) => stack.id === 'stack-sequence-main' ? {
        ...stack,
        filters: [
          {
            id: 'filter-main-contrast',
            type: 'contrast' as const,
            orderIndex: 0,
            parameters: {
              contrast: 1
            },
            automationLaneIds: ['lane-main-mix']
          }
        ]
      } : stack),
      composition: {
        ...project.composition,
        deterministicSeeds: [
          {
            id: 'seed-main',
            value: 42
          }
        ]
      }
    };
    const routed = addModulationRoute(withFilter, {
      id: 'route-main',
      source: {
        kind: 'automation-lane',
        id: 'lane-main-mix'
      },
      target: {
        kind: 'filter',
        id: 'filter-main-contrast',
        property: 'mix'
      },
      mapping: {
        kind: 'linear'
      },
      scope: {
        compositionId: 'composition-main',
        sequenceId: 'sequence-main',
        variantId: 'variant-main'
      },
      capturePolicy: 'replay-critical',
      seedId: 'seed-main'
    });
    const entropy = addEntropyState(routed, {
      id: 'entropy-main',
      source: {
        kind: 'modulation-route',
        id: 'route-main'
      },
      target: {
        kind: 'composition',
        id: 'composition-main',
        property: 'mix'
      },
      scope: {
        compositionId: 'composition-main'
      },
      value: 0.25,
      capturePolicy: 'record',
      seedId: 'seed-main'
    });
    const captured = createCaptureSession(entropy, {
      id: 'capture-main',
      status: 'open',
      startedAt: '2026-03-08T10:00:00.000Z',
      projectId: entropy.id,
      compositionId: 'composition-main',
      sequenceId: 'sequence-main',
      variantId: 'variant-main',
      timebase: {
        kind: 'composition-ms'
      },
      admittedInputIds: ['lane-main-mix'],
      seedIds: ['seed-main']
    });
    const withEvent = appendCaptureEvent(captured, 'log-capture-main', {
      id: 'event-main',
      captureId: 'capture-main',
      captureTimeMs: 100,
      compositionTimeMs: 100,
      source: {
        kind: 'automation-lane',
        id: 'lane-main-mix'
      },
      target: {
        kind: 'filter',
        id: 'filter-main-contrast',
        property: 'mix'
      },
      kind: 'modulation',
      replayCritical: true,
      routeId: 'route-main',
      seedId: 'seed-main',
      payload: {
        value: 0.75
      }
    });
    const completed = completeCaptureSession(
      updateEntropyState(updateModulationRoute(withEvent, 'route-main', { enabled: true }), 'entropy-main', { value: 0.5 }),
      'capture-main',
      '2026-03-08T10:01:00.000Z'
    );

    expect(completed.captureLogs[0].events[0].index).toBe(0);
    expect(completed.captureSessions[0].status).toBe('completed');
    expect(validateProject(completed).ok).toBe(true);
  });

  it('imports full-video source, transition, and overlay catalog assets as cuts', () => {
    const baseProject = makeProject();
    const roles = ['source', 'transition-mask', 'transition-overlay'] as const;
    const imported = roles.reduce((project, role) => importCatalogAssetIntoProject({
      project,
      asset: {
        id: `catalog-${role}`,
        filename: `${role}.mp4`,
        mediaType: 'video',
        durationMs: 2400
      },
      importedAsset: {
        id: `asset-${role}`,
        filename: `${role}.mp4`,
        mediaType: 'video',
        assetRole: role,
        path: { absolutePath: `/media/${role}.mp4` },
        hasAudio: role === 'source',
        durationMs: 2400
      },
      sceneSegments: []
    }).project, baseProject);

    expect(imported.cutCandidates.map((cut) => cut.assetId).sort()).toEqual([
      'asset-source',
      'asset-transition-mask',
      'asset-transition-overlay'
    ]);
    expect(validateProject(imported).ok).toBe(true);
  });

  it('does not duplicate catalog cuts on repeated import', () => {
    const input = {
      asset: {
        id: 'catalog-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video' as const,
        durationMs: 1000
      },
      importedAsset: {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video' as const,
        assetRole: 'source' as const,
        path: { absolutePath: '/media/alpha.mp4' },
        hasAudio: true,
        durationMs: 1000
      },
      sceneSegments: []
    };
    const first = importCatalogAssetIntoProject({ project: makeProject(), ...input });
    const second = importCatalogAssetIntoProject({ project: first.project, ...input });

    expect(first.addedCutIds).toEqual(['cut-asset-alpha-scene-1']);
    expect(second.addedCutIds).toEqual([]);
    expect(second.project.cutCandidates).toHaveLength(1);
  });

  it('materializes analysis cuts and validates the result', () => {
    const project = {
      ...mergeImportedAssets(makeProject(), [{
      id: 'asset-alpha',
      filename: 'alpha.mp4',
      mediaType: 'video',
      path: { absolutePath: '/media/alpha.mp4' },
      hasAudio: true,
      durationMs: 3000
      }]),
      analysisRefs: [{
        id: 'analysis-alpha',
        assetId: 'asset-alpha',
        path: '/media/alpha.analysis.json'
      }]
    };
    const result = materializeAnalysisCuts({
      project,
      analysis: {
        id: 'analysis-alpha',
        assetId: 'asset-alpha',
        probe: { durationMs: 3000, streams: [{ codecType: 'video' }] },
        sceneCuts: [{ timeMs: 1200, score: 0.8 }]
      },
      analysisRefId: 'analysis-alpha'
    });

    expect(result.addedCutIds).toEqual(['asset-alpha-cut-1', 'asset-alpha-cut-2']);
    expect(validateProject(result.project).ok).toBe(true);
  });

  it('adds cuts to sequence variants and duplicates variants deterministically', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      }
    ]);
    const nextProject = addCutToSequence({
      ...project,
      cutCandidates: [
        {
          id: 'cut-alpha',
          assetId: 'asset-alpha',
          startMs: 0,
          endMs: 1200,
          durationMs: 1200
        }
      ]
    }, 'cut-alpha');
    const moved = moveClip(nextProject, 'variant-main', 'clip-cut-alpha', 1);
    const duplicated = duplicateVariant(moved, 'variant-main');

    expect(nextProject.variants[0].clips[0].id).toBe('clip-cut-alpha');
    expect(duplicated.variants.map((variant) => variant.id)).toContain('variant-main-copy');
    expect(duplicated.variants.find((variant) => variant.id === 'variant-main-copy')?.name).toBe('Sequence 002');
  });

  it('keeps clip ids unique when the same cut is added repeatedly', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      }
    ]);
    const source = {
      ...project,
      cutCandidates: [
        {
          id: 'cut-alpha',
          assetId: 'asset-alpha',
          startMs: 0,
          endMs: 1200,
          durationMs: 1200
        }
      ]
    };
    const firstAdd = addCutToSequence(source, 'cut-alpha');
    const secondAdd = addCutToSequence(firstAdd, 'cut-alpha');

    expect(secondAdd.variants[0].clips.map((clip) => clip.id)).toEqual(['clip-cut-alpha', 'clip-cut-alpha-2']);
    expect(validateProject(secondAdd).ok).toBe(true);
  });

  it('repairs duplicate clip ids when a cut review changes', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      }
    ]);
    const sequenced = addCutToSequence({
      ...project,
      cutCandidates: [
        {
          id: 'cut-alpha',
          assetId: 'asset-alpha',
          startMs: 0,
          endMs: 1200,
          durationMs: 1200,
          status: 'kept',
          favorite: false
        }
      ]
    }, 'cut-alpha');
    const duplicateClip = {
      ...sequenced.variants[0].clips[0],
      timelineStartMs: 1200
    };
    const invalidProject = normalizeProject({
      ...sequenced,
      variants: sequenced.variants.map((variant) => variant.id === 'variant-main' ? {
        ...variant,
        clips: [...variant.clips, duplicateClip]
      } : variant)
    });
    const repaired = updateCutStatus(invalidProject, 'cut-alpha', 'rejected');

    expect(validateProject(invalidProject).ok).toBe(false);
    expect(repaired.cutCandidates.find((cut) => cut.id === 'cut-alpha')?.status).toBe('rejected');
    expect(repaired.variants[0].clips.map((clip) => clip.id)).toEqual(['clip-cut-alpha', 'clip-cut-alpha-2']);
    expect(validateProject(repaired).ok).toBe(true);
  });

  it('authors mask transitions with mask and overlay assets', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      },
      {
        id: 'asset-mask',
        filename: 'foam-mask.mp4',
        mediaType: 'video',
        assetRole: 'transition-mask',
        path: {
          absolutePath: '/media/foam-mask.mp4'
        },
        hasAudio: false
      },
      {
        id: 'asset-overlay',
        filename: 'foam-overlay.mp4',
        mediaType: 'video',
        assetRole: 'transition-overlay',
        path: {
          absolutePath: '/media/foam-overlay.mp4'
        },
        hasAudio: false
      }
    ]);
    const sequenced = addCutToSequence({
      ...project,
      cutCandidates: [
        {
          id: 'cut-alpha',
          assetId: 'asset-alpha',
          startMs: 0,
          endMs: 1200,
          durationMs: 1200
        },
        {
          id: 'cut-beta',
          assetId: 'asset-alpha',
          startMs: 1200,
          endMs: 2400,
          durationMs: 1200
        }
      ]
    }, 'cut-alpha');
    const withSecondClip = addCutToSequence(sequenced, 'cut-beta');
    const masked = setClipTransition(withSecondClip, 'variant-main', 'clip-cut-alpha', 'mask');
    const withMask = setClipTransitionAsset(masked, 'variant-main', 'clip-cut-alpha', 'asset-mask');
    const withOverlay = setClipTransitionOverlayAsset(withMask, 'variant-main', 'clip-cut-alpha', 'asset-overlay');

    expect(withOverlay.variants[0].clips[0].transition).toBe('mask');
    expect(withOverlay.variants[0].clips[0].transitionAssetId).toBe('asset-mask');
    expect(withOverlay.variants[0].clips[0].transitionOverlayAssetId).toBe('asset-overlay');
  });

  it('authors standalone clip overlays', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      },
      {
        id: 'asset-overlay',
        filename: 'foam-overlay.mp4',
        mediaType: 'video',
        assetRole: 'transition-overlay',
        path: {
          absolutePath: '/media/foam-overlay.mp4'
        },
        hasAudio: false
      }
    ]);
    const sequenced = addCutToSequence({
      ...project,
      cutCandidates: [
        {
          id: 'cut-alpha',
          assetId: 'asset-alpha',
          startMs: 0,
          endMs: 1200,
          durationMs: 1200
        }
      ]
    }, 'cut-alpha');
    const withOverlay = setClipOverlayAsset(sequenced, 'variant-main', 'clip-cut-alpha', 'asset-overlay');

    expect(withOverlay.variants[0].clips[0].overlayAssetId).toBe('asset-overlay');
  });

  it('authors overlay and transition selections from cut candidates', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      },
      {
        id: 'asset-mask',
        filename: 'mask.mp4',
        mediaType: 'video',
        assetRole: 'transition-mask',
        path: {
          absolutePath: '/media/mask.mp4'
        },
        hasAudio: false
      },
      {
        id: 'asset-overlay',
        filename: 'overlay.mp4',
        mediaType: 'video',
        assetRole: 'transition-overlay',
        path: {
          absolutePath: '/media/overlay.mp4'
        },
        hasAudio: false
      }
    ]);
    const sequenced = addCutToSequence({
      ...project,
      cutCandidates: [
        { id: 'cut-alpha', assetId: 'asset-alpha', startMs: 0, endMs: 1200, durationMs: 1200 },
        { id: 'cut-beta', assetId: 'asset-alpha', startMs: 1200, endMs: 2400, durationMs: 1200 },
        { id: 'cut-mask', assetId: 'asset-mask', startMs: 250, endMs: 750, durationMs: 500 },
        { id: 'cut-overlay', assetId: 'asset-overlay', startMs: 100, endMs: 600, durationMs: 500 }
      ]
    }, 'cut-alpha');
    const withSecondClip = addCutToSequence(sequenced, 'cut-beta');
    const masked = setClipTransition(withSecondClip, 'variant-main', 'clip-cut-alpha', 'mask');
    const withTransitionCut = setClipTransitionCut(masked, 'variant-main', 'clip-cut-alpha', 'cut-mask');
    const withTransitionOverlayCut = setClipTransitionOverlayCut(withTransitionCut, 'variant-main', 'clip-cut-alpha', 'cut-overlay');
    const withOverlayCut = setClipOverlayCut(withTransitionOverlayCut, 'variant-main', 'clip-cut-alpha', 'cut-overlay');
    const clip = withOverlayCut.variants[0].clips[0];

    expect(clip.transitionAssetId).toBe('asset-mask');
    expect(clip.transitionCutId).toBe('cut-mask');
    expect(clip.transitionOverlayAssetId).toBe('asset-overlay');
    expect(clip.transitionOverlayCutId).toBe('cut-overlay');
    expect(clip.overlayAssetId).toBe('asset-overlay');
    expect(clip.overlayCutId).toBe('cut-overlay');
  });

  it('removes clips and clears an invalid terminal mask transition', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      },
      {
        id: 'asset-mask',
        filename: 'foam-mask.mp4',
        mediaType: 'video',
        assetRole: 'transition-mask',
        path: {
          absolutePath: '/media/foam-mask.mp4'
        },
        hasAudio: false
      }
    ]);
    const sequenced = addCutToSequence({
      ...project,
      cutCandidates: [
        {
          id: 'cut-alpha',
          assetId: 'asset-alpha',
          startMs: 0,
          endMs: 1200,
          durationMs: 1200
        },
        {
          id: 'cut-beta',
          assetId: 'asset-alpha',
          startMs: 1200,
          endMs: 2400,
          durationMs: 1200
        }
      ]
    }, 'cut-alpha');
    const withSecondClip = addCutToSequence(sequenced, 'cut-beta');
    const masked = setClipTransitionAsset(
      setClipTransition(withSecondClip, 'variant-main', 'clip-cut-alpha', 'mask'),
      'variant-main',
      'clip-cut-alpha',
      'asset-mask'
    );

    const removed = removeClip(masked, 'variant-main', 'clip-cut-beta');

    expect(removed.variants[0].clips).toHaveLength(1);
    expect(removed.variants[0].clips[0].transition).toBe('cut');
    expect(removed.variants[0].clips[0].transitionAssetId).toBeUndefined();
  });

  it('randomizes foundry transitions across a sequence', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      },
      {
        id: 'asset-mask-a',
        filename: 'dropout-foam-white-burn-slow__dropout-foam-0001__seed-1-mask.mp4',
        mediaType: 'video',
        assetRole: 'transition-mask',
        path: {
          absolutePath: '/library/masks/dropout-foam-white-burn-slow__dropout-foam-0001__seed-1-mask.mp4'
        },
        durationMs: 750,
        hasAudio: false
      },
      {
        id: 'asset-overlay-a',
        filename: 'dropout-foam-white-burn-slow__dropout-foam-0001__seed-1-mask.mp4',
        mediaType: 'video',
        assetRole: 'transition-overlay',
        path: {
          absolutePath: '/library/overlays/dropout-foam-white-burn-slow__dropout-foam-0001__seed-1-mask.mp4'
        },
        durationMs: 750,
        hasAudio: false
      }
    ]);
    const sequenced = addCutToSequence({
      ...project,
      cutCandidates: [
        {
          id: 'cut-alpha',
          assetId: 'asset-alpha',
          startMs: 0,
          endMs: 1200,
          durationMs: 1200
        },
        {
          id: 'cut-beta',
          assetId: 'asset-alpha',
          startMs: 1200,
          endMs: 2400,
          durationMs: 1200
        }
      ]
    }, 'cut-alpha');
    const withSecondClip = addCutToSequence(sequenced, 'cut-beta');
    const randomized = randomizeFoundryTransitions(withSecondClip, 'variant-main', () => 0);

    expect(randomized.variants[0].clips[0].transition).toBe('mask');
    expect(randomized.variants[0].clips[0].transitionAssetId).toBe('asset-mask-a');
    expect(randomized.variants[0].clips[0].transitionOverlayAssetId).toBeUndefined();
    expect(randomized.variants[0].clips[1].transition).toBe('cut');
  });

  it('randomizes foundry overlays across a sequence', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      },
      {
        id: 'asset-overlay-a',
        filename: 'dropout-foam-overlay.mp4',
        mediaType: 'video',
        assetRole: 'transition-overlay',
        path: {
          absolutePath: '/library/overlays/dropout-foam-overlay.mp4'
        },
        durationMs: 750,
        hasAudio: false
      }
    ]);
    const sequenced = addCutToSequence({
      ...project,
      cutCandidates: [
        {
          id: 'cut-alpha',
          assetId: 'asset-alpha',
          startMs: 0,
          endMs: 1200,
          durationMs: 1200
        },
        {
          id: 'cut-beta',
          assetId: 'asset-alpha',
          startMs: 1200,
          endMs: 2400,
          durationMs: 1200
        }
      ]
    }, 'cut-alpha');
    const withSecondClip = addCutToSequence(sequenced, 'cut-beta');
    const randomized = randomizeFoundryOverlays(withSecondClip, 'variant-main', () => 0);

    expect(randomized.variants[0].clips[0].overlayAssetId).toBe('asset-overlay-a');
    expect(randomized.variants[0].clips[1].overlayAssetId).toBe('asset-overlay-a');
  });

  it('caps foundry masks and overlays on long sequences to keep previews buildable', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `asset-mask-${index}`,
        filename: `mask-${index}.mp4`,
        mediaType: 'video' as const,
        assetRole: 'transition-mask' as const,
        path: {
          absolutePath: `/library/masks/mask-${index}.mp4`
        },
        durationMs: 750,
        hasAudio: false
      })),
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `asset-overlay-${index}`,
        filename: `overlay-${index}.mp4`,
        mediaType: 'video' as const,
        assetRole: 'transition-overlay' as const,
        path: {
          absolutePath: `/library/overlays/overlay-${index}.mp4`
        },
        durationMs: 750,
        hasAudio: false
      }))
    ]);

    const longVariantProject = {
      ...project,
      variants: project.variants.map((variant) => variant.id === 'variant-main' ? {
        ...variant,
        clips: Array.from({ length: 30 }, (_, index) => ({
          id: `clip-${index}`,
          assetId: 'asset-alpha',
          cutId: `cut-${index}`,
          timelineStartMs: index * 1000,
          sourceStartMs: index * 1000,
          durationMs: 1000,
          transition: 'cut' as const
        }))
      } : variant)
    };

    const masked = randomizeFoundryTransitions(longVariantProject, 'variant-main', () => 0);
    const overlayed = randomizeFoundryOverlays(masked, 'variant-main', () => 0);
    const variant = overlayed.variants[0];

    expect(variant.clips.filter((clip) => clip.transition === 'mask')).toHaveLength(10);
    expect(variant.clips.filter((clip) => clip.overlayAssetId)).toHaveLength(12);
  });

  it('extends mask-randomized sequences so rendered coverage still reaches the music duration', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      },
      {
        id: 'asset-mask-a',
        filename: 'mask-a.mp4',
        mediaType: 'video',
        assetRole: 'transition-mask',
        path: {
          absolutePath: '/library/masks/mask-a.mp4'
        },
        durationMs: 800,
        hasAudio: false
      },
      {
        id: 'asset-music',
        filename: 'music.wav',
        mediaType: 'audio',
        path: {
          absolutePath: '/media/music.wav'
        },
        durationMs: 10000,
        hasAudio: true
      }
    ]);

    const source = {
      ...project,
      variants: project.variants.map((variant) => variant.id === 'variant-main' ? {
        ...variant,
        musicAlignment: {
          ...variant.musicAlignment,
          primaryAssetId: 'asset-music'
        }
      } : variant),
      cutCandidates: [
        { id: 'fav-a', assetId: 'asset-alpha', startMs: 0, endMs: 2000, durationMs: 2000, status: 'favorite', favorite: true, sceneScore: 0.9 },
        { id: 'fav-b', assetId: 'asset-alpha', startMs: 2000, endMs: 4000, durationMs: 2000, status: 'favorite', favorite: true, sceneScore: 0.8 },
        { id: 'keep-a', assetId: 'asset-alpha', startMs: 4000, endMs: 6000, durationMs: 2000, status: 'kept', favorite: false, sceneScore: 0.7 },
        { id: 'keep-b', assetId: 'asset-alpha', startMs: 6000, endMs: 8000, durationMs: 2000, status: 'kept', favorite: false, sceneScore: 0.6 },
        { id: 'keep-c', assetId: 'asset-alpha', startMs: 8000, endMs: 10000, durationMs: 2000, status: 'kept', favorite: false, sceneScore: 0.5 }
      ]
    };

    const built = buildVariantFromReviewedCuts(source, 'variant-main', 'balanced');
    const randomized = randomizeFoundryTransitions(built, 'variant-main', () => 0);
    const totalDurationMs = randomized.variants[0].clips.reduce((total, clip) => total + clip.durationMs, 0);

    expect(randomized.variants[0].clips.length).toBeGreaterThan(built.variants[0].clips.length);
    expect(totalDurationMs).toBeGreaterThanOrEqual(10000);
  });

  it('builds the current variant from reviewed cuts only', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      }
    ]);

    const built = buildVariantFromReviewedCuts({
      ...project,
      cutCandidates: [
        {
          id: 'cut-new',
          assetId: 'asset-alpha',
          startMs: 0,
          endMs: 1000,
          durationMs: 1000,
          status: 'new',
          favorite: false
        },
        {
          id: 'cut-kept',
          assetId: 'asset-alpha',
          startMs: 1000,
          endMs: 2200,
          durationMs: 1200,
          status: 'kept',
          favorite: false,
          sceneScore: 0.4
        },
        {
          id: 'cut-favorite',
          assetId: 'asset-alpha',
          startMs: 2200,
          endMs: 3600,
          durationMs: 1400,
          status: 'favorite',
          favorite: true,
          sceneScore: 0.2
        },
        {
          id: 'cut-rejected',
          assetId: 'asset-alpha',
          startMs: 3600,
          endMs: 5000,
          durationMs: 1400,
          status: 'rejected',
          favorite: false
        }
      ]
    }, 'variant-main');

    expect(built.variants[0].clips.map((clip) => clip.cutId)).toEqual(['cut-favorite', 'cut-kept']);
    expect(built.variants[0].clips[1].timelineStartMs).toBe(1400);
  });

  it('uses favorites as distributed anchors instead of bunching them together', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      }
    ]);

    const built = buildVariantFromReviewedCuts({
      ...project,
      variants: project.variants.map((variant) => variant.id === 'variant-main' ? {
        ...variant,
        clips: [
          {
            id: 'existing-1',
            assetId: 'asset-alpha',
            cutId: 'existing-1',
            timelineStartMs: 0,
            sourceStartMs: 0,
            durationMs: 1000,
            transition: 'cut'
          },
          {
            id: 'existing-2',
            assetId: 'asset-alpha',
            cutId: 'existing-2',
            timelineStartMs: 1000,
            sourceStartMs: 1000,
            durationMs: 1000,
            transition: 'cut'
          },
          {
            id: 'existing-3',
            assetId: 'asset-alpha',
            cutId: 'existing-3',
            timelineStartMs: 2000,
            sourceStartMs: 2000,
            durationMs: 1000,
            transition: 'cut'
          },
          {
            id: 'existing-4',
            assetId: 'asset-alpha',
            cutId: 'existing-4',
            timelineStartMs: 3000,
            sourceStartMs: 3000,
            durationMs: 1000,
            transition: 'cut'
          }
        ]
      } : variant),
      cutCandidates: [
        {
          id: 'cut-favorite-a',
          assetId: 'asset-alpha',
          startMs: 0,
          endMs: 1000,
          durationMs: 1000,
          status: 'favorite',
          favorite: true,
          sceneScore: 0.9
        },
        {
          id: 'cut-favorite-b',
          assetId: 'asset-alpha',
          startMs: 1000,
          endMs: 2000,
          durationMs: 1000,
          status: 'favorite',
          favorite: true,
          sceneScore: 0.8
        },
        {
          id: 'cut-kept-a',
          assetId: 'asset-alpha',
          startMs: 2000,
          endMs: 3000,
          durationMs: 1000,
          status: 'kept',
          favorite: false,
          sceneScore: 0.7
        },
        {
          id: 'cut-kept-b',
          assetId: 'asset-alpha',
          startMs: 3000,
          endMs: 4000,
          durationMs: 1000,
          status: 'kept',
          favorite: false,
          sceneScore: 0.6
        },
        {
          id: 'cut-kept-c',
          assetId: 'asset-alpha',
          startMs: 4000,
          endMs: 5000,
          durationMs: 1000,
          status: 'kept',
          favorite: false,
          sceneScore: 0.5
        }
      ]
    }, 'variant-main');

    const selectedCutIds = built.variants[0].clips.map((clip) => clip.cutId);
    const favoritePositions = selectedCutIds
      .map((cutId, index) => cutId?.startsWith('cut-favorite') ? index : -1)
      .filter((index) => index >= 0);

    expect(favoritePositions).toEqual([0, selectedCutIds.length - 1]);
    expect(selectedCutIds.slice(1, -1).every((cutId) => cutId?.startsWith('cut-kept'))).toBe(true);
  });

  it('reuses favorites throughout the build when they are scarce', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      },
      {
        id: 'asset-music',
        filename: 'music.wav',
        mediaType: 'audio',
        path: {
          absolutePath: '/media/music.wav'
        },
        durationMs: 9600,
        hasAudio: true
      }
    ]);

    const built = buildVariantFromReviewedCuts({
      ...project,
      variants: project.variants.map((variant) => variant.id === 'variant-main' ? {
        ...variant,
        musicAlignment: {
          ...variant.musicAlignment,
          primaryAssetId: 'asset-music'
        }
      } : variant),
      cutCandidates: [
        { id: 'fav-a', assetId: 'asset-alpha', startMs: 0, endMs: 1600, durationMs: 1600, status: 'favorite', favorite: true, sceneScore: 0.95 },
        { id: 'fav-b', assetId: 'asset-alpha', startMs: 1600, endMs: 3200, durationMs: 1600, status: 'favorite', favorite: true, sceneScore: 0.9 },
        { id: 'keep-a', assetId: 'asset-alpha', startMs: 3200, endMs: 4800, durationMs: 1600, status: 'kept', favorite: false, sceneScore: 0.8 },
        { id: 'keep-b', assetId: 'asset-alpha', startMs: 4800, endMs: 6400, durationMs: 1600, status: 'kept', favorite: false, sceneScore: 0.7 },
        { id: 'keep-c', assetId: 'asset-alpha', startMs: 6400, endMs: 8000, durationMs: 1600, status: 'kept', favorite: false, sceneScore: 0.6 }
      ]
    }, 'variant-main', 'balanced');

    const cutIds = built.variants[0].clips.map((clip) => clip.cutId);
    const favoritePositions = cutIds
      .map((cutId, index) => cutId?.startsWith('fav-') ? index : -1)
      .filter((index) => index >= 0);

    expect(cutIds).toHaveLength(6);
    expect(favoritePositions).toEqual([0, 3, 5]);
    expect(cutIds.filter((cutId) => cutId === 'fav-a' || cutId === 'fav-b')).toHaveLength(3);
  });

  it('supports tight and longer build modes with different pacing', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      }
    ]);

    const source = {
      ...project,
      variants: project.variants.map((variant) => variant.id === 'variant-main' ? {
        ...variant,
        clips: [
          {
            id: 'existing-1',
            assetId: 'asset-alpha',
            cutId: 'existing-1',
            timelineStartMs: 0,
            sourceStartMs: 0,
            durationMs: 1000,
            transition: 'cut'
          },
          {
            id: 'existing-2',
            assetId: 'asset-alpha',
            cutId: 'existing-2',
            timelineStartMs: 1000,
            sourceStartMs: 1000,
            durationMs: 1000,
            transition: 'cut'
          },
          {
            id: 'existing-3',
            assetId: 'asset-alpha',
            cutId: 'existing-3',
            timelineStartMs: 2000,
            sourceStartMs: 2000,
            durationMs: 1000,
            transition: 'cut'
          },
          {
            id: 'existing-4',
            assetId: 'asset-alpha',
            cutId: 'existing-4',
            timelineStartMs: 3000,
            sourceStartMs: 3000,
            durationMs: 1000,
            transition: 'cut'
          }
        ]
      } : variant),
      cutCandidates: [
        { id: 'fav-short', assetId: 'asset-alpha', startMs: 0, endMs: 700, durationMs: 700, status: 'favorite', favorite: true, sceneScore: 0.9 },
        { id: 'fav-long', assetId: 'asset-alpha', startMs: 700, endMs: 2500, durationMs: 1800, status: 'favorite', favorite: true, sceneScore: 0.85 },
        { id: 'kept-a', assetId: 'asset-alpha', startMs: 2500, endMs: 3100, durationMs: 600, status: 'kept', favorite: false, sceneScore: 0.8 },
        { id: 'kept-b', assetId: 'asset-alpha', startMs: 3100, endMs: 3900, durationMs: 800, status: 'kept', favorite: false, sceneScore: 0.7 },
        { id: 'kept-c', assetId: 'asset-alpha', startMs: 3900, endMs: 5300, durationMs: 1400, status: 'kept', favorite: false, sceneScore: 0.6 },
        { id: 'kept-d', assetId: 'asset-alpha', startMs: 5300, endMs: 7300, durationMs: 2000, status: 'kept', favorite: false, sceneScore: 0.5 }
      ]
    };

    const tight = buildVariantFromReviewedCuts(source, 'variant-main', 'tight');
    const longer = buildVariantFromReviewedCuts(source, 'variant-main', 'longer');
    const averageDuration = (clips: typeof tight.variants[0].clips) => clips.reduce((total, clip) => total + clip.durationMs, 0) / clips.length;

    expect(tight.variants[0].clips.length).toBeGreaterThan(longer.variants[0].clips.length);
    expect(averageDuration(tight.variants[0].clips)).toBeLessThan(averageDuration(longer.variants[0].clips));
  });

  it('splits long reviewed cuts into shorter reusable sub-cuts in tight mode', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      },
      {
        id: 'asset-music',
        filename: 'music.wav',
        mediaType: 'audio',
        path: {
          absolutePath: '/media/music.wav'
        },
        durationMs: 3600,
        hasAudio: true
      }
    ]);

    const built = buildVariantFromReviewedCuts({
      ...project,
      variants: project.variants.map((variant) => variant.id === 'variant-main' ? {
        ...variant,
        musicAlignment: {
          ...variant.musicAlignment,
          primaryAssetId: 'asset-music'
        }
      } : variant),
      cutCandidates: [
        { id: 'cut-long', assetId: 'asset-alpha', startMs: 0, endMs: 3600, durationMs: 3600, status: 'favorite', favorite: true, sceneScore: 0.9 }
      ]
    }, 'variant-main', 'tight');

    expect(built.variants[0].clips.map((clip) => clip.cutId)).toEqual(['cut-long', 'cut-long', 'cut-long']);
    expect([...built.variants[0].clips.map((clip) => clip.sourceStartMs)].sort((left, right) => left - right)).toEqual([0, 1200, 2400]);
    expect(built.variants[0].clips.every((clip) => clip.durationMs <= 1600)).toBe(true);
  });

  it('ignores pathological micro-cuts when auto-building sequences', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      }
    ]);

    const built = buildVariantFromReviewedCuts({
      ...project,
      cutCandidates: [
        { id: 'micro-1', assetId: 'asset-alpha', startMs: 0, endMs: 42, durationMs: 42, status: 'favorite', favorite: true, sceneScore: 0.9 },
        { id: 'micro-2', assetId: 'asset-alpha', startMs: 42, endMs: 108, durationMs: 66, status: 'kept', favorite: false, sceneScore: 0.8 },
        { id: 'usable-1', assetId: 'asset-alpha', startMs: 108, endMs: 1008, durationMs: 900, status: 'favorite', favorite: true, sceneScore: 0.7 },
        { id: 'usable-2', assetId: 'asset-alpha', startMs: 1008, endMs: 2208, durationMs: 1200, status: 'kept', favorite: false, sceneScore: 0.6 }
      ]
    }, 'variant-main', 'tight');

    expect(built.variants[0].clips.map((clip) => clip.cutId)).toEqual(['usable-1', 'usable-2']);
  });

  it('prefers music length over stale sequence duration when auto-building', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      },
      {
        id: 'asset-music',
        filename: 'music.wav',
        mediaType: 'audio',
        path: {
          absolutePath: '/media/music.wav'
        },
        durationMs: 10000,
        hasAudio: true
      }
    ]);

    const built = buildVariantFromReviewedCuts({
      ...project,
      variants: project.variants.map((variant) => variant.id === 'variant-main' ? {
        ...variant,
        assistedGeneration: {
          ...variant.assistedGeneration,
          durationTargetMs: 1000
        },
        musicAlignment: {
          ...variant.musicAlignment,
          primaryAssetId: 'asset-music'
        }
      } : variant),
      cutCandidates: [
        { id: 'cut-1', assetId: 'asset-alpha', startMs: 0, endMs: 1600, durationMs: 1600, status: 'favorite', favorite: true, sceneScore: 0.9 },
        { id: 'cut-2', assetId: 'asset-alpha', startMs: 1600, endMs: 3200, durationMs: 1600, status: 'kept', favorite: false, sceneScore: 0.8 },
        { id: 'cut-3', assetId: 'asset-alpha', startMs: 3200, endMs: 4800, durationMs: 1600, status: 'kept', favorite: false, sceneScore: 0.7 },
        { id: 'cut-4', assetId: 'asset-alpha', startMs: 4800, endMs: 6400, durationMs: 1600, status: 'favorite', favorite: true, sceneScore: 0.6 },
        { id: 'cut-5', assetId: 'asset-alpha', startMs: 6400, endMs: 8000, durationMs: 1600, status: 'kept', favorite: false, sceneScore: 0.5 },
        { id: 'cut-6', assetId: 'asset-alpha', startMs: 8000, endMs: 9600, durationMs: 1600, status: 'kept', favorite: false, sceneScore: 0.4 },
        { id: 'cut-7', assetId: 'asset-alpha', startMs: 9600, endMs: 11200, durationMs: 1600, status: 'kept', favorite: false, sceneScore: 0.3 }
      ]
    }, 'variant-main', 'balanced');

    const totalDurationMs = built.variants[0].clips.reduce((total, clip) => total + clip.durationMs, 0);

    expect(totalDurationMs).toBe(10000);
    expect(built.variants[0].assistedGeneration?.durationTargetMs).toBe(10000);
  });

  it('prunes clips scheduled beyond the music duration and trims the final overlap', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      },
      {
        id: 'asset-music',
        filename: 'music.wav',
        mediaType: 'audio',
        path: {
          absolutePath: '/media/music.wav'
        },
        durationMs: 4500,
        hasAudio: true
      }
    ]);

    const built = buildVariantFromReviewedCuts({
      ...project,
      variants: project.variants.map((variant) => variant.id === 'variant-main' ? {
        ...variant,
        musicAlignment: {
          ...variant.musicAlignment,
          primaryAssetId: 'asset-music'
        }
      } : variant),
      cutCandidates: [
        { id: 'cut-1', assetId: 'asset-alpha', startMs: 0, endMs: 2000, durationMs: 2000, status: 'favorite', favorite: true, sceneScore: 0.9 },
        { id: 'cut-2', assetId: 'asset-alpha', startMs: 2000, endMs: 4000, durationMs: 2000, status: 'kept', favorite: false, sceneScore: 0.8 },
        { id: 'cut-3', assetId: 'asset-alpha', startMs: 4000, endMs: 6000, durationMs: 2000, status: 'kept', favorite: false, sceneScore: 0.7 },
        { id: 'cut-4', assetId: 'asset-alpha', startMs: 6000, endMs: 8000, durationMs: 2000, status: 'favorite', favorite: true, sceneScore: 0.6 }
      ]
    }, 'variant-main', 'balanced');

    const clips = built.variants[0].clips;
    const totalDurationMs = clips.reduce((total, clip) => total + clip.durationMs, 0);
    const lastClip = clips.at(-1);

    expect(totalDurationMs).toBe(4500);
    expect(clips.every((clip) => clip.timelineStartMs < 4500)).toBe(true);
    expect(lastClip?.timelineStartMs + lastClip!.durationMs).toBe(4500);
    expect(lastClip?.durationMs).toBeLessThan(2000);
  });

  it('reuses favorite cuts when music outlasts the reviewed footage', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      },
      {
        id: 'asset-music',
        filename: 'music.wav',
        mediaType: 'audio',
        path: {
          absolutePath: '/media/music.wav'
        },
        durationMs: 6200,
        hasAudio: true
      }
    ]);

    const built = buildVariantFromReviewedCuts({
      ...project,
      variants: project.variants.map((variant) => variant.id === 'variant-main' ? {
        ...variant,
        musicAlignment: {
          ...variant.musicAlignment,
          primaryAssetId: 'asset-music'
        }
      } : variant),
      cutCandidates: [
        { id: 'fav-1', assetId: 'asset-alpha', startMs: 0, endMs: 1200, durationMs: 1200, status: 'favorite', favorite: true, sceneScore: 0.95 },
        { id: 'fav-2', assetId: 'asset-alpha', startMs: 1200, endMs: 2600, durationMs: 1400, status: 'favorite', favorite: true, sceneScore: 0.85 },
        { id: 'keep-1', assetId: 'asset-alpha', startMs: 2600, endMs: 4200, durationMs: 1600, status: 'kept', favorite: false, sceneScore: 0.75 }
      ]
    }, 'variant-main', 'balanced');

    const clips = built.variants[0].clips;
    const totalDurationMs = clips.reduce((total, clip) => total + clip.durationMs, 0);
    const cutIds = clips.map((clip) => clip.cutId);
    const uniqueClipIds = new Set(clips.map((clip) => clip.id));

    expect(totalDurationMs).toBe(6200);
    expect(cutIds.filter((cutId) => cutId === 'keep-1')).toHaveLength(1);
    expect(cutIds.filter((cutId) => cutId === 'fav-1').length + cutIds.filter((cutId) => cutId === 'fav-2').length).toBeGreaterThan(2);
    expect(uniqueClipIds.size).toBe(clips.length);
  });

  it('rebuilds the current sequence into a new cut arrangement when enough reviewed material exists', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      }
    ]);

    const source = {
      ...project,
      cutCandidates: [
        { id: 'fav-1', assetId: 'asset-alpha', startMs: 0, endMs: 1500, durationMs: 1500, status: 'favorite', favorite: true, sceneScore: 0.95 },
        { id: 'fav-2', assetId: 'asset-alpha', startMs: 1500, endMs: 3000, durationMs: 1500, status: 'favorite', favorite: true, sceneScore: 0.9 },
        { id: 'fav-3', assetId: 'asset-alpha', startMs: 3000, endMs: 4500, durationMs: 1500, status: 'favorite', favorite: true, sceneScore: 0.85 },
        { id: 'keep-1', assetId: 'asset-alpha', startMs: 4500, endMs: 6000, durationMs: 1500, status: 'kept', favorite: false, sceneScore: 0.8 },
        { id: 'keep-2', assetId: 'asset-alpha', startMs: 6000, endMs: 7500, durationMs: 1500, status: 'kept', favorite: false, sceneScore: 0.75 },
        { id: 'keep-3', assetId: 'asset-alpha', startMs: 7500, endMs: 9000, durationMs: 1500, status: 'kept', favorite: false, sceneScore: 0.7 },
        { id: 'keep-4', assetId: 'asset-alpha', startMs: 9000, endMs: 10500, durationMs: 1500, status: 'kept', favorite: false, sceneScore: 0.65 },
        { id: 'keep-5', assetId: 'asset-alpha', startMs: 10500, endMs: 12000, durationMs: 1500, status: 'kept', favorite: false, sceneScore: 0.6 }
      ]
    };

    const firstBuild = buildVariantFromReviewedCuts(source, 'variant-main', 'balanced');
    const secondBuild = buildVariantFromReviewedCuts(firstBuild, 'variant-main', 'balanced');

    expect(secondBuild.variants[0].clips.map((clip) => clip.cutId)).not.toEqual(firstBuild.variants[0].clips.map((clip) => clip.cutId));
  });

  it('builds a new sibling variant from reviewed cuts', () => {
    const project = mergeImportedAssets(makeProject(), [
      {
        id: 'asset-alpha',
        filename: 'alpha.mp4',
        mediaType: 'video',
        path: {
          absolutePath: '/media/alpha.mp4'
        },
        hasAudio: true
      }
    ]);

    const built = buildNewVariantFromReviewedCuts({
      ...project,
      cutCandidates: [
        {
          id: 'cut-kept',
          assetId: 'asset-alpha',
          startMs: 1000,
          endMs: 2200,
          durationMs: 1200,
          status: 'kept',
          favorite: false
        }
      ]
    }, 'variant-main');

    expect(built.variants).toHaveLength(2);
    expect(built.variants[1].clips.map((clip) => clip.cutId)).toEqual(['cut-kept']);
    expect(built.sequences[0].variantIds).toContain(built.variants[1].id);
    expect(built.variants[1].name).toBe('Sequence 002');
  });

  it('deletes a sequence variant and keeps the sequence default valid', () => {
    const project = duplicateVariant(makeProject(), 'variant-main');
    const deleted = deleteVariant(project, 'variant-main');

    expect(deleted.variants.map((variant) => variant.id)).toEqual(['variant-main-copy']);
    expect(deleted.sequences[0].variantIds).toEqual(['variant-main-copy']);
    expect(deleted.sequences[0].defaultVariantId).toBe('variant-main-copy');
  });

  it('adds style and automation state without mutating the original project shape', () => {
    const project = addFilterToStack(makeProject(), 'stack-sequence-main', {
      id: 'filter-bloom',
      type: 'bloom-soft',
      enabled: true,
      parameters: {
        strength: 0.2
      },
      mix: 0.7
    });
    const updated = updateFilterParameter(project, 'stack-sequence-main', 'filter-bloom', 'strength', 0.4);
    const randomized = safeRandomizeFilter(updated, 'stack-sequence-main', 'filter-bloom');
    const withLane = addAutomationLane(randomized, {
      id: 'lane-bloom',
      name: 'Bloom Mix',
      target: {
        filterId: 'filter-bloom',
        property: 'mix'
      },
      keyframes: [
        {
          id: 'keyframe-1',
          timeMs: 0,
          value: 0.5
        }
      ]
    });
    const retargetedLane = updateAutomationLaneTarget(withLane, 'lane-bloom', {
      filterId: 'filter-bloom',
      property: 'strength'
    });
    const updatedLane = addLaneKeyframe(retargetedLane, 'lane-bloom', {
      id: 'keyframe-2',
      timeMs: 800,
      value: 0.9
    });

    expect(updatedLane.filterStacks[0].filters[0].mix).not.toBe(0.7);
    expect(updatedLane.filterStacks[0].filters[0].parameters?.strength).not.toBe(0.2);
    expect(updatedLane.filterStacks[0].filters[0].automationLaneIds).toContain('lane-bloom');
    expect(updatedLane.automationLanes[0].target.property).toBe('strength');
    expect(updatedLane.automationLanes[0].keyframes).toHaveLength(2);
  });

  it('applies presets into the authored stack using supported filters only', () => {
    const project = applyPresetToStack({
      ...makeProject(),
      presets: [
        {
          id: 'preset-test',
          name: 'Preset Test',
          family: 'glitch',
          filters: [
            {
              type: 'glitch-bands',
              amount: 0.3
            }
          ]
        }
      ]
    }, 'preset-test', 'stack-sequence-main');

    expect(project.filterStacks[0].filters[0].type).toBe('glitch-bands');
    expect(project.filterStacks[0].filters[0].parameters?.strength).toBe(0.3);
  });

  it('applies provided preset definitions without embedding them in the project', () => {
    const project = applyPresetDefinitionToStack(makeProject(), {
      id: 'preset-library-test',
      name: 'Library Test',
      family: 'vhs',
      filters: [
        {
          type: 'blur',
          amount: 0.4
        }
      ]
    }, 'stack-sequence-main');

    expect(project.presets).toHaveLength(0);
    expect(project.filterStacks[0].family).toBe('vhs');
    expect(project.filterStacks[0].filters[0].type).toBe('blur');
    expect(project.filterStacks[0].filters[0].parameters?.radius).toBe(0.4);
  });
});
