import type {
  FieldGeneratorManifest,
  FieldParameterSampler,
  NormalizedProjectFile,
  ProjectFile,
  RuntimeCostClass,
  SpatialFieldRuntimeDiagnostic,
  RuntimePerformanceProfile
} from '@afterimage/project-model';
import { buildSpatialFieldRuntimePlan } from '@afterimage/project-model';
import { createCacheIdentity, hashIdentity } from './identity.js';
import {
  buildRenderCommand,
  collectRenderInputs,
  getTargetRenderDurationMs,
  shouldUseChunkedExport,
  usesMaskTransitions
} from './render.js';
import type {
  ExportRequest,
  PreviewPlan,
  PreviewRequest,
  RenderGraphArtifact,
  RenderGraphArtifactRole,
  RenderGraphBackendRequirement,
  RenderGraphCapabilityDiagnostic,
  RenderGraphInputReference,
  RenderGraphNode,
  RenderGraphPass,
  RenderGraphPlan,
  RenderGraphPlanMode,
  RenderGraphProvenance,
  RenderGraphToolchainIdentity,
  CaptureReplayRenderContext,
  CaptureReplayRenderGraphPlanResult,
  RenderPlan,
  RenderProfile,
  RenderRequest,
  ResolvedFfmpegTools
} from './types.js';
import {
  buildCaptureReplayDiagnostics,
  buildCaptureReplayPlanningFailureDiagnostic,
  buildFfmpegCompatibilityDiagnostic
} from './diagnostics.js';
import { ensureAsset, makePlanningTools, normalizeForPlanning, resolveTimeline } from './utils.js';

function withoutUndefinedEntries<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

const runtimeCostRank: Record<RuntimeCostClass, number> = {
  cheap: 0,
  moderate: 1,
  expensive: 2,
  dangerous: 3
};

function exceedsRuntimeBudget(costClass: RuntimeCostClass, profile: RuntimePerformanceProfile): boolean {
  return runtimeCostRank[costClass] > runtimeCostRank[profile.maxCostClass];
}

function normalizeRenderProfileForGraph(profile: RenderProfile): RenderProfile {
  return {
    width: profile.width,
    height: profile.height,
    frameRate: profile.frameRate,
    container: profile.container,
    videoCodec: profile.videoCodec,
    audioCodec: profile.audioCodec,
    pixelFormat: profile.pixelFormat,
    ...(profile.videoProfile !== undefined ? { videoProfile: profile.videoProfile } : {}),
    ...(profile.crf !== undefined ? { crf: profile.crf } : {}),
    ...(profile.videoPreset !== undefined ? { videoPreset: profile.videoPreset } : {}),
    ...(profile.videoMaxrateKbps !== undefined ? { videoMaxrateKbps: profile.videoMaxrateKbps } : {}),
    ...(profile.videoBufsizeKbps !== undefined ? { videoBufsizeKbps: profile.videoBufsizeKbps } : {}),
    ...(profile.audioBitrateKbps !== undefined ? { audioBitrateKbps: profile.audioBitrateKbps } : {})
  };
}

function toRenderProfile(request: PreviewRequest | ExportRequest | RenderRequest, mode: RenderGraphPlanMode): RenderProfile {
  if (mode === 'preview') {
    const previewRequest = request as PreviewRequest;
    return {
      width: previewRequest.width ?? 960,
      height: previewRequest.height ?? 540,
      frameRate: previewRequest.frameRate ?? 24,
      container: 'mp4',
      videoCodec: 'libx264',
      audioCodec: 'aac',
      pixelFormat: 'yuv420p',
      crf: 26,
      videoPreset: 'fast',
      audioBitrateKbps: 128
    };
  }

  if (mode === 'export') {
    const profile = (request as ExportRequest).profile;
    return normalizeRenderProfileForGraph({
      width: profile.width,
      height: profile.height,
      frameRate: profile.frameRate,
      container: profile.container,
      videoCodec: profile.videoCodec,
      audioCodec: profile.audioCodec,
      pixelFormat: profile.pixelFormat,
      videoProfile: profile.videoProfile,
      crf: profile.crf,
      videoPreset: profile.videoPreset,
      videoMaxrateKbps: profile.videoMaxrateKbps,
      videoBufsizeKbps: profile.videoBufsizeKbps,
      audioBitrateKbps: profile.audioBitrateKbps
    });
  }

  return normalizeRenderProfileForGraph((request as RenderRequest).profile);
}

