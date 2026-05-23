import { create } from 'zustand';
import type {
  ArchiveAcceptanceScope,
  ArchiveMetadataFile,
  ArchiveReferenceKind,
  AutomationTargetProperty,
  MediaAsset,
  NormalizedProjectFile,
  SupportedFilterType,
  TransitionStyle
} from '@afterimage/project-model';
import type { ProjectOperation } from '../lib/studio-client';
import type { Marker, SyncMode } from '@afterimage/project-model';
import { getStudioClient } from '../lib/studio-client';
import { useUiStore } from './ui-store';

type SequenceBuildMode = Extract<ProjectOperation, { type: 'buildVariantFromReviewedCuts' }>['mode'];
type ArchiveCandidateActionInput = {
  archive: ArchiveMetadataFile;
  referenceKind: ArchiveReferenceKind;
  candidateId: string;
  scope?: ArchiveAcceptanceScope;
  targetIds?: string[];
  note?: string;
};

let projectOperationQueue: Promise<void> = Promise.resolve();

function invalidatePreview(): void {
  useUiStore.getState().setPreviewPath(undefined);
}

function dispatchProjectOperation(
  set: (partial: Partial<ProjectSessionState>) => void,
  get: () => ProjectSessionState,
  operation: ProjectOperation
): void {
  projectOperationQueue = projectOperationQueue.then(async () => {
    const state = get();
    if (!state.ready) {
      return;
    }

    const project = await getStudioClient().project.applyOperation({
      project: state.project,
      operation
    });
    set({
      project,
      dirty: true,
      ready: true
    });
    invalidatePreview();
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    useUiStore.getState().addNotification(`Project update failed: ${message}`, 'warn', 5200);
  });
}

interface ProjectSessionState {
  project: NormalizedProjectFile;
  projectFilePath?: string;
  projectRoot?: string;
  recentProjects: string[];
  dirty: boolean;
  ready: boolean;
  setSession: (input: { project: NormalizedProjectFile; projectFilePath?: string; projectRoot?: string; recentProjects?: string[] }) => void;
  setRecentProjects: (recentProjects: string[]) => void;
  setProject: (project: NormalizedProjectFile) => void;
  mergeImportedAssets: (assets: MediaAsset[]) => void;
  relinkAsset: (assetId: string, absolutePath: string, relativePath?: string) => void;
  updateCutStatus: (cutId: string, status: 'new' | 'kept' | 'rejected' | 'favorite') => void;
  toggleCutFavorite: (cutId: string) => void;
  trimCut: (cutId: string, startMs: number, endMs: number) => void;
  addCutToBin: (cutId: string, binId: string) => void;
  addCutToSequence: (cutId: string, options?: { sequenceId?: string; variantId?: string }) => void;
  buildVariantFromReviewedCuts: (variantId: string, mode?: SequenceBuildMode) => void;
  buildNewVariantFromReviewedCuts: (variantId: string, mode?: SequenceBuildMode) => void;
  moveClip: (variantId: string, clipId: string, direction: -1 | 1) => void;
  removeClip: (variantId: string, clipId: string) => void;
  trimClip: (variantId: string, clipId: string, deltaMs: number) => void;
  setClipOverlayAsset: (variantId: string, clipId: string, assetId?: string) => void;
  setClipOverlayCut: (variantId: string, clipId: string, cutId?: string) => void;
  setClipTransition: (variantId: string, clipId: string, transition: TransitionStyle) => void;
  setClipTransitionDuration: (variantId: string, clipId: string, durationMs: number) => void;
  setClipTransitionAsset: (variantId: string, clipId: string, assetId?: string) => void;
  setClipTransitionCut: (variantId: string, clipId: string, cutId?: string) => void;
  setClipTransitionOverlayAsset: (variantId: string, clipId: string, assetId?: string) => void;
  setClipTransitionOverlayCut: (variantId: string, clipId: string, cutId?: string) => void;
  randomizeFoundryTransitions: (variantId: string) => void;
  randomizeFoundryOverlays: (variantId: string) => void;
  duplicateVariant: (variantId: string) => void;
  deleteVariant: (variantId: string) => void;
  addMarker: (variantId: string, label: string, timeMs: number) => void;
  addSection: (variantId: string, label: string, startMs: number, endMs: number) => void;
  addFilterToSequenceStack: (type: SupportedFilterType, stackId?: string) => void;
  removeFilterFromSequenceStack: (stackId: string, filterId: string) => void;
  moveFilterInSequenceStack: (stackId: string, filterId: string, direction: -1 | 1) => void;
  toggleFilterEnabled: (stackId: string, filterId: string) => void;
  updateFilterMix: (stackId: string, filterId: string, mix: number) => void;
  updateFilterParameter: (stackId: string, filterId: string, key: Exclude<AutomationTargetProperty, 'mix'>, value: number) => void;
  applyPresetToSequenceStack: (presetId: string, stackId?: string) => void;
  safeRandomizeFilter: (stackId: string, filterId: string) => void;
  safeRandomizeStack: (stackId: string) => void;
  addAutomationLane: (filterId: string, property: AutomationTargetProperty, name: string) => void;
  removeAutomationLane: (laneId: string) => void;
  updateAutomationLaneTarget: (laneId: string, filterId: string, property: AutomationTargetProperty) => void;
  setAutomationLaneEnabled: (laneId: string, enabled: boolean) => void;
  addLaneKeyframe: (laneId: string, timeMs: number, value: number) => void;
  updateLaneKeyframe: (laneId: string, keyframeId: string, timeMs: number, value: number) => void;
  removeLaneKeyframe: (laneId: string, keyframeId: string) => void;
  resetLane: (laneId: string) => void;
  toggleExportProfile: (profileId: string) => void;
  setVariantMusicAsset: (variantId: string, assetId: string) => void;
  setProjectMusicAsset: (assetId: string) => void;
  setVariantMusicSyncMode: (variantId: string, syncMode: SyncMode) => void;
  applySyncMarkers: (variantId: string, markers: Marker[]) => void;
  acceptArchiveCandidate: (input: ArchiveCandidateActionInput) => void;
  rejectArchiveCandidate: (input: ArchiveCandidateActionInput) => void;
  markSaved: (input: { projectFilePath?: string; projectRoot?: string; recentProjects?: string[] }) => void;
}

