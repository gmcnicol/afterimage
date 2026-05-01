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
  clamp,
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

export function CutsView() {
  const project = useProjectSessionStore((state) => state.project);
  const currentTab = useUiStore((state) => state.currentTab);
  const selectedCutId = useUiStore((state) => state.selectedCutId);
  const selectCut = useUiStore((state) => state.selectCut);
  const addNotification = useUiStore((state) => state.addNotification);
  const addCutToSequence = useProjectSessionStore((state) => state.addCutToSequence);
  const updateCutStatus = useProjectSessionStore((state) => state.updateCutStatus);
  const toggleCutFavorite = useProjectSessionStore((state) => state.toggleCutFavorite);
  const trimCutAction = useProjectSessionStore((state) => state.trimCut);
  const [query, setQuery] = useState('');
  const [draftStartMs, setDraftStartMs] = useState(0);
  const [draftEndMs, setDraftEndMs] = useState(1);
  const [previewCurrentMs, setPreviewCurrentMs] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const cutsSearchRef = useRef<HTMLInputElement | null>(null);
  const assetLabels = useMemo(() => new Map(project.assets.map((asset) => [asset.id, asset.label ?? asset.filename])), [project.assets]);
  const assetById = useMemo(() => new Map(project.assets.map((asset) => [asset.id, asset])), [project.assets]);
  const cuts = useMemo(() => project.cutCandidates.filter((cut) => {
    const asset = assetById.get(cut.assetId);
    if (!asset || asset.assetRole === 'transition-mask' || asset.assetRole === 'transition-overlay') {
      return false;
    }

    return `${cut.id} ${(cut.tags ?? []).join(' ')}`.toLowerCase().includes(deferredQuery.toLowerCase());
  }), [assetById, deferredQuery, project.cutCandidates]);
  const selectedCut = useMemo(
    () => cuts.find((cut) => cut.id === selectedCutId) ?? cuts[0],
    [cuts, selectedCutId]
  );
  const selectedCutIndex = selectedCut ? cuts.findIndex((cut) => cut.id === selectedCut.id) : -1;
  const queueCounts = useMemo(() => ({
    new: cuts.filter((cut) => !cut.status || cut.status === 'new').length,
    kept: cuts.filter((cut) => cut.status === 'kept').length,
    rejected: cuts.filter((cut) => cut.status === 'rejected').length,
    favorite: cuts.filter((cut) => cut.favorite).length
  }), [cuts]);
  const nextCuts = useMemo(() => {
    if (!selectedCut) {
      return cuts.slice(0, 3);
    }

    const followingCuts = cuts.slice(selectedCutIndex + 1, selectedCutIndex + 4);
    return followingCuts.length > 0 ? followingCuts : cuts.slice(0, 3);
  }, [cuts, selectedCut, selectedCutIndex]);
  const selectedAsset = selectedCut ? assetById.get(selectedCut.assetId) : undefined;
  const previewDurationMs = Math.max(selectedAsset?.durationMs ?? 0, selectedCut?.endMs ?? 0, 1);
  const draftDurationMs = Math.max(1, draftEndMs - draftStartMs);
  const hasDraftChanges = Boolean(selectedCut && (draftStartMs !== selectedCut.startMs || draftEndMs !== selectedCut.endMs));

  const selectRelativeCut = (baseCutId: string, delta: -1 | 1 | 0 = 1) => {
    const index = cuts.findIndex((cut) => cut.id === baseCutId);
    if (index < 0) {
      return;
    }
    const nextIndex = clamp(index + delta, 0, Math.max(cuts.length - 1, 0));
    selectCut(cuts[nextIndex]?.id);
  };

  const reviewCut = (cutId: string, status: 'kept' | 'rejected') => {
    if (status === 'kept' && selectedCut?.id === cutId) {
      addSelectedCutToSequence();
      return;
    }

    if (status === 'kept' && selectedCut?.id === cutId && hasDraftChanges) {
      trimCutAction(cutId, draftStartMs, draftEndMs);
    }
    updateCutStatus(cutId, status);
    selectRelativeCut(cutId, 1);
  };

  const seekPreview = (nextTimeMs: number) => {
    const clampedTimeMs = clamp(nextTimeMs, 0, previewDurationMs);
    const video = previewRef.current;
    if (video) {
      video.currentTime = clampedTimeMs / 1000;
    }
    setPreviewCurrentMs(clampedTimeMs);
  };

  const updateDraftRange = (
    nextStartMs: number,
    nextEndMs: number,
    options: { snapTo?: 'start' | 'end' } = {}
  ) => {
    const safeStartMs = clamp(Math.min(nextStartMs, nextEndMs - 1), 0, Math.max(previewDurationMs - 1, 0));
    const safeEndMs = clamp(Math.max(nextEndMs, safeStartMs + 1), safeStartMs + 1, previewDurationMs);

    setDraftStartMs(safeStartMs);
    setDraftEndMs(safeEndMs);

    if (options.snapTo === 'start') {
      seekPreview(safeStartMs);
      return;
    }

    if (options.snapTo === 'end') {
      seekPreview(safeEndMs);
      return;
    }

    if (previewCurrentMs < safeStartMs || previewCurrentMs > safeEndMs) {
      seekPreview(safeStartMs);
    }
  };

  const applyDraftTrim = (options: { notify?: boolean } = {}) => {
    if (!selectedCut || !hasDraftChanges) {
      return false;
    }

    trimCutAction(selectedCut.id, draftStartMs, draftEndMs);
    if (options.notify) {
      addNotification(`Trimmed ${selectedCut.id} to ${formatMillisecondsClock(draftDurationMs)}.`, 'success', 1600);
    }
    return true;
  };

  const addSelectedCutToSequence = () => {
    if (!selectedCut) {
      return;
    }

    applyDraftTrim();
    updateCutStatus(selectedCut.id, 'kept');
    addCutToSequence(selectedCut.id);
    addNotification(`Kept ${selectedCut.id} and added it to sequence.`, 'success', 1200);
    selectRelativeCut(selectedCut.id, 1);
  };

  const favoriteCutAndAdvance = (cutId: string) => {
    toggleCutFavorite(cutId);
    selectRelativeCut(cutId, 1);
  };

  const toggleCutPreviewPlayback = () => {
    const video = previewRef.current;
    if (!video) {
      return;
    }
    if (video.paused) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  };

  useEffect(() => {
    if (!selectedCut && selectedCutId) {
      selectCut(undefined);
      return;
    }

    if (!selectedCut && cuts.length > 0) {
      selectCut(cuts[0]?.id);
    }
  }, [cuts, selectCut, selectedCut, selectedCutId]);

  useEffect(() => {
    if (!selectedCut) {
      setDraftStartMs(0);
      setDraftEndMs(1);
      setPreviewCurrentMs(0);
      return;
    }

    setDraftStartMs(selectedCut.startMs);
    setDraftEndMs(selectedCut.endMs);
    setPreviewCurrentMs(selectedCut.startMs);
  }, [selectedCut?.id, selectedCut?.startMs, selectedCut?.endMs]);

  useEffect(() => {
    const video = previewRef.current;
    if (!video || !selectedCut) {
      return;
    }

    const syncToDraftStart = () => {
      video.currentTime = draftStartMs / 1000;
      setPreviewCurrentMs(draftStartMs);
    };

    const loopWithinCut = () => {
      const currentTimeMs = Math.round(video.currentTime * 1000);
      setPreviewCurrentMs(currentTimeMs);

      if (currentTimeMs >= draftEndMs - 30) {
        video.currentTime = draftStartMs / 1000;
        setPreviewCurrentMs(draftStartMs);
        if (video.paused) {
          return;
        }
        void video.play().catch(() => undefined);
      }
    };

    const onLoadedMetadata = () => {
      syncToDraftStart();
      void video.play().catch(() => undefined);
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('timeupdate', loopWithinCut);

    if (video.readyState >= 1) {
      const currentTimeMs = Math.round(video.currentTime * 1000);
      if (currentTimeMs < draftStartMs || currentTimeMs > draftEndMs) {
        syncToDraftStart();
      } else {
        setPreviewCurrentMs(currentTimeMs);
      }
    }

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('timeupdate', loopWithinCut);
    };
  }, [draftEndMs, draftStartMs, selectedCut?.id]);

  useEffect(() => {
    if (currentTab !== 'cuts' || cuts.length === 0) {
      return;
    }

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tagName = target.tagName;
      return target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
    };

    const handler = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (!selectedCut) {
        return;
      }

      if (event.key === 'ArrowRight' || event.key === 'l') {
        event.preventDefault();
        reviewCut(selectedCut.id, 'kept');
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'h') {
        event.preventDefault();
        reviewCut(selectedCut.id, 'rejected');
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'j') {
        event.preventDefault();
        selectRelativeCut(selectedCut.id, 1);
        return;
      }

      if (event.key === 'ArrowUp' || event.key === 'k') {
        event.preventDefault();
        selectRelativeCut(selectedCut.id, -1);
        return;
      }

      if (event.key === 'Enter' || event.key.toLowerCase() === 'a') {
        event.preventDefault();
        addSelectedCutToSequence();
        return;
      }

      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        favoriteCutAndAdvance(selectedCut.id);
        return;
      }

      if (event.key === ' ') {
        event.preventDefault();
        toggleCutPreviewPlayback();
      }

      if (event.key.toLowerCase() === 'i') {
        event.preventDefault();
        updateDraftRange(previewCurrentMs, draftEndMs, { snapTo: 'start' });
        return;
      }

      if (event.key.toLowerCase() === 'o') {
        event.preventDefault();
        updateDraftRange(draftStartMs, previewCurrentMs, { snapTo: 'end' });
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [addSelectedCutToSequence, currentTab, cuts, draftEndMs, draftStartMs, previewCurrentMs, selectCut, selectedCut, updateCutStatus]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.24fr) minmax(360px, 0.76fr)', gap: 16, alignItems: 'stretch', height: '100%', minHeight: 0 }}>
      <Panel title="Review Cut" bodyStyle={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr)', minHeight: 0 }}>
        {selectedCut && selectedAsset ? (
          <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(160px, 1fr) auto', gap: 12, minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'start' }}>
              <div style={{ minWidth: 0, display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent, fontWeight: 800 }}>
                    {selectedCutIndex + 1 > 0 ? `Cut ${selectedCutIndex + 1} of ${cuts.length}` : 'Cut Review'}
                  </span>
                  <span style={pillStyle(selectedCut.favorite ? 'success' : selectedCut.status === 'kept' ? 'success' : selectedCut.status === 'rejected' ? 'warn' : 'default')}>
                    {selectedCut.favorite ? 'favorite' : (selectedCut.status ?? 'new')}
                  </span>
                  {hasDraftChanges ? <span style={pillStyle('warn')}>trim pending</span> : null}
                </div>
                <div
                  title={selectedCut.id}
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    lineHeight: 1.2,
                    overflowWrap: 'anywhere'
                  }}
                >
                  {formatCutDisplayId(selectedCut.id)}
                </div>
                <div style={{ color: muted, fontSize: 13, marginTop: 6, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                  {assetLabels.get(selectedCut.assetId) ?? selectedCut.assetId}
                  {(selectedCut.tags?.length ?? 0) > 0 ? ` • ${(selectedCut.tags ?? []).join(', ')}` : ''}
                </div>
                <div title={selectedCut.id} style={{ color: muted, fontSize: 12, marginTop: 4, lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                  {selectedCut.id}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 360 }}>
                {[
                  ['In', formatMillisecondsClock(draftStartMs)],
                  ['Out', formatMillisecondsClock(draftEndMs)],
                  ['Length', formatMillisecondsClock(draftDurationMs)]
                ].map(([label, value]) => (
                  <span key={label} style={{ ...pillStyle(label === 'Length' && hasDraftChanges ? 'warn' : 'default'), minWidth: 92, justifyContent: 'space-between' }}>
                    <span style={{ color: muted }}>{label}</span>
                    <span>{value}</span>
                  </span>
                ))}
              </div>
            </div>

            <div
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 18,
                padding: 14,
                background: 'linear-gradient(180deg, rgba(13, 17, 24, 0.95), rgba(10, 13, 18, 0.92))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 0,
                overflow: 'hidden'
              }}
            >
              <video
                ref={previewRef}
                key={`${selectedCut.id}:${selectedAsset.path.absolutePath}`}
                controls
                muted
                playsInline
                preload="metadata"
                src={toMediaSrc(selectedAsset.path.absolutePath)}
                style={{
                  width: '100%',
                  height: '100%',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  borderRadius: 14,
                  background: '#090a0d',
                  objectFit: 'contain'
                }}
              />
            </div>

            <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 12, background: 'rgba(10, 13, 18, 0.88)', display: 'grid', gridTemplateRows: 'auto auto auto auto', gap: 9, minHeight: 0 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: muted, fontSize: 12, marginBottom: 8 }}>
                  <span>Source timeline</span>
                  <span>Playhead {formatMillisecondsDetail(previewCurrentMs)}</span>
                </div>
                <div style={{ position: 'relative', height: 34, borderRadius: 12, overflow: 'hidden', background: 'linear-gradient(90deg, rgba(83, 99, 122, 0.28), rgba(102, 152, 135, 0.18), rgba(119, 102, 156, 0.24))', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '5% 100%' }} />
                  <div
                    style={{
                      position: 'absolute',
                      top: 5,
                      bottom: 5,
                      left: `${(draftStartMs / previewDurationMs) * 100}%`,
                      width: `${Math.max(((draftEndMs - draftStartMs) / previewDurationMs) * 100, 0.8)}%`,
                      borderRadius: 10,
                      background: 'linear-gradient(90deg, rgba(136,160,191,0.9), rgba(122, 193, 165, 0.76))',
                      boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)'
                    }}
                  />
                  {[
                    ['start', draftStartMs],
                    ['end', draftEndMs]
                  ].map(([mark, markMs]) => (
                    <div
                      key={mark}
                      style={{
                        position: 'absolute',
                        left: `${(Number(markMs) / previewDurationMs) * 100}%`,
                        top: 4,
                        width: 3,
                        height: 26,
                        background: '#d8e7fb',
                        boxShadow: '0 0 0 1px rgba(10,13,18,0.9)'
                      }}
                    />
                  ))}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${(previewCurrentMs / previewDurationMs) * 100}%`,
                      top: 0,
                      width: 2,
                      height: '100%',
                      background: '#f6f7f9',
                      boxShadow: '0 0 0 1px rgba(10,13,18,0.9)'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'end' }}>
                <label style={{ display: 'grid', gap: 6, color: muted, fontSize: 12 }}>
                  Scrub source
                  <input
                    type="range"
                    min={0}
                    max={previewDurationMs}
                    step={10}
                    value={clamp(previewCurrentMs, 0, previewDurationMs)}
                    onChange={(event) => seekPreview(Number(event.target.value))}
                  />
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <ToolbarButton onClick={toggleCutPreviewPlayback} style={{ padding: '7px 10px' }}>Play / Pause</ToolbarButton>
                  <ToolbarButton onClick={() => seekPreview(draftStartMs)} style={{ padding: '7px 10px' }}>Jump In</ToolbarButton>
                  <ToolbarButton onClick={() => seekPreview(draftEndMs)} style={{ padding: '7px 10px' }}>Jump Out</ToolbarButton>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr) 56px', gap: 8, alignItems: 'center', minWidth: 0 }}>
                  <ToolbarButton onClick={() => updateDraftRange(draftStartMs - 100, draftEndMs, { snapTo: 'start' })} style={{ padding: '7px 8px' }}>-100</ToolbarButton>
                  <label style={{ display: 'grid', gap: 4, color: muted, fontSize: 12, minWidth: 0 }}>
                    In {formatMillisecondsDetail(draftStartMs)}
                    <input
                      type="range"
                      min={0}
                      max={Math.max(draftEndMs - 1, 1)}
                      step={10}
                      value={Math.min(draftStartMs, Math.max(draftEndMs - 1, 1))}
                      onChange={(event) => updateDraftRange(Number(event.target.value), draftEndMs, { snapTo: 'start' })}
                    />
                  </label>
                  <ToolbarButton onClick={() => updateDraftRange(draftStartMs + 100, draftEndMs, { snapTo: 'start' })} style={{ padding: '7px 8px' }}>+100</ToolbarButton>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr) 56px', gap: 8, alignItems: 'center', minWidth: 0 }}>
                  <ToolbarButton onClick={() => updateDraftRange(draftStartMs, draftEndMs - 100, { snapTo: 'end' })} style={{ padding: '7px 8px' }}>-100</ToolbarButton>
                  <label style={{ display: 'grid', gap: 4, color: muted, fontSize: 12, minWidth: 0 }}>
                    Out {formatMillisecondsDetail(draftEndMs)}
                    <input
                      type="range"
                      min={Math.min(draftStartMs + 1, previewDurationMs)}
                      max={previewDurationMs}
                      step={10}
                      value={clamp(draftEndMs, Math.min(draftStartMs + 1, previewDurationMs), previewDurationMs)}
                      onChange={(event) => updateDraftRange(draftStartMs, Number(event.target.value), { snapTo: 'end' })}
                    />
                  </label>
                  <ToolbarButton onClick={() => updateDraftRange(draftStartMs, draftEndMs + 100, { snapTo: 'end' })} style={{ padding: '7px 8px' }}>+100</ToolbarButton>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                <ToolbarButton onClick={() => updateDraftRange(previewCurrentMs, draftEndMs, { snapTo: 'start' })} style={{ padding: '7px 10px' }}>Set In</ToolbarButton>
                <ToolbarButton onClick={() => updateDraftRange(draftStartMs, previewCurrentMs, { snapTo: 'end' })} style={{ padding: '7px 10px' }}>Set Out</ToolbarButton>
                <ToolbarButton disabled={!hasDraftChanges} onClick={() => {
                  setDraftStartMs(selectedCut.startMs);
                  setDraftEndMs(selectedCut.endMs);
                  seekPreview(selectedCut.startMs);
                }} style={{ padding: '7px 10px' }}
                >
                  Reset
                </ToolbarButton>
                <ToolbarButton primary disabled={!hasDraftChanges} onClick={() => applyDraftTrim({ notify: true })} style={{ padding: '7px 10px' }}>Apply</ToolbarButton>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                <ToolbarButton onClick={() => reviewCut(selectedCut.id, 'rejected')} style={{ padding: '8px 10px' }}>Reject</ToolbarButton>
                <ToolbarButton onClick={() => reviewCut(selectedCut.id, 'kept')} style={{ padding: '8px 10px' }}>Keep</ToolbarButton>
                <ToolbarButton primary onClick={addSelectedCutToSequence} style={{ padding: '8px 10px' }}>Add</ToolbarButton>
                <ToolbarButton onClick={() => favoriteCutAndAdvance(selectedCut.id)} style={{ padding: '8px 10px' }}>Favorite</ToolbarButton>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ border: '1px dashed rgba(255,255,255,0.16)', borderRadius: 18, minHeight: 280, display: 'grid', placeItems: 'center', color: muted }}>
            Select a cut to preview it.
          </div>
        )}
      </Panel>

      <Panel title="Review Queue" bodyStyle={{ display: 'grid', gridTemplateRows: 'auto auto auto minmax(0, 1fr)', gap: 12, minHeight: 0 }}>
        <input
          ref={cutsSearchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter cuts by id or tag"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(13, 16, 22, 0.92)',
            color: '#f6f7f9',
            padding: '10px 14px'
          }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {[
            ['New', String(queueCounts.new), 'default'],
            ['Kept', String(queueCounts.kept), 'success'],
            ['Reject', String(queueCounts.rejected), 'warn'],
            ['Stars', String(queueCounts.favorite), 'success']
          ].map(([label, value, tone]) => (
            <div key={label} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '9px 10px', background: 'rgba(16, 20, 28, 0.72)', minWidth: 0 }}>
              <div style={{ color: muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
              <div style={{ color: tone === 'success' ? '#9fe1c1' : tone === 'warn' ? '#ccbdf0' : '#f6f7f9', fontSize: 18, fontWeight: 800, marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>

        {selectedCut ? (
          <div style={{ border: '1px solid rgba(136, 160, 191, 0.22)', borderRadius: 14, padding: 12, background: 'rgba(136, 160, 191, 0.08)', display: 'grid', gap: 8, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start', flexWrap: 'wrap' }}>
              <strong style={{ minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.3 }}>{formatCutDisplayId(selectedCut.id)}</strong>
              <span style={pillStyle(selectedCut.favorite ? 'success' : selectedCut.status === 'kept' ? 'success' : selectedCut.status === 'rejected' ? 'warn' : 'default')}>
                {selectedCut.favorite ? 'favorite' : (selectedCut.status ?? 'new')}
              </span>
            </div>
            <div style={{ color: muted, fontSize: 12, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
              {formatMillisecondsDetail(selectedCut.startMs)} to {formatMillisecondsDetail(selectedCut.endMs)}
              {typeof selectedCut.sceneScore === 'number' ? ` • score ${selectedCut.sceneScore.toFixed(2)}` : ''}
            </div>
          </div>
        ) : null}

        <div style={{ minHeight: 0, overflow: 'hidden', display: 'grid', gap: 8, alignContent: 'start' }}>
          {cuts.length === 0 ? (
            <div style={{ border: '1px dashed rgba(255,255,255,0.16)', borderRadius: 14, minHeight: 180, display: 'grid', placeItems: 'center', color: muted, fontSize: 13 }}>
              No cuts match the current filter.
            </div>
          ) : (
            nextCuts.map((cut) => {
              const isSelected = cut.id === selectedCut?.id;
              const statusTone = cut.favorite || cut.status === 'kept' ? 'success' : cut.status === 'rejected' ? 'warn' : 'default';
              return (
                <button
                  key={cut.id}
                  type="button"
                  onClick={() => {
                    selectCut(cut.id);
                    seekPreview(cut.startMs);
                  }}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    textAlign: 'left',
                    border: isSelected ? '1px solid rgba(136, 160, 191, 0.62)' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    padding: 12,
                    background: isSelected ? 'rgba(136, 160, 191, 0.14)' : 'rgba(16, 20, 28, 0.78)',
                    color: '#f6f7f9',
                    cursor: 'pointer',
                    display: 'grid',
                    gap: 8,
                    minWidth: 0
                  }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start', minWidth: 0 }}>
                    <strong style={{ minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.3 }}>{formatCutDisplayId(cut.id)}</strong>
                    <span style={pillStyle(statusTone)}>{cut.favorite ? 'favorite' : (cut.status ?? 'new')}</span>
                  </span>
                  <span style={{ color: muted, fontSize: 12, overflowWrap: 'anywhere', lineHeight: 1.35 }}>
                    {assetLabels.get(cut.assetId) ?? cut.assetId}
                  </span>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: muted, fontSize: 12, flexWrap: 'wrap' }}>
                    <span>{formatMillisecondsClock(cut.durationMs)}</span>
                    <span>{typeof cut.sceneScore === 'number' ? `score ${cut.sceneScore.toFixed(2)}` : formatMillisecondsClock(cut.startMs)}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </Panel>
    </div>
  );
}
