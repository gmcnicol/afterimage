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

export function AutomationView() {
  const project = useProjectSessionStore((state) => state.project);
  const selectedVariantId = useUiStore((state) => state.selectedVariantId);
  const selectedFilterId = useUiStore((state) => state.selectedFilterId);
  const addLane = useProjectSessionStore((state) => state.addAutomationLane);
  const removeLane = useProjectSessionStore((state) => state.removeAutomationLane);
  const changeLaneTarget = useProjectSessionStore((state) => state.updateAutomationLaneTarget);
  const setLaneEnabled = useProjectSessionStore((state) => state.setAutomationLaneEnabled);
  const addKeyframe = useProjectSessionStore((state) => state.addLaneKeyframe);
  const updateKeyframe = useProjectSessionStore((state) => state.updateLaneKeyframe);
  const removeKeyframe = useProjectSessionStore((state) => state.removeLaneKeyframe);
  const resetLane = useProjectSessionStore((state) => state.resetLane);
  const [selectedLaneId, setSelectedLaneId] = useState<string>();
  const stack = useMemo(() => getStackForCurrentVariant(project, selectedVariantId), [project, selectedVariantId]);
  const stackFilters = stack?.filters ?? [];
  const targetFilter = stackFilters.find((filter) => filter.id === selectedFilterId) ?? stackFilters[0];
  const targetProperties = getSupportedAutomationProperties(targetFilter?.type ?? '');
  const variant = useMemo(() => getCurrentVariant(project, selectedVariantId), [project, selectedVariantId]);
  const durationMs = useMemo(
    () => Math.max(...(variant?.clips.map((clip) => clip.timelineStartMs + clip.durationMs) ?? [0]), 1),
    [variant]
  );
  const selectedLane = project.automationLanes.find((lane) => lane.id === selectedLaneId) ?? project.automationLanes[0];
  const laneColumns = useMemo<ColDef<(typeof project.automationLanes)[number]>[]>(() => [
    { field: 'name', headerName: 'Lane', minWidth: 170, cellRenderer: ({ value }: { value?: string }) => <strong>{value}</strong> },
    { headerName: 'Target', minWidth: 190, valueGetter: ({ data }) => data ? `${data.target.filterId} -> ${data.target.property}` : '' },
    { field: 'enabled', headerName: 'State', width: 100, cellRenderer: ({ value }: { value?: boolean }) => <span style={pillStyle(value === false ? 'default' : 'success')}>{value === false ? 'bypassed' : 'enabled'}</span> },
    { headerName: 'Keyframes', width: 110, valueGetter: ({ data }) => data?.keyframes.length ?? 0 },
    {
      headerName: 'Actions',
      width: 220,
      sortable: false,
      cellRenderer: ({ data }: { data?: (typeof project.automationLanes)[number] }) => data ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <ToolbarButton onClick={() => setLaneEnabled(data.id, !(data.enabled ?? true))} style={{ padding: '5px 7px' }}>{data.enabled === false ? 'Enable' : 'Bypass'}</ToolbarButton>
          <ToolbarButton onClick={() => addKeyframe(data.id, data.keyframes.length > 0 ? data.keyframes[data.keyframes.length - 1].timeMs + 500 : 500, 0.8)} style={{ padding: '5px 7px' }}>Add Keyframe</ToolbarButton>
          <ToolbarButton onClick={() => removeLane(data.id)} style={{ padding: '5px 7px' }}>Remove</ToolbarButton>
        </div>
      ) : null
    }
  ], [addKeyframe, project.automationLanes, removeLane, setLaneEnabled]);

  return (
    <div style={{ display: 'grid', gap: 16, height: '100%', minHeight: 0 }}>
      <Panel title="Automation" bodyStyle={{ display: 'grid', gridTemplateRows: 'auto 220px minmax(0, 1fr)', gap: 12, minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <ToolbarButton
            primary
            onClick={() => targetFilter && addLane(targetFilter.id, targetProperties[0] ?? 'mix', `Lane ${project.automationLanes.length + 1}`)}
            disabled={!targetFilter}
          >
            Add Lane
          </ToolbarButton>
        </div>
        <StudioDataGrid
          rows={project.automationLanes}
          columns={laneColumns}
          focusedRowId={selectedLane?.id}
          onFocusRow={(lane) => setSelectedLaneId(lane.id)}
          onRowOpen={(lane) => setSelectedLaneId(lane.id)}
          rowHeight={48}
          emptyMessage="No automation lanes"
        />
        <div className="studio-scrollable" style={{ display: 'grid', gap: 12, minHeight: 0 }}>
          {project.automationLanes.map((lane) => {
            const laneFilter = stackFilters.find((filter) => filter.id === lane.target.filterId) ?? stackFilters[0];
            const laneProperties = getSupportedAutomationProperties(laneFilter?.type ?? '');
            return (
              <div key={lane.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <div>
                    <strong>{lane.name}</strong>
                    <div style={{ color: muted, fontSize: 13 }}>Target {lane.target.filterId} {'->'} {lane.target.property}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: muted }}>
                      <input
                        type="checkbox"
                        checked={lane.enabled ?? true}
                        onChange={(event) => setLaneEnabled(lane.id, event.target.checked)}
                      />
                      Enabled
                    </label>
                    <ToolbarButton onClick={() => addKeyframe(lane.id, lane.keyframes.length > 0 ? lane.keyframes[lane.keyframes.length - 1].timeMs + 500 : 500, 0.8)}>
                      Add Keyframe
                    </ToolbarButton>
                    <ToolbarButton onClick={() => resetLane(lane.id)}>Reset</ToolbarButton>
                    <ToolbarButton onClick={() => removeLane(lane.id)}>Remove</ToolbarButton>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: muted, fontSize: 13 }}>Filter</span>
                    <select
                      value={lane.target.filterId}
                      onChange={(event) => changeLaneTarget(lane.id, event.target.value, lane.target.property)}
                      style={{ borderRadius: 12, padding: '10px 12px', background: 'rgba(13, 16, 22, 0.92)', color: '#f6f7f9', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      {stackFilters.map((filter) => (
                        <option key={filter.id} value={filter.id}>{getFilterDefinition(filter.type)?.label ?? filter.type}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: muted, fontSize: 13 }}>Property</span>
                    <select
                      value={lane.target.property}
                      onChange={(event) => changeLaneTarget(lane.id, lane.target.filterId, event.target.value as AutomationTargetProperty)}
                      style={{ borderRadius: 12, padding: '10px 12px', background: 'rgba(13, 16, 22, 0.92)', color: '#f6f7f9', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      {laneProperties.map((property) => (
                        <option key={property} value={property}>{formatParameterLabel(property)}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div style={{ marginTop: 12 }}>
                  {renderTimeline(durationMs, lane.keyframes.map((keyframe) => ({
                    id: keyframe.id,
                    timeMs: keyframe.timeMs,
                    kind: 'accent',
                    strength: keyframe.value
                  })))}
                </div>
                <div style={{ marginTop: 12 }}>
                  <AutomationLaneTimeline
                    durationMs={durationMs}
                    keyframes={lane.keyframes}
                    propertyLabel={formatParameterLabel(lane.target.property)}
                    onUpdate={(keyframeId, timeMs, value) => updateKeyframe(lane.id, keyframeId, timeMs, value)}
                  />
                </div>
                <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                  {lane.keyframes.map((keyframe) => (
                    <div key={keyframe.id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 88px', gap: 10, alignItems: 'center' }}>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={{ color: muted, fontSize: 12 }}>Time (ms)</span>
                        <input
                          type="number"
                          min={0}
                          max={durationMs}
                          step={50}
                          value={keyframe.timeMs}
                          onChange={(event) => updateKeyframe(lane.id, keyframe.id, Number(event.target.value), keyframe.value)}
                          style={{ borderRadius: 10, padding: '8px 10px', background: 'rgba(13, 16, 22, 0.92)', color: '#f6f7f9', border: '1px solid rgba(255,255,255,0.08)' }}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={{ color: muted, fontSize: 12 }}>{formatParameterLabel(lane.target.property)}</span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={keyframe.value}
                          onChange={(event) => updateKeyframe(lane.id, keyframe.id, keyframe.timeMs, Number(event.target.value))}
                        />
                      </label>
                      <ToolbarButton onClick={() => removeKeyframe(lane.id, keyframe.id)}>Delete</ToolbarButton>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

