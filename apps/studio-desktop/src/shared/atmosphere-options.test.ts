import { describe, expect, it } from 'vitest';
import { defaultAtmosphere, getAtmosphereSelectOptions, getAtmosphereValue } from './atmosphere-options';

describe('atmosphere options', () => {
  it('uses the normalized project default when a scene has no atmosphere value', () => {
    expect(getAtmosphereValue(undefined)).toBe(defaultAtmosphere);
    expect(getAtmosphereSelectOptions(undefined)[0]).toEqual({ value: defaultAtmosphere, label: 'Default' });
  });

  it('preserves existing custom atmosphere values as selectable options', () => {
    expect(getAtmosphereSelectOptions('storm memory')[0]).toEqual({ value: 'storm memory', label: 'storm memory' });
  });
});
