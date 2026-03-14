import { create } from 'zustand';
import type { AutomationTargetProperty, MediaAsset, NormalizedProjectFile, SupportedFilterType } from '@afterimage/project-model';
import { createEmptyProject, getDefaultFilterParameters, getFilterDefinition, getPrimaryAutomationProperty } from '@afterimage/project-model';
import {
  addCutToSequence,
  addMarker,
  applySyncMarkers,
  addSection,
  duplicateVariant,
  moveClip,
  trimClip
} from '../operations/sequence-ops';
import {
  addLaneKeyframe,
  addAutomationLane,
  removeAutomationLane,
  removeLaneKeyframe,
  resetLane,
  setAutomationLaneEnabled,
  updateAutomationLaneTarget,
  updateLaneKeyframe
} from '../operations/automation-ops';
import { addCutToBin, toggleCutFavorite, trimCut, updateCutStatus } from '../operations/cut-ops';
import { mergeImportedAssets, replaceAssetPath, setVariantMusicAsset, setVariantMusicSyncMode, toggleExportProfile } from '../operations/project-ops';
import {
  addFilterToStack,
  applyPresetToStack,
  moveFilterInStack,
  removeFilterFromStack,
  safeRandomizeFilter,
  safeRandomizeStack,
  toggleFilterEnabled,
  updateFilterMix,
  updateFilterParameter
} from '../operations/style-ops';
import type { Marker, SyncMode } from '@afterimage/project-model';
import { useUiStore } from './ui-store';

function invalidatePreview(): void {
  useUiStore.getState().setPreviewPath(undefined);
}

function markDirty<T extends Record<string, unknown>>(partial: T): T & { dirty: true } {
  invalidatePreview();
  return {
    ...partial,
    dirty: true
  };
}

interface ProjectSessionState {
  project: NormalizedProjectFile;
  projectFilePath?: string;
  projectRoot?: string;
  recentProjects: string[];
  dirty: boolean;
  setSession: (input: { project: NormalizedProjectFile; projectFilePath?: string; projectRoot?: string; recentProjects?: string[] }) => void;
  setProject: (project: NormalizedProjectFile) => void;
  mergeImportedAssets: (assets: MediaAsset[]) => void;
  relinkAsset: (assetId: string, absolutePath: string, relativePath?: string) => void;
  updateCutStatus: (cutId: string, status: 'new' | 'kept' | 'rejected' | 'favorite') => void;
  toggleCutFavorite: (cutId: string) => void;
  trimCut: (cutId: string, startMs: number, endMs: number) => void;
  addCutToBin: (cutId: string, binId: string) => void;
  addCutToSequence: (cutId: string) => void;
  moveClip: (variantId: string, clipId: string, direction: -1 | 1) => void;
  trimClip: (variantId: string, clipId: string, deltaMs: number) => void;
  duplicateVariant: (variantId: string) => void;
  addMarker: (variantId: string, label: string, timeMs: number) => void;
  addSection: (variantId: string, label: string, startMs: number, endMs: number) => void;
  addFilterToSequenceStack: (type: SupportedFilterType) => void;
  removeFilterFromSequenceStack: (stackId: string, filterId: string) => void;
  moveFilterInSequenceStack: (stackId: string, filterId: string, direction: -1 | 1) => void;
  toggleFilterEnabled: (stackId: string, filterId: string) => void;
  updateFilterMix: (stackId: string, filterId: string, mix: number) => void;
  updateFilterParameter: (stackId: string, filterId: string, key: Exclude<AutomationTargetProperty, 'mix'>, value: number) => void;
  applyPresetToSequenceStack: (presetId: string) => void;
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
  setVariantMusicSyncMode: (variantId: string, syncMode: SyncMode) => void;
  applySyncMarkers: (variantId: string, markers: Marker[]) => void;
  markSaved: (input: { projectFilePath?: string; projectRoot?: string; recentProjects?: string[] }) => void;
}

