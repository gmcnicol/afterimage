import { BEHAVIOUR_RUNTIME_PROFILES } from './runtime-profiles.js';
import type { BehaviourRuntimeProfile, BehaviourRuntimeProfileId } from './runtime-profiles.js';
import type {
  SpatialFieldDefinition,
  SpatialFieldDimensions,
  SpatialFieldResolutionPolicy,
  SpatialFieldStoragePolicy
} from './types.js';

export type SpatialRuntimeDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface SpatialRuntimeDiagnostic {
  id: string;
  severity: SpatialRuntimeDiagnosticSeverity;
  fieldId?: string;
  message: string;
}

export interface SpatialRuntimeCapabilities {
  webgpuAvailable: boolean;
  maxTextureDimension2D?: number;
  supportedStoragePolicies?: SpatialFieldStoragePolicy[];
}

export interface SpatialRuntimePlanningInput {
  fields: SpatialFieldDefinition[];
  sourceDimensions: SpatialFieldDimensions;
  outputDimensions: SpatialFieldDimensions;
  profile?: BehaviourRuntimeProfile | BehaviourRuntimeProfileId;
  capabilities?: SpatialRuntimeCapabilities;
  bytesPerTexel?: number;
}

export interface PlannedSpatialField {
  fieldId: string;
  kind: SpatialFieldDefinition['kind'];
  dimensions: SpatialFieldDimensions;
  requestedStorage: SpatialFieldStoragePolicy;
  storage: SpatialFieldStoragePolicy;
  pingPong: boolean;
  bufferCount: number;
  historyWindowFrames: number;
  passCount: number;
  bytesPerBuffer: number;
  totalBytes: number;
  cpuFallback: boolean;
}

export interface SpatialRuntimePlan {
  profile: BehaviourRuntimeProfile;
  fields: PlannedSpatialField[];
  totalBytes: number;
  passCount: number;
  diagnostics: SpatialRuntimeDiagnostic[];
}

export interface SpatialFieldRuntimeAdapter {
  id: string;
  capabilities: SpatialRuntimeCapabilities;
  plan(input: Omit<SpatialRuntimePlanningInput, 'capabilities'>): SpatialRuntimePlan;
}

const DEFAULT_CAPABILITIES: SpatialRuntimeCapabilities = {
  webgpuAvailable: false,
  supportedStoragePolicies: ['cpu-buffer']
};

function resolveProfile(profile: BehaviourRuntimeProfile | BehaviourRuntimeProfileId | undefined): BehaviourRuntimeProfile {
  return typeof profile === 'string'
    ? { ...BEHAVIOUR_RUNTIME_PROFILES[profile] }
    : { ...(profile ?? BEHAVIOUR_RUNTIME_PROFILES.studio) };
}

function scaledDimension(value: number, scale: number): number {
  return Math.max(1, Math.round(value * scale));
}

export function resolveSpatialFieldDimensions(
  resolution: SpatialFieldResolutionPolicy,
  sourceDimensions: SpatialFieldDimensions,
  outputDimensions: SpatialFieldDimensions,
  profile: BehaviourRuntimeProfile | BehaviourRuntimeProfileId = 'studio'
): SpatialFieldDimensions {
  const runtimeProfile = resolveProfile(profile);

  if (resolution.kind === 'fixed') {
    return {
      width: Math.max(1, Math.trunc(resolution.width ?? 1)),
      height: Math.max(1, Math.trunc(resolution.height ?? 1))
    };
  }

  const base = resolution.kind === 'source-sized' ? sourceDimensions : outputDimensions;
  const policyScale = resolution.kind === 'scaled' ? resolution.scale ?? 1 : 1;
  const scale = policyScale * runtimeProfile.fieldResolutionScale;

  return {
    width: scaledDimension(base.width, scale),
    height: scaledDimension(base.height, scale)
  };
}

interface SpatialRuntimeBufferPlan {
  pingPong: boolean;
  bufferCount: number;
  historyWindowFrames: number;
  passCount: number;
}

function resolveBufferPlan(
  field: SpatialFieldDefinition,
  profile: BehaviourRuntimeProfile,
  diagnostics: SpatialRuntimeDiagnostic[]
): SpatialRuntimeBufferPlan {
  const access = field.access ?? 'read-write';
  const persistence = field.persistence;

  if (persistence?.previousFrameAccess === 'history-window') {
    const requestedWindowFrames = Math.max(1, Math.trunc(persistence.windowFrames ?? 2));
    const historyWindowFrames = Math.max(1, Math.min(requestedWindowFrames, profile.maxPassesPerFrame));

    if (historyWindowFrames < requestedWindowFrames) {
      diagnostics.push({
        id: `spatial-field.${field.id}.history-window-clamped`,
        severity: 'warning',
        fieldId: field.id,
        message: `Spatial field "${field.id}" requested ${requestedWindowFrames} history frames, but the ${profile.id} profile allows ${profile.maxPassesPerFrame}; using ${historyWindowFrames}.`
      });
    }

    return {
      pingPong: true,
      bufferCount: 1 + historyWindowFrames,
      historyWindowFrames,
      passCount: historyWindowFrames
    };
  }

  if (persistence?.previousFrameAccess === 'previous-frame') {
    return {
      pingPong: true,
      bufferCount: 2,
      historyWindowFrames: 1,
      passCount: 2
    };
  }

  const pingPong = access === 'read-write';
  return {
    pingPong,
    bufferCount: pingPong ? 2 : 1,
    historyWindowFrames: 0,
    passCount: pingPong ? 2 : 1
  };
}

