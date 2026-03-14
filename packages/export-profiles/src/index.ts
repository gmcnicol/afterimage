import {
  slugify,
  type NormalizedProjectFile,
  type Sequence,
  type Variant
} from '@afterimage/project-model';

export type ExportProfileId =
  | 'landscape-master'
  | 'portrait-short-form'
  | 'square-social'
  | 'archive-master';

export interface ExportProfileDefinition {
  id: ExportProfileId;
  name: string;
  width: number;
  height: number;
  aspectRatio: string;
  frameRate: number;
  container: 'mp4' | 'mov';
  videoCodec: 'libx264' | 'prores_ks';
  audioCodec: 'aac' | 'pcm_s24le';
  pixelFormat: 'yuv420p' | 'yuv422p10le';
  videoProfile?: '3';
  crf?: number;
  videoPreset?: 'medium' | 'fast' | 'slow';
  audioBitrateKbps?: number;
  namingRule: '{projectSlug}-{sequenceSlug}-{variantSlug}-{profileId}.{ext}';
}

export const exportProfiles = [
  {
    id: 'landscape-master',
    name: 'Landscape Master',
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    frameRate: 30,
    container: 'mp4',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    pixelFormat: 'yuv420p',
    crf: 18,
    videoPreset: 'medium',
    audioBitrateKbps: 256,
    namingRule: '{projectSlug}-{sequenceSlug}-{variantSlug}-{profileId}.{ext}'
  },
  {
    id: 'portrait-short-form',
    name: 'Portrait Short-Form',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    frameRate: 30,
    container: 'mp4',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    pixelFormat: 'yuv420p',
    crf: 18,
    videoPreset: 'medium',
    audioBitrateKbps: 256,
    namingRule: '{projectSlug}-{sequenceSlug}-{variantSlug}-{profileId}.{ext}'
  },
  {
    id: 'square-social',
    name: 'Square Social',
    width: 1080,
    height: 1080,
    aspectRatio: '1:1',
    frameRate: 30,
    container: 'mp4',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    pixelFormat: 'yuv420p',
    crf: 20,
    videoPreset: 'medium',
    audioBitrateKbps: 192,
    namingRule: '{projectSlug}-{sequenceSlug}-{variantSlug}-{profileId}.{ext}'
  },
  {
    id: 'archive-master',
    name: 'Archive Master',
    width: 3840,
    height: 2160,
    aspectRatio: '16:9',
    frameRate: 30,
    container: 'mov',
    videoCodec: 'prores_ks',
    audioCodec: 'pcm_s24le',
    pixelFormat: 'yuv422p10le',
    videoProfile: '3',
    namingRule: '{projectSlug}-{sequenceSlug}-{variantSlug}-{profileId}.{ext}'
  }
] as const satisfies readonly ExportProfileDefinition[];

export const exportProfileMap = Object.fromEntries(exportProfiles.map((profile) => [profile.id, profile])) as Record<ExportProfileId, ExportProfileDefinition>;

export function getExportProfileById(profileId: ExportProfileId): ExportProfileDefinition {
  return exportProfileMap[profileId];
}

export function buildExportFilename(
  project: Pick<NormalizedProjectFile, 'name'>,
  sequence: Pick<Sequence, 'name'>,
  variant: Pick<Variant, 'name'>,
  profile: ExportProfileDefinition,
  attempt = 0
): string {
  const projectSlug = slugify(project.name);
  const sequenceSlug = slugify(sequence.name);
  const variantSlug = slugify(variant.name);
  const extension = profile.container;
  const baseName = `${projectSlug}-${sequenceSlug}-${variantSlug}-${profile.id}`;

  return attempt > 0 ? `${baseName}-${String(attempt).padStart(3, '0')}.${extension}` : `${baseName}.${extension}`;
}
