import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { exportProfiles, type ExportProfileId } from '@afterimage/export-profiles';
import { loadPresetLibrary } from '@afterimage/preset-library';
import {
  getAssetById,
  getDefaultVariant,
  getFilterDefinition,
  getPrimaryAutomationProperty,
  getSupportedAutomationProperties,
  normalizeProject,
  supportedFilterDefinitions,
  type AnalysisFile,
  type AssetRole,
  type AutomationTargetProperty,
  type CutCandidate,
  type FilterInstance,
  type Marker,
  type MediaAsset,
  type NormalizedProjectFile,
  type SequenceClip,
  type SupportedFilterType,
  type SyncMode,
  type TransitionStyle
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
import {
  getCurrentVariant,
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

export function MusicView() {
  const project = useProjectSessionStore((state) => state.project);
  const selectedVariantId = useUiStore((state) => state.selectedVariantId);
  const selectVariant = useUiStore((state) => state.selectVariant);
  const setVariantMusicAsset = useProjectSessionStore((state) => state.setVariantMusicAsset);
  const setVariantMusicSyncMode = useProjectSessionStore((state) => state.setVariantMusicSyncMode);
  const applySyncMarkers = useProjectSessionStore((state) => state.applySyncMarkers);
  const variant = useMemo(() => getCurrentVariant(project, selectedVariantId), [project, selectedVariantId]);
  const audioAssets = useMemo(() => project.assets.filter((asset) => asset.mediaType === 'audio'), [project.assets]);
  const musicAsset = variant?.musicAlignment?.primaryAssetId
    ? getAssetById(project, variant.musicAlignment.primaryAssetId)
    : audioAssets[0];
  const analysisRef = variant?.musicAlignment?.analysisRefId
    ? project.analysisRefs.find((ref) => ref.id === variant.musicAlignment?.analysisRefId)
    : project.analysisRefs.find((ref) => ref.assetId === musicAsset?.id);
  const analysis = useAnalysisFile(analysisRef?.path);
  const syncEvents = analysis?.syncEventTrack?.events ?? [];
  const changeEvents = analysis?.audioChangeTrack?.events ?? [];
  const durationMs = musicAsset?.durationMs ?? analysis?.probe.durationMs ?? 0;
  const syncMode = variant?.musicAlignment?.syncMode ?? 'texture';
  const audioEventColumns = useMemo<ColDef<{ id: string; kind: string; timeMs: number; source: string; strength?: number; confidence?: number }>[]>(() => [
    { field: 'kind', headerName: 'Kind', minWidth: 120, cellRenderer: ({ value }: { value?: string }) => <strong>{value}</strong> },
    { field: 'source', headerName: 'Source', width: 120, cellRenderer: ({ value }: { value?: string }) => <span style={pillStyle()}>{value}</span> },
    { field: 'timeMs', headerName: 'Time', width: 112, valueFormatter: ({ value }) => formatMillisecondsClock(Number(value)) },
    { field: 'strength', headerName: 'Strength', width: 110, valueFormatter: ({ value }) => typeof value === 'number' ? value.toFixed(2) : '-' },
    { field: 'confidence', headerName: 'Confidence', width: 120, valueFormatter: ({ value }) => typeof value === 'number' ? value.toFixed(2) : '-' }
  ], []);

  return (
    <Panel title="Music Sync">
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {project.variants.map((candidate, index) => (
          <ToolbarButton key={candidate.id} primary={candidate.id === variant?.id} onClick={() => selectVariant(candidate.id)}>
            {formatSequenceName(candidate.name, index)}
          </ToolbarButton>
        ))}
      </div>
      {musicAsset ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
            <StatCard label="Music Asset" value={musicAsset.label ?? musicAsset.filename} />
            <StatCard label="Duration" value={`${durationMs}ms`} />
            <StatCard label="Change Events" value={String(changeEvents.length)} tone={changeEvents.length > 0 ? 'success' : 'warn'} />
            <StatCard label="Sync Events" value={String(syncEvents.length)} tone={syncEvents.length > 0 ? 'success' : 'warn'} />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: muted, fontSize: 13 }}>Music Asset</span>
              <select
                value={musicAsset.id}
                onChange={(event) => variant && setVariantMusicAsset(variant.id, event.target.value)}
                style={{ borderRadius: 12, padding: '10px 12px', background: 'rgba(13, 16, 22, 0.92)', color: '#f6f7f9', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {audioAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>{asset.label ?? asset.filename}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: muted, fontSize: 13 }}>Sync Mode</span>
              <select
                value={syncMode}
                onChange={(event) => variant && setVariantMusicSyncMode(variant.id, event.target.value as SyncMode)}
                style={{ borderRadius: 12, padding: '10px 12px', background: 'rgba(13, 16, 22, 0.92)', color: '#f6f7f9', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <option value="texture">Texture</option>
                <option value="pulse">Pulse</option>
                <option value="performance">Performance</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </label>
            <ToolbarButton onClick={() => variant && applySyncMarkers(variant.id, buildSyncMarkers(syncEvents))} disabled={syncEvents.length === 0}>
              Import Sync Markers
            </ToolbarButton>
          </div>
          <div>
            <div style={{ color: muted, marginBottom: 10 }}>
              {analysis?.audioChangeTrack?.generatedBy?.length
                ? `Generated by ${analysis.audioChangeTrack.generatedBy.join(', ')}`
                : 'Run analysis on the music asset to build change and sync events.'}
            </div>
            {renderTimeline(durationMs, syncEvents)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, minHeight: 280 }}>
            <Panel title="Change Events" bodyStyle={{ display: 'grid', minHeight: 0 }}>
              <StudioDataGrid rows={changeEvents} columns={audioEventColumns} rowHeight={42} emptyMessage="No change events yet" />
            </Panel>
            <Panel title="Sync Events" bodyStyle={{ display: 'grid', minHeight: 0 }}>
              <StudioDataGrid rows={syncEvents} columns={audioEventColumns} rowHeight={42} emptyMessage="No sync events yet" />
            </Panel>
          </div>
        </div>
      ) : (
        <div style={{ color: muted }}>Import a music track to author sync markers and sequencing cues.</div>
      )}
    </Panel>
  );
}

