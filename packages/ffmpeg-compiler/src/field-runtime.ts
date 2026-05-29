import type {
  SpatialFieldRuntimeExecutionSession,
  SpatialFieldRuntimeDiagnostic,
  SpatialFieldRuntimePlan,
  SpatialFieldRuntimeReport,
  SpatialFieldRuntimeUpdatePassDescriptor
} from '@afterimage/project-model';
import type { PreviewDeviceDiagnostics, PreviewRuntimeDiagnostics } from './types.js';

export interface FieldTextureDescriptor {
  fieldId: string;
  slotId: string;
  sessionId: string;
  role: 'current' | 'previous' | 'history';
  currentFrameId: string;
  previousFrameId?: string;
  frameId: string;
  descriptor: FieldGpuTextureDescriptor;
  estimatedBytes: number;
  bufferIndex: number;
}

export interface FieldTextureAllocation {
  descriptor: FieldTextureDescriptor;
  texture?: FieldGpuTexture;
}

export interface FieldRuntimeEncodedPass {
  passId: string;
  fieldId: string;
  kind: SpatialFieldRuntimeUpdatePassDescriptor['kind'];
  dispatch: [number, number, number];
  sourceSlotIds: string[];
  targetSlotId: string;
}

export interface WebGpuFieldRuntimeResult {
  mode: 'webgpu' | 'cpu-fallback';
  reports: SpatialFieldRuntimeReport[];
  sessions: SpatialFieldRuntimeExecutionSession[];
  descriptors: FieldTextureDescriptor[];
  allocations: FieldTextureAllocation[];
  encodedPasses: FieldRuntimeEncodedPass[];
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
  executePasses?: boolean;
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

export interface FieldGpuShaderModule {
  label?: string;
}

export interface FieldGpuComputePipeline {
  label?: string;
}

export interface FieldGpuComputePassEncoder {
  setPipeline: (pipeline: FieldGpuComputePipeline) => void;
  dispatchWorkgroups: (workgroupCountX: number, workgroupCountY?: number, workgroupCountZ?: number) => void;
  end: () => void;
}

export interface FieldGpuCommandEncoder {
  beginComputePass: (descriptor?: { label?: string }) => FieldGpuComputePassEncoder;
  finish: (descriptor?: { label?: string }) => unknown;
}

export interface FieldGpuQueue {
  submit: (commandBuffers: unknown[]) => void;
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
  createShaderModule?: (descriptor: { label?: string; code: string }) => FieldGpuShaderModule;
  createComputePipeline?: (descriptor: {
    label?: string;
    layout: 'auto';
    compute: { module: FieldGpuShaderModule; entryPoint: string };
  }) => FieldGpuComputePipeline;
  createCommandEncoder?: (descriptor?: { label?: string }) => FieldGpuCommandEncoder;
  queue?: FieldGpuQueue;
}

export interface FieldGpu {
  requestAdapter: (options?: Record<string, unknown>) => Promise<FieldGpuAdapter | null>;
}

const DEFAULT_TEXTURE_USAGE = 1 | 2 | 4 | 8;

const FIELD_RUNTIME_WGSL = `
@compute @workgroup_size(8, 8, 1)
fn update(@builtin(global_invocation_id) _id : vec3<u32>) {
}
`;

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
  const reportsByFieldId = new Map(plan.reports.map((report) => [report.fieldId, report]));

