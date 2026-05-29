import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getExportProfileById } from '../../export-profiles/src';
import { fixtureProject } from '../../test-fixtures/src';
import { parseProject } from '../../schema-validators/src';
import type { FilterInstance, ProjectFile, SupportedFilterType } from '../../project-model/src';
import {
  buildAnalysisPlan,
  buildAudioChangeAnalysisPlan,
  buildCaptureReplayExportRenderGraphPlan,
  buildCaptureReplayPreviewRenderGraphPlan,
  buildExportPlan,
  buildExportRenderGraphPlan,
  buildFinalizeRenderPlan,
  buildPreviewCapabilityReport,
  buildPreviewPlan,
  buildPreviewRenderGraphPlan,
  buildRenderGraphPlan,
  buildRenderPlan,
  buildThumbnailPlan,
  buildWaveformPlan,
  CAPTURE_REPLAY_MISSING_REFERENCE,
  CAPTURE_REPLAY_PLANNING_FAILED,
  CAPTURE_REPLAY_UNSUPPORTED_VALUE,
  negotiateWebGpuFieldRuntime,
  evaluatePreviewAdapterReadiness,
  executeCommandSpec,
  FFMPEG_PASS_COMPATIBILITY,
  getToolchainHealth,
  PREVIEW_ADAPTER_MISSING_DETERMINISTIC_SEED,
  PREVIEW_ADAPTER_MISSING_REQUIRED_CAPABILITY,
  PREVIEW_ADAPTER_UNSUPPORTED_NODE_KIND,
  resolveFfmpegTools,
  type CommandExecutionResult,
  type CaptureReplayRenderContext,
  type PreviewAdapterCapabilityContext,
  type PreviewCapabilityReport,
  type RenderGraphArtifact,
  type RenderGraphBackendRequirement,
  type RenderGraphCacheIdentity,
  type RenderGraphCapabilityDiagnostic,
  type RenderGraphEdge,
  type RenderGraphNode,
  type RenderGraphPass,
  type RenderGraphPlan,
  type ResolvedFfmpegTools
} from '../src';