export const useProjectSessionStore = create<ProjectSessionState>((set, get) => ({
  project: createEmptyProject({
    id: 'project-studio-shell',
    name: 'Studio Shell'
  }),
  dirty: false,
  recentProjects: [],
  setSession: (input) => {
    set({
      project: input.project,
      projectFilePath: input.projectFilePath,
      projectRoot: input.projectRoot,
      recentProjects: input.recentProjects ?? [],
      dirty: false
    });
  },
  setProject: (project) => {
    set({
      project,
      dirty: true
    });
    invalidatePreview();
  },
  mergeImportedAssets: (assets) => {
    set((state) => ({
      project: mergeImportedAssets(state.project, assets),
      dirty: true
    }));
  },
  relinkAsset: (assetId, absolutePath, relativePath) => {
    set((state) => ({
      project: replaceAssetPath(state.project, assetId, {
        absolutePath,
        relativePath
      }),
      dirty: true
    }));
  },
  updateCutStatus: (cutId, status) => {
    set((state) => ({
      project: updateCutStatus(state.project, cutId, status),
      dirty: true
    }));
  },
  toggleCutFavorite: (cutId) => {
    set((state) => ({
      project: toggleCutFavorite(state.project, cutId),
      dirty: true
    }));
  },
  trimCut: (cutId, startMs, endMs) => {
    set((state) => ({
      project: trimCut(state.project, cutId, startMs, endMs),
      dirty: true
    }));
  },
  addCutToBin: (cutId, binId) => {
    set((state) => ({
      project: addCutToBin(state.project, cutId, binId),
      dirty: true
    }));
  },
  addCutToSequence: (cutId) => {
    set((state) => markDirty({
      project: addCutToSequence(state.project, cutId)
    }));
  },
  moveClip: (variantId, clipId, direction) => {
    set((state) => markDirty({
      project: moveClip(state.project, variantId, clipId, direction)
    }));
  },
  trimClip: (variantId, clipId, deltaMs) => {
    set((state) => markDirty({
      project: trimClip(state.project, variantId, clipId, deltaMs)
    }));
  },
  duplicateVariant: (variantId) => {
    set((state) => markDirty({
      project: duplicateVariant(state.project, variantId)
    }));
  },
  addMarker: (variantId, label, timeMs) => {
    set((state) => markDirty({
      project: addMarker(state.project, variantId, {
        id: `marker-${Date.now()}`,
        label,
        timeMs,
        kind: 'marker'
      })
    }));
  },
  addSection: (variantId, label, startMs, endMs) => {
    set((state) => markDirty({
      project: addSection(state.project, variantId, {
        id: `section-${Date.now()}`,
        label,
        startMs,
        endMs
      })
    }));
  },
  addFilterToSequenceStack: (type) => {
    const stackId = get().project.variants[0]?.stackId;
    const definition = getFilterDefinition(type);
    const primaryKey = getPrimaryAutomationProperty(type);
    if (!stackId || !definition || !primaryKey) {
      return;
    }

    set((state) => markDirty({
      project: addFilterToStack(state.project, stackId, {
        id: `filter-${Date.now()}`,
        type,
        enabled: true,
        parameters: getDefaultFilterParameters(type),
        mix: 0.8
      })
    }));
  },
  removeFilterFromSequenceStack: (stackId, filterId) => {
    set((state) => markDirty({
      project: removeFilterFromStack(state.project, stackId, filterId)
    }));
  },
  moveFilterInSequenceStack: (stackId, filterId, direction) => {
    set((state) => markDirty({
      project: moveFilterInStack(state.project, stackId, filterId, direction)
    }));
  },
  toggleFilterEnabled: (stackId, filterId) => {
    set((state) => markDirty({
      project: toggleFilterEnabled(state.project, stackId, filterId)
    }));
  },
  updateFilterMix: (stackId, filterId, mix) => {
    set((state) => markDirty({
      project: updateFilterMix(state.project, stackId, filterId, mix)
    }));
  },
  updateFilterParameter: (stackId, filterId, key, value) => {
    set((state) => markDirty({
      project: updateFilterParameter(state.project, stackId, filterId, key, value)
    }));
  },
  applyPresetToSequenceStack: (presetId) => {
    const stackId = get().project.variants[0]?.stackId;
    if (!stackId) {
      return;
    }

    set((state) => markDirty({
      project: applyPresetToStack(state.project, presetId, stackId)
    }));
  },
  safeRandomizeFilter: (stackId, filterId) => {
    set((state) => markDirty({
      project: safeRandomizeFilter(state.project, stackId, filterId)
    }));
  },
  safeRandomizeStack: (stackId) => {
    set((state) => markDirty({
      project: safeRandomizeStack(state.project, stackId)
    }));
  },
  addAutomationLane: (filterId, property, name) => {
    set((state) => markDirty({
      project: addAutomationLane(state.project, {
        id: `lane-${Date.now()}`,
        name,
        target: {
          filterId,
          property
        },
        enabled: true,
        keyframes: [
          {
            id: `keyframe-${Date.now()}`,
            timeMs: 0,
            value: 0.5
          }
        ]
      })
    }));
  },
  removeAutomationLane: (laneId) => {
    set((state) => markDirty({
      project: removeAutomationLane(state.project, laneId)
    }));
  },
  updateAutomationLaneTarget: (laneId, filterId, property) => {
    set((state) => markDirty({
      project: updateAutomationLaneTarget(state.project, laneId, { filterId, property })
    }));
  },
  setAutomationLaneEnabled: (laneId, enabled) => {
    set((state) => markDirty({
      project: setAutomationLaneEnabled(state.project, laneId, enabled)
    }));
  },
  addLaneKeyframe: (laneId, timeMs, value) => {
    set((state) => markDirty({
      project: addLaneKeyframe(state.project, laneId, {
        id: `keyframe-${Date.now()}`,
        timeMs,
        value
      })
    }));
  },
  updateLaneKeyframe: (laneId, keyframeId, timeMs, value) => {
    set((state) => markDirty({
      project: updateLaneKeyframe(state.project, laneId, keyframeId, { timeMs, value })
    }));
  },
  removeLaneKeyframe: (laneId, keyframeId) => {
    set((state) => markDirty({
      project: removeLaneKeyframe(state.project, laneId, keyframeId)
    }));
  },
  resetLane: (laneId) => {
    set((state) => markDirty({
      project: resetLane(state.project, laneId)
    }));
  },
  toggleExportProfile: (profileId) => {
    set((state) => ({
      project: toggleExportProfile(state.project, profileId),
      dirty: true
    }));
  },
  setVariantMusicAsset: (variantId, assetId) => {
    set((state) => markDirty({
      project: setVariantMusicAsset(state.project, variantId, assetId)
    }));
  },
  setVariantMusicSyncMode: (variantId, syncMode) => {
    set((state) => markDirty({
      project: setVariantMusicSyncMode(state.project, variantId, syncMode)
    }));
  },
  applySyncMarkers: (variantId, markers) => {
    set((state) => markDirty({
      project: applySyncMarkers(state.project, variantId, markers)
    }));
  },
  markSaved: (input) => {
    set((state) => ({
      projectFilePath: input.projectFilePath ?? state.projectFilePath,
      projectRoot: input.projectRoot ?? state.projectRoot,
      recentProjects: input.recentProjects ?? state.recentProjects,
      dirty: false
    }));
  }
}));
