import type {
  SpatialFieldRuntimeDiagnostic,
  SpatialFieldRuntimePlan,
  SpatialFieldRuntimeReport
} from '@afterimage/project-model';
import type { PreviewDeviceDiagnostics, PreviewRuntimeDiagnostics } from './types.js';

export interface FieldTextureDescriptor {
  fieldId: string;
  currentFrameId: string;
  previousFrameId?: string;
  descriptor: FieldGpuTextureDescriptor;
  estimatedBytes: number;
  bufferIndex: number;
}

export interface FieldTextureAllocation {
  descriptor: FieldTextureDescriptor;
  texture?: FieldGpuTexture;
}

export interface WebGpuFieldRuntimeResult {
  mode: 'webgpu' | 'cpu-fallback';
  reports: SpatialFieldRuntimeReport[];
  descriptors: FieldTextureDescriptor[];
  allocations: FieldTextureAllocation[];
  diagnostics: SpatialFieldRuntimeDiagnostic[];
  runtimeDiagnostics: PreviewRuntimeDiagnostics;
  deviceDiagnostics?: PreviewDeviceDiagnostics;
}

export interface NegotiateWebGpuFieldRuntimeOptions {
  gpu?: FieldGpu;
  adapterOptions?: Record<string, unknown>;
  deviceDescriptor?: Record<string, unknown>;
  textureFormat?: string;
  usage?: number;
  observeDeviceLostTimeoutMs?: number;
  allocateTextures?: boolean;
}

export interface FieldGpuTextureSize {
  width: number;
  height: number;
  depthOrArrayLayers?: number;
}

export interface FieldGpuTextureDescriptor {
  label?: string;
  size: FieldGpuTextureSize;
  format: string;
  usage: number;
}

export interface FieldGpuTexture {
  label?: string;
  destroy?: () => void;
}

export interface FieldGpuLostInfo {
  message: string;
  reason?: string;
}

export interface FieldGpuError {
  message: string;
}

export interface FieldGpuAdapter {
  features: Iterable<string>;
  limits?: Record<string, number>;
  info?: unknown;
  requestDevice: (descriptor?: Record<string, unknown>) => Promise<FieldGpuDevice>;
}

export interface FieldGpuDevice {
  limits?: Record<string, number>;
  lost: Promise<FieldGpuLostInfo>;
  pushErrorScope: (filter: 'out-of-memory' | 'validation') => void;
  popErrorScope: () => Promise<FieldGpuError | null>;
  createTexture: (descriptor: FieldGpuTextureDescriptor) => FieldGpuTexture;
}

export interface FieldGpu {
  requestAdapter: (options?: Record<string, unknown>) => Promise<FieldGpuAdapter | null>;
}

const DEFAULT_TEXTURE_USAGE = 1 | 2 | 4 | 8;

function runtimeDiagnostic(
  code: string,
  severity: SpatialFieldRuntimeDiagnostic['severity'],
  message: string,
  fieldId?: string
): SpatialFieldRuntimeDiagnostic {
  return {
    id: ['diagnostic', 'field-runtime', code, fieldId].filter(Boolean).join(':'),
    code,
    severity,
    message,
    fieldId
  };
}

function numericLimits(limits: Record<string, number> | undefined): Record<string, number> {
  if (!limits) {
    return {};
  }

  const knownKeys = [
    'maxTextureDimension1D',
    'maxTextureDimension2D',
    'maxTextureDimension3D',
    'maxTextureArrayLayers',
    'maxBindGroups',
    'maxStorageBuffersPerShaderStage',
    'maxStorageTexturesPerShaderStage',
    'maxTextureDimension2D'
  ];

  return Object.fromEntries(knownKeys
    .map((key) => [key, limits[key]] as const)
    .filter((entry): entry is readonly [string, number] => typeof entry[1] === 'number'));
}

function adapterMetadata(adapter: FieldGpuAdapter | undefined): Record<string, unknown> | undefined {
  if (!adapter) {
    return undefined;
  }

  return adapter.info ? { adapterInfo: adapter.info } : undefined;
}