describe('@afterimage/ffmpeg-compiler', () => {
  const project = parseProject(fixtureProject);

  function withoutCaptureReplayReferences(projectFile: ProjectFile): ProjectFile {
    return {
      ...projectFile,
      composition: projectFile.composition
        ? {
            ...projectFile.composition,
            modulationRoutes: [],
            entropyStates: []
          }
        : undefined,
      captureLogs: []
    };
  }

  function summarizeRenderGraphPlan(plan: RenderGraphPlan) {
    const pass = plan.passes[0];
    return {
      identity: plan.identity,
      target: plan.target,
      inputs: plan.inputs,
      nodes: plan.nodes.map((node) => ({
        id: node.id,
        kind: node.kind
      })),
      edges: plan.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        kind: edge.kind,
        metadata: edge.metadata
      })),
      pass: {
        id: pass.id,
        backend: pass.backend,
        nodeId: pass.nodeId,
        inputNodeIds: pass.inputNodeIds,
        outputArtifactIds: pass.outputArtifactIds,
        command: pass.command,
        semantics: pass.semantics,
        cacheKey: pass.cacheIdentity.key
      },
      artifacts: plan.artifacts.map((artifact) => ({
        id: artifact.id,
        role: artifact.role,
        path: artifact.path,
        producedBy: artifact.producedBy,
        cacheKey: artifact.cacheIdentity.key
      })),
      backendRequirements: plan.backendRequirements.map((requirement) => ({
        id: requirement.id,
        backend: requirement.backend,
        binary: requirement.binary,
        capabilities: requirement.capabilities
      })),
      diagnostics: plan.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        nodeId: diagnostic.nodeId,
        passId: diagnostic.passId,
        requirementId: diagnostic.requirementId
      })),
      cacheKey: plan.cacheIdentity.key
    };
  }

  function makePreviewAdapterContext(
    plan: RenderGraphPlan,
    overrides: Partial<PreviewAdapterCapabilityContext> = {}
  ): PreviewAdapterCapabilityContext {
    return {
      backend: {
        backend: 'ffmpeg',
        label: 'FFmpeg command preview adapter',
        runtime: 'command'
      },
      supportedNodeKinds: [...new Set(plan.nodes.map((node) => node.kind))],
      supportedCapabilities: [...new Set(plan.backendRequirements.flatMap((requirement) => requirement.capabilities))],
      requiredSeedIds: [],
      availableSeedIds: [],
      ...overrides
    };
  }

  function makeCaptureReplayContext(patch: Partial<CaptureReplayRenderContext> = {}): CaptureReplayRenderContext {
    return {
      identity: {
        projectId: 'project-core-engine-fixture',
        compositionId: 'composition-main',
        sequenceId: 'sequence-main',
        variantId: 'variant-main',
        captureSessionId: 'capture-session-main',
        captureLogId: 'capture-log-main',
        replayEventIds: ['capture-event-1']
      },
      filterOverrides: [{
        eventId: 'capture-event-1',
        routeId: 'route-bloom-midi',
        seedId: 'seed-composition-main',
        captureTimeMs: 120,
        compositionTimeMs: 120,
        filterId: 'filter-main-bloom',
        property: 'mix',
        value: 0.9,
        mappingKind: 'trigger'
      }],
      ...patch
    };
  }

  it('builds deterministic analysis, thumbnail, waveform, preview, and export plans', () => {
    expect(buildAnalysisPlan(project, {
      assetId: 'asset-alpha',
      probeOutputPath: 'artifacts/source-alpha.ffprobe.json',
      analysisOutputPath: 'artifacts/source-alpha.analysis.log'
    })).toMatchInlineSnapshot(`
      {
        "artifacts": {
          "analysisOutputPath": "artifacts/source-alpha.analysis.log",
          "probeOutputPath": "artifacts/source-alpha.ffprobe.json",
        },
        "assetId": "asset-alpha",
        "commands": [
          {
            "args": [
              "-v",
              "error",
              "-print_format",
              "json",
              "-show_format",
              "-show_streams",
              "fixtures/clips/source-alpha.mp4",
            ],
            "binary": "ffprobe",
            "expectedOutputs": [
              "artifacts/source-alpha.ffprobe.json",
            ],
            "label": "probe:asset-alpha",
          },
          {
            "args": [
              "-hide_banner",
              "-loglevel",
              "info",
              "-y",
              "-i",
              "fixtures/clips/source-alpha.mp4",
              "-filter:v",
              "select='gt(scene,0.400)',metadata=print:file=-",
              "-an",
              "-f",
              "null",
              "-",
            ],
            "binary": "ffmpeg",
            "expectedOutputs": [
              "artifacts/source-alpha.analysis.log",
            ],
            "label": "scene-detect:asset-alpha",
          },
        ],
        "projectId": "project-core-engine-fixture",
        "sceneThreshold": 0.4,
      }
    `);

    expect(buildThumbnailPlan(project, {
      assetId: 'asset-alpha',
      outputPattern: '.afterimage/thumbnails/source-alpha-%03d.jpg',
      manifestOutputPath: '.afterimage/analysis/source-alpha.thumbnails.json'
    }).command.args).toContain('.afterimage/thumbnails/source-alpha-%03d.jpg');

    expect(buildWaveformPlan(project, {
      assetId: 'asset-music',
      outputPath: '.afterimage/waveforms/asset-music.png'
    }).command.args).toContain('.afterimage/waveforms/asset-music.png');

    expect(buildAudioChangeAnalysisPlan(project, {
      assetId: 'asset-music',
      astatsOutputPath: '.afterimage/analysis/asset-music.astats.log',
      aspectralstatsOutputPath: '.afterimage/analysis/asset-music.aspectralstats.log',
      ebur128OutputPath: '.afterimage/analysis/asset-music.ebur128.log',
      silencedetectOutputPath: '.afterimage/analysis/asset-music.silencedetect.log'
    })).toMatchInlineSnapshot(`
      {
        "artifacts": {
          "aspectralstatsOutputPath": ".afterimage/analysis/asset-music.aspectralstats.log",
          "astatsOutputPath": ".afterimage/analysis/asset-music.astats.log",
          "ebur128OutputPath": ".afterimage/analysis/asset-music.ebur128.log",
          "silencedetectOutputPath": ".afterimage/analysis/asset-music.silencedetect.log",
        },
        "assetId": "asset-music",
        "commands": [
          {
            "args": [
              "-hide_banner",
              "-loglevel",
              "info",
              "-y",
              "-i",
              "fixtures/audio/score-alpha.wav",
              "-vn",
              "-af",
              "astats=metadata=1:reset=1,ametadata=print:file=-",
              "-f",
              "null",
              "-",
            ],
            "binary": "ffmpeg",
            "expectedOutputs": [
              ".afterimage/analysis/asset-music.astats.log",
            ],
            "label": "audio-change:astats:asset-music",
          },
          {
            "args": [
              "-hide_banner",
              "-loglevel",
              "info",
              "-y",
              "-i",
              "fixtures/audio/score-alpha.wav",
              "-vn",
              "-af",
              "aspectralstats=win_size=2048:overlap=0.5,ametadata=print:file=-",
              "-f",
              "null",
              "-",
            ],
            "binary": "ffmpeg",
            "expectedOutputs": [
              ".afterimage/analysis/asset-music.aspectralstats.log",
            ],
            "label": "audio-change:aspectralstats:asset-music",
          },
          {
            "args": [
              "-hide_banner",
              "-loglevel",
              "info",
              "-y",
              "-i",
              "fixtures/audio/score-alpha.wav",
              "-vn",
              "-af",
              "ebur128=metadata=1,ametadata=print:file=-",
              "-f",
              "null",
              "-",
            ],
            "binary": "ffmpeg",
            "expectedOutputs": [
              ".afterimage/analysis/asset-music.ebur128.log",
            ],
            "label": "audio-change:ebur128:asset-music",
          },
          {
            "args": [
              "-hide_banner",
              "-loglevel",
              "info",
              "-y",
              "-i",
              "fixtures/audio/score-alpha.wav",
              "-vn",
              "-af",
              "silencedetect=noise=-40dB:d=0.4",
              "-f",
              "null",
              "-",
            ],
            "binary": "ffmpeg",
            "expectedOutputs": [
              ".afterimage/analysis/asset-music.silencedetect.log",
            ],
            "label": "audio-change:silencedetect:asset-music",
          },
        ],
        "projectId": "project-core-engine-fixture",
      }
    `);

    expect(buildPreviewPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    }).command.args).toContain('.afterimage/preview/variant-main.mp4');

    expect(buildExportPlan(project, {
      outputPath: 'exports/studio-fixture.mov',
      profile: getExportProfileById('landscape-master')
    })).toMatchInlineSnapshot(`
      {
        "command": {
          "args": [
            "-y",
            "-i",
            "fixtures/clips/source-alpha.mp4",
            "-i",
            "fixtures/audio/score-alpha.wav",
            "-filter_complex",
            "[0:v]trim=start=0.500:duration=2.000,setpts=PTS-STARTPTS,gblur=sigma=1.440,eq=contrast=1.020:brightness=0.020:saturation=1.013,gblur=sigma=2.150,chromashift=cbh=3:crh=-3:edge=smear,eq=saturation=1.030,fps=30.000,scale=1920:1080,setsar=1,format=yuv420p[v0];[v0]concat=n=1:v=1:a=0[vconcat];[vconcat]tpad=stop_mode=clone:stop_duration=3.000,trim=duration=5.000,fade=t=out:st=3.000:d=2.000,format=yuv420p[vout];[1:a]atrim=start=0:duration=5.000,asetpts=PTS-STARTPTS[amusic]",
            "-map",
            "[vout]",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-maxrate",
            "12000k",
            "-bufsize",
            "24000k",
            "-map",
            "[amusic]",
            "-c:a",
            "aac",
            "-b:a",
            "256k",
            "-f",
            "mp4",
            "exports/studio-fixture.mov",
          ],
          "binary": "ffmpeg",
          "expectedOutputs": [
            "exports/studio-fixture.mov",
          ],
          "label": "render:project-core-engine-fixture:variant-main",
        },
        "outputPath": "exports/studio-fixture.mov",
        "projectId": "project-core-engine-fixture",
        "sequenceId": "sequence-main",
        "variantId": "variant-main",
      }
    `);
  });

  it('exposes serializable render graph contract shapes', () => {
    const plan = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    });
    const node: RenderGraphNode = plan.nodes[0];
    const edge: RenderGraphEdge = plan.edges[0];
    const pass: RenderGraphPass = plan.passes[0];
    const artifact: RenderGraphArtifact = plan.artifacts[0];
    const requirement: RenderGraphBackendRequirement = plan.backendRequirements[0];
    const diagnostic: RenderGraphCapabilityDiagnostic = plan.diagnostics[0];
    const cacheIdentity: RenderGraphCacheIdentity = plan.cacheIdentity;

    expect(node.kind).toBe('project');
    expect(edge.kind).toBe('identity');
    expect(pass.backend).toBe('ffmpeg');
    expect(pass.command.args).toContain('.afterimage/preview/variant-main.mp4');
    expect(artifact.role).toBe('preview-output');
    expect(requirement.capabilities).toEqual(expect.arrayContaining([
      'filter_complex',
      'video-codec:libx264',
      'audio-codec:aac',
      'container:mp4'
    ]));
    expect(diagnostic.severity).toBe('info');
    expect(cacheIdentity).toEqual(expect.objectContaining({
      namespace: 'render-graph-plan',
      version: 1,
      algorithm: 'sha256',
      status: 'derived'
    }));
    expect(cacheIdentity.invalidatesOn).toEqual(expect.arrayContaining(['project-state', 'ffmpeg-toolchain']));
    expect(pass.provenance.parentCacheKeys).toContain(cacheIdentity.key);
    expect(artifact.provenance.parentCacheKeys).toContain(pass.cacheIdentity.key);
  });

  it('attaches spatial field runtime reports to render graph plans without changing FFmpeg commands', () => {
    const plan = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    });
    const commandArgs = plan.passes[0].command.args;
    const memoryReport = plan.fieldRuntime?.reports.find((report) => report.fieldId === 'field-memory-scene');

    expect(commandArgs).toEqual(buildPreviewPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    }).command.args);
    expect(plan.fieldRuntime?.runtimeProfileId).toBe('runtime-profile-draft');
    expect(plan.fieldRuntime?.reports.map((report) => report.fieldId)).toContain('field-motion-source');
    expect(memoryReport).toMatchObject({
      bufferCount: 5,
      currentFrameId: 'composition-main:sequence-main:variant-main:0:0',
      previousFrameId: 'composition-main:sequence-main:variant-main:0:0'
    });
    expect(memoryReport?.persistencePlan).toMatchObject({
      kind: 'history-window',
      windowFrames: 4,
      bufferCount: 5
    });
    expect(plan.diagnostics.map((diagnostic) => diagnostic.code)).toContain('field-runtime-high-quality-flow-unavailable');
  });

  it('negotiates WebGPU field textures and falls back cleanly when WebGPU is unavailable or lost', async () => {
    const plan = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    }).fieldRuntime;

    expect(plan).toBeDefined();
    if (!plan) {
      return;
    }

    const unavailable = await negotiateWebGpuFieldRuntime(plan, {
      gpu: undefined
    });
    expect(unavailable.mode).toBe('cpu-fallback');
    expect(unavailable.runtimeDiagnostics.diagnostics).toContain('navigator.gpu is not available');

    const createdDescriptors: GPUTextureDescriptor[] = [];
    const submittedCommandBuffers: unknown[][] = [];
    const dispatched: Array<[number, number, number]> = [];
    const fakeDevice = {
      limits: { maxTextureDimension2D: 4096 },
      lost: new Promise<GPUDeviceLostInfo>(() => undefined),
      pushErrorScope: () => undefined,
      popErrorScope: async () => null,
      createTexture: (descriptor: GPUTextureDescriptor) => {
        createdDescriptors.push(descriptor);
        return { label: descriptor.label } as GPUTexture;
      },
      createShaderModule: (descriptor: GPUShaderModuleDescriptor) => ({ label: descriptor.label }),
      createComputePipeline: (descriptor: GPUComputePipelineDescriptor) => ({ label: descriptor.label }),
      createCommandEncoder: () => ({
        beginComputePass: () => ({
          setPipeline: () => undefined,
          dispatchWorkgroups: (x: number, y = 1, z = 1) => {
            dispatched.push([x, y, z]);
          },
          end: () => undefined
        }),
        finish: () => ({ command: 'field-runtime' })
      }),
      queue: {
        submit: (commandBuffers: unknown[]) => {
          submittedCommandBuffers.push(commandBuffers);
        }
      }
    };
    const fakeAdapter = {
      features: new Set<string>(['texture-compression-bc']),
      limits: { maxTextureDimension2D: 4096 },
      requestDevice: async () => fakeDevice
    };
    const fakeGpu = {
      requestAdapter: async () => fakeAdapter
    };
    const webgpu = await negotiateWebGpuFieldRuntime(plan, {
      gpu: fakeGpu as unknown as GPU
    });

    expect(webgpu.mode).toBe('webgpu');
    expect(webgpu.descriptors.length).toBeGreaterThan(0);
    expect(webgpu.descriptors.map((descriptor) => descriptor.slotId)).toContain('field-slot:field-memory-scene:previous:1');
    expect(webgpu.allocations.length).toBe(webgpu.descriptors.length);
    const executablePassCount = plan.executionSessions
      .filter((session) => session.storageMode === 'gpu-texture')
      .reduce((sum, session) => sum + session.updatePasses.length, 0);
    expect(webgpu.encodedPasses.length).toBe(executablePassCount);
    expect(submittedCommandBuffers).toHaveLength(1);
    expect(dispatched.length).toBe(executablePassCount);
    expect(createdDescriptors.map((descriptor) => descriptor.format)).toEqual(
      Array.from({ length: createdDescriptors.length }, () => 'rgba8unorm')
    );

    const lostDevice = {
      ...fakeDevice,
      lost: Promise.resolve({ reason: 'destroyed', message: 'device lost in test' } as GPUDeviceLostInfo)
    };
    const lostGpu = {
      requestAdapter: async () => ({
        ...fakeAdapter,
        requestDevice: async () => lostDevice
      })
    };
    const lost = await negotiateWebGpuFieldRuntime(plan, {
      gpu: lostGpu as unknown as GPU
    });

    expect(lost.mode).toBe('cpu-fallback');
    expect(lost.deviceDiagnostics?.lost).toBe(true);
    expect(lost.runtimeDiagnostics.diagnostics?.join(' ')).toContain('device lost in test');
  });

  it('falls back with diagnostics when WebGPU field allocation or execution fails', async () => {
    const plan = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    }).fieldRuntime;

    expect(plan).toBeDefined();
    if (!plan) {
      return;
    }

    const adapter = {
      features: new Set<string>(),
      limits: { maxTextureDimension2D: 1 },
      requestDevice: async () => ({
        limits: { maxTextureDimension2D: 1 },
        lost: new Promise<GPUDeviceLostInfo>(() => undefined),
        pushErrorScope: () => undefined,
        popErrorScope: async () => null,
        createTexture: (descriptor: GPUTextureDescriptor) => ({ label: descriptor.label } as GPUTexture),
        createShaderModule: (descriptor: GPUShaderModuleDescriptor) => ({ label: descriptor.label }),
        createComputePipeline: (descriptor: GPUComputePipelineDescriptor) => ({ label: descriptor.label }),
        createCommandEncoder: () => ({
          beginComputePass: () => ({
            setPipeline: () => undefined,
            dispatchWorkgroups: () => undefined,
            end: () => undefined
          }),
          finish: () => ({ command: 'field-runtime' })
        }),
        queue: { submit: () => undefined }
      })
    };
    const limitExceeded = await negotiateWebGpuFieldRuntime(plan, {
      gpu: { requestAdapter: async () => adapter } as unknown as GPU
    });

    expect(limitExceeded.mode).toBe('cpu-fallback');
    expect(limitExceeded.diagnostics.map((diagnostic) => diagnostic.code)).toContain('field-runtime-webgpu-limit-exceeded');

    const executionUnavailable = await negotiateWebGpuFieldRuntime(plan, {
      gpu: {
        requestAdapter: async () => ({
          features: new Set<string>(),
          limits: { maxTextureDimension2D: 4096 },
          requestDevice: async () => ({
            limits: { maxTextureDimension2D: 4096 },
            lost: new Promise<GPUDeviceLostInfo>(() => undefined),
            pushErrorScope: () => undefined,
            popErrorScope: async () => null,
            createTexture: (descriptor: GPUTextureDescriptor) => ({ label: descriptor.label } as GPUTexture)
          })
        })
      } as unknown as GPU
    });

    expect(executionUnavailable.mode).toBe('cpu-fallback');
    expect(executionUnavailable.diagnostics.map((diagnostic) => diagnostic.code)).toContain('field-runtime-webgpu-execution-unavailable');
  });

  it('builds a supported FFmpeg preview capability report from a preview render graph plan', () => {
    const plan = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    });
    const report = buildPreviewCapabilityReport(plan);

    expect(report.schemaVersion).toBe(1);
    expect(report.id).toMatch(/^preview-capability-report:/);
    expect(report.status).toBe('supported');
    expect(report.backend).toEqual({
      backend: 'ffmpeg',
      label: 'FFmpeg command preview',
      runtime: 'command'
    });
    expect(report.renderGraph).toEqual({
      planId: plan.identity.planId,
      projectId: plan.identity.projectId,
      sequenceId: plan.identity.sequenceId,
      variantId: plan.identity.variantId,
      mode: 'preview',
      passIds: ['pass:ffmpeg-render'],
      artifactIds: plan.artifacts.map((artifact) => artifact.id),
      requirementIds: plan.backendRequirements.map((requirement) => requirement.id),
      diagnosticIds: plan.diagnostics.map((diagnostic) => diagnostic.id)
    });
    expect(report.target).toEqual(plan.target);
    expect(buildPreviewCapabilityReport(plan)).toEqual(report);
  });

  it('includes backend requirements and required capabilities from the render graph plan', () => {
    const plan = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    });
    const report = buildPreviewCapabilityReport(plan);

    expect(report.backendRequirements).toEqual(expect.arrayContaining([{
      id: 'requirement:ffmpeg-render',
      backend: 'ffmpeg',
      required: true,
      capabilities: [
        'filter_complex',
        'video-codec:libx264',
        'audio-codec:aac',
        'container:mp4',
        'pixel-format:yuv420p'
      ],
      binary: 'ffmpeg',
      sourceRequirementId: 'requirement:ffmpeg-render',
      provenance: {
        source: 'path',
        license: 'LGPL',
        lgplOnly: true,
        notes: 'Unresolved placeholder binary name for deterministic command planning.'
      },
      metadata: {
        source: 'path'
      }
    }]));
    expect(report.backendRequirements.map((requirement) => requirement.id)).toEqual([
      'requirement:ffmpeg-render',
      'requirement:runtime-profile:runtime-profile-draft',
      'requirement:field-generator:generator-clip-luma-alpha',
      'requirement:field-generator:generator-live-flights-flow',
      'requirement:field-generator:generator-motion-frame-difference-runtime',
      'requirement:field-generator:generator-seeded-noise-drift',
      'requirement:field-sampler:sampler-bloom-heat-strength'
    ]);
    expect(report.requiredCapabilities.map((capability) => capability.capability)).toEqual(
      plan.backendRequirements
        .filter((requirement) => requirement.required)
        .flatMap((requirement) => requirement.capabilities)
    );
    expect(report.optionalCapabilities).toEqual([]);
  });

  it('retains and references existing render graph diagnostics in preview capability reports', () => {
    const result = buildCaptureReplayPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    }, makeCaptureReplayContext({
      diagnostics: [{
        eventId: 'capture-event-missing',
        path: 'captureLogs.capture-log-main.events.capture-event-missing.target.id',
        code: 'missing-reference',
        message: 'Capture event "capture-event-missing" target references missing filter "filter-missing".'
      }]
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const report = buildPreviewCapabilityReport(result.plan);

    expect(report.diagnostics).toEqual(result.plan.diagnostics);
    expect(report.renderGraph.diagnosticIds).toEqual(result.plan.diagnostics.map((diagnostic) => diagnostic.id));
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: CAPTURE_REPLAY_MISSING_REFERENCE,
        severity: 'error',
        path: 'captureLogs.capture-log-main.events.capture-event-missing.target.id'
      })
    ]));
  });

  it('keeps rejected and unsupported preview capability report fixtures serializable and stable', () => {
    const plan = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    });
    const unsupportedReport: PreviewCapabilityReport = buildPreviewCapabilityReport(plan, {
      backend: {
        backend: 'webgpu',
        label: 'WebGPU preview',
        runtime: 'webgpu'
      },
      status: 'unsupported',
      optionalCapabilities: [{
        id: 'capability:webgpu:timestamp-query',
        label: 'timestamp-query',
        capability: 'timestamp-query',
        backend: 'webgpu'
      }],
      degradations: [{
        id: 'degradation:webgpu:preview-only-color',
        label: 'Preview color precision',
        reason: 'Preview may use browser surface color handling before export parity work lands.',
        capabilityIds: ['capability:ffmpeg:pixel-format:yuv420p']
      }],
      runtimeDiagnostics: {
        environment: 'browser',
        renderer: 'webgpu',
        available: false,
        diagnostics: ['navigator.gpu is not available']
      },
      deviceDiagnostics: {
        lost: false,
        diagnostics: ['No adapter selected']
      }
    });
    const rejectedReport: PreviewCapabilityReport = buildPreviewCapabilityReport(plan, {
      backend: {
        backend: 'webgpu',
        label: 'WebGPU preview',
        runtime: 'webgpu'
      },
      rejectionReasons: [{
        id: 'rejection:webgpu:required-blend',
        label: 'Unsupported required blend',
        reason: 'A required blend mode has no preview lowering.',
        severity: 'error',
        diagnosticCode: 'PREVIEW_REQUIRED_BLEND_UNSUPPORTED',
        capabilityIds: ['capability:webgpu:blend:required'],
        diagnosticIds: ['diagnostic:preview:required-blend'],
        requirementIds: ['requirement:ffmpeg-render']
      }]
    });

    expect(JSON.parse(JSON.stringify({
      unsupported: {
        status: unsupportedReport.status,
        backend: unsupportedReport.backend,
        optionalCapabilities: unsupportedReport.optionalCapabilities,
        degradations: unsupportedReport.degradations,
        runtimeDiagnostics: unsupportedReport.runtimeDiagnostics,
        deviceDiagnostics: unsupportedReport.deviceDiagnostics
      },
      rejected: {
        status: rejectedReport.status,
        rejectionReasons: rejectedReport.rejectionReasons
      }
    }))).toMatchInlineSnapshot(`
      {
        "rejected": {
          "rejectionReasons": [
            {
              "capabilityIds": [
                "capability:webgpu:blend:required",
              ],
              "diagnosticCode": "PREVIEW_REQUIRED_BLEND_UNSUPPORTED",
              "diagnosticIds": [
                "diagnostic:preview:required-blend",
              ],
              "id": "rejection:webgpu:required-blend",
              "label": "Unsupported required blend",
              "reason": "A required blend mode has no preview lowering.",
              "requirementIds": [
                "requirement:ffmpeg-render",
              ],
              "severity": "error",
            },
          ],
          "status": "rejected",
        },
        "unsupported": {
          "backend": {
            "backend": "webgpu",
            "label": "WebGPU preview",
            "runtime": "webgpu",
          },
          "degradations": [
            {
              "capabilityIds": [
                "capability:ffmpeg:pixel-format:yuv420p",
              ],
              "id": "degradation:webgpu:preview-only-color",
              "label": "Preview color precision",
              "reason": "Preview may use browser surface color handling before export parity work lands.",
            },
          ],
          "deviceDiagnostics": {
            "diagnostics": [
              "No adapter selected",
            ],
            "lost": false,
          },
          "optionalCapabilities": [
            {
              "backend": "webgpu",
              "capability": "timestamp-query",
              "id": "capability:webgpu:timestamp-query",
              "label": "timestamp-query",
            },
          ],
          "runtimeDiagnostics": {
            "available": false,
            "diagnostics": [
              "navigator.gpu is not available",
            ],
            "environment": "browser",
            "renderer": "webgpu",
          },
          "status": "unsupported",
        },
      }
    `);
  });

  it('evaluates a trivial FFmpeg preview graph as adapter-ready', () => {
    const plan = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    });
    const result = evaluatePreviewAdapterReadiness(plan, makePreviewAdapterContext(plan, {
      optionalCapabilities: [{
        id: 'capability:ffmpeg:preview-probe',
        label: 'preview-probe',
        capability: 'preview-probe',
        backend: 'ffmpeg'
      }]
    }));

    expect(result.status).toBe('supported');
    expect(result.report.status).toBe('supported');
    expect(result.report.backend).toEqual({
      backend: 'ffmpeg',
      label: 'FFmpeg command preview adapter',
      runtime: 'command'
    });
    expect(result.report.requiredCapabilities.map((capability) => capability.capability))
      .toEqual(plan.backendRequirements
        .filter((requirement) => requirement.required)
        .flatMap((requirement) => requirement.capabilities));
    expect(result.report.optionalCapabilities).toEqual([{
      id: 'capability:ffmpeg:preview-probe',
      label: 'preview-probe',
      capability: 'preview-probe',
      backend: 'ffmpeg'
    }]);
    expect(result.unsupportedNodeKinds).toEqual([]);
    expect(result.missingRequiredCapabilities).toEqual([]);
    expect(result.missingRequiredSeedIds).toEqual([]);
    expect(result.rejectionReasons).toEqual([]);
  });

  it('marks preview adapter readiness unsupported for unsupported graph node kinds', () => {
    const plan = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    });
    const result = evaluatePreviewAdapterReadiness(plan, makePreviewAdapterContext(plan, {
      supportedNodeKinds: plan.nodes
        .map((node) => node.kind)
        .filter((kind) => kind !== 'operation')
    }));

    expect(result.status).toBe('unsupported');
    expect(result.report.status).toBe('unsupported');
    expect(result.unsupportedNodeKinds).toEqual(['operation']);
    expect(result.report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'diagnostic:preview-adapter:unsupported-node-kind:operation:preview:variant-main',
        code: PREVIEW_ADAPTER_UNSUPPORTED_NODE_KIND,
        severity: 'error',
        nodeId: 'operation:preview:variant-main'
      })
    ]));
  });

  it('marks preview adapter readiness unsupported when deterministic seeds are missing', () => {
    const plan = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    });
    const result = evaluatePreviewAdapterReadiness(plan, makePreviewAdapterContext(plan, {
      requiredSeedIds: ['seed:preview-clock', 'seed:variant-main'],
      availableSeedIds: ['seed:preview-clock']
    }));

    expect(result.status).toBe('unsupported');
    expect(result.missingRequiredSeedIds).toEqual(['seed:variant-main']);
    expect(result.report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'diagnostic:preview-adapter:missing-seed:seed:variant-main',
        code: PREVIEW_ADAPTER_MISSING_DETERMINISTIC_SEED,
        severity: 'error'
      })
    ]));
  });

  it('rejects preview adapter readiness when forced capability rejection reasons are present', () => {
    const plan = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    });
    const result = evaluatePreviewAdapterReadiness(plan, makePreviewAdapterContext(plan, {
      backend: {
        backend: 'webgpu',
        label: 'WebGPU preview adapter',
        runtime: 'webgpu'
      },
      rejectionReasons: [{
        id: 'rejection:webgpu:adapter-unavailable',
        label: 'Adapter unavailable',
        reason: 'No WebGPU adapter was selected for preview negotiation.',
        severity: 'error',
        diagnosticCode: 'PREVIEW_ADAPTER_UNAVAILABLE',
        diagnosticIds: ['diagnostic:preview-adapter:adapter-unavailable']
      }],
      runtimeDiagnostics: {
        environment: 'browser',
        renderer: 'webgpu',
        available: false,
        diagnostics: ['navigator.gpu is available but no adapter was selected']
      }
    }));

    expect(result.status).toBe('rejected');
    expect(result.report.status).toBe('rejected');
    expect(result.report.rejectionReasons).toEqual([{
      id: 'rejection:webgpu:adapter-unavailable',
      label: 'Adapter unavailable',
      reason: 'No WebGPU adapter was selected for preview negotiation.',
      severity: 'error',
      diagnosticCode: 'PREVIEW_ADAPTER_UNAVAILABLE',
      diagnosticIds: ['diagnostic:preview-adapter:adapter-unavailable']
    }]);
    expect(result.report.runtimeDiagnostics).toEqual({
      environment: 'browser',
      renderer: 'webgpu',
      available: false,
      diagnostics: ['navigator.gpu is available but no adapter was selected']
    });
  });

  it('rejects preview adapter readiness when required backend capabilities are missing', () => {
    const plan = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    });
    const result = evaluatePreviewAdapterReadiness(plan, makePreviewAdapterContext(plan, {
      supportedCapabilities: plan.backendRequirements
        .flatMap((requirement) => requirement.capabilities)
        .filter((capability) => capability !== 'pixel-format:yuv420p')
    }));

    expect(result.status).toBe('rejected');
    expect(result.missingRequiredCapabilities).toEqual([
      expect.objectContaining({
        id: 'capability:ffmpeg:pixel-format:yuv420p',
        capability: 'pixel-format:yuv420p',
        requirementIds: ['requirement:ffmpeg-render']
      })
    ]);
    expect(result.report.rejectionReasons).toEqual([{
      id: 'rejection:ffmpeg:missing-required-capability:pixel-format:yuv420p',
      label: 'Missing required capability pixel-format:yuv420p',
      reason: 'Preview adapter "FFmpeg command preview adapter" would produce a misleading preview without required capability "pixel-format:yuv420p".',
      severity: 'error',
      diagnosticCode: PREVIEW_ADAPTER_MISSING_REQUIRED_CAPABILITY,
      capabilityIds: ['capability:ffmpeg:pixel-format:yuv420p'],
      diagnosticIds: ['diagnostic:preview-adapter:missing-required-capability:capability:ffmpeg:pixel-format:yuv420p'],
      requirementIds: ['requirement:ffmpeg-render']
    }]);
    expect(result.report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'diagnostic:preview-adapter:missing-required-capability:capability:ffmpeg:pixel-format:yuv420p',
        code: PREVIEW_ADAPTER_MISSING_REQUIRED_CAPABILITY,
        requirementId: 'requirement:ffmpeg-render'
      })
    ]));
  });

  it('preserves render graph diagnostics in preview adapter readiness reports', () => {
    const planResult = buildCaptureReplayPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    }, makeCaptureReplayContext({
      diagnostics: [{
        eventId: 'capture-event-missing',
        path: 'captureLogs.capture-log-main.events.capture-event-missing.target.id',
        code: 'missing-reference',
        message: 'Capture event "capture-event-missing" target references missing filter "filter-missing".'
      }]
    }));

    expect(planResult.ok).toBe(true);
    if (!planResult.ok) {
      return;
    }

    const result = evaluatePreviewAdapterReadiness(planResult.plan, makePreviewAdapterContext(planResult.plan));

    expect(result.status).toBe('supported');
    expect(result.report.diagnostics).toEqual(expect.arrayContaining(planResult.plan.diagnostics));
    expect(result.report.renderGraph.diagnosticIds).toEqual(
      expect.arrayContaining(planResult.plan.diagnostics.map((diagnostic) => diagnostic.id))
    );
    expect(result.report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: CAPTURE_REPLAY_MISSING_REFERENCE,
        severity: 'error',
        path: 'captureLogs.capture-log-main.events.capture-event-missing.target.id'
      })
    ]));
  });

  it('keeps render pass cache identities reusable across output paths while deriving artifact identities from the path', () => {
    const first = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main-a.mp4'
    });
    const second = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main-b.mp4'
    });

    expect(first.cacheIdentity.key).toBe(second.cacheIdentity.key);
    expect(first.passes[0].cacheIdentity.key).toBe(second.passes[0].cacheIdentity.key);
    expect(first.artifacts[0].id).not.toBe(second.artifacts[0].id);
    expect(first.artifacts[0].cacheIdentity.key).not.toBe(second.artifacts[0].cacheIdentity.key);
  });

  it('changes derived cache identities when project content, profile, capture, archive, or toolchain inputs change', () => {
    const baseRequest = {
      outputPath: '.afterimage/preview/variant-main.mp4'
    };
    const baseKey = buildPreviewRenderGraphPlan(project, baseRequest).passes[0].cacheIdentity.key;
    const changedContentKey = buildPreviewRenderGraphPlan(parseProject({
      ...fixtureProject,
      variants: fixtureProject.variants.map((variant) => variant.id === 'variant-main'
        ? {
            ...variant,
            clips: variant.clips.map((clip, index) => index === 0 ? { ...clip, durationMs: clip.durationMs + 1 } : clip)
          }
        : variant)
    }), baseRequest).passes[0].cacheIdentity.key;
    const changedProfileKey = buildPreviewRenderGraphPlan(project, {
      ...baseRequest,
      width: 1280
    }).passes[0].cacheIdentity.key;
    const changedCaptureKey = buildPreviewRenderGraphPlan(parseProject({
      ...fixtureProject,
      captureLogs: fixtureProject.captureLogs?.map((log) => ({
        ...log,
        events: log.events.map((event) => event.id === 'capture-event-1'
          ? { ...event, captureTimeMs: event.captureTimeMs + 1, compositionTimeMs: (event.compositionTimeMs ?? event.captureTimeMs) + 1 }
          : event)
      }))
    }), baseRequest).passes[0].cacheIdentity.key;
    const changedArchiveKey = buildPreviewRenderGraphPlan(parseProject({
      ...fixtureProject,
      composition: {
        ...fixtureProject.composition,
        acceptedArchiveReferences: fixtureProject.composition.acceptedArchiveReferences?.map((reference) => ({
          ...reference,
          note: `${reference.note} Updated.`
        }))
      }
    }), baseRequest).passes[0].cacheIdentity.key;
    const changedTools: ResolvedFfmpegTools = {
      ffmpeg: {
        path: '/opt/afterimage/ffmpeg',
        source: 'env',
        envVar: 'AFTERIMAGE_FFMPEG_PATH',
        provenance: {
          source: 'env',
          license: 'LGPL',
          lgplOnly: true,
          notes: 'test ffmpeg'
        }
      },
      ffprobe: {
        path: '/opt/afterimage/ffprobe',
        source: 'env',
        envVar: 'AFTERIMAGE_FFPROBE_PATH',
        provenance: {
          source: 'env',
          license: 'LGPL',
          lgplOnly: true,
          notes: 'test ffprobe'
        }
      }
    };
    const changedToolchainKey = buildPreviewRenderGraphPlan(project, baseRequest, changedTools).passes[0].cacheIdentity.key;

    expect(changedContentKey).not.toBe(baseKey);
    expect(changedProfileKey).not.toBe(baseKey);
    expect(changedCaptureKey).not.toBe(baseKey);
    expect(changedArchiveKey).not.toBe(baseKey);
    expect(changedToolchainKey).not.toBe(baseKey);
  });

  it('builds deterministic capture replay preview and export render graph plans', () => {
    const preview = buildCaptureReplayPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    }, makeCaptureReplayContext());
    const exportPlan = buildCaptureReplayExportRenderGraphPlan(project, {
      outputPath: 'exports/studio-fixture.mov',
      profile: getExportProfileById('landscape-master')
    }, makeCaptureReplayContext());

    expect(preview.ok).toBe(true);
    expect(exportPlan.ok).toBe(true);
    if (!preview.ok || !exportPlan.ok) {
      return;
    }
    expect(preview.plan.nodes.map((node) => node.kind)).toContain('capture-replay');
    expect(preview.plan.edges.map((edge) => edge.kind)).toContain('capture-input');
    expect(preview.plan.passes[0].semantics.captureReplay).toEqual(expect.objectContaining({
      captureLogId: 'capture-log-main',
      filterOverrideCount: 1
    }));
    expect(exportPlan.plan.passes[0].semantics.captureReplay?.captureLogId).toBe('capture-log-main');
    expect(buildCaptureReplayPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    }, makeCaptureReplayContext())).toEqual(preview);
  });

  it('changes capture replay cache identities from capture context and preserves replay provenance', () => {
    const baseRequest = {
      outputPath: '.afterimage/preview/variant-main.mp4'
    };
    const livePlan = buildPreviewRenderGraphPlan(project, baseRequest);
    const capturePlan = buildCaptureReplayPreviewRenderGraphPlan(project, baseRequest, makeCaptureReplayContext());
    const changedCapturePlan = buildCaptureReplayPreviewRenderGraphPlan(project, baseRequest, makeCaptureReplayContext({
      identity: {
        ...makeCaptureReplayContext().identity,
        captureLogId: 'capture-log-alt',
        replayEventIds: ['capture-event-alt']
      },
      filterOverrides: [{
        ...makeCaptureReplayContext().filterOverrides[0],
        eventId: 'capture-event-alt',
        value: 0.5
      }]
    }));

    expect(capturePlan.ok).toBe(true);
    expect(changedCapturePlan.ok).toBe(true);
    if (!capturePlan.ok || !changedCapturePlan.ok) {
      return;
    }
    expect(capturePlan.plan.passes[0].cacheIdentity.key).not.toBe(livePlan.passes[0].cacheIdentity.key);
    expect(changedCapturePlan.plan.passes[0].cacheIdentity.key).not.toBe(capturePlan.plan.passes[0].cacheIdentity.key);
    expect(capturePlan.plan.cacheIdentity.provenance?.metadata?.captureReplay).toEqual(expect.objectContaining({
      captureSessionId: 'capture-session-main',
      captureLogId: 'capture-log-main'
    }));
  });

  it('surfaces unsupported capture replay events as render graph diagnostics while planning supported overrides', () => {
    const result = buildCaptureReplayPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    }, makeCaptureReplayContext({
      skippedEvents: [{
        eventId: 'capture-event-unsupported',
        path: 'captureLogs.capture-log-main.events.capture-event-unsupported.kind',
        code: 'unsupported-value',
        message: 'Capture event "capture-event-unsupported" kind "entropy" is not supported for render replay.'
      }]
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CAPTURE_REPLAY_UNSUPPORTED_VALUE',
        severity: 'warning',
        path: 'captureLogs.capture-log-main.events.capture-event-unsupported.kind'
      })
    ]));
    expect(result.plan.passes[0].semantics.captureReplay?.filterOverrideCount).toBe(1);
  });

  it('keeps FFmpeg compatibility diagnostics stable on preview and export render graph plans', () => {
    const preview = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    });
    const exportPlan = buildExportRenderGraphPlan(project, {
      outputPath: 'exports/studio-fixture.mov',
      profile: getExportProfileById('landscape-master')
    });

    expect(preview.diagnostics[0]).toEqual({
      id: 'diagnostic:ffmpeg-pass-boundary',
      severity: 'info',
      code: FFMPEG_PASS_COMPATIBILITY,
      message: 'Render graph planning wraps the current FFmpeg command; execution is still performed by the existing command runner.',
      nodeId: 'operation:preview:variant-main',
      passId: 'pass:ffmpeg-render',
      requirementId: 'requirement:ffmpeg-render'
    });
    expect(exportPlan.diagnostics[0]).toEqual({
      ...preview.diagnostics[0],
      nodeId: 'operation:export:variant-main'
    });
  });

  it('dedupes capture replay diagnostics deterministically and preserves graph references', () => {
    const skippedEvent = {
      eventId: 'capture-event-unsupported',
      path: 'captureLogs.capture-log-main.events.capture-event-unsupported.kind',
      code: 'unsupported-value',
      message: 'Capture event "capture-event-unsupported" kind "entropy" is not supported for render replay.'
    };
    const first = buildCaptureReplayPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    }, makeCaptureReplayContext({
      diagnostics: [skippedEvent],
      skippedEvents: [skippedEvent]
    }));
    const second = buildCaptureReplayPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    }, makeCaptureReplayContext({
      skippedEvents: [skippedEvent, skippedEvent]
    }));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    const firstReplayDiagnostics = first.plan.diagnostics.filter((diagnostic) => diagnostic.code === CAPTURE_REPLAY_UNSUPPORTED_VALUE);
    const secondReplayDiagnostics = second.plan.diagnostics.filter((diagnostic) => diagnostic.code === CAPTURE_REPLAY_UNSUPPORTED_VALUE);

    expect(firstReplayDiagnostics).toHaveLength(1);
    expect(secondReplayDiagnostics).toHaveLength(1);
    expect(firstReplayDiagnostics[0]).toEqual({
      id: secondReplayDiagnostics[0].id,
      severity: 'warning',
      code: CAPTURE_REPLAY_UNSUPPORTED_VALUE,
      message: skippedEvent.message,
      path: skippedEvent.path,
      nodeId: 'operation:preview:variant-main',
      passId: 'pass:ffmpeg-render',
      requirementId: 'requirement:ffmpeg-render'
    });
  });

  it('maps capture replay missing-reference diagnostics to errors', () => {
    const result = buildCaptureReplayPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    }, makeCaptureReplayContext({
      diagnostics: [{
        eventId: 'capture-event-missing',
        path: 'captureLogs.capture-log-main.events.capture-event-missing.target.id',
        code: 'missing-reference',
        message: 'Capture event "capture-event-missing" target references missing filter "filter-missing".'
      }]
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.plan.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: CAPTURE_REPLAY_MISSING_REFERENCE,
        path: 'captureLogs.capture-log-main.events.capture-event-missing.target.id'
      })
    ]));
  });

  it('returns capture replay planning failure diagnostics instead of throwing', () => {
    const result = buildCaptureReplayPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4',
      variantId: 'variant-missing'
    }, makeCaptureReplayContext());

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          severity: 'error',
          code: CAPTURE_REPLAY_PLANNING_FAILED,
          message: 'Sequence "sequence-main" does not define a variant.'
        })
      ]
    });
    expect(result.diagnostics[0].id).toMatch(/^diagnostic:capture-replay-planning:/);
  });

  it('routes public render command planners through FFmpeg render graph passes', () => {
    const previewRequest = {
      outputPath: '.afterimage/preview/variant-main.mp4'
    };
    const exportRequest = {
      outputPath: 'exports/studio-fixture.mov',
      profile: getExportProfileById('landscape-master')
    };
    const renderRequest = {
      outputPath: 'exports/studio-fixture-render.mov',
      profile: getExportProfileById('landscape-master')
    };

    expect(buildPreviewPlan(project, previewRequest).command)
      .toEqual(buildPreviewRenderGraphPlan(project, previewRequest).passes[0].command);
    expect(buildExportPlan(project, exportRequest).command)
      .toEqual(buildExportRenderGraphPlan(project, exportRequest).passes[0].command);
    expect(buildRenderPlan(project, renderRequest).command)
      .toEqual(buildRenderGraphPlan(project, renderRequest, renderRequest.profile, 'render').passes[0].command);
  });

  it('builds a deterministic canonical preview render graph plan', () => {
    const plan = buildPreviewRenderGraphPlan(project, {
      outputPath: '.afterimage/preview/variant-main.mp4'
    });

    expect(summarizeRenderGraphPlan(plan)).toMatchInlineSnapshot(`
      {
        "artifacts": [
          {
            "cacheKey": "c4c20d9d49008c86bed20ef7eb37073397f2388506548260dfaf8b5bafaf37f6",
            "id": "artifact:preview-output:06d5dbdfd090d816f2eed7fe2114de45cd3088e61a12a3545571b698876b4c36",
            "path": ".afterimage/preview/variant-main.mp4",
            "producedBy": "pass:ffmpeg-render",
            "role": "preview-output",
          },
        ],
        "backendRequirements": [
          {
            "backend": "ffmpeg",
            "binary": "ffmpeg",
            "capabilities": [
              "filter_complex",
              "video-codec:libx264",
              "audio-codec:aac",
              "container:mp4",
              "pixel-format:yuv420p",
            ],
            "id": "requirement:ffmpeg-render",
          },
          {
            "backend": "webgpu",
            "binary": "<runtime-placeholder>",
            "capabilities": [
              "runtime-profile:draft",
              "field-scale:half",
              "cost-budget:moderate",
              "fallback:degrade-quality",
            ],
            "id": "requirement:runtime-profile:runtime-profile-draft",
          },
          {
            "backend": "webgpu",
            "binary": "<runtime-placeholder>",
            "capabilities": [
              "field-generator:clip-luma",
            ],
            "id": "requirement:field-generator:generator-clip-luma-alpha",
          },
          {
            "backend": "external",
            "binary": "<runtime-placeholder>",
            "capabilities": [
              "capture-replay",
              "field-generator:external-capture",
            ],
            "id": "requirement:field-generator:generator-live-flights-flow",
          },
          {
            "backend": "webgpu",
            "binary": "<runtime-placeholder>",
            "capabilities": [
              "field-generator:motion-frame-difference",
            ],
            "id": "requirement:field-generator:generator-motion-frame-difference-runtime",
          },
          {
            "backend": "webgpu",
            "binary": "<runtime-placeholder>",
            "capabilities": [
              "field-generator:seeded-noise",
            ],
            "id": "requirement:field-generator:generator-seeded-noise-drift",
          },
          {
            "backend": "webgpu",
            "binary": "<runtime-placeholder>",
            "capabilities": [
              "field-sampling",
            ],
            "id": "requirement:field-sampler:sampler-bloom-heat-strength",
          },
        ],
        "cacheKey": "9df3fa833db6542f2c2c2f8be6978b5dca4b1d778baf049438e21dccedb15a65",
        "diagnostics": [
          {
            "code": "FFMPEG_PASS_COMPATIBILITY",
            "nodeId": "operation:preview:variant-main",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:ffmpeg-render",
            "severity": "info",
          },
          {
            "code": "field-runtime-high-quality-flow-unavailable",
            "nodeId": "field-generator:generator-motion-frame-difference-runtime",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:field-generator:generator-motion-frame-difference-runtime",
            "severity": "info",
          },
          {
            "code": "field-runtime-high-quality-flow-unavailable",
            "nodeId": "field-generator:generator-motion-frame-difference-runtime",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:field-generator:generator-motion-frame-difference-runtime",
            "severity": "info",
          },
          {
            "code": "field-runtime-history-window",
            "nodeId": "field-generator:generator-seeded-noise-drift",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:field-generator:generator-seeded-noise-drift",
            "severity": "info",
          },
          {
            "code": "field-runtime-persistent-ping-pong",
            "nodeId": "field-generator:generator-seeded-noise-drift",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:field-generator:generator-seeded-noise-drift",
            "severity": "info",
          },
          {
            "code": "runtime-profile-cost-budget",
            "nodeId": "field-generator:generator-live-flights-flow",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:runtime-profile:runtime-profile-draft",
            "severity": "warning",
          },
          {
            "code": "field-generator-placeholder",
            "nodeId": "field-generator:generator-clip-luma-alpha",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:field-generator:generator-clip-luma-alpha",
            "severity": "info",
          },
          {
            "code": "field-generator-placeholder",
            "nodeId": "field-generator:generator-live-flights-flow",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:field-generator:generator-live-flights-flow",
            "severity": "info",
          },
          {
            "code": "field-generator-motion-frame-difference-runtime",
            "nodeId": "field-generator:generator-motion-frame-difference-runtime",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:field-generator:generator-motion-frame-difference-runtime",
            "severity": "info",
          },
          {
            "code": "field-generator-placeholder",
            "nodeId": "field-generator:generator-seeded-noise-drift",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:field-generator:generator-seeded-noise-drift",
            "severity": "info",
          },
          {
            "code": "field-sampling-scalar-fallback",
            "nodeId": "field-consumer:filter-main-bloom:sampler-bloom-heat-strength",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:field-sampler:sampler-bloom-heat-strength",
            "severity": "warning",
          },
        ],
        "edges": [
          {
            "from": "project:project-core-engine-fixture",
            "kind": "identity",
            "metadata": undefined,
            "to": "sequence:sequence-main",
          },
          {
            "from": "sequence:sequence-main",
            "kind": "timeline",
            "metadata": undefined,
            "to": "variant:variant-main",
          },
          {
            "from": "variant:variant-main",
            "kind": "timeline",
            "metadata": undefined,
            "to": "operation:preview:variant-main",
          },
          {
            "from": "input:asset-alpha",
            "kind": "media-input",
            "metadata": {
              "inputIndex": 0,
              "loop": false,
            },
            "to": "operation:preview:variant-main",
          },
          {
            "from": "input:asset-music",
            "kind": "media-input",
            "metadata": {
              "inputIndex": 1,
              "loop": false,
            },
            "to": "operation:preview:variant-main",
          },
          {
            "from": "field-generator:generator-clip-luma-alpha",
            "kind": "field-output",
            "metadata": {
              "channels": [
                "luma",
              ],
              "fieldId": "field-heat-scene",
              "generatorId": "generator-clip-luma-alpha",
              "outputId": "output-heat",
            },
            "to": "operation:preview:variant-main",
          },
          {
            "from": "field-generator:generator-live-flights-flow",
            "kind": "field-output",
            "metadata": {
              "channels": [
                "magnitude",
              ],
              "fieldId": "field-pressure-scene",
              "generatorId": "generator-live-flights-flow",
              "outputId": "output-pressure",
            },
            "to": "operation:preview:variant-main",
          },
          {
            "from": "field-generator:generator-motion-frame-difference-runtime",
            "kind": "field-output",
            "metadata": {
              "channels": [
                "magnitude",
              ],
              "fieldId": "field-motion-source",
              "generatorId": "generator-motion-frame-difference-runtime",
              "outputId": "output-motion",
            },
            "to": "operation:preview:variant-main",
          },
          {
            "from": "field-generator:generator-motion-frame-difference-runtime",
            "kind": "field-output",
            "metadata": {
              "channels": [
                "r",
              ],
              "fieldId": "field-flow-x-scene",
              "generatorId": "generator-motion-frame-difference-runtime",
              "outputId": "output-flow-x",
            },
            "to": "operation:preview:variant-main",
          },
          {
            "from": "field-generator:generator-motion-frame-difference-runtime",
            "kind": "field-output",
            "metadata": {
              "channels": [
                "g",
              ],
              "fieldId": "field-flow-y-scene",
              "generatorId": "generator-motion-frame-difference-runtime",
              "outputId": "output-flow-y",
            },
            "to": "operation:preview:variant-main",
          },
          {
            "from": "field-generator:generator-seeded-noise-drift",
            "kind": "field-output",
            "metadata": {
              "channels": [
                "g",
                "r",
              ],
              "fieldId": "field-memory-scene",
              "generatorId": "generator-seeded-noise-drift",
              "outputId": "output-memory",
            },
            "to": "operation:preview:variant-main",
          },
          {
            "from": "field-consumer:filter-main-bloom:sampler-bloom-heat-strength",
            "kind": "field-consumer",
            "metadata": {
              "fallbackValue": 0.24,
              "fieldId": "field-heat-scene",
              "filterId": "filter-main-bloom",
              "parameter": "strength",
              "samplerId": "sampler-bloom-heat-strength",
              "stackId": "stack-sequence-main",
            },
            "to": "operation:preview:variant-main",
          },
          {
            "from": "operation:preview:variant-main",
            "kind": "artifact-output",
            "metadata": undefined,
            "to": "artifact:preview-output:06d5dbdfd090d816f2eed7fe2114de45cd3088e61a12a3545571b698876b4c36",
          },
        ],
        "identity": {
          "mode": "preview",
          "planId": "render-graph:preview:project-core-engine-fixture:sequence-main:variant-main:9df3fa833db6542f2c2c2f8be6978b5dca4b1d778baf049438e21dccedb15a65",
          "projectId": "project-core-engine-fixture",
          "schemaVersion": 1,
          "sequenceId": "sequence-main",
          "variantId": "variant-main",
        },
        "inputs": [
          {
            "assetId": "asset-alpha",
            "id": "input:asset-alpha",
            "inputIndex": 0,
            "loop": false,
            "mediaType": "video",
            "path": "fixtures/clips/source-alpha.mp4",
            "role": "source",
          },
          {
            "assetId": "asset-music",
            "id": "input:asset-music",
            "inputIndex": 1,
            "loop": false,
            "mediaType": "audio",
            "path": "fixtures/audio/score-alpha.wav",
            "role": "music",
          },
        ],
        "nodes": [
          {
            "id": "project:project-core-engine-fixture",
            "kind": "project",
          },
          {
            "id": "sequence:sequence-main",
            "kind": "sequence",
          },
          {
            "id": "variant:variant-main",
            "kind": "variant",
          },
          {
            "id": "input:asset-alpha",
            "kind": "input",
          },
          {
            "id": "input:asset-music",
            "kind": "input",
          },
          {
            "id": "field-generator:generator-clip-luma-alpha",
            "kind": "field-generator",
          },
          {
            "id": "field-generator:generator-live-flights-flow",
            "kind": "field-generator",
          },
          {
            "id": "field-generator:generator-motion-frame-difference-runtime",
            "kind": "field-generator",
          },
          {
            "id": "field-generator:generator-seeded-noise-drift",
            "kind": "field-generator",
          },
          {
            "id": "field-consumer:filter-main-bloom:sampler-bloom-heat-strength",
            "kind": "field-consumer",
          },
          {
            "id": "operation:preview:variant-main",
            "kind": "operation",
          },
          {
            "id": "artifact:preview-output:06d5dbdfd090d816f2eed7fe2114de45cd3088e61a12a3545571b698876b4c36",
            "kind": "artifact",
          },
        ],
        "pass": {
          "backend": "ffmpeg",
          "cacheKey": "a0952a27541fd098a1f216c612096b6de9649f5317b81b3900d5623e774bb3d4",
          "command": {
            "args": [
              "-y",
              "-i",
              "fixtures/clips/source-alpha.mp4",
              "-i",
              "fixtures/audio/score-alpha.wav",
              "-filter_complex",
              "[0:v]trim=start=0.500:duration=2.000,setpts=PTS-STARTPTS,gblur=sigma=1.440,eq=contrast=1.020:brightness=0.020:saturation=1.013,gblur=sigma=2.150,chromashift=cbh=3:crh=-3:edge=smear,eq=saturation=1.030,fps=24.000,scale=960:540,setsar=1,format=yuv420p[v0];[v0]concat=n=1:v=1:a=0[vconcat];[vconcat]tpad=stop_mode=clone:stop_duration=3.000,trim=duration=5.000,fade=t=out:st=3.000:d=2.000,format=yuv420p[vout];[1:a]atrim=start=0:duration=5.000,asetpts=PTS-STARTPTS[amusic]",
              "-map",
              "[vout]",
              "-c:v",
              "libx264",
              "-preset",
              "fast",
              "-crf",
              "26",
              "-map",
              "[amusic]",
              "-c:a",
              "aac",
              "-b:a",
              "128k",
              "-f",
              "mp4",
              ".afterimage/preview/variant-main.mp4",
            ],
            "binary": "ffmpeg",
            "expectedOutputs": [
              ".afterimage/preview/variant-main.mp4",
            ],
            "label": "render:project-core-engine-fixture:variant-main",
          },
          "id": "pass:ffmpeg-render",
          "inputNodeIds": [
            "input:asset-alpha",
            "input:asset-music",
            "field-generator:generator-clip-luma-alpha",
            "field-generator:generator-live-flights-flow",
            "field-generator:generator-motion-frame-difference-runtime",
            "field-generator:generator-seeded-noise-drift",
            "field-consumer:filter-main-bloom:sampler-bloom-heat-strength",
          ],
          "nodeId": "operation:preview:variant-main",
          "outputArtifactIds": [
            "artifact:preview-output:06d5dbdfd090d816f2eed7fe2114de45cd3088e61a12a3545571b698876b4c36",
          ],
          "semantics": {
            "chunkedExportRecommended": false,
            "durationMs": 5000,
            "operation": "preview",
            "profile": {
              "audioBitrateKbps": 128,
              "audioCodec": "aac",
              "container": "mp4",
              "crf": 26,
              "frameRate": 24,
              "height": 540,
              "pixelFormat": "yuv420p",
              "videoCodec": "libx264",
              "videoPreset": "fast",
              "width": 960,
            },
            "usesMaskTransitions": false,
          },
        },
        "target": {
          "durationMs": 5000,
          "outputPath": ".afterimage/preview/variant-main.mp4",
          "profile": {
            "audioBitrateKbps": 128,
            "audioCodec": "aac",
            "container": "mp4",
            "crf": 26,
            "frameRate": 24,
            "height": 540,
            "pixelFormat": "yuv420p",
            "videoCodec": "libx264",
            "videoPreset": "fast",
            "width": 960,
          },
          "runtimeProfile": {
            "fallbackPreference": "degrade-quality",
            "fieldScalePreset": "half",
            "id": "runtime-profile-draft",
            "kind": "draft",
            "label": "Draft",
            "maxCostClass": "moderate",
            "maxPasses": 4,
            "memoryBudgetMb": 128,
            "targetFps": 30,
          },
        },
      }
    `);
  });

  it('builds a deterministic canonical export render graph plan', () => {
    const plan = buildExportRenderGraphPlan(project, {
      outputPath: 'exports/studio-fixture.mov',
      profile: getExportProfileById('landscape-master')
    });

    expect(summarizeRenderGraphPlan(plan)).toMatchInlineSnapshot(`
      {
        "artifacts": [
          {
            "cacheKey": "717ed4b4b73f21e02e0c1188ed080e60b1e498e53e49be3bc1487fec8a143b36",
            "id": "artifact:export-output:e5224f5e3b3c2e62f400f5fb6c0e7041bb1b4d1fc50eb190aeb0e0b06c355af4",
            "path": "exports/studio-fixture.mov",
            "producedBy": "pass:ffmpeg-render",
            "role": "export-output",
          },
        ],
        "backendRequirements": [
          {
            "backend": "ffmpeg",
            "binary": "ffmpeg",
            "capabilities": [
              "filter_complex",
              "video-codec:libx264",
              "audio-codec:aac",
              "container:mp4",
              "pixel-format:yuv420p",
            ],
            "id": "requirement:ffmpeg-render",
          },
          {
            "backend": "webgpu",
            "binary": "<runtime-placeholder>",
            "capabilities": [
              "runtime-profile:render",
              "field-scale:source",
              "cost-budget:dangerous",
              "fallback:fail-fast",
            ],
            "id": "requirement:runtime-profile:runtime-profile-render",
          },
          {
            "backend": "webgpu",
            "binary": "<runtime-placeholder>",
            "capabilities": [
              "field-generator:clip-luma",
            ],
            "id": "requirement:field-generator:generator-clip-luma-alpha",
          },
          {
            "backend": "external",
            "binary": "<runtime-placeholder>",
            "capabilities": [
              "capture-replay",
              "field-generator:external-capture",
            ],
            "id": "requirement:field-generator:generator-live-flights-flow",
          },
          {
            "backend": "webgpu",
            "binary": "<runtime-placeholder>",
            "capabilities": [
              "field-generator:motion-frame-difference",
            ],
            "id": "requirement:field-generator:generator-motion-frame-difference-runtime",
          },
          {
            "backend": "webgpu",
            "binary": "<runtime-placeholder>",
            "capabilities": [
              "field-generator:seeded-noise",
            ],
            "id": "requirement:field-generator:generator-seeded-noise-drift",
          },
          {
            "backend": "webgpu",
            "binary": "<runtime-placeholder>",
            "capabilities": [
              "field-sampling",
            ],
            "id": "requirement:field-sampler:sampler-bloom-heat-strength",
          },
        ],
        "cacheKey": "865985df737dcdf4860da1c2b207ada9673d40ed1f7fa835e7d051652a12a685",
        "diagnostics": [
          {
            "code": "FFMPEG_PASS_COMPATIBILITY",
            "nodeId": "operation:export:variant-main",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:ffmpeg-render",
            "severity": "info",
          },
          {
            "code": "field-runtime-high-quality-flow-unavailable",
            "nodeId": "field-generator:generator-motion-frame-difference-runtime",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:field-generator:generator-motion-frame-difference-runtime",
            "severity": "info",
          },
          {
            "code": "field-runtime-high-quality-flow-unavailable",
            "nodeId": "field-generator:generator-motion-frame-difference-runtime",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:field-generator:generator-motion-frame-difference-runtime",
            "severity": "info",
          },
          {
            "code": "field-runtime-history-window",
            "nodeId": "field-generator:generator-seeded-noise-drift",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:field-generator:generator-seeded-noise-drift",
            "severity": "info",
          },
          {
            "code": "field-runtime-persistent-ping-pong",
            "nodeId": "field-generator:generator-seeded-noise-drift",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:field-generator:generator-seeded-noise-drift",
            "severity": "info",
          },
          {
            "code": "field-generator-placeholder",
            "nodeId": "field-generator:generator-clip-luma-alpha",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:field-generator:generator-clip-luma-alpha",
            "severity": "info",
          },
          {
            "code": "field-generator-placeholder",
            "nodeId": "field-generator:generator-live-flights-flow",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:field-generator:generator-live-flights-flow",
            "severity": "info",
          },
          {
            "code": "field-generator-motion-frame-difference-runtime",
            "nodeId": "field-generator:generator-motion-frame-difference-runtime",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:field-generator:generator-motion-frame-difference-runtime",
            "severity": "info",
          },
          {
            "code": "field-generator-placeholder",
            "nodeId": "field-generator:generator-seeded-noise-drift",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:field-generator:generator-seeded-noise-drift",
            "severity": "info",
          },
          {
            "code": "field-sampling-scalar-fallback",
            "nodeId": "field-consumer:filter-main-bloom:sampler-bloom-heat-strength",
            "passId": "pass:ffmpeg-render",
            "requirementId": "requirement:field-sampler:sampler-bloom-heat-strength",
            "severity": "warning",
          },
        ],
        "edges": [
          {
            "from": "project:project-core-engine-fixture",
            "kind": "identity",
            "metadata": undefined,
            "to": "sequence:sequence-main",
          },
          {
            "from": "sequence:sequence-main",
            "kind": "timeline",
            "metadata": undefined,
            "to": "variant:variant-main",
          },
          {
            "from": "variant:variant-main",
            "kind": "timeline",
            "metadata": undefined,
            "to": "operation:export:variant-main",
          },
          {
            "from": "input:asset-alpha",
            "kind": "media-input",
            "metadata": {
              "inputIndex": 0,
              "loop": false,
            },
            "to": "operation:export:variant-main",
          },
          {
            "from": "input:asset-music",
            "kind": "media-input",
            "metadata": {
              "inputIndex": 1,
              "loop": false,
            },
            "to": "operation:export:variant-main",
          },
          {
            "from": "field-generator:generator-clip-luma-alpha",
            "kind": "field-output",
            "metadata": {
              "channels": [
                "luma",
              ],
              "fieldId": "field-heat-scene",
              "generatorId": "generator-clip-luma-alpha",
              "outputId": "output-heat",
            },
            "to": "operation:export:variant-main",
          },
          {
            "from": "field-generator:generator-live-flights-flow",
            "kind": "field-output",
            "metadata": {
              "channels": [
                "magnitude",
              ],
              "fieldId": "field-pressure-scene",
              "generatorId": "generator-live-flights-flow",
              "outputId": "output-pressure",
            },
            "to": "operation:export:variant-main",
          },
          {
            "from": "field-generator:generator-motion-frame-difference-runtime",
            "kind": "field-output",
            "metadata": {
              "channels": [
                "magnitude",
              ],
              "fieldId": "field-motion-source",
              "generatorId": "generator-motion-frame-difference-runtime",
              "outputId": "output-motion",
            },
            "to": "operation:export:variant-main",
          },
          {
            "from": "field-generator:generator-motion-frame-difference-runtime",
            "kind": "field-output",
            "metadata": {
              "channels": [
                "r",
              ],
              "fieldId": "field-flow-x-scene",
              "generatorId": "generator-motion-frame-difference-runtime",
              "outputId": "output-flow-x",
            },
            "to": "operation:export:variant-main",
          },
          {
            "from": "field-generator:generator-motion-frame-difference-runtime",
            "kind": "field-output",
            "metadata": {
              "channels": [
                "g",
              ],
              "fieldId": "field-flow-y-scene",
              "generatorId": "generator-motion-frame-difference-runtime",
              "outputId": "output-flow-y",
            },
            "to": "operation:export:variant-main",
          },
          {
            "from": "field-generator:generator-seeded-noise-drift",
            "kind": "field-output",
            "metadata": {
              "channels": [
                "g",
                "r",
              ],
              "fieldId": "field-memory-scene",
              "generatorId": "generator-seeded-noise-drift",
              "outputId": "output-memory",
            },
            "to": "operation:export:variant-main",
          },
          {
            "from": "field-consumer:filter-main-bloom:sampler-bloom-heat-strength",
            "kind": "field-consumer",
            "metadata": {
              "fallbackValue": 0.24,
              "fieldId": "field-heat-scene",
              "filterId": "filter-main-bloom",
              "parameter": "strength",
              "samplerId": "sampler-bloom-heat-strength",
              "stackId": "stack-sequence-main",
            },
            "to": "operation:export:variant-main",
          },
          {
            "from": "operation:export:variant-main",
            "kind": "artifact-output",
            "metadata": undefined,
            "to": "artifact:export-output:e5224f5e3b3c2e62f400f5fb6c0e7041bb1b4d1fc50eb190aeb0e0b06c355af4",
          },
        ],
        "identity": {
          "mode": "export",
          "planId": "render-graph:export:project-core-engine-fixture:sequence-main:variant-main:865985df737dcdf4860da1c2b207ada9673d40ed1f7fa835e7d051652a12a685",
          "projectId": "project-core-engine-fixture",
          "schemaVersion": 1,
          "sequenceId": "sequence-main",
          "variantId": "variant-main",
        },
        "inputs": [
          {
            "assetId": "asset-alpha",
            "id": "input:asset-alpha",
            "inputIndex": 0,
            "loop": false,
            "mediaType": "video",
            "path": "fixtures/clips/source-alpha.mp4",
            "role": "source",
          },
          {
            "assetId": "asset-music",
            "id": "input:asset-music",
            "inputIndex": 1,
            "loop": false,
            "mediaType": "audio",
            "path": "fixtures/audio/score-alpha.wav",
            "role": "music",
          },
        ],
        "nodes": [
          {
            "id": "project:project-core-engine-fixture",
            "kind": "project",
          },
          {
            "id": "sequence:sequence-main",
            "kind": "sequence",
          },
          {
            "id": "variant:variant-main",
            "kind": "variant",
          },
          {
            "id": "input:asset-alpha",
            "kind": "input",
          },
          {
            "id": "input:asset-music",
            "kind": "input",
          },
          {
            "id": "field-generator:generator-clip-luma-alpha",
            "kind": "field-generator",
          },
          {
            "id": "field-generator:generator-live-flights-flow",
            "kind": "field-generator",
          },
          {
            "id": "field-generator:generator-motion-frame-difference-runtime",
            "kind": "field-generator",
          },
          {
            "id": "field-generator:generator-seeded-noise-drift",
            "kind": "field-generator",
          },
          {
            "id": "field-consumer:filter-main-bloom:sampler-bloom-heat-strength",
            "kind": "field-consumer",
          },
          {
            "id": "operation:export:variant-main",
            "kind": "operation",
          },
          {
            "id": "artifact:export-output:e5224f5e3b3c2e62f400f5fb6c0e7041bb1b4d1fc50eb190aeb0e0b06c355af4",
            "kind": "artifact",
          },
        ],
        "pass": {
          "backend": "ffmpeg",
          "cacheKey": "32502430c53a7a94159977ee88d60d46d243ca845a5fb5518040c5d361617dae",
          "command": {
            "args": [
              "-y",
              "-i",
              "fixtures/clips/source-alpha.mp4",
              "-i",
              "fixtures/audio/score-alpha.wav",
              "-filter_complex",
              "[0:v]trim=start=0.500:duration=2.000,setpts=PTS-STARTPTS,gblur=sigma=1.440,eq=contrast=1.020:brightness=0.020:saturation=1.013,gblur=sigma=2.150,chromashift=cbh=3:crh=-3:edge=smear,eq=saturation=1.030,fps=30.000,scale=1920:1080,setsar=1,format=yuv420p[v0];[v0]concat=n=1:v=1:a=0[vconcat];[vconcat]tpad=stop_mode=clone:stop_duration=3.000,trim=duration=5.000,fade=t=out:st=3.000:d=2.000,format=yuv420p[vout];[1:a]atrim=start=0:duration=5.000,asetpts=PTS-STARTPTS[amusic]",
              "-map",
              "[vout]",
              "-c:v",
              "libx264",
              "-preset",
              "medium",
              "-crf",
              "18",
              "-maxrate",
              "12000k",
              "-bufsize",
              "24000k",
              "-map",
              "[amusic]",
              "-c:a",
              "aac",
              "-b:a",
              "256k",
              "-f",
              "mp4",
              "exports/studio-fixture.mov",
            ],
            "binary": "ffmpeg",
            "expectedOutputs": [
              "exports/studio-fixture.mov",
            ],
            "label": "render:project-core-engine-fixture:variant-main",
          },
          "id": "pass:ffmpeg-render",
          "inputNodeIds": [
            "input:asset-alpha",
            "input:asset-music",
            "field-generator:generator-clip-luma-alpha",
            "field-generator:generator-live-flights-flow",
            "field-generator:generator-motion-frame-difference-runtime",
            "field-generator:generator-seeded-noise-drift",
            "field-consumer:filter-main-bloom:sampler-bloom-heat-strength",
          ],
          "nodeId": "operation:export:variant-main",
          "outputArtifactIds": [
            "artifact:export-output:e5224f5e3b3c2e62f400f5fb6c0e7041bb1b4d1fc50eb190aeb0e0b06c355af4",
          ],
          "semantics": {
            "chunkedExportRecommended": false,
            "durationMs": 5000,
            "operation": "export",
            "profile": {
              "audioBitrateKbps": 256,
              "audioCodec": "aac",
              "container": "mp4",
              "crf": 18,
              "frameRate": 30,
              "height": 1080,
              "pixelFormat": "yuv420p",
              "videoBufsizeKbps": 24000,
              "videoCodec": "libx264",
              "videoMaxrateKbps": 12000,
              "videoPreset": "medium",
              "width": 1920,
            },
            "usesMaskTransitions": false,
          },
        },
        "target": {
          "durationMs": 5000,
          "outputPath": "exports/studio-fixture.mov",
          "profile": {
            "audioBitrateKbps": 256,
            "audioCodec": "aac",
            "container": "mp4",
            "crf": 18,
            "frameRate": 30,
            "height": 1080,
            "pixelFormat": "yuv420p",
            "videoBufsizeKbps": 24000,
            "videoCodec": "libx264",
            "videoMaxrateKbps": 12000,
            "videoPreset": "medium",
            "width": 1920,
          },
          "runtimeProfile": {
            "fallbackPreference": "fail-fast",
            "fieldScalePreset": "source",
            "id": "runtime-profile-render",
            "kind": "render",
            "label": "Render",
            "maxCostClass": "dangerous",
            "maxPasses": 16,
            "memoryBudgetMb": 1024,
            "targetFps": 24,
          },
        },
      }
    `);
  });

  it('resolves ffmpeg binaries from env override and PATH fallback', () => {
    const fakeBinDir = mkdtempSync(join(tmpdir(), 'afterimage-ffmpeg-'));
    const ffmpegPath = join(fakeBinDir, 'ffmpeg');
    const ffprobePath = join(fakeBinDir, 'ffprobe');

    writeFileSync(ffmpegPath, '#!/bin/sh\nexit 0\n', 'utf8');
    writeFileSync(ffprobePath, '#!/bin/sh\nexit 0\n', 'utf8');
    chmodSync(ffmpegPath, 0o755);
    chmodSync(ffprobePath, 0o755);

    const envResolved = resolveFfmpegTools({
      env: {
        PATH: '',
        AFTERIMAGE_FFMPEG_PATH: '/custom/ffmpeg',
        AFTERIMAGE_FFPROBE_PATH: '/custom/ffprobe'
      }
    });

    expect(envResolved.ffmpeg.path).toBe('/custom/ffmpeg');
    expect(envResolved.ffprobe.path).toBe('/custom/ffprobe');

    const pathResolved = resolveFfmpegTools({
      env: {
        PATH: fakeBinDir
      }
    });

    expect(pathResolved.ffmpeg.path).toBe(ffmpegPath);
    expect(pathResolved.ffprobe.path).toBe(ffprobePath);
  });

  it('executes command specs and probes toolchain health through injected runners', async () => {
    const result = await executeCommandSpec(
      {
        label: 'mock-command',
        binary: 'ffmpeg',
        args: ['-version']
      },
      {
        runner: async (binary, args): Promise<CommandExecutionResult> => ({
          exitCode: binary === 'ffmpeg' && args[0] === '-version' ? 0 : 1,
          stdout: 'ffmpeg version n6.1',
          stderr: ''
        })
      }
    );

    expect(result.stdout).toContain('ffmpeg version');

    const health = await getToolchainHealth({
      ffmpeg: {
        path: '/custom/ffmpeg',
        source: 'env',
        provenance: {
          source: 'env',
          license: 'LGPL',
          lgplOnly: true,
          notes: 'test'
        }
      },
      ffprobe: {
        path: '/custom/ffprobe',
        source: 'env',
        provenance: {
          source: 'env',
          license: 'LGPL',
          lgplOnly: true,
          notes: 'test'
        }
      }
    }, {
      runner: async (binary): Promise<CommandExecutionResult> => ({
        exitCode: 0,
        stdout: `${binary} version test`,
        stderr: ''
      })
    });

    expect(health.available).toBe(true);
    expect(health.versions.ffmpeg.versionLine).toContain('/custom/ffmpeg version test');
  });

  it('renders automation as deterministic clip segments instead of a midpoint snapshot', () => {
    const plan = buildRenderPlan(parseProject({
      ...fixtureProject,
      filterStacks: [
        {
          ...fixtureProject.filterStacks[0],
          filters: [
            {
              id: 'filter-main-bloom',
              type: 'bloom-soft',
              enabled: true,
              orderIndex: 0,
              parameters: {
                strength: 0.2
              },
              mix: 1,
              automationLaneIds: ['lane-bloom-strength']
            }
          ]
        }
      ],
      automationLanes: [
        {
          id: 'lane-bloom-strength',
          name: 'Bloom Strength',
          target: {
            filterId: 'filter-main-bloom',
            property: 'strength'
          },
          enabled: true,
          keyframes: [
            {
              id: 'keyframe-1',
              timeMs: 0,
              value: 0.1
            },
            {
              id: 'keyframe-2',
              timeMs: 1000,
              value: 0.6
            },
            {
              id: 'keyframe-3',
              timeMs: 2000,
              value: 0.9
            }
          ]
        }
      ]
    }), {
      outputPath: 'exports/studio-fixture-automation.mov',
      profile: {
        width: 1920,
        height: 1080,
        frameRate: 30,
        container: 'mov',
        videoCodec: 'prores_ks',
        audioCodec: 'pcm_s24le',
        pixelFormat: 'yuv422p10le'
      }
    });

    expect(plan.command.args).toContain('exports/studio-fixture-automation.mov');
    expect(plan.command.args.join(' ')).toContain('concat=n=2:v=1:a=0[vconcat]');
    expect(plan.command.args.join(' ')).toContain('gblur=sigma=2.350,eq=contrast=1.042:brightness=0.042:saturation=1.028');
    expect(plan.command.args.join(' ')).toContain('gblur=sigma=4.350,eq=contrast=1.090:brightness=0.090:saturation=1.060');
    expect(plan.command.args.join(' ')).toContain('fade=t=out:st=3.000:d=2.000');
  });

  it('compiles signal breakup as visible temporal noise', () => {
    const plan = buildPreviewPlan(parseProject(withoutCaptureReplayReferences({
      ...fixtureProject,
      filterStacks: [
        {
          ...fixtureProject.filterStacks[0],
          filters: [
            {
              id: 'filter-signal-breakup',
              type: 'glitch-bands',
              enabled: true,
              orderIndex: 0,
              parameters: {
                strength: 1
              },
              mix: 1
            }
          ]
        }
      ],
      automationLanes: []
    })), {
      outputPath: '.afterimage/preview/variant-signal-breakup.mp4'
    });

    expect(plan.command.args.join(' ')).toContain('noise=alls=100.0:allf=t+u,tblend=all_mode=difference:all_opacity=0.300');
  });

  it.each([
    ['contrast', { contrast: 1 }, 'eq=contrast=2.000'],
    ['brightness', { brightness: 1 }, 'eq=brightness=0.250'],
    ['blur', { radius: 1 }, 'gblur=sigma=5.400'],
    ['bloom-soft', { strength: 1 }, 'gblur=sigma=5.600,eq=contrast=1.120:brightness=0.120:saturation=1.080'],
    ['glitch-bands', { strength: 1 }, 'noise=alls=100.0:allf=t+u,tblend=all_mode=difference:all_opacity=0.300'],
    ['chroma-bleed', { strength: 1 }, 'chromashift=cbh=12:crh=-12:edge=smear,eq=saturation=1.120']
  ] satisfies [SupportedFilterType, Record<string, number>, string][])('compiles %s into an active video filter', (type, parameters, expectedExpression) => {
    const filter: FilterInstance = {
      id: `filter-${type}`,
      type,
      enabled: true,
      orderIndex: 0,
      parameters,
      mix: 1
    };
    const plan = buildPreviewPlan(parseProject(withoutCaptureReplayReferences({
      ...fixtureProject,
      filterStacks: [
        {
          ...fixtureProject.filterStacks[0],
          filters: [filter]
        }
      ],
      automationLanes: []
    })), {
      outputPath: `.afterimage/preview/variant-${type}.mp4`
    });

    expect(plan.command.args.join(' ')).toContain(expectedExpression);
  });

  it('builds asset-backed mask transitions with optional overlay assets', () => {
    const plan = buildPreviewPlan(parseProject({
      ...fixtureProject,
      assets: [
        ...fixtureProject.assets,
        {
          id: 'asset-beta',
          filename: 'source-beta.mp4',
          mediaType: 'video',
          path: {
            absolutePath: 'fixtures/clips/source-beta.mp4',
            relativePath: 'clips/source-beta.mp4'
          },
          durationMs: 2000,
          width: 1920,
          height: 1080,
          frameRate: 24,
          hasAudio: true
        },
        {
          id: 'asset-transition-mask',
          filename: 'mask-alpha.mp4',
          mediaType: 'video',
          path: {
            absolutePath: 'fixtures/transitions/mask-alpha.mp4',
            relativePath: 'transitions/mask-alpha.mp4'
          },
          durationMs: 750,
          width: 640,
          height: 360,
          frameRate: 15,
          hasAudio: false
        },
        {
          id: 'asset-transition-overlay',
          filename: 'overlay-alpha.mp4',
          mediaType: 'video',
          path: {
            absolutePath: 'fixtures/transitions/overlay-alpha.mp4',
            relativePath: 'transitions/overlay-alpha.mp4'
          },
          durationMs: 750,
          width: 640,
          height: 360,
          frameRate: 15,
          hasAudio: false
        }
      ],
      variants: [
        {
          ...fixtureProject.variants[0],
          clips: [
            {
              ...fixtureProject.variants[0].clips[0],
              transition: 'mask',
              transitionDurationMs: 500,
              transitionAssetId: 'asset-transition-mask',
              transitionOverlayAssetId: 'asset-transition-overlay'
            },
            {
              id: 'clip-second',
              assetId: 'asset-beta',
              timelineStartMs: 2000,
              sourceStartMs: 0,
              durationMs: 2000,
              transition: 'cut'
            }
          ]
        }
      ]
    }), {
      outputPath: '.afterimage/preview/variant-mask.mp4'
    });

    const command = plan.command.args.join(' ');
    expect(plan.command.args).toContain('fixtures/transitions/mask-alpha.mp4');
    expect(plan.command.args).toContain('fixtures/transitions/overlay-alpha.mp4');
    expect(command).toContain('maskedmerge');
    expect(command).toContain("blend=c0_expr='min(255,A+B*0.28)':c1_expr='A':c2_expr='A'");
    expect(command).toContain('concat=n=3:v=1:a=0[vconcat]');
    expect(command).toContain('tpad=stop_mode=clone:stop_duration=1.500');
    expect(command).toContain('fade=t=out:st=3.000:d=2.000');
    expect(command).toContain('atrim=start=0:duration=5.000');
  });

  it('builds standalone clip overlays independently of transitions', () => {
    const plan = buildPreviewPlan(parseProject({
      ...fixtureProject,
      assets: [
        ...fixtureProject.assets,
        {
          id: 'asset-overlay',
          filename: 'foam-overlay.mp4',
          mediaType: 'video',
          assetRole: 'transition-overlay',
          path: {
            absolutePath: 'fixtures/overlays/foam-overlay.mp4',
            relativePath: 'overlays/foam-overlay.mp4'
          },
          durationMs: 750,
          width: 640,
          height: 360,
          frameRate: 15,
          hasAudio: false
        }
      ],
      variants: [
        {
          ...fixtureProject.variants[0],
          clips: fixtureProject.variants[0].clips.map((clip) => ({
            ...clip,
            overlayAssetId: 'asset-overlay'
          }))
        }
      ]
    }), {
      outputPath: '.afterimage/preview/variant-overlay.mp4'
    });

    const command = plan.command.args.join(' ');
    expect(plan.command.args).toContain('-stream_loop');
    expect(plan.command.args).toContain('fixtures/overlays/foam-overlay.mp4');
    expect(command).toContain("blend=c0_expr='min(255,A+B*0.28)':c1_expr='A':c2_expr='A'");
  });

  it('carries x264 bitrate ceilings through export and chunk finalization plans', () => {
    const profile = getExportProfileById('landscape-master');
    const exportArgs = buildExportPlan(project, {
      outputPath: 'exports/studio-fixture.mp4',
      profile
    }).command.args;
    const finalizeArgs = buildFinalizeRenderPlan({
      concatListPath: '.afterimage/render/chunks.txt',
      outputPath: 'exports/studio-fixture.mp4',
      profile,
      durationMs: 5000
    });

    expect(exportArgs).toEqual(expect.arrayContaining(['-maxrate', '12000k', '-bufsize', '24000k']));
    expect(finalizeArgs.command.args).toEqual(expect.arrayContaining(['-maxrate', '12000k', '-bufsize', '24000k']));
    expect(finalizeArgs.outputPath).toBe('exports/studio-fixture.mp4');
    expect(finalizeArgs.cacheIdentity.status).toBe('derived');
    expect(finalizeArgs.cacheIdentity.invalidatesOn).toEqual(expect.arrayContaining(['concat-list', 'ffmpeg-toolchain']));
    expect(finalizeArgs.artifact.role).toBe('finalize-output');
    expect(finalizeArgs.artifact.path).toBe('exports/studio-fixture.mp4');
    expect(finalizeArgs.artifact.provenance.parentCacheKeys).toContain(finalizeArgs.cacheIdentity.key);
  });

  it('trims overlay and transition assets from selected cut starts', () => {
    const plan = buildPreviewPlan(parseProject({
      ...fixtureProject,
      assets: [
        ...fixtureProject.assets,
        {
          id: 'asset-mask-cut',
          filename: 'mask-cut.mp4',
          mediaType: 'video',
          assetRole: 'transition-mask',
          path: {
            absolutePath: 'fixtures/transitions/mask-cut.mp4'
          },
          durationMs: 1200,
          hasAudio: false
        },
        {
          id: 'asset-overlay-cut',
          filename: 'overlay-cut.mp4',
          mediaType: 'video',
          assetRole: 'transition-overlay',
          path: {
            absolutePath: 'fixtures/overlays/overlay-cut.mp4'
          },
          durationMs: 1200,
          hasAudio: false
        }
      ],
      cutCandidates: [
        ...(fixtureProject.cutCandidates ?? []),
        { id: 'cut-mask', assetId: 'asset-mask-cut', startMs: 250, endMs: 750, durationMs: 500 },
        { id: 'cut-overlay', assetId: 'asset-overlay-cut', startMs: 125, endMs: 625, durationMs: 500 }
      ],
      variants: [
        {
          ...fixtureProject.variants[0],
          clips: [
            {
              ...fixtureProject.variants[0].clips[0],
              overlayAssetId: 'asset-overlay-cut',
              overlayCutId: 'cut-overlay',
              transition: 'mask',
              transitionDurationMs: 500,
              transitionAssetId: 'asset-mask-cut',
              transitionCutId: 'cut-mask',
              transitionOverlayAssetId: 'asset-overlay-cut',
              transitionOverlayCutId: 'cut-overlay'
            },
            {
              id: 'clip-second',
              assetId: 'asset-alpha',
              cutId: 'cut-push',
              timelineStartMs: 2000,
              sourceStartMs: 2500,
              durationMs: 2000,
              transition: 'cut'
            }
          ]
        }
      ]
    }), {
      outputPath: '.afterimage/preview/variant-overlay-cuts.mp4'
    });

    const command = plan.command.args.join(' ');
    expect(command).toContain('trim=start=0.125:duration=');
    expect(command).toContain('trim=start=0.250:duration=');
  });
});
