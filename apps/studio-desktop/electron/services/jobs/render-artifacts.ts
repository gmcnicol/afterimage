import type { RenderGraphArtifact } from '@afterimage/ffmpeg-compiler';
import type { StudioRenderArtifact } from '@afterimage/studio-contracts';

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
