import { generateCutCandidatesFromAnalysis } from '@afterimage/media-analysis';
import {
  normalizeProject,
  type AnalysisFile,
  type AnalysisRef,
  type CutCandidate,
  type MediaAsset,
  type NormalizedProjectFile
} from '@afterimage/project-model';

export interface CatalogSceneSegment {
  id: string;
  index: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  score?: number;
}

export interface CatalogAssetInput {
  id: string;
  filename: string;
  mediaType: MediaAsset['mediaType'];
  durationMs?: number;
  analysisRef?: Partial<AnalysisRef> & { path: string };
}

export interface MaterializeCutsResult {
  project: NormalizedProjectFile;
  addedCutIds: string[];
}

function buildImportedAnalysisRef(asset: CatalogAssetInput, importedAsset: MediaAsset): AnalysisRef | undefined {
  if (!asset.analysisRef) {
    return undefined;
  }

  return {
    id: `analysis-${importedAsset.id}`,
    assetId: importedAsset.id,
    path: asset.analysisRef.path,
    ...(asset.analysisRef.thumbnailManifestPath ? { thumbnailManifestPath: asset.analysisRef.thumbnailManifestPath } : {}),
    ...(asset.analysisRef.waveformPath ? { waveformPath: asset.analysisRef.waveformPath } : {}),
    ...(asset.analysisRef.summary ? { summary: asset.analysisRef.summary } : {})
  };
}

function resolveCatalogCutSegments(asset: CatalogAssetInput, importedAsset: MediaAsset, sceneSegments: CatalogSceneSegment[]): CatalogSceneSegment[] {
  if (asset.mediaType !== 'video') {
    return [];
  }

  if (sceneSegments.length > 0) {
    return sceneSegments;
  }

  const fallbackDurationMs = Math.round(asset.durationMs ?? importedAsset.durationMs ?? 0);
  if (fallbackDurationMs <= 0) {
    return [];
  }

  return [{
    id: 'full-video',
    index: 0,
    startMs: 0,
    endMs: fallbackDurationMs,
    durationMs: fallbackDurationMs
  }];
}

export function importCatalogAssetIntoProject(input: {
  project: NormalizedProjectFile;
  asset: CatalogAssetInput;
  importedAsset: MediaAsset;
  sceneSegments: CatalogSceneSegment[];
  cutIds?: string[];
}): MaterializeCutsResult {
  const existingAssetIds = new Set(input.project.assets.map((asset) => asset.id));
  const existingCutIds = new Set(input.project.cutCandidates.map((cut) => cut.id));
  const importedAnalysisRef = buildImportedAnalysisRef(input.asset, input.importedAsset);
  const allSegments = resolveCatalogCutSegments(input.asset, input.importedAsset, input.sceneSegments);
  const selectedSegments = allSegments.filter((scene) => input.cutIds === undefined || input.cutIds.includes(scene.id));
  const nextCuts = selectedSegments.filter((scene) => scene.endMs > scene.startMs && scene.durationMs >= 1).flatMap((scene) => {
    const cutId = `cut-${input.importedAsset.id}-scene-${scene.index + 1}`;
    if (existingCutIds.has(cutId)) {
      return [];
    }

    return {
      id: cutId,
      assetId: input.importedAsset.id,
      ...(importedAnalysisRef ? { analysisRefId: importedAnalysisRef.id } : {}),
      startMs: scene.startMs,
      endMs: scene.endMs,
      durationMs: scene.durationMs,
      ...(typeof scene.score === 'number' ? { sceneScore: scene.score } : {}),
      status: input.cutIds === undefined ? 'new' as const : 'kept' as const,
      tags: input.cutIds === undefined ? ['catalogue'] : ['catalogue-cut'],
      note: `Catalogue cut ${scene.index + 1}`
    };
  });

  return {
    project: normalizeProject({
      ...input.project,
      assets: existingAssetIds.has(input.importedAsset.id)
        ? input.project.assets
        : [...input.project.assets, input.importedAsset],
      analysisRefs: importedAnalysisRef
        ? [
          ...input.project.analysisRefs.filter((ref) => ref.assetId !== input.importedAsset.id && ref.id !== importedAnalysisRef.id),
          importedAnalysisRef
        ]
        : input.project.analysisRefs,
      cutCandidates: [...input.project.cutCandidates, ...nextCuts]
    }),
    addedCutIds: nextCuts.map((cut) => cut.id)
  };
}

export function materializeAnalysisCuts(input: {
  project: NormalizedProjectFile;
  analysis: AnalysisFile;
  analysisRefId?: string;
  selectedCutIds?: string[];
  status?: CutCandidate['status'];
  tags?: string[];
}): MaterializeCutsResult {
  const existingCutIds = new Set(input.project.cutCandidates.map((cut) => cut.id));
  const selectedCutIds = input.selectedCutIds ? new Set(input.selectedCutIds) : undefined;
  const generatedCuts = generateCutCandidatesFromAnalysis(input.analysis, {
    analysisRefId: input.analysisRefId,
    status: input.status
  }).filter((cut) => !existingCutIds.has(cut.id) && (!selectedCutIds || selectedCutIds.has(cut.id))).map((cut) => ({
    ...cut,
    tags: input.tags ?? cut.tags ?? [],
    status: input.status ?? cut.status ?? 'new',
    favorite: cut.favorite ?? false,
    binIds: cut.binIds ?? []
  }));

  return {
    project: normalizeProject({
      ...input.project,
      cutCandidates: [...input.project.cutCandidates, ...generatedCuts]
    }),
    addedCutIds: generatedCuts.map((cut) => cut.id)
  };
}
