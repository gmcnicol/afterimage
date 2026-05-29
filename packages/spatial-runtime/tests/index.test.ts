import { describe, expect, it } from 'vitest';
import {
  allocateSpatialRuntimeSession,
  executeSpatialRuntimePasses,
  probeWebGpuSpatialRuntimeCapabilities,
  readCpuSpatialField,
  swapCpuSpatialRuntimeField,
  writeCpuSpatialField,
  type CpuSpatialRuntimePass
} from '../src';
import type { SpatialFieldDefinition } from '@afterimage/project-model';

function values(buffer: Float32Array): number[] {
  return Array.from(buffer, (value) => Number(value.toFixed(3)));
}

describe('@afterimage/spatial-runtime', () => {
  it('allocates deterministic CPU fields for source-sized, output-sized, scaled, and fixed policies', () => {
    const fields: SpatialFieldDefinition[] = [
      {
        id: 'source',
        kind: 'motion',
        resolution: { kind: 'source-sized' },
        storage: 'cpu-buffer',
        access: 'read'
      },
      {
        id: 'output',
        kind: 'pressure',
        resolution: { kind: 'output-sized' },
        storage: 'cpu-buffer',
        access: 'write'
      },
      {
        id: 'scaled',
        kind: 'entropy',
        resolution: { kind: 'scaled', scale: 0.5 },
        storage: 'cpu-buffer',
        access: 'read-write'
      },
      {
        id: 'fixed',
        kind: 'memory',
        resolution: { kind: 'fixed', width: 2, height: 3 },
        storage: 'cpu-buffer',
        access: 'read-write'
      }
    ];

    const session = allocateSpatialRuntimeSession({
      fields,
      sourceDimensions: { width: 4, height: 3 },
      outputDimensions: { width: 8, height: 6 },
      profile: 'studio'
    });

    expect(session.fieldOrder).toEqual(['source', 'output', 'scaled', 'fixed']);
    expect(session.fields.source.dimensions).toEqual({ width: 4, height: 3 });
    expect(session.fields.output.dimensions).toEqual({ width: 8, height: 6 });
    expect(session.fields.scaled.dimensions).toEqual({ width: 4, height: 3 });
    expect(session.fields.fixed.dimensions).toEqual({ width: 2, height: 3 });
    expect(session.fields.source.buffers).toHaveLength(1);
    expect(session.fields.output.buffers).toHaveLength(1);
    expect(session.fields.scaled.buffers).toHaveLength(2);
    expect(session.fields.fixed.buffers[0].values).toBeInstanceOf(Float32Array);
    expect(session.fields.fixed.buffers[0].values).toHaveLength(6);
  });

  it('allocates ping-pong buffers and swaps read/write state', () => {
    const session = allocateSpatialRuntimeSession({
      fields: [
        {
          id: 'memory',
          kind: 'memory',
          resolution: { kind: 'fixed', width: 2, height: 1 },
          storage: 'cpu-buffer',
          access: 'read-write'
        }
      ],
      sourceDimensions: { width: 2, height: 1 },
      outputDimensions: { width: 2, height: 1 },
      initialValues: {
        memory: [1, 2]
      }
    });

    expect(session.fields.memory.buffers).toHaveLength(2);
    expect(values(readCpuSpatialField(session, 'memory'))).toEqual([1, 2]);
    writeCpuSpatialField(session, 'memory').set([3, 4]);

    swapCpuSpatialRuntimeField(session, 'memory');

    expect(values(readCpuSpatialField(session, 'memory'))).toEqual([3, 4]);
    expect(values(writeCpuSpatialField(session, 'memory'))).toEqual([1, 2]);
  });

  it('executes entropy and pressure accumulation passes deterministically', () => {
    const session = allocateSpatialRuntimeSession({
      fields: [
        {
          id: 'target',
          kind: 'entropy',
          resolution: { kind: 'fixed', width: 2, height: 2 },
          storage: 'cpu-buffer',
          access: 'read-write'
        },
        {
          id: 'source',
          kind: 'pressure',
          resolution: { kind: 'fixed', width: 2, height: 2 },
          storage: 'cpu-buffer',
          access: 'read'
        }
      ],
      sourceDimensions: { width: 2, height: 2 },
      outputDimensions: { width: 2, height: 2 },
      initialValues: {
        target: [1, 2, 3, 4],
        source: [10, 10, 10, 10]
      }
    });

    const result = executeSpatialRuntimePasses({
      session,
      passes: [
        {
          kind: 'accumulate',
          targetFieldId: 'target',
          sourceFieldId: 'source',
          amount: 1,
          sourceScale: 0.5,
          decay: 0.25
        }
      ]
    });

    expect(result.executedPasses).toBe(1);
    expect(result.diagnostics).toEqual([]);
    expect(values(readCpuSpatialField(session, 'target'))).toEqual([6.75, 7.5, 8.25, 9]);
  });

  it('executes diffusion passes on tiny synthetic fields', () => {
    const session = allocateSpatialRuntimeSession({
      fields: [
        {
          id: 'source',
          kind: 'heat',
          resolution: { kind: 'fixed', width: 3, height: 3 },
          storage: 'cpu-buffer',
          access: 'read'
        },
        {
          id: 'target',
          kind: 'heat',
          resolution: { kind: 'fixed', width: 3, height: 3 },
          storage: 'cpu-buffer',
          access: 'read-write'
        }
      ],
      sourceDimensions: { width: 3, height: 3 },
      outputDimensions: { width: 3, height: 3 },
      initialValues: {
        source: [0, 0, 0, 0, 4, 0, 0, 0, 0]
      }
    });

    executeSpatialRuntimePasses({
      session,
      passes: [{ kind: 'diffusion', targetFieldId: 'target', sourceFieldId: 'source', rate: 1 }]
    });

    expect(values(readCpuSpatialField(session, 'target'))).toEqual([0, 1, 0, 1, 0, 1, 0, 1, 0]);
  });

  it('executes flow propagation, memory persistence, and directional smear passes', () => {
    const fields: SpatialFieldDefinition[] = [
      {
        id: 'source',
        kind: 'motion',
        resolution: { kind: 'fixed', width: 3, height: 1 },
        storage: 'cpu-buffer',
        access: 'read'
      },
      {
        id: 'target',
        kind: 'flow_x',
        resolution: { kind: 'fixed', width: 3, height: 1 },
        storage: 'cpu-buffer',
        access: 'read-write'
      },
      {
        id: 'flow-x',
        kind: 'flow_x',
        resolution: { kind: 'fixed', width: 3, height: 1 },
        storage: 'cpu-buffer',
        access: 'read'
      },
      {
        id: 'flow-y',
        kind: 'flow_y',
        resolution: { kind: 'fixed', width: 3, height: 1 },
        storage: 'cpu-buffer',
        access: 'read'
      }
    ];
    const session = allocateSpatialRuntimeSession({
      fields,
      sourceDimensions: { width: 3, height: 1 },
      outputDimensions: { width: 3, height: 1 },
      initialValues: {
        source: [1, 2, 3],
        'flow-x': [1, 1, 1],
        'flow-y': [0, 0, 0]
      }
    });

    executeSpatialRuntimePasses({
      session,
      passes: [
        {
          kind: 'flow-propagation',
          targetFieldId: 'target',
          sourceFieldId: 'source',
          flowXFieldId: 'flow-x',
          flowYFieldId: 'flow-y',
          step: 1
        }
      ],
      maxPasses: 1
    });

    expect(values(readCpuSpatialField(session, 'target'))).toEqual([1, 1, 2]);

    const memorySession = allocateSpatialRuntimeSession({
      fields: [
        {
          id: 'memory',
          kind: 'memory',
          resolution: { kind: 'fixed', width: 2, height: 1 },
          storage: 'cpu-buffer',
          access: 'read-write'
        },
        {
          id: 'source',
          kind: 'entropy',
          resolution: { kind: 'fixed', width: 2, height: 1 },
          storage: 'cpu-buffer',
          access: 'read'
        }
      ],
      sourceDimensions: { width: 2, height: 1 },
      outputDimensions: { width: 2, height: 1 },
      initialValues: {
        memory: [10, 20],
        source: [2, 4]
      }
    });

    executeSpatialRuntimePasses({
      session: memorySession,
      passes: [
        {
          kind: 'memory-persistence',
          targetFieldId: 'memory',
          sourceFieldId: 'source',
          persistence: 0.5,
          influence: 0.25
        }
      ]
    });

    expect(values(readCpuSpatialField(memorySession, 'memory'))).toEqual([5.5, 11]);

    const smearSession = allocateSpatialRuntimeSession({
      fields: [
        {
          id: 'source',
          kind: 'motion',
          resolution: { kind: 'fixed', width: 3, height: 1 },
          storage: 'cpu-buffer',
          access: 'read'
        },
        {
          id: 'target',
          kind: 'memory',
          resolution: { kind: 'fixed', width: 3, height: 1 },
          storage: 'cpu-buffer',
          access: 'read-write'
        }
      ],
      sourceDimensions: { width: 3, height: 1 },
      outputDimensions: { width: 3, height: 1 },
      initialValues: {
        source: [0, 10, 0]
      }
    });

    executeSpatialRuntimePasses({
      session: smearSession,
      passes: [
        {
          kind: 'directional-smear',
          targetFieldId: 'target',
          sourceFieldId: 'source',
          directionX: 1,
          directionY: 0,
          distance: 1,
          strength: 0.5
        }
      ]
    });

    expect(values(readCpuSpatialField(smearSession, 'target'))).toEqual([0, 5, 5]);
  });

  it('reports allocation and execution diagnostics for fallback, size, missing fields, mismatch, and pass budgets', () => {
    const session = allocateSpatialRuntimeSession({
      fields: [
        {
          id: 'gpu-request',
          kind: 'pressure',
          resolution: { kind: 'fixed', width: 2, height: 1 },
          storage: 'gpu-texture',
          access: 'read-write'
        },
        {
          id: 'small',
          kind: 'pressure',
          resolution: { kind: 'fixed', width: 1, height: 1 },
          storage: 'cpu-buffer',
          access: 'read'
        }
      ],
      sourceDimensions: { width: 2, height: 1 },
      outputDimensions: { width: 2, height: 1 },
      profile: {
        id: 'draft',
        label: 'Tiny',
        fieldResolutionScale: 1,
        fpsTarget: 30,
        maxPassesPerFrame: 1,
        maxFieldDimensions: { width: 2, height: 1 },
        memoryBudgetBytes: 4,
        fallbackPolicy: 'cpu-first',
        behaviourCostClass: 'low'
      }
    });

    expect(session.diagnostics.map((diagnostic) => diagnostic.id)).toEqual([
      'spatial-field.gpu-request.gpu-unavailable',
      'spatial-runtime.draft.memory-budget-exceeded',
      'spatial-runtime.draft.pass-budget-exceeded'
    ]);

    const missingResult = executeSpatialRuntimePasses({
      session,
      passes: [{ kind: 'accumulate', targetFieldId: 'gpu-request', sourceFieldId: 'missing' }]
    });
    expect(missingResult.diagnostics.map((diagnostic) => diagnostic.id)).toEqual(['spatial-pass.0.source-field-missing']);

    const mismatchResult = executeSpatialRuntimePasses({
      session,
      passes: [{ kind: 'diffusion', targetFieldId: 'gpu-request', sourceFieldId: 'small' }]
    });
    expect(mismatchResult.diagnostics.map((diagnostic) => diagnostic.id)).toEqual(['spatial-pass.0.diffusion.dimension-mismatch']);

    const passBudgetResult = executeSpatialRuntimePasses({
      session,
      passes: [
        { kind: 'accumulate', targetFieldId: 'gpu-request' },
        { kind: 'accumulate', targetFieldId: 'gpu-request' }
      ],
      maxPasses: 1
    });
    expect(passBudgetResult.executedPasses).toBe(0);
    expect(passBudgetResult.diagnostics.map((diagnostic) => diagnostic.id)).toEqual(['spatial-runtime.pass-budget-exceeded']);
  });

  it('probes missing navigator.gpu and missing adapter states', async () => {
    const missingGpu = await probeWebGpuSpatialRuntimeCapabilities({
      environment: { navigator: {} }
    });
    expect(missingGpu.webgpuAvailable).toBe(false);
    expect(missingGpu.capabilities.supportedStoragePolicies).toEqual(['cpu-buffer']);
    expect(missingGpu.diagnostics.map((diagnostic) => diagnostic.id)).toEqual(['webgpu.navigator-gpu-missing']);

    const missingAdapter = await probeWebGpuSpatialRuntimeCapabilities({
      environment: {
        navigator: {
          gpu: {
            requestAdapter: async () => null
          }
        }
      }
    });
    expect(missingAdapter.webgpuAvailable).toBe(false);
    expect(missingAdapter.diagnostics.map((diagnostic) => diagnostic.id)).toEqual(['webgpu.adapter-unavailable']);
  });

  it('reports WebGPU adapter features, limits, optional device data, and device lost diagnostics', async () => {
    const result = await probeWebGpuSpatialRuntimeCapabilities({
      probeDevice: true,
      environment: {
        navigator: {
          gpu: {
            requestAdapter: async () => ({
              features: new Set(['timestamp-query', 'float32-filterable']),
              limits: {
                maxTextureDimension2D: 4096,
                maxBufferSize: 1024
              },
              requestDevice: async () => ({
                features: new Set(['timestamp-query']),
                limits: {
                  maxTextureDimension2D: 2048
                },
                lost: Promise.resolve({
                  reason: 'destroyed',
                  message: 'test device was destroyed'
                })
              })
            })
          }
        }
      }
    });

    expect(result.webgpuAvailable).toBe(true);
    expect(result.adapterAvailable).toBe(true);
    expect(result.deviceAvailable).toBe(true);
    expect(result.adapterFeatures).toEqual(['float32-filterable', 'timestamp-query']);
    expect(result.adapterLimits).toMatchObject({
      maxTextureDimension2D: 4096,
      maxBufferSize: 1024
    });
    expect(result.deviceFeatures).toEqual(['timestamp-query']);
    expect(result.capabilities).toEqual({
      webgpuAvailable: true,
      maxTextureDimension2D: 4096,
      supportedStoragePolicies: ['gpu-texture', 'cpu-buffer']
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.id)).toEqual(['webgpu.device-lost']);
  });

  it('keeps runtime passes as serializable objects', () => {
    const passes: CpuSpatialRuntimePass[] = [
      {
        kind: 'accumulate',
        targetFieldId: 'pressure',
        sourceFieldId: 'entropy',
        amount: 0.1,
        sourceScale: 0.5
      },
      {
        kind: 'directional-smear',
        targetFieldId: 'memory',
        sourceFieldId: 'pressure',
        directionX: 1,
        directionY: 0,
        distance: 2,
        strength: 0.25
      }
    ];

    expect(JSON.parse(JSON.stringify(passes))).toEqual(passes);
  });
});
