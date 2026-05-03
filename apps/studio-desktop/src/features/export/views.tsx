import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { exportProfiles, type ExportProfileId } from '@afterimage/export-profiles';
import { loadPresetLibrary } from '@afterimage/preset-library';
import type {
  AnalysisFile,
  AssetRole,
  AutomationTargetProperty,
  CutCandidate,
  FilterInstance,
  Marker,
  MediaAsset,
  NormalizedProjectFile,
  SequenceClip,
  SupportedFilterType,
  SyncMode,
  TransitionStyle
} from '@afterimage/project-model';
import { Panel } from '@afterimage/ui';
import type { DesktopJob, LibraryAsset, LibraryRoot, LibrarySearchRequest } from '../../lib/studio-client';
import { useDiagnosticsStore } from '../../stores/diagnostics-store';
import { useJobsStore } from '../../stores/jobs-store';
import { useProjectSessionStore } from '../../stores/project-session-store';
import { useUiStore } from '../../stores/ui-store';
import { accent, muted, pillStyle } from '../../app/styles';
import { getEnabledExportProfileIds, resolveProjectFilePath, toMediaSrc } from '../../app/utils';
import { JobRow } from '../../app/components/JobRow';
import { StatCard } from '../../app/components/StatCard';
import { StudioDataGrid, type StudioGridAction } from '../../app/components/StudioDataGrid';
import { ToolbarButton } from '../../app/components/ToolbarButton';
import { useExportClient } from './hooks';
import {
  getAssetById,
  getCurrentVariant,
  getDefaultVariant,
  getFilterDefinition,
  getSupportedAutomationProperties,
  supportedFilterDefinitions,
  getAnalysisSummaryByAsset,
  formatSequenceName,
  useAnalysisFile,
  catalogRoles,
  formatCatalogRole,
  getErrorMessage,
  getSceneSegments,
  buildSyncMarkers,
  renderTimeline,
  AutomationLaneTimeline,
  formatParameterLabel,
  getStackForCurrentVariant,
  filterTransitionAssets,
  formatSequenceAssetLabel,
  formatMillisecondsClock,
  formatSequenceCutLabel,
  formatMillisecondsDetail,
  formatAssetListSubline,
  formatPathTail,
  getPathBasename,
  isDisposableRecentProjectPath,
  isVarRecentProjectPath,
  formatCutDisplayId
} from '../view-support';

