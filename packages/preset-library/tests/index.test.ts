import { describe, expect, it } from 'vitest';
import { getPresetById, loadPresetLibrary, starterPresets } from '../src';

describe('@afterimage/preset-library', () => {
  it('loads a validated data-first preset registry across the required families', () => {
    const library = loadPresetLibrary(starterPresets);

    expect(library.presets.map((preset) => preset.id)).toEqual([
      'preset-glitch-overclock',
      'preset-imagined-futures-afterburn',
      'preset-liminal-fluorescent-dream',
      'preset-vhs-rental-tape'
    ]);
    expect(getPresetById(library, 'preset-vhs-rental-tape')?.filters).toHaveLength(2);
    expect(library.byFamily.vhs).toHaveLength(1);
    expect(library.byFamily['imagined-futures']).toHaveLength(1);
    expect(library.byFamily.glitch).toHaveLength(1);
  });
});
