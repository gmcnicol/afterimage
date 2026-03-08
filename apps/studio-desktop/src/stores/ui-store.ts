import { create } from 'zustand';

export type StudioTab =
  | 'project'
  | 'media'
  | 'analysis'
  | 'cuts'
  | 'sequence'
  | 'music'
  | 'style'
  | 'automation'
  | 'export'
  | 'diagnostics';

interface UiStoreState {
  currentTab: StudioTab;
  selectedAssetId?: string;
  selectedCutId?: string;
  selectedVariantId?: string;
  selectedFilterId?: string;
  previewPath?: string;
  statusMessage?: string;
  setCurrentTab: (tab: StudioTab) => void;
  selectAsset: (assetId?: string) => void;
  selectCut: (cutId?: string) => void;
  selectVariant: (variantId?: string) => void;
  selectFilter: (filterId?: string) => void;
  setPreviewPath: (path?: string) => void;
  setStatusMessage: (statusMessage?: string) => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  currentTab: 'project',
  setCurrentTab: (currentTab) => set({ currentTab }),
  selectAsset: (selectedAssetId) => set({ selectedAssetId }),
  selectCut: (selectedCutId) => set({ selectedCutId }),
  selectVariant: (selectedVariantId) => set({ selectedVariantId }),
  selectFilter: (selectedFilterId) => set({ selectedFilterId }),
  setPreviewPath: (previewPath) => set({ previewPath }),
  setStatusMessage: (statusMessage) => set({ statusMessage })
}));
