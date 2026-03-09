import { create } from 'zustand';
import type { MediaAsset, NormalizedProjectFile } from '@afterimage/project-model';
import { createEmptyProject } from '@afterimage/project-model';
import {
  addCutToSequence,
  addMarker,
  applySyncMarkers,
  addSection,
  duplicateVariant,
  moveClip,
  trimClip
} from '../operations/sequence-ops';
import { addLaneKeyframe, addAutomationLane, resetLane } from '../operations/automation-ops';
import { addCutToBin, toggleCutFavorite, trimCut, updateCutStatus } from '../operations/cut-ops';
import { mergeImportedAssets, replaceAssetPath, setVariantMusicAsset, setVariantMusicSyncMode, toggleExportProfile } from '../operations/project-ops';
import { addFilterToStack, safeRandomizeFilter, safeRandomizeStack, toggleFilterEnabled } from '../operations/style-ops';
import type { Marker, SyncMode } from '@afterimage/project-model';

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
  addFilterToSequenceStack: (type: string) => void;
  toggleFilterEnabled: (stackId: string, filterId: string) => void;
  safeRandomizeFilter: (stackId: string, filterId: string) => void;
  safeRandomizeStack: (stackId: string) => void;
  addAutomationLane: (filterId: string, name: string) => void;
  addLaneKeyframe: (laneId: string, timeMs: number, value: number) => void;
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
    set((state) => ({
      project: addCutToSequence(state.project, cutId),
      dirty: true
    }));
  },
  moveClip: (variantId, clipId, direction) => {
    set((state) => ({
      project: moveClip(state.project, variantId, clipId, direction),
      dirty: true
    }));
  },
  trimClip: (variantId, clipId, deltaMs) => {
    set((state) => ({
      project: trimClip(state.project, variantId, clipId, deltaMs),
      dirty: true
    }));
  },
  duplicateVariant: (variantId) => {
    set((state) => ({
      project: duplicateVariant(state.project, variantId),
      dirty: true
    }));
  },
  addMarker: (variantId, label, timeMs) => {
    set((state) => ({
      project: addMarker(state.project, variantId, {
        id: `marker-${Date.now()}`,
        label,
        timeMs,
        kind: 'marker'
      }),
      dirty: true
    }));
  },
  addSection: (variantId, label, startMs, endMs) => {
    set((state) => ({
      project: addSection(state.project, variantId, {
        id: `section-${Date.now()}`,
        label,
        startMs,
        endMs
      }),
      dirty: true
    }));
  },
  addFilterToSequenceStack: (type) => {
    const stackId = get().project.variants[0]?.stackId;
    if (!stackId) {
      return;
    }

    set((state) => ({
      project: addFilterToStack(state.project, stackId, {
        id: `filter-${Date.now()}`,
        type,
        enabled: true,
        parameters: {
          amount: 0.25
        },
        mix: 0.8
      }),
      dirty: true
    }));
  },
  toggleFilterEnabled: (stackId, filterId) => {
    set((state) => ({
      project: toggleFilterEnabled(state.project, stackId, filterId),
      dirty: true
    }));
  },
  safeRandomizeFilter: (stackId, filterId) => {
    set((state) => ({
      project: safeRandomizeFilter(state.project, stackId, filterId),
      dirty: true
    }));
  },
  safeRandomizeStack: (stackId) => {
    set((state) => ({
      project: safeRandomizeStack(state.project, stackId),
      dirty: true
    }));
  },
  addAutomationLane: (filterId, name) => {
    set((state) => ({
      project: addAutomationLane(state.project, {
        id: `lane-${Date.now()}`,
        name,
        target: {
          filterId,
          property: 'mix'
        },
        enabled: true,
        keyframes: [
          {
            id: `keyframe-${Date.now()}`,
            timeMs: 0,
            value: 0.5
          }
        ]
      }),
      dirty: true
    }));
  },
  addLaneKeyframe: (laneId, timeMs, value) => {
    set((state) => ({
      project: addLaneKeyframe(state.project, laneId, {
        id: `keyframe-${Date.now()}`,
        timeMs,
        value
      }),
      dirty: true
    }));
  },
  resetLane: (laneId) => {
    set((state) => ({
      project: resetLane(state.project, laneId),
      dirty: true
    }));
  },
  toggleExportProfile: (profileId) => {
    set((state) => ({
      project: toggleExportProfile(state.project, profileId),
      dirty: true
    }));
  },
  setVariantMusicAsset: (variantId, assetId) => {
    set((state) => ({
      project: setVariantMusicAsset(state.project, variantId, assetId),
      dirty: true
    }));
  },
  setVariantMusicSyncMode: (variantId, syncMode) => {
    set((state) => ({
      project: setVariantMusicSyncMode(state.project, variantId, syncMode),
      dirty: true
    }));
  },
  applySyncMarkers: (variantId, markers) => {
    set((state) => ({
      project: applySyncMarkers(state.project, variantId, markers),
      dirty: true
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
