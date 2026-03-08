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
      { type: 'tracking-wobble', amount: 0.35 },
      { type: 'chroma-bleed', amount: 0.25 }
    ]
  },
  {
    id: 'preset-liminal-fluorescent-dream',
    name: 'Fluorescent Dream',
    family: 'liminal',
    filters: [
      { type: 'fluorescent-flicker', amount: 0.2 },
      { type: 'desaturation-lfo', amount: 0.4 }
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
