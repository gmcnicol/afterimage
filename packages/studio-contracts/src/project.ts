import type {
  AnalysisFile,
  AutomationTargetProperty,
  Marker,
  MediaAsset,
  NormalizedProjectFile,
  ProjectPathRef,
  SupportedFilterType,
  SyncMode,
  TransitionStyle
} from '@afterimage/project-model';

export type SequenceBuildMode = 'balanced' | 'tight' | 'longer';

export interface ProjectSessionSnapshot {
  project: NormalizedProjectFile;
  projectFilePath?: string;
  projectRoot?: string;
  recentProjects: string[];
}

export interface SaveProjectRequest {
  project: NormalizedProjectFile;
  projectFilePath?: string;
}

export interface RelinkAssetResult {
  assetId: string;
  path: ProjectPathRef;
}

export interface ImportCueFileResult {
  path: string;
  markers: Marker[];
}

export type ProjectOperation =
  | { type: 'mergeImportedAssets'; assets: MediaAsset[] }
  | { type: 'relinkAsset'; assetId: string; absolutePath: string; relativePath?: string }
  | { type: 'updateCutStatus'; cutId: string; status: 'new' | 'kept' | 'rejected' | 'favorite' }
  | { type: 'toggleCutFavorite'; cutId: string }
  | { type: 'trimCut'; cutId: string; startMs: number; endMs: number }
  | { type: 'addCutToBin'; cutId: string; binId: string }
  | { type: 'addCutToSequence'; cutId: string; options?: { sequenceId?: string; variantId?: string } }
  | { type: 'buildVariantFromReviewedCuts'; variantId: string; mode?: SequenceBuildMode }
  | { type: 'buildNewVariantFromReviewedCuts'; variantId: string; mode?: SequenceBuildMode }
  | { type: 'moveClip'; variantId: string; clipId: string; direction: -1 | 1 }
  | { type: 'removeClip'; variantId: string; clipId: string }
  | { type: 'trimClip'; variantId: string; clipId: string; deltaMs: number }
  | { type: 'setClipOverlayAsset'; variantId: string; clipId: string; assetId?: string }
  | { type: 'setClipOverlayCut'; variantId: string; clipId: string; cutId?: string }
  | { type: 'setClipTransition'; variantId: string; clipId: string; transition: TransitionStyle }
  | { type: 'setClipTransitionDuration'; variantId: string; clipId: string; durationMs: number }
  | { type: 'setClipTransitionAsset'; variantId: string; clipId: string; assetId?: string }
  | { type: 'setClipTransitionCut'; variantId: string; clipId: string; cutId?: string }
  | { type: 'setClipTransitionOverlayAsset'; variantId: string; clipId: string; assetId?: string }
  | { type: 'setClipTransitionOverlayCut'; variantId: string; clipId: string; cutId?: string }
  | { type: 'randomizeFoundryTransitions'; variantId: string }
  | { type: 'randomizeFoundryOverlays'; variantId: string }
  | { type: 'duplicateVariant'; variantId: string }
  | { type: 'deleteVariant'; variantId: string }
  | { type: 'addMarker'; variantId: string; label: string; timeMs: number }
  | { type: 'addSection'; variantId: string; label: string; startMs: number; endMs: number }
  | { type: 'addFilterToSequenceStack'; filterType: SupportedFilterType; stackId?: string }
  | { type: 'removeFilterFromSequenceStack'; stackId: string; filterId: string }
  | { type: 'moveFilterInSequenceStack'; stackId: string; filterId: string; direction: -1 | 1 }
  | { type: 'toggleFilterEnabled'; stackId: string; filterId: string }
  | { type: 'updateFilterMix'; stackId: string; filterId: string; mix: number }
  | { type: 'updateFilterParameter'; stackId: string; filterId: string; key: Exclude<AutomationTargetProperty, 'mix'>; value: number }
  | { type: 'applyPresetToSequenceStack'; presetId: string; stackId?: string }
  | { type: 'safeRandomizeFilter'; stackId: string; filterId: string }
  | { type: 'safeRandomizeStack'; stackId: string }
  | { type: 'addAutomationLane'; filterId: string; property: AutomationTargetProperty; name: string }
  | { type: 'removeAutomationLane'; laneId: string }
  | { type: 'updateAutomationLaneTarget'; laneId: string; filterId: string; property: AutomationTargetProperty }
  | { type: 'setAutomationLaneEnabled'; laneId: string; enabled: boolean }
  | { type: 'addLaneKeyframe'; laneId: string; timeMs: number; value: number }
  | { type: 'updateLaneKeyframe'; laneId: string; keyframeId: string; timeMs: number; value: number }
  | { type: 'removeLaneKeyframe'; laneId: string; keyframeId: string }
  | { type: 'resetLane'; laneId: string }
  | { type: 'toggleExportProfile'; profileId: string }
  | { type: 'setVariantMusicAsset'; variantId: string; assetId: string }
  | { type: 'setProjectMusicAsset'; assetId: string }
  | { type: 'setVariantMusicSyncMode'; variantId: string; syncMode: SyncMode }
  | { type: 'applySyncMarkers'; variantId: string; markers: Marker[] };

export interface ProjectOperationRequest {
  project: NormalizedProjectFile;
  operation: ProjectOperation;
}

export interface ProjectMaterializeAnalysisCutsRequest {
  project: NormalizedProjectFile;
  projectFilePath?: string;
  assetId: string;
  analysisRefId?: string;
  analysisPath: string;
}

export interface ProjectMutationResult {
  session: ProjectSessionSnapshot;
  addedCutIds?: string[];
  saved: boolean;
}

export interface ProjectCommandMap {
  'project.create': {
    payload: { name?: string } | undefined;
    result: ProjectSessionSnapshot | null;
  };
  'project.open': {
    payload: undefined;
    result: ProjectSessionSnapshot | null;
  };
  'project.openAt': {
    payload: string;
    result: ProjectSessionSnapshot;
  };
  'project.removeRecentProject': {
    payload: string;
    result: string[];
  };
  'project.save': {
    payload: SaveProjectRequest;
    result: ProjectSessionSnapshot;
  };
  'project.saveAs': {
    payload: SaveProjectRequest;
    result: ProjectSessionSnapshot | null;
  };
  'project.duplicate': {
    payload: SaveProjectRequest;
    result: ProjectSessionSnapshot | null;
  };
  'project.revealFolder': {
    payload: string;
    result: void;
  };
  'project.importMedia': {
    payload: string | undefined;
    result: MediaAsset[];
  };
  'project.importMusic': {
    payload: string | undefined;
    result: MediaAsset[];
  };
  'project.importTransitionMasks': {
    payload: string | undefined;
    result: MediaAsset[];
  };
  'project.importTransitionOverlays': {
    payload: string | undefined;
    result: MediaAsset[];
  };
  'project.relinkAsset': {
    payload: { projectRoot: string; assetId: string; currentPath?: string };
    result: RelinkAssetResult | null;
  };
  'project.importCueFile': {
    payload: undefined;
    result: ImportCueFileResult | null;
  };
  'project.applyOperation': {
    payload: ProjectOperationRequest;
    result: NormalizedProjectFile;
  };
  'project.materializeAnalysisCuts': {
    payload: ProjectMaterializeAnalysisCutsRequest;
    result: ProjectMutationResult;
  };
}

export interface ProjectQueryMap {
  'project.getInitialState': {
    payload: undefined;
    result: ProjectSessionSnapshot;
  };
  'project.loadAnalysis': {
    payload: string;
    result: AnalysisFile | null;
  };
}

export interface ProjectEventMap {
  'project.recentProjectsChanged': string[];
}
