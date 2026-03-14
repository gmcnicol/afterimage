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

  it('silently upgrades stale style contracts in current-shape project files', () => {
    const migrated = parseProject({
      ...fixtureProject,
      version: 2,
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
  });

  it('parses standalone analysis and midi sidecars', () => {
    expect(parseAnalysis(fixtureAnalysis).summary?.thumbnailCount).toBe(2);
    expect(parseMidiMapping(fixtureMidiMapping).bindings[0].id).toBe('binding-cut-trigger');
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
