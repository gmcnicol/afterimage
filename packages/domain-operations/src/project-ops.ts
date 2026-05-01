import {
  getAssetById,
  normalizeProject,
  type ExportSelection,
  type MediaAsset,
  type NormalizedProjectFile,
  type ProjectPathRef,
  type SyncMode
} from '@afterimage/project-model';

export function mergeImportedAssets(project: NormalizedProjectFile, assets: MediaAsset[]): NormalizedProjectFile {
  const existingIds = new Set(project.assets.map((asset) => asset.id));
  const nextAssets = [
    ...project.assets,
    ...assets.filter((asset) => !existingIds.has(asset.id))
  ];

  return normalizeProject({
    ...project,
    assets: nextAssets
  });
}

export function replaceAssetPath(project: NormalizedProjectFile, assetId: string, path: ProjectPathRef): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    assets: project.assets.map((asset) => asset.id === assetId ? {
      ...asset,
      path,
      importStatus: 'ready'
    } : asset)
  });
}

export function markAssetMissing(project: NormalizedProjectFile, assetId: string): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    assets: project.assets.map((asset) => asset.id === assetId ? {
      ...asset,
      importStatus: 'missing'
    } : asset)
  });
}

export function toggleExportProfile(project: NormalizedProjectFile, profileId: string): NormalizedProjectFile {
  const selection = project.exportSelections.find((item) => item.profileId === profileId);
  const nextSelections: ExportSelection[] = selection
    ? project.exportSelections.map((item) => item.profileId === profileId ? { ...item, enabled: !item.enabled } : item)
    : [...project.exportSelections, { profileId, enabled: true, overwriteExisting: true }];

  return normalizeProject({
    ...project,
    exportSelections: nextSelections
  });
}

export function setVariantMusicAsset(project: NormalizedProjectFile, variantId: string, assetId: string): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    variants: project.variants.map((variant) => variant.id === variantId ? {
      ...variant,
      musicAlignment: {
        primaryAssetId: assetId,
        analysisRefId: variant.musicAlignment?.analysisRefId,
        syncMode: variant.musicAlignment?.syncMode ?? 'texture',
        beatMarkers: variant.musicAlignment?.beatMarkers ?? [],
        chapterPoints: variant.musicAlignment?.chapterPoints ?? [],
        snapToBeatGrid: variant.musicAlignment?.snapToBeatGrid ?? true
      }
    } : variant)
  });
}

export function setProjectMusicAsset(project: NormalizedProjectFile, assetId: string): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    variants: project.variants.map((variant) => ({
      ...variant,
      musicAlignment: {
        primaryAssetId: assetId,
        analysisRefId: variant.musicAlignment?.analysisRefId,
        syncMode: variant.musicAlignment?.syncMode ?? 'texture',
        beatMarkers: variant.musicAlignment?.beatMarkers ?? [],
        chapterPoints: variant.musicAlignment?.chapterPoints ?? [],
        snapToBeatGrid: variant.musicAlignment?.snapToBeatGrid ?? true
      }
    }))
  });
}

export function setVariantMusicSyncMode(project: NormalizedProjectFile, variantId: string, syncMode: SyncMode): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    variants: project.variants.map((variant) => variant.id === variantId ? {
      ...variant,
      musicAlignment: {
        primaryAssetId: variant.musicAlignment?.primaryAssetId,
        analysisRefId: variant.musicAlignment?.analysisRefId,
        syncMode,
        beatMarkers: variant.musicAlignment?.beatMarkers ?? [],
        chapterPoints: variant.musicAlignment?.chapterPoints ?? [],
        snapToBeatGrid: variant.musicAlignment?.snapToBeatGrid ?? true
      }
    } : variant)
  });
}

export function getPrimaryMusicAsset(project: NormalizedProjectFile): MediaAsset | undefined {
  const variant = project.variants.find((candidate) => candidate.musicAlignment?.primaryAssetId);
  const assetId = variant?.musicAlignment?.primaryAssetId;

  return assetId ? getAssetById(project, assetId) : project.assets.find((asset) => asset.mediaType === 'audio');
}
