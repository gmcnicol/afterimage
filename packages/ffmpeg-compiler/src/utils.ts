import {
  getAssetById,
  getDefaultSequence,
  getDefaultVariant,
  getSequenceById,
  getVariantById,
  normalizeProject,
  type NormalizedProjectFile,
  type ProjectFile,
  type Variant
} from '@afterimage/project-model';
import type { ResolvedFfmpegTools } from './types.js';

export const DEFAULT_SCENE_THRESHOLD = 0.4;

export function formatSeconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(3);
}

export function formatDecimal(value: number, digits = 3): string {
  return value.toFixed(digits);
}

export function normalizeForPlanning(project: ProjectFile | NormalizedProjectFile): NormalizedProjectFile {
  return normalizeProject(project as ProjectFile);
}

export function ensureAsset(project: NormalizedProjectFile, assetId: string) {
  const asset = getAssetById(project, assetId);
  if (!asset) {
    throw new Error(`Missing asset "${assetId}" in project "${project.id}".`);
  }

  return asset;
}

export function resolveTimeline(project: NormalizedProjectFile, sequenceId?: string, variantId?: string): { sequenceId: string; variant: Variant } {
  const sequence = sequenceId ? getSequenceById(project, sequenceId) : getDefaultSequence(project);
  if (!sequence) {
    throw new Error(`Project "${project.id}" does not define a sequence.`);
  }

  const variant = variantId
    ? getVariantById(project, variantId)
    : (sequence.defaultVariantId ? getVariantById(project, sequence.defaultVariantId) : getDefaultVariant(project, sequence.id));

  if (!variant) {
    throw new Error(`Sequence "${sequence.id}" does not define a variant.`);
  }

  return {
    sequenceId: sequence.id,
    variant
  };
}

export function makePlanningTools(tools?: ResolvedFfmpegTools): ResolvedFfmpegTools {
  return tools ?? {
    ffmpeg: {
      path: 'ffmpeg',
      source: 'path',
      provenance: {
        source: 'path',
        license: 'LGPL',
        lgplOnly: true,
        notes: 'Unresolved placeholder binary name for deterministic command planning.'
      }
    },
    ffprobe: {
      path: 'ffprobe',
      source: 'path',
      provenance: {
        source: 'path',
        license: 'LGPL',
        lgplOnly: true,
        notes: 'Unresolved placeholder binary name for deterministic command planning.'
      }
    }
  };
}