export function ExportView() {
  const api = useExportClient();
  const project = useProjectSessionStore((state) => state.project);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot) ?? '.';
  const toggleProfile = useProjectSessionStore((state) => state.toggleExportProfile);
  const selectedVariantId = useUiStore((state) => state.selectedVariantId);
  const selectVariant = useUiStore((state) => state.selectVariant);
  const allJobs = useJobsStore((state) => state.jobs);
  const variant = useMemo(() => getCurrentVariant(project, selectedVariantId), [project, selectedVariantId]);
  const exportJobs = useMemo(() => allJobs.filter((job) => job.type === 'export'), [allJobs]);
  const enabledProfileIds = useMemo(() => getEnabledExportProfileIds(project.exportSelections), [project.exportSelections]);
  const exportSequenceRows = useMemo(() => project.variants.map((candidate, index) => ({
    id: candidate.id,
    name: formatSequenceName(candidate.name, index),
    sequenceId: candidate.sequenceId,
    clipCount: candidate.clips.length,
    durationMs: Math.max(0, ...candidate.clips.map((clip) => clip.timelineStartMs + clip.durationMs)),
    selected: candidate.id === variant?.id
  })), [project.variants, variant?.id]);
  const exportProfileRows = useMemo(() => exportProfiles.map((profile) => ({
    ...profile,
    id: profile.id,
    enabled: project.exportSelections.find((item) => item.profileId === profile.id)?.enabled ?? false
  })), [project.exportSelections]);
  const exportSequenceColumns = useMemo<ColDef<(typeof exportSequenceRows)[number]>[]>(() => [
    { field: 'name', headerName: 'Sequence', minWidth: 180, flex: 1.4, cellRenderer: ({ value }: { value?: string }) => <strong>{value}</strong> },
    { field: 'clipCount', headerName: 'Clips', width: 92 },
    { field: 'durationMs', headerName: 'Duration', width: 120, valueFormatter: ({ value }) => formatMillisecondsClock(Number(value ?? 0)) },
    { field: 'sequenceId', headerName: 'Source', minWidth: 150 },
    {
      field: 'selected',
      headerName: 'State',
      width: 104,
      cellRenderer: ({ value }: { value?: boolean }) => value ? <span style={pillStyle('success')}>selected</span> : <span style={pillStyle()}>available</span>
    }
  ], [exportSequenceRows]);
  const exportProfileColumns = useMemo<ColDef<(typeof exportProfileRows)[number]>[]>(() => [
    { field: 'name', headerName: 'Profile', minWidth: 190, cellRenderer: ({ value }: { value?: string }) => <strong>{value}</strong> },
    { headerName: 'Size', width: 118, valueGetter: ({ data }) => data ? `${data.width} x ${data.height}` : '' },
    { field: 'container', headerName: 'Container', width: 112 },
    { field: 'enabled', headerName: 'State', width: 106, cellRenderer: ({ value }: { value?: boolean }) => <span style={pillStyle(value ? 'success' : 'default')}>{value ? 'enabled' : 'disabled'}</span> },
    {
      headerName: 'Actions',
      width: 118,
      sortable: false,
      cellRenderer: ({ data }: { data?: (typeof exportProfileRows)[number] }) => data ? (
        <ToolbarButton onClick={() => toggleProfile(data.id)} style={{ padding: '5px 7px' }}>{data.enabled ? 'Disable' : 'Enable'}</ToolbarButton>
      ) : null
    }
  ], [exportProfileRows, toggleProfile]);
  const jobColumns = useMemo<ColDef<DesktopJob>[]>(() => [
    { field: 'target', headerName: 'Target', minWidth: 260, flex: 1.5 },
    { field: 'status', headerName: 'Status', width: 110, cellRenderer: ({ value }: { value?: string }) => <span style={pillStyle(value === 'completed' ? 'success' : value === 'failed' ? 'warn' : 'default')}>{value}</span> },
    { field: 'progress', headerName: 'Progress', width: 110, valueFormatter: ({ value }) => typeof value === 'number' ? `${Math.round(value * 100)}%` : '-' },
    { field: 'startedAt', headerName: 'Started', minWidth: 150 },
    { field: 'error', headerName: 'Error', minWidth: 180 }
  ], []);

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) minmax(220px, 0.75fr)', gap: 16, height: '100%', minHeight: 0 }}>
      <Panel title="Export" bodyStyle={{ display: 'grid', gridTemplateRows: '160px minmax(0, 1fr) auto', gap: 14, minHeight: 0 }}>
        <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 8, minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <strong>Sequence</strong>
            <span style={{ color: muted, fontSize: 12 }}>{variant ? variant.id : 'none selected'}</span>
          </div>
          <StudioDataGrid
            rows={exportSequenceRows}
            columns={exportSequenceColumns}
            focusedRowId={variant?.id}
            onFocusRow={(row) => selectVariant(row.id)}
            onRowOpen={(row) => selectVariant(row.id)}
            rowHeight={44}
            emptyMessage="No sequences"
          />
        </div>
        <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 8, minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <strong>Profiles</strong>
            <span style={{ color: muted, fontSize: 12 }}>{enabledProfileIds.length} enabled</span>
          </div>
          <StudioDataGrid rows={exportProfileRows} columns={exportProfileColumns} rowHeight={48} emptyMessage="No export profiles" />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
          <span style={{ color: muted, fontSize: 12 }}>
            {variant ? `${formatSequenceName(variant.name)} -> ${enabledProfileIds.length} profile${enabledProfileIds.length === 1 ? '' : 's'}` : 'Select a sequence'}
          </span>
          <ToolbarButton primary disabled={!variant || enabledProfileIds.length === 0} onClick={() => {
            if (!variant) {
              return;
            }

            void api.jobs.runExport({
              project,
              projectRoot,
              outputPath: `${projectRoot}/exports/${project.id}-${variant.id}`,
              profileIds: enabledProfileIds,
              selections: project.exportSelections,
              sequenceId: variant.sequenceId,
              variantId: variant.id
            });
          }}>Export Selected Sequence</ToolbarButton>
        </div>
      </Panel>
      <Panel title="Export Queue" bodyStyle={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr)', minHeight: 0 }}>
        <div style={{ display: 'grid', minHeight: 0 }}>
          {exportJobs.length > 0 ? (
            <StudioDataGrid rows={exportJobs} columns={jobColumns} rowHeight={46} emptyMessage="No export jobs yet" />
          ) : (
            <div style={{ border: '1px dashed rgba(255,255,255,0.14)', borderRadius: 16, padding: 18, color: muted, lineHeight: 1.6 }}>
              No export jobs yet. Enable at least one delivery profile, then export the selected sequence and watch the queue here.
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
