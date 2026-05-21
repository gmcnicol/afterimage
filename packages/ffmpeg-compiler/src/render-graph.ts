import { createHash } from 'node:crypto';
import type {
  NormalizedProjectFile,
  ProjectFile
} from '@afterimage/project-model';
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
  RenderGraphCacheIdentity,
  RenderGraphCapabilityDiagnostic,
  RenderGraphInputReference,
  RenderGraphNode,
  RenderGraphPass,
  RenderGraphPlan,
  RenderGraphPlanMode,
  RenderPlan,
  RenderProfile,
  RenderRequest,
  ResolvedFfmpegTools
} from './types.js';
import { ensureAsset, makePlanningTools, normalizeForPlanning, resolveTimeline } from './utils.js';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`;
}

function createCacheIdentity(namespace: string, inputs: string[], value: unknown): RenderGraphCacheIdentity {
  return {
    namespace,
    key: createHash('sha256').update(stableStringify(value)).digest('hex'),
    version: 1,
    algorithm: 'sha256',
    inputs,
    status: 'placeholder'
  };
}

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
  const artifactId = `artifact:${mode}:output`;
  const cacheInputs = [
    `project:${normalizedProject.id}`,
    `sequence:${sequenceId}`,
    `variant:${variant.id}`,
    ...inputReferences.map((input) => `asset:${input.assetId}:${input.path}`)
  ];
  const baseCacheValue = {
    mode,
    projectId: normalizedProject.id,
    sequenceId,
    variantId: variant.id,
    outputPath: request.outputPath,
    profile: graphProfile,
    inputs: inputReferences,
    command: commandPlan.command
  };
  const planCacheIdentity = createCacheIdentity('render-graph-plan', cacheInputs, baseCacheValue);
  const passCacheIdentity = createCacheIdentity('render-graph-pass', [...cacheInputs, planCacheIdentity.key], {
    ...baseCacheValue,
    pass: operationNodeId
  });
  const artifactCacheIdentity = createCacheIdentity('render-graph-artifact', [passCacheIdentity.key], {
    outputPath: request.outputPath,
    profile: graphProfile,
    producer: operationNodeId
  });
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
        role: getArtifactRole(mode)
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
      role: getArtifactRole(mode),
      path: request.outputPath,
      profile: graphProfile,
      producedBy: 'pass:ffmpeg-render',
      cacheIdentity: artifactCacheIdentity
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
      planId: `render-graph:${mode}:${normalizedProject.id}:${sequenceId}:${variant.id}:${planCacheIdentity.key}`,
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
