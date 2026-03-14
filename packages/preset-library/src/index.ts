import type { Preset, PresetFamily } from '@afterimage/project-model';
import { parsePreset } from '@afterimage/schema-validators';

export interface PresetLibrary {
  presets: Preset[];
  byId: Record<string, Preset>;
  byFamily: Record<PresetFamily, Preset[]>;
}

const starterPresetDefinitions = [
  {
    id: 'preset-vhs-rental-tape',
    name: 'Rental Tape',
    family: 'vhs',
    filters: [
      { type: 'blur', amount: 0.32 },
      { type: 'chroma-bleed', amount: 0.25 }
    ]
  },
  {
    id: 'preset-liminal-fluorescent-dream',
    name: 'Fluorescent Dream',
    family: 'liminal',
    filters: [
      { type: 'brightness', amount: 0.56 },
      { type: 'blur', amount: 0.18 }
    ]
  },
  {
    id: 'preset-imagined-futures-afterburn',
    name: 'Afterburn',
    family: 'imagined-futures',
    filters: [
      { type: 'contrast', amount: 0.28 },
      { type: 'bloom-soft', amount: 0.24 }
    ]
  },
  {
    id: 'preset-glitch-overclock',
    name: 'Overclock',
    family: 'glitch',
    filters: [
      { type: 'glitch-bands', amount: 0.22 },
      { type: 'chroma-bleed', amount: 0.18 }
    ]
  }
] as const satisfies readonly Preset[];

export const starterPresets = starterPresetDefinitions.map((preset) => parsePreset(preset));

function createEmptyFamilyIndex(): Record<PresetFamily, Preset[]> {
  return {
    vhs: [],
    liminal: [],
    'imagined-futures': [],
    glitch: []
  };
}

export function loadPresetLibrary(input: readonly Preset[] = starterPresets): PresetLibrary {
  const presets = [...input].map((preset) => parsePreset(preset)).sort((left, right) => left.id.localeCompare(right.id));
  const byId: Record<string, Preset> = {};
  const byFamily = createEmptyFamilyIndex();

  for (const preset of presets) {
    byId[preset.id] = preset;
    byFamily[preset.family].push(preset);
  }

  return {
    presets,
    byId,
    byFamily
  };
}

export function getPresetById(library: PresetLibrary, presetId: string): Preset | undefined {
  return library.byId[presetId];
}
