import { describe, expect, it } from 'vitest';
import { fixtureAnalysis, fixtureMidiMapping, fixtureProject } from '../../test-fixtures/src';
import { parseAnalysis, parseMidiMapping, parseProject, validatePreset, validateProject } from '../src';

describe('@afterimage/schema-validators', () => {
  it('parses the v2 canonical project and applies defaults', () => {
    const parsed = parseProject({
      ...fixtureProject,
      featureFlags: undefined,
      tags: undefined,
      exportSelections: undefined
    });

    expect(parsed.version).toBe(2);
    expect(parsed.featureFlags.proxyGeneration).toBe(false);
    expect(parsed.exportSelections).toEqual([]);
    expect(parsed.tags).toEqual([]);
  });

  it('migrates a phase 1 project shape into the v2 canonical project', () => {
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
  });

  it('parses standalone analysis and midi sidecars', () => {
    expect(parseAnalysis(fixtureAnalysis).summary?.thumbnailCount).toBe(2);
    expect(parseMidiMapping(fixtureMidiMapping).bindings[0].id).toBe('binding-cut-trigger');
  });
});
