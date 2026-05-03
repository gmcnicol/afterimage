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
import { useSequenceBuilderClient } from './hooks';
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

export function SequenceView() {
  const api = useSequenceBuilderClient();
  const project = useProjectSessionStore((state) => state.project);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot) ?? '.';
  const allJobs = useJobsStore((state) => state.jobs);
  const previewPath = useUiStore((state) => state.previewPath);
  const setPreviewPath = useUiStore((state) => state.setPreviewPath);
  const setCurrentTab = useUiStore((state) => state.setCurrentTab);
  const selectedVariantId = useUiStore((state) => state.selectedVariantId);
  const selectVariant = useUiStore((state) => state.selectVariant);
  const addCutToSequenceAction = useProjectSessionStore((state) => state.addCutToSequence);
  const buildVariantFromReviewedCutsAction = useProjectSessionStore((state) => state.buildVariantFromReviewedCuts);
  const buildNewVariantFromReviewedCutsAction = useProjectSessionStore((state) => state.buildNewVariantFromReviewedCuts);
  const deleteVariantAction = useProjectSessionStore((state) => state.deleteVariant);
  const moveClipAction = useProjectSessionStore((state) => state.moveClip);
  const removeClipAction = useProjectSessionStore((state) => state.removeClip);
  const trimClipAction = useProjectSessionStore((state) => state.trimClip);
  const setClipOverlayAssetAction = useProjectSessionStore((state) => state.setClipOverlayAsset);
  const setClipOverlayCutAction = useProjectSessionStore((state) => state.setClipOverlayCut);
  const setClipTransitionAction = useProjectSessionStore((state) => state.setClipTransition);
  const setClipTransitionDurationAction = useProjectSessionStore((state) => state.setClipTransitionDuration);
  const setClipTransitionAssetAction = useProjectSessionStore((state) => state.setClipTransitionAsset);
  const setClipTransitionCutAction = useProjectSessionStore((state) => state.setClipTransitionCut);
  const setClipTransitionOverlayAssetAction = useProjectSessionStore((state) => state.setClipTransitionOverlayAsset);
  const setClipTransitionOverlayCutAction = useProjectSessionStore((state) => state.setClipTransitionOverlayCut);
  const randomizeFoundryTransitionsAction = useProjectSessionStore((state) => state.randomizeFoundryTransitions);
  const randomizeFoundryOverlaysAction = useProjectSessionStore((state) => state.randomizeFoundryOverlays);
  const duplicateVariantAction = useProjectSessionStore((state) => state.duplicateVariant);
  const addMarkerAction = useProjectSessionStore((state) => state.addMarker);
  const addSectionAction = useProjectSessionStore((state) => state.addSection);
  const [selectedClipId, setSelectedClipId] = useState<string>();
  const [selectedAvailableCutId, setSelectedAvailableCutId] = useState<string>();
  const variant = useMemo(() => getCurrentVariant(project, selectedVariantId), [project, selectedVariantId]);
  const transitionMaskAssets = useMemo(() => filterTransitionAssets(project.assets, 'mask'), [project.assets]);
  const overlayAssets = useMemo(() => filterTransitionAssets(project.assets, 'overlay'), [project.assets]);
  const overlayOptions = useMemo(
    () => overlayAssets.map((asset) => ({ id: asset.id, label: formatSequenceAssetLabel(asset), title: asset.label ?? asset.filename })),
    [overlayAssets]
  );
  const transitionCutOptions = useMemo(
    () => project.cutCandidates
      .filter((cut) => getAssetById(project, cut.assetId)?.assetRole === 'transition-mask')
      .map((cut) => ({ id: cut.id, label: formatSequenceCutLabel(project, cut) })),
    [project]
  );
  const overlayCutOptions = useMemo(
    () => project.cutCandidates
      .filter((cut) => getAssetById(project, cut.assetId)?.assetRole === 'transition-overlay')
      .map((cut) => ({ id: cut.id, label: formatSequenceCutLabel(project, cut) })),
    [project]
  );
  const canRandomizeFoundry = Boolean(variant && variant.clips.length > 1 && transitionMaskAssets.length > 0);
  const canRandomizeOverlays = Boolean(variant && variant.clips.length > 0 && overlayAssets.length > 0);
  const variantSequence = useMemo(
    () => variant ? project.sequences.find((candidate) => candidate.id === variant.sequenceId) : undefined,
    [project.sequences, variant]
  );
  const selectedClip = useMemo(
    () => variant?.clips.find((clip) => clip.id === selectedClipId) ?? variant?.clips[0],
    [selectedClipId, variant?.clips]
  );
  const selectedClipIndex = selectedClip && variant ? variant.clips.findIndex((clip) => clip.id === selectedClip.id) : -1;
  const canAuthorMaskTransition = Boolean(selectedClip && variant && selectedClipIndex >= 0 && selectedClipIndex < variant.clips.length - 1);
  const availableCuts = useMemo(() => {
    const existingCutIds = new Set((variant?.clips ?? []).map((clip) => clip.cutId).filter(Boolean));
    return project.cutCandidates
      .filter((cut) => {
        const assetRole = getAssetById(project, cut.assetId)?.assetRole;
        return cut.status !== 'rejected'
          && !existingCutIds.has(cut.id)
          && assetRole !== 'transition-mask'
          && assetRole !== 'transition-overlay';
      })
      .sort((left, right) => {
        const favoriteDelta = Number(Boolean(right.favorite || right.status === 'favorite')) - Number(Boolean(left.favorite || left.status === 'favorite'));
        return favoriteDelta
          || (right.sceneScore ?? 0) - (left.sceneScore ?? 0)
          || left.startMs - right.startMs
          || left.id.localeCompare(right.id);
      });
  }, [project, variant?.clips]);
  const canDeleteSequence = Boolean(variantSequence && variantSequence.variantIds.length > 1);
  const previewOutputPath = variant ? `${projectRoot}/.afterimage/preview/${variant.id}.mp4` : undefined;
  const previewJob = useMemo(
    () =>
      previewOutputPath
        ? allJobs
            .filter((job) => job.type === 'preview' && job.target === previewOutputPath)
            .sort((left, right) => (right.startedAt ?? '').localeCompare(left.startedAt ?? ''))[0]
        : undefined,
    [allJobs, previewOutputPath]
  );
  const previewBusy = previewJob?.status === 'queued' || previewJob?.status === 'running';
  const previewButtonLabel = previewJob?.status === 'queued'
    ? 'Queued…'
    : previewJob?.status === 'running'
      ? 'Rendering…'
      : 'Build Preview';

  useEffect(() => {
    if (!variant?.clips.length) {
      setSelectedClipId(undefined);
      return;
    }
    setSelectedClipId((current) => current && variant.clips.some((clip) => clip.id === current) ? current : variant.clips[0]?.id);
  }, [variant?.id, variant?.clips]);

  useEffect(() => {
    setSelectedAvailableCutId((current) => current && availableCuts.some((cut) => cut.id === current) ? current : availableCuts[0]?.id);
  }, [availableCuts]);

  const buildSequencePreview = () => {
    if (!variant || previewBusy) {
      return;
    }

    setPreviewPath(undefined);
    void api.jobs.runPreview({
      project,
      projectRoot,
      variantId: variant.id,
      outputPath: `${projectRoot}/.afterimage/preview/${variant.id}.mp4`
    });
  };

  const sequenceClipColumns = useMemo<ColDef<SequenceClip>[]>(() => [
    { headerName: '#', width: 70, valueGetter: ({ node }) => (node?.rowIndex ?? 0) + 1 },
    {
      field: 'id',
      headerName: 'Source',
      minWidth: 230,
      flex: 1.3,
      cellRenderer: ({ data }: { data?: SequenceClip }) => data ? (
        <div title={data.id}>
          <strong>{data.id}</strong>
          <div style={{ color: muted, fontSize: 11 }}>source {formatMillisecondsClock(data.sourceStartMs)} | timeline {formatMillisecondsClock(data.timelineStartMs)}</div>
        </div>
      ) : null
    },
    { field: 'durationMs', headerName: 'Duration', width: 110, valueFormatter: ({ value }) => formatMillisecondsClock(Number(value)) },
    { field: 'transition', headerName: 'Transition', width: 122, cellRenderer: ({ value }: { value?: string }) => <span style={pillStyle(value === 'cut' ? 'default' : 'success')}>{value}</span> },
    {
      headerName: 'Overlay',
      minWidth: 160,
      valueGetter: ({ data }) => {
        if (!data?.overlayAssetId) {
          return 'none';
        }
        return data.overlayCutId
          ? (overlayCutOptions.find((cut) => cut.id === data.overlayCutId)?.label ?? data.overlayCutId)
          : (overlayOptions.find((asset) => asset.id === data.overlayAssetId)?.label ?? data.overlayAssetId);
      }
    },
    {
      headerName: 'Actions',
      width: 236,
      sortable: false,
      cellRenderer: ({ data }: { data?: SequenceClip }) => data && variant ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <ToolbarButton onClick={() => moveClipAction(variant.id, data.id, -1)} style={{ padding: '5px 7px' }}>Up</ToolbarButton>
          <ToolbarButton onClick={() => moveClipAction(variant.id, data.id, 1)} style={{ padding: '5px 7px' }}>Down</ToolbarButton>
          <ToolbarButton onClick={() => trimClipAction(variant.id, data.id, -250)} style={{ padding: '5px 7px' }}>[</ToolbarButton>
          <ToolbarButton onClick={() => trimClipAction(variant.id, data.id, 250)} style={{ padding: '5px 7px' }}>]</ToolbarButton>
          <ToolbarButton onClick={() => removeClipAction(variant.id, data.id)} style={{ padding: '5px 7px' }}>Remove</ToolbarButton>
        </div>
      ) : null
    }
  ], [moveClipAction, overlayCutOptions, overlayOptions, removeClipAction, trimClipAction, variant]);

  const handleSequenceAction = (action: StudioGridAction, clip: SequenceClip) => {
    if (!variant) {
      return;
    }
    setSelectedClipId(clip.id);
    if (action === 'move-down') {
      moveClipAction(variant.id, clip.id, 1);
      return;
    }
    if (action === 'move-up') {
      moveClipAction(variant.id, clip.id, -1);
      return;
    }
    if (action === 'remove') {
      removeClipAction(variant.id, clip.id);
      return;
    }
    if (action === 'play') {
      buildSequencePreview();
    }
  };

  const addSelectedAvailableCut = () => {
    if (!variant || !selectedAvailableCutId) {
      return;
    }
    addCutToSequenceAction(selectedAvailableCutId, { sequenceId: variant.sequenceId, variantId: variant.id });
  };

  const updateSelectedTransition = (transition: TransitionStyle) => {
    if (!variant || !selectedClip) {
      return;
    }
    if (transition === 'mask' && !canAuthorMaskTransition) {
      return;
    }
    setClipTransitionAction(variant.id, selectedClip.id, transition);
  };

  const selectControlStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 7,
    color: '#f6f7f9',
    padding: '8px 10px',
    minHeight: 36
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(360px, 0.9fr)', gap: 16, alignItems: 'stretch', height: '100%', minHeight: 0 }}>
      <Panel title="Sequence Builder" bodyStyle={{ display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr)', minHeight: 0 }}>
        <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {project.variants.map((candidate, index) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => selectVariant(candidate.id)}
                  style={{
                    border: candidate.id === variant?.id ? '1px solid #88a0bf' : '1px solid #41495b',
                    background: candidate.id === variant?.id ? 'linear-gradient(135deg, #9db1ca, #7285a6)' : 'rgba(255,255,255,0.05)',
                    color: candidate.id === variant?.id ? '#0d1118' : '#f6f7f9',
                    borderRadius: 7,
                    padding: '9px 14px',
                    fontWeight: 700
                  }}
                >
                  {formatSequenceName(candidate.name, index)}
                </button>
              ))}
            </div>
            <ToolbarButton
              primary
              disabled={!variant || previewBusy}
              onClick={buildSequencePreview}
            >
              {previewButtonLabel}
            </ToolbarButton>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ToolbarButton onClick={() => variant && buildVariantFromReviewedCutsAction(variant.id, 'tight')}>Rebuild Tight</ToolbarButton>
            <ToolbarButton onClick={() => variant && buildVariantFromReviewedCutsAction(variant.id, 'balanced')}>Rebuild</ToolbarButton>
            <ToolbarButton onClick={() => variant && buildVariantFromReviewedCutsAction(variant.id, 'longer')}>Rebuild Longer</ToolbarButton>
            <ToolbarButton onClick={() => variant && buildNewVariantFromReviewedCutsAction(variant.id, 'balanced')}>New Sequence</ToolbarButton>
            <ToolbarButton onClick={() => variant && duplicateVariantAction(variant.id)}>Duplicate Sequence</ToolbarButton>
            <ToolbarButton disabled={!canDeleteSequence} onClick={() => variant && deleteVariantAction(variant.id)}>Delete Sequence</ToolbarButton>
            <ToolbarButton disabled={!canRandomizeFoundry} onClick={() => variant && randomizeFoundryTransitionsAction(variant.id)}>Shuffle Transitions</ToolbarButton>
            <ToolbarButton disabled={!canRandomizeOverlays} onClick={() => variant && randomizeFoundryOverlaysAction(variant.id)}>Shuffle Overlays</ToolbarButton>
            <ToolbarButton onClick={() => variant && addMarkerAction(variant.id, `Marker ${Date.now() % 1000}`, 500)}>Add Marker</ToolbarButton>
            <ToolbarButton onClick={() => variant && addSectionAction(variant.id, `Section ${Date.now() % 1000}`, 0, 1500)}>Add Section</ToolbarButton>
          </div>
        </div>
        <div style={{ display: 'grid', minHeight: 0 }}>
          <div style={{ display: 'grid', gridTemplateRows: 'minmax(210px, 1fr) auto', gap: 12, minHeight: 0 }}>
            <StudioDataGrid
              rows={variant?.clips ?? []}
              columns={sequenceClipColumns}
              focusedRowId={selectedClipId}
              onFocusRow={(clip) => setSelectedClipId(clip.id)}
              onRowOpen={(clip) => setSelectedClipId(clip.id)}
              onAction={handleSequenceAction}
              rowHeight={54}
              emptyMessage="No sequence clips"
            />
            <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 12, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Available Cuts</div>
                  <div style={{ color: muted, fontSize: 12 }}>{availableCuts.length} cut{availableCuts.length === 1 ? '' : 's'} ready to add</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <ToolbarButton primary disabled={!variant || !selectedAvailableCutId} onClick={addSelectedAvailableCut}>Add Cut</ToolbarButton>
                  <ToolbarButton onClick={() => setCurrentTab('cuts')}>Open Cut Review</ToolbarButton>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, maxHeight: 138, overflow: 'auto' }}>
                {availableCuts.length > 0 ? availableCuts.slice(0, 24).map((cut) => (
                  <button
                    key={cut.id}
                    type="button"
                    onClick={() => setSelectedAvailableCutId(cut.id)}
                    style={{
                      textAlign: 'left',
                      border: cut.id === selectedAvailableCutId ? '1px solid #88a0bf' : '1px solid rgba(255,255,255,0.1)',
                      background: cut.id === selectedAvailableCutId ? 'rgba(136,160,191,0.18)' : 'rgba(255,255,255,0.04)',
                      color: '#f6f7f9',
                      borderRadius: 7,
                      padding: 10,
                      minWidth: 0
                    }}
                  >
                    <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cut.id}</span>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: muted, fontSize: 12 }}>
                      <span>{formatMillisecondsClock(cut.durationMs)}</span>
                      <span>{typeof cut.sceneScore === 'number' ? `score ${cut.sceneScore.toFixed(2)}` : formatMillisecondsClock(cut.startMs)}</span>
                    </span>
                  </button>
                )) : (
                  <div style={{ color: muted, fontSize: 13 }}>No reviewed cuts are available for this sequence.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Preview" bodyStyle={{ minHeight: 0 }}>
        <div style={{ marginBottom: 12, color: muted }}>Low-resolution cached preview. Timing is authoritative; image quality is not final render quality.</div>
        {previewPath ? (
          <video
            key={previewPath}
            controls
            src={toMediaSrc(previewPath)}
            style={{ width: '100%', borderRadius: 18, background: '#090a0d', aspectRatio: '16 / 9' }}
          />
        ) : (
          <div style={{ border: '1px dashed rgba(255,255,255,0.16)', borderRadius: 18, minHeight: 220, display: 'grid', placeItems: 'center', color: muted }}>
            Build a preview cache to audition the current sequence.
          </div>
        )}
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 12, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <strong>Clip Styling</strong>
              <span style={{ color: muted, fontSize: 12 }}>{selectedClip ? selectedClip.id : 'select a clip'}</span>
            </div>
            <label style={{ display: 'grid', gap: 5, color: muted, fontSize: 12 }}>
              Overlay Cut
              <select
                disabled={!variant || !selectedClip}
                value={selectedClip?.overlayCutId ?? ''}
                onChange={(event) => variant && selectedClip && setClipOverlayCutAction(variant.id, selectedClip.id, event.currentTarget.value || undefined)}
                style={selectControlStyle}
              >
                <option value="">None</option>
                {overlayCutOptions.map((cut) => (
                  <option key={cut.id} value={cut.id}>{cut.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5, color: muted, fontSize: 12 }}>
              Overlay Asset
              <select
                disabled={!variant || !selectedClip}
                value={selectedClip?.overlayAssetId ?? ''}
                onChange={(event) => variant && selectedClip && setClipOverlayAssetAction(variant.id, selectedClip.id, event.currentTarget.value || undefined)}
                style={selectControlStyle}
              >
                <option value="">None</option>
                {overlayOptions.map((asset) => (
                  <option key={asset.id} value={asset.id}>{asset.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5, color: muted, fontSize: 12 }}>
              Transition
              <select
                disabled={!variant || !selectedClip}
                value={selectedClip?.transition ?? 'cut'}
                onChange={(event) => updateSelectedTransition(event.currentTarget.value as TransitionStyle)}
                style={selectControlStyle}
              >
                <option value="cut">Cut</option>
                <option value="mask" disabled={!canAuthorMaskTransition}>Mask</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5, color: muted, fontSize: 12 }}>
              Transition Cut
              <select
                disabled={!variant || !selectedClip || selectedClip.transition !== 'mask'}
                value={selectedClip?.transitionCutId ?? ''}
                onChange={(event) => variant && selectedClip && setClipTransitionCutAction(variant.id, selectedClip.id, event.currentTarget.value || undefined)}
                style={selectControlStyle}
              >
                <option value="">None</option>
                {transitionCutOptions.map((cut) => (
                  <option key={cut.id} value={cut.id}>{cut.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5, color: muted, fontSize: 12 }}>
              Transition Mask Asset
              <select
                disabled={!variant || !selectedClip || selectedClip.transition !== 'mask'}
                value={selectedClip?.transitionAssetId ?? ''}
                onChange={(event) => variant && selectedClip && setClipTransitionAssetAction(variant.id, selectedClip.id, event.currentTarget.value || undefined)}
                style={selectControlStyle}
              >
                <option value="">None</option>
                {transitionMaskAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>{formatSequenceAssetLabel(asset)}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5, color: muted, fontSize: 12 }}>
              Transition Overlay Cut
              <select
                disabled={!variant || !selectedClip || selectedClip.transition !== 'mask'}
                value={selectedClip?.transitionOverlayCutId ?? ''}
                onChange={(event) => variant && selectedClip && setClipTransitionOverlayCutAction(variant.id, selectedClip.id, event.currentTarget.value || undefined)}
                style={selectControlStyle}
              >
                <option value="">None</option>
                {overlayCutOptions.map((cut) => (
                  <option key={cut.id} value={cut.id}>{cut.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5, color: muted, fontSize: 12 }}>
              Transition Overlay Asset
              <select
                disabled={!variant || !selectedClip || selectedClip.transition !== 'mask'}
                value={selectedClip?.transitionOverlayAssetId ?? ''}
                onChange={(event) => variant && selectedClip && setClipTransitionOverlayAssetAction(variant.id, selectedClip.id, event.currentTarget.value || undefined)}
                style={selectControlStyle}
              >
                <option value="">None</option>
                {overlayOptions.map((asset) => (
                  <option key={asset.id} value={asset.id}>{asset.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 5, color: muted, fontSize: 12 }}>
              Duration
              <input
                disabled={!variant || !selectedClip || selectedClip.transition !== 'mask'}
                type="number"
                min={100}
                step={50}
                value={selectedClip?.transitionDurationMs ?? 600}
                onChange={(event) => variant && selectedClip && setClipTransitionDurationAction(variant.id, selectedClip.id, Number(event.currentTarget.value))}
                style={selectControlStyle}
              />
            </label>
          </div>
          {(variant?.markers ?? []).map((marker) => (
            <div key={marker.id} style={{ color: '#f6f7f9' }}>{marker.label} at {marker.timeMs}ms</div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