function selectRuntimePerformanceProfile(
  project: NormalizedProjectFile,
  request: PreviewRequest | ExportRequest | RenderRequest,
  mode: RenderGraphPlanMode
): RuntimePerformanceProfile | undefined {
  const requestedProfileId = request.runtimeProfileId;
  if (requestedProfileId) {
    return project.runtimeProfiles.find((profile) => profile.id === requestedProfileId);
  }

  const preferredKind = mode === 'preview'
    ? 'draft'
    : 'render';

  return project.runtimeProfiles.find((profile) => profile.kind === preferredKind)
    ?? project.runtimeProfiles[0];
}

function getArtifactRole(mode: RenderGraphPlanMode): RenderGraphArtifactRole {
  if (mode === 'preview') {
    return 'preview-output';
  }
  if (mode === 'export') {
    return 'export-output';
  }
  return 'render-output';
}

function toToolchainIdentity(tools: ResolvedFfmpegTools): RenderGraphToolchainIdentity {
  return withoutUndefinedEntries({
    backend: 'ffmpeg',
    binary: tools.ffmpeg.path,
    source: tools.ffmpeg.source,
    envVar: tools.ffmpeg.envVar,
    provenance: tools.ffmpeg.provenance
  }) as unknown as RenderGraphToolchainIdentity;
}

function normalizeCommandForReusablePass(command: RenderPlan['command'], outputPath: string): RenderPlan['command'] {
  return {
    ...command,
    args: command.args.map((arg) => arg === outputPath ? '<render-output>' : arg),
    expectedOutputs: command.expectedOutputs?.map((output) => output === outputPath ? '<render-output>' : output)
  };
}

function createArtifactId(value: {
  role: RenderGraphArtifactRole;
  projectId: string;
  sequenceId: string;
  variantId: string;
  mode: RenderGraphPlanMode;
  profile: RenderProfile;
  contentCacheKey: string;
  outputPath: string;
}): string {
  return `artifact:${value.role}:${hashIdentity(value)}`;
}

function normalizeCaptureReplayContext(captureReplay: CaptureReplayRenderContext | undefined): CaptureReplayRenderContext | undefined {
  if (!captureReplay) {
    return undefined;
  }

  return {
    identity: {
      ...captureReplay.identity,
      replayEventIds: [...captureReplay.identity.replayEventIds].sort(compareStrings)
    },
    filterOverrides: [...captureReplay.filterOverrides]
      .sort((left, right) => left.compositionTimeMs - right.compositionTimeMs || compareStrings(left.eventId, right.eventId))
      .map((override) => ({ ...override })),
    skippedEvents: [...(captureReplay.skippedEvents ?? [])]
      .sort((left, right) => compareStrings(left.eventId ?? '', right.eventId ?? '') || compareStrings(left.path ?? '', right.path ?? '') || compareStrings(left.code, right.code))
      .map((event) => ({ ...event })),
    diagnostics: [...(captureReplay.diagnostics ?? [])]
      .sort((left, right) => compareStrings(left.eventId ?? '', right.eventId ?? '') || compareStrings(left.path ?? '', right.path ?? '') || compareStrings(left.code, right.code))
      .map((diagnostic) => ({ ...diagnostic }))
  };
}

function captureReplayCacheInputs(captureReplay: CaptureReplayRenderContext | undefined): string[] {
  if (!captureReplay) {
    return [];
  }

  return [
    `capture-session:${captureReplay.identity.captureSessionId ?? 'none'}`,
    `capture-log:${captureReplay.identity.captureLogId}`,
    `capture-events:${captureReplay.identity.replayEventIds.join(',')}`,
    `capture-overrides:${hashIdentity(captureReplay.filterOverrides)}`,
    `capture-skipped:${hashIdentity(captureReplay.skippedEvents ?? [])}`,
    `capture-diagnostics:${hashIdentity(captureReplay.diagnostics ?? [])}`
  ];
}

function captureReplayMetadata(captureReplay: CaptureReplayRenderContext | undefined): Record<string, unknown> | undefined {
  if (!captureReplay) {
    return undefined;
  }

  return {
    captureSessionId: captureReplay.identity.captureSessionId,
    captureLogId: captureReplay.identity.captureLogId,
    replayEventIds: captureReplay.identity.replayEventIds,
    filterOverrideCount: captureReplay.filterOverrides.length,
    skippedEventCount: captureReplay.skippedEvents?.length ?? 0
  };
}

interface PlannedFieldSampler {
  stackId: string;
  filterId: string;
  sampler: FieldParameterSampler;
}

