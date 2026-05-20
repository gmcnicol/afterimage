import type {
  AutomationTargetProperty,
  FilterDefinition,
  FilterInstance,
  JsonPrimitive,
  PresetFilter,
  SupportedFilterType
} from './types.js';

const SUPPORTED_FILTER_DEFINITIONS = [
  {
    type: 'contrast',
    label: 'Contrast',
    ffmpegGroup: 'eq',
    parameters: [
      {
        key: 'contrast',
        label: 'Contrast',
        min: 0,
        max: 1,
        defaultValue: 0.35,
        step: 0.01
      }
    ]
  },
  {
    type: 'brightness',
    label: 'Brightness',
    ffmpegGroup: 'eq',
    parameters: [
      {
        key: 'brightness',
        label: 'Brightness',
        min: 0,
        max: 1,
        defaultValue: 0.6,
        step: 0.01
      }
    ]
  },
  {
    type: 'blur',
    label: 'Blur',
    ffmpegGroup: 'gblur',
    parameters: [
      {
        key: 'radius',
        label: 'Radius',
        min: 0,
        max: 1,
        defaultValue: 0.24,
        step: 0.01
      }
    ]
  },
  {
    type: 'bloom-soft',
    label: 'Bloom Soft',
    ffmpegGroup: 'gblur',
    parameters: [
      {
        key: 'strength',
        label: 'Strength',
        min: 0,
        max: 1,
        defaultValue: 0.28,
        step: 0.01
      }
    ]
  },
  {
    type: 'glitch-bands',
    label: 'Signal Breakup',
    ffmpegGroup: 'noise',
    parameters: [
      {
        key: 'strength',
        label: 'Breakup',
        min: 0,
        max: 1,
        defaultValue: 0.45,
        step: 0.01
      }
    ]
  },
  {
    type: 'chroma-bleed',
    label: 'Chroma Bleed',
    ffmpegGroup: 'eq',
    parameters: [
      {
        key: 'strength',
        label: 'Strength',
        min: 0,
        max: 1,
        defaultValue: 0.25,
        step: 0.01
      }
    ]
  }
] as const satisfies readonly FilterDefinition[];

export const supportedFilterDefinitions = SUPPORTED_FILTER_DEFINITIONS;
export const supportedFilterTypes = SUPPORTED_FILTER_DEFINITIONS.map((definition) => definition.type);

export function isSupportedFilterType(value: string): value is SupportedFilterType {
  return supportedFilterTypes.includes(value as SupportedFilterType);
}

export function getFilterDefinition(type: string): FilterDefinition | undefined {
  return SUPPORTED_FILTER_DEFINITIONS.find((definition) => definition.type === type);
}

export function getDefaultFilterParameters(type: SupportedFilterType): Record<Exclude<AutomationTargetProperty, 'mix'>, JsonPrimitive> {
  const definition = getFilterDefinition(type);
  return Object.fromEntries(
    (definition?.parameters ?? []).map((parameter) => [parameter.key, parameter.defaultValue])
  ) as Record<Exclude<AutomationTargetProperty, 'mix'>, JsonPrimitive>;
}

export function getSupportedAutomationProperties(type: string): AutomationTargetProperty[] {
  const definition = getFilterDefinition(type);
  return definition ? ['mix', ...definition.parameters.map((parameter) => parameter.key)] : [];
}

export function getFilterParameterValue(filter: FilterInstance | PresetFilter, property: Exclude<AutomationTargetProperty, 'mix'>): number | undefined {
  if ('amount' in filter) {
    return property === getPrimaryAutomationProperty(filter.type) ? filter.amount : undefined;
  }

  const value = filter.parameters?.[property];
  return typeof value === 'number' ? value : undefined;
}

export function getPrimaryAutomationProperty(type: string): Exclude<AutomationTargetProperty, 'mix'> | undefined {
  return getFilterDefinition(type)?.parameters[0]?.key;
}
