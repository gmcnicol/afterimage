import { create } from 'zustand';

export type StudioTab =
  | 'project'
  | 'media'
  | 'cuts'
  | 'sequence'
  | 'music'
  | 'style'
  | 'automation'
  | 'export'
  | 'diagnostics';

export interface UiNotification {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'warn';
}

interface UiStoreState {
  currentTab: StudioTab;
  selectedAssetId?: string;
  selectedCutId?: string;
  selectedVariantId?: string;
  selectedFilterId?: string;
  previewPath?: string;
  notifications: UiNotification[];
  setCurrentTab: (tab: StudioTab) => void;
  selectAsset: (assetId?: string) => void;
  selectCut: (cutId?: string) => void;
  selectVariant: (variantId?: string) => void;
  selectFilter: (filterId?: string) => void;
  setPreviewPath: (path?: string) => void;
  addNotification: (message: string, tone?: UiNotification['tone'], ttlMs?: number) => string;
  removeNotification: (notificationId: string) => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  currentTab: 'project',
  notifications: [],
  setCurrentTab: (currentTab) => set({ currentTab }),
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
