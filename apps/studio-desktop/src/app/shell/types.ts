import type { DesktopJob } from '../../lib/studio-client';
import type { StudioSpace, StudioTab } from '../../stores/ui-store';

export type TabStatusTone = 'ready' | 'attention' | 'blocked';

export interface WorkflowMetrics {
  assetCount: number;
  sourceAssetCount: number;
  audioAssetCount: number;
  analyzableAssetCount: number;
  analyzedAssetCount: number;
  pendingAnalysisCount: number;
  cutCount: number;
  keptCutCount: number;
  sequenceClipCount: number;
  variantCount: number;
  filterCount: number;
  automationLaneCount: number;
  enabledExportProfileCount: number;
  activeJobCount: number;
  warningCount: number;
  missingMediaCount: number;
}

export interface StudioWorkspaceSurface {
  id: StudioTab;
  label: string;
  description: string;
}

export interface StudioWorkspaceAction {
  label: string;
  targetTab: StudioTab;
}

export interface StudioWorkspaceTaskRoute {
  tab: StudioTab;
}

export interface StudioWorkspaceDefinition {
  id: StudioSpace;
  label: string;
  defaultTab: StudioTab;
  surfaces: StudioTab[];
  primaryAction: StudioWorkspaceAction;
  taskRoutes?: Partial<Record<DesktopJob['type'], StudioWorkspaceTaskRoute>>;
}
