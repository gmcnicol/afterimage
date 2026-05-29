import type { SpatialFieldDimensions } from './types.js';

export type BehaviourRuntimeProfileId = 'draft' | 'live' | 'studio' | 'render';
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

export const BEHAVIOUR_RUNTIME_PROFILES: Record<BehaviourRuntimeProfileId, BehaviourRuntimeProfile> = {
  draft: {
    id: 'draft',
    label: 'Draft',
    fieldResolutionScale: 0.5,
    fpsTarget: 30,
    memoryBudgetBytes: 128 * 1024 * 1024,
    maxPassesPerFrame: 4,
    fallbackPolicy: 'cpu-first',
    behaviourCostClass: 'low'
  },
  live: {
    id: 'live',
    label: 'Live',
    fieldResolutionScale: 0.75,
    fpsTarget: 60,
    memoryBudgetBytes: 256 * 1024 * 1024,
    maxPassesPerFrame: 6,
    fallbackPolicy: 'gpu-preferred',
    behaviourCostClass: 'interactive'
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    fieldResolutionScale: 1,
    fpsTarget: 30,
    memoryBudgetBytes: 512 * 1024 * 1024,
    maxPassesPerFrame: 8,
    fallbackPolicy: 'cpu-allowed',
    behaviourCostClass: 'balanced'
  },
  render: {
    id: 'render',
    label: 'Render',
    fieldResolutionScale: 1,
    fpsTarget: 24,
    memoryBudgetBytes: 1024 * 1024 * 1024,
    maxPassesPerFrame: 16,
    fallbackPolicy: 'gpu-required',
    behaviourCostClass: 'offline'
  }
};

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
