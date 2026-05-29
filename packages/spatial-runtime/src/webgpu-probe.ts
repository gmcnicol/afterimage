import type { SpatialRuntimeCapabilities, SpatialRuntimeDiagnostic } from '@afterimage/project-model';

export interface WebGpuSpatialRuntimeProbeEnvironment {
  navigator?: WebGpuNavigatorLike;
}

export interface WebGpuSpatialRuntimeProbeOptions {
  environment?: WebGpuSpatialRuntimeProbeEnvironment;
  adapterOptions?: unknown;
  probeDevice?: boolean;
  deviceDescriptor?: unknown;
  deviceLostTimeoutMs?: number;
}

export interface WebGpuSpatialRuntimeCapabilities {
  webgpuAvailable: boolean;
  adapterAvailable: boolean;
  deviceAvailable: boolean;
  adapterFeatures: string[];
  adapterLimits: Record<string, number>;
  deviceFeatures: string[];
  deviceLimits: Record<string, number>;
  capabilities: SpatialRuntimeCapabilities;
  diagnostics: SpatialRuntimeDiagnostic[];
}

interface WebGpuNavigatorLike {
  gpu?: WebGpuLike;
}

interface WebGpuLike {
  requestAdapter(options?: unknown): Promise<WebGpuAdapterLike | null>;
}

interface WebGpuAdapterLike {
  features?: Iterable<unknown>;
  limits?: Record<string, unknown>;
  requestDevice?(descriptor?: unknown): Promise<WebGpuDeviceLike>;
}

interface WebGpuDeviceLike {
  features?: Iterable<unknown>;
  limits?: Record<string, unknown>;
  lost?: Promise<WebGpuDeviceLostInfoLike>;
}

interface WebGpuDeviceLostInfoLike {
  reason?: string;
  message?: string;
}

const KNOWN_LIMIT_NAMES = [
  'maxTextureDimension1D',
  'maxTextureDimension2D',
  'maxTextureDimension3D',
  'maxTextureArrayLayers',
  'maxBindGroups',
  'maxBindingsPerBindGroup',
  'maxBufferSize',
  'maxStorageBufferBindingSize',
  'maxTextureBindingArrayElements',
  'maxStorageTexturesPerShaderStage',
  'maxComputeWorkgroupStorageSize',
  'maxComputeInvocationsPerWorkgroup',
  'maxComputeWorkgroupSizeX',
  'maxComputeWorkgroupSizeY',
  'maxComputeWorkgroupSizeZ',
  'maxComputeWorkgroupsPerDimension'
];

