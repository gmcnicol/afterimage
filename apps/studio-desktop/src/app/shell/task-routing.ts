import type { DesktopJob } from '../../lib/studio-client';
import type { StudioSpace, StudioTab } from '../../stores/ui-store';
import { findTaskWorkspace, getWorkspaceDefinition } from './registry';

export interface StudioTaskRoute {
  space: StudioSpace;
  tab: StudioTab;
}

export function getJobRoute(job: DesktopJob): StudioTaskRoute {
  const routed = findTaskWorkspace(job);

  if (routed) {
    return {
      space: routed.workspace.id,
      tab: routed.tab
    };
  }

  const workspace = getWorkspaceDefinition('archive');
  return {
    space: workspace.id,
    tab: 'archive'
  };
}

export function getJobOwningSpace(job: DesktopJob): StudioSpace {
  return getJobRoute(job).space;
}

export function getJobOwningTab(job: DesktopJob): StudioTab {
  return getJobRoute(job).tab;
}

export function sortJobsByRelevance(jobs: DesktopJob[]): DesktopJob[] {
  const rank = (job: DesktopJob) => {
    if (job.status === 'running') return 0;
    if (job.status === 'queued') return 1;
    if (job.status === 'failed') return 2;
    if (job.status === 'cancelled') return 3;
    return 4;
  };
  const time = (job: DesktopJob) => Date.parse(job.endedAt ?? job.startedAt ?? '') || 0;
  return [...jobs].sort((left, right) => rank(left) - rank(right) || time(right) - time(left) || left.id.localeCompare(right.id));
}

export function getJobProgress(job: DesktopJob): number | undefined {
  return typeof job.progress === 'number'
    ? Math.max(0, Math.min(100, Math.round(job.progress * 100)))
    : undefined;
}
