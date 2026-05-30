export interface AtmosphereOption {
  value: string;
  label: string;
}

export const defaultAtmosphere = 'default';

export const atmosphereOptions: AtmosphereOption[] = [
  { value: defaultAtmosphere, label: 'Default' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'clear', label: 'Clear' },
  { value: 'liminal', label: 'Liminal' },
  { value: 'dense', label: 'Dense' },
  { value: 'fragile', label: 'Fragile' },
  { value: 'volatile', label: 'Volatile' },
  { value: 'nocturnal', label: 'Nocturnal' },
  { value: 'washed', label: 'Washed' },
  { value: 'clinical', label: 'Clinical' },
  { value: 'ritual', label: 'Ritual' },
  { value: 'archival', label: 'Archival' },
  { value: 'thermal drift', label: 'Thermal drift' }
];

export function getAtmosphereValue(value: string | undefined): string {
  return value && value.trim().length > 0 ? value : defaultAtmosphere;
}

export function getAtmosphereSelectOptions(value: string | undefined): AtmosphereOption[] {
  const resolvedValue = getAtmosphereValue(value);
  if (atmosphereOptions.some((option) => option.value === resolvedValue)) {
    return atmosphereOptions;
  }

  return [{ value: resolvedValue, label: resolvedValue }, ...atmosphereOptions];
}
