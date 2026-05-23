import { create } from 'zustand';

export type StudioTab =
  | 'archive'
  | 'project'
  | 'catalog'
  | 'media'
  | 'cuts'
  | 'world'
  | 'sequence'
  | 'music'
  | 'style'
  | 'automation'
  | 'export'
  | 'diagnostics';

export type StudioSpace =
  | 'archive'
  | 'world'
  | 'performance'
  | 'capture'
  | 'observatory';

export interface UiNotification {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'warn';
}

interface UiStoreState {
  currentSpace: StudioSpace;
  currentTab: StudioTab;
  selectedAssetId?: string;
  selectedCutId?: string;
  selectedVariantId?: string;
  selectedFilterId?: string;
  selectedTaskId?: string;
  previewPath?: string;
  notifications: UiNotification[];
  setCurrentSpace: (space: StudioSpace) => void;
  setCurrentTab: (tab: StudioTab) => void;
  setWorkspaceSurface: (space: StudioSpace, tab: StudioTab) => void;
  selectTask: (taskId?: string) => void;
  selectAsset: (assetId?: string) => void;
  selectCut: (cutId?: string) => void;
  selectVariant: (variantId?: string) => void;
  selectFilter: (filterId?: string) => void;
  setPreviewPath: (path?: string) => void;
  addNotification: (message: string, tone?: UiNotification['tone'], ttlMs?: number) => string;
  removeNotification: (notificationId: string) => void;
}

export function getStudioSpaceForTab(tab: StudioTab): StudioSpace {
  switch (tab) {
    case 'archive':
    case 'project':
    case 'catalog':
    case 'media':
      return 'archive';
    case 'export':
      return 'capture';
    case 'diagnostics':
      return 'observatory';
    default:
      return 'world';
  }
}

export function getDefaultTabForSpace(space: StudioSpace): StudioTab {
  switch (space) {
    case 'archive':
      return 'archive';
    case 'world':
      return 'world';
    case 'performance':
      return 'sequence';
    case 'capture':
      return 'export';
    case 'observatory':
      return 'diagnostics';
  }
}

export const useUiStore = create<UiStoreState>((set) => ({
  currentSpace: 'archive',
  currentTab: 'archive',
  notifications: [],
  setCurrentSpace: (currentSpace) => set({
    currentSpace,
    currentTab: getDefaultTabForSpace(currentSpace)
  }),
  setCurrentTab: (currentTab) => set({
    currentTab,
    currentSpace: getStudioSpaceForTab(currentTab)
  }),
  setWorkspaceSurface: (currentSpace, currentTab) => set({ currentSpace, currentTab }),
  selectTask: (selectedTaskId) => set({ selectedTaskId }),
  selectAsset: (selectedAssetId) => set({ selectedAssetId }),
  selectCut: (selectedCutId) => set({ selectedCutId }),
  selectVariant: (selectedVariantId) => set({ selectedVariantId }),
  selectFilter: (selectedFilterId) => set({ selectedFilterId }),
  setPreviewPath: (previewPath) => set({ previewPath }),
  addNotification: (message, tone = 'info', ttlMs = 2600) => {
    const id = `notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({
      notifications: [...state.notifications, { id, message, tone }].slice(-4)
    }));
    window.setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((notification) => notification.id !== id)
      }));
    }, ttlMs);
    return id;
  },
  removeNotification: (notificationId) => set((state) => ({
    notifications: state.notifications.filter((notification) => notification.id !== notificationId)
  }))
}));
