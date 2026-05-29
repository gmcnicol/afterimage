import { describe, expect, it } from 'vitest';
import { fixtureAnalysis, fixtureArchive, fixtureMidiMapping, fixtureProject } from '../../test-fixtures/src';
import {
  parseAnalysis,
  parseArchiveMetadata,
  parseMidiMapping,
  parseProject,
  validateArchiveMetadata,
  validatePreset,
  validateProject
} from '../src';

describe('@afterimage/schema-validators', () => {
  it('parses the v3 canonical project and applies defaults', () => {
    const parsed = parseProject({
      ...fixtureProject,
      composition: undefined,
      filterStacks: fixtureProject.filterStacks.map((stack) => ({
        ...stack,
        filters: stack.filters.map((filter) => ({
          ...filter,
          fieldSamplers: undefined
        }))
      })),
      featureFlags: undefined,
      tags: undefined,
      exportSelections: undefined,
      captureSessions: undefined,
      captureLogs: undefined
    });

    expect(parsed.version).toBe(3);
    expect(parsed.composition).toMatchObject({
      id: 'composition-main',
      name: 'Studio Fixture',
      sequenceId: 'sequence-main',
      variantId: 'variant-main',
      assetIds: ['asset-alpha', 'asset-music'],
      exportProfileIds: [],
      deterministicSeeds: []
    });
    expect(parsed.composition.scenes[0].layerIds).toEqual(['layer-clip-intro']);
    expect(parsed.composition.layers[0].id).toBe('layer-clip-intro');
    expect(parsed.composition.spatialFields).toEqual([]);
    expect(parsed.composition.fieldGenerators).toEqual([]);
    expect(parsed.runtimeProfiles.map((profile) => profile.kind)).toEqual(['draft', 'live', 'render', 'studio']);
    expect(parsed.featureFlags.proxyGeneration).toBe(false);
    expect(parsed.exportSelections).toEqual([]);
    expect(parsed.captureSessions).toEqual([]);
    expect(parsed.captureLogs).toEqual([]);
    expect(parsed.tags).toEqual([]);
  });

  it('parses the canonical project with authored composition identity', () => {
    const parsed = parseProject(fixtureProject);

    expect(parsed.composition).toMatchObject({
      id: 'composition-main',
      name: 'Studio Fixture',
      sequenceId: 'sequence-main',
      variantId: 'variant-main',
      assetIds: ['asset-alpha', 'asset-music'],
      exportProfileIds: ['landscape-master', 'portrait-short-form'],
      deterministicSeeds: [
        {
          id: 'seed-composition-main',
          value: 1337,
          label: 'Main composition seed'
        }
      ]
    });
    expect(parsed.composition.scenes[0]).toMatchObject({
      id: 'scene-main',
      name: 'Main Scene',
      layerIds: ['layer-clip-intro']
    });
    expect(parsed.composition.layers[0]).toMatchObject({
      id: 'layer-clip-intro',
      sceneId: 'scene-main',
      contribution: 'source'
    });
    expect(parsed.composition.spatialFields.map((field) => field.id)).toEqual([
      'field-entropy-scene',
      'field-flow-x-scene',
      'field-flow-y-scene',
      'field-heat-scene',
      'field-memory-scene',
      'field-motion-source',
      'field-pressure-scene',
      'field-viscosity-scene'
    ]);
    expect(parsed.composition.spatialFields.find((field) => field.id === 'field-heat-scene')).toMatchObject({
      kind: 'heat',
      sourceClass: 'behavioural-state',
      storage: 'gpu-texture',
      access: 'read-write'
    });
    expect(parsed.composition.spatialFields.find((field) => field.id === 'field-memory-scene')?.persistence).toMatchObject({
      lifetime: 'composition',
      previousFrameAccess: 'history-window',
      storageIntent: 'replayable',
      windowFrames: 4
    });
    expect(parsed.composition.fieldGenerators.map((generator) => generator.id)).toEqual([
      'generator-clip-luma-alpha',
      'generator-live-flights-flow',
      'generator-seeded-noise-drift'
    ]);
    expect(parsed.filterStacks[0].filters[0].fieldSamplers?.[0]).toMatchObject({
      id: 'sampler-bloom-heat-strength',
      fieldId: 'field-heat-scene',
      parameter: 'strength',
      fallbackValue: 0.24
    });
  });

  it('migrates a phase 1 project shape into the v3 canonical project', () => {
    const migrated = parseProject({
      id: 'project-legacy',
      name: 'Legacy Project',
      mode: 'studio',
      version: 1,
      sources: [
        {
          id: 'source-alpha',
          path: 'fixtures/clips/source-alpha.mp4',
          hasVideo: true,
          hasAudio: true
        }
      ],
      presets: [],
      sequence: {
        id: 'sequence-main',
        name: 'Main Sequence',
        items: [
          {
            id: 'segment-intro',
            sourceId: 'source-alpha',
            timelineStartMs: 0,
            sourceStartMs: 0,
            durationMs: 1000
          }
        ]
      }
    });

    expect(migrated.assets[0].id).toBe('source-alpha');
    expect(migrated.cutCandidates[0].id).toBe('cut-segment-intro');
    expect(migrated.variants[0].clips[0].cutId).toBe('cut-segment-intro');
    expect(migrated.version).toBe(3);
    expect(migrated.composition.modulationRoutes).toEqual([]);
    expect(migrated.composition.entropyStates).toEqual([]);
    expect(migrated.captureSessions).toEqual([]);
    expect(migrated.captureLogs).toEqual([]);
  });

  it('migrates a v2 current-shape project into v3 with empty v3 collections', () => {
    const { captureSessions: _captureSessions, captureLogs: _captureLogs, ...v3Fixture } = fixtureProject;
    const migrated = validateProject({
      ...v3Fixture,
      version: 2,
      filterStacks: fixtureProject.filterStacks.map((stack) => ({
        ...stack,
        filters: stack.filters.map((filter) => ({
          ...filter,
          fieldSamplers: undefined
        }))
      })),
      composition: {
        ...fixtureProject.composition,
        modulationRoutes: undefined,
        entropyStates: undefined,
        spatialFields: undefined,
        fieldGenerators: undefined
      }
    });

    expect(migrated.ok).toBe(true);
    if (!migrated.ok) {
      return;
    }
    expect(migrated.migrated).toBe(true);
    expect(migrated.fromVersion).toBe(2);
    expect(migrated.value.version).toBe(3);
    expect(migrated.value.composition.modulationRoutes).toEqual([]);
    expect(migrated.value.composition.entropyStates).toEqual([]);
    expect(migrated.value.composition.spatialFields).toEqual([]);
    expect(migrated.value.composition.fieldGenerators).toEqual([]);
    expect(migrated.value.captureSessions).toEqual([]);
    expect(migrated.value.captureLogs).toEqual([]);
  });

  it('silently upgrades stale style contracts in current-shape project files', () => {
    const migrated = parseProject({
      ...fixtureProject,
      version: 2,
      composition: undefined,
      captureSessions: undefined,
      captureLogs: undefined,
      filterStacks: [
        {
          ...fixtureProject.filterStacks[0],
          filters: [
            {
              id: 'filter-legacy-contrast',
              type: 'contrast-pulse',
              enabled: true,
              orderIndex: 0,
              parameters: {
                amount: 0.3
              },
              mix: 0.75,
              automationLaneIds: ['lane-legacy-contrast']
            }
          ]
        }
      ],
      automationLanes: [
        {
          id: 'lane-legacy-contrast',
          name: 'Legacy Contrast',
          target: {
            filterId: 'filter-legacy-contrast',
            property: 'amount'
          },
          enabled: true,
          keyframes: [
            {
              id: 'keyframe-1',
              timeMs: 0,
              value: 0.4
            }
          ]
        }
      ]
    });

    expect(migrated.filterStacks[0].filters[0].type).toBe('contrast');
    expect(migrated.filterStacks[0].filters[0].parameters?.contrast).toBe(0.3);
    expect(migrated.automationLanes[0].target.property).toBe('contrast');
  });

  it('returns structured validation issues for invalid input', () => {
    expect(validateProject({
      ...fixtureProject,
      variants: [
        {
          ...fixtureProject.variants[0],
          clips: [
            {
              ...fixtureProject.variants[0].clips[0],
              assetId: 'missing-asset'
            }
          ]
        }
      ]
    })).toEqual({
      ok: false,
      code: 'invalid-project-file',
      errors: [
        {
          keyword: 'missing-reference',
          message: 'Sequence clip "clip-intro" references missing asset "missing-asset".',
          path: 'variants.variant-main.clips.clip-intro.assetId',
          source: 'integrity'
        }
      ]
    });

    expect(validatePreset({
      id: 'preset-bad',
      name: 'Broken',
      filters: []
    })).toEqual({
      ok: false,
      code: 'schema-validation-failure',
      errors: [
        {
          keyword: 'required',
          message: "must have required property 'family'",
          path: '/',
          source: 'schema'
        }
      ]
    });

    expect(validateProject({
      ...fixtureProject,
      automationLanes: [
        {
          ...fixtureProject.automationLanes[0],
          target: {
            filterId: fixtureProject.filterStacks[0].filters[0].id,
            property: 'brightness'
          }
        }
      ]
    })).toEqual({
      ok: false,
      code: 'invalid-project-file',
      errors: [
        {
          keyword: 'unsupported-value',
          message: 'Automation lane "lane-bloom-mix" targets unsupported property "brightness" for filter "filter-main-bloom".',
          path: 'automationLanes.lane-bloom-mix.target.property',
          source: 'integrity'
        }
      ]
    });

    expect(validateProject({
      ...fixtureProject,
      composition: {
        id: 'composition-main',
        name: 'Studio Fixture',
        sequenceId: 'sequence-main',
        variantId: 'variant-main',
        assetIds: ['asset-alpha', 'asset-music'],
        exportProfileIds: ['landscape-master', 'portrait-short-form'],
        deterministicSeeds: [
          {
            id: 'seed-bad',
            value: -1
          }
        ]
      }
    })).toEqual({
      ok: false,
      code: 'schema-validation-failure',
      errors: [
        {
          keyword: 'minimum',
          message: 'must be >= 0',
          path: '/composition/deterministicSeeds/0/value',
          source: 'schema'
        }
      ]
    });

    expect(validateProject({
      ...fixtureProject,
      composition: {
        ...fixtureProject.composition,
        scenes: [
          {
            id: 'scene-main',
            name: 'Main Scene',
            layerIds: ['missing-layer']
          }
        ],
        layers: []
      }
    })).toEqual({
      ok: false,
      code: 'invalid-project-file',
      errors: [
        {
          keyword: 'missing-reference',
          message: 'Scene "scene-main" references missing layer "missing-layer".',
          path: 'composition.scenes.scene-main.layerIds',
          source: 'integrity'
        }
      ]
    });
  });

  it('rejects invalid v3 modulation and capture schema values', () => {
    const captureEvent = fixtureProject.captureLogs?.[0]?.events[0];
    expect(captureEvent).toBeDefined();
    if (!captureEvent) {
      return;
    }

    expect(validateProject({
      ...fixtureProject,
      composition: {
        ...fixtureProject.composition,
        modulationRoutes: [
          {
            ...fixtureProject.composition?.modulationRoutes?.[0],
            capturePolicy: 'capture-everything'
          }
        ]
      }
    })).toEqual({
      ok: false,
      code: 'schema-validation-failure',
      errors: [
        {
          keyword: 'enum',
          message: 'must be equal to one of the allowed values',
          path: '/composition/modulationRoutes/0/capturePolicy',
          source: 'schema'
        }
      ]
    });

    expect(validateProject({
      ...fixtureProject,
      composition: {
        ...fixtureProject.composition,
        entropyStates: [
          {
            ...fixtureProject.composition?.entropyStates?.[0],
            value: 1.5
          }
        ]
      }
    })).toEqual({
      ok: false,
      code: 'schema-validation-failure',
      errors: [
        {
          keyword: 'maximum',
          message: 'must be <= 1',
          path: '/composition/entropyStates/0/value',
          source: 'schema'
        }
      ]
    });

    expect(validateProject({
      ...fixtureProject,
      captureLogs: [
        {
          id: 'capture-log-main',
          captureSessionId: 'capture-session-main',
          events: [
            {
              ...captureEvent,
              captureTimeMs: -1
            }
          ]
        }
      ]
    })).toEqual({
      ok: false,
      code: 'schema-validation-failure',
      errors: [
        {
          keyword: 'minimum',
          message: 'must be >= 0',
          path: '/captureLogs/0/events/0/captureTimeMs',
          source: 'schema'
        }
      ]
    });
  });

  it('rejects invalid spatial field schema values', () => {
    expect(validateProject({
      ...fixtureProject,
      composition: {
        ...fixtureProject.composition,
        spatialFields: [
          {
            id: 'field-bad-kind',
            kind: 'fog',
            resolution: {
              kind: 'output-sized'
            }
          }
        ]
      }
    })).toEqual({
      ok: false,
      code: 'schema-validation-failure',
      errors: [
        {
          keyword: 'enum',
          message: 'must be equal to one of the allowed values',
          path: '/composition/spatialFields/0/kind',
          source: 'schema'
        }
      ]
    });

    expect(validateProject({
      ...fixtureProject,
      composition: {
        ...fixtureProject.composition,
        spatialFields: [
          {
            id: 'field-bad-resolution',
            kind: 'heat',
            resolution: {
              kind: 'fixed',
              width: 64
            }
          }
        ]
      }
    })).toEqual({
      ok: false,
      code: 'schema-validation-failure',
      errors: expect.arrayContaining([
        {
          keyword: 'required',
          message: "must have required property 'height'",
          path: '/composition/spatialFields/0/resolution',
          source: 'schema'
        }
      ])
    });

    expect(validateProject({
      ...fixtureProject,
      composition: {
        ...fixtureProject.composition,
        spatialFields: [
          {
            id: 'field-bad-policy',
            kind: 'heat',
            resolution: {
              kind: 'output-sized'
            },
            access: 'execute',
            storage: 'shared-memory'
          }
        ]
      }
    })).toEqual({
      ok: false,
      code: 'schema-validation-failure',
      errors: expect.arrayContaining([
        {
          keyword: 'enum',
          message: 'must be equal to one of the allowed values',
          path: '/composition/spatialFields/0/storage',
          source: 'schema'
        },
        {
          keyword: 'enum',
          message: 'must be equal to one of the allowed values',
          path: '/composition/spatialFields/0/access',
          source: 'schema'
        }
      ])
    });

    expect(validateProject({
      ...fixtureProject,
      composition: {
        ...fixtureProject.composition,
        spatialFields: [
          {
            id: 'field-bad-persistence',
            kind: 'memory',
            resolution: {
              kind: 'output-sized'
            },
            persistence: {
              lifetime: 'composition',
              previousFrameAccess: 'history-window',
              accumulation: {
                kind: 'decay',
                decay: 1.5
              },
              replayIdentity: {
                deterministic: true
              },
              storageIntent: 'replayable'
            }
          }
        ]
      }
    })).toEqual({
      ok: false,
      code: 'schema-validation-failure',
      errors: expect.arrayContaining([
        {
          keyword: 'maximum',
          message: 'must be <= 1',
          path: '/composition/spatialFields/0/persistence/accumulation/decay',
          source: 'schema'
        }
      ])
    });
  });

  it('accepts motion frame difference field generator manifests', () => {
    expect(validateProject({
      ...fixtureProject,
      composition: {
        ...fixtureProject.composition,
        fieldGenerators: [
          ...(fixtureProject.composition?.fieldGenerators ?? []),
          {
            id: 'generator-motion-frame-difference-runtime',
            kind: 'motion-frame-difference',
            name: 'Frame Difference Motion',
            inputs: [
              {
                id: 'input-source-frames',
                kind: 'asset',
                refId: 'asset-alpha'
              }
            ],
            outputs: [
              {
                id: 'output-motion',
                kind: 'spatial-field',
                fieldId: 'field-motion-source',
                channels: ['magnitude']
              },
              {
                id: 'output-flow-x',
                kind: 'spatial-field',
                fieldId: 'field-flow-x-scene',
                channels: ['r']
              },
              {
                id: 'output-flow-y',
                kind: 'spatial-field',
                fieldId: 'field-flow-y-scene',
                channels: ['g']
              }
            ],
            scope: {
              compositionId: 'composition-main',
              layerId: 'layer-clip-intro',
              clipId: 'clip-intro'
            },
            costClass: 'cheap',
            determinismMode: 'deterministic',
            capturePolicy: 'ignore',
            requiredCapabilities: ['field-generator:motion-frame-difference'],
            cacheIdentity: {
              version: 'motion-frame-difference@1',
              inputs: ['asset-alpha', 'runtime-profile-draft']
            }
          }
        ]
      }
    }).ok).toBe(true);
  });

  it('rejects capture event integrity failures separately from schema failures', () => {
    const captureEvent = fixtureProject.captureLogs?.[0]?.events[0];
    expect(captureEvent).toBeDefined();
    if (!captureEvent) {
      return;
    }

    expect(validateProject({
      ...fixtureProject,
      captureLogs: [
        {
          id: 'capture-log-main',
          captureSessionId: 'capture-session-main',
          events: [
            {
              ...captureEvent,
              routeId: 'route-missing'
            }
          ]
        }
      ]
    })).toEqual({
      ok: false,
      code: 'invalid-project-file',
      errors: [
        {
          keyword: 'missing-reference',
          message: 'Capture event "capture-event-1" references missing modulation route "route-missing".',
          path: 'captureLogs.capture-log-main.events.capture-event-1.routeId',
          source: 'integrity'
        }
      ]
    });
  });

  it('parses standalone analysis and midi sidecars', () => {
    expect(parseAnalysis(fixtureAnalysis).summary?.thumbnailCount).toBe(2);
    expect(parseMidiMapping(fixtureMidiMapping).bindings[0].id).toBe('binding-cut-trigger');
  });

  it('parses archive metadata sidecars and applies collection defaults', () => {
    const parsed = parseArchiveMetadata({
      ...fixtureArchive,
      recurrence: undefined,
      affinity: undefined
    });

    expect(parsed.sourceSystem).toBe('darklife');
    expect(parsed.segments[0].motifIds).toEqual(['motif-hallway']);
    expect(parsed.recurrence).toEqual([]);
    expect(parsed.affinity).toEqual([]);
  });

  it('validates archive fixtures with affinity candidates', () => {
    const parsed = parseArchiveMetadata(fixtureArchive);

    expect(parsed.affinity[0]).toMatchObject({
      id: 'affinity-hallway-concrete',
      sourceId: 'motif-hallway',
      targetId: 'material-concrete'
    });
  });

  it('rejects archive metadata with unsupported recurrence relationships', () => {
    expect(validateArchiveMetadata({
      ...fixtureArchive,
      recurrence: [
        {
          id: 'recurrence-bad',
          sourceId: 'motif-hallway',
          targetId: 'atmosphere-thermal-drift',
          relationship: 'generic-relatedness'
        }
      ]
    })).toEqual({
      ok: false,
      code: 'schema-validation-failure',
      errors: [
        {
          keyword: 'enum',
          message: 'must be equal to one of the allowed values',
          path: '/recurrence/0/relationship',
          source: 'schema'
        }
      ]
    });
  });

  it('rejects archive integrity failures separately from schema failures', () => {
    expect(validateArchiveMetadata({
      ...fixtureArchive,
      segments: [
        ...(fixtureArchive.segments ?? []),
        {
          id: 'segment-alpha-hallway',
          range: {
            startMs: 4000,
            endMs: 3000
          },
          motifIds: ['motif-missing']
        }
      ]
    })).toEqual({
      ok: false,
      code: 'invalid-archive-file',
      errors: expect.arrayContaining([
        {
          keyword: 'duplicate-id',
          message: 'Duplicate archive.candidates id "segment-alpha-hallway" detected.',
          path: 'archive.candidates',
          source: 'integrity'
        },
        {
          keyword: 'invalid-range',
          message: 'Archive segment "segment-alpha-hallway" cannot end before it starts.',
          path: 'segments.segment-alpha-hallway.range',
          source: 'integrity'
        },
        {
          keyword: 'missing-reference',
          message: 'Archive segment "segment-alpha-hallway" references missing archive item "motif-missing".',
          path: 'segments.segment-alpha-hallway.motifIds',
          source: 'integrity'
        }
      ])
    });
  });

  it('rejects archive sidecars missing required provenance or stable ids', () => {
    expect(validateArchiveMetadata({
      ...fixtureArchive,
      provenance: {
        sourceKind: 'public-domain',
        generatorVersion: '0.1.0'
      },
      motifs: [
        {
          id: 'motif with space',
          label: 'unstable'
        }
      ]
    })).toEqual({
      ok: false,
      code: 'invalid-archive-file',
      errors: expect.arrayContaining([
        {
          keyword: 'missing-provenance',
          message: 'Archive "archive-source-alpha" is missing required generator provenance.',
          path: 'provenance.generator',
          source: 'integrity'
        },
        {
          keyword: 'unstable-id',
          message: 'Archive motif id "motif with space" is not stable.',
          path: 'motifs.motif with space',
          source: 'integrity'
        }
      ])
    });
  });

  it('accepts analysis sidecars with audio change and sync tracks', () => {
    const parsed = parseAnalysis({
      ...fixtureAnalysis,
      summary: undefined,
      audioChangeTrack: {
        id: 'asset-music-audio-change',
        assetId: 'asset-alpha',
        generatedBy: ['astats', 'ebur128'],
        events: [
          {
            id: 'change-1',
            timeMs: 1000,
            kind: 'energy-shift',
            source: 'astats',
            strength: 0.62
          }
        ]
      },
      syncEventTrack: {
        id: 'asset-music-sync',
        assetId: 'asset-alpha',
        derivedFromTrackId: 'asset-music-audio-change',
        events: [
          {
            id: 'sync-1',
            timeMs: 1000,
            source: 'audio-change',
            kind: 'change',
            strength: 0.62,
            audioChangeEventId: 'change-1'
          }
        ]
      }
    });

    expect(parsed.summary?.changeEventCount).toBe(1);
    expect(parsed.summary?.syncEventCount).toBe(1);
  });
});
