import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table';
import { exportProfiles, type ExportProfileId } from '@afterimage/export-profiles';
import { loadPresetLibrary } from '@afterimage/preset-library';
import {
  getAssetById,
  getDefaultVariant,
  type AnalysisFile,
  type Marker,
  type NormalizedProjectFile,
  type SyncMode
} from '@afterimage/project-model';
import { Panel } from '@afterimage/ui';
import { getDesktopApi, type DesktopJob } from '../lib/desktop-api';
import { useDiagnosticsStore } from '../stores/diagnostics-store';
import { useJobsStore } from '../stores/jobs-store';
import { useProjectSessionStore } from '../stores/project-session-store';
import { useUiStore } from '../stores/ui-store';
import { accent, muted, pillStyle } from './styles';
import { getEnabledExportProfileIds, resolveProjectFilePath, toMediaSrc } from './utils';
import { JobRow } from './components/JobRow';
import { StatCard } from './components/StatCard';
import { ToolbarButton } from './components/ToolbarButton';
import { VirtualList } from './components/VirtualList';

function getCurrentVariant(project: NormalizedProjectFile, selectedVariantId?: string) {
  return project.variants.find((candidate) => candidate.id === (selectedVariantId ?? getDefaultVariant(project)?.id)) ?? project.variants[0];
}

function getAnalysisSummaryByAsset(project: NormalizedProjectFile, assetId: string) {
  return project.analysisRefs.find((ref) => ref.assetId === assetId)?.summary;
}

function useAnalysisFile(analysisPath?: string): AnalysisFile | null {
  const api = getDesktopApi();
  const [analysis, setAnalysis] = useState<AnalysisFile | null>(null);

  useEffect(() => {
    let active = true;

    if (!analysisPath) {
      setAnalysis(null);
      return () => {
        active = false;
      };
    }

    void api.project.loadAnalysis(analysisPath).then((result) => {
      if (active) {
        setAnalysis(result);
      }
    });

    return () => {
      active = false;
    };
  }, [analysisPath, api.project]);

  return analysis;
}

function buildSyncMarkers(syncEvents: Array<{ id: string; timeMs: number; kind: string; label?: string }>): Marker[] {
  return syncEvents.map((event, index) => ({
    id: `sync-marker-${event.id}`,
    timeMs: event.timeMs,
    label: event.label ?? `${event.kind} ${index + 1}`,
    kind: event.kind === 'beat' || event.kind === 'downbeat' ? 'beat' : 'marker'
  }));
}

