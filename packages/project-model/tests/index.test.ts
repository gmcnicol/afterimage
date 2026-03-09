import { describe, expect, it } from 'vitest';
import { fixtureProject } from '../../test-fixtures/src';
import {
  collectProjectIntegrityIssues,
  createEmptyProject,
  getAssetById,
  getDefaultVariant,
  normalizeProject,
  resolveProjectPathCandidates
} from '../src';

describe('@afterimage/project-model', () => {
  it('normalizes the phase 2 hybrid project deterministically', () => {
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
});