async function collectDeviceDiagnostics(
  adapter: FieldGpuAdapter,
  device: FieldGpuDevice,
  timeoutMs: number
): Promise<PreviewDeviceDiagnostics> {
  const lostInfo = await Promise.race([
    device.lost.then((info) => info),
    new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), timeoutMs);
    })
  ]);

  const features = [...adapter.features].sort();
  const limits = {
    ...numericLimits(adapter.limits),
    ...numericLimits(device.limits)
  };

  return {
    features,
    limits,
    lost: Boolean(lostInfo),
    diagnostics: lostInfo ? [`WebGPU device lost: ${lostInfo.message}`] : [],
    metadata: adapterMetadata(adapter)
  };
}

export function createFieldTextureDescriptors(
  plan: SpatialFieldRuntimePlan,
  options: Pick<NegotiateWebGpuFieldRuntimeOptions, 'textureFormat' | 'usage'> = {}
): FieldTextureDescriptor[] {
  const textureFormat = options.textureFormat ?? 'rgba8unorm';
  const usage = options.usage ?? DEFAULT_TEXTURE_USAGE;

  return plan.reports
    .filter((report) => report.storageMode === 'gpu-texture')
    .flatMap((report) => Array.from({ length: report.bufferCount }, (_, bufferIndex): FieldTextureDescriptor => ({
      fieldId: report.fieldId,
      currentFrameId: report.currentFrameId,
      previousFrameId: report.previousFrameId,
      estimatedBytes: Math.ceil(report.estimatedBytes / report.bufferCount),
      bufferIndex,
      descriptor: {
        label: `afterimage:${report.fieldId}:${bufferIndex}`,
        size: {
          width: report.dimensions.width,
          height: report.dimensions.height,
          depthOrArrayLayers: 1
        },
        format: textureFormat,
        usage
      }
    })));
}

function textureExceedsDeviceLimits(descriptor: FieldTextureDescriptor, limits: Record<string, number>): boolean {
  const maxTextureDimension2D = limits.maxTextureDimension2D;
  const size = descriptor.descriptor.size;

  return typeof maxTextureDimension2D === 'number'
    && (size.width > maxTextureDimension2D || size.height > maxTextureDimension2D);
}

async function allocateFieldTexture(
  device: FieldGpuDevice,
  descriptor: FieldTextureDescriptor
): Promise<{ allocation?: FieldTextureAllocation; diagnostics: SpatialFieldRuntimeDiagnostic[] }> {
  const diagnostics: SpatialFieldRuntimeDiagnostic[] = [];

  device.pushErrorScope('out-of-memory');
  device.pushErrorScope('validation');
  let texture: FieldGpuTexture | undefined;
  try {
    texture = device.createTexture(descriptor.descriptor);
  } catch (error) {
    diagnostics.push(runtimeDiagnostic(
      'field-runtime-texture-allocation-failed',
      'error',
      error instanceof Error ? error.message : String(error),
      descriptor.fieldId
    ));
  }

  const validationError = await device.popErrorScope();
  const memoryError = await device.popErrorScope();

  if (validationError) {
    diagnostics.push(runtimeDiagnostic(
      'field-runtime-webgpu-validation-error',
      'error',
      validationError.message,
      descriptor.fieldId
    ));
  }
  if (memoryError) {
    diagnostics.push(runtimeDiagnostic(
      'field-runtime-webgpu-out-of-memory',
      'error',
      memoryError.message,
      descriptor.fieldId
    ));
  }

  return {
    allocation: texture ? { descriptor, texture } : undefined,
    diagnostics
  };
}