function renderTimeline(durationMs: number, events: Array<{ id: string; timeMs: number; kind: string; strength?: number }>) {
  const safeDuration = Math.max(durationMs, 1);

  return (
    <div style={{ borderRadius: 18, border: '1px solid rgba(255,255,255,0.08)', padding: 16, background: 'rgba(11, 14, 19, 0.92)' }}>
      <div style={{ position: 'relative', height: 42, borderRadius: 999, background: 'linear-gradient(90deg, rgba(91, 137, 255, 0.16), rgba(244, 135, 98, 0.24))' }}>
        {events.map((event) => {
          const left = `${Math.min(100, (event.timeMs / safeDuration) * 100)}%`;
          const size = 10 + Math.round((event.strength ?? 0.4) * 8);
          return (
            <div
              key={event.id}
              title={`${event.kind} @ ${event.timeMs}ms`}
              style={{
                position: 'absolute',
                left,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: size,
                height: size,
                borderRadius: 999,
                background: event.kind === 'accent' ? '#ffd18a' : event.kind === 'silence-boundary' ? '#97b3ff' : accent,
                boxShadow: '0 0 0 2px rgba(10, 13, 18, 0.95)'
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: muted, fontSize: 12, marginTop: 10 }}>
        <span>0ms</span>
        <span>{safeDuration}ms</span>
      </div>
    </div>
  );
}

export function ProjectView() {
  const api = getDesktopApi();
  const project = useProjectSessionStore((state) => state.project);
  const projectFilePath = useProjectSessionStore((state) => state.projectFilePath);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot);
  const recentProjects = useProjectSessionStore((state) => state.recentProjects);
  const dirty = useProjectSessionStore((state) => state.dirty);
  const setSession = useProjectSessionStore((state) => state.setSession);
  const resolvedProjectFilePath = resolveProjectFilePath(projectFilePath, projectRoot, project.metadata.projectFileName);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Project Home">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <ToolbarButton primary onClick={() => void api.project.createProject().then((session) => session && setSession(session))}>New Project</ToolbarButton>
          <ToolbarButton onClick={() => void api.project.openProject().then((session) => session && setSession(session))}>Open Project</ToolbarButton>
          <ToolbarButton onClick={() => void api.project.saveProject({ project, projectFilePath: resolvedProjectFilePath }).then(setSession)}>Save</ToolbarButton>
          <ToolbarButton onClick={() => void api.project.saveProjectAs({ project, projectFilePath: resolvedProjectFilePath }).then((session) => session && setSession(session))}>Save As</ToolbarButton>
          <ToolbarButton onClick={() => void api.project.duplicateProject({ project, projectFilePath: resolvedProjectFilePath }).then((session) => session && setSession(session))}>Duplicate</ToolbarButton>
          <ToolbarButton onClick={() => resolvedProjectFilePath && void api.project.revealProjectFolder(resolvedProjectFilePath)}>Reveal Folder</ToolbarButton>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          <StatCard label="Project" value={project.name} />
          <StatCard label="Dirty State" value={dirty ? 'Unsaved changes' : 'Saved'} tone={dirty ? 'warn' : 'success'} />
          <StatCard label="Assets" value={String(project.assets.length)} />
          <StatCard label="Variants" value={String(project.variants.length)} />
        </div>
        <div style={{ marginTop: 18, color: muted, fontSize: 14 }}>
          <div>File: {resolvedProjectFilePath ?? 'Not saved yet'}</div>
          <div>Root: {projectRoot ?? 'Unknown'}</div>
          <div>Last saved: {project.metadata.updatedAt ?? 'Not saved yet'}</div>
        </div>
      </Panel>

      <Panel title="Recent Projects">
        <div style={{ display: 'grid', gap: 10 }}>
          {recentProjects.map((recentProject) => (
            <button
              key={recentProject}
              type="button"
              onClick={() => void api.project.openProjectAt(recentProject).then(setSession)}
              style={{
                textAlign: 'left',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#f6f7f9',
                padding: 14,
                borderRadius: 16
              }}
            >
              {recentProject}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function MediaView() {
  const api = getDesktopApi();
  const project = useProjectSessionStore((state) => state.project);
  const projectFilePath = useProjectSessionStore((state) => state.projectFilePath);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot);
  const mergeAssets = useProjectSessionStore((state) => state.mergeImportedAssets);
  const setSession = useProjectSessionStore((state) => state.setSession);
  const selectedAssetId = useUiStore((state) => state.selectedAssetId);
  const selectAsset = useUiStore((state) => state.selectAsset);
  const setCurrentTab = useUiStore((state) => state.setCurrentTab);
  const addNotification = useUiStore((state) => state.addNotification);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const resolvedProjectFilePath = resolveProjectFilePath(projectFilePath, projectRoot, project.metadata.projectFileName);
  const assets = useMemo(() => project.assets.filter((asset) =>
    `${asset.filename} ${(asset.tags ?? []).join(' ')}`.toLowerCase().includes(deferredQuery.toLowerCase())
  ), [deferredQuery, project.assets]);

  const importMedia = async () => {
    const imported = await api.project.importMedia(projectRoot);
    if (imported.length === 0) {
      addNotification('Media import cancelled.', 'warn');
      return;
    }
    mergeAssets(imported);
    if (resolvedProjectFilePath) {
      const session = await api.project.saveProject({
        project: useProjectSessionStore.getState().project,
        projectFilePath: resolvedProjectFilePath
      });
      setSession(session);
    }
    setCurrentTab('media');
    addNotification(
      resolvedProjectFilePath
        ? `Imported ${imported.length} media file${imported.length === 1 ? '' : 's'} and saved the project.`
        : `Imported ${imported.length} media file${imported.length === 1 ? '' : 's'}${projectRoot ? '.' : ' into an unsaved project.'}`,
      'success'
    );
  };

  const importMusic = async () => {
    const imported = await api.project.importMusic(projectRoot);
    if (imported.length === 0) {
      addNotification('Music import cancelled.', 'warn');
      return;
    }
    mergeAssets(imported);
    if (resolvedProjectFilePath) {
      const session = await api.project.saveProject({
        project: useProjectSessionStore.getState().project,
        projectFilePath: resolvedProjectFilePath
      });
      setSession(session);
    }
    setCurrentTab('music');
    addNotification(
      resolvedProjectFilePath
        ? `Imported ${imported.length} music file${imported.length === 1 ? '' : 's'} and saved the project.`
        : `Imported ${imported.length} music file${imported.length === 1 ? '' : 's'}${projectRoot ? '.' : ' into an unsaved project.'}`,
      'success'
    );
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Media Library">
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <ToolbarButton primary onClick={() => void importMedia()}>Import Media</ToolbarButton>
          <ToolbarButton onClick={() => void importMusic()}>Import Music</ToolbarButton>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by filename or tag"
            style={{
              flex: 1,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(13, 16, 22, 0.92)',
              color: '#f6f7f9',
              padding: '10px 14px'
            }}
          />
        </div>
        <VirtualList
          items={assets}
          estimateSize={94}
          renderItem={(asset) => (
            <button
              type="button"
              onClick={() => selectAsset(asset.id)}
              aria-pressed={selectedAssetId === asset.id}
              style={{
                width: '100%',
                textAlign: 'left',
                background: selectedAssetId === asset.id
                  ? 'linear-gradient(135deg, rgba(244, 135, 98, 0.18), rgba(255,255,255,0.05))'
                  : 'rgba(255,255,255,0.03)',
                border: selectedAssetId === asset.id
                  ? '1px solid rgba(255, 159, 127, 0.55)'
                  : '1px solid rgba(255,255,255,0.08)',
                boxShadow: selectedAssetId === asset.id
                  ? '0 0 0 1px rgba(244, 135, 98, 0.18) inset'
                  : 'none',
                color: '#f6f7f9',
                borderRadius: 16,
                padding: 14
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{asset.label ?? asset.filename}</div>
                  <div style={{ color: muted, fontSize: 13 }}>{asset.path.absolutePath}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={pillStyle()}>{asset.mediaType}</span>
                  <span style={pillStyle(asset.analysisStatus === 'completed' ? 'success' : 'warn')}>{asset.analysisStatus}</span>
                </div>
              </div>
            </button>
          )}
        />
      </Panel>
    </div>
  );
}

interface AnalysisAssetRow {
  id: string;
  label: string;
  mediaType: string;
  analysisStatus: string;
  durationMs: number;
  sidecarCount: number;
  changeEventCount: number;
  syncEventCount: number;
  path: string;
}

export function AnalysisView() {
  const api = getDesktopApi();
  const project = useProjectSessionStore((state) => state.project);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot) ?? '.';
  const addNotification = useUiStore((state) => state.addNotification);
  const allJobs = useJobsStore((state) => state.jobs);
  const [launchLocked, setLaunchLocked] = useState(false);
  const [checkedAssetIds, setCheckedAssetIds] = useState<string[]>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'label', desc: false }]);
  const selectionAnchorIdRef = useRef<string | undefined>(undefined);
  const jobs = useMemo(() => {
    const rank = (job: DesktopJob) => {
      if (job.status === 'running') return 0;
      if (job.status === 'queued') return 1;
      if (job.status === 'failed') return 2;
      if (job.status === 'cancelled') return 3;
      return 4;
    };
    const recency = (job: DesktopJob) => Date.parse(job.endedAt ?? job.startedAt ?? '') || 0;
    const sorted = allJobs
      .filter((job) => job.type === 'analysis')
      .sort((left, right) => rank(left) - rank(right) || recency(right) - recency(left) || right.id.localeCompare(left.id));

    const seen = new Set<string>();
    return sorted.filter((job) => {
      const key = `${job.type}:${job.target}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [allJobs]);
  const visibleJobs = useMemo(() => jobs.filter((job) => job.status !== 'completed'), [jobs]);
  const activeAnalysisJob = jobs.find((job) => job.status === 'queued' || job.status === 'running');
  const processingAnalysis = Boolean(activeAnalysisJob) || launchLocked;
  const sidecarCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ref of project.analysisRefs) {
      counts.set(ref.assetId, (counts.get(ref.assetId) ?? 0) + 1);
    }
    return counts;
  }, [project.analysisRefs]);
  const analysisRows = useMemo<AnalysisAssetRow[]>(() => project.assets
    .filter((asset) => asset.mediaType !== 'image')
    .map((asset) => {
      const summary = getAnalysisSummaryByAsset(project, asset.id);
      return {
        id: asset.id,
        label: asset.label ?? asset.filename,
        mediaType: asset.mediaType,
        analysisStatus: asset.analysisStatus ?? 'pending',
        durationMs: asset.durationMs ?? 0,
        sidecarCount: sidecarCounts.get(asset.id) ?? 0,
        changeEventCount: summary?.changeEventCount ?? 0,
        syncEventCount: summary?.syncEventCount ?? 0,
        path: asset.path.absolutePath
      };
    }), [project, sidecarCounts]);
  const allAnalyzableAssetIds = useMemo(() => analysisRows.map((row) => row.id), [analysisRows]);

  useEffect(() => {
    setCheckedAssetIds((current) => {
      const valid = current.filter((assetId) => allAnalyzableAssetIds.includes(assetId));
      return valid.length > 0 ? valid : allAnalyzableAssetIds;
    });
  }, [allAnalyzableAssetIds]);

  const updateCheckedSelection = (assetId: string, modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => {
    if (!allAnalyzableAssetIds.includes(assetId)) {
      return;
    }

    const additive = Boolean(modifiers?.metaKey || modifiers?.ctrlKey);
    const ranged = Boolean(modifiers?.shiftKey);

    setCheckedAssetIds((current) => {
      if (ranged) {
        const anchorId = selectionAnchorIdRef.current ?? assetId;
        const anchorIndex = allAnalyzableAssetIds.indexOf(anchorId);
        const targetIndex = allAnalyzableAssetIds.indexOf(assetId);
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        const range = allAnalyzableAssetIds.slice(start, end + 1);
        selectionAnchorIdRef.current = assetId;
        return additive ? Array.from(new Set([...current, ...range])) : range;
      }

      selectionAnchorIdRef.current = assetId;
      if (additive) {
        return current.includes(assetId)
          ? current.filter((candidate) => candidate !== assetId)
          : [...current, assetId];
      }

      return [assetId];
    });
  };

  const toggleCheckedAsset = (assetId: string, modifiers?: { shiftKey?: boolean }) => {
    if (!allAnalyzableAssetIds.includes(assetId)) {
      return;
    }

    setCheckedAssetIds((current) => {
      if (modifiers?.shiftKey) {
        const anchorId = selectionAnchorIdRef.current ?? assetId;
        const anchorIndex = allAnalyzableAssetIds.indexOf(anchorId);
        const targetIndex = allAnalyzableAssetIds.indexOf(assetId);
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        const range = allAnalyzableAssetIds.slice(start, end + 1);
        selectionAnchorIdRef.current = assetId;
        return Array.from(new Set([...current, ...range]));
      }

      selectionAnchorIdRef.current = assetId;
      return current.includes(assetId)
        ? current.filter((candidate) => candidate !== assetId)
        : [...current, assetId];
    });
  };

  const columns = useMemo<ColumnDef<AnalysisAssetRow>[]>(() => [
    {
      id: 'select',
      header: () => (
        <input
          type="checkbox"
          checked={allAnalyzableAssetIds.length > 0 && checkedAssetIds.length === allAnalyzableAssetIds.length}
          ref={(element) => {
            if (element) {
              element.indeterminate = checkedAssetIds.length > 0 && checkedAssetIds.length < allAnalyzableAssetIds.length;
            }
          }}
          onChange={(event) => {
            setCheckedAssetIds(event.target.checked ? allAnalyzableAssetIds : []);
          }}
          style={{ width: 16, height: 16 }}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={checkedAssetIds.includes(row.original.id)}
          onClick={(event) => {
            event.stopPropagation();
            toggleCheckedAsset(row.original.id, event);
          }}
          readOnly
          style={{ width: 16, height: 16 }}
        />
      ),
      size: 36,
      enableSorting: false
    },
    {
      accessorKey: 'label',
      header: 'Asset',
      cell: ({ row }) => (
        <div>
          <div style={{ fontWeight: 700 }}>{row.original.label}</div>
          <div style={{ color: muted, fontSize: 12 }}>{row.original.path}</div>
        </div>
      )
    },
    {
      accessorKey: 'mediaType',
      header: 'Type',
      cell: ({ getValue }) => <span style={pillStyle()}>{String(getValue())}</span>,
      size: 90
    },
    {
      accessorKey: 'analysisStatus',
      header: 'Status',
      cell: ({ getValue }) => {
        const status = String(getValue());
        return <span style={pillStyle(status === 'completed' ? 'success' : 'warn')}>{status}</span>;
      },
      size: 110
    },
    {
      accessorKey: 'changeEventCount',
      header: 'Changes',
      size: 90
    },
    {
      accessorKey: 'syncEventCount',
      header: 'Sync',
      size: 80
    },
    {
      accessorKey: 'durationMs',
      header: 'Duration',
      cell: ({ getValue }) => {
        const durationMs = Number(getValue());
        return <span style={{ color: muted }}>{durationMs > 0 ? `${durationMs}ms` : 'unknown'}</span>;
      },
      size: 120
    }
  ], [allAnalyzableAssetIds, checkedAssetIds]);

  const table = useReactTable({
    data: analysisRows,
    columns,
    state: {
      sorting
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const runAnalysis = async (assetIds: string[], mode: 'all' | 'selected') => {
    if (processingAnalysis || assetIds.length === 0) {
      return;
    }

    setLaunchLocked(true);
    const queuedJobs = await api.jobs.runAnalysis({ project, projectRoot, assetIds });
    const job = queuedJobs[0];

    if (job?.status === 'queued' || job?.status === 'running') {
      addNotification(activeAnalysisJob
        ? 'Analysis is already running. Cancel the active job before starting another.'
        : `Queued ${mode === 'all' ? 'full' : 'selected'} analysis for ${assetIds.length} asset${assetIds.length === 1 ? '' : 's'}.`,
      activeAnalysisJob ? 'warn' : 'success',
      activeAnalysisJob ? 3200 : 1800);
    }

    window.setTimeout(() => {
      setLaunchLocked(false);
    }, 500);
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Analysis Jobs">
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <ToolbarButton primary onClick={() => void runAnalysis(allAnalyzableAssetIds, 'all')} disabled={processingAnalysis || allAnalyzableAssetIds.length === 0}>
            {processingAnalysis ? 'Processing…' : 'Analyse All'}
          </ToolbarButton>
          <ToolbarButton onClick={() => void runAnalysis(checkedAssetIds, 'selected')} disabled={processingAnalysis || checkedAssetIds.length === 0}>
            {processingAnalysis ? 'Processing…' : 'Analyse Checked'}
          </ToolbarButton>
          <ToolbarButton onClick={() => setCheckedAssetIds(allAnalyzableAssetIds)} disabled={processingAnalysis || allAnalyzableAssetIds.length === 0}>
            Select All
          </ToolbarButton>
          <ToolbarButton onClick={() => setCheckedAssetIds([])} disabled={processingAnalysis || checkedAssetIds.length === 0}>
            Clear
          </ToolbarButton>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {visibleJobs.length > 0 ? visibleJobs.map((job) => (
            <JobRow key={job.id} job={job} />
          )) : (
            <div style={{ color: muted }}>No active analysis jobs.</div>
          )}
        </div>
      </Panel>
      <Panel title="Analysis">
        <div style={{
          overflow: 'auto',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 18,
          background: 'rgba(15, 18, 24, 0.88)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'rgba(10, 13, 18, 0.98)' }}>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                      style={{
                        padding: '12px 14px',
                        textAlign: 'left',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                        color: muted,
                        fontSize: 12,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        cursor: header.column.getCanSort() ? 'pointer' : 'default',
                        width: header.getSize() > 0 ? header.getSize() : undefined
                      }}
                    >
                      {header.isPlaceholder ? null : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{
                            asc: '↑',
                            desc: '↓'
                          }[header.column.getIsSorted() as string] ?? null}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const checked = checkedAssetIds.includes(row.original.id);

                return (
                  <tr
                    key={row.id}
                    onClick={(event) => updateCheckedSelection(row.original.id, event)}
                    style={{
                      background: checked ? 'rgba(244, 135, 98, 0.12)' : 'transparent',
                      boxShadow: checked ? 'inset 2px 0 0 #f48762' : 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        style={{
                          padding: '12px 14px',
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                          verticalAlign: 'top',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

export function CutsView() {
  const project = useProjectSessionStore((state) => state.project);
  const selectCut = useUiStore((state) => state.selectCut);
  const addCutToSequence = useProjectSessionStore((state) => state.addCutToSequence);
  const updateCutStatus = useProjectSessionStore((state) => state.updateCutStatus);
  const toggleCutFavorite = useProjectSessionStore((state) => state.toggleCutFavorite);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const cuts = useMemo(() => project.cutCandidates.filter((cut) =>
    `${cut.id} ${(cut.tags ?? []).join(' ')}`.toLowerCase().includes(deferredQuery.toLowerCase())
  ), [deferredQuery, project.cutCandidates]);
  const assetLabels = useMemo(() => new Map(project.assets.map((asset) => [asset.id, asset.label ?? asset.filename])), [project.assets]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Cut Browser">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter cuts by id or tag"
          style={{
            width: '100%',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(13, 16, 22, 0.92)',
            color: '#f6f7f9',
            padding: '10px 14px',
            marginBottom: 16
          }}
        />
        <VirtualList
          items={cuts}
          estimateSize={176}
          renderItem={(cut) => (
            <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14, background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '160px minmax(0, 1fr)', gap: 14 }}>
                <button
                  type="button"
                  onClick={() => selectCut(cut.id)}
                  style={{
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(10, 12, 18, 0.92)',
                    borderRadius: 14,
                    padding: 0,
                    overflow: 'hidden',
                    aspectRatio: '16 / 9'
                  }}
                >
                  {cut.thumbnailPath ? (
                    <img
                      src={toMediaSrc(cut.thumbnailPath)}
                      alt={cut.id}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: muted, fontSize: 12 }}>
                      No thumbnail
                    </div>
                  )}
                </button>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <button type="button" onClick={() => selectCut(cut.id)} style={{ background: 'transparent', border: 'none', color: '#f6f7f9', textAlign: 'left', padding: 0, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{cut.id}</div>
                      <div style={{ color: muted, fontSize: 13 }}>{assetLabels.get(cut.assetId) ?? cut.assetId}</div>
                    </button>
                    <span style={pillStyle(cut.favorite ? 'success' : 'default')}>{cut.status}</span>
                  </div>
                  <div style={{ color: muted, fontSize: 13, marginTop: 8 }}>
                    {cut.startMs}ms {'->'} {cut.endMs}ms • {cut.durationMs}ms
                  </div>
                  <div style={{ color: muted, fontSize: 13, marginTop: 4 }}>
                    {cut.sceneScore !== undefined ? `scene score ${cut.sceneScore.toFixed(3)}` : 'no scene score'}{cut.thumbnailPath ? ' • thumbnail ready' : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <ToolbarButton onClick={() => addCutToSequence(cut.id)}>Add</ToolbarButton>
                <ToolbarButton onClick={() => updateCutStatus(cut.id, 'kept')}>Keep</ToolbarButton>
                <ToolbarButton onClick={() => updateCutStatus(cut.id, 'rejected')}>Reject</ToolbarButton>
                <ToolbarButton onClick={() => toggleCutFavorite(cut.id)}>Favorite</ToolbarButton>
              </div>
            </div>
          )}
        />
      </Panel>
    </div>
  );
}

export function SequenceView() {
  const api = getDesktopApi();
  const project = useProjectSessionStore((state) => state.project);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot) ?? '.';
  const previewPath = useUiStore((state) => state.previewPath);
  const setPreviewPath = useUiStore((state) => state.setPreviewPath);
  const selectedVariantId = useUiStore((state) => state.selectedVariantId);
  const selectVariant = useUiStore((state) => state.selectVariant);
  const moveClipAction = useProjectSessionStore((state) => state.moveClip);
  const trimClipAction = useProjectSessionStore((state) => state.trimClip);
  const duplicateVariantAction = useProjectSessionStore((state) => state.duplicateVariant);
  const addMarkerAction = useProjectSessionStore((state) => state.addMarker);
  const addSectionAction = useProjectSessionStore((state) => state.addSection);
  const variant = useMemo(() => getCurrentVariant(project, selectedVariantId), [project, selectedVariantId]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 0.95fr', gap: 16 }}>
      <Panel title="Sequence Builder">
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {project.variants.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => selectVariant(candidate.id)}
              style={{
                border: candidate.id === variant?.id ? '1px solid #ff9f7f' : '1px solid #41495b',
                background: candidate.id === variant?.id ? 'linear-gradient(135deg, #ff9f7f, #f48762)' : 'rgba(255,255,255,0.05)',
                color: candidate.id === variant?.id ? '#130f12' : '#f6f7f9',
                borderRadius: 999,
                padding: '9px 14px',
                fontWeight: 700
              }}
            >
              {candidate.name}
            </button>
          ))}
          <ToolbarButton onClick={() => variant && duplicateVariantAction(variant.id)}>Duplicate Variant</ToolbarButton>
          <ToolbarButton onClick={() => variant && addMarkerAction(variant.id, `Marker ${Date.now() % 1000}`, 500)}>Add Marker</ToolbarButton>
          <ToolbarButton onClick={() => variant && addSectionAction(variant.id, `Section ${Date.now() % 1000}`, 0, 1500)}>Add Section</ToolbarButton>
          <ToolbarButton primary onClick={() => variant && void api.jobs.runPreview({
            project,
            projectRoot,
            variantId: variant.id,
            outputPath: `${projectRoot}/.afterimage/preview/${variant.id}.mp4`
          }).then((job) => setPreviewPath(job?.result?.outputPath ?? `${projectRoot}/.afterimage/preview/${variant.id}.mp4`))}>Build Preview</ToolbarButton>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {(variant?.clips ?? []).map((clip) => (
            <div key={clip.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14, background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <strong>{clip.id}</strong>
                  <div style={{ color: muted, fontSize: 13 }}>timeline {clip.timelineStartMs}ms | source {clip.sourceStartMs}ms | duration {clip.durationMs}ms</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <ToolbarButton onClick={() => variant && moveClipAction(variant.id, clip.id, -1)}>Up</ToolbarButton>
                  <ToolbarButton onClick={() => variant && moveClipAction(variant.id, clip.id, 1)}>Down</ToolbarButton>
                  <ToolbarButton onClick={() => variant && trimClipAction(variant.id, clip.id, -250)}>[</ToolbarButton>
                  <ToolbarButton onClick={() => variant && trimClipAction(variant.id, clip.id, 250)}>]</ToolbarButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Preview">
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
          {(variant?.markers ?? []).map((marker) => (
            <div key={marker.id} style={{ color: '#f6f7f9' }}>{marker.label} at {marker.timeMs}ms</div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

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

  return (
    <Panel title="Music Sync">
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {project.variants.map((candidate) => (
          <ToolbarButton key={candidate.id} primary={candidate.id === variant?.id} onClick={() => selectVariant(candidate.id)}>
            {candidate.name}
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Panel title="Change Events">
              <div style={{ display: 'grid', gap: 10 }}>
                {changeEvents.length > 0 ? changeEvents.slice(0, 16).map((event) => (
                  <div key={event.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <strong>{event.kind}</strong>
                      <span style={pillStyle()}>{event.source}</span>
                    </div>
                    <div style={{ color: muted, fontSize: 13, marginTop: 6 }}>{event.timeMs}ms • strength {(event.strength ?? 0).toFixed(2)}</div>
                  </div>
                )) : <div style={{ color: muted }}>No change events yet.</div>}
              </div>
            </Panel>
            <Panel title="Sync Events">
              <div style={{ display: 'grid', gap: 10 }}>
                {syncEvents.length > 0 ? syncEvents.slice(0, 16).map((event) => (
                  <div key={event.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <strong>{event.kind}</strong>
                      <span style={pillStyle()}>{event.source}</span>
                    </div>
                    <div style={{ color: muted, fontSize: 13, marginTop: 6 }}>{event.timeMs}ms • confidence {(event.confidence ?? 0).toFixed(2)}</div>
                  </div>
                )) : <div style={{ color: muted }}>No sync events yet.</div>}
              </div>
            </Panel>
          </div>
        </div>
      ) : (
        <div style={{ color: muted }}>Import a music track to author sync markers and sequencing cues.</div>
      )}
    </Panel>
  );
}

export function StyleView() {
  const project = useProjectSessionStore((state) => state.project);
  const addFilter = useProjectSessionStore((state) => state.addFilterToSequenceStack);
  const toggleFilter = useProjectSessionStore((state) => state.toggleFilterEnabled);
  const randomizeFilter = useProjectSessionStore((state) => state.safeRandomizeFilter);
  const randomizeStack = useProjectSessionStore((state) => state.safeRandomizeStack);
  const selectFilter = useUiStore((state) => state.selectFilter);
  const stack = project.filterStacks[0];
  const presets = useMemo(() => loadPresetLibrary().presets, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16 }}>
      <Panel title="Style Stack">
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <ToolbarButton primary onClick={() => addFilter('contrast-pulse')}>Add Contrast</ToolbarButton>
          <ToolbarButton onClick={() => addFilter('glitch-bands')}>Add Glitch</ToolbarButton>
          <ToolbarButton onClick={() => stack && randomizeStack(stack.id)}>Randomize Stack</ToolbarButton>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {stack?.filters.map((filter) => (
            <div key={filter.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <button type="button" onClick={() => selectFilter(filter.id)} style={{ border: 'none', background: 'transparent', color: '#f6f7f9', padding: 0, textAlign: 'left' }}>
                  <strong>{filter.type}</strong>
                  <div style={{ color: muted, fontSize: 13 }}>mix {Number(filter.mix ?? 1).toFixed(2)}</div>
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <ToolbarButton onClick={() => stack && toggleFilter(stack.id, filter.id)}>{filter.enabled === false ? 'Enable' : 'Bypass'}</ToolbarButton>
                  <ToolbarButton onClick={() => stack && randomizeFilter(stack.id, filter.id)}>Randomize</ToolbarButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Preset Families">
        <div style={{ display: 'grid', gap: 10 }}>
          {presets.map((preset) => (
            <div key={preset.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{preset.name}</strong>
                <span style={pillStyle()}>{preset.family}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function AutomationView() {
  const project = useProjectSessionStore((state) => state.project);
  const addLane = useProjectSessionStore((state) => state.addAutomationLane);
  const addKeyframe = useProjectSessionStore((state) => state.addLaneKeyframe);
  const resetLane = useProjectSessionStore((state) => state.resetLane);
  const targetFilterId = project.filterStacks[0]?.filters[0]?.id;

  return (
    <Panel title="Automation">
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <ToolbarButton primary onClick={() => targetFilterId && addLane(targetFilterId, `Lane ${project.automationLanes.length + 1}`)}>Add Lane</ToolbarButton>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {project.automationLanes.map((lane) => (
          <div key={lane.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <strong>{lane.name}</strong>
                <div style={{ color: muted, fontSize: 13 }}>Target {lane.target.filterId} {'->'} {lane.target.property}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <ToolbarButton onClick={() => addKeyframe(lane.id, lane.keyframes.length * 500 + 500, 0.8)}>Add Keyframe</ToolbarButton>
                <ToolbarButton onClick={() => resetLane(lane.id)}>Reset</ToolbarButton>
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              {lane.keyframes.map((keyframe) => (
                <div key={keyframe.id} style={{ color: muted }}>{keyframe.timeMs}ms {'->'} {keyframe.value.toFixed(2)}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function ExportView() {
  const api = getDesktopApi();
  const project = useProjectSessionStore((state) => state.project);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot) ?? '.';
  const toggleProfile = useProjectSessionStore((state) => state.toggleExportProfile);
  const allJobs = useJobsStore((state) => state.jobs);
  const exportJobs = useMemo(() => allJobs.filter((job) => job.type === 'export'), [allJobs]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Export Profiles">
        <div style={{ display: 'grid', gap: 10 }}>
          {exportProfiles.map((profile) => {
            const selection = project.exportSelections.find((item) => item.profileId === profile.id);
            return (
              <label key={profile.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14 }}>
                <div>
                  <strong>{profile.name}</strong>
                  <div style={{ color: muted, fontSize: 13 }}>{profile.width} x {profile.height} | {profile.container}</div>
                </div>
                <input
                  type="checkbox"
                  checked={selection?.enabled ?? false}
                  onChange={() => toggleProfile(profile.id)}
                />
              </label>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <ToolbarButton primary onClick={() => void api.jobs.runExport({
            project,
            projectRoot,
            outputPath: `${projectRoot}/exports/${project.id}`,
            profileIds: getEnabledExportProfileIds(project.exportSelections),
            selections: project.exportSelections
          })}>Export Enabled Profiles</ToolbarButton>
        </div>
      </Panel>
      <Panel title="Render Queue">
        <div style={{ display: 'grid', gap: 8 }}>
          {exportJobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function DiagnosticsView() {
  const report = useDiagnosticsStore((state) => state.report);
  const logs = useDiagnosticsStore((state) => state.logs);
  const jobs = useJobsStore((state) => state.jobs);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Diagnostics">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <StatCard label="FFmpeg" value={report?.toolchain.available ? 'Available' : 'Unavailable'} tone={report?.toolchain.available ? 'success' : 'warn'} />
          <StatCard label="Warnings" value={String(report?.warnings.length ?? 0)} tone={report && report.warnings.length > 0 ? 'warn' : 'default'} />
          <StatCard label="Missing Media" value={String(report?.missingMedia.length ?? 0)} tone={report && report.missingMedia.length > 0 ? 'warn' : 'default'} />
        </div>
      </Panel>
      <Panel title="Environment">
        <div style={{ display: 'grid', gap: 8 }}>
          {Object.entries(report?.environmentSummary ?? {}).map(([key, value]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: muted }}>{key}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Job Log">
        <div style={{ display: 'grid', gap: 8 }}>
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      </Panel>
      <Panel title="Application Log">
        <div style={{ display: 'grid', gap: 8 }}>
          {logs.length === 0 ? (
            <div style={{ color: muted }}>No log entries yet.</div>
          ) : (
            logs.slice().reverse().map((entry) => (
              <div key={entry.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <strong>{entry.message}</strong>
                  <span style={pillStyle(entry.level === 'error' ? 'warn' : entry.level === 'warn' ? 'warn' : 'default')}>{entry.level}</span>
                </div>
                <div style={{ color: muted, fontSize: 13, marginTop: 6 }}>{entry.timestamp}</div>
                {entry.details ? <div style={{ color: muted, fontSize: 13, marginTop: 6 }}>{entry.details}</div> : null}
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

export function ActiveView() {
  const currentTab = useUiStore((state) => state.currentTab);

  switch (currentTab) {
    case 'project':
      return <ProjectView />;
    case 'media':
      return <MediaView />;
    case 'analysis':
      return <AnalysisView />;
    case 'cuts':
      return <CutsView />;
    case 'sequence':
      return <SequenceView />;
    case 'music':
      return <MusicView />;
    case 'style':
      return <StyleView />;
    case 'automation':
      return <AutomationView />;
    case 'export':
      return <ExportView />;
    case 'diagnostics':
      return <DiagnosticsView />;
    default:
      return <ProjectView />;
  }
}
