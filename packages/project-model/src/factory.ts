import { normalizeProject } from './normalization.js';
import { CURRENT_PROJECT_VERSION } from './types.js';
import type { NormalizedProjectFile, RuntimeMode } from './types.js';
import { slugify } from './utils.js';

export function createEmptyProject(input: {
  id: string;
  name: string;
  mode?: RuntimeMode;
  description?: string;
}): NormalizedProjectFile {
  const timestamp = new Date().toISOString();

  return normalizeProject({
    id: input.id,
    name: input.name,
    mode: input.mode ?? 'studio',
    version: CURRENT_PROJECT_VERSION,
    description: input.description,
    metadata: {
      createdAt: timestamp,
      updatedAt: timestamp,
      projectFileName: `${slugify(input.name) || 'afterimage-project'}.afterimage.json`,
      currentProfileSet: 'default'
    },
    assets: [],
    presets: [],
    sequences: [
      {
        id: 'sequence-main',
        name: 'Main Sequence',
        variantIds: ['variant-main'],
        defaultVariantId: 'variant-main',
        favorite: true
      }
    ],
    variants: [
      {
        id: 'variant-main',
        sequenceId: 'sequence-main',
        name: 'Sequence 001',
        clips: [],
        markers: [],
        sections: [],
        stackId: 'stack-sequence-main',
        favorite: true,
        assistedGeneration: {
          strategy: 'manual'
        }
      }
    ],
    analysisRefs: [],
    cutCandidates: [],
    bins: [],
    filterStacks: [
      {
        id: 'stack-sequence-main',
        name: 'Sequence Stack',
        scope: 'sequence',
        filters: []
      }
    ],
    automationLanes: [],
    midiMappings: [],
    exportSelections: [
      { profileId: 'landscape-master', enabled: true, overwriteExisting: true },
      { profileId: 'portrait-short-form', enabled: false, overwriteExisting: true },
      { profileId: 'square-social', enabled: false, overwriteExisting: true },
      { profileId: 'archive-master', enabled: false, overwriteExisting: true }
    ],
    defaultSequenceId: 'sequence-main',
    featureFlags: {},
    tags: []
  });
}
