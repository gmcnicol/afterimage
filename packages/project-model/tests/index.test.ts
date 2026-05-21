import { describe, expect, it } from 'vitest';
import { fixtureArchive, fixtureProject } from '../../test-fixtures/src';
import {
  collectArchiveIntegrityIssues,
  collectProjectIntegrityIssues,
  createEmptyProject,
  getAssetById,
  getDefaultVariant,
  normalizeArchiveMetadataFile,
  normalizeProject,
  resolveProjectPathCandidates
} from '../src';

describe('@afterimage/project-model', () => {
  it('normalizes the v3 hybrid project deterministically', () => {
    const normalized = normalizeProject({
      ...fixtureProject,
      assets: [...fixtureProject.assets].reverse(),
      variants: [...fixtureProject.variants].reverse(),
      cutCandidates: [...(fixtureProject.cutCandidates ?? [])].reverse()
    });

    expect(normalized.assets.map((asset) => asset.id)).toEqual(['asset-alpha', 'asset-music']);
    expect(normalized.cutCandidates.map((cut) => cut.id)).toEqual(['cut-intro', 'cut-push']);
    expect(getAssetById(normalized, 'asset-alpha')?.filename).toBe('source-alpha.mp4');
    expect(getDefaultVariant(normalized)?.id).toBe('variant-main');
    expect(getDefaultVariant(normalized)?.musicAlignment?.syncMode).toBe('texture');
    expect(normalized.composition).toMatchObject({
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
    expect(normalized.composition.scenes.map((scene) => scene.id)).toEqual(['scene-main']);
    expect(normalized.composition.modulationRoutes.map((route) => route.id)).toEqual(['route-bloom-midi']);
    expect(normalized.composition.entropyStates.map((state) => state.id)).toEqual(['entropy-scene-pressure']);
    expect(normalized.composition.acceptedArchiveReferences.map((reference) => reference.id)).toEqual(['accepted-archive-source-alpha-motif-motif-hallway-composition-main-scene-main']);
    expect(normalized.composition.rejectedArchiveReferences.map((reference) => reference.id)).toEqual(['rejected-archive-source-alpha-motion-motion-drift-composition-main-layer-clip-intro']);
    expect(normalized.captureSessions.map((session) => session.id)).toEqual(['capture-session-main']);
    expect(normalized.captureLogs[0].events.map((event) => event.id)).toEqual(['capture-event-1']);
    expect(normalized.composition.scenes[0]).toMatchObject({
      id: 'scene-main',
      name: 'Main Scene',
      layerIds: ['layer-clip-intro'],
      archiveReferenceIds: ['archive-source-alpha']
    });
    expect(normalized.composition.layers).toEqual([
      expect.objectContaining({
        id: 'layer-clip-intro',
        sceneId: 'scene-main',
        orderIndex: 0,
        contribution: 'source',
        assetId: 'asset-alpha',
        cutId: 'cut-intro',
        clipId: 'clip-intro',
        stackId: 'stack-sequence-main'
      })
    ]);
  });

  it('creates numbered default sequence variants', () => {
    const project = createEmptyProject({
      id: 'project-sequence-name-test',
      name: 'Sequence Name Test'
    });

    expect(getDefaultVariant(project)?.name).toBe('Sequence 001');
    expect(project.composition).toMatchObject({
      id: 'composition-main',
      name: 'Sequence Name Test',
      sequenceId: 'sequence-main',
      variantId: 'variant-main',
      assetIds: [],
      deterministicSeeds: []
    });
    expect(project.composition.exportProfileIds).toEqual(['landscape-master']);
    expect(project.composition.scenes[0]).toMatchObject({
      id: 'scene-main',
      activation: [
        {
          id: 'activation-main',
          kind: 'timeline',
          startMs: 0,
          endMs: 0
        }
      ],
      layerIds: []
    });
    expect(project.composition.layers).toEqual([]);
  });

  it('defaults composition identity for projects without authored composition', () => {
    const { composition: _composition, ...projectWithoutComposition } = fixtureProject;
    const normalized = normalizeProject(projectWithoutComposition);

    expect(normalized.composition).toMatchObject({
      id: 'composition-main',
      name: 'Studio Fixture',
      sequenceId: 'sequence-main',
      variantId: 'variant-main',
      assetIds: ['asset-alpha', 'asset-music'],
      exportProfileIds: ['landscape-master', 'portrait-short-form'],
      deterministicSeeds: [],
      acceptedArchiveReferences: [],
      rejectedArchiveReferences: []
    });
    expect(normalized.composition.scenes[0].layerIds).toEqual(['layer-clip-intro']);
    expect(normalized.composition.layers[0]).toMatchObject({
      id: 'layer-clip-intro',
      sceneId: 'scene-main',
      assetId: 'asset-alpha',
      clipId: 'clip-intro'
    });
  });

  it('defaults scene and layer identity for older authored composition objects', () => {
    const normalized = normalizeProject({
      ...fixtureProject,
      composition: {
        id: 'composition-main',
        name: 'Studio Fixture',
        sequenceId: 'sequence-main',
        variantId: 'variant-main',
        assetIds: ['asset-alpha', 'asset-music'],
        exportProfileIds: ['landscape-master', 'portrait-short-form'],
        deterministicSeeds: [],
        acceptedArchiveReferences: [],
        rejectedArchiveReferences: []
      }
    });

    expect(normalized.composition.scenes[0]).toMatchObject({
      id: 'scene-main',
      layerIds: ['layer-clip-intro']
    });
    expect(normalized.composition.layers[0]).toMatchObject({
      id: 'layer-clip-intro',
      sceneId: 'scene-main',
      assetId: 'asset-alpha',
      clipId: 'clip-intro'
    });
  });

  it('reports duplicate ids and missing references', () => {
    const normalized = normalizeProject({
      ...fixtureProject,
      assets: [...fixtureProject.assets, fixtureProject.assets[0]],
      variants: [
        {
          ...fixtureProject.variants[0],
          musicAlignment: {
            ...fixtureProject.variants[0].musicAlignment,
            analysisRefId: 'analysis-missing'
          },
          clips: [
            ...fixtureProject.variants[0].clips,
            {
              id: 'clip-broken',
              assetId: 'missing-asset',
              cutId: 'missing-cut',
              timelineStartMs: 2500,
              sourceStartMs: 0,
              durationMs: 1000,
              presetId: 'missing-preset',
              stackOverrideId: 'missing-stack'
            }
          ]
        }
      ]
    });

    expect(collectProjectIntegrityIssues(normalized)).toEqual([
      {
        code: 'duplicate-id',
        message: 'Duplicate assets id "asset-alpha" detected.',
        path: 'assets'
      },
      {
        code: 'missing-reference',
        message: 'Sequence clip "clip-broken" references missing asset "missing-asset".',
        path: 'variants.variant-main.clips.clip-broken.assetId'
      },
      {
        code: 'missing-reference',
        message: 'Sequence clip "clip-broken" references missing cut "missing-cut".',
        path: 'variants.variant-main.clips.clip-broken.cutId'
      },
      {
        code: 'missing-reference',
        message: 'Sequence clip "clip-broken" references missing preset "missing-preset".',
        path: 'variants.variant-main.clips.clip-broken.presetId'
      },
      {
        code: 'missing-reference',
        message: 'Sequence clip "clip-broken" references missing filter stack "missing-stack".',
        path: 'variants.variant-main.clips.clip-broken.stackOverrideId'
      },
      {
        code: 'missing-reference',
        message: 'Variant "variant-main" references missing analysis ref "analysis-missing".',
        path: 'variants.variant-main.musicAlignment.analysisRefId'
      }
    ]);
  });

  it('reports invalid composition references', () => {
    const normalized = normalizeProject({
      ...fixtureProject,
      composition: {
        id: 'composition-main',
        name: 'Broken Composition',
        sequenceId: 'missing-sequence',
        variantId: 'missing-variant',
        assetIds: ['asset-alpha', 'asset-alpha', 'missing-asset'],
        exportProfileIds: ['landscape-master', 'landscape-master', 'missing-profile'],
        deterministicSeeds: [
          {
            id: 'seed-duplicate',
            value: 1
          },
          {
            id: 'seed-duplicate',
            value: 2
          }
        ]
      }
    });

    expect(collectProjectIntegrityIssues(normalized)).toEqual(expect.arrayContaining([
      {
        code: 'duplicate-id',
        message: 'Duplicate composition.assetIds id "asset-alpha" detected.',
        path: 'composition.assetIds'
      },
      {
        code: 'duplicate-id',
        message: 'Duplicate composition.deterministicSeeds id "seed-duplicate" detected.',
        path: 'composition.deterministicSeeds'
      },
      {
        code: 'duplicate-id',
        message: 'Duplicate composition.exportProfileIds id "landscape-master" detected.',
        path: 'composition.exportProfileIds'
      },
      {
        code: 'missing-reference',
        message: 'Composition "composition-main" references missing asset "missing-asset".',
        path: 'composition.assetIds'
      },
      {
        code: 'missing-reference',
        message: 'Composition "composition-main" references missing export profile selection "missing-profile".',
        path: 'composition.exportProfileIds'
      },
      {
        code: 'missing-reference',
        message: 'Composition "composition-main" references missing sequence "missing-sequence".',
        path: 'composition.sequenceId'
      },
      {
        code: 'missing-reference',
        message: 'Composition "composition-main" references missing variant "missing-variant".',
        path: 'composition.variantId'
      }
    ]));
  });

  it('reports invalid v3 modulation, entropy, and capture references', () => {
    const normalized = normalizeProject({
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
              id: 'filter-missing',
              property: 'mix'
            },
            mapping: {
              kind: 'linear'
            },
            scope: {
              compositionId: 'composition-missing',
              sequenceId: 'sequence-missing',
              variantId: 'variant-missing',
              sceneId: 'scene-missing',
              layerId: 'layer-missing',
              clipId: 'clip-missing'
            },
            capturePolicy: 'record',
            seedId: 'seed-missing'
          }
        ],
        entropyStates: [
          ...fixtureProject.composition?.entropyStates ?? [],
          {
            id: 'entropy-broken',
            source: {
              kind: 'modulation-route',
              id: 'route-missing'
            },
            target: {
              kind: 'scene-climate',
              id: 'scene-missing',
              property: 'pressure'
            },
            scope: {},
            value: 0.5,
            capturePolicy: 'record',
            seedId: 'seed-missing'
          }
        ]
      },
      captureSessions: [
        ...(fixtureProject.captureSessions ?? []),
        {
          id: 'capture-broken',
          status: 'open',
          startedAt: '2026-03-08T10:03:00.000Z',
          projectId: 'project-missing',
          compositionId: 'composition-missing',
          sequenceId: 'sequence-missing',
          variantId: 'variant-missing',
          timebase: {
            kind: 'project-ms'
          },
          admittedInputIds: [],
          seedIds: ['seed-missing']
        }
      ],
      captureLogs: [
        ...(fixtureProject.captureLogs ?? []),
        {
          id: 'capture-log-broken',
          captureSessionId: 'capture-missing',
          events: [
            {
              id: 'event-broken',
              captureId: 'capture-missing',
              index: 0,
              captureTimeMs: 0,
              source: {
                kind: 'midi-binding',
                id: 'binding-missing'
              },
              target: {
                kind: 'entropy-state',
                id: 'entropy-missing'
              },
              kind: 'input',
              replayCritical: true,
              routeId: 'route-missing',
              mappingId: 'mapping-missing',
              seedId: 'seed-missing'
            }
          ]
        }
      ]
    });

    expect(collectProjectIntegrityIssues(normalized)).toEqual(expect.arrayContaining([
      {
        code: 'missing-reference',
        message: 'Modulation route "route-broken" source references missing automation lane "lane-missing".',
        path: 'composition.modulationRoutes.route-broken.source.id'
      },
      {
        code: 'missing-reference',
        message: 'Modulation route "route-broken" target references missing filter "filter-missing".',
        path: 'composition.modulationRoutes.route-broken.target.id'
      },
      {
        code: 'missing-reference',
        message: 'Modulation route "route-broken" references missing deterministic seed "seed-missing".',
        path: 'composition.modulationRoutes.route-broken.seedId'
      },
      {
        code: 'missing-reference',
        message: 'Entropy state "entropy-broken" source references missing modulation route "route-missing".',
        path: 'composition.entropyStates.entropy-broken.source.id'
      },
      {
        code: 'missing-reference',
        message: 'Capture session "capture-broken" references missing project "project-missing".',
        path: 'captureSessions.capture-broken.projectId'
      },
      {
        code: 'missing-reference',
        message: 'Capture log "capture-log-broken" references missing capture session "capture-missing".',
        path: 'captureLogs.capture-log-broken.captureSessionId'
      },
      {
        code: 'missing-reference',
        message: 'Capture event "event-broken" references missing modulation route "route-missing".',
        path: 'captureLogs.capture-log-broken.events.event-broken.routeId'
      }
    ]));
  });

  it('normalizes scene and layer ordering and reports invalid scene layer references', () => {
    const normalized = normalizeProject({
      ...fixtureProject,
      composition: {
        ...fixtureProject.composition,
        scenes: [
          {
            id: 'scene-b',
            name: 'Scene B',
            activation: [
              {
                id: 'activation-late',
                kind: 'timeline',
                startMs: 2000,
                endMs: 1000
              }
            ],
            transitions: [
              {
                id: 'transition-missing',
                toSceneId: 'scene-missing',
                style: 'mask',
                durationMs: 250,
                maskAssetId: 'missing-mask'
              }
            ],
            layerIds: ['layer-missing'],
            archiveReferenceIds: []
          },
          {
            id: 'scene-a',
            name: 'Scene A',
            layerIds: ['layer-b', 'layer-a']
          }
        ],
        layers: [
          {
            id: 'layer-b',
            name: 'Layer B',
            sceneId: 'scene-a',
            orderIndex: 2,
            scope: 'source-clip',
            contribution: 'source',
            assetId: 'asset-alpha',
            clipId: 'clip-intro',
            renderIntent: {
              passKind: 'source'
            }
          },
          {
            id: 'layer-a',
            name: 'Layer A',
            sceneId: 'scene-a',
            orderIndex: 1,
            scope: 'source-clip',
            contribution: 'source',
            assetId: 'missing-asset',
            cutId: 'missing-cut',
            clipId: 'missing-clip',
            stackId: 'missing-stack',
            maskLayerId: 'missing-layer',
            renderIntent: {
              passKind: 'source'
            }
          },
          {
            id: 'layer-orphan',
            name: 'Layer Orphan',
            sceneId: 'scene-missing',
            orderIndex: 0,
            scope: 'diagnostic',
            contribution: 'diagnostic',
            renderIntent: {
              passKind: 'diagnostic'
            }
          }
        ]
      }
    });

    expect(normalized.composition.scenes.map((scene) => scene.id)).toEqual(['scene-a', 'scene-b']);
    expect(normalized.composition.layers.map((layer) => layer.id)).toEqual(['layer-a', 'layer-b', 'layer-orphan']);
    expect(collectProjectIntegrityIssues(normalized)).toEqual(expect.arrayContaining([
      {
        code: 'invalid-range',
        message: 'Scene activation "activation-late" cannot end before it starts.',
        path: 'composition.scenes.scene-b.activation.activation-late'
      },
      {
        code: 'missing-reference',
        message: 'Scene transition "transition-missing" references missing scene "scene-missing".',
        path: 'composition.scenes.scene-b.transitions.transition-missing.toSceneId'
      },
      {
        code: 'missing-reference',
        message: 'Scene transition "transition-missing" references missing mask asset "missing-mask".',
        path: 'composition.scenes.scene-b.transitions.transition-missing.maskAssetId'
      },
      {
        code: 'missing-reference',
        message: 'Scene "scene-b" references missing layer "layer-missing".',
        path: 'composition.scenes.scene-b.layerIds'
      },
      {
        code: 'missing-reference',
        message: 'Layer "layer-a" references missing asset "missing-asset".',
        path: 'composition.layers.layer-a.assetId'
      },
      {
        code: 'missing-reference',
        message: 'Layer "layer-a" references missing clip "missing-clip".',
        path: 'composition.layers.layer-a.clipId'
      },
      {
        code: 'missing-reference',
        message: 'Layer "layer-a" references missing cut "missing-cut".',
        path: 'composition.layers.layer-a.cutId'
      },
      {
        code: 'missing-reference',
        message: 'Layer "layer-a" references missing filter stack "missing-stack".',
        path: 'composition.layers.layer-a.stackId'
      },
      {
        code: 'missing-reference',
        message: 'Layer "layer-a" references missing mask layer "missing-layer".',
        path: 'composition.layers.layer-a.maskLayerId'
      },
      {
        code: 'missing-reference',
        message: 'Layer "layer-orphan" references missing scene "scene-missing".',
        path: 'composition.layers.layer-orphan.sceneId'
      }
    ]));
  });

  it('reports missing archive references only when availability context is supplied', () => {
    const normalized = normalizeProject(fixtureProject);

    expect(collectProjectIntegrityIssues(normalized)).toEqual([]);
    expect(collectProjectIntegrityIssues(normalized, {
      availableArchiveIds: ['archive-other']
    })).toEqual([
      {
        code: 'missing-reference',
        message: 'Layer "layer-clip-intro" references missing archive "archive-source-alpha".',
        path: 'composition.layers.layer-clip-intro.archiveReferenceIds'
      },
      {
        code: 'missing-reference',
        message: 'Scene "scene-main" references missing archive "archive-source-alpha".',
        path: 'composition.scenes.scene-main.archiveReferenceIds'
      }
    ]);
  });

  it('normalizes archive affinity candidates deterministically', () => {
    const normalized = normalizeArchiveMetadataFile({
      ...fixtureArchive,
      affinity: [
        {
          id: 'affinity-z',
          sourceId: 'motif-hallway',
          targetId: 'material-concrete',
          descriptors: ['zeta', 'alpha']
        },
        ...(fixtureArchive.affinity ?? [])
      ]
    });

    expect(normalized.affinity.map((candidate) => candidate.id)).toEqual(['affinity-hallway-concrete', 'affinity-z']);
    expect(normalized.affinity[1].descriptors).toEqual(['alpha', 'zeta']);
  });

  it('reports duplicate archive candidate ids and missing archive refs', () => {
    const issues = collectArchiveIntegrityIssues(normalizeArchiveMetadataFile({
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
      ],
      recurrence: [
        {
          id: 'recurrence-broken',
          sourceId: 'motif-hallway',
          targetId: 'archive-missing',
          relationship: 'motif-recurrence'
        }
      ],
      affinity: [
        {
          id: 'affinity-broken',
          sourceId: 'motif-hallway',
          targetId: 'material-missing'
        }
      ]
    }));

    expect(issues).toEqual(expect.arrayContaining([
      {
        code: 'duplicate-id',
        message: 'Duplicate archive.candidates id "segment-alpha-hallway" detected.',
        path: 'archive.candidates'
      },
      {
        code: 'invalid-range',
        message: 'Archive segment "segment-alpha-hallway" cannot end before it starts.',
        path: 'segments.segment-alpha-hallway.range'
      },
      {
        code: 'missing-reference',
        message: 'Archive segment "segment-alpha-hallway" references missing archive item "motif-missing".',
        path: 'segments.segment-alpha-hallway.motifIds'
      },
      {
        code: 'missing-reference',
        message: 'Archive recurrence "recurrence-broken" references missing archive item "archive-missing".',
        path: 'recurrence.recurrence-broken.targetId'
      },
      {
        code: 'missing-reference',
        message: 'Archive affinity "affinity-broken" references missing archive item "material-missing".',
        path: 'affinity.affinity-broken.targetId'
      }
    ]));
  });

  it('reports invalid mask transition references and placement', () => {
    const normalized = normalizeProject({
      ...fixtureProject,
      variants: [
        {
          ...fixtureProject.variants[0],
          clips: [
            {
              ...fixtureProject.variants[0].clips[0],
              transition: 'mask',
              transitionDurationMs: 500
            },
            {
              id: 'clip-outro',
              assetId: 'asset-alpha',
              timelineStartMs: 2000,
              sourceStartMs: 0,
              durationMs: 1500,
              transition: 'mask',
              transitionDurationMs: 400,
              transitionAssetId: 'missing-mask',
              transitionOverlayAssetId: 'missing-overlay'
            }
          ]
        }
      ]
    });

    expect(collectProjectIntegrityIssues(normalized)).toEqual(expect.arrayContaining([
      {
        code: 'missing-reference',
        message: 'Sequence clip "clip-intro" uses mask transition without a transition asset.',
        path: 'variants.variant-main.clips.clip-intro.transitionAssetId'
      },
      {
        code: 'missing-reference',
        message: 'Sequence clip "clip-outro" references missing transition asset "missing-mask".',
        path: 'variants.variant-main.clips.clip-outro.transitionAssetId'
      },
      {
        code: 'missing-reference',
        message: 'Sequence clip "clip-outro" references missing transition overlay asset "missing-overlay".',
        path: 'variants.variant-main.clips.clip-outro.transitionOverlayAssetId'
      },
      {
        code: 'invalid-range',
        message: 'Sequence clip "clip-outro" cannot use a mask transition without a following clip.',
        path: 'variants.variant-main.clips.clip-outro.transition'
      }
    ]));
  });

  it('creates empty projects with deterministic defaults', () => {
    const project = createEmptyProject({
      id: 'project-empty',
      name: 'Alpha Build'
    });

    expect(project.defaultSequenceId).toBe('sequence-main');
    expect(project.exportSelections).toHaveLength(4);
    expect(resolveProjectPathCandidates('/tmp/project', {
      absolutePath: '/media/source-alpha.mp4',
      relativePath: 'clips/source-alpha.mp4'
    })).toEqual(['/tmp/project/clips/source-alpha.mp4', '/media/source-alpha.mp4']);
  });

  it('rejects unsupported authored filters and invalid automation targets', () => {
    const normalized = normalizeProject({
      ...fixtureProject,
      filterStacks: [
        {
          ...fixtureProject.filterStacks[0],
          filters: [
            {
              id: 'filter-unsupported',
              type: 'tracking-wobble',
              enabled: true,
              orderIndex: 0,
              parameters: {
                amount: 0.2
              },
              mix: 0.8
            },
            {
              ...fixtureProject.filterStacks[0].filters[0],
              orderIndex: 1
            }
          ]
        }
      ],
      automationLanes: [
        {
          ...fixtureProject.automationLanes[0],
          target: {
            filterId: fixtureProject.filterStacks[0].filters[0].id,
            property: 'brightness'
          }
        }
      ]
    });

    expect(collectProjectIntegrityIssues(normalized)).toEqual(expect.arrayContaining([
      {
        code: 'unsupported-value',
        message: 'Filter "filter-unsupported" uses unsupported type "tracking-wobble".',
        path: 'filterStacks.stack-sequence-main.filters.filter-unsupported.type'
      },
      {
        code: 'unsupported-value',
        message: 'Automation lane "lane-bloom-mix" targets unsupported property "brightness" for filter "filter-main-bloom".',
        path: 'automationLanes.lane-bloom-mix.target.property'
      }
    ]));
  });
});
