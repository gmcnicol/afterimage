import { useMemo, useState } from 'react';
import { Screen } from '@afterimage/ui';
import { getStudioClient } from '../lib/studio-client';
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
    min-height: 100%;
    height: 100%;
    color: #f6f7f9;
    font-family: "IBM Plex Sans", "Aptos", "Segoe UI Variable Text", sans-serif;
    font-size: 12px;
    line-height: 1.2;
    background:
      radial-gradient(circle at top left, rgba(112, 131, 160, 0.2), transparent 24%),
      radial-gradient(circle at top right, rgba(133, 117, 176, 0.12), transparent 18%),
      radial-gradient(circle at bottom right, rgba(105, 156, 138, 0.12), transparent 24%),
      linear-gradient(180deg, #090b10 0%, #0c0f14 48%, #0a0d12 100%);
  }

  .studio-shell *,
  .studio-shell *::before,
  .studio-shell *::after {
    box-sizing: border-box;
    border-radius: 0 !important;
    box-shadow: none !important;
  }

  .studio-shell strong {
    font-weight: 400 !important;
  }

  .studio-shell .studio-emphasis {
    font-weight: 500 !important;
  }

  .studio-shell h1,
  .studio-shell h2,
  .studio-shell__project-title {
    font-weight: 500 !important;
  }

  .studio-shell__frame {
    display: grid;
    grid-template-columns: 332px minmax(0, 1fr);
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
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 12px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .studio-scrollable {
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(143, 161, 192, 0.58) rgba(255, 255, 255, 0.04);
  }

  .studio-scrollable::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  .studio-scrollable::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.04);
    border-radius: 999px;
  }

  .studio-scrollable::-webkit-scrollbar-thumb {
    background: rgba(143, 161, 192, 0.58);
    border: 2px solid rgba(12, 15, 21, 0.95);
    border-radius: 999px;
  }

  .studio-scrollable::-webkit-scrollbar-corner {
    background: transparent;
  }

  .studio-surface {
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(180deg, rgba(19, 23, 31, 0.94), rgba(12, 15, 21, 0.94));
    backdrop-filter: blur(18px);
  }

  .studio-shell__brand {
    padding: 18px;
    display: grid;
    gap: 10px;
  }

  .studio-shell__eyebrow {
    color: ${accent};
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 11px;
    font-weight: 600;
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
    padding: 12px 14px;
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
    border-radius: 6px;
    padding: 4px 9px;
    font-size: 11px;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(245, 246, 248, 0.9);
  }

  .studio-nav__description {
    color: ${muted};
    font-size: 12px;
    line-height: 1.45;
  }

  .studio-nav__status {
    justify-self: start;
    border-radius: 6px;
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
    border-radius: 7px;
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
    min-width: 0;
    padding: 6px 10px;
    display: flex;
    gap: 8px;
    align-items: center;
    min-height: 34px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(9, 11, 16, 0.92);
  }

  .studio-jobs__header {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    min-width: 0;
  }

  .studio-jobs__title {
    color: rgba(245, 246, 248, 0.62);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .studio-jobs__count {
    color: ${muted};
    font-size: 11px;
    font-weight: 800;
    white-space: nowrap;
  }

  .studio-jobs__list {
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
    overflow: auto;
    scrollbar-width: none;
    flex: 1 1 auto;
  }

  .studio-jobs__list::-webkit-scrollbar {
    display: none;
  }

  .studio-main-surface {
    min-width: 0;
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    overflow: hidden;
  }

  .music-sync {
    display: grid;
    grid-template-rows: auto auto 44px minmax(0, 1fr);
    gap: 8px;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .music-sync--empty {
    align-content: start;
  }

  .music-sync__toolbar {
    display: grid;
    grid-template-columns: minmax(260px, 1.6fr) minmax(96px, 0.35fr) minmax(96px, 0.35fr) minmax(110px, 0.4fr) auto;
    gap: 8px;
    align-items: end;
    min-width: 0;
  }

  .music-sync__field {
    display: grid;
    gap: 3px;
    min-width: 0;
    color: ${muted};
  }

  .music-sync__value,
  .music-sync__select {
    height: 28px;
    display: flex;
    align-items: center;
    min-width: 0;
    padding: 0 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(12, 15, 21, 0.98);
    color: #f6f7f9;
  }

  .music-sync__select {
    padding: 0 6px;
  }

  .music-sync__status {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    color: ${muted};
    overflow: hidden;
  }

  .music-sync__pill {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    max-width: 42%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 3px 8px;
    font-size: 10px;
    line-height: 1;
  }

  .music-sync__pill--success {
    background: rgba(103, 177, 145, 0.18);
    color: #9fe1c1;
  }

  .music-sync__pill--warn {
    background: rgba(166, 144, 210, 0.18);
    color: #ccbdf0;
  }

  .music-sync__status-text,
  .music-sync__muted {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: ${muted};
  }

  .music-sync__timeline {
    display: grid;
    grid-template-rows: 24px 14px;
    min-width: 0;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(12, 15, 21, 0.98);
  }

  .music-sync__timeline-track {
    position: relative;
    min-width: 0;
    overflow: hidden;
    background: linear-gradient(90deg, rgba(136, 160, 191, 0.16), rgba(122, 177, 146, 0.12), rgba(176, 151, 215, 0.16));
  }

  .music-sync__cue-mark {
    position: absolute;
    top: 0;
    bottom: 0;
    transform: translateX(-1px);
  }

  .music-sync__cue-mark--change {
    background: #9fe1c1;
  }

  .music-sync__cue-mark--accent {
    background: #b7a1dc;
  }

  .music-sync__cue-mark--boundary {
    background: #8ea4c4;
  }

  .music-sync__timeline-scale {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 8px;
    color: ${muted};
  }

  .music-sync__grids {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  .music-sync__grid-panel {
    display: grid;
    grid-template-rows: 24px minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .music-sync__grid-title {
    display: flex;
    align-items: center;
    color: #f6f7f9;
  }

  .catalog-browser {
    display: grid;
    grid-template-columns: minmax(420px, 0.95fr) minmax(520px, 1.05fr);
    gap: 14px;
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  .catalog-results {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
    min-width: 0;
    min-height: 0;
  }

  .catalog-inspector {
    min-width: 0;
    min-height: 0;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 12px;
    background: rgba(8, 10, 14, 0.42);
    overflow: hidden;
  }

  .catalog-inspector__content {
    display: grid;
    grid-template-rows: minmax(190px, 0.36fr) auto minmax(300px, 0.64fr);
    gap: 12px;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .catalog-preview {
    min-width: 0;
    min-height: 0;
  }

  .catalog-asset-summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
    gap: 12px;
    align-items: center;
    min-width: 0;
  }

  .catalog-scenes {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .catalog-cut-checkbox {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: #9fe1c1;
    cursor: pointer;
  }

  .job-row {
    min-width: 0;
    max-width: 440px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
    color: #f6f7f9;
  }

  .job-row__main {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .job-row__topline {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .job-row__type {
    color: #f6f7f9;
    font-size: 11px;
    font-weight: 800;
    white-space: nowrap;
  }

  .job-row__target {
    color: ${muted};
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 260px;
  }

  .job-row__status {
    color: ${muted};
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .job-row__status.status-running {
    color: #9fe1c1;
  }

  .job-row__status.status-failed,
  .job-row__status.status-cancelled {
    color: #ccbdf0;
  }

  .job-row__progress {
    width: 46px;
    height: 3px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .job-row__progress-bar {
    height: 100%;
    border-radius: inherit;
    background: #9fe1c1;
  }

  .job-row__actions {
    display: flex;
    gap: 4px;
    align-items: center;
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
    border-radius: 10px;
    padding: 10px 12px;
    color: #f8fafc;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.35;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.34);
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: #111827;
  }

  .studio-notification.tone-success {
    border-color: #16a34a;
    background: #052e1b;
    color: #dcfce7;
  }

  .studio-notification.tone-warn {
    border-color: #f97316;
    background: #431407;
    color: #ffedd5;
  }

  .studio-notification.tone-info {
    border-color: #60a5fa;
    background: #0f172a;
    color: #dbeafe;
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

    .catalog-browser {
      grid-template-columns: 1fr;
      min-height: 900px;
      overflow: visible;
    }

    .catalog-results {
      min-height: 360px;
    }

    .catalog-inspector {
      min-height: 620px;
    }
  }

  @media (max-width: 760px) {
    .studio-hero__headline h2 {
      font-size: 22px;
    }

    .studio-shell__meta-grid {
      grid-template-columns: 1fr;
    }

    .catalog-asset-summary {
      grid-template-columns: 1fr;
    }

    .catalog-inspector__content {
      grid-template-rows: minmax(200px, 0.38fr) auto minmax(300px, 0.62fr);
    }
  }
`;

type TabGroup = 'Project' | 'Process' | 'Deliver';
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
  actionLabel?: string;
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
    label: 'View Project Info',
    group: 'Project',
    description: 'Create, save, duplicate, and re-open desktop projects.',
    guidance: 'Keep the project saved early so imports and generated results have a stable home.'
  },
  {
    id: 'media',
    label: 'Select Media',
    group: 'Project',
    description: 'Import project media directly or pull reusable assets from the catalogue.',
    guidance: 'Bring in source material first, run analysis here, then move on once statuses are ready.'
  },
  {
    id: 'catalog',
    label: 'Manage Catalogue',
    group: 'Project',
    description: 'Import reusable footage, transitions, and overlays into the current project.',
    guidance: 'Manage global folders here, then mark the cuts or assets that should come into Media.'
  },
  {
    id: 'music',
    label: 'Set Cue Timing',
    group: 'Process',
    description: 'Review analysed timing cues or load custom cue markers for the project tune.',
    guidance: 'Use this when the sequence should cut to specific musical or authored cue points.'
  },
  {
    id: 'cuts',
    label: 'Review Cuts',
    group: 'Process',
    description: 'Review cut candidates, keep what works, and send the rest away.',
    guidance: 'This is the main review queue. Keep or reject decisively and add strong material to the sequence.'
  },
  {
    id: 'sequence',
    label: 'Build Sequence',
    group: 'Process',
    description: 'Assemble the sequence, transitions, overlays, markers, and preview renders.',
    guidance: 'Once you have approved material, shape the edit and use preview renders to confirm pacing.'
  },
  {
    id: 'style',
    label: 'Tune Style',
    group: 'Process',
    description: 'Tune the filter stack, presets, and authored looks.',
    guidance: 'Treat style as a finishing pass after the sequence is structurally sound.'
  },
  {
    id: 'automation',
    label: 'Set Automation',
    group: 'Process',
    description: 'Author motion lanes and keyframes for filter parameters.',
    guidance: 'Automation only pays off once the sequence and style stack are stable.'
  },
  {
    id: 'export',
    label: 'Export Deliverables',
    group: 'Deliver',
    description: 'Pick delivery profiles and export the chosen sequence.',
    guidance: 'Enable the exact formats you need, then watch the export queue for failures.'
  },
  {
    id: 'diagnostics',
    label: 'View Diagnostics',
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

function getTabStatus(tabId: StudioTab, metrics: WorkflowMetrics): { tone: TabStatusTone; label: string } {
  switch (tabId) {
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
      return metrics.pendingAnalysisCount > 0 ? `${metrics.pendingAnalysisCount}` : metrics.assetCount > 0 ? String(metrics.assetCount) : undefined;
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
      label: 'Open Media',
      reason: 'The rest of the workflow is blocked until the library has actual material to work from.',
      actionLabel: 'Open Media'
    };
  }

  if (metrics.pendingAnalysisCount > 0) {
    return {
      tab: 'media',
      label: 'Open Media',
      reason: 'Run analysis from the Media workspace before moving on to review and sequencing.',
      actionLabel: 'Open Media'
    };
  }

  if (metrics.cutCount === 0 || metrics.keptCutCount === 0) {
    return {
      tab: 'cuts',
      label: 'Review and approve cuts',
      reason: 'You need a pool of approved material before the sequence builder becomes useful.',
      actionLabel: 'Open Cuts'
    };
  }

  if (metrics.sequenceClipCount === 0) {
    return {
      tab: 'sequence',
      label: 'Build the first sequence',
      reason: 'Sequence work is the point where reviewed cuts turn into an edit you can audition.',
      actionLabel: 'Open Sequence'
    };
  }

  if (metrics.enabledExportProfileCount === 0) {
    return {
      tab: 'export',
      label: 'Choose delivery formats',
      reason: 'Export targets are still undefined, so the workstation cannot produce a final output yet.',
      actionLabel: 'Open Export'
    };
  }

  return {
    tab: 'export',
    label: 'Ready to export',
    reason: 'The project is in a deliverable state. Open Export to export the current sequence.',
    actionLabel: 'Open Export'
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
  const api = getStudioClient();
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
      Project: tabMeta.filter((tab) => tab.group === 'Project' && tab.id !== 'catalog'),
      Process: tabMeta.filter((tab) => tab.group === 'Process'),
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
              const isCurrent = tab.id === currentTab || (tab.id === 'media' && currentTab === 'catalog');
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCurrentTab(tab.id)}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`studio-nav__item${isCurrent ? ' is-current' : ''}`}
                >
                  <div className="studio-nav__topline">
                    <div className="studio-nav__title">
                      <span className={`studio-nav__dot tone-${status.tone}`} />
                      <span>{tab.label}</span>
                    </div>
                    {badge ? <span className="studio-nav__badge">{badge}</span> : null}
                  </div>
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
  const api = getStudioClient();
  const currentTab = useUiStore((state) => state.currentTab);
  const setCurrentTab = useUiStore((state) => state.setCurrentTab);
  const project = useProjectSessionStore((state) => state.project);
  const projectFilePath = useProjectSessionStore((state) => state.projectFilePath);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot);
  const setSession = useProjectSessionStore((state) => state.setSession);
  const metrics = useWorkflowMetrics();
  const projectSaved = Boolean(resolveProjectFilePath(projectFilePath, projectRoot, project.metadata.projectFileName));
  const nextStep = getNextStep(metrics, projectSaved);

  return (
    <section className="studio-surface studio-hero">
      <div className="studio-hero__layout">
        <div className="studio-hero__headline">
          <div className="studio-shell__eyebrow">Next</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{nextStep.label}</h2>
            {currentTab !== nextStep.tab ? <span style={pillStyle('default')}>Recommended</span> : <span style={pillStyle('success')}>Current</span>}
          </div>
          {nextStep.reason ? <p style={{ margin: 0 }}>{nextStep.reason}</p> : null}
        </div>
      </div>
    </section>
  );
}

function ActiveJobsPanel() {
  const jobs = useJobsStore((state) => state.jobs);
  const activeJobs = jobs
    .filter((job) => job.status === 'queued' || job.status === 'running')
    .sort((left, right) => {
      const rank = (job: typeof left) => job.status === 'running' ? 0 : 1;
      const started = (job: typeof left) => Date.parse(job.startedAt ?? '') || 0;
      return rank(left) - rank(right)
        || started(left) - started(right)
        || left.id.localeCompare(right.id);
    });

  return (
    <section className="studio-jobs" aria-label="Background jobs">
      <div className="studio-jobs__header">
        <span className="studio-jobs__title">Jobs</span>
        <span className="studio-jobs__count">{activeJobs.length > 0 ? `${activeJobs.length} active` : 'idle'}</span>
      </div>
      <div className="studio-jobs__list">
        {activeJobs.length > 0 ? (
          activeJobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))
        ) : (
          <span style={{ color: muted, fontSize: 11 }}>No background work</span>
        )}
      </div>
    </section>
  );
}

function LoadingShell() {
  return (
    <Screen>
      <style>{shellCss}</style>
      <div className="studio-shell" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="studio-surface" style={{ padding: 18, color: muted }}>
          Loading project...
        </div>
      </div>
    </Screen>
  );
}

function StudioShell() {
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
            <div className="studio-main-surface">
              <ActiveView />
            </div>
            <ActiveJobsPanel />
          </main>
        </div>
      </div>
    </Screen>
  );
}

export function App() {
  useDesktopBootstrap();
  const ready = useProjectSessionStore((state) => state.ready);

  return ready ? <StudioShell /> : <LoadingShell />;
}