export async function probeWebGpuSpatialRuntimeCapabilities(
  options: WebGpuSpatialRuntimeProbeOptions = {}
): Promise<WebGpuSpatialRuntimeCapabilities> {
  const diagnostics: SpatialRuntimeDiagnostic[] = [];
  const navigatorLike = options.environment?.navigator ?? (globalThis.navigator as unknown as WebGpuNavigatorLike | undefined);
  const gpu = navigatorLike?.gpu;

  if (!gpu) {
    diagnostics.push({
      id: 'webgpu.navigator-gpu-missing',
      severity: 'warning',
      message: 'navigator.gpu is not available; spatial runtime will use CPU buffers.'
    });
    return createProbeResult({
      webgpuAvailable: false,
      adapterAvailable: false,
      diagnostics
    });
  }

  const adapter = await gpu.requestAdapter(options.adapterOptions);
  if (!adapter) {
    diagnostics.push({
      id: 'webgpu.adapter-unavailable',
      severity: 'warning',
      message: 'navigator.gpu is available, but no WebGPU adapter was returned; spatial runtime will use CPU buffers.'
    });
    return createProbeResult({
      webgpuAvailable: false,
      adapterAvailable: false,
      diagnostics
    });
  }

  const adapterFeatures = iterableToSortedStrings(adapter.features);
  const adapterLimits = limitsToRecord(adapter.limits);
  let deviceAvailable = false;
  let deviceFeatures: string[] = [];
  let deviceLimits: Record<string, number> = {};

  if (options.probeDevice) {
    if (!adapter.requestDevice) {
      diagnostics.push({
        id: 'webgpu.device-request-unavailable',
        severity: 'warning',
        message: 'WebGPU adapter does not expose requestDevice; device probing was skipped.'
      });
    } else {
      try {
        const device = await adapter.requestDevice(options.deviceDescriptor);
        deviceAvailable = true;
        deviceFeatures = iterableToSortedStrings(device.features);
        deviceLimits = limitsToRecord(device.limits);
        const lost = await probeDeviceLost(device, options.deviceLostTimeoutMs ?? 0);
        if (lost) {
          diagnostics.push({
            id: 'webgpu.device-lost',
            severity: 'error',
            message: `WebGPU device was reported lost${lost.reason ? ` (${lost.reason})` : ''}${lost.message ? `: ${lost.message}` : '.'}`
          });
        }
      } catch (error) {
        diagnostics.push({
          id: 'webgpu.device-request-failed',
          severity: 'error',
          message: `WebGPU adapter requestDevice failed: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
  }

  return createProbeResult({
    webgpuAvailable: true,
    adapterAvailable: true,
    deviceAvailable,
    adapterFeatures,
    adapterLimits,
    deviceFeatures,
    deviceLimits,
    diagnostics
  });
}

function createProbeResult(input: {
  webgpuAvailable: boolean;
  adapterAvailable: boolean;
  deviceAvailable?: boolean;
  adapterFeatures?: string[];
  adapterLimits?: Record<string, number>;
  deviceFeatures?: string[];
  deviceLimits?: Record<string, number>;
  diagnostics: SpatialRuntimeDiagnostic[];
}): WebGpuSpatialRuntimeCapabilities {
  const maxTextureDimension2D = input.adapterLimits?.maxTextureDimension2D;
  return {
    webgpuAvailable: input.webgpuAvailable,
    adapterAvailable: input.adapterAvailable,
    deviceAvailable: input.deviceAvailable ?? false,
    adapterFeatures: input.adapterFeatures ?? [],
    adapterLimits: input.adapterLimits ?? {},
    deviceFeatures: input.deviceFeatures ?? [],
    deviceLimits: input.deviceLimits ?? {},
    capabilities: {
      webgpuAvailable: input.webgpuAvailable,
      maxTextureDimension2D,
      supportedStoragePolicies: input.webgpuAvailable ? ['gpu-texture', 'cpu-buffer'] : ['cpu-buffer']
    },
    diagnostics: input.diagnostics
  };
}

function iterableToSortedStrings(values: Iterable<unknown> | undefined): string[] {
  if (!values) {
    return [];
  }
  return Array.from(values, (value) => String(value)).sort();
}

function limitsToRecord(limits: Record<string, unknown> | undefined): Record<string, number> {
  if (!limits) {
    return {};
  }

  const records: Record<string, number> = {};
  for (const limitName of KNOWN_LIMIT_NAMES) {
    const value = limits[limitName];
    if (typeof value === 'number') {
      records[limitName] = value;
    }
  }

  for (const [key, value] of Object.entries(limits)) {
    if (typeof value === 'number') {
      records[key] = value;
    }
  }

  return records;
}

async function probeDeviceLost(
  device: WebGpuDeviceLike,
  timeoutMs: number
): Promise<WebGpuDeviceLostInfoLike | undefined> {
  if (!device.lost) {
    return undefined;
  }

  const result = await Promise.race([
    device.lost.then((lost) => ({ status: 'lost' as const, lost })),
    new Promise<{ status: 'pending' }>((resolve) => {
      setTimeout(() => resolve({ status: 'pending' }), timeoutMs);
    })
  ]);

  return result.status === 'lost' ? result.lost : undefined;
}
