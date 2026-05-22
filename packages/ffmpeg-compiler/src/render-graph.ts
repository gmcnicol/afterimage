import type {
  NormalizedProjectFile,
  ProjectFile
} from '@afterimage/project-model';
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
  RenderPlan,
  RenderProfile,
  RenderRequest,
  ResolvedFfmpegTools
} from './types.js';
import { ensureAsset, makePlanningTools, normalizeForPlanning, resolveTimeline } from './utils.js';

function withoutUndefinedEntries<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));
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

export function buildRenderGraphPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: PreviewRequest | ExportRequest | RenderRequest,
  profile: RenderProfile,
  mode: RenderGraphPlanMode,
  tools?: ResolvedFfmpegTools
): RenderGraphPlan {
  const normalizedProject = normalizeForPlanning(project);
  const { sequenceId, variant } = resolveTimeline(normalizedProject, request.sequenceId, request.variantId);
  const resolvedTools = makePlanningTools(tools);
  const graphProfile = normalizeRenderProfileForGraph(profile);
  const commandPlan = buildRenderCommand(normalizedProject, variant, sequenceId, request, graphProfile, resolvedTools) as RenderPlan | PreviewPlan;
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
  const cacheInputs = [
    `project:${normalizedProject.id}`,
    `sequence:${sequenceId}`,
    `variant:${variant.id}`,
    `profile:${hashIdentity(graphProfile)}`,
    `toolchain:${hashIdentity(toolchain)}`,
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
    command: reusableCommand,
    toolchain
  };
  const baseProvenance: RenderGraphProvenance = {
    projectId: normalizedProject.id,
    sequenceId,
    variantId: variant.id,
    mode,
    toolchain,
    metadata: {
      profile: graphProfile,
      inputAssetIds: inputReferences.map((input) => input.assetId)
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
      outputPath: request.outputPath
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
  const diagnosticId = 'diagnostic:ffmpeg-pass-boundary';
  const inputNodeIds = inputReferences.map((input) => input.id);
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
    {
      id: operationNodeId,
      kind: 'operation',
      label: commandPlan.command.label,
      cacheIdentity: passCacheIdentity,
      metadata: {
        backend: 'ffmpeg',
        mode,
        usesMaskTransitions: usesMaskTransitions(variant)
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
    }
  ];
  const diagnostics: RenderGraphCapabilityDiagnostic[] = [
    {
      id: diagnosticId,
      severity: 'info',
      code: 'FFMPEG_PASS_COMPATIBILITY',
      message: 'Render graph planning wraps the current FFmpeg command; execution is still performed by the existing command runner.',
      nodeId: operationNodeId,
      passId: 'pass:ffmpeg-render',
      requirementId
    }
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
      diagnostics: [diagnosticId],
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
        chunkedExportRecommended: mode === 'export' ? shouldUseChunkedExport(normalizedProject, variant, graphProfile) : false
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
      durationMs
    },
    inputs: inputReferences,
    nodes,
    edges,
    passes,
    artifacts,
    backendRequirements,
    diagnostics,
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