function resolveStorage(
  field: SpatialFieldDefinition,
  dimensions: SpatialFieldDimensions,
  capabilities: SpatialRuntimeCapabilities,
  diagnostics: SpatialRuntimeDiagnostic[]
): { storage: SpatialFieldStoragePolicy; cpuFallback: boolean } {
  const requestedStorage = field.storage ?? 'gpu-texture';
  const supportedStoragePolicies = capabilities.supportedStoragePolicies ?? ['gpu-texture', 'cpu-buffer'];

  if (requestedStorage === 'cpu-buffer') {
    return { storage: 'cpu-buffer', cpuFallback: false };
  }

  if (!capabilities.webgpuAvailable) {
    diagnostics.push({
      id: `spatial-field.${field.id}.gpu-unavailable`,
      severity: 'warning',
      fieldId: field.id,
      message: `Spatial field "${field.id}" requested GPU texture storage, but WebGPU is unavailable; using CPU buffer fallback.`
    });
    return { storage: 'cpu-buffer', cpuFallback: true };
  }

  if (!supportedStoragePolicies.includes('gpu-texture')) {
    diagnostics.push({
      id: `spatial-field.${field.id}.gpu-storage-unsupported`,
      severity: 'warning',
      fieldId: field.id,
      message: `Spatial field "${field.id}" requested GPU texture storage, but the runtime does not advertise it; using CPU buffer fallback.`
    });
    return { storage: 'cpu-buffer', cpuFallback: true };
  }

  const maxDimension = capabilities.maxTextureDimension2D;
  if (maxDimension !== undefined && (dimensions.width > maxDimension || dimensions.height > maxDimension)) {
    diagnostics.push({
      id: `spatial-field.${field.id}.texture-dimension-exceeded`,
      severity: 'warning',
      fieldId: field.id,
      message: `Spatial field "${field.id}" exceeds the runtime texture dimension limit; using CPU buffer fallback.`
    });
    return { storage: 'cpu-buffer', cpuFallback: true };
  }

  return { storage: 'gpu-texture', cpuFallback: false };
}

export function planSpatialRuntime(input: SpatialRuntimePlanningInput): SpatialRuntimePlan {
  const profile = resolveProfile(input.profile);
  const capabilities = input.capabilities ?? DEFAULT_CAPABILITIES;
  const bytesPerTexel = input.bytesPerTexel ?? 4;
  const diagnostics: SpatialRuntimeDiagnostic[] = [];
  const fields = input.fields.map((field): PlannedSpatialField => {
    const dimensions = resolveSpatialFieldDimensions(field.resolution, input.sourceDimensions, input.outputDimensions, profile);
    const requestedStorage = field.storage ?? 'gpu-texture';
    const bufferPlan = resolveBufferPlan(field, profile, diagnostics);
    const bytesPerBuffer = dimensions.width * dimensions.height * bytesPerTexel;
    const totalBytes = bytesPerBuffer * bufferPlan.bufferCount;
    const storage = resolveStorage(field, dimensions, capabilities, diagnostics);

    return {
      fieldId: field.id,
      kind: field.kind,
      dimensions,
      requestedStorage,
      storage: storage.storage,
      pingPong: bufferPlan.pingPong,
      bufferCount: bufferPlan.bufferCount,
      historyWindowFrames: bufferPlan.historyWindowFrames,
      passCount: bufferPlan.passCount,
      bytesPerBuffer,
      totalBytes,
      cpuFallback: storage.cpuFallback
    };
  });
  const totalBytes = fields.reduce((sum, field) => sum + field.totalBytes, 0);
  const passCount = fields.reduce((sum, field) => sum + field.passCount, 0);

  if (totalBytes > profile.memoryBudgetBytes) {
    diagnostics.push({
      id: `spatial-runtime.${profile.id}.memory-budget-exceeded`,
      severity: 'warning',
      message: `Spatial runtime plan uses ${totalBytes} bytes, exceeding the ${profile.id} profile budget of ${profile.memoryBudgetBytes} bytes.`
    });
  }

  if (passCount > profile.maxPassesPerFrame) {
    diagnostics.push({
      id: `spatial-runtime.${profile.id}.pass-budget-exceeded`,
      severity: profile.id === 'render' ? 'warning' : 'error',
      message: `Spatial runtime plan requires ${passCount} passes per frame, exceeding the ${profile.id} profile limit of ${profile.maxPassesPerFrame}.`
    });
  }

  return {
    profile,
    fields,
    totalBytes,
    passCount,
    diagnostics
  };
}