  return plan.executionSessions
    .filter((session) => session.storageMode === 'gpu-texture')
    .flatMap((session) => {
      const report = reportsByFieldId.get(session.fieldId);
      return session.persistencePlan.slots.map((slot): FieldTextureDescriptor => ({
        fieldId: session.fieldId,
        slotId: slot.id,
        sessionId: session.id,
        role: slot.role,
        currentFrameId: report?.currentFrameId ?? slot.frame.frameId,
        previousFrameId: report?.previousFrameId,
        frameId: slot.frame.frameId,
        estimatedBytes: slot.estimatedBytes,
        bufferIndex: slot.bufferIndex,
        descriptor: {
          label: `afterimage:${session.fieldId}:${slot.role}:${slot.bufferIndex}`,
          size: {
            width: session.dimensions.width,
            height: session.dimensions.height,
            depthOrArrayLayers: 1
          },
          format: textureFormat,
          usage
        }
      }));
    });
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

export function releaseWebGpuFieldRuntime(result: Pick<WebGpuFieldRuntimeResult, 'allocations'>): void {
  releaseAllocations(result.allocations);
}

function releaseAllocations(allocations: FieldTextureAllocation[]): void {
  for (const allocation of allocations) {
    allocation.texture?.destroy?.();
  }
}

function popErrorScopeSafe(device: FieldGpuDevice): Promise<FieldGpuError | null> {
  return device.popErrorScope().catch((error) => ({
    message: error instanceof Error ? error.message : String(error)
  }));
}

function createEncodedPass(pass: SpatialFieldRuntimeUpdatePassDescriptor): FieldRuntimeEncodedPass {
  return {
    passId: pass.id,
    fieldId: pass.fieldId,
    kind: pass.kind,
    dispatch: [
      Math.max(1, Math.ceil(pass.dimensions.width / pass.workgroupSize[0])),
      Math.max(1, Math.ceil(pass.dimensions.height / pass.workgroupSize[1])),
      Math.max(1, pass.workgroupSize[2] > 0 ? 1 : pass.workgroupSize[2])
    ],
    sourceSlotIds: pass.sourceSlotIds,
    targetSlotId: pass.targetSlotId
  };
}

async function executeFieldUpdatePasses(input: {
  device: FieldGpuDevice;
  sessions: SpatialFieldRuntimeExecutionSession[];
}): Promise<{ encodedPasses: FieldRuntimeEncodedPass[]; diagnostics: SpatialFieldRuntimeDiagnostic[] }> {
  const diagnostics: SpatialFieldRuntimeDiagnostic[] = [];
  const encodedPasses: FieldRuntimeEncodedPass[] = [];

  if (!input.device.createShaderModule || !input.device.createComputePipeline || !input.device.createCommandEncoder || !input.device.queue) {
    diagnostics.push(runtimeDiagnostic(
      'field-runtime-webgpu-execution-unavailable',
      'error',
      'WebGPU device does not expose the compute execution methods required for field updates.'
    ));
    return { encodedPasses, diagnostics };
  }

  input.device.pushErrorScope('out-of-memory');
  input.device.pushErrorScope('validation');

  try {
    const module = input.device.createShaderModule({
      label: 'afterimage-field-runtime-update',
      code: FIELD_RUNTIME_WGSL
    });
    const pipeline = input.device.createComputePipeline({
      label: 'afterimage-field-runtime-update',
      layout: 'auto',
      compute: {
        module,
        entryPoint: 'update'
      }
    });
    const encoder = input.device.createCommandEncoder({ label: 'afterimage-field-runtime' });

    for (const session of input.sessions.filter((session) => session.storageMode === 'gpu-texture')) {
      for (const pass of session.updatePasses) {
        const encodedPass = createEncodedPass(pass);
        const computePass = encoder.beginComputePass({ label: pass.id });
        computePass.setPipeline(pipeline);
        computePass.dispatchWorkgroups(...encodedPass.dispatch);
        computePass.end();
        encodedPasses.push(encodedPass);
      }
    }

    input.device.queue.submit([encoder.finish({ label: 'afterimage-field-runtime-command-buffer' })]);
  } catch (error) {
    diagnostics.push(runtimeDiagnostic(
      'field-runtime-webgpu-execution-failed',
      'error',
      error instanceof Error ? error.message : String(error)
    ));
  }

  const validationError = await popErrorScopeSafe(input.device);
  const memoryError = await popErrorScopeSafe(input.device);

  if (validationError) {
    diagnostics.push(runtimeDiagnostic(
      'field-runtime-webgpu-validation-error',
      'error',
      validationError.message
    ));
  }
  if (memoryError) {
    diagnostics.push(runtimeDiagnostic(
      'field-runtime-webgpu-out-of-memory',
      'error',
      memoryError.message
    ));
  }

  return { encodedPasses, diagnostics };
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
      sessions: plan.executionSessions,
      descriptors: [],
      allocations: [],
      encodedPasses: [],
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
      sessions: plan.executionSessions,
      descriptors: [],
      allocations: [],
      encodedPasses: [],
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
      sessions: plan.executionSessions,
      descriptors: [],
      allocations: [],
      encodedPasses: [],
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
  const execution = failedAllocation || deviceDiagnostics.lost || options.executePasses === false
    ? { encodedPasses: [] as FieldRuntimeEncodedPass[], diagnostics: [] as SpatialFieldRuntimeDiagnostic[] }
    : await executeFieldUpdatePasses({
      device,
      sessions: plan.executionSessions
    });
  const failedExecution = execution.diagnostics.some((diagnostic) => diagnostic.severity === 'error');

  if (failedAllocation || failedExecution || deviceDiagnostics.lost) {
    releaseAllocations(allocations);
  }

  return {
    mode: failedAllocation || failedExecution || deviceDiagnostics.lost ? 'cpu-fallback' : 'webgpu',
    reports: plan.reports,
    sessions: plan.executionSessions,
    descriptors,
    allocations,
    encodedPasses: execution.encodedPasses,
    diagnostics: [...baseDiagnostics, ...allocationDiagnostics, ...execution.diagnostics],
    runtimeDiagnostics: {
      environment: typeof window === 'undefined' ? 'node' : 'browser',
      renderer: 'webgpu',
      available: !failedAllocation && !failedExecution && !deviceDiagnostics.lost,
      diagnostics: [
        ...(failedAllocation ? ['One or more field textures failed WebGPU allocation'] : []),
        ...(failedExecution ? ['One or more field update passes failed WebGPU execution'] : []),
        ...(deviceDiagnostics.diagnostics ?? [])
      ]
    },
    deviceDiagnostics
  };
}
