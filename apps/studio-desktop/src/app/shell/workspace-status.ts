import type { StudioTab } from '../../stores/ui-store';
import type { TabStatusTone, WorkflowMetrics } from './types';

export function getSurfaceStatus(tabId: StudioTab, metrics: WorkflowMetrics): { tone: TabStatusTone; label: string } {
  switch (tabId) {
    case 'archive':
      return metrics.assetCount > 0 ? { tone: 'ready', label: 'memory index' } : { tone: 'attention', label: 'save or import' };
    case 'project':
      return metrics.assetCount > 0 ? { tone: 'ready', label: 'active project' } : { tone: 'attention', label: 'save early' };
    case 'media':
      if (metrics.sourceAssetCount === 0) {
        return { tone: 'attention', label: 'needs imports' };
      }
      return metrics.pendingAnalysisCount > 0
        ? { tone: 'attention', label: `${metrics.pendingAnalysisCount} pending` }
        : { tone: 'ready', label: 'media ready' };
    case 'catalog':
      return metrics.activeJobCount > 0 ? { tone: 'attention', label: 'jobs active' } : { tone: 'ready', label: 'global roots' };
    case 'cuts':
      if (metrics.cutCount === 0) {
        return { tone: 'blocked', label: 'no candidates' };
      }
      return metrics.keptCutCount > 0 ? { tone: 'ready', label: `${metrics.keptCutCount} approved` } : { tone: 'attention', label: 'needs review' };
    case 'world':
      if (metrics.sequenceClipCount === 0) {
        return { tone: 'attention', label: 'needs sequence' };
      }
      return metrics.warningCount > 0 || metrics.missingMediaCount > 0
        ? { tone: 'attention', label: 'composition warnings' }
        : { tone: 'ready', label: 'composition ready' };
    case 'sequence':
      if (metrics.sequenceClipCount === 0) {
        return metrics.keptCutCount > 0 ? { tone: 'attention', label: 'build sequence' } : { tone: 'blocked', label: 'needs cuts' };
      }
      return { tone: 'ready', label: `${metrics.sequenceClipCount} clips` };
    case 'performance':
      if (metrics.sequenceClipCount === 0) {
        return { tone: 'blocked', label: 'needs sequence' };
      }
      return metrics.activeJobCount > 0 ? { tone: 'attention', label: 'building preview' } : { tone: 'ready', label: 'rehearsal ready' };
    case 'music':
      return metrics.audioAssetCount > 0 ? { tone: 'ready', label: 'soundtrack ready' } : { tone: 'attention', label: 'optional input' };
    case 'style':
      if (metrics.sequenceClipCount === 0) {
        return { tone: 'blocked', label: 'needs sequence' };
      }
      return metrics.filterCount > 0 ? { tone: 'ready', label: `${metrics.filterCount} filters` } : { tone: 'attention', label: 'needs look pass' };
    case 'automation':
      if (metrics.filterCount === 0) {
        return { tone: 'blocked', label: 'needs filters' };
      }
      return metrics.automationLaneCount > 0 ? { tone: 'ready', label: `${metrics.automationLaneCount} lanes` } : { tone: 'attention', label: 'static look' };
    case 'forge':
    case 'export':
      if (metrics.sequenceClipCount === 0) {
        return { tone: 'blocked', label: 'needs sequence' };
      }
      return metrics.enabledExportProfileCount > 0
        ? { tone: 'ready', label: `${metrics.enabledExportProfileCount} profiles` }
        : { tone: 'attention', label: 'choose formats' };
    case 'observatory':
    case 'diagnostics':
      return metrics.warningCount > 0 || metrics.missingMediaCount > 0
        ? { tone: 'attention', label: 'needs attention' }
        : { tone: 'ready', label: 'world trusted' };
    default:
      return { tone: 'blocked', label: 'unknown' };
  }
}

export function getSurfaceBadge(tabId: StudioTab, metrics: WorkflowMetrics): string | undefined {
  switch (tabId) {
    case 'archive':
      return metrics.assetCount > 0 ? String(metrics.assetCount) : undefined;
    case 'media':
      return metrics.pendingAnalysisCount > 0 ? `${metrics.pendingAnalysisCount}` : metrics.assetCount > 0 ? String(metrics.assetCount) : undefined;
    case 'cuts':
      return metrics.cutCount > 0 ? `${metrics.cutCount}` : undefined;
    case 'world':
      return metrics.sequenceClipCount > 0 ? `${metrics.sequenceClipCount}` : undefined;
    case 'sequence':
      return metrics.sequenceClipCount > 0 ? `${metrics.sequenceClipCount}` : undefined;
    case 'performance':
      return metrics.sequenceClipCount > 0 ? `${metrics.sequenceClipCount}` : undefined;
    case 'music':
      return metrics.audioAssetCount > 0 ? `${metrics.audioAssetCount}` : undefined;
    case 'style':
      return metrics.filterCount > 0 ? `${metrics.filterCount}` : undefined;
    case 'automation':
      return metrics.automationLaneCount > 0 ? `${metrics.automationLaneCount}` : undefined;
    case 'forge':
    case 'export':
      return metrics.enabledExportProfileCount > 0 ? `${metrics.enabledExportProfileCount}` : undefined;
    case 'observatory':
    case 'diagnostics':
      return metrics.warningCount > 0 || metrics.missingMediaCount > 0 ? `${metrics.warningCount + metrics.missingMediaCount}` : undefined;
    default:
      return undefined;
  }
}
