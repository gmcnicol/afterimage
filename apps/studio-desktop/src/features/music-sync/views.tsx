import { useMemo } from 'react';
import type { ColDef } from 'ag-grid-community';
import type {
  AudioChangeEvent,
  MediaAsset,
  SyncEvent
} from '@afterimage/project-model';
import { StudioDataGrid } from '../../app/components/StudioDataGrid';
import { ToolbarButton } from '../../app/components/ToolbarButton';
import { getStudioClient } from '../../lib/studio-client';
import { useProjectSessionStore } from '../../stores/project-session-store';
import { useUiStore } from '../../stores/ui-store';
import {
  formatMillisecondsClock,
  getAssetById,
  getCurrentVariant,
  useAnalysisFile
} from '../view-support';

function getAssetLabel(asset: MediaAsset): string {
  return asset.label ?? asset.filename;
}

function compactNumber(value: number): string {
  return Intl.NumberFormat('en-GB').format(value);
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '-';
  }

  return formatMillisecondsClock(ms);
}

function CueTimeline({ durationMs, events }: { durationMs: number; events: SyncEvent[] }) {
  const safeDuration = Math.max(durationMs, 1);

  return (
    <div className="music-sync__timeline">
      <div className="music-sync__timeline-track">
        {events.map((event) => {
          const left = `${Math.max(0, Math.min(100, (event.timeMs / safeDuration) * 100))}%`;
          const opacity = Math.max(0.35, Math.min(1, event.strength ?? 0.6));
          return (
            <span
              key={event.id}
              title={`${event.kind} ${formatMillisecondsClock(event.timeMs)}`}
              className={`music-sync__cue-mark music-sync__cue-mark--${event.kind === 'accent' ? 'accent' : event.kind === 'silence-boundary' ? 'boundary' : 'change'}`}
              style={{ left, opacity, width: event.kind === 'accent' ? 3 : 2 }}
            />
          );
        })}
      </div>
      <div className="music-sync__timeline-scale">
        <span>0:00.0</span>
        <span>{formatDuration(durationMs)}</span>
      </div>
    </div>
  );
}

function EmptyMusicState({ onSelectMedia }: { onSelectMedia: () => void }) {
  return (
    <div className="music-sync music-sync--empty">
      <div className="music-sync__muted">No project tune. Add one music asset in Media.</div>
      <div>
        <ToolbarButton primary onClick={onSelectMedia}>Select Media</ToolbarButton>
      </div>
    </div>
  );
}

export function MusicView() {
  const project = useProjectSessionStore((state) => state.project);
  const selectedVariantId = useUiStore((state) => state.selectedVariantId);
  const setCurrentTab = useUiStore((state) => state.setCurrentTab);
  const addNotification = useUiStore((state) => state.addNotification);
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
  const changeEvents = analysis?.audioChangeTrack?.events ?? [];
  const syncEvents = analysis?.syncEventTrack?.events ?? [];
  const durationMs = musicAsset?.durationMs ?? analysis?.probe.durationMs ?? 0;
  const generatedBy = analysis?.audioChangeTrack?.generatedBy?.join(', ') || 'Not analysed';
  const customCueCount = useMemo(() => (variant?.markers ?? []).filter((marker) => marker.id.startsWith('custom-cue-')).length, [variant?.markers]);

  const rawColumns = useMemo<ColDef<AudioChangeEvent>[]>(() => [
    { field: 'kind', headerName: 'Event', minWidth: 128, flex: 1.1 },
    { field: 'source', headerName: 'Detector', width: 112 },
    { field: 'timeMs', headerName: 'Time', width: 94, valueFormatter: ({ value }) => formatMillisecondsClock(Number(value)) },
    { field: 'strength', headerName: 'Strength', width: 86, valueFormatter: ({ value }) => typeof value === 'number' ? value.toFixed(2) : '-' },
    { field: 'confidence', headerName: 'Confidence', width: 96, valueFormatter: ({ value }) => typeof value === 'number' ? value.toFixed(2) : '-' }
  ], []);

  const cueColumns = useMemo<ColDef<SyncEvent>[]>(() => [
    { field: 'kind', headerName: 'Cue', minWidth: 110, flex: 1 },
    { field: 'source', headerName: 'Derived From', width: 118 },
    { field: 'timeMs', headerName: 'Time', width: 94, valueFormatter: ({ value }) => formatMillisecondsClock(Number(value)) },
    { field: 'strength', headerName: 'Strength', width: 86, valueFormatter: ({ value }) => typeof value === 'number' ? value.toFixed(2) : '-' },
    { field: 'confidence', headerName: 'Confidence', width: 96, valueFormatter: ({ value }) => typeof value === 'number' ? value.toFixed(2) : '-' }
  ], []);

  const loadCustomCues = async () => {
    if (!variant) {
      return;
    }

    const imported = await getStudioClient().project.importCueFile();
    if (!imported) {
      return;
    }

    setVariantMusicSyncMode(variant.id, 'custom');
    applySyncMarkers(variant.id, imported.markers);
    addNotification(`Loaded ${compactNumber(imported.markers.length)} custom cue${imported.markers.length === 1 ? '' : 's'}.`, 'success');
  };

  if (!musicAsset) {
    return <EmptyMusicState onSelectMedia={() => setCurrentTab('media')} />;
  }

  return (
    <div className="music-sync">
      <div className="music-sync__toolbar">
        <div className="music-sync__field music-sync__field--tune">
          <span>Project tune</span>
          <div className="music-sync__value" title={getAssetLabel(musicAsset)}>{getAssetLabel(musicAsset)}</div>
        </div>
        <div className="music-sync__field">
          <span>Duration</span>
          <div className="music-sync__value">{formatDuration(durationMs)}</div>
        </div>
        <div className="music-sync__field">
          <span>Raw</span>
          <div className="music-sync__value">{compactNumber(changeEvents.length)}</div>
        </div>
        <div className="music-sync__field">
          <span>Cues</span>
          <div className="music-sync__value">{compactNumber(syncEvents.length)}</div>
        </div>
        <ToolbarButton
          primary
          onClick={() => void loadCustomCues()}
          disabled={!variant}
          title="Load an Afterimage cue JSON file and use it instead of analysis-derived cue markers"
        >
          Load Custom Cues
        </ToolbarButton>
      </div>

      <div className="music-sync__status">
        <span
          className={`music-sync__pill ${changeEvents.length > 0 ? 'music-sync__pill--success' : 'music-sync__pill--warn'}`}
        >
          {generatedBy}
        </span>
        <span className="music-sync__status-text">
          Analysed cues are canonical. Custom cue files override sequence markers; current sequence has {compactNumber(customCueCount)} custom cues.
        </span>
      </div>

      <CueTimeline durationMs={durationMs} events={syncEvents} />

      <div className="music-sync__grids">
        <div className="music-sync__grid-panel">
          <div className="music-sync__grid-title">Raw Analysis</div>
          <StudioDataGrid rows={changeEvents} columns={rawColumns} rowHeight={30} headerHeight={28} emptyMessage="No raw analysis events. Analyse the tune in Media." />
        </div>
        <div className="music-sync__grid-panel">
          <div className="music-sync__grid-title">Derived Sync Cues</div>
          <StudioDataGrid rows={syncEvents} columns={cueColumns} rowHeight={30} headerHeight={28} emptyMessage="No sync cues. Analyse the tune in Media." />
        </div>
      </div>
    </div>
  );
}