function collectPlannedFieldSamplers(project: NormalizedProjectFile): PlannedFieldSampler[] {
  return project.filterStacks.flatMap((stack) => stack.filters.flatMap((filter) => (filter.fieldSamplers ?? [])
    .filter((sampler) => sampler.enabled !== false)
    .map((sampler) => ({
      stackId: stack.id,
      filterId: filter.id,
      sampler
    }))));
}

function createFieldGeneratorRequirement(generator: FieldGeneratorManifest): RenderGraphBackendRequirement {
  const backend = generator.kind === 'external-live-source' ? 'external' : 'webgpu';

  return {
    id: `requirement:field-generator:${generator.id}`,
    backend,
    binary: '<runtime-placeholder>',
    required: true,
    capabilities: generator.requiredCapabilities,
    metadata: {
      generatorId: generator.id,
      kind: generator.kind,
      costClass: generator.costClass,
      determinismMode: generator.determinismMode,
      capturePolicy: generator.capturePolicy,
      cacheIdentity: generator.cacheIdentity
    }
  };
}

function createFieldSamplerRequirement(plannedSampler: PlannedFieldSampler): RenderGraphBackendRequirement {
  return {
    id: `requirement:field-sampler:${plannedSampler.sampler.id}`,
    backend: 'webgpu',
    binary: '<runtime-placeholder>',
    required: false,
    capabilities: plannedSampler.sampler.requiredCapabilities ?? ['field-sampling'],
    metadata: {
      stackId: plannedSampler.stackId,
      filterId: plannedSampler.filterId,
      samplerId: plannedSampler.sampler.id,
      fieldId: plannedSampler.sampler.fieldId,
      fallbackValue: plannedSampler.sampler.fallbackValue,
      degradedCapabilities: plannedSampler.sampler.degradedCapabilities ?? []
    }
  };
}

function toRenderGraphFieldRuntimeDiagnostic(
  diagnostic: SpatialFieldRuntimeDiagnostic,
  operationNodeId: string,
  passId: string
): RenderGraphCapabilityDiagnostic {
  return {
    id: diagnostic.id,
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    path: diagnostic.fieldId ? `composition.spatialFields.${diagnostic.fieldId}` : undefined,
    nodeId: diagnostic.generatorId ? `field-generator:${diagnostic.generatorId}` : operationNodeId,
    passId,
    requirementId: diagnostic.generatorId ? `requirement:field-generator:${diagnostic.generatorId}` : undefined
  };
}

