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
  formatFilterInstanceLabel,
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

export function StyleView() {
  const project = useProjectSessionStore((state) => state.project);
  const selectedVariantId = useUiStore((state) => state.selectedVariantId);
  const selectedFilterId = useUiStore((state) => state.selectedFilterId);
  const selectFilter = useUiStore((state) => state.selectFilter);
  const addFilter = useProjectSessionStore((state) => state.addFilterToSequenceStack);
  const removeFilter = useProjectSessionStore((state) => state.removeFilterFromSequenceStack);
  const moveFilter = useProjectSessionStore((state) => state.moveFilterInSequenceStack);
  const toggleFilter = useProjectSessionStore((state) => state.toggleFilterEnabled);
  const setFilterMix = useProjectSessionStore((state) => state.updateFilterMix);
  const setFilterParameter = useProjectSessionStore((state) => state.updateFilterParameter);
  const applyPreset = useProjectSessionStore((state) => state.applyPresetToSequenceStack);
  const randomizeFilter = useProjectSessionStore((state) => state.safeRandomizeFilter);
  const randomizeStack = useProjectSessionStore((state) => state.safeRandomizeStack);
  const pendingFilterAddStackIdRef = useRef<string | undefined>(undefined);
  const stack = useMemo(() => getStackForCurrentVariant(project, selectedVariantId), [project, selectedVariantId]);
  const stackFilters = stack?.filters ?? [];
  const presets = useMemo(() => loadPresetLibrary().presets, []);
  const selectedFilter = useMemo(
    () => stackFilters.find((filter) => filter.id === selectedFilterId) ?? stackFilters[0],
    [selectedFilterId, stackFilters]
  );
  const selectedFilterDefinition = getFilterDefinition(selectedFilter?.type ?? '');
  const filterColumns = useMemo<ColDef<FilterInstance>[]>(() => [
    {
      field: 'type',
      headerName: 'Filter',
      width: 180,
      flex: 0,
      cellRenderer: ({ data }: { data?: FilterInstance }) => data ? <strong>{formatFilterInstanceLabel(data, stackFilters)}</strong> : null
    },
    { field: 'mix', headerName: 'Mix', width: 58, flex: 0, valueFormatter: ({ value }) => Number(value ?? 1).toFixed(2) },
    { field: 'enabled', headerName: 'On', width: 54, flex: 0, valueFormatter: ({ value }) => value === false ? 'off' : 'on' },
    {
      headerName: 'Actions',
      width: 300,
      flex: 0,
      sortable: false,
      cellRenderer: ({ data, node }: { data?: FilterInstance; node?: { rowIndex: number | null } }) => data && stack ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: '100%' }}>
          <ToolbarButton onClick={() => moveFilter(stack.id, data.id, -1)} disabled={(node?.rowIndex ?? 0) === 0} style={{ height: 24, minHeight: 24, padding: '0 7px', fontSize: 11 }}>Up</ToolbarButton>
          <ToolbarButton onClick={() => moveFilter(stack.id, data.id, 1)} disabled={(node?.rowIndex ?? 0) === stack.filters.length - 1} style={{ height: 24, minHeight: 24, padding: '0 7px', fontSize: 11 }}>Down</ToolbarButton>
          <ToolbarButton onClick={() => toggleFilter(stack.id, data.id)} style={{ height: 24, minHeight: 24, padding: '0 7px', fontSize: 11 }}>{data.enabled === false ? 'Enable' : 'Bypass'}</ToolbarButton>
          <ToolbarButton onClick={() => randomizeFilter(stack.id, data.id)} style={{ height: 24, minHeight: 24, padding: '0 7px', fontSize: 11 }}>Randomise</ToolbarButton>
          <ToolbarButton onClick={() => removeFilter(stack.id, data.id)} style={{ height: 24, minHeight: 24, padding: '0 7px', fontSize: 11 }}>Remove</ToolbarButton>
        </div>
      ) : null
    }
  ], [moveFilter, randomizeFilter, removeFilter, stack, stackFilters, toggleFilter]);
  const presetColumns = useMemo<ColDef<(typeof presets)[number]>[]>(() => [
    { field: 'name', headerName: 'Preset', width: 150, flex: 0, cellRenderer: ({ value }: { value?: string }) => <strong>{value}</strong> },
    { field: 'family', headerName: 'Family', width: 104, flex: 0, cellRenderer: ({ value }: { value?: string }) => <span style={pillStyle()}>{value}</span> },
    {
      headerName: 'Filters',
      width: 170,
      flex: 0,
      valueGetter: ({ data }) => data?.filters.map((filter) => getFilterDefinition(filter.type)?.label ?? filter.type).join(', ') ?? ''
    },
    {
      headerName: 'Action',
      width: 76,
      flex: 0,
      sortable: false,
      cellRenderer: ({ data }: { data?: (typeof presets)[number] }) => data ? <ToolbarButton onClick={() => applyPreset(data.id, stack?.id)} disabled={!stack} style={{ height: 24, minHeight: 24, padding: '0 8px', fontSize: 11 }}>Apply</ToolbarButton> : null
    }
  ], [applyPreset, presets, stack]);

  useEffect(() => {
    if (!stack || pendingFilterAddStackIdRef.current !== stack.id) {
      return;
    }

    const newestFilter = stack.filters[stack.filters.length - 1];
    if (newestFilter) {
      selectFilter(newestFilter.id);
      pendingFilterAddStackIdRef.current = undefined;
    }
  }, [selectFilter, stack]);

  const handleAddFilter = (filterType: SupportedFilterType) => {
    if (!stack) {
      return;
    }

    pendingFilterAddStackIdRef.current = stack.id;
    addFilter(filterType, stack.id);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(620px, 700px) minmax(300px, 360px) minmax(360px, 1fr)', gap: 16, height: '100%', minHeight: 0 }}>
      <Panel title="Style Stack" bodyStyle={{ display: 'grid', gridTemplateRows: 'auto auto minmax(220px, 1fr)', minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {supportedFilterDefinitions.map((definition) => (
            <ToolbarButton key={definition.type} primary={definition.type === 'contrast'} onClick={() => handleAddFilter(definition.type)} disabled={!stack}>
              Add {definition.label}
            </ToolbarButton>
          ))}
          <ToolbarButton onClick={() => stack && randomizeStack(stack.id)}>Randomise Stack</ToolbarButton>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '9px 0',
          marginBottom: 10,
          color: muted,
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: 0,
          fontWeight: 700
        }}>
          <span>Filters In Stack</span>
          <span>{stackFilters.length}</span>
        </div>
        <StudioDataGrid
          rows={stackFilters}
          columns={filterColumns}
          focusedRowId={selectedFilter?.id}
          onFocusRow={(filter) => selectFilter(filter.id)}
          onRowOpen={(filter) => selectFilter(filter.id)}
          rowHeight={36}
          headerHeight={32}
          emptyMessage="No filters in this stack"
        />
      </Panel>

      <Panel title="Filter Editor" bodyStyle={{ minHeight: 0 }}>
        {stack && selectedFilter && selectedFilterDefinition ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedFilterDefinition.label}</div>
              <div style={{ color: muted, fontSize: 13 }}>
                {formatFilterInstanceLabel(selectedFilter, stack.filters)} · Position {(selectedFilter.orderIndex ?? stack.filters.findIndex((filter) => filter.id === selectedFilter.id)) + 1}
              </div>
            </div>
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: muted, fontSize: 13 }}>Mix</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={Number(selectedFilter.mix ?? 1)}
                onChange={(event) => setFilterMix(stack.id, selectedFilter.id, Number(event.target.value))}
              />
              <span style={{ color: muted, fontSize: 12 }}>{Number(selectedFilter.mix ?? 1).toFixed(2)}</span>
            </label>
            {selectedFilterDefinition.parameters.map((parameter) => (
              <label key={parameter.key} style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: muted, fontSize: 13 }}>{parameter.label}</span>
                <input
                  type="range"
                  min={parameter.min}
                  max={parameter.max}
                  step={parameter.step}
                  value={Number(selectedFilter.parameters?.[parameter.key] ?? parameter.defaultValue)}
                  onChange={(event) => setFilterParameter(stack.id, selectedFilter.id, parameter.key, Number(event.target.value))}
                />
                <span style={{ color: muted, fontSize: 12 }}>
                  {Number(selectedFilter.parameters?.[parameter.key] ?? parameter.defaultValue).toFixed(2)}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <div style={{ color: muted }}>Select a supported filter to edit its authored parameters.</div>
        )}
      </Panel>

      <Panel title="Preset Families" bodyStyle={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr)', minHeight: 0 }}>
        <StudioDataGrid rows={presets} columns={presetColumns} rowHeight={36} headerHeight={32} emptyMessage="No presets available" />
      </Panel>
    </div>
  );
}
