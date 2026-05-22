import { useMemo } from 'react';
import { Screen } from '@afterimage/ui';
import { getStudioClient, type DesktopJob } from '../lib/studio-client';
import { useDiagnosticsStore } from '../stores/diagnostics-store';
import { useJobsStore } from '../stores/jobs-store';
import { useProjectSessionStore } from '../stores/project-session-store';
import {
  getDefaultTabForSpace,
  type StudioSpace,
  type StudioTab,
  useUiStore
} from '../stores/ui-store';
import { ToolbarButton } from './components/ToolbarButton';
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
      linear-gradient(180deg, rgba(20, 24, 31, 0.98) 0%, rgba(10, 12, 16, 0.98) 42%, rgba(8, 10, 13, 1) 100%),
      linear-gradient(90deg, rgba(82, 98, 122, 0.12), rgba(92, 122, 104, 0.1), rgba(120, 99, 139, 0.08));
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
    grid-template-rows: 40px minmax(0, 1fr) 36px;
    gap: 0;
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
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0;
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

  .studio-macrobar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: stretch;
    min-width: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(8, 10, 14, 0.96);
  }

  .studio-macrobar__modes,
  .studio-macrobar__right {
    display: flex;
    align-items: stretch;
    min-width: 0;
  }

  .studio-macrobar__right {
    border-left: 1px solid rgba(255, 255, 255, 0.08);
  }

  .studio-macrobar__button {
    height: 39px;
    min-width: 104px;
    padding: 0 14px;
    border: 0;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    background: transparent;
    color: rgba(246, 247, 249, 0.72);
    cursor: pointer;
    font: inherit;
    font-weight: 500;
    letter-spacing: 0;
    white-space: nowrap;
  }

  .studio-macrobar__button:hover,
  .studio-macrobar__button.is-current {
    color: #f6f7f9;
    background: rgba(255, 255, 255, 0.06);
  }

  .studio-macrobar__button.is-current {
    border-bottom: 2px solid ${accent};
  }

  .studio-macrobar__action {
    min-width: 112px;
    color: #111827;
    background: #9db1ca;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
  }

  .studio-macrobar__action:hover {
    color: #0d1118;
    background: #b7c5d7;
  }

  .studio-shell__main {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .studio-contextbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    min-height: 36px;
    padding: 0 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(12, 15, 21, 0.9);
  }

  .studio-contextbar__tabs,
  .studio-contextbar__meta {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 6px;
  }

  .studio-contextbar__tab {
    height: 26px;
    padding: 0 9px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(246, 247, 249, 0.72);
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    white-space: nowrap;
  }

  .studio-contextbar__tab:hover,
  .studio-contextbar__tab.is-current {
    color: #f6f7f9;
    border-color: rgba(136, 160, 191, 0.38);
    background: rgba(136, 160, 191, 0.14);
  }

  .studio-contextbar__meta {
    justify-content: flex-end;
    color: ${muted};
    font-size: 11px;
    white-space: nowrap;
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

  .studio-statusbar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    min-width: 0;
    min-height: 36px;
    padding: 0 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(7, 9, 13, 0.96);
  }

  .studio-statusbar__counts,
  .studio-statusbar__tasks {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 6px;
  }

  .studio-statusbar__label {
    color: rgba(246, 247, 249, 0.54);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .studio-statusbar__count,
  .studio-statusbar__task {
    height: 24px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(246, 247, 249, 0.78);
    padding: 0 8px;
    font-size: 11px;
  }

  .studio-statusbar__task {
    max-width: 270px;
    cursor: pointer;
    font: inherit;
  }

  .studio-statusbar__task:hover,
  .studio-statusbar__task.is-current {
    color: #f6f7f9;
    border-color: rgba(136, 160, 191, 0.38);
  }

  .studio-statusbar__task-target {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .studio-statusbar__empty {
    color: ${muted};
    font-size: 11px;
  }

  .studio-task-flyout {
    position: fixed;
    top: 40px;
    right: 0;
    bottom: 36px;
    z-index: 20;
    width: min(420px, calc(100vw - 24px));
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(11, 14, 19, 0.98);
  }

  .studio-task-flyout__header,
  .studio-task-flyout__section,
  .studio-task-flyout__actions {
    padding: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .studio-task-flyout__header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: start;
  }

  .studio-task-flyout__title {
    min-width: 0;
    display: grid;
    gap: 5px;
  }

  .studio-task-flyout__title strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .studio-task-flyout__subtitle {
    color: ${muted};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .studio-task-flyout__progress {
    height: 5px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.08);
  }

  .studio-task-flyout__progress-bar {
    height: 100%;
    background: #9fe1c1;
  }

  .studio-task-flyout__logs {
    min-height: 0;
    overflow: auto;
    padding: 12px;
    color: rgba(246, 247, 249, 0.82);
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
    line-height: 1.45;
    white-space: pre-wrap;
  }

  .studio-task-flyout__error {
    color: #f5b5d4;
    margin-bottom: 8px;
  }

  .studio-task-flyout__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    border-bottom: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
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
      grid-template-rows: auto minmax(900px, 1fr) auto;
      height: auto;
      overflow: visible;
    }

    .studio-shell__sidebar {
      overflow: visible;
    }

    .studio-shell__main {
      grid-template-rows: auto minmax(0, 1fr);
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
    .studio-macrobar {
      grid-template-columns: 1fr;
    }

    .studio-macrobar__modes,
    .studio-macrobar__right,
    .studio-contextbar__tabs,
    .studio-statusbar__tasks {
      overflow-x: auto;
      scrollbar-width: none;
    }

    .studio-macrobar__modes::-webkit-scrollbar,
    .studio-macrobar__right::-webkit-scrollbar,
    .studio-contextbar__tabs::-webkit-scrollbar,
    .studio-statusbar__tasks::-webkit-scrollbar {
      display: none;
    }

    .studio-contextbar,
    .studio-statusbar {
      grid-template-columns: 1fr;
      align-items: start;
      padding: 6px 8px;
    }

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

interface TabMeta {
  id: StudioTab;
  label: string;
  description: string;
}

interface SpaceMeta {
  id: StudioSpace;
  label: string;
  actionLabel: string;
  actionTab: StudioTab;
  surfaces: StudioTab[];
}

const tabMeta: Record<StudioTab, TabMeta> = {
  project: {
    id: 'project',
    label: 'Project',
    description: 'Project file, recent sessions, save state, and desktop roots.'
  },
  media: {
    id: 'media',
    label: 'Media',
    description: 'Project imports, source analysis, and project media readiness.'
  },
  catalog: {
    id: 'catalog',
    label: 'Catalogue',
    description: 'Reusable footage, transitions, overlays, and global library scans.'
  },
  cuts: {
    id: 'cuts',
    label: 'Cuts',
    description: 'Cut review queue and keep/reject decisions.'
  },
  sequence: {
    id: 'sequence',
    label: 'Sequence',
    description: 'Edit assembly, transitions, markers, and preview renders.'
  },
  music: {
    id: 'music',
    label: 'Music Sync',
    description: 'Cue timing, authored markers, and soundtrack alignment.'
  },
  style: {
    id: 'style',
    label: 'Style',
    description: 'Filter stacks, presets, and authored looks.'
  },
  automation: {
    id: 'automation',
    label: 'Automation',
    description: 'Motion lanes and keyframes for filter parameters.'
  },
  export: {
    id: 'export',
    label: 'Export',
    description: 'Delivery profiles, render queue, and capture readiness.'
  },
  diagnostics: {
    id: 'diagnostics',
    label: 'Diagnostics',
    description: 'Toolchain health, missing media, job history, and logs.'
  }
};

const spaceMeta: SpaceMeta[] = [
  {
    id: 'archive',
    label: 'Archive',
    actionLabel: 'Import',
    actionTab: 'media',
    surfaces: ['project', 'media', 'catalog']
  },
  {
    id: 'world',
    label: 'World',
    actionLabel: 'Sequence',
    actionTab: 'sequence',
    surfaces: ['cuts', 'sequence', 'music', 'style', 'automation']
  },
  {
    id: 'performance',
    label: 'Performance',
    actionLabel: 'Rehearse',
    actionTab: 'sequence',
    surfaces: ['sequence']
  },
  {
    id: 'capture',
    label: 'Capture',
    actionLabel: 'Export',
    actionTab: 'export',
    surfaces: ['export']
  },
  {
    id: 'observatory',
    label: 'Observatory',
    actionLabel: 'Inspect',
    actionTab: 'diagnostics',
    surfaces: ['diagnostics']
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

function getSpaceMeta(space: StudioSpace): SpaceMeta {
  return spaceMeta.find((candidate) => candidate.id === space) ?? spaceMeta[0];
}

function getJobOwningSpace(job: DesktopJob): StudioSpace {
  switch (job.type) {
    case 'analysis':
    case 'thumbnails':
    case 'waveform':
    case 'library-scan':
    case 'library-analysis':
      return 'archive';
    case 'export':
      return 'capture';
    case 'preview':
      return 'performance';
  }
}

function getJobOwningTab(job: DesktopJob): StudioTab {
  switch (job.type) {
    case 'analysis':
      return 'media';
    case 'library-scan':
    case 'library-analysis':
      return 'catalog';
    case 'export':
      return 'export';
    case 'preview':
      return 'sequence';
    default:
      return getDefaultTabForSpace(getJobOwningSpace(job));
  }
}

function sortJobsByRelevance(jobs: DesktopJob[]): DesktopJob[] {
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

function getJobProgress(job: DesktopJob): number | undefined {
  return typeof job.progress === 'number'
    ? Math.max(0, Math.min(100, Math.round(job.progress * 100)))
    : undefined;
}

function MacroNavigation() {
  const currentSpace = useUiStore((state) => state.currentSpace);
  const setCurrentSpace = useUiStore((state) => state.setCurrentSpace);
  const setWorkspaceSurface = useUiStore((state) => state.setWorkspaceSurface);
  const currentSpaceMeta = getSpaceMeta(currentSpace);
  const primarySpaces = spaceMeta.filter((space) => space.id !== 'observatory');

  return (
    <nav className="studio-macrobar" aria-label="Studio spaces">
      <div className="studio-macrobar__modes">
        {primarySpaces.map((space) => (
          <button
            key={space.id}
            type="button"
            className={`studio-macrobar__button${currentSpace === space.id ? ' is-current' : ''}`}
            aria-current={currentSpace === space.id ? 'page' : undefined}
            onClick={() => setCurrentSpace(space.id)}
          >
            {space.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="studio-macrobar__button studio-macrobar__action"
        onClick={() => setWorkspaceSurface(currentSpace, currentSpaceMeta.actionTab)}
      >
        {currentSpaceMeta.actionLabel}
      </button>
      <div className="studio-macrobar__right">
        <button
          type="button"
          className={`studio-macrobar__button${currentSpace === 'observatory' ? ' is-current' : ''}`}
          aria-current={currentSpace === 'observatory' ? 'page' : undefined}
          onClick={() => setCurrentSpace('observatory')}
        >
          Observatory
        </button>
      </div>
    </nav>
  );
}

function WorkspaceContextBar() {
  const currentSpace = useUiStore((state) => state.currentSpace);
  const currentTab = useUiStore((state) => state.currentTab);
  const setWorkspaceSurface = useUiStore((state) => state.setWorkspaceSurface);
  const project = useProjectSessionStore((state) => state.project);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot);
  const projectFilePath = useProjectSessionStore((state) => state.projectFilePath);
  const dirty = useProjectSessionStore((state) => state.dirty);
  const metrics = useWorkflowMetrics();
  const activeSpace = getSpaceMeta(currentSpace);
  const resolvedProjectFilePath = resolveProjectFilePath(projectFilePath, projectRoot, project.metadata.projectFileName);
  const surfaces = activeSpace.surfaces;

  return (
    <div className="studio-contextbar" aria-label={`${activeSpace.label} workspace`}>
      <div className="studio-contextbar__tabs">
        {surfaces.length > 1 ? surfaces.map((tab) => {
          const status = getTabStatus(tab, metrics);
          const badge = getTabBadge(tab, metrics);
          const meta = tabMeta[tab];
          const isCurrent = currentTab === tab;
          return (
            <button
              key={tab}
              type="button"
              title={meta.description}
              className={`studio-contextbar__tab${isCurrent ? ' is-current' : ''}`}
              aria-current={isCurrent ? 'page' : undefined}
              onClick={() => setWorkspaceSurface(currentSpace, tab)}
            >
              {meta.label}
              {badge ? ` ${badge}` : ''}
              {' '}
              {status.label}
            </button>
          );
        }) : (
          <span className="studio-statusbar__label">{tabMeta[surfaces[0]].description}</span>
        )}
      </div>
      <div className="studio-contextbar__meta">
        <span>{project.name}</span>
        <span style={pillStyle(dirty ? 'warn' : 'success')}>{dirty ? 'Unsaved' : 'Saved'}</span>
        {metrics.warningCount > 0 || metrics.missingMediaCount > 0 ? (
          <span style={pillStyle('warn')}>{metrics.warningCount + metrics.missingMediaCount} issues</span>
        ) : null}
        <span title={resolvedProjectFilePath}>{resolvedProjectFilePath ?? 'Unsaved project file'}</span>
      </div>
    </div>
  );
}

function BottomTaskStatusBar() {
  const jobs = useJobsStore((state) => state.jobs);
  const selectedTaskId = useUiStore((state) => state.selectedTaskId);
  const selectTask = useUiStore((state) => state.selectTask);
  const counts = useMemo(() => ({
    queued: jobs.filter((job) => job.status === 'queued').length,
    running: jobs.filter((job) => job.status === 'running').length,
    failed: jobs.filter((job) => job.status === 'failed').length,
    completed: jobs.filter((job) => job.status === 'completed').length
  }), [jobs]);
  const taskSnippets = useMemo(() => sortJobsByRelevance(jobs).slice(0, 5), [jobs]);

  return (
    <section className="studio-statusbar" aria-label="Async task status">
      <div className="studio-statusbar__counts">
        <span className="studio-statusbar__label">Tasks</span>
        <span className="studio-statusbar__count">Queued {counts.queued}</span>
        <span className="studio-statusbar__count">Running {counts.running}</span>
        <span className="studio-statusbar__count">Failed {counts.failed}</span>
        <span className="studio-statusbar__count">Done {counts.completed}</span>
      </div>
      <div className="studio-statusbar__tasks">
        {taskSnippets.length > 0 ? taskSnippets.map((job) => {
          const progress = getJobProgress(job);
          const label = progress !== undefined && job.status === 'running' ? `${job.status} ${progress}%` : job.status;
          return (
            <button
              key={job.id}
              type="button"
              className={`studio-statusbar__task${selectedTaskId === job.id ? ' is-current' : ''}`}
              onClick={() => selectTask(job.id)}
              title={`${job.type}: ${job.target}`}
            >
              <span>{job.type}</span>
              <span className={`job-row__status status-${job.status}`}>{label}</span>
              <span className="studio-statusbar__task-target">{job.target}</span>
            </button>
          );
        }) : (
          <span className="studio-statusbar__empty">No background work</span>
        )}
      </div>
    </section>
  );
}

function TaskFlyout() {
  const api = getStudioClient();
  const jobs = useJobsStore((state) => state.jobs);
  const selectedTaskId = useUiStore((state) => state.selectedTaskId);
  const selectTask = useUiStore((state) => state.selectTask);
  const setWorkspaceSurface = useUiStore((state) => state.setWorkspaceSurface);
  const addNotification = useUiStore((state) => state.addNotification);
  const job = jobs.find((candidate) => candidate.id === selectedTaskId);

  if (!job) {
    return null;
  }

  const progress = getJobProgress(job);
  const owningSpace = getJobOwningSpace(job);
  const owningTab = getJobOwningTab(job);
  const cancellable = job.status === 'queued' || job.status === 'running';
  const retryable = job.status === 'failed' || job.status === 'cancelled';
  const logLines = job.log.length > 0 ? job.log : ['No logs yet.'];

  return (
    <aside className="studio-task-flyout" aria-label="Task detail">
      <div className="studio-task-flyout__header">
        <div className="studio-task-flyout__title">
          <strong>{job.type} / {job.status}</strong>
          <span className="studio-task-flyout__subtitle">{job.target}</span>
        </div>
        <ToolbarButton onClick={() => selectTask(undefined)} compact>Close</ToolbarButton>
      </div>
      <div className="studio-task-flyout__section">
        <div className="studio-task-flyout__progress" aria-label={progress !== undefined ? `Progress ${progress}%` : 'Progress unavailable'}>
          <div className="studio-task-flyout__progress-bar" style={{ width: `${progress ?? (job.status === 'completed' ? 100 : 0)}%` }} />
        </div>
      </div>
      <div className="studio-task-flyout__logs studio-scrollable">
        {job.error ? <div className="studio-task-flyout__error">{job.error}</div> : null}
        {logLines.map((line, index) => (
          <div key={`${job.id}-log-${index}`}>{line}</div>
        ))}
      </div>
      <div className="studio-task-flyout__actions">
        <ToolbarButton primary onClick={() => setWorkspaceSurface(owningSpace, owningTab)}>
          Open {getSpaceMeta(owningSpace).label}
        </ToolbarButton>
        {cancellable ? (
          <ToolbarButton onClick={() => void api.jobs.cancel(job.id).then((cancelled) => {
            addNotification(cancelled ? `Cancelled job ${job.id}.` : `Job ${job.id} is no longer running.`, cancelled ? 'success' : 'warn');
          })}>Cancel</ToolbarButton>
        ) : null}
        {retryable ? (
          <ToolbarButton onClick={() => void api.jobs.retry(job.id).then((launch) => {
            const retried = launch.jobIds.length > 0;
            addNotification(retried ? `Retried job ${job.id}.` : `Job ${job.id} cannot be retried.`, retried ? 'success' : 'warn');
          })}>Retry</ToolbarButton>
        ) : null}
      </div>
    </aside>
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
          <MacroNavigation />
          <main className="studio-shell__main">
            <WorkspaceContextBar />
            <div className="studio-main-surface">
              <ActiveView />
            </div>
          </main>
          <BottomTaskStatusBar />
        </div>
        <TaskFlyout />
      </div>
    </Screen>
  );
}

export function App() {
  useDesktopBootstrap();
  const ready = useProjectSessionStore((state) => state.ready);

  return ready ? <StudioShell /> : <LoadingShell />;
}
