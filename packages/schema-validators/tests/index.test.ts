import { describe, expect, it } from 'vitest';
import { fixtureAnalysis, fixtureMidiMapping, fixtureProject } from '../../test-fixtures/src';
import { parseAnalysis, parseMidiMapping, parseProject, validatePreset, validateProject } from '../src';

describe('@afterimage/schema-validators', () => {
  it('parses the canonical hybrid project and applies defaults', () => {
    const parsed = parseProject({
      ...fixtureProject,
      sources: [
        {
          id: 'source-beta',
          path: 'fixtures/clips/source-beta.mp4'
        }
      ],
      presets: [],
      sequence: {
        id: 'sequence-minimal',
        name: 'Minimal',
        items: []
      },
      midiMappings: undefined,
      analysisRefs: undefined
    });

    expect(parsed).toMatchInlineSnapshot(`
      {
        "analysisRefs": [],
        "description": "Tiny deterministic fixture project for Phase 1.",
        "id": "project-core-engine-fixture",
        "midiMappings": [],
        "mode": "studio",
        "name": "Core Engine Fixture",
        "presets": [],
        "sequence": {
          "id": "sequence-minimal",
          "items": [],
          "name": "Minimal",
        },
        "sources": [
          {
            "hasAudio": true,
            "hasVideo": true,
            "id": "source-beta",
            "path": "fixtures/clips/source-beta.mp4",
          },
        ],
        "version": 1,
      }
    `);
  });

  it('returns structured validation issues for invalid input', () => {
    expect(validateProject({
      ...fixtureProject,
      sources: [],
      analysisRefs: [],
      sequence: {
        ...fixtureProject.sequence,
        items: [
          {
            ...fixtureProject.sequence.items[0],
            sourceId: 'missing-source'
          }
        ]
      }
    })).toEqual({
      ok: false,
      errors: [
        {
          keyword: 'missing-reference',
          message: 'Sequence item "segment-intro" references missing source "missing-source".',
          path: 'sequence.items.segment-intro.sourceId',
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
      errors: [
        {
          keyword: 'required',
          message: "must have required property 'family'",
          path: '/',
          source: 'schema'
        }
      ]
    });
  });

  it('parses standalone analysis and midi sidecars', () => {
    expect(parseAnalysis(fixtureAnalysis).summary?.sceneCount).toBe(2);
    expect(parseMidiMapping(fixtureMidiMapping).bindings[0].id).toBe('binding-cut-trigger');
  });
});
