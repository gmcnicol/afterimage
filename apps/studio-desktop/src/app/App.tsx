import { useMemo, useState } from 'react';
import { Screen } from '@afterimage/ui';
import { getDesktopApi } from '../lib/desktop-api';
import { useDiagnosticsStore } from '../stores/diagnostics-store';
import { useJobsStore } from '../stores/jobs-store';
import { useProjectSessionStore } from '../stores/project-session-store';
import { type StudioTab, useUiStore } from '../stores/ui-store';
import { ToolbarButton } from './components/ToolbarButton';
import { JobRow } from './components/JobRow';
import { useDesktopBootstrap } from './hooks/useDesktopBootstrap';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useProjectAutosave } from './hooks/useProjectAutosave';
import { accent, muted, pillStyle } from './styles';
import { resolveProjectFilePath } from './utils';
import { ActiveView } from './views';

const shellCss = `
  .studio-shell {
    min-height: calc(100vh - 48px);
    height: calc(100vh - 48px);
    color: #f6f7f9;
    font-family: "IBM Plex Sans", "Aptos", "Segoe UI Variable Text", sans-serif;
    background:
      radial-gradient(circle at top left, rgba(112, 131, 160, 0.2), transparent 24%),
      radial-gradient(circle at top right, rgba(133, 117, 176, 0.12), transparent 18%),
      radial-gradient(circle at bottom right, rgba(105, 156, 138, 0.12), transparent 24%),
      linear-gradient(180deg, #090b10 0%, #0c0f14 48%, #0a0d12 100%);
  }

  .studio-shell__frame {
    display: grid;
    grid-template-columns: 320px minmax(0, 1fr);
    gap: 16px;
    align-items: stretch;
    height: 100%;
    overflow: hidden;
  }

  .studio-shell__sidebar {
    display: grid;
    gap: 12px;
    min-height: 0;
    overflow: hidden;
  }

  .studio-shell__main {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 12px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .studio-scrollable {
    overflow: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .studio-scrollable::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .studio-surface {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 24px;
    background: linear-gradient(180deg, rgba(19, 23, 31, 0.94), rgba(12, 15, 21, 0.94));
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(18px);
  }

  .studio-shell__brand {
    padding: 16px;
    display: grid;
    gap: 10px;
  }

  .studio-shell__eyebrow {
    color: ${accent};
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 11px;
    font-weight: 800;
  }

  .studio-shell__brand h1 {
    margin: 0;
    font-size: 28px;
    line-height: 1.1;
  }

  .studio-shell__brand-copy {
    color: ${muted};
    font-size: 13px;
    line-height: 1.45;
  }

  .studio-shell__project-meta {
    display: grid;
    gap: 8px;
  }

  .studio-shell__project-title {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.2;
  }

  .studio-shell__path {
    color: ${muted};
    font-size: 12px;
    line-height: 1.4;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .studio-shell__meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .studio-shell__meta-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .studio-shell__meta-tile {
    border-radius: 18px;
    padding: 12px 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .studio-shell__meta-tile strong {
    display: block;
    font-size: 18px;
    margin-top: 4px;
  }

  .studio-shell__meta-label {
    color: ${muted};
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .studio-nav {
    padding: 14px;
    display: grid;
    gap: 12px;
  }

  .studio-nav__group {
    display: grid;
    gap: 8px;
  }

  .studio-nav__group-label {
    color: rgba(245, 246, 248, 0.64);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-weight: 800;
    padding: 0 6px;
  }

  .studio-nav__item {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
    color: inherit;
    border-radius: 18px;
    padding: 10px 12px;
    text-align: left;
    display: grid;
    gap: 8px;
    cursor: pointer;
    transition: border-color 120ms ease, transform 120ms ease, background 120ms ease;
  }

  .studio-nav__item:hover {
    transform: translateY(-1px);
    border-color: rgba(136, 160, 191, 0.28);
  }

  .studio-nav__item.is-current {
    border-color: rgba(136, 160, 191, 0.46);
    background: linear-gradient(135deg, rgba(114, 133, 166, 0.24), rgba(255, 255, 255, 0.04));
    box-shadow: 0 0 0 1px rgba(136, 160, 191, 0.2) inset;
  }

  .studio-nav__topline {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
  }

  .studio-nav__title {
    display: flex;
    gap: 10px;
    align-items: center;
    font-weight: 700;
  }

  .studio-nav__dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    flex: 0 0 auto;
  }

  .studio-nav__dot.tone-ready {
    background: #7bb99d;
    box-shadow: 0 0 0 4px rgba(123, 185, 157, 0.14);
  }

  .studio-nav__dot.tone-attention {
    background: #b39ad7;
    box-shadow: 0 0 0 4px rgba(179, 154, 215, 0.14);
  }

  .studio-nav__dot.tone-blocked {
    background: rgba(255, 255, 255, 0.28);
    box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.08);
  }

  .studio-nav__badge {
    border-radius: 999px;
    padding: 4px 9px;
    font-size: 11px;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(245, 246, 248, 0.9);
  }

  .studio-nav__description {
    color: ${muted};
    font-size: 12px;
    line-height: 1.35;
  }

  .studio-nav__status {
    justify-self: start;
    border-radius: 999px;
    padding: 4px 9px;
    font-size: 11px;
    font-weight: 700;
  }

  .studio-nav__status.tone-ready {
    background: rgba(103, 177, 145, 0.18);
    color: #a4dfc4;
  }

  .studio-nav__status.tone-attention {
    background: rgba(166, 144, 210, 0.18);
    color: #ccbdf0;
  }

  .studio-nav__status.tone-blocked {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(245, 246, 248, 0.72);
  }

  .studio-hero {
    padding: 12px 16px;
    display: grid;
    gap: 8px;
  }

  .studio-hero__layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
  }

  .studio-hero__headline {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .studio-hero__headline h2 {
    margin: 0;
    font-size: 24px;
    line-height: 1.08;
  }

  .studio-hero__headline p {
    margin: 0;
    color: ${muted};
    font-size: 13px;
    line-height: 1.4;
  }

  .studio-hero__context {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .studio-hero__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 10px;
  }

  .studio-hero__next-step {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 999px;
    background: rgba(114, 133, 166, 0.16);
    border: 1px solid rgba(136, 160, 191, 0.16);
    color: ${muted};
    font-size: 12px;
    line-height: 1.35;
  }

  .studio-hero__next-step strong {
    color: #f6f7f9;
    font-size: 12px;
  }

  .studio-hero__button-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .studio-jobs {
    padding: 12px 16px;
    display: grid;
    gap: 12px;
  }

  .studio-jobs__header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .studio-main-surface {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .studio-notifications {
    position: fixed;
    top: 24px;
    right: 24px;
    display: grid;
    gap: 10px;
    z-index: 30;
    width: min(360px, calc(100vw - 32px));
  }

  .studio-notification {
    text-align: left;
    border-radius: 16px;
    padding: 12px 16px;
    color: #f6f7f9;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .studio-notification.tone-success {
    border-color: rgba(123, 185, 157, 0.35);
    background: linear-gradient(135deg, rgba(65, 108, 95, 0.32), rgba(255, 255, 255, 0.03));
  }

  .studio-notification.tone-warn {
    border-color: rgba(166, 144, 210, 0.35);
    background: linear-gradient(135deg, rgba(97, 85, 130, 0.26), rgba(255, 255, 255, 0.03));
  }

  .studio-notification.tone-info {
    border-color: rgba(136, 160, 191, 0.35);
    background: linear-gradient(135deg, rgba(86, 109, 140, 0.22), rgba(255, 255, 255, 0.03));
  }

  @media (max-width: 1260px) {
    .studio-shell {
      min-height: auto;
      height: auto;
    }

    .studio-shell__frame {
      grid-template-columns: 1fr;
      height: auto;
      overflow: visible;
    }

    .studio-shell__sidebar {
      overflow: visible;
    }

    .studio-shell__main {
      grid-template-rows: auto auto auto;
      overflow: visible;
    }

    .studio-hero__layout {
      grid-template-columns: 1fr;
      align-items: start;
    }

    .studio-hero__actions {
      justify-content: flex-start;
    }
  }

  @media (max-width: 760px) {
    .studio-hero__headline h2 {
      font-size: 22px;
    }

    .studio-shell__meta-grid {
      grid-template-columns: 1fr;
    }
  }
`;