export const useProjectSessionStore = create<ProjectSessionState>((set, get) => ({
  project: undefined as unknown as NormalizedProjectFile,
  dirty: false,
  ready: false,
  recentProjects: [],
  setSession: (input) => {
    set({
      project: input.project,
      projectFilePath: input.projectFilePath,
      projectRoot: input.projectRoot,
      recentProjects: input.recentProjects ?? [],
      dirty: false,
      ready: true
    });
  },
  setRecentProjects: (recentProjects) => {
    set({ recentProjects });
  },
  setProject: (project) => {
    set({
      project,
      dirty: true,
      ready: true
    });
    invalidatePreview();
  },
  mergeImportedAssets: (assets) => dispatchProjectOperation(set, get, { type: 'mergeImportedAssets', assets }),
  relinkAsset: (assetId, absolutePath, relativePath) => dispatchProjectOperation(set, get, { type: 'relinkAsset', assetId, absolutePath, relativePath }),
  updateCutStatus: (cutId, status) => dispatchProjectOperation(set, get, { type: 'updateCutStatus', cutId, status }),
  toggleCutFavorite: (cutId) => dispatchProjectOperation(set, get, { type: 'toggleCutFavorite', cutId }),
  trimCut: (cutId, startMs, endMs) => dispatchProjectOperation(set, get, { type: 'trimCut', cutId, startMs, endMs }),
  addCutToBin: (cutId, binId) => dispatchProjectOperation(set, get, { type: 'addCutToBin', cutId, binId }),
  addCutToSequence: (cutId, options) => dispatchProjectOperation(set, get, { type: 'addCutToSequence', cutId, options }),
  buildVariantFromReviewedCuts: (variantId, mode) => dispatchProjectOperation(set, get, { type: 'buildVariantFromReviewedCuts', variantId, mode }),
  buildNewVariantFromReviewedCuts: (variantId, mode) => dispatchProjectOperation(set, get, { type: 'buildNewVariantFromReviewedCuts', variantId, mode }),
  moveClip: (variantId, clipId, direction) => dispatchProjectOperation(set, get, { type: 'moveClip', variantId, clipId, direction }),
  removeClip: (variantId, clipId) => dispatchProjectOperation(set, get, { type: 'removeClip', variantId, clipId }),
  trimClip: (variantId, clipId, deltaMs) => dispatchProjectOperation(set, get, { type: 'trimClip', variantId, clipId, deltaMs }),
  setClipOverlayAsset: (variantId, clipId, assetId) => dispatchProjectOperation(set, get, { type: 'setClipOverlayAsset', variantId, clipId, assetId }),
  setClipOverlayCut: (variantId, clipId, cutId) => dispatchProjectOperation(set, get, { type: 'setClipOverlayCut', variantId, clipId, cutId }),
  setClipTransition: (variantId, clipId, transition) => dispatchProjectOperation(set, get, { type: 'setClipTransition', variantId, clipId, transition }),
  setClipTransitionDuration: (variantId, clipId, durationMs) => dispatchProjectOperation(set, get, { type: 'setClipTransitionDuration', variantId, clipId, durationMs }),
  setClipTransitionAsset: (variantId, clipId, assetId) => dispatchProjectOperation(set, get, { type: 'setClipTransitionAsset', variantId, clipId, assetId }),
  setClipTransitionCut: (variantId, clipId, cutId) => dispatchProjectOperation(set, get, { type: 'setClipTransitionCut', variantId, clipId, cutId }),
  setClipTransitionOverlayAsset: (variantId, clipId, assetId) => dispatchProjectOperation(set, get, { type: 'setClipTransitionOverlayAsset', variantId, clipId, assetId }),
  setClipTransitionOverlayCut: (variantId, clipId, cutId) => dispatchProjectOperation(set, get, { type: 'setClipTransitionOverlayCut', variantId, clipId, cutId }),
  randomizeFoundryTransitions: (variantId) => dispatchProjectOperation(set, get, { type: 'randomizeFoundryTransitions', variantId }),
  randomizeFoundryOverlays: (variantId) => dispatchProjectOperation(set, get, { type: 'randomizeFoundryOverlays', variantId }),
  duplicateVariant: (variantId) => dispatchProjectOperation(set, get, { type: 'duplicateVariant', variantId }),
  deleteVariant: (variantId) => dispatchProjectOperation(set, get, { type: 'deleteVariant', variantId }),
  addMarker: (variantId, label, timeMs) => dispatchProjectOperation(set, get, { type: 'addMarker', variantId, label, timeMs }),
  addSection: (variantId, label, startMs, endMs) => dispatchProjectOperation(set, get, { type: 'addSection', variantId, label, startMs, endMs }),
  addFilterToSequenceStack: (filterType, stackId) => dispatchProjectOperation(set, get, { type: 'addFilterToSequenceStack', filterType, stackId }),
  removeFilterFromSequenceStack: (stackId, filterId) => dispatchProjectOperation(set, get, { type: 'removeFilterFromSequenceStack', stackId, filterId }),
  moveFilterInSequenceStack: (stackId, filterId, direction) => dispatchProjectOperation(set, get, { type: 'moveFilterInSequenceStack', stackId, filterId, direction }),
  toggleFilterEnabled: (stackId, filterId) => dispatchProjectOperation(set, get, { type: 'toggleFilterEnabled', stackId, filterId }),
  updateFilterMix: (stackId, filterId, mix) => dispatchProjectOperation(set, get, { type: 'updateFilterMix', stackId, filterId, mix }),
  updateFilterParameter: (stackId, filterId, key, value) => dispatchProjectOperation(set, get, { type: 'updateFilterParameter', stackId, filterId, key, value }),
  applyPresetToSequenceStack: (presetId, stackId) => dispatchProjectOperation(set, get, { type: 'applyPresetToSequenceStack', presetId, stackId }),
  safeRandomizeFilter: (stackId, filterId) => dispatchProjectOperation(set, get, { type: 'safeRandomizeFilter', stackId, filterId }),
  safeRandomizeStack: (stackId) => dispatchProjectOperation(set, get, { type: 'safeRandomizeStack', stackId }),
  addAutomationLane: (filterId, property, name) => dispatchProjectOperation(set, get, { type: 'addAutomationLane', filterId, property, name }),
  removeAutomationLane: (laneId) => dispatchProjectOperation(set, get, { type: 'removeAutomationLane', laneId }),
  updateAutomationLaneTarget: (laneId, filterId, property) => dispatchProjectOperation(set, get, { type: 'updateAutomationLaneTarget', laneId, filterId, property }),
  setAutomationLaneEnabled: (laneId, enabled) => dispatchProjectOperation(set, get, { type: 'setAutomationLaneEnabled', laneId, enabled }),
  addLaneKeyframe: (laneId, timeMs, value) => dispatchProjectOperation(set, get, { type: 'addLaneKeyframe', laneId, timeMs, value }),
  updateLaneKeyframe: (laneId, keyframeId, timeMs, value) => dispatchProjectOperation(set, get, { type: 'updateLaneKeyframe', laneId, keyframeId, timeMs, value }),
  removeLaneKeyframe: (laneId, keyframeId) => dispatchProjectOperation(set, get, { type: 'removeLaneKeyframe', laneId, keyframeId }),
  resetLane: (laneId) => dispatchProjectOperation(set, get, { type: 'resetLane', laneId }),
  toggleExportProfile: (profileId) => dispatchProjectOperation(set, get, { type: 'toggleExportProfile', profileId }),
  setVariantMusicAsset: (variantId, assetId) => dispatchProjectOperation(set, get, { type: 'setVariantMusicAsset', variantId, assetId }),
  setProjectMusicAsset: (assetId) => dispatchProjectOperation(set, get, { type: 'setProjectMusicAsset', assetId }),
  setVariantMusicSyncMode: (variantId, syncMode) => dispatchProjectOperation(set, get, { type: 'setVariantMusicSyncMode', variantId, syncMode }),
  applySyncMarkers: (variantId, markers) => dispatchProjectOperation(set, get, { type: 'applySyncMarkers', variantId, markers }),
  acceptArchiveCandidate: (input) => dispatchProjectOperation(set, get, { type: 'acceptArchiveCandidate', ...input }),
  rejectArchiveCandidate: (input) => dispatchProjectOperation(set, get, { type: 'rejectArchiveCandidate', ...input }),
  markSaved: (input) => {
    set((state) => ({
      projectFilePath: input.projectFilePath ?? state.projectFilePath,
      projectRoot: input.projectRoot ?? state.projectRoot,
      recentProjects: input.recentProjects ?? state.recentProjects,
      dirty: false
    }));
  }
}));
