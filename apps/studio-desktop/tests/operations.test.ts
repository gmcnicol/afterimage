import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@afterimage/project-model';
import { addCutToSequence, duplicateVariant, moveClip } from '../src/operations/sequence-ops';
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
