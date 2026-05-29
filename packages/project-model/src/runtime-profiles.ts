import type {
  RuntimeCostClass,
  RuntimeFallbackPreference,
  RuntimeFieldScalePreset,
  RuntimePerformanceProfile,
  RuntimePerformanceProfileKind,
  SpatialFieldDimensions
} from './types.js';

export type BehaviourRuntimeProfileId = RuntimePerformanceProfileKind;
export type RuntimeFallbackPolicy = 'cpu-first' | 'cpu-allowed' | 'gpu-preferred' | 'gpu-required';
export type BehaviourCostClass = 'low' | 'interactive' | 'balanced' | 'offline';

export interface BehaviourRuntimeProfile {
  id: BehaviourRuntimeProfileId;
  label: string;
  fieldResolutionScale: number;
  fpsTarget: number;
  memoryBudgetBytes: number;
  maxPassesPerFrame: number;
  fallbackPolicy: RuntimeFallbackPolicy;
  behaviourCostClass: BehaviourCostClass;
}

interface RuntimeProfileDefinition extends BehaviourRuntimeProfile {
  fieldScalePreset: RuntimeFieldScalePreset;
  fallbackPreference: RuntimeFallbackPreference;
  maxCostClass: RuntimeCostClass;
}

export const RUNTIME_PROFILE_DEFINITIONS: Record<BehaviourRuntimeProfileId, RuntimeProfileDefinition> = {
  draft: {
    id: 'draft',
    label: 'Draft',
    fieldResolutionScale: 0.5,
    fpsTarget: 30,
    memoryBudgetBytes: 128 * 1024 * 1024,
    maxPassesPerFrame: 4,
    fallbackPolicy: 'cpu-first',
    behaviourCostClass: 'low',
    fieldScalePreset: 'half',
    fallbackPreference: 'degrade-quality',
    maxCostClass: 'moderate'
  },
  live: {
    id: 'live',
    label: 'Live',
    fieldResolutionScale: 0.75,
    fpsTarget: 60,
    memoryBudgetBytes: 256 * 1024 * 1024,
    maxPassesPerFrame: 6,
    fallbackPolicy: 'gpu-preferred',
    behaviourCostClass: 'interactive',
    fieldScalePreset: 'three-quarter',
    fallbackPreference: 'disable-expensive',
    maxCostClass: 'moderate'
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    fieldResolutionScale: 1,
    fpsTarget: 30,
    memoryBudgetBytes: 512 * 1024 * 1024,
    maxPassesPerFrame: 8,
    fallbackPolicy: 'cpu-allowed',
    behaviourCostClass: 'balanced',
    fieldScalePreset: 'full',
    fallbackPreference: 'preserve-output',
    maxCostClass: 'expensive'
  },
  render: {
    id: 'render',
    label: 'Render',
    fieldResolutionScale: 1,
    fpsTarget: 24,
    memoryBudgetBytes: 1024 * 1024 * 1024,
    maxPassesPerFrame: 16,
    fallbackPolicy: 'gpu-required',
    behaviourCostClass: 'offline',
    fieldScalePreset: 'source',
    fallbackPreference: 'fail-fast',
    maxCostClass: 'dangerous'
  }
};

export const BEHAVIOUR_RUNTIME_PROFILES: Record<BehaviourRuntimeProfileId, BehaviourRuntimeProfile> = {
  draft: toBehaviourRuntimeProfile(RUNTIME_PROFILE_DEFINITIONS.draft),
  live: toBehaviourRuntimeProfile(RUNTIME_PROFILE_DEFINITIONS.live),
  studio: toBehaviourRuntimeProfile(RUNTIME_PROFILE_DEFINITIONS.studio),
  render: toBehaviourRuntimeProfile(RUNTIME_PROFILE_DEFINITIONS.render)
};

function toBehaviourRuntimeProfile(definition: RuntimeProfileDefinition): BehaviourRuntimeProfile {
  return {
    id: definition.id,
    label: definition.label,
    fieldResolutionScale: definition.fieldResolutionScale,
    fpsTarget: definition.fpsTarget,
    memoryBudgetBytes: definition.memoryBudgetBytes,
    maxPassesPerFrame: definition.maxPassesPerFrame,
    fallbackPolicy: definition.fallbackPolicy,
    behaviourCostClass: definition.behaviourCostClass
  };
}

export function toRuntimePerformanceProfile(definition: RuntimeProfileDefinition): RuntimePerformanceProfile {
  return {
    id: `runtime-profile-${definition.id}`,
    kind: definition.id,
    label: definition.label,
    fieldScalePreset: definition.fieldScalePreset,
    targetFps: definition.fpsTarget,
    memoryBudgetMb: Math.max(1, Math.trunc(definition.memoryBudgetBytes / (1024 * 1024))),
    maxPasses: definition.maxPassesPerFrame,
    fallbackPreference: definition.fallbackPreference,
    maxCostClass: definition.maxCostClass
  };
}

export function createDefaultRuntimePerformanceProfiles(): RuntimePerformanceProfile[] {
  return [
    toRuntimePerformanceProfile(RUNTIME_PROFILE_DEFINITIONS.draft),
    toRuntimePerformanceProfile(RUNTIME_PROFILE_DEFINITIONS.live),
    toRuntimePerformanceProfile(RUNTIME_PROFILE_DEFINITIONS.studio),
    toRuntimePerformanceProfile(RUNTIME_PROFILE_DEFINITIONS.render)
  ];
}

export function getBehaviourRuntimeProfile(profileId: BehaviourRuntimeProfileId): BehaviourRuntimeProfile {
  return { ...BEHAVIOUR_RUNTIME_PROFILES[profileId] };
}

export function resolveRuntimeScaledDimensions(
  dimensions: SpatialFieldDimensions,
  profile: BehaviourRuntimeProfile | BehaviourRuntimeProfileId
): SpatialFieldDimensions {
  const resolvedProfile = typeof profile === 'string' ? BEHAVIOUR_RUNTIME_PROFILES[profile] : profile;
  const scale = resolvedProfile.fieldResolutionScale;

  return {
    width: Math.max(1, Math.round(dimensions.width * scale)),
    height: Math.max(1, Math.round(dimensions.height * scale))
  };
}