export function buildRenderGraphPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: PreviewRequest | ExportRequest | RenderRequest,
  profile: RenderProfile,
  mode: RenderGraphPlanMode,
  tools?: ResolvedFfmpegTools,
  captureReplay?: CaptureReplayRenderContext
): RenderGraphPlan {
  const normalizedProject = normalizeForPlanning(project);
  const normalizedCaptureReplay = normalizeCaptureReplayContext(captureReplay);
  const { sequenceId, variant } = resolveTimeline(normalizedProject, request.sequenceId, request.variantId);
  const resolvedTools = makePlanningTools(tools);
  const graphProfile = normalizeRenderProfileForGraph(profile);
  const runtimeProfile = selectRuntimePerformanceProfile(normalizedProject, request, mode);
  const fieldSamplers = collectPlannedFieldSamplers(normalizedProject);
  const commandPlan = buildRenderCommand(normalizedProject, variant, sequenceId, request, graphProfile, resolvedTools, {
    captureReplay: normalizedCaptureReplay
  }) as RenderPlan | PreviewPlan;
  const inputs = collectRenderInputs(normalizedProject, variant);
  const role = getArtifactRole(mode);
  const toolchain = toToolchainIdentity(resolvedTools);
  const inputReferences: RenderGraphInputReference[] = inputs.map((input, inputIndex) => {
    const asset = ensureAsset(normalizedProject, input.assetId);
    return {
      id: `input:${input.assetId}`,
      assetId: input.assetId,
      path: input.path,
      mediaType: asset.mediaType,
      loop: input.loop ?? false,
      inputIndex,
      ...(asset.assetRole !== undefined ? { role: asset.assetRole } : {})
    };
  });
  const durationMs = getTargetRenderDurationMs(normalizedProject, variant);
  const operationNodeId = `operation:${mode}:${variant.id}`;
  const passId = 'pass:ffmpeg-render';
  const fieldRuntime = buildSpatialFieldRuntimePlan({
    project: normalizedProject,
    runtimeProfile,
    outputDimensions: {
      width: graphProfile.width,
      height: graphProfile.height
    },
    sourceDimensions: {
      width: graphProfile.width,
      height: graphProfile.height
    },
    frameIndex: 0,
    timeMs: 0,
    highQualityOpticalFlowAvailable: false
  });
  const fieldGenerators = fieldRuntime.generators ?? normalizedProject.composition.fieldGenerators;
  const cacheInputs = [
    `project:${normalizedProject.id}`,
    `sequence:${sequenceId}`,
    `variant:${variant.id}`,
    `profile:${hashIdentity(graphProfile)}`,
    `runtime-profile:${runtimeProfile ? hashIdentity(runtimeProfile) : 'none'}`,
    `spatial-fields:${hashIdentity(normalizedProject.composition.spatialFields)}`,
    `field-runtime:${hashIdentity(fieldRuntime.reports.map((report) => ({
      fieldId: report.fieldId,
      dimensions: report.dimensions,
      storageMode: report.storageMode,
      profileFit: report.profileFit,
      currentFrameId: report.currentFrameId,
      previousFrameId: report.previousFrameId
    })))}`,
    `field-generators:${hashIdentity(fieldGenerators)}`,
    `field-samplers:${hashIdentity(fieldSamplers)}`,
    `toolchain:${hashIdentity(toolchain)}`,
    ...captureReplayCacheInputs(normalizedCaptureReplay),
    ...inputReferences.map((input) => `asset:${input.assetId}:${input.path}`)
  ];
  const reusableCommand = normalizeCommandForReusablePass(commandPlan.command, request.outputPath);
  const baseInvalidatesOn = [
    'project-state',
    `project:${normalizedProject.id}`,
    `sequence:${sequenceId}`,
    `variant:${variant.id}`,
    'profile',
    'input-assets',
    'capture-sessions',
    'capture-logs',
    'accepted-archive-references',
    'rejected-archive-references',
    'capture-replay-context',
    'runtime-performance-profile',
    'spatial-fields',
    'field-generators',
    'field-samplers',
    'render-command-semantics',
    'ffmpeg-toolchain'
  ];
  const baseCacheValue = {
    mode,
    sequenceId,
    variantId: variant.id,
    project: normalizedProject,
    profile: graphProfile,
    inputs: inputReferences,
    captureReplay: normalizedCaptureReplay,
    runtimeProfile,
    fieldRuntime,
    fieldGenerators,
    fieldSamplers,
    command: reusableCommand,
    toolchain
  };
  const captureMetadata = captureReplayMetadata(normalizedCaptureReplay);
  const baseProvenance: RenderGraphProvenance = {
    projectId: normalizedProject.id,
    sequenceId,
    variantId: variant.id,
    mode,
    toolchain,
    metadata: {
      profile: graphProfile,
      runtimeProfile,
      inputAssetIds: inputReferences.map((input) => input.assetId),
      spatialFieldIds: normalizedProject.composition.spatialFields.map((field) => field.id),
      fieldRuntimeReportIds: fieldRuntime.reports.map((report) => report.fieldId),
      fieldGeneratorIds: fieldGenerators.map((generator) => generator.id),
      fieldSamplerIds: fieldSamplers.map((plannedSampler) => plannedSampler.sampler.id),
      ...(captureMetadata ? { captureReplay: captureMetadata } : {})
    }
  };
  const planCacheIdentity = createCacheIdentity('render-graph-plan', cacheInputs, baseCacheValue, baseInvalidatesOn, baseProvenance);
  const planId = `render-graph:${mode}:${normalizedProject.id}:${sequenceId}:${variant.id}:${planCacheIdentity.key}`;
  planCacheIdentity.provenance = {
    ...baseProvenance,
    planId,
    cacheKey: planCacheIdentity.key
  };
  const passProvenance: RenderGraphProvenance = {
    ...baseProvenance,
    planId,
    passId: 'pass:ffmpeg-render',
    parentCacheKeys: [planCacheIdentity.key]
  };
  const passCacheIdentity = createCacheIdentity('render-graph-pass', [...cacheInputs, planCacheIdentity.key], {
    ...baseCacheValue,
    pass: operationNodeId
  }, baseInvalidatesOn, passProvenance);
  passCacheIdentity.provenance = {
    ...passProvenance,
    cacheKey: passCacheIdentity.key
  };
  const artifactId = createArtifactId({
    role,
    projectId: normalizedProject.id,
    sequenceId,
    variantId: variant.id,
    mode,
    profile: graphProfile,
    contentCacheKey: passCacheIdentity.key,
    outputPath: request.outputPath
  });
  const artifactInvalidatesOn = [
    ...baseInvalidatesOn,
    'output-path'
  ];
  const artifactProvenance: RenderGraphProvenance = {
    ...baseProvenance,
    planId,
    passId: 'pass:ffmpeg-render',
    artifactId,
    role,
    parentCacheKeys: [passCacheIdentity.key],
    metadata: {
      profile: graphProfile,
      outputPath: request.outputPath,
      ...(captureMetadata ? { captureReplay: captureMetadata } : {})
    }
  };
  const artifactCacheIdentity = createCacheIdentity('render-graph-artifact', [passCacheIdentity.key, `output:${request.outputPath}`], {
    outputPath: request.outputPath,
    profile: graphProfile,
    role,
    producer: operationNodeId,
    contentCacheKey: passCacheIdentity.key
  }, artifactInvalidatesOn, artifactProvenance);
  artifactCacheIdentity.provenance = {
    ...artifactProvenance,
    cacheKey: artifactCacheIdentity.key
  };
  const requirementId = 'requirement:ffmpeg-render';
  const captureReplayNodeId = normalizedCaptureReplay ? `capture-replay:${normalizedCaptureReplay.identity.captureLogId}` : undefined;
  const fieldGeneratorNodeIds = fieldGenerators.map((generator) => `field-generator:${generator.id}`);
  const fieldConsumerNodeIds = fieldSamplers.map((plannedSampler) => `field-consumer:${plannedSampler.filterId}:${plannedSampler.sampler.id}`);
  const inputNodeIds = [
    ...inputReferences.map((input) => input.id),
    ...fieldGeneratorNodeIds,
    ...fieldConsumerNodeIds,
    ...(captureReplayNodeId ? [captureReplayNodeId] : [])
  ];
  const nodes: RenderGraphNode[] = [
    {
      id: `project:${normalizedProject.id}`,
      kind: 'project',
      label: normalizedProject.id,
      metadata: {
        projectId: normalizedProject.id
      }
    },
    {
      id: `sequence:${sequenceId}`,
      kind: 'sequence',
      label: sequenceId,
      metadata: {
        sequenceId
      }
    },
    {
      id: `variant:${variant.id}`,
      kind: 'variant',
      label: variant.id,
      metadata: {
        variantId: variant.id,
        clipCount: variant.clips.length
      }
    },
    ...inputReferences.map((input) => ({
      id: input.id,
      kind: 'input' as const,
      label: input.assetId,
      metadata: withoutUndefinedEntries({
        assetId: input.assetId,
        path: input.path,
        mediaType: input.mediaType,
        role: input.role,
        loop: input.loop,
        inputIndex: input.inputIndex
      })
    })),
    ...(normalizedCaptureReplay && captureReplayNodeId ? [{
      id: captureReplayNodeId,
      kind: 'capture-replay' as const,
      label: normalizedCaptureReplay.identity.captureLogId,
      metadata: withoutUndefinedEntries({
        ...captureMetadata,
        filterOverrides: normalizedCaptureReplay.filterOverrides,
        skippedEvents: normalizedCaptureReplay.skippedEvents
      })
    }] : []),
    ...fieldGenerators.map((generator) => ({
      id: `field-generator:${generator.id}`,
      kind: 'field-generator' as const,
      label: generator.name ?? generator.id,
      cacheIdentity: createCacheIdentity('field-generator-placeholder', [
        `generator:${generator.id}`,
        `version:${generator.cacheIdentity.version}`,
        ...generator.cacheIdentity.inputs
      ], generator, [
        'field-generator-manifest',
        'spatial-fields',
        'capture-sessions',
        'input-assets'
      ], {
        ...baseProvenance,
        planId,
        metadata: {
          generatorId: generator.id,
          kind: generator.kind,
          cacheIdentity: generator.cacheIdentity
        }
      }),
      metadata: {
        generatorId: generator.id,
        kind: generator.kind,
        inputs: generator.inputs,
        outputs: generator.outputs,
        scope: generator.scope,
        costClass: generator.costClass,
        determinismMode: generator.determinismMode,
        capturePolicy: generator.capturePolicy,
        requiredCapabilities: generator.requiredCapabilities,
        cacheIdentity: generator.cacheIdentity,
        execution: generator.kind === 'motion-frame-difference' ? 'frame-difference-runtime' : 'placeholder',
        runtimeReports: fieldRuntime.reports.filter((report) => report.generatorId === generator.id).map((report) => ({
          fieldId: report.fieldId,
          dimensions: report.dimensions,
          storageMode: report.storageMode,
          currentFrameId: report.currentFrameId,
          previousFrameId: report.previousFrameId,
          profileFit: report.profileFit,
          diagnostics: report.diagnostics.map((diagnostic) => diagnostic.id)
        }))
      }
    })),
    ...fieldSamplers.map((plannedSampler) => ({
      id: `field-consumer:${plannedSampler.filterId}:${plannedSampler.sampler.id}`,
      kind: 'field-consumer' as const,
      label: plannedSampler.sampler.id,
      metadata: {
        stackId: plannedSampler.stackId,
        filterId: plannedSampler.filterId,
        sampler: plannedSampler.sampler,
        fallback: {
          scalarValue: plannedSampler.sampler.fallbackValue,
          appliesToParameter: plannedSampler.sampler.parameter
        },
        execution: 'scalar-fallback'
      }
    })),
    {
      id: operationNodeId,
      kind: 'operation',
      label: commandPlan.command.label,
      cacheIdentity: passCacheIdentity,
      metadata: {
        backend: 'ffmpeg',
        mode,
        usesMaskTransitions: usesMaskTransitions(variant),
        ...(captureMetadata ? { captureReplay: captureMetadata } : {})
      }
    },
    {
      id: artifactId,
      kind: 'artifact',
      label: request.outputPath,
      cacheIdentity: artifactCacheIdentity,
      metadata: {
        path: request.outputPath,
        role
      }
    }
  ];
  const edges = [
    {
      id: `edge:project:${normalizedProject.id}:sequence:${sequenceId}`,
      from: `project:${normalizedProject.id}`,
      to: `sequence:${sequenceId}`,
      kind: 'identity' as const
    },
    {
      id: `edge:sequence:${sequenceId}:variant:${variant.id}`,
      from: `sequence:${sequenceId}`,
      to: `variant:${variant.id}`,
      kind: 'timeline' as const
    },
    {
      id: `edge:variant:${variant.id}:${operationNodeId}`,
      from: `variant:${variant.id}`,
      to: operationNodeId,
      kind: 'timeline' as const
    },
    ...inputReferences.map((input) => ({
      id: `edge:${input.id}:${operationNodeId}`,
      from: input.id,
      to: operationNodeId,
      kind: 'media-input' as const,
      metadata: {
        inputIndex: input.inputIndex,
        loop: input.loop
      }
    })),
    ...(captureReplayNodeId ? [{
      id: `edge:${captureReplayNodeId}:${operationNodeId}`,
      from: captureReplayNodeId,
      to: operationNodeId,
      kind: 'capture-input' as const,
      metadata: captureMetadata
    }] : []),
    ...fieldGenerators.flatMap((generator) => generator.outputs.map((output) => ({
      id: `edge:field-generator:${generator.id}:${output.fieldId}`,
      from: `field-generator:${generator.id}`,
      to: operationNodeId,
      kind: 'field-output' as const,
      metadata: {
        generatorId: generator.id,
        outputId: output.id,
        fieldId: output.fieldId,
        channels: output.channels ?? []
      }
    }))),
    ...fieldSamplers.map((plannedSampler) => ({
      id: `edge:field-consumer:${plannedSampler.filterId}:${plannedSampler.sampler.id}:${operationNodeId}`,
      from: `field-consumer:${plannedSampler.filterId}:${plannedSampler.sampler.id}`,
      to: operationNodeId,
      kind: 'field-consumer' as const,
      metadata: {
        stackId: plannedSampler.stackId,
        filterId: plannedSampler.filterId,
        samplerId: plannedSampler.sampler.id,
        fieldId: plannedSampler.sampler.fieldId,
        parameter: plannedSampler.sampler.parameter,
        fallbackValue: plannedSampler.sampler.fallbackValue
      }
    })),
    {
      id: `edge:${operationNodeId}:${artifactId}`,
      from: operationNodeId,
      to: artifactId,
      kind: 'artifact-output' as const
    }
  ];
  const backendRequirements: RenderGraphBackendRequirement[] = [
    {
      id: requirementId,
      backend: 'ffmpeg',
      binary: resolvedTools.ffmpeg.path,
      required: true,
      capabilities: [
        'filter_complex',
        `video-codec:${graphProfile.videoCodec}`,
        `audio-codec:${graphProfile.audioCodec}`,
        `container:${graphProfile.container}`,
        `pixel-format:${graphProfile.pixelFormat}`
      ],
      provenance: resolvedTools.ffmpeg.provenance,
      metadata: withoutUndefinedEntries({
        source: resolvedTools.ffmpeg.source,
        envVar: resolvedTools.ffmpeg.envVar
      })
    },
    ...(runtimeProfile ? [{
      id: `requirement:runtime-profile:${runtimeProfile.id}`,
      backend: 'webgpu' as const,
      binary: '<runtime-placeholder>',
      required: false,
      capabilities: [
        `runtime-profile:${runtimeProfile.kind}`,
        `field-scale:${runtimeProfile.fieldScalePreset}`,
        `cost-budget:${runtimeProfile.maxCostClass}`,
        `fallback:${runtimeProfile.fallbackPreference}`
      ],
      metadata: {
        runtimeProfile
      }
    }] : []),
    ...fieldGenerators.map(createFieldGeneratorRequirement),
    ...fieldSamplers.map(createFieldSamplerRequirement)
  ];
  const diagnostics: RenderGraphCapabilityDiagnostic[] = [
    buildFfmpegCompatibilityDiagnostic({
      nodeId: operationNodeId,
      passId,
      requirementId
    }),
    ...fieldRuntime.diagnostics.map((diagnostic) => toRenderGraphFieldRuntimeDiagnostic(diagnostic, operationNodeId, passId)),
    ...(runtimeProfile ? normalizedProject.composition.spatialFields
      .filter((field) => exceedsRuntimeBudget(field.costClass ?? 'moderate', runtimeProfile))
      .map((field) => ({
        id: `diagnostic:runtime-profile:${runtimeProfile.id}:spatial-field:${field.id}:cost-budget`,
        severity: 'warning' as const,
        code: 'runtime-profile-cost-budget',
        message: `Spatial field "${field.id}" cost class "${field.costClass ?? 'moderate'}" exceeds runtime profile "${runtimeProfile.id}" budget "${runtimeProfile.maxCostClass}".`,
        path: `composition.spatialFields.${field.id}`,
        nodeId: operationNodeId,
        passId,
        requirementId: `requirement:runtime-profile:${runtimeProfile.id}`
      }))
      : []),
    ...(runtimeProfile ? fieldGenerators
      .filter((generator) => exceedsRuntimeBudget(generator.costClass, runtimeProfile))
      .map((generator) => ({
        id: `diagnostic:runtime-profile:${runtimeProfile.id}:field-generator:${generator.id}:cost-budget`,
        severity: 'warning' as const,
        code: 'runtime-profile-cost-budget',
        message: `Field generator "${generator.id}" cost class "${generator.costClass}" exceeds runtime profile "${runtimeProfile.id}" budget "${runtimeProfile.maxCostClass}".`,
        path: `composition.fieldGenerators.${generator.id}`,
        nodeId: `field-generator:${generator.id}`,
        passId,
        requirementId: `requirement:runtime-profile:${runtimeProfile.id}`
      }))
      : []),
    ...fieldGenerators.map((generator) => generator.kind === 'motion-frame-difference'
      ? {
          id: `diagnostic:field-generator:${generator.id}:motion-frame-difference-runtime`,
          severity: 'info' as const,
          code: 'field-generator-motion-frame-difference-runtime',
          message: `Field generator "${generator.id}" is planned as deterministic frame differencing for preview/runtime inspection.`,
          path: `composition.fieldGenerators.${generator.id}`,
          nodeId: `field-generator:${generator.id}`,
          passId,
          requirementId: `requirement:field-generator:${generator.id}`
        }
      : {
          id: `diagnostic:field-generator:${generator.id}:placeholder`,
          severity: 'info' as const,
          code: 'field-generator-placeholder',
          message: `Field generator "${generator.id}" is represented in the render graph but is not executed by the FFmpeg planner.`,
          path: `composition.fieldGenerators.${generator.id}`,
          nodeId: `field-generator:${generator.id}`,
          passId,
          requirementId: `requirement:field-generator:${generator.id}`
        }),
    ...fieldSamplers.map((plannedSampler) => ({
      id: `diagnostic:field-sampler:${plannedSampler.sampler.id}:scalar-fallback`,
      severity: 'warning' as const,
      code: 'field-sampling-scalar-fallback',
      message: `Field sampler "${plannedSampler.sampler.id}" is planned with scalar fallback value ${plannedSampler.sampler.fallbackValue}.`,
      path: `filterStacks.${plannedSampler.stackId}.filters.${plannedSampler.filterId}.fieldSamplers.${plannedSampler.sampler.id}`,
      nodeId: `field-consumer:${plannedSampler.filterId}:${plannedSampler.sampler.id}`,
      passId,
      requirementId: `requirement:field-sampler:${plannedSampler.sampler.id}`
    })),
    ...(normalizedCaptureReplay
      ? buildCaptureReplayDiagnostics([
        ...(normalizedCaptureReplay.diagnostics ?? []),
        ...(normalizedCaptureReplay.skippedEvents ?? [])
      ], {
        nodeId: operationNodeId,
        passId,
        requirementId
      })
      : [])
  ];
  const artifacts: RenderGraphArtifact[] = [
    {
      id: artifactId,
      kind: 'video',
      role,
      path: request.outputPath,
      profile: graphProfile,
      producedBy: 'pass:ffmpeg-render',
      cacheIdentity: artifactCacheIdentity,
      provenance: {
        ...artifactProvenance,
        cacheKey: artifactCacheIdentity.key
      }
    }
  ];
  const passes: RenderGraphPass[] = [
    {
      id: 'pass:ffmpeg-render',
      backend: 'ffmpeg',
      label: commandPlan.command.label,
      nodeId: operationNodeId,
      order: 0,
      inputNodeIds,
      outputArtifactIds: [artifactId],
      command: commandPlan.command,
      requirements: [requirementId],
      diagnostics: diagnostics.map((diagnostic) => diagnostic.id),
      cacheIdentity: passCacheIdentity,
      invalidatesOn: baseInvalidatesOn,
      provenance: {
        ...passProvenance,
        cacheKey: passCacheIdentity.key
      },
      semantics: {
        operation: mode,
        profile: graphProfile,
        durationMs,
        usesMaskTransitions: usesMaskTransitions(variant),
        chunkedExportRecommended: mode === 'export' ? shouldUseChunkedExport(normalizedProject, variant, graphProfile) : false,
        ...(normalizedCaptureReplay ? {
          captureReplay: {
            captureSessionId: normalizedCaptureReplay.identity.captureSessionId,
            captureLogId: normalizedCaptureReplay.identity.captureLogId,
            replayEventIds: normalizedCaptureReplay.identity.replayEventIds,
            filterOverrideCount: normalizedCaptureReplay.filterOverrides.length,
            skippedEventCount: normalizedCaptureReplay.skippedEvents?.length ?? 0
          }
        } : {})
      }
    }
  ];

  return {
    identity: {
      schemaVersion: 1,
      planId,
      projectId: normalizedProject.id,
      sequenceId,
      variantId: variant.id,
      mode
    },
    target: {
      outputPath: request.outputPath,
      profile: graphProfile,
      ...(runtimeProfile ? { runtimeProfile } : {}),
      durationMs
    },
    inputs: inputReferences,
    nodes,
    edges,
    passes,
    artifacts,
    backendRequirements,
    diagnostics,
    fieldRuntime,
    cacheIdentity: planCacheIdentity
  };
}

export function buildPreviewRenderGraphPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: PreviewRequest,
  tools?: ResolvedFfmpegTools
): RenderGraphPlan {
  return buildRenderGraphPlan(project, request, toRenderProfile(request, 'preview'), 'preview', tools);
}

export function buildExportRenderGraphPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: ExportRequest,
  tools?: ResolvedFfmpegTools
): RenderGraphPlan {
  return buildRenderGraphPlan(project, request, toRenderProfile(request, 'export'), 'export', tools);
}

function captureReplayPlanningFailure(error: unknown): CaptureReplayRenderGraphPlanResult {
  return {
    ok: false,
    diagnostics: [buildCaptureReplayPlanningFailureDiagnostic(error)]
  };
}

export function buildCaptureReplayPreviewRenderGraphPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: PreviewRequest,
  captureReplay: CaptureReplayRenderContext,
  tools?: ResolvedFfmpegTools
): CaptureReplayRenderGraphPlanResult {
  try {
    const plan = buildRenderGraphPlan(project, request, toRenderProfile(request, 'preview'), 'preview', tools, captureReplay);
    return {
      ok: true,
      plan,
      diagnostics: plan.diagnostics
    };
  } catch (error) {
    return captureReplayPlanningFailure(error);
  }
}

export function buildCaptureReplayExportRenderGraphPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: ExportRequest,
  captureReplay: CaptureReplayRenderContext,
  tools?: ResolvedFfmpegTools
): CaptureReplayRenderGraphPlanResult {
  try {
    const plan = buildRenderGraphPlan(project, request, toRenderProfile(request, 'export'), 'export', tools, captureReplay);
    return {
      ok: true,
      plan,
      diagnostics: plan.diagnostics
    };
  } catch (error) {
    return captureReplayPlanningFailure(error);
  }
}