type TabGroup = 'Set Up' | 'Build' | 'Deliver';
type TabStatusTone = 'ready' | 'attention' | 'blocked';

interface WorkflowMetrics {
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

interface NextStep {
  tab: StudioTab;
  label: string;
  reason: string;
}

interface TabMeta {
  id: StudioTab;
  label: string;
  group: TabGroup;
  description: string;
  guidance: string;
}

const tabMeta: TabMeta[] = [
  {
    id: 'project',
    label: 'Project',
    group: 'Set Up',
    description: 'Create, save, duplicate, and re-open desktop projects.',
    guidance: 'Keep the project saved early so imports and generated results have a stable home.'
  },
  {
    id: 'media',
    label: 'Media',
    group: 'Set Up',
    description: 'Import source footage, music, masks, and overlays.',
    guidance: 'Bring in the source material first, then move on once the library looks complete.'
  },
  {
    id: 'analysis',
    label: 'Analysis',
    group: 'Set Up',
    description: 'Queue scene, sync, and sidecar analysis for imported assets.',
    guidance: 'Run analysis before reviewing cuts so thumbnails, timing, and event tracks are trustworthy.'
  },
  {
    id: 'cuts',
    label: 'Cuts',
    group: 'Build',
    description: 'Review cut candidates, keep what works, and send the rest away.',
    guidance: 'This is the main review queue. Keep or reject decisively and add strong material to the sequence.'
  },
  {
    id: 'sequence',
    label: 'Sequence',
    group: 'Build',
    description: 'Assemble the sequence, transitions, overlays, markers, and preview renders.',
    guidance: 'Once you have approved material, shape the edit and use preview renders to confirm pacing.'
  },
  {
    id: 'music',
    label: 'Music',
    group: 'Build',
    description: 'Align a music track and import timing markers into the sequence.',
    guidance: 'Use this when rhythm matters. If there is no soundtrack yet, this stage can wait.'
  },
  {
    id: 'style',
    label: 'Style',
    group: 'Build',
    description: 'Tune the filter stack, presets, and authored looks.',
    guidance: 'Treat style as a finishing pass after the sequence is structurally sound.'
  },
  {
    id: 'automation',
    label: 'Automation',
    group: 'Build',
    description: 'Author motion lanes and keyframes for filter parameters.',
    guidance: 'Automation only pays off once the sequence and style stack are stable.'
  },
  {
    id: 'export',
    label: 'Export',
    group: 'Deliver',
    description: 'Pick delivery profiles and render the chosen sequence.',
    guidance: 'Enable the exact formats you need, then watch the render queue for failures.'
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    group: 'Deliver',
    description: 'Inspect toolchain health, missing media, job history, and logs.',
    guidance: 'Use this to resolve missing inputs or toolchain problems before wasting render time.'
  }
];

function useWorkflowMetrics(): WorkflowMetrics {
  const project = useProjectSessionStore((state) => state.project);
  const jobs = useJobsStore((state) => state.jobs);
  const report = useDiagnosticsStore((state) => state.report);

  const sourceAssetCount = project.assets.filter((asset) => asset.assetRole !== 'transition-mask' && asset.assetRole !== 'transition-overlay').length;
  const audioAssetCount = project.assets.filter((asset) => asset.mediaType === 'audio').length;
  const analyzableAssetCount = project.assets.filter((asset) => asset.mediaType !== 'image').length;
  const analyzedAssetCount = project.assets.filter((asset) => asset.mediaType !== 'image' && asset.analysisStatus === 'completed').length;
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
    cutCount: project.cutCandidates.length,
    keptCutCount: project.cutCandidates.filter((cut) => cut.status === 'kept' || cut.favorite).length,
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

function getTabStatus(tabId: StudioTab, metrics: WorkflowMetrics): { tone: TabStatusTone; label: string } {
  switch (tabId) {
    case 'project':
      return metrics.assetCount > 0 ? { tone: 'ready', label: 'active project' } : { tone: 'attention', label: 'save early' };
    case 'media':
      return metrics.sourceAssetCount > 0 ? { tone: 'ready', label: 'library loaded' } : { tone: 'attention', label: 'needs imports' };
    case 'analysis':
      if (metrics.analyzableAssetCount === 0) {
        return { tone: 'blocked', label: 'nothing queued' };
      }
      return metrics.pendingAnalysisCount === 0
        ? { tone: 'ready', label: 'analysis complete' }
        : { tone: 'attention', label: `${metrics.pendingAnalysisCount} pending` };
    case 'cuts':
      if (metrics.cutCount === 0) {
        return { tone: 'blocked', label: 'no candidates' };
      }
      return metrics.keptCutCount > 0 ? { tone: 'ready', label: `${metrics.keptCutCount} approved` } : { tone: 'attention', label: 'needs review' };
    case 'sequence':
      if (metrics.sequenceClipCount === 0) {
        return metrics.keptCutCount > 0 ? { tone: 'attention', label: 'build sequence' } : { tone: 'blocked', label: 'needs cuts' };
      }
      return { tone: 'ready', label: `${metrics.sequenceClipCount} clips` };
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
    case 'export':
      if (metrics.sequenceClipCount === 0) {
        return { tone: 'blocked', label: 'needs sequence' };
      }
      return metrics.enabledExportProfileCount > 0
        ? { tone: 'ready', label: `${metrics.enabledExportProfileCount} profiles` }
        : { tone: 'attention', label: 'choose formats' };
    case 'diagnostics':
      return metrics.warningCount > 0 || metrics.missingMediaCount > 0
        ? { tone: 'attention', label: 'needs attention' }
        : { tone: 'ready', label: 'healthy' };
    default:
      return { tone: 'blocked', label: 'unknown' };
  }
}

function getTabBadge(tabId: StudioTab, metrics: WorkflowMetrics): string | undefined {
  switch (tabId) {
    case 'media':
      return metrics.assetCount > 0 ? String(metrics.assetCount) : undefined;
    case 'analysis':
      return metrics.pendingAnalysisCount > 0 ? `${metrics.pendingAnalysisCount}` : metrics.analyzableAssetCount > 0 ? `${metrics.analyzedAssetCount}` : undefined;
    case 'cuts':
      return metrics.cutCount > 0 ? `${metrics.cutCount}` : undefined;
    case 'sequence':
      return metrics.sequenceClipCount > 0 ? `${metrics.sequenceClipCount}` : undefined;
    case 'music':
      return metrics.audioAssetCount > 0 ? `${metrics.audioAssetCount}` : undefined;
    case 'style':
      return metrics.filterCount > 0 ? `${metrics.filterCount}` : undefined;
    case 'automation':
      return metrics.automationLaneCount > 0 ? `${metrics.automationLaneCount}` : undefined;
    case 'export':
      return metrics.enabledExportProfileCount > 0 ? `${metrics.enabledExportProfileCount}` : undefined;
    case 'diagnostics':
      return metrics.warningCount > 0 || metrics.missingMediaCount > 0 ? `${metrics.warningCount + metrics.missingMediaCount}` : undefined;
    default:
      return undefined;
  }
}

function getNextStep(metrics: WorkflowMetrics, projectSaved: boolean): NextStep {
  if (!projectSaved) {
    return {
      tab: 'project',
      label: 'Save the project shell',
      reason: 'A saved project root keeps imports, generated previews, and exports in one place.'
    };
  }

  if (metrics.sourceAssetCount === 0) {
    return {
      tab: 'media',
      label: 'Import source footage',
      reason: 'The rest of the workflow is blocked until the library has actual material to work from.'
    };
  }

  if (metrics.pendingAnalysisCount > 0) {
    return {
      tab: 'analysis',
      label: 'Run or finish analysis',
      reason: 'Cut review and music sync are much clearer once analysis has generated events and summaries.'
    };
  }

  if (metrics.cutCount === 0 || metrics.keptCutCount === 0) {
    return {
      tab: 'cuts',
      label: 'Review and approve cuts',
      reason: 'You need a pool of approved material before the sequence builder becomes useful.'
    };
  }

  if (metrics.sequenceClipCount === 0) {
    return {
      tab: 'sequence',
      label: 'Build the first sequence',
      reason: 'Sequence work is the point where reviewed cuts turn into an edit you can audition.'
    };
  }

  if (metrics.enabledExportProfileCount === 0) {
    return {
      tab: 'export',
      label: 'Choose delivery formats',
      reason: 'Render targets are still undefined, so the workstation cannot produce a final output yet.'
    };
  }

  return {
    tab: 'export',
    label: 'Render the current sequence',
    reason: 'The project is in a deliverable state. Watch the queue and verify output before closing it out.'
  };
}

function NotificationCenter() {
  const notifications = useUiStore((state) => state.notifications);
  const removeNotification = useUiStore((state) => state.removeNotification);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="studio-notifications">
      {notifications.map((notification) => (
        <button
          key={notification.id}
          type="button"
          className={`studio-notification tone-${notification.tone}`}
          onClick={() => removeNotification(notification.id)}
        >
          {notification.message}
        </button>
      ))}
    </div>
  );
}

function Sidebar() {
  const api = getDesktopApi();
  const currentTab = useUiStore((state) => state.currentTab);
  const setCurrentTab = useUiStore((state) => state.setCurrentTab);
  const project = useProjectSessionStore((state) => state.project);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot);
  const projectFilePath = useProjectSessionStore((state) => state.projectFilePath);
  const dirty = useProjectSessionStore((state) => state.dirty);
  const metrics = useWorkflowMetrics();
  const resolvedProjectFilePath = resolveProjectFilePath(projectFilePath, projectRoot, project.metadata.projectFileName);
  const groupedTabs = useMemo(
    () => ({
      'Set Up': tabMeta.filter((tab) => tab.group === 'Set Up'),
      Build: tabMeta.filter((tab) => tab.group === 'Build'),
      Deliver: tabMeta.filter((tab) => tab.group === 'Deliver')
    }),
    []
  );

