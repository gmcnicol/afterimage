import { describe, expect, it } from 'vitest';
import { fixtureProject } from '../../test-fixtures/src';
import { collectProjectIntegrityIssues, getPresetById, getSourceById, normalizeProject } from '../src';

describe('@afterimage/project-model', () => {
  it('normalizes the hybrid project shape deterministically', () => {
    const normalized = normalizeProject({
      ...fixtureProject,
      sources: [...fixtureProject.sources].reverse(),
      analysisRefs: [...(fixtureProject.analysisRefs ?? [])].reverse()
    });

    expect(normalized).toMatchInlineSnapshot(`
      {
        "analysisRefs": [
          {
            "id": "analysis-source-alpha",
            "path": "fixtures/analysis/source-alpha.analysis.json",
            "sourceId": "source-alpha",
            "summary": {
              "durationMs": 5000,
              "sceneCount": 2,
            },
          },
        ],
        "description": "Tiny deterministic fixture project for Phase 1.",
        "id": "project-core-engine-fixture",
        "midiMappings": [
          {
            "bindings": [
              {
                "id": "binding-cut-trigger",
                "mode": "trigger",
                "source": "cc:1:10",
                "target": "sequence-main.segment-intro",
              },
            ],
            "id": "midi-main",
            "name": "Studio Controls",
          },
        ],
        "mode": "studio",
        "name": "Core Engine Fixture",
        "presets": [
          {
            "family": "vhs",
            "filters": [
              {
                "amount": 0.35,
                "mix": 1,
                "type": "tracking-wobble",
              },
              {
                "amount": 0.25,
                "mix": 1,
                "type": "chroma-bleed",
              },
            ],
            "id": "preset-vhs-rental-tape",
            "name": "Rental Tape",
          },
        ],
        "sequence": {
          "id": "sequence-main",
          "items": [
            {
              "durationMs": 2500,
              "id": "segment-intro",
              "presetId": "preset-vhs-rental-tape",
              "sourceId": "source-alpha",
              "sourceStartMs": 500,
              "timelineStartMs": 0,
            },
          ],
          "name": "Main Sequence",
        },
        "sources": [
          {
            "hasAudio": true,
            "hasVideo": true,
            "id": "source-alpha",
            "label": "Source Alpha",
            "path": "fixtures/clips/source-alpha.mp4",
          },
        ],
        "version": 1,
      }
    `);
    expect(getSourceById(normalized, 'source-alpha')?.path).toBe('fixtures/clips/source-alpha.mp4');
    expect(getPresetById(normalized, 'preset-vhs-rental-tape')?.name).toBe('Rental Tape');
  });

  it('reports missing references and duplicate ids', () => {
    const normalized = normalizeProject({
      ...fixtureProject,
      sources: [...fixtureProject.sources, { ...fixtureProject.sources[0] }],
      sequence: {
        ...fixtureProject.sequence,
        items: [
          ...fixtureProject.sequence.items,
          {
            id: 'segment-broken',
            sourceId: 'missing-source',
            timelineStartMs: 3000,
            sourceStartMs: 0,
            durationMs: 1000,
            presetId: 'missing-preset'
          }
        ]
      }
    });

    expect(collectProjectIntegrityIssues(normalized)).toEqual([
      {
        code: 'missing-reference',
        message: 'Sequence item "segment-broken" references missing preset "missing-preset".',
        path: 'sequence.items.segment-broken.presetId'
      },
      {
        code: 'missing-reference',
        message: 'Sequence item "segment-broken" references missing source "missing-source".',
        path: 'sequence.items.segment-broken.sourceId'
      },
      {
        code: 'duplicate-id',
        message: 'Duplicate sources id "source-alpha" detected.',
        path: 'sources'
      }
    ]);
  });
});
