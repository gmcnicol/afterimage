import { useDiagnosticsStore } from '../../stores/diagnostics-store';
import { useJobsStore } from '../../stores/jobs-store';
import { useProjectSessionStore } from '../../stores/project-session-store';
import type { WorkflowMetrics } from './types';

export function useWorkflowMetrics(): WorkflowMetrics {
  const project = useProjectSessionStore((state) => state.project);
  const jobs = useJobsStore((state) => state.jobs);
  const report = useDiagnosticsStore((state) => state.report);

  const sourceAssetCount = project.assets.filter((asset) => asset.assetRole !== 'transition-mask' && asset.assetRole !== 'transition-overlay').length;
  const audioAssetCount = project.assets.filter((asset) => asset.mediaType === 'audio').length;
  const analyzableAssetCount = project.assets.filter((asset) => asset.mediaType !== 'image').length;
  const analyzedAssetCount = project.assets.filter((asset) => asset.mediaType !== 'image' && asset.analysisStatus === 'completed').length;
  const assetRoleById = new Map(project.assets.map((asset) => [asset.id, asset.assetRole]));
  const reviewCutCount = project.cutCandidates.filter((cut) => {
    const role = assetRoleById.get(cut.assetId);
    return role !== undefined && role !== 'transition-mask' && role !== 'transition-overlay';
  }).length;
  const keptReviewCutCount = project.cutCandidates.filter((cut) => {
    const role = assetRoleById.get(cut.assetId);
    return role !== undefined && role !== 'transition-mask' && role !== 'transition-overlay' && (cut.status === 'kept' || cut.favorite);
  }).length;
  const sequenceClipCount = project.variants.reduce((largest, variant) => Math.max(largest, variant.clips.length), 0);
  const filterCount = project.filterStacks.reduce((count, stack) => count + stack.filters.length, 0);
  const enabledExportProfileCount = project.exportSelections.filter((selection) => selection.enabled).length;
  const activeJobCount = jobs.filter((job) => job.status === 'queued' || job.status === 'running').length;

  return {
    assetCount: project.assets.length,
    sourceAssetCount,
    audioAssetCount,
    analyzableAssetCount,
    analyzedAssetCount,
    pendingAnalysisCount: Math.max(analyzableAssetCount - analyzedAssetCount, 0),
    cutCount: reviewCutCount,
    keptCutCount: keptReviewCutCount,
    sequenceClipCount,
    variantCount: project.variants.length,
    filterCount,
    automationLaneCount: project.automationLanes.length,
    enabledExportProfileCount,
    activeJobCount,
    warningCount: report?.warnings.length ?? 0,
    missingMediaCount: report?.missingMedia.length ?? 0
  };
}