  return (
    <div className="studio-shell__sidebar studio-scrollable">
      <section className="studio-surface studio-shell__brand">
        <div className="studio-shell__eyebrow">Afterimage Studio Desktop</div>
        <div className="studio-shell__brand-copy">
          Compact desktop pipeline for offline review, sequencing, and export.
        </div>
        <div className="studio-shell__project-meta">
          <div className="studio-shell__project-title">{project.name}</div>
          <div className="studio-shell__path">{resolvedProjectFilePath ?? 'Project file has not been saved yet.'}</div>
          <div className="studio-shell__meta-row">
            <span style={pillStyle(dirty ? 'warn' : 'success')}>{dirty ? 'Unsaved edits' : 'Project saved'}</span>
            {metrics.activeJobCount > 0 ? <span style={pillStyle()}>{metrics.activeJobCount} active jobs</span> : null}
            {metrics.warningCount > 0 || metrics.missingMediaCount > 0 ? (
              <span style={pillStyle('warn')}>{metrics.warningCount + metrics.missingMediaCount} issues</span>
            ) : null}
          </div>
          {resolvedProjectFilePath ? (
            <ToolbarButton onClick={() => void api.project.revealProjectFolder(resolvedProjectFilePath)}>
              Reveal Project Folder
            </ToolbarButton>
          ) : null}
        </div>
      </section>

      <nav className="studio-surface studio-nav" aria-label="Workflow navigation">
        {(Object.entries(groupedTabs) as Array<[TabGroup, TabMeta[]]>).map(([group, tabs]) => (
          <div key={group} className="studio-nav__group">
            <div className="studio-nav__group-label">{group}</div>
            {tabs.map((tab) => {
              const status = getTabStatus(tab.id, metrics);
              const badge = getTabBadge(tab.id, metrics);
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCurrentTab(tab.id)}
                  aria-current={tab.id === currentTab ? 'page' : undefined}
                  className={`studio-nav__item${tab.id === currentTab ? ' is-current' : ''}`}
                >
                  <div className="studio-nav__topline">
                    <div className="studio-nav__title">
                      <span className={`studio-nav__dot tone-${status.tone}`} />
                      <span>{tab.label}</span>
                    </div>
                    {badge ? <span className="studio-nav__badge">{badge}</span> : null}
                  </div>
                  <div className="studio-nav__description">{tab.description}</div>
                  <span className={`studio-nav__status tone-${status.tone}`}>{status.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}

function Header() {
  const api = getDesktopApi();
  const currentTab = useUiStore((state) => state.currentTab);
  const setCurrentTab = useUiStore((state) => state.setCurrentTab);
  const addNotification = useUiStore((state) => state.addNotification);
  const project = useProjectSessionStore((state) => state.project);
  const projectFilePath = useProjectSessionStore((state) => state.projectFilePath);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot);
  const dirty = useProjectSessionStore((state) => state.dirty);
  const setSession = useProjectSessionStore((state) => state.setSession);
  const metrics = useWorkflowMetrics();
  const [savingProject, setSavingProject] = useState(false);
  const currentMeta = tabMeta.find((tab) => tab.id === currentTab) ?? tabMeta[0];
  const projectSaved = Boolean(resolveProjectFilePath(projectFilePath, projectRoot, project.metadata.projectFileName));
  const nextStep = getNextStep(metrics, projectSaved);

  const saveProject = async () => {
    if (savingProject) {
      return;
    }

    setSavingProject(true);
    try {
      const resolvedProjectFilePath = resolveProjectFilePath(projectFilePath, projectRoot, project.metadata.projectFileName);
      const session = await api.project.saveProject({ project, projectFilePath: resolvedProjectFilePath });
      setSession(session);
      addNotification('Saved project.', 'success', 1800);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes('cancelled')) {
        addNotification(`Save failed: ${message}`, 'warn', 3600);
      }
    } finally {
      setSavingProject(false);
    }
  };

  return (
    <section className="studio-surface studio-hero">
      <div className="studio-hero__layout">
        <div className="studio-hero__headline">
          <div className="studio-shell__eyebrow">{currentMeta.group}</div>
          <h2>{currentMeta.label}</h2>
          <p>
            {currentMeta.description} {currentMeta.guidance}
          </p>
          <div className="studio-hero__context">
            <span style={pillStyle(dirty ? 'warn' : 'success')}>{dirty ? 'Unsaved project' : 'Saved project'}</span>
            <span style={pillStyle()}>{project.name}</span>
            <span style={pillStyle()}>{metrics.variantCount} variants</span>
            <span style={pillStyle()}>{metrics.activeJobCount} active jobs</span>
            {metrics.warningCount > 0 || metrics.missingMediaCount > 0 ? (
              <span style={pillStyle('warn')}>{metrics.warningCount + metrics.missingMediaCount} diagnostics alerts</span>
            ) : (
              <span style={pillStyle('success')}>Diagnostics clean</span>
            )}
          </div>
        </div>

        <div className="studio-hero__actions">
          <div className="studio-hero__next-step">
            <span>Next</span>
            <strong>{nextStep.label}</strong>
          </div>
          <div className="studio-hero__button-row">
            <ToolbarButton primary onClick={() => setCurrentTab(nextStep.tab)} disabled={currentTab === nextStep.tab}>
              {currentTab === nextStep.tab ? 'On Recommended Step' : `Go to ${tabMeta.find((tab) => tab.id === nextStep.tab)?.label ?? nextStep.tab}`}
            </ToolbarButton>
            <ToolbarButton onClick={() => void saveProject()} disabled={savingProject}>
              {savingProject ? 'Saving…' : 'Save Project'}
            </ToolbarButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function ActiveJobsPanel() {
  const jobs = useJobsStore((state) => state.jobs);
  const activeJobs = jobs.filter((job) => job.status === 'queued' || job.status === 'running');

  if (activeJobs.length === 0) {
    return null;
  }

  return (
    <section className="studio-surface studio-jobs">
      <div className="studio-jobs__header">
        <div>
          <div className="studio-shell__eyebrow">Background Work</div>
          <div style={{ color: muted, marginTop: 4 }}>{activeJobs.length} queued or running jobs are shaping the current project state.</div>
        </div>
        <span style={pillStyle()}>{activeJobs.map((job) => job.type).join(' • ')}</span>
      </div>
      <div className="studio-scrollable" style={{ display: 'grid', gap: 10, maxHeight: 180 }}>
        {activeJobs.map((job) => (
          <JobRow key={job.id} job={job} />
        ))}
      </div>
    </section>
  );
}

export function App() {
  useDesktopBootstrap();
  useProjectAutosave();
  useKeyboardShortcuts();

  return (
    <Screen>
      <style>{shellCss}</style>
      <div className="studio-shell">
        <NotificationCenter />
        <div className="studio-shell__frame">
          <Sidebar />
          <main className="studio-shell__main">
            <Header />
            <ActiveJobsPanel />
            <div className="studio-main-surface">
              <ActiveView />
            </div>
          </main>
        </div>
      </div>
    </Screen>
  );
}
