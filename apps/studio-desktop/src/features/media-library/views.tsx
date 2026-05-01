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
import { useMediaLibraryClient } from './hooks';
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

export function CatalogView() {
  const api = useMediaLibraryClient();
  const projectFilePath = useProjectSessionStore((state) => state.projectFilePath);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot);
  const project = useProjectSessionStore((state) => state.project);
  const setProject = useProjectSessionStore((state) => state.setProject);
  const setSession = useProjectSessionStore((state) => state.setSession);
  const addNotification = useUiStore((state) => state.addNotification);
  const selectCut = useUiStore((state) => state.selectCut);
  const [roots, setRoots] = useState<LibraryRoot[]>([]);
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<AssetRole | 'all'>('all');
  const [catalogPage, setCatalogPage] = useState(0);
  const [catalogSort, setCatalogSort] = useState<{ sortBy: NonNullable<LibrarySearchRequest['sortBy']>; direction: 'asc' | 'desc' }>({
    sortBy: 'filename',
    direction: 'asc'
  });
  const [focusedAssetId, setFocusedAssetId] = useState<string>();
  const [focusedSceneId, setFocusedSceneId] = useState<string>();
  const [markedCutIds, setMarkedCutIds] = useState<Set<string>>(() => new Set());
  const [showCatalogSettings, setShowCatalogSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const catalogSearchRef = useRef<HTMLInputElement | null>(null);
  const deferredQuery = useDeferredValue(query);
  const resolvedProjectFilePath = resolveProjectFilePath(projectFilePath, projectRoot, project.metadata.projectFileName);
  const catalogPageSize = 100;
  const catalogPageCount = Math.max(1, Math.ceil(total / catalogPageSize));
  const focusedAsset = useMemo(
    () => assets.find((asset) => asset.id === focusedAssetId) ?? assets[0],
    [assets, focusedAssetId]
  );
  const focusedAnalysis = useAnalysisFile(focusedAsset?.analysisRef?.path);
  const focusedAnalysisSummary = focusedAsset?.analysisRef?.summary;
  const focusedSceneSegments = useMemo(() => getSceneSegments(focusedAnalysis), [focusedAnalysis]);
  const catalogPreviewRef = useRef<HTMLVideoElement | null>(null);
  const catalogPreviewEndRef = useRef<number | null>(null);

  useEffect(() => {
    setFocusedSceneId(focusedSceneSegments[0]?.id);
    setMarkedCutIds(new Set(focusedSceneSegments.map((scene) => scene.id)));
    catalogPreviewEndRef.current = null;
  }, [focusedAsset?.id, focusedSceneSegments]);

  useEffect(() => {
    const video = catalogPreviewRef.current;
    if (!video) {
      return undefined;
    }

    const stopAtCutEnd = () => {
      const endSeconds = catalogPreviewEndRef.current;
      if (endSeconds === null || video.currentTime < endSeconds) {
        return;
      }

      video.pause();
      video.currentTime = endSeconds;
      catalogPreviewEndRef.current = null;
    };

    video.addEventListener('timeupdate', stopAtCutEnd);
    video.addEventListener('ended', stopAtCutEnd);

    return () => {
      video.removeEventListener('timeupdate', stopAtCutEnd);
      video.removeEventListener('ended', stopAtCutEnd);
    };
  }, [focusedAsset?.id]);

  const loadCatalog = async () => {
    const [nextRoots, search] = await Promise.all([
      api.library.listRoots(),
      api.library.searchAssets({
        query: deferredQuery,
        roles: roleFilter === 'all' ? undefined : [roleFilter],
        sortBy: catalogSort.sortBy,
        sortDirection: catalogSort.direction,
        limit: catalogPageSize,
        offset: catalogPage * catalogPageSize
      })
    ]);
    setRoots(nextRoots);
    setAssets(search.assets);
    setTotal(search.total);
    setFocusedAssetId((current) => current && search.assets.some((asset) => asset.id === current) ? current : search.assets[0]?.id);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([
      api.library.listRoots(),
      api.library.searchAssets({
        query: deferredQuery,
        roles: roleFilter === 'all' ? undefined : [roleFilter],
        sortBy: catalogSort.sortBy,
        sortDirection: catalogSort.direction,
        limit: catalogPageSize,
        offset: catalogPage * catalogPageSize
      })
    ]).then(([nextRoots, search]) => {
      if (!active) {
        return;
      }
      setRoots(nextRoots);
      setAssets(search.assets);
      setTotal(search.total);
      setFocusedAssetId((current) => current && search.assets.some((asset) => asset.id === current) ? current : search.assets[0]?.id);
    }).finally(() => {
      if (active) {
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [api.library, deferredQuery, roleFilter, catalogPage, catalogSort]);

  useEffect(() => {
    setCatalogPage(0);
  }, [deferredQuery, roleFilter]);

  const addRoot = async (role: AssetRole) => {
    try {
      const root = await api.library.addRoot({ role });
      if (!root) {
        addNotification('Catalogue root selection cancelled.', 'warn');
        return;
      }
      await loadCatalog();
      addNotification(`Added ${formatCatalogRole(role)} catalogue root. Scan queued.`, 'success');
    } catch (error) {
      addNotification(`Catalogue folder failed: ${getErrorMessage(error)}`, 'warn', 5200);
    }
  };

  const addAssetToProject = async (asset: LibraryAsset, cutIds: string[] = []) => {
    try {
      const imported = await api.library.importAssets({
        projectRoot,
        assetIds: [asset.id]
      });
      if (imported.length === 0) {
        addNotification('Catalogue asset was not available to add.', 'warn');
        return;
      }

      const importedAsset = imported[0];
      const cutSegments = focusedAsset?.id === asset.id
        ? focusedSceneSegments.filter((scene) => cutIds.includes(scene.id))
        : [];
      const currentProject = useProjectSessionStore.getState().project;
      const existingAssetIds = new Set(currentProject.assets.map((candidate) => candidate.id));
      const existingCutIds = new Set(currentProject.cutCandidates.map((cut) => cut.id));
      const nextCuts: CutCandidate[] = cutSegments.filter((scene) => scene.endMs > scene.startMs && scene.durationMs >= 1).map((scene) => {
        let cutId = `cut-${importedAsset.id}-scene-${scene.index + 1}`;
        if (existingCutIds.has(cutId)) {
          cutId = `${cutId}-${Date.now().toString(36)}`;
        }
        return {
          id: cutId,
          assetId: importedAsset.id,
          startMs: scene.startMs,
          endMs: scene.endMs,
          durationMs: scene.durationMs,
          sceneScore: scene.score,
          status: 'kept',
          tags: ['catalogue-cut'],
          note: `Catalogue cut ${scene.index + 1}`
        };
      });
      const nextProject = normalizeProject({
        ...currentProject,
        assets: existingAssetIds.has(importedAsset.id)
          ? currentProject.assets
          : [...currentProject.assets, importedAsset],
        analysisRefs: currentProject.analysisRefs,
        cutCandidates: [...currentProject.cutCandidates, ...nextCuts]
      });

      if (resolvedProjectFilePath) {
        const session = await api.project.saveProject({
          project: nextProject,
          projectFilePath: resolvedProjectFilePath
        });
        setSession(session);
      } else {
        setProject(nextProject);
      }
      addNotification(
        cutSegments.length > 0
          ? `Added ${cutSegments.length} cut${cutSegments.length === 1 ? '' : 's'} from ${asset.filename}.`
          : `Added ${asset.filename} to the project.`,
        'success'
      );
      if (cutSegments.length > 0) {
        setMarkedCutIds(new Set());
        selectCut(nextCuts[0]?.id);
      }
    } catch (error) {
      addNotification(`Add to project failed: ${getErrorMessage(error)}`, 'warn', 5200);
    }
  };

  const rescanAll = async () => {
    try {
      await api.library.rescanAll();
      await loadCatalog();
      addNotification('Catalogue rescan queued for all folders.', 'success');
    } catch (error) {
      addNotification(`Catalogue rescan failed: ${getErrorMessage(error)}`, 'warn', 5200);
    }
  };

  const clearAndRescanAll = async () => {
    const confirmed = window.confirm([
      'Clear and rescan the entire catalogue?',
      '',
      'This deletes all indexed catalogue assets, cut metadata, analysis links, and scan state before queueing every configured folder again.',
      '',
      'Files on disk are not deleted, but large libraries can take a long time to rebuild.'
    ].join('\n'));

    if (!confirmed) {
      return;
    }

    try {
      setFocusedAssetId(undefined);
      setFocusedSceneId(undefined);
      setMarkedCutIds(new Set());
      setCatalogPage(0);
      await api.library.clearAndRescanAll();
      await loadCatalog();
      addNotification('Catalogue cleared. Full rescan queued for every folder.', 'success', 6200);
    } catch (error) {
      addNotification(`Catalogue clear + rescan failed: ${getErrorMessage(error)}`, 'warn', 6200);
    }
  };

  const rescanRoot = async (root: LibraryRoot) => {
    try {
      await api.library.rescanRoot(root.id);
      await loadCatalog();
    } catch (error) {
      addNotification(`${formatCatalogRole(root.role)} rescan failed: ${getErrorMessage(error)}`, 'warn', 5200);
    }
  };

  const removeRoot = async (root: LibraryRoot) => {
    try {
      const removed = await api.library.removeRoot(root.id);
      await loadCatalog();
      addNotification(
        removed
          ? `Removed ${formatCatalogRole(root.role)} folder from the catalogue. Files were left on disk.`
          : 'Catalogue folder was already gone.',
        removed ? 'success' : 'warn'
      );
    } catch (error) {
      addNotification(`${formatCatalogRole(root.role)} removal failed: ${getErrorMessage(error)}`, 'warn', 5200);
    }
  };

  const removeAsset = async (asset: LibraryAsset) => {
    try {
      const removed = await api.library.removeAssets({ assetIds: [asset.id] });
      await loadCatalog();
      setFocusedAssetId((current) => current === asset.id ? undefined : current);
      addNotification(
        removed > 0
          ? `Removed ${asset.filename} from the library. File was left on disk.`
          : 'Catalogue asset was already gone.',
        removed > 0 ? 'success' : 'warn'
      );
    } catch (error) {
      addNotification(`Catalogue removal failed: ${getErrorMessage(error)}`, 'warn', 5200);
    }
  };

  const toggleMarkedCut = (cutId: string) => {
    setMarkedCutIds((current) => {
      const next = new Set(current);
      if (next.has(cutId)) {
        next.delete(cutId);
      } else {
        next.add(cutId);
      }
      return next;
    });
  };

  const playCatalogCutPreview = (cut: ReturnType<typeof getSceneSegments>[number]) => {
    const video = catalogPreviewRef.current;
    if (!video) {
      return;
    }

    const startSeconds = cut.startMs / 1000;
    const endSeconds = Math.max(startSeconds, cut.endMs / 1000);
    catalogPreviewEndRef.current = endSeconds;
    video.currentTime = startSeconds;
    void video.play().catch(() => {
      video.pause();
    });
  };

  const selectAllCuts = () => {
    setMarkedCutIds(new Set(focusedSceneSegments.map((scene) => scene.id)));
  };

  const clearCutSelection = () => {
    setMarkedCutIds(new Set());
  };

  const invertCutSelection = () => {
    setMarkedCutIds((current) => new Set(focusedSceneSegments.filter((scene) => !current.has(scene.id)).map((scene) => scene.id)));
  };

  const handleCatalogSortChange = (sort?: { colId: string; direction: 'asc' | 'desc' }) => {
    if (!sort) {
      setCatalogSort({ sortBy: 'filename', direction: 'asc' });
      setCatalogPage(0);
      return;
    }

    const sortBy = sort.colId as LibrarySearchRequest['sortBy'] | undefined;
    if (sortBy === 'filename' || sortBy === 'role' || sortBy === 'type' || sortBy === 'cuts' || sortBy === 'duration' || sortBy === 'analysis') {
      setCatalogSort({ sortBy, direction: sort.direction });
      setCatalogPage(0);
    }
  };

  const catalogAssetColumns = useMemo<ColDef<LibraryAsset>[]>(() => [
    {
      field: 'filename',
      headerName: 'Filename',
      colId: 'filename',
      minWidth: 180,
      flex: 1.8,
      cellRenderer: ({ data }: { data?: LibraryAsset }) => data ? (
        <div title={data.path}>
          <strong>{data.filename}</strong>
          <div style={{ color: muted, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatPathTail(data.path)}</div>
        </div>
      ) : null
    },
    {
      field: 'assetRole',
      headerName: 'Role',
      colId: 'role',
      width: 74,
      minWidth: 74,
      valueFormatter: ({ data }) => data ? formatCatalogRole(data.assetRole) : ''
    },
    {
      field: 'mediaType',
      headerName: 'Type',
      colId: 'type',
      width: 58,
      minWidth: 58
    },
    {
      headerName: 'Cuts',
      colId: 'cuts',
      width: 56,
      minWidth: 56,
      valueGetter: ({ data }) => data?.analysisRef?.summary?.sceneCount ?? 0
    },
    {
      field: 'durationMs',
      headerName: 'Duration',
      colId: 'duration',
      width: 76,
      minWidth: 76,
      valueFormatter: ({ value }) => value ? formatMillisecondsClock(Number(value)) : 'Unknown'
    },
    {
      field: 'analysisStatus',
      headerName: 'Analysis',
      colId: 'analysis',
      width: 86,
      minWidth: 86
    }
  ], []);

  const sceneColumns = useMemo<ColDef<ReturnType<typeof getSceneSegments>[number]>[]>(() => [
    {
      headerName: 'Add',
      width: 62,
      minWidth: 62,
      maxWidth: 62,
      sortable: false,
      resizable: false,
      cellRenderer: ({ data }: { data?: ReturnType<typeof getSceneSegments>[number] }) => data ? (
        <label
          aria-label={`${markedCutIds.has(data.id) ? 'Unmark' : 'Mark'} cut ${data.index + 1} to add`}
          title={`${markedCutIds.has(data.id) ? 'Unmark' : 'Mark'} cut ${data.index + 1} to add`}
          style={{ display: 'grid', placeItems: 'center', height: '100%', cursor: 'pointer' }}
          onClick={(event) => event.stopPropagation()}
        >
          <input
            className="catalog-cut-checkbox"
            type="checkbox"
            checked={markedCutIds.has(data.id)}
            onChange={() => toggleMarkedCut(data.id)}
          />
        </label>
      ) : null
    },
    {
      headerName: 'Cut',
      width: 82,
      cellRenderer: ({ data }: { data?: ReturnType<typeof getSceneSegments>[number] }) => data ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: focusedSceneId === data.id ? '#9db1ca' : 'rgba(255,255,255,0.22)',
              boxShadow: focusedSceneId === data.id ? '0 0 0 3px rgba(136,160,191,0.18)' : 'none'
            }}
          />
          {data.index + 1}
        </span>
      ) : null
    },
    {
      headerName: 'Time',
      minWidth: 130,
      valueGetter: ({ data }) => data ? `${formatMillisecondsClock(data.startMs)} - ${formatMillisecondsClock(data.endMs)}` : ''
    },
    {
      field: 'startMs',
      headerName: 'Start',
      width: 94,
      valueFormatter: ({ value }) => formatMillisecondsClock(Number(value))
    },
    {
      field: 'endMs',
      headerName: 'End',
      width: 94,
      valueFormatter: ({ value }) => formatMillisecondsClock(Number(value))
    },
    {
      field: 'durationMs',
      headerName: 'Duration',
      width: 104,
      valueFormatter: ({ value }) => formatMillisecondsClock(Number(value))
    },
    {
      field: 'score',
      headerName: 'Score',
      width: 86,
      valueFormatter: ({ value }) => typeof value === 'number' ? value.toFixed(2) : '-'
    },
    {
      headerName: 'Actions',
      width: 132,
      sortable: false,
      cellRenderer: ({ data }: { data?: ReturnType<typeof getSceneSegments>[number] }) => data ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <ToolbarButton onClick={() => {
            setFocusedSceneId(data.id);
            playCatalogCutPreview(data);
          }} style={{ padding: '5px 7px' }}>
            Preview
          </ToolbarButton>
        </div>
      ) : null
    }
  ], [focusedSceneId, markedCutIds]);

  const handleCatalogAssetAction = (action: StudioGridAction, asset: LibraryAsset) => {
    if (action === 'open') {
      setFocusedAssetId(asset.id);
      return;
    }
    if (action === 'add') {
      void addAssetToProject(asset);
      return;
    }
    if (action === 'remove') {
      void removeAsset(asset);
    }
  };

  const handleSceneAction = (action: StudioGridAction, scene: ReturnType<typeof getSceneSegments>[number]) => {
    if (action === 'select-all') {
      selectAllCuts();
      return;
    }
    if (action === 'invert-selection') {
      invertCutSelection();
      return;
    }
    if (action === 'open') {
      playCatalogCutPreview(scene);
      return;
    }
    if (action === 'remove' || action === 'reject') {
      toggleMarkedCut(scene.id);
      return;
    }
    if (action === 'add' && focusedAsset) {
      void addAssetToProject(focusedAsset, [scene.id]);
    }
  };

  return (
    <Panel title="Choose Assets" style={{ height: '100%', minWidth: 0, overflow: 'hidden' }} bodyStyle={{ flex: '1 1 auto', display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr)', gap: 12, minHeight: 0, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
        <input
          ref={catalogSearchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search videos, overlays, transitions"
          style={{
            flex: '1 1 320px',
            minWidth: 0,
            borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(13, 16, 22, 0.92)',
            color: '#f6f7f9',
            padding: '10px 14px'
          }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <ToolbarButton primary={roleFilter === 'all'} onClick={() => setRoleFilter('all')}>All</ToolbarButton>
          {catalogRoles.map((role) => (
            <ToolbarButton key={role.value} primary={roleFilter === role.value} onClick={() => setRoleFilter(role.value)}>
              {role.label}
            </ToolbarButton>
          ))}
        </div>
        <ToolbarButton onClick={() => setShowCatalogSettings((current) => !current)}>
          {showCatalogSettings ? 'Hide Library Settings' : 'Library Settings'}
        </ToolbarButton>
      </div>

      {showCatalogSettings ? (
        <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 12, background: 'rgba(255,255,255,0.03)', display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {catalogRoles.map((role) => (
              <ToolbarButton key={role.value} onClick={() => void addRoot(role.value)}>
                Add {role.label} Folder
              </ToolbarButton>
            ))}
            <ToolbarButton onClick={() => void rescanAll()} disabled={roots.length === 0}>Rescan All</ToolbarButton>
            <ToolbarButton
              onClick={() => void clearAndRescanAll()}
              disabled={roots.length === 0}
              title="Deletes the catalogue index and queues a full rebuild for every folder."
              style={{
                borderColor: 'rgba(235, 118, 118, 0.48)',
                background: 'rgba(82, 24, 28, 0.72)',
                color: '#ffd7d7'
              }}
            >
              Clear + Rescan All
            </ToolbarButton>
            <span style={{ color: muted, fontSize: 13 }}>{roots.length} folder{roots.length === 1 ? '' : 's'}</span>
          </div>
          {roots.length > 0 ? (
            <div className="studio-scrollable" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8, maxHeight: 150 }}>
              {roots.map((root) => (
                <div key={root.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 10, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{formatCatalogRole(root.role)}</strong>
                    <span style={pillStyle(root.lastScanStatus === 'completed' ? 'success' : root.lastScanStatus === 'failed' ? 'warn' : 'default')}>{root.lastScanStatus}</span>
                  </div>
                  <div title={root.path} style={{ color: muted, fontSize: 12, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{root.path}</div>
                  {root.lastScanError ? <div style={{ color: '#ccbdf0', fontSize: 12, marginTop: 6 }}>{root.lastScanError}</div> : null}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    <ToolbarButton onClick={() => void rescanRoot(root)} style={{ padding: '7px 11px' }}>Rescan</ToolbarButton>
                    <ToolbarButton onClick={() => void removeRoot(root)} style={{ padding: '7px 11px' }}>Remove</ToolbarButton>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ border: '1px dashed rgba(255,255,255,0.14)', borderRadius: 12, padding: 12, color: muted }}>
              Add reusable folders here. This setup stays out of the way while you pick assets.
            </div>
          )}
        </div>
      ) : null}

      <div className="catalog-browser">
        <div className="catalog-results">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', color: muted, fontSize: 13 }}>
            <span>
              {loading
                ? 'Loading catalogue...'
                : `${catalogPage * catalogPageSize + (assets.length > 0 ? 1 : 0)}-${catalogPage * catalogPageSize + assets.length} of ${total}`}
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <ToolbarButton
                onClick={() => setCatalogPage((page) => Math.max(0, page - 1))}
                disabled={catalogPage === 0 || loading}
                style={{ padding: '5px 9px' }}
              >
                Previous
              </ToolbarButton>
              <span>Page {catalogPage + 1} / {catalogPageCount}</span>
              <ToolbarButton
                onClick={() => setCatalogPage((page) => Math.min(catalogPageCount - 1, page + 1))}
                disabled={catalogPage >= catalogPageCount - 1 || loading}
                style={{ padding: '5px 9px' }}
              >
                Next
              </ToolbarButton>
            </div>
          </div>
          <StudioDataGrid
            rows={assets}
            columns={catalogAssetColumns}
            searchRef={catalogSearchRef}
            onFocusRow={(asset) => setFocusedAssetId(asset.id)}
            onRowOpen={(asset) => setFocusedAssetId(asset.id)}
            onAction={handleCatalogAssetAction}
            onSortChange={handleCatalogSortChange}
            rowHeight={58}
            emptyMessage={roots.length === 0 ? 'Add catalogue folders in Library Settings' : 'No usable media found'}
          />
        </div>

        <div className="catalog-inspector">
          {focusedAsset ? (
            <div className="catalog-inspector__content">
              <div className="catalog-preview">
                {focusedAsset.mediaType === 'image' ? (
                  <img src={toMediaSrc(focusedAsset.path)} alt={focusedAsset.filename} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 12, background: '#090a0d' }} />
                ) : focusedAsset.mediaType === 'audio' ? (
                  <div style={{ height: '100%', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: '#090a0d', padding: 18, display: 'grid', alignContent: 'center' }}>
                    <audio controls src={toMediaSrc(focusedAsset.path)} style={{ width: '100%' }} />
                  </div>
                ) : (
                  <video ref={catalogPreviewRef} controls muted playsInline preload="metadata" src={toMediaSrc(focusedAsset.path)} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 12, background: '#090a0d' }} />
                )}
              </div>
              <div className="catalog-asset-summary">
                <div style={{ minWidth: 0 }}>
                  <div title={focusedAsset.filename} style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.22, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{focusedAsset.filename}</div>
                  <div title={focusedAsset.path} style={{ color: muted, fontSize: 12, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{focusedAsset.path}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    <span style={pillStyle()}>{formatCatalogRole(focusedAsset.assetRole)}</span>
                    <span style={pillStyle()}>{focusedAsset.durationMs ? formatMillisecondsClock(focusedAsset.durationMs) : 'Unknown'}</span>
                    <span style={pillStyle(focusedAsset.analysisStatus === 'completed' ? 'success' : focusedAsset.analysisStatus === 'failed' ? 'warn' : 'default')}>{focusedAsset.analysisStatus}</span>
                    <span style={pillStyle((focusedAnalysisSummary?.sceneCount ?? 0) > 0 ? 'success' : 'default')}>{focusedAnalysisSummary?.sceneCount ?? 0} cuts</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, minWidth: 0 }}>
                  <ToolbarButton primary onClick={() => void addAssetToProject(focusedAsset)} style={{ width: '100%', padding: '9px 10px' }}>Add Full Video</ToolbarButton>
                  <ToolbarButton onClick={() => void removeAsset(focusedAsset)} style={{ width: '100%', padding: '9px 10px' }}>Remove</ToolbarButton>
                </div>
              </div>
                {focusedSceneSegments.length > 0 ? (
                <div className="catalog-scenes">
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                      <div style={{ color: muted, fontSize: 12, fontWeight: 700 }}>
                        {markedCutIds.size} of {focusedSceneSegments.length} cuts marked to add
                      </div>
                      <ToolbarButton onClick={selectAllCuts} style={{ padding: '7px 10px' }}>Mark All Cuts</ToolbarButton>
                      <ToolbarButton onClick={clearCutSelection} style={{ padding: '7px 10px' }}>Clear Marks</ToolbarButton>
                      <ToolbarButton onClick={invertCutSelection} style={{ padding: '7px 10px' }}>Invert Marks</ToolbarButton>
                      <ToolbarButton
                        primary
                        disabled={markedCutIds.size === 0}
                        onClick={() => focusedAsset && void addAssetToProject(focusedAsset, [...markedCutIds])}
                        style={{ padding: '7px 10px' }}
                      >
                        Add Marked Cuts
                      </ToolbarButton>
                    </div>
                    <StudioDataGrid
                      rows={focusedSceneSegments}
                      columns={sceneColumns}
                      focusedRowId={focusedSceneId}
                      searchRef={catalogSearchRef}
                      onFocusRow={(scene) => {
                        setFocusedSceneId(scene.id);
                        playCatalogCutPreview(scene);
                      }}
                      onAction={handleSceneAction}
                      rowHeight={38}
                      emptyMessage="No detected cuts"
                    />
                  </div>
                ) : (
                  <div style={{ color: muted, fontSize: 13, lineHeight: 1.5 }}>No detected cuts for this asset yet.</div>
                )}
            </div>
          ) : (
            <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: muted, lineHeight: 1.6 }}>
              {roots.length === 0 ? 'Open Library Settings to add footage, transitions, or overlays.' : 'Select an asset to preview it.'}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}


export function MediaView() {
  const api = useMediaLibraryClient();
  const project = useProjectSessionStore((state) => state.project);
  const projectFilePath = useProjectSessionStore((state) => state.projectFilePath);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot);
  const mergeAssets = useProjectSessionStore((state) => state.mergeImportedAssets);
  const setSession = useProjectSessionStore((state) => state.setSession);
  const selectedAssetId = useUiStore((state) => state.selectedAssetId);
  const selectAsset = useUiStore((state) => state.selectAsset);
  const setCurrentTab = useUiStore((state) => state.setCurrentTab);
  const addNotification = useUiStore((state) => state.addNotification);
  const allJobs = useJobsStore((state) => state.jobs);
  const [query, setQuery] = useState('');
  const [launchLocked, setLaunchLocked] = useState(false);
  const mediaSearchRef = useRef<HTMLInputElement | null>(null);
  const deferredQuery = useDeferredValue(query);
  const resolvedProjectFilePath = resolveProjectFilePath(projectFilePath, projectRoot, project.metadata.projectFileName);
  const assets = useMemo(() => project.assets.filter((asset) =>
    `${asset.filename} ${(asset.tags ?? []).join(' ')}`.toLowerCase().includes(deferredQuery.toLowerCase())
  ), [deferredQuery, project.assets]);
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? assets[0],
    [assets, selectedAssetId]
  );
  const analysisJobs = useMemo(() => {
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
  const activeAnalysisJob = analysisJobs.find((job) => job.status === 'queued' || job.status === 'running');
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
  const queuedAnalysisRows = useMemo(
    () => analysisRows.filter((row) => row.analysisStatus !== 'completed'),
    [analysisRows]
  );
  const pendingAnalysisAssetIds = useMemo(
    () => queuedAnalysisRows.map((row) => row.id),
    [queuedAnalysisRows]
  );
  const pendingAnalysisCount = analysisRows.filter((row) => row.analysisStatus !== 'completed').length;
  const completedAnalysisCount = analysisRows.length - pendingAnalysisCount;
  const selectedAnalysisRow = selectedAsset ? analysisRows.find((row) => row.id === selectedAsset.id) : undefined;
  const analyzableSelectedAssetIds = selectedAsset && selectedAsset.mediaType !== 'image' ? [selectedAsset.id] : [];
  const selectedAssetAnalysisReady = selectedAnalysisRow?.analysisStatus === 'completed';
  const selectedAssetNeedsAnalysis = analyzableSelectedAssetIds.length > 0 && !selectedAssetAnalysisReady;

  useEffect(() => {
    if (!selectedAssetId && assets[0]) {
      selectAsset(assets[0].id);
      return;
    }

    if (selectedAssetId && !assets.some((asset) => asset.id === selectedAssetId)) {
      selectAsset(assets[0]?.id);
    }
  }, [assets, selectAsset, selectedAssetId]);

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

  const importTransitionMasks = async () => {
    const imported = await api.project.importTransitionMasks(projectRoot);
    if (imported.length === 0) {
      addNotification('Transition import cancelled.', 'warn');
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
        ? `Imported ${imported.length} transition${imported.length === 1 ? '' : 's'} and saved the project.`
        : `Imported ${imported.length} transition${imported.length === 1 ? '' : 's'}${projectRoot ? '.' : ' into an unsaved project.'}`,
      'success'
    );
  };

  const importTransitionOverlays = async () => {
    const imported = await api.project.importTransitionOverlays(projectRoot);
    if (imported.length === 0) {
      addNotification('Transition overlay import cancelled.', 'warn');
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
        ? `Imported ${imported.length} transition overlay${imported.length === 1 ? '' : 's'} and saved the project.`
        : `Imported ${imported.length} transition overlay${imported.length === 1 ? '' : 's'}${projectRoot ? '.' : ' into an unsaved project.'}`,
      'success'
    );
  };

  const runAnalysis = async (assetIds: string[], mode: 'all' | 'selected') => {
    if (processingAnalysis || assetIds.length === 0) {
      return;
    }

    setLaunchLocked(true);
    const queuedJobs = await api.jobs.runAnalysis({ project, projectRoot: projectRoot ?? '.', assetIds });
    const job = queuedJobs[0];

    if (job?.status === 'queued' || job?.status === 'running') {
      addNotification(
        activeAnalysisJob
          ? 'Analysis is already running. Cancel the active job before starting another.'
          : `Queued ${mode === 'all' ? 'library' : 'selected'} analysis for ${assetIds.length} asset${assetIds.length === 1 ? '' : 's'}.`,
        activeAnalysisJob ? 'warn' : 'success',
        activeAnalysisJob ? 3200 : 1800
      );
    }

    window.setTimeout(() => {
      setLaunchLocked(false);
    }, 500);
  };

  const mediaAssetColumns = useMemo<ColDef<MediaAsset>[]>(() => [
    {
      headerName: 'Filename',
      minWidth: 250,
      flex: 1.6,
      valueGetter: ({ data }) => data?.label ?? data?.filename ?? '',
      cellRenderer: ({ data }: { data?: MediaAsset }) => data ? (
        <div title={data.path.absolutePath}>
          <strong>{data.label ?? data.filename}</strong>
          <div style={{ color: muted, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatAssetListSubline(data)}</div>
        </div>
      ) : null
    },
    {
      field: 'assetRole',
      headerName: 'Role',
      width: 118,
      valueFormatter: ({ value }) => value ?? 'source'
    },
    {
      field: 'mediaType',
      headerName: 'Type',
      width: 100
    },
    {
      field: 'durationMs',
      headerName: 'Duration',
      width: 116,
      valueFormatter: ({ value }) => value ? formatMillisecondsClock(Number(value)) : 'Unknown'
    },
    {
      field: 'analysisStatus',
      headerName: 'Analysis',
      width: 118,
      cellRenderer: ({ value }: { value?: string }) => <span style={pillStyle(value === 'completed' ? 'success' : 'warn')}>{value}</span>
    },
    {
      headerName: 'Actions',
      width: 170,
      sortable: false,
      cellRenderer: ({ data }: { data?: MediaAsset }) => data ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <ToolbarButton onClick={() => selectAsset(data.id)} style={{ padding: '5px 7px' }}>Preview</ToolbarButton>
          {data.mediaType !== 'image' ? (
            <ToolbarButton primary onClick={() => void runAnalysis([data.id], 'selected')} disabled={processingAnalysis} style={{ padding: '5px 7px' }}>
              Analyze
            </ToolbarButton>
          ) : null}
        </div>
      ) : null
    }
  ], [processingAnalysis, selectAsset]);

  const analysisQueueColumns = useMemo<ColDef<AnalysisAssetRow>[]>(() => [
    {
      field: 'label',
      headerName: 'Asset',
      minWidth: 230,
      flex: 1.4,
      cellRenderer: ({ data }: { data?: AnalysisAssetRow }) => data ? (
        <div title={data.path}>
          <strong>{data.label}</strong>
          <div style={{ color: muted, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatPathTail(data.path)}</div>
        </div>
      ) : null
    },
    { field: 'mediaType', headerName: 'Type', width: 94 },
    { field: 'analysisStatus', headerName: 'Status', width: 112, cellRenderer: ({ value }: { value?: string }) => <span style={pillStyle(value === 'completed' ? 'success' : 'warn')}>{value}</span> },
    { field: 'durationMs', headerName: 'Duration', width: 110, valueFormatter: ({ value }) => formatMillisecondsClock(Number(value)) },
    { field: 'changeEventCount', headerName: 'Changes', width: 94 },
    { field: 'syncEventCount', headerName: 'Sync', width: 80 },
    { field: 'sidecarCount', headerName: 'Sidecars', width: 90 }
  ], []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(340px, 0.9fr)', gap: 16, alignItems: 'stretch', height: '100%', minHeight: 0 }}>
      <Panel title="Media Library" bodyStyle={{ display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr)', minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <ToolbarButton primary onClick={() => void importMedia()}>Import Media</ToolbarButton>
          <ToolbarButton onClick={() => setCurrentTab('catalog')}>Import From Catalogue</ToolbarButton>
          <ToolbarButton onClick={() => void importMusic()}>Import Music</ToolbarButton>
          <ToolbarButton onClick={() => void importTransitionMasks()}>Import Transitions</ToolbarButton>
          <ToolbarButton onClick={() => void importTransitionOverlays()}>Import Overlays</ToolbarButton>
        </div>
        <div style={{ marginBottom: 16 }}>
          <input
            ref={mediaSearchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by filename or tag"
            style={{
              width: '100%',
              borderRadius: 7,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(13, 16, 22, 0.92)',
              color: '#f6f7f9',
              padding: '10px 14px'
            }}
          />
        </div>
        <StudioDataGrid
          rows={assets}
          columns={mediaAssetColumns}
          focusedRowId={selectedAsset?.id}
          searchRef={mediaSearchRef}
          onFocusRow={(asset) => selectAsset(asset.id)}
          onRowOpen={(asset) => selectAsset(asset.id)}
          onAction={(action, asset) => {
            if (action === 'open') {
              selectAsset(asset.id);
            }
            if (action === 'add' && asset.mediaType !== 'image') {
              void runAnalysis([asset.id], 'selected');
            }
          }}
          rowHeight={58}
          emptyMessage="No media has been imported"
        />
      </Panel>

      <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) minmax(260px, 0.95fr)', gap: 16, minHeight: 0 }}>
        <Panel title="Asset Inspector" bodyStyle={{ minHeight: 0 }}>
          {selectedAsset ? (
            <div style={{ display: 'grid', gap: 14 }}>
              {selectedAsset.mediaType === 'image' ? (
                <img
                  src={toMediaSrc(selectedAsset.path.absolutePath)}
                  alt={selectedAsset.label ?? selectedAsset.filename}
                  style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 18, background: '#090a0d' }}
                />
              ) : selectedAsset.mediaType === 'audio' ? (
                <div style={{ borderRadius: 18, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(9,10,13,0.92)', padding: 18 }}>
                  <audio controls src={toMediaSrc(selectedAsset.path.absolutePath)} style={{ width: '100%' }} />
                </div>
              ) : (
                <video
                  controls
                  muted
                  playsInline
                  preload="metadata"
                  src={toMediaSrc(selectedAsset.path.absolutePath)}
                  style={{ width: '100%', borderRadius: 18, background: '#090a0d', aspectRatio: '16 / 9' }}
                />
              )}
              <div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{selectedAsset.label ?? selectedAsset.filename}</div>
                <div style={{ color: muted, fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>{selectedAsset.path.absolutePath}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={pillStyle()}>{selectedAsset.mediaType}</span>
                <span style={pillStyle(selectedAsset.assetRole === 'music' ? 'success' : selectedAsset.assetRole === 'transition-mask' || selectedAsset.assetRole === 'transition-overlay' ? 'warn' : 'default')}>
                  {selectedAsset.assetRole ?? 'source'}
                </span>
                {selectedAsset.mediaType !== 'image' ? (
                  <span style={pillStyle(selectedAssetAnalysisReady ? 'success' : 'warn')}>{selectedAsset.analysisStatus}</span>
                ) : null}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                <StatCard label="Duration" value={selectedAsset.durationMs ? formatMillisecondsDetail(selectedAsset.durationMs) : 'Unknown'} />
                <StatCard label="Tags" value={String(selectedAsset.tags?.length ?? 0)} tone={(selectedAsset.tags?.length ?? 0) > 0 ? 'success' : 'default'} />
              </div>
              <div style={{ color: muted, lineHeight: 1.6 }}>
                {selectedAsset.mediaType === 'image'
                  ? 'Images skip analysis and stay available as design or transition assets.'
                  : selectedAsset.assetRole === 'music'
                    ? selectedAssetAnalysisReady
                      ? 'Music analysis is ready. Open Music Sync to work from detected change and sync events.'
                      : 'Run analysis first to extract change and sync events before working in Music Sync.'
                    : selectedAssetAnalysisReady
                      ? 'Analysis is ready. Move into Cut Review to work with generated candidates.'
                      : 'Run analysis to generate sidecars and cut candidates for this source asset.'}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {selectedAsset.mediaType === 'image' ? null : selectedAsset.assetRole === 'music' ? (
                  selectedAssetAnalysisReady ? (
                    <>
                      <ToolbarButton primary onClick={() => setCurrentTab('music')}>Open Music Sync</ToolbarButton>
                      <ToolbarButton onClick={() => void runAnalysis(analyzableSelectedAssetIds, 'selected')} disabled={processingAnalysis}>
                        Re-analyze
                      </ToolbarButton>
                    </>
                  ) : (
                    <ToolbarButton
                      primary
                      onClick={() => void runAnalysis(analyzableSelectedAssetIds, 'selected')}
                      disabled={processingAnalysis || analyzableSelectedAssetIds.length === 0}
                    >
                      {processingAnalysis ? 'Processing…' : 'Analyze Music'}
                    </ToolbarButton>
                  )
                ) : selectedAssetAnalysisReady ? (
                  <>
                    <ToolbarButton primary onClick={() => setCurrentTab('cuts')}>Open Cut Review</ToolbarButton>
                    <ToolbarButton onClick={() => void runAnalysis(analyzableSelectedAssetIds, 'selected')} disabled={processingAnalysis}>
                      Re-analyze
                    </ToolbarButton>
                  </>
                ) : (
                  <ToolbarButton
                    primary
                    onClick={() => void runAnalysis(analyzableSelectedAssetIds, 'selected')}
                    disabled={processingAnalysis || analyzableSelectedAssetIds.length === 0}
                  >
                    {processingAnalysis ? 'Processing…' : 'Analyze Selected'}
                  </ToolbarButton>
                )}
                {selectedAsset.assetRole === 'transition-mask' || selectedAsset.assetRole === 'transition-overlay' ? (
                  <ToolbarButton onClick={() => setCurrentTab('sequence')}>Open Sequence Builder</ToolbarButton>
                ) : null}
              </div>
            </div>
          ) : (
            <div style={{ border: '1px dashed rgba(255,255,255,0.16)', borderRadius: 18, minHeight: 280, display: 'grid', placeItems: 'center', color: muted, textAlign: 'center', padding: 24 }}>
              Select an asset to inspect its path, preview, and where it fits in the workflow.
            </div>
          )}
        </Panel>

        <Panel title="Analysis Queue" bodyStyle={{ display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr)', gap: 12, minHeight: 0 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <StatCard label="Ready" value={String(completedAnalysisCount)} tone={completedAnalysisCount > 0 ? 'success' : 'default'} />
              <StatCard label="Remaining" value={String(pendingAnalysisCount)} tone={pendingAnalysisCount > 0 ? 'warn' : 'success'} />
              <StatCard label="Queued" value={String(queuedAnalysisRows.length)} tone={queuedAnalysisRows.length > 0 ? 'warn' : 'success'} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <ToolbarButton primary onClick={() => void runAnalysis(pendingAnalysisAssetIds, 'all')} disabled={processingAnalysis || pendingAnalysisAssetIds.length === 0}>
                {processingAnalysis ? 'Processing…' : pendingAnalysisAssetIds.length > 0 ? 'Analyze Remaining' : 'All Ready'}
              </ToolbarButton>
              {selectedAssetNeedsAnalysis ? (
                <ToolbarButton onClick={() => void runAnalysis(analyzableSelectedAssetIds, 'selected')} disabled={processingAnalysis}>
                  Analyze Selected
                </ToolbarButton>
              ) : null}
              <ToolbarButton onClick={() => setCurrentTab('cuts')} disabled={completedAnalysisCount === 0}>Open Cut Review</ToolbarButton>
            </div>
          </div>
          <div style={{ display: 'grid', minHeight: 0 }}>
            {queuedAnalysisRows.length > 0 ? (
              <StudioDataGrid
                rows={queuedAnalysisRows}
                columns={analysisQueueColumns}
                focusedRowId={selectedAnalysisRow?.id}
                searchRef={mediaSearchRef}
                onFocusRow={(row) => selectAsset(row.id)}
                onRowOpen={(row) => selectAsset(row.id)}
                onAction={(action, row) => {
                  if (action === 'add') {
                    void runAnalysis([row.id], 'selected');
                  }
                }}
                rowHeight={54}
                emptyMessage="No queued analysis"
              />
            ) : (
              <div style={{ border: '1px dashed rgba(159, 225, 193, 0.24)', borderRadius: 18, minHeight: 180, display: 'grid', placeItems: 'center', padding: 20, background: 'linear-gradient(180deg, rgba(14, 30, 24, 0.32), rgba(11, 16, 14, 0.16))' }}>
                <div style={{ maxWidth: 360, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>All analyzable media is ready</div>
                  <div style={{ color: muted, lineHeight: 1.6, marginBottom: 16 }}>
                    The media workspace no longer keeps completed assets in the queue. Completed assets stay in the library and inspector, and reruns happen from the selected asset.
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <ToolbarButton primary onClick={() => setCurrentTab('cuts')}>Open Cut Review</ToolbarButton>
                    {selectedAssetAnalysisReady && analyzableSelectedAssetIds.length > 0 ? (
                      <ToolbarButton onClick={() => void runAnalysis(analyzableSelectedAssetIds, 'selected')} disabled={processingAnalysis}>Re-analyze Selected</ToolbarButton>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Panel>
      </div>
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
