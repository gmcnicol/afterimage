import type { RenderGraphArtifact, RenderGraphCapabilityDiagnostic } from '@afterimage/ffmpeg-compiler';
import type { StudioRenderArtifact, StudioRenderDiagnostic } from '@afterimage/studio-contracts';

export function toStudioRenderArtifact(artifact: RenderGraphArtifact): StudioRenderArtifact {
  return {
    id: artifact.id,
    role: artifact.role,
    path: artifact.path,
    cacheKey: artifact.cacheIdentity.key,
    producedBy: artifact.producedBy,
    provenance: artifact.provenance as unknown as Record<string, unknown>
  };
}

export function toStudioRenderDiagnostic(diagnostic: RenderGraphCapabilityDiagnostic): StudioRenderDiagnostic {
  return {
    id: diagnostic.id,
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    ...(diagnostic.path !== undefined ? { path: diagnostic.path } : {}),
    ...(diagnostic.nodeId !== undefined ? { nodeId: diagnostic.nodeId } : {}),
    ...(diagnostic.passId !== undefined ? { passId: diagnostic.passId } : {}),
    ...(diagnostic.requirementId !== undefined ? { requirementId: diagnostic.requirementId } : {})
  };
}
