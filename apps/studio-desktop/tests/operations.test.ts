import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@afterimage/project-model';
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
  setClipTransition,
  setClipTransitionAsset,
  setClipTransitionOverlayAsset
} from '../src/operations/sequence-ops';
import { addAutomationLane, addLaneKeyframe, updateAutomationLaneTarget } from '../src/operations/automation-ops';
import { mergeImportedAssets, toggleExportProfile } from '../src/operations/project-ops';
import { addFilterToStack, applyPresetToStack, safeRandomizeFilter, updateFilterParameter } from '../src/operations/style-ops';

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

describe('@afterimage/studio-desktop operations', () => {
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
});