export async function negotiateWebGpuFieldRuntime(
  plan: SpatialFieldRuntimePlan,
  options: NegotiateWebGpuFieldRuntimeOptions = {}
): Promise<WebGpuFieldRuntimeResult> {
  const gpu = options.gpu ?? (globalThis.navigator as Navigator & { gpu?: FieldGpu } | undefined)?.gpu;
  const baseDiagnostics = [...plan.diagnostics];

  if (!gpu) {
    return {
      mode: 'cpu-fallback',
      reports: plan.reports,
      descriptors: [],
      allocations: [],
      diagnostics: [
        ...baseDiagnostics,
        runtimeDiagnostic(
          'field-runtime-webgpu-unavailable',
          'warning',
          'navigator.gpu is not available; spatial fields will use CPU fallback diagnostics.'
        )
      ],
      runtimeDiagnostics: {
        environment: typeof window === 'undefined' ? 'node' : 'browser',
        renderer: 'webgpu',
        available: false,
        diagnostics: ['navigator.gpu is not available']
      }
    };
  }

  const adapter = await gpu.requestAdapter(options.adapterOptions);
  if (!adapter) {
    return {
      mode: 'cpu-fallback',
      reports: plan.reports,
      descriptors: [],
      allocations: [],
      diagnostics: [
        ...baseDiagnostics,
        runtimeDiagnostic(
          'field-runtime-webgpu-adapter-unavailable',
          'warning',
          'WebGPU is available, but no adapter was selected; spatial fields will use CPU fallback diagnostics.'
        )
      ],
      runtimeDiagnostics: {
        environment: typeof window === 'undefined' ? 'node' : 'browser',
        renderer: 'webgpu',
        available: false,
        diagnostics: ['navigator.gpu is available but no adapter was selected']
      },
      deviceDiagnostics: {
        lost: false,
        diagnostics: ['No adapter selected']
      }
    };
  }

  let device: FieldGpuDevice;
  try {
    device = await adapter.requestDevice(options.deviceDescriptor);
  } catch (error) {
    return {
      mode: 'cpu-fallback',
      reports: plan.reports,
      descriptors: [],
      allocations: [],
      diagnostics: [
        ...baseDiagnostics,
        runtimeDiagnostic(
          'field-runtime-webgpu-device-unavailable',
          'error',
          error instanceof Error ? error.message : String(error)
        )
      ],
      runtimeDiagnostics: {
        environment: typeof window === 'undefined' ? 'node' : 'browser',
        renderer: 'webgpu',
        available: false,
        diagnostics: ['WebGPU adapter could not create a device']
      },
      deviceDiagnostics: {
        features: [...adapter.features].sort(),
        limits: numericLimits(adapter.limits),
        lost: true,
        diagnostics: ['Device request failed'],
        metadata: adapterMetadata(adapter)
      }
    };
  }

  const deviceDiagnostics = await collectDeviceDiagnostics(adapter, device, options.observeDeviceLostTimeoutMs ?? 0);
  const descriptors = createFieldTextureDescriptors(plan, options);
  const allocations: FieldTextureAllocation[] = [];
  const allocationDiagnostics: SpatialFieldRuntimeDiagnostic[] = [];
  const deviceLimits = deviceDiagnostics.limits ?? {};

  for (const descriptor of descriptors) {
    if (textureExceedsDeviceLimits(descriptor, deviceLimits)) {
      allocationDiagnostics.push(runtimeDiagnostic(
        'field-runtime-webgpu-limit-exceeded',
        'error',
        `Texture ${descriptor.descriptor.label ?? descriptor.fieldId} exceeds maxTextureDimension2D ${deviceLimits.maxTextureDimension2D}.`,
        descriptor.fieldId
      ));
      continue;
    }

    if (options.allocateTextures === false) {
      allocations.push({ descriptor });
      continue;
    }

    const allocation = await allocateFieldTexture(device, descriptor);
    if (allocation.allocation) {
      allocations.push(allocation.allocation);
    }
    allocationDiagnostics.push(...allocation.diagnostics);
  }

  const failedAllocation = allocationDiagnostics.some((diagnostic) => diagnostic.severity === 'error');

  return {
    mode: failedAllocation || deviceDiagnostics.lost ? 'cpu-fallback' : 'webgpu',
    reports: plan.reports,
    descriptors,
    allocations,
    diagnostics: [...baseDiagnostics, ...allocationDiagnostics],
    runtimeDiagnostics: {
      environment: typeof window === 'undefined' ? 'node' : 'browser',
      renderer: 'webgpu',
      available: !failedAllocation && !deviceDiagnostics.lost,
      diagnostics: [
        ...(failedAllocation ? ['One or more field textures failed WebGPU allocation'] : []),
        ...(deviceDiagnostics.diagnostics ?? [])
      ]
    },
    deviceDiagnostics
  };
}
