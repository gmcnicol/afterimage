import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table';
import { exportProfiles, type ExportProfileId } from '@afterimage/export-profiles';
import { loadPresetLibrary } from '@afterimage/preset-library';
import {
  getAssetById,
  getDefaultVariant,
  getFilterDefinition,
  getPrimaryAutomationProperty,
  getSupportedAutomationProperties,
  supportedFilterDefinitions,
  type AnalysisFile,
  type AssetRole,
  type AutomationTargetProperty,
  type FilterInstance,
  type Marker,
  type MediaAsset,
  type NormalizedProjectFile,
  type SupportedFilterType,
  type TransitionStyle,
  type SyncMode
} from '@afterimage/project-model';
import { Panel } from '@afterimage/ui';
import { getDesktopApi, type DesktopJob, type LibraryAsset, type LibraryRoot } from '../lib/desktop-api';
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

function formatSequenceName(name: string, index?: number): string {
  const normalized = name.replace(/\bAssembly\b/g, 'Sequence');
  if (/^Sequence\s+\d{3}$/i.test(normalized.trim())) {
    return normalized;
  }

  if (typeof index === 'number') {
    return `Sequence ${String(index + 1).padStart(3, '0')}`;
  }

  return normalized;
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

const catalogRoles: Array<{ value: AssetRole; label: string }> = [
  { value: 'source', label: 'Source' },
  { value: 'music', label: 'Music' },
  { value: 'transition-mask', label: 'Masks' },
  { value: 'transition-overlay', label: 'Overlays' }
];

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
      <div style={{ position: 'relative', height: 42, borderRadius: 999, background: 'linear-gradient(90deg, rgba(109, 132, 166, 0.22), rgba(120, 178, 154, 0.18), rgba(156, 138, 201, 0.2))' }}>
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
                background: event.kind === 'accent' ? '#b7a1dc' : event.kind === 'silence-boundary' ? '#8ea4c4' : accent,
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function AutomationLaneTimeline({
  durationMs,
  keyframes,
  propertyLabel,
  onUpdate
}: {
  durationMs: number;
  keyframes: Array<{ id: string; timeMs: number; value: number }>;
  propertyLabel: string;
  onUpdate: (keyframeId: string, timeMs: number, value: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [draggingKeyframeId, setDraggingKeyframeId] = useState<string>();

  useEffect(() => {
    if (!draggingKeyframeId) {
      return undefined;
    }

    const updateFromPointer = (clientX: number, clientY: number) => {
      const track = trackRef.current;
      if (!track) {
        return;
      }

      const bounds = track.getBoundingClientRect();
      const nextTimeMs = Math.round((clamp((clientX - bounds.left) / bounds.width, 0, 1) * durationMs) / 10) * 10;
      const nextValue = Number((1 - clamp((clientY - bounds.top) / bounds.height, 0, 1)).toFixed(2));
      onUpdate(draggingKeyframeId, nextTimeMs, nextValue);
    };

    const handlePointerMove = (event: PointerEvent) => {
      updateFromPointer(event.clientX, event.clientY);
    };

    const handlePointerUp = () => {
      setDraggingKeyframeId(undefined);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingKeyframeId, durationMs, onUpdate]);

  const sortedKeyframes = [...keyframes].sort((left, right) => left.timeMs - right.timeMs);
  const polylinePoints = sortedKeyframes
    .map((keyframe) => `${(keyframe.timeMs / Math.max(durationMs, 1)) * 100},${(1 - keyframe.value) * 100}`)
    .join(' ');

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: muted, fontSize: 12 }}>
        <span>{propertyLabel}</span>
        <span>Drag keyframes directly</span>
      </div>
      <div
        ref={trackRef}
        style={{
          position: 'relative',
          height: 170,
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
          overflow: 'hidden'
        }}
      >
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '100% 25%, 12.5% 100%' }} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="#88a0bf"
            strokeWidth="1.6"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
        {sortedKeyframes.map((keyframe) => (
          <button
            key={keyframe.id}
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              setDraggingKeyframeId(keyframe.id);
            }}
            title={`${Math.round(keyframe.timeMs)}ms • ${keyframe.value.toFixed(2)}`}
            style={{
              position: 'absolute',
              left: `${(keyframe.timeMs / Math.max(durationMs, 1)) * 100}%`,
              top: `${(1 - keyframe.value) * 100}%`,
              transform: 'translate(-50%, -50%)',
              width: 14,
              height: 14,
              borderRadius: 999,
              border: '2px solid rgba(9, 11, 15, 0.96)',
              background: draggingKeyframeId === keyframe.id ? '#b7a1dc' : '#88a0bf',
              boxShadow: '0 0 0 4px rgba(136,160,191,0.16)',
              cursor: 'grab',
              padding: 0
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: muted, fontSize: 12 }}>
        <span>0ms</span>
        <span>{durationMs}ms</span>
      </div>
    </div>
  );
}

function formatParameterLabel(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/-/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function getStackForCurrentVariant(project: NormalizedProjectFile, variantId?: string) {
  const variant = getCurrentVariant(project, variantId);
  return variant?.stackId ? project.filterStacks.find((stack) => stack.id === variant.stackId) : undefined;
}

function filterTransitionAssets(assets: MediaAsset[], kind: 'mask' | 'overlay') {
  const role = kind === 'mask' ? 'transition-mask' : 'transition-overlay';
  return assets.filter((asset) => asset.mediaType === 'video' && asset.assetRole === role);
}

function formatSequenceAssetLabel(asset: MediaAsset): string {
  const raw = asset.label ?? asset.filename;
  const foundryMatch = raw.match(/__(.+?)__seed-(\d+)/);
  if (!foundryMatch) {
    return raw;
  }

  const descriptor = foundryMatch[1] ?? raw;
  const seed = foundryMatch[2];
  return `${descriptor} • ${seed}`;
}

function formatMillisecondsClock(value?: number): string {
  const safeValue = Math.max(0, Math.round(value ?? 0));
  const minutes = Math.floor(safeValue / 60000);
  const seconds = Math.floor((safeValue % 60000) / 1000);
  const tenths = Math.floor((safeValue % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

function formatMillisecondsDetail(value?: number): string {
  const safeValue = Math.max(0, Math.round(value ?? 0));
  return `${formatMillisecondsClock(safeValue)} • ${safeValue}ms`;
}

function formatAssetListSubline(asset: MediaAsset): string {
  if (asset.label && asset.label !== asset.filename) {
    return asset.filename;
  }

  const pathSegments = asset.path.absolutePath.split(/[\\/]/).filter(Boolean);
  return pathSegments.slice(-2).join('/');
}

function formatPathTail(value: string): string {
  const pathSegments = value.split(/[\\/]/).filter(Boolean);
  return pathSegments.slice(-2).join('/');
}

function getPathBasename(value: string): string {
  const pathSegments = value.split(/[\\/]/).filter(Boolean);
  return pathSegments[pathSegments.length - 1] ?? value;
}

function isDisposableRecentProjectPath(projectFilePath: string): boolean {
  const normalized = projectFilePath.toLowerCase().replace(/\\/g, '/');
  return normalized.includes('afterimagetest')
    || /(^|[\/._\-\s])(test|tests|mock|mocks|fixture|fixtures)([\/._\-\s]|$)/i.test(normalized);
}

function isVarRecentProjectPath(projectFilePath: string): boolean {
  const normalized = projectFilePath.replace(/\\/g, '/');
  return normalized.startsWith('/var/') || normalized.startsWith('/private/var/');
}

function formatCutDisplayId(cutId: string): string {
  const matchedSuffix = cutId.match(/(cut-\d+)$/i);
  return matchedSuffix?.[1] ?? cutId;
}

export function ProjectView() {
  const api = getDesktopApi();
  const project = useProjectSessionStore((state) => state.project);
  const projectFilePath = useProjectSessionStore((state) => state.projectFilePath);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot);
  const recentProjects = useProjectSessionStore((state) => state.recentProjects);
  const dirty = useProjectSessionStore((state) => state.dirty);
  const setSession = useProjectSessionStore((state) => state.setSession);
  const setRecentProjects = useProjectSessionStore((state) => state.setRecentProjects);
  const addNotification = useUiStore((state) => state.addNotification);
  const [projectActionStates, setProjectActionStates] = useState<Record<string, 'opening' | 'removing'>>({});
  const [loadedRecentProjectPath, setLoadedRecentProjectPath] = useState<string | null>(null);
  const resolvedProjectFilePath = resolveProjectFilePath(projectFilePath, projectRoot, project.metadata.projectFileName);
  const visibleRecentProjects = useMemo(
    () => recentProjects.filter((recentProject) => !isVarRecentProjectPath(recentProject)),
    [recentProjects]
  );
  useEffect(() => {
    if (!loadedRecentProjectPath) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setLoadedRecentProjectPath((current) => current === loadedRecentProjectPath ? null : current);
    }, 1600);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadedRecentProjectPath]);

  const clearProjectActionState = (targetProjectPath: string) => {
    setProjectActionStates((current) => {
      const next = { ...current };
      delete next[targetProjectPath];
      return next;
    });
  };

  const openRecentProject = async (targetProjectPath: string) => {
    if (projectActionStates[targetProjectPath]) {
      return;
    }

    setProjectActionStates((current) => ({ ...current, [targetProjectPath]: 'opening' }));
    try {
      const session = await api.project.openProjectAt(targetProjectPath);
      setSession(session);
      setLoadedRecentProjectPath(targetProjectPath);
    } catch (error) {
      addNotification(`Could not open ${getPathBasename(targetProjectPath)}.`, 'warn', 2200);
    } finally {
      clearProjectActionState(targetProjectPath);
    }
  };

  const removeRecentProject = async (targetProjectPath: string) => {
    if (projectActionStates[targetProjectPath]) {
      return;
    }

    setProjectActionStates((current) => ({ ...current, [targetProjectPath]: 'removing' }));
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      const nextRecentProjects = await api.project.removeRecentProject(targetProjectPath);
      setRecentProjects(nextRecentProjects);
      addNotification(`Removed ${getPathBasename(targetProjectPath)} from recent projects.`, 'success', 1600);
    } catch (error) {
      addNotification(`Could not remove ${getPathBasename(targetProjectPath)}.`, 'warn', 2200);
    } finally {
      clearProjectActionState(targetProjectPath);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(420px, 0.95fr)', gap: 16, alignItems: 'stretch', height: '100%', minHeight: 0 }}>
      <Panel title="Project Home" bodyStyle={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', minHeight: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
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
        <div style={{ marginTop: 12, color: muted, fontSize: 13, lineHeight: 1.45 }}>
          <div>File: {resolvedProjectFilePath ?? 'Not saved yet'}</div>
          <div>Root: {projectRoot ?? 'Unknown'}</div>
          <div>Last saved: {project.metadata.updatedAt ?? 'Not saved yet'}</div>
        </div>
      </Panel>

      <Panel title="Recent Projects" bodyStyle={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr)', minHeight: 0 }}>
        <div className="studio-scrollable" style={{ display: 'grid', gap: 10, minHeight: 0 }}>
          <div style={{ color: muted, fontSize: 13 }}>
            {visibleRecentProjects.length} recent project{visibleRecentProjects.length === 1 ? '' : 's'}
          </div>
          {visibleRecentProjects.length > 0 ? visibleRecentProjects.map((recentProject) => (
            (() => {
              const actionState = projectActionStates[recentProject];
              const isOpening = actionState === 'opening';
              const isRemoving = actionState === 'removing';
              const isCurrentProject = recentProject === resolvedProjectFilePath;
              const isLoadedCue = loadedRecentProjectPath === recentProject;
              const statusLabel = isOpening
                ? 'Loading project…'
                : isLoadedCue
                  ? 'Loaded'
                  : isCurrentProject
                    ? 'Current project'
                    : null;

              return (
            <div
              key={recentProject}
              style={{
                background: isCurrentProject || isLoadedCue
                  ? 'linear-gradient(135deg, rgba(24, 35, 49, 0.96), rgba(17, 22, 30, 0.96))'
                  : 'rgba(255,255,255,0.04)',
                border: isCurrentProject || isLoadedCue
                  ? '1px solid rgba(181, 202, 236, 0.28)'
                  : '1px solid rgba(255,255,255,0.08)',
                boxShadow: isCurrentProject || isLoadedCue
                  ? '0 0 0 1px rgba(132, 162, 210, 0.14), 0 18px 34px rgba(5, 9, 15, 0.26)'
                  : 'none',
                color: '#f6f7f9',
                padding: '14px 16px',
                borderRadius: 16,
                lineHeight: 1.45,
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 12,
                alignItems: 'start',
                opacity: isRemoving ? 0.22 : 1,
                transform: isRemoving
                  ? 'translateX(18px) scale(0.985)'
                  : isOpening
                    ? 'translateY(-2px) scale(1.01)'
                    : isLoadedCue
                      ? 'translateY(-1px) scale(1.005)'
                      : 'translateX(0) scale(1)',
                filter: isRemoving ? 'saturate(0.72)' : 'none',
                transition: 'background 220ms ease, border-color 220ms ease, box-shadow 220ms ease, opacity 180ms ease, transform 220ms ease, filter 180ms ease'
              }}
            >
              <button
                type="button"
                onClick={() => void openRecentProject(recentProject)}
                disabled={Boolean(actionState)}
                style={{
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  color: '#f6f7f9',
                  padding: 0,
                  minWidth: 0,
                  cursor: actionState ? 'wait' : 'pointer',
                  opacity: isRemoving ? 0.6 : 1
                }}
              >
                {statusLabel ? (
                  <div
                    style={{
                      color: isLoadedCue ? '#dfeaff' : accent,
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      marginBottom: 6
                    }}
                  >
                    {statusLabel}
                  </div>
                ) : null}
                <div
                  title={recentProject}
                  style={{
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {getPathBasename(recentProject)}
                </div>
                <div
                  title={recentProject}
                  style={{
                    color: muted,
                    fontSize: 12,
                    marginTop: 4,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {recentProject}
                </div>
              </button>
              <div style={{ display: 'grid', gap: 8, alignSelf: 'center' }}>
                <button
                  type="button"
                  onClick={() => void removeRecentProject(recentProject)}
                  aria-label={`Remove ${getPathBasename(recentProject)} from recent projects`}
                  disabled={Boolean(actionState)}
                  style={{
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(19, 22, 30, 0.96)',
                    color: '#f6f7f9',
                    borderRadius: 999,
                    padding: '8px 12px',
                    fontWeight: 700,
                    cursor: actionState ? 'not-allowed' : 'pointer',
                    opacity: actionState ? 0.6 : 1,
                    transition: 'opacity 180ms ease, transform 180ms ease'
                  }}
                >
                  {isRemoving ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </div>
              );
            })()
          )) : (
            <div style={{ border: '1px dashed rgba(255,255,255,0.14)', borderRadius: 16, padding: 18, color: muted, lineHeight: 1.6 }}>
              No recent projects yet. Save this project once and it will become the quick way back into the workstation.
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

export function CatalogView() {
  const api = getDesktopApi();
  const projectFilePath = useProjectSessionStore((state) => state.projectFilePath);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot);
  const project = useProjectSessionStore((state) => state.project);
  const mergeAssets = useProjectSessionStore((state) => state.mergeImportedAssets);
  const setSession = useProjectSessionStore((state) => state.setSession);
  const addNotification = useUiStore((state) => state.addNotification);
  const [roots, setRoots] = useState<LibraryRoot[]>([]);
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<AssetRole | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const resolvedProjectFilePath = resolveProjectFilePath(projectFilePath, projectRoot, project.metadata.projectFileName);
  const catalogJobs = useJobsStore((state) => state.jobs.filter((job) => job.type === 'library-scan' || job.type === 'library-analysis'));

  const loadCatalog = async () => {
    const [nextRoots, search] = await Promise.all([
      api.library.listRoots(),
      api.library.searchAssets({
        query: deferredQuery,
        roles: roleFilter === 'all' ? undefined : [roleFilter],
        limit: 300
      })
    ]);
    setRoots(nextRoots);
    setAssets(search.assets);
    setTotal(search.total);
    setSelectedIds((current) => new Set([...current].filter((id) => search.assets.some((asset) => asset.id === id))));
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([
      api.library.listRoots(),
      api.library.searchAssets({
        query: deferredQuery,
        roles: roleFilter === 'all' ? undefined : [roleFilter],
        limit: 300
      })
    ]).then(([nextRoots, search]) => {
      if (!active) {
        return;
      }
      setRoots(nextRoots);
      setAssets(search.assets);
      setTotal(search.total);
      setSelectedIds((current) => new Set([...current].filter((id) => search.assets.some((asset) => asset.id === id))));
    }).finally(() => {
      if (active) {
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [api.library, deferredQuery, roleFilter]);

  const addRoot = async (role: AssetRole) => {
    const root = await api.library.addRoot({ role });
    if (!root) {
      addNotification('Catalog root selection cancelled.', 'warn');
      return;
    }
    await loadCatalog();
    addNotification(`Added ${role} catalog root. Scan queued.`, 'success');
  };

  const importSelected = async () => {
    const imported = await api.library.importAssets({
      projectRoot,
      assetIds: [...selectedIds]
    });
    if (imported.length === 0) {
      addNotification('No catalog assets were available to import.', 'warn');
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
    addNotification(`Imported ${imported.length} catalog asset${imported.length === 1 ? '' : 's'}.`, 'success');
  };

  const toggleSelected = (assetId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', gap: 16, height: '100%', minHeight: 0 }}>
      <Panel title="Catalog Roots" bodyStyle={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', gap: 14, minHeight: 0 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {catalogRoles.map((role) => (
              <ToolbarButton key={role.value} onClick={() => void addRoot(role.value)}>Add {role.label}</ToolbarButton>
            ))}
          </div>
          <ToolbarButton onClick={() => void api.library.rescanAll().then(loadCatalog)} disabled={roots.length === 0}>Rescan All</ToolbarButton>
        </div>
        <div className="studio-scrollable" style={{ display: 'grid', alignContent: 'start', gap: 8, minHeight: 0 }}>
          {roots.length > 0 ? roots.map((root) => (
            <div key={root.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <strong>{root.role}</strong>
                <span style={pillStyle(root.lastScanStatus === 'completed' ? 'success' : root.lastScanStatus === 'failed' ? 'warn' : 'default')}>{root.lastScanStatus}</span>
              </div>
              <div style={{ color: muted, fontSize: 12, marginTop: 8, lineHeight: 1.45, wordBreak: 'break-word' }}>{root.path}</div>
              <div style={{ marginTop: 10 }}>
                <ToolbarButton onClick={() => void api.library.rescanRoot(root.id).then(loadCatalog)}>Rescan</ToolbarButton>
              </div>
            </div>
          )) : (
            <div style={{ border: '1px dashed rgba(255,255,255,0.14)', borderRadius: 16, padding: 16, color: muted, lineHeight: 1.6 }}>
              Add reusable media folders by role. Scans include nested folders and keep project files independent from the global database.
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {catalogJobs.slice(-2).reverse().map((job) => <JobRow key={job.id} job={job} />)}
        </div>
      </Panel>

      <Panel title="Global Assets" bodyStyle={{ display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr)', minHeight: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) auto auto', gap: 10, marginBottom: 12 }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search catalog"
            style={{
              width: '100%',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(13, 16, 22, 0.92)',
              color: '#f6f7f9',
              padding: '10px 14px'
            }}
          />
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as AssetRole | 'all')}
            style={{
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(13, 16, 22, 0.92)',
              color: '#f6f7f9',
              padding: '10px 14px'
            }}
          >
            <option value="all">All roles</option>
            {catalogRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
          </select>
          <ToolbarButton primary onClick={() => void importSelected()} disabled={selectedIds.size === 0}>Import {selectedIds.size}</ToolbarButton>
        </div>
        <div style={{ color: muted, fontSize: 13, marginBottom: 10 }}>
          {loading ? 'Loading catalog...' : `${assets.length} shown${total > assets.length ? ` of ${total}` : ''}`}
        </div>
        <div className="studio-scrollable" style={{ minHeight: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
            <thead>
              <tr style={{ color: muted, fontSize: 12, textAlign: 'left' }}>
                <th style={{ width: 44 }} />
                <th>Filename</th>
                <th>Role</th>
                <th>Type</th>
                <th>Analysis</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id} style={{ background: selectedIds.has(asset.id) ? 'rgba(114, 133, 166, 0.16)' : 'rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: 10, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }}>
                    <input type="checkbox" checked={selectedIds.has(asset.id)} onChange={() => toggleSelected(asset.id)} />
                  </td>
                  <td style={{ padding: 10 }}>
                    <div style={{ fontWeight: 700 }}>{asset.filename}</div>
                    <div style={{ color: muted, fontSize: 12, marginTop: 4, maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.path}</div>
                  </td>
                  <td style={{ padding: 10 }}><span style={pillStyle()}>{asset.assetRole}</span></td>
                  <td style={{ padding: 10 }}><span style={pillStyle()}>{asset.mediaType}</span></td>
                  <td style={{ padding: 10 }}><span style={pillStyle(asset.analysisStatus === 'completed' ? 'success' : asset.analysisStatus === 'failed' ? 'warn' : 'default')}>{asset.analysisStatus}</span></td>
                  <td style={{ padding: 10, borderTopRightRadius: 12, borderBottomRightRadius: 12 }}>{asset.durationMs ? formatMillisecondsClock(asset.durationMs) : 'Unknown'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {assets.length === 0 ? (
            <div style={{ border: '1px dashed rgba(255,255,255,0.14)', borderRadius: 16, padding: 18, color: muted, lineHeight: 1.6 }}>
              No catalog assets match the current filters.
            </div>
          ) : null}
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
  const allJobs = useJobsStore((state) => state.jobs);
  const [query, setQuery] = useState('');
  const [launchLocked, setLaunchLocked] = useState(false);
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
  const visibleAnalysisJobs = useMemo(() => analysisJobs.filter((job) => job.status !== 'completed'), [analysisJobs]);
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
      addNotification('Transition mask import cancelled.', 'warn');
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
        ? `Imported ${imported.length} transition mask${imported.length === 1 ? '' : 's'} and saved the project.`
        : `Imported ${imported.length} transition mask${imported.length === 1 ? '' : 's'}${projectRoot ? '.' : ' into an unsaved project.'}`,
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(340px, 0.9fr)', gap: 16, alignItems: 'stretch', height: '100%', minHeight: 0 }}>
      <Panel title="Media Library" bodyStyle={{ display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr)', minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <ToolbarButton primary onClick={() => void importMedia()}>Import Media</ToolbarButton>
          <ToolbarButton onClick={() => void importMusic()}>Import Music</ToolbarButton>
          <ToolbarButton onClick={() => void importTransitionMasks()}>Import Masks</ToolbarButton>
          <ToolbarButton onClick={() => void importTransitionOverlays()}>Import Overlays</ToolbarButton>
        </div>
        <div style={{ marginBottom: 16 }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by filename or tag"
            style={{
              width: '100%',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(13, 16, 22, 0.92)',
              color: '#f6f7f9',
              padding: '10px 14px'
            }}
          />
        </div>
        {assets.length > 0 ? (
          <VirtualList
            items={assets}
            estimateSize={86}
            height="100%"
            renderItem={(asset) => (
              <button
                type="button"
                onClick={() => selectAsset(asset.id)}
                aria-pressed={selectedAsset?.id === asset.id}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: selectedAsset?.id === asset.id
                    ? 'linear-gradient(135deg, rgba(114, 133, 166, 0.24), rgba(255,255,255,0.05))'
                    : 'rgba(255,255,255,0.03)',
                  border: selectedAsset?.id === asset.id
                    ? '1px solid rgba(136, 160, 191, 0.55)'
                    : '1px solid rgba(255,255,255,0.08)',
                  boxShadow: selectedAsset?.id === asset.id
                    ? '0 0 0 1px rgba(136, 160, 191, 0.18) inset'
                    : 'none',
                  color: '#f6f7f9',
                  borderRadius: 16,
                  padding: 14
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{asset.label ?? asset.filename}</div>
                    <div style={{ color: muted, fontSize: 12, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {formatAssetListSubline(asset)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0 }}>
                    <span style={pillStyle(asset.analysisStatus === 'completed' ? 'success' : 'warn')}>{asset.analysisStatus}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  <span style={pillStyle()}>{asset.mediaType}</span>
                  <span style={pillStyle(asset.assetRole === 'transition-mask' || asset.assetRole === 'transition-overlay' ? 'warn' : asset.assetRole === 'music' ? 'success' : undefined)}>
                    {asset.assetRole ?? 'source'}
                  </span>
                  {asset.durationMs ? <span style={pillStyle()}>{formatMillisecondsClock(asset.durationMs)}</span> : null}
                </div>
              </button>
            )}
          />
        ) : (
          <div style={{ border: '1px dashed rgba(255,255,255,0.16)', borderRadius: 18, minHeight: 260, display: 'grid', placeItems: 'center', padding: 24 }}>
            <div style={{ maxWidth: 440, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No media has been imported</div>
              <div style={{ color: muted, lineHeight: 1.6, marginBottom: 18 }}>
                Start with source footage, then add music or transition assets once the base library is in place.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <ToolbarButton primary onClick={() => void importMedia()}>Import Source Media</ToolbarButton>
                <ToolbarButton onClick={() => void importMusic()}>Import Music</ToolbarButton>
              </div>
            </div>
          </div>
        )}
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
              <StatCard label="Active Jobs" value={String(visibleAnalysisJobs.length)} tone={visibleAnalysisJobs.length > 0 ? 'warn' : 'default'} />
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
          {visibleAnalysisJobs.length > 0 ? (
            <div className="studio-scrollable" style={{ display: 'grid', gap: 8, maxHeight: 132 }}>
              {visibleAnalysisJobs.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </div>
          ) : null}
          <div className="studio-scrollable" style={{ display: 'grid', gap: 8, minHeight: 0 }}>
            {queuedAnalysisRows.length > 0 ? queuedAnalysisRows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => selectAsset(row.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: row.id === selectedAnalysisRow?.id ? '1px solid rgba(136, 160, 191, 0.55)' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 14,
                  padding: 12,
                  background: row.id === selectedAnalysisRow?.id ? 'rgba(114, 133, 166, 0.12)' : 'rgba(255,255,255,0.03)',
                  color: '#f6f7f9'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{row.label}</div>
                    <div style={{ color: muted, fontSize: 12, marginTop: 4 }}>{formatPathTail(row.path)}</div>
                  </div>
                  <span style={pillStyle(row.analysisStatus === 'completed' ? 'success' : 'warn')}>{row.analysisStatus}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  <span style={pillStyle()}>{row.mediaType}</span>
                  <span style={pillStyle()}>{formatMillisecondsClock(row.durationMs)}</span>
                  {row.changeEventCount > 0 ? <span style={pillStyle()}>{row.changeEventCount} changes</span> : null}
                  {row.syncEventCount > 0 ? <span style={pillStyle()}>{row.syncEventCount} sync</span> : null}
                  {row.sidecarCount > 0 ? <span style={pillStyle()}>{row.sidecarCount} sidecar{row.sidecarCount === 1 ? '' : 's'}</span> : null}
                </div>
              </button>
            )) : (
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
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 16, height: '100%', minHeight: 0 }}>
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
      <Panel title="Analysis" bodyStyle={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr)', minHeight: 0 }}>
        <div className="studio-scrollable" style={{
          overflow: 'auto',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 18,
          background: 'rgba(15, 18, 24, 0.88)',
          minHeight: 0
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
                      background: checked ? 'rgba(114, 133, 166, 0.14)' : 'transparent',
                      boxShadow: checked ? 'inset 2px 0 0 #88a0bf' : 'none',
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
  const currentTab = useUiStore((state) => state.currentTab);
  const selectedCutId = useUiStore((state) => state.selectedCutId);
  const selectCut = useUiStore((state) => state.selectCut);
  const addNotification = useUiStore((state) => state.addNotification);
  const addCutToSequence = useProjectSessionStore((state) => state.addCutToSequence);
  const updateCutStatus = useProjectSessionStore((state) => state.updateCutStatus);
  const toggleCutFavorite = useProjectSessionStore((state) => state.toggleCutFavorite);
  const trimCutAction = useProjectSessionStore((state) => state.trimCut);
  const [query, setQuery] = useState('');
  const [brokenThumbnailPaths, setBrokenThumbnailPaths] = useState<Set<string>>(() => new Set());
  const [draftStartMs, setDraftStartMs] = useState(0);
  const [draftEndMs, setDraftEndMs] = useState(1);
  const [previewCurrentMs, setPreviewCurrentMs] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const previewRef = useRef<HTMLVideoElement | null>(null);
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
  const selectedAsset = selectedCut ? assetById.get(selectedCut.assetId) : undefined;
  const previewDurationMs = Math.max(selectedAsset?.durationMs ?? 0, selectedCut?.endMs ?? 0, 1);
  const draftDurationMs = Math.max(1, draftEndMs - draftStartMs);
  const hasDraftChanges = Boolean(selectedCut && (draftStartMs !== selectedCut.startMs || draftEndMs !== selectedCut.endMs));
  const markThumbnailBroken = (thumbnailPath?: string) => {
    if (!thumbnailPath) {
      return;
    }

    setBrokenThumbnailPaths((current) => {
      if (current.has(thumbnailPath)) {
        return current;
      }

      const next = new Set(current);
      next.add(thumbnailPath);
      return next;
    });
  };

  const selectRelativeCut = (baseCutId: string, delta: -1 | 1 | 0 = 1) => {
    const index = cuts.findIndex((cut) => cut.id === baseCutId);
    if (index < 0) {
      return;
    }
    const nextIndex = clamp(index + delta, 0, Math.max(cuts.length - 1, 0));
    selectCut(cuts[nextIndex]?.id);
  };

  const reviewCut = (cutId: string, status: 'kept' | 'rejected') => {
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
    addCutToSequence(selectedCut.id);
    addNotification(`Added ${selectedCut.id} to sequence.`, 'success', 1200);
    selectRelativeCut(selectedCut.id, 1);
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

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        reviewCut(selectedCut.id, 'kept');
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        reviewCut(selectedCut.id, 'rejected');
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        selectRelativeCut(selectedCut.id, 1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        selectRelativeCut(selectedCut.id, -1);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        addSelectedCutToSequence();
        return;
      }

      if (event.key === ' ') {
        event.preventDefault();
        const video = previewRef.current;
        if (!video) {
          return;
        }
        if (video.paused) {
          void video.play().catch(() => undefined);
        } else {
          video.pause();
        }
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
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.36fr) minmax(360px, 0.86fr)', gap: 16, alignItems: 'stretch', height: '100%', minHeight: 0 }}>
      <Panel title="Cut Prep" bodyStyle={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr)', minHeight: 0 }}>
        {selectedCut && selectedAsset ? (
          <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 14, minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent, fontWeight: 800 }}>Prep Before Sequence</div>
                <div
                  title={selectedCut.id}
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    marginTop: 4,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {formatCutDisplayId(selectedCut.id)}
                </div>
                <div style={{ color: muted, fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
                  {assetLabels.get(selectedCut.assetId) ?? selectedCut.assetId}
                  {(selectedCut.tags?.length ?? 0) > 0 ? ` • ${(selectedCut.tags ?? []).join(', ')}` : ''}
                </div>
                <div title={selectedCut.id} style={{ color: muted, fontSize: 12, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {selectedCut.id}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span style={pillStyle(selectedCut.favorite ? 'success' : 'default')}>{selectedCut.favorite ? 'favorite' : (selectedCut.status ?? 'new')}</span>
                {hasDraftChanges ? <span style={pillStyle('warn')}>trim pending</span> : null}
                <span style={pillStyle()}>{formatMillisecondsClock(draftDurationMs)}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto', gap: 14, minHeight: 0 }}>
              <div
                style={{
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 20,
                  padding: 18,
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
                    borderRadius: 18,
                    background: '#090a0d',
                    objectFit: 'contain'
                  }}
                />
              </div>

              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 16, background: 'linear-gradient(180deg, rgba(13, 17, 24, 0.97), rgba(10, 13, 18, 0.94))', display: 'grid', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                  <StatCard label="In" value={formatMillisecondsClock(draftStartMs)} />
                  <StatCard label="Out" value={formatMillisecondsClock(draftEndMs)} />
                  <StatCard label="Selected" value={formatMillisecondsClock(draftDurationMs)} tone={hasDraftChanges ? 'warn' : 'default'} />
                  <StatCard label="Asset" value={formatMillisecondsClock(previewDurationMs)} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(320px, 0.7fr)', gap: 14, alignItems: 'start' }}>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: muted, fontSize: 12, marginBottom: 12 }}>
                        <span>Source timeline</span>
                        <span>Playhead {formatMillisecondsDetail(previewCurrentMs)}</span>
                      </div>
                      <div style={{ position: 'relative', height: 58, borderRadius: 18, overflow: 'hidden', background: 'linear-gradient(90deg, rgba(83, 99, 122, 0.28), rgba(102, 152, 135, 0.18), rgba(119, 102, 156, 0.24))', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '5% 100%' }} />
                        <div
                          style={{
                            position: 'absolute',
                            top: 8,
                            bottom: 8,
                            left: `${(draftStartMs / previewDurationMs) * 100}%`,
                            width: `${Math.max(((draftEndMs - draftStartMs) / previewDurationMs) * 100, 0.8)}%`,
                            borderRadius: 14,
                            background: 'linear-gradient(90deg, rgba(136,160,191,0.9), rgba(122, 193, 165, 0.76))',
                            boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)'
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            left: `${(draftStartMs / previewDurationMs) * 100}%`,
                            top: 5,
                            width: 3,
                            height: 48,
                            background: '#d8e7fb',
                            boxShadow: '0 0 0 1px rgba(10,13,18,0.9)'
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            left: `${(draftEndMs / previewDurationMs) * 100}%`,
                            top: 5,
                            width: 3,
                            height: 48,
                            background: '#d8e7fb',
                            boxShadow: '0 0 0 1px rgba(10,13,18,0.9)'
                          }}
                        />
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: muted, fontSize: 12, marginTop: 10 }}>
                        <span>0</span>
                        <span>{formatMillisecondsDetail(draftStartMs)}</span>
                        <span>{formatMillisecondsDetail(draftEndMs)}</span>
                        <span>{formatMillisecondsDetail(previewDurationMs)}</span>
                      </div>
                    </div>

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

                    <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: muted, fontSize: 12 }}>
                          <span>Mark in</span>
                          <span>{formatMillisecondsDetail(draftStartMs)}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr) 72px', gap: 8, alignItems: 'center' }}>
                          <ToolbarButton onClick={() => updateDraftRange(draftStartMs - 100, draftEndMs, { snapTo: 'start' })}>-100</ToolbarButton>
                          <input
                            type="range"
                            min={0}
                            max={Math.max(draftEndMs - 1, 1)}
                            step={10}
                            value={Math.min(draftStartMs, Math.max(draftEndMs - 1, 1))}
                            onChange={(event) => updateDraftRange(Number(event.target.value), draftEndMs, { snapTo: 'start' })}
                          />
                          <ToolbarButton onClick={() => updateDraftRange(draftStartMs + 100, draftEndMs, { snapTo: 'start' })}>+100</ToolbarButton>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: muted, fontSize: 12 }}>
                          <span>Mark out</span>
                          <span>{formatMillisecondsDetail(draftEndMs)}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr) 72px', gap: 8, alignItems: 'center' }}>
                          <ToolbarButton onClick={() => updateDraftRange(draftStartMs, draftEndMs - 100, { snapTo: 'end' })}>-100</ToolbarButton>
                          <input
                            type="range"
                            min={Math.min(draftStartMs + 1, previewDurationMs)}
                            max={previewDurationMs}
                            step={10}
                            value={clamp(draftEndMs, Math.min(draftStartMs + 1, previewDurationMs), previewDurationMs)}
                            onChange={(event) => updateDraftRange(draftStartMs, Number(event.target.value), { snapTo: 'end' })}
                          />
                          <ToolbarButton onClick={() => updateDraftRange(draftStartMs, draftEndMs + 100, { snapTo: 'end' })}>+100</ToolbarButton>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                      <ToolbarButton onClick={() => {
                        const video = previewRef.current;
                        if (!video) {
                          return;
                        }
                        if (video.paused) {
                          void video.play().catch(() => undefined);
                        } else {
                          video.pause();
                        }
                      }}
                      >
                        Play / Pause
                      </ToolbarButton>
                      <ToolbarButton onClick={() => updateDraftRange(previewCurrentMs, draftEndMs, { snapTo: 'start' })}>Set In @ Playhead</ToolbarButton>
                      <ToolbarButton onClick={() => updateDraftRange(draftStartMs, previewCurrentMs, { snapTo: 'end' })}>Set Out @ Playhead</ToolbarButton>
                      <ToolbarButton onClick={() => seekPreview(draftStartMs)}>Jump In</ToolbarButton>
                      <ToolbarButton onClick={() => seekPreview(draftEndMs)}>Jump Out</ToolbarButton>
                      <ToolbarButton disabled={!hasDraftChanges} onClick={() => {
                        if (!selectedCut) {
                          return;
                        }
                        setDraftStartMs(selectedCut.startMs);
                        setDraftEndMs(selectedCut.endMs);
                        seekPreview(selectedCut.startMs);
                      }}
                      >
                        Reset
                      </ToolbarButton>
                      <ToolbarButton primary disabled={!hasDraftChanges} onClick={() => applyDraftTrim({ notify: true })}>Apply Trim</ToolbarButton>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                      <ToolbarButton onClick={() => reviewCut(selectedCut.id, 'rejected')}>Reject</ToolbarButton>
                      <ToolbarButton onClick={() => reviewCut(selectedCut.id, 'kept')}>Keep</ToolbarButton>
                      <ToolbarButton primary onClick={addSelectedCutToSequence}>Add To Sequence</ToolbarButton>
                      <ToolbarButton onClick={() => toggleCutFavorite(selectedCut.id)}>Favorite</ToolbarButton>
                    </div>

                    <div style={{ color: muted, fontSize: 12, lineHeight: 1.6 }}>
                      `Right` keep, `Left` reject, `Up/Down` navigate, `Enter` add, `Space` play/pause, `I` set in, `O` set out.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ border: '1px dashed rgba(255,255,255,0.16)', borderRadius: 18, minHeight: 280, display: 'grid', placeItems: 'center', color: muted }}>
            Select a cut to preview it.
          </div>
        )}
      </Panel>

      <Panel title="Cut Browser" bodyStyle={{ display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr)', minHeight: 0 }}>
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
        <div style={{ color: muted, fontSize: 12, marginBottom: 12 }}>
          {cuts.length} cuts ready for review.
        </div>
        <VirtualList
          items={cuts}
          estimateSize={122}
          activeIndex={selectedCutIndex}
          height="100%"
          renderItem={(cut) => {
            const hasWorkingThumbnail = !!cut.thumbnailPath && !brokenThumbnailPaths.has(cut.thumbnailPath);
            const cutStatusTone = cut.status === 'kept'
              ? 'success'
              : cut.status === 'rejected'
                ? 'warn'
                : cut.favorite
                  ? 'success'
                  : 'default';
            const assetLabel = assetLabels.get(cut.assetId) ?? cut.assetId;

            return (
              <button
                type="button"
                onClick={() => selectCut(cut.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: cut.id === selectedCut?.id ? '1px solid rgba(136,160,191,0.85)' : '1px solid rgba(255,255,255,0.08)',
                  boxShadow: cut.id === selectedCut?.id ? '0 0 0 1px rgba(136,160,191,0.22)' : 'none',
                  borderRadius: 16,
                  padding: 12,
                  background: cut.id === selectedCut?.id ? 'rgba(114,133,166,0.12)' : 'rgba(255,255,255,0.03)',
                  color: '#f6f7f9',
                  overflow: 'hidden'
                }}>
                <div style={{ display: 'grid', gridTemplateColumns: '104px minmax(0, 1fr)', gap: 12, alignItems: 'center' }}>
                  <div
                    style={{
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(10, 12, 18, 0.92)',
                      borderRadius: 14,
                      padding: 0,
                      overflow: 'hidden',
                      aspectRatio: '16 / 9',
                      minHeight: 58
                    }}
                  >
                    {hasWorkingThumbnail ? (
                      <img
                        src={toMediaSrc(cut.thumbnailPath)}
                        alt={cut.id}
                        loading="lazy"
                        decoding="async"
                        onError={() => markThumbnailBroken(cut.thumbnailPath)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: muted, fontSize: 12 }}>
                        {cut.thumbnailPath ? 'Thumbnail unavailable' : 'No thumbnail'}
                      </div>
                    )}
                  </div>
                  <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ color: accent, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          {formatCutDisplayId(cut.id)}
                        </div>
                        <div
                          title={assetLabel}
                          style={{
                            fontWeight: 700,
                            marginTop: 4,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {assetLabel}
                        </div>
                        <div
                          title={cut.id}
                          style={{
                            color: muted,
                            fontSize: 12,
                            marginTop: 4,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {cut.id}
                        </div>
                      </div>
                      <span style={pillStyle(cutStatusTone)}>{cut.status ?? 'new'}</span>
                    </div>
                    <div
                      style={{
                        color: muted,
                        fontSize: 12,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {formatMillisecondsClock(cut.startMs)} {'->'} {formatMillisecondsClock(cut.endMs)} • {formatMillisecondsClock(cut.durationMs)}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {cut.favorite ? <span style={pillStyle('success')}>favorite</span> : null}
                      {cut.sceneScore !== undefined ? <span style={pillStyle()}>scene {cut.sceneScore.toFixed(2)}</span> : null}
                    </div>
                  </div>
                </div>
              </button>
            );
          }}
        />
      </Panel>
    </div>
  );
}

export function SequenceView() {
  const api = getDesktopApi();
  const project = useProjectSessionStore((state) => state.project);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot) ?? '.';
  const allJobs = useJobsStore((state) => state.jobs);
  const previewPath = useUiStore((state) => state.previewPath);
  const setPreviewPath = useUiStore((state) => state.setPreviewPath);
  const setCurrentTab = useUiStore((state) => state.setCurrentTab);
  const selectedVariantId = useUiStore((state) => state.selectedVariantId);
  const selectVariant = useUiStore((state) => state.selectVariant);
  const buildVariantFromReviewedCutsAction = useProjectSessionStore((state) => state.buildVariantFromReviewedCuts);
  const buildNewVariantFromReviewedCutsAction = useProjectSessionStore((state) => state.buildNewVariantFromReviewedCuts);
  const deleteVariantAction = useProjectSessionStore((state) => state.deleteVariant);
  const moveClipAction = useProjectSessionStore((state) => state.moveClip);
  const removeClipAction = useProjectSessionStore((state) => state.removeClip);
  const trimClipAction = useProjectSessionStore((state) => state.trimClip);
  const setClipOverlayAssetAction = useProjectSessionStore((state) => state.setClipOverlayAsset);
  const setClipTransitionAction = useProjectSessionStore((state) => state.setClipTransition);
  const setClipTransitionDurationAction = useProjectSessionStore((state) => state.setClipTransitionDuration);
  const setClipTransitionAssetAction = useProjectSessionStore((state) => state.setClipTransitionAsset);
  const randomizeFoundryTransitionsAction = useProjectSessionStore((state) => state.randomizeFoundryTransitions);
  const randomizeFoundryOverlaysAction = useProjectSessionStore((state) => state.randomizeFoundryOverlays);
  const duplicateVariantAction = useProjectSessionStore((state) => state.duplicateVariant);
  const addMarkerAction = useProjectSessionStore((state) => state.addMarker);
  const addSectionAction = useProjectSessionStore((state) => state.addSection);
  const variant = useMemo(() => getCurrentVariant(project, selectedVariantId), [project, selectedVariantId]);
  const transitionMaskAssets = useMemo(() => filterTransitionAssets(project.assets, 'mask'), [project.assets]);
  const overlayAssets = useMemo(() => filterTransitionAssets(project.assets, 'overlay'), [project.assets]);
  const transitionMaskOptions = useMemo(
    () => transitionMaskAssets.map((asset) => ({ id: asset.id, label: formatSequenceAssetLabel(asset), title: asset.label ?? asset.filename })),
    [transitionMaskAssets]
  );
  const overlayOptions = useMemo(
    () => overlayAssets.map((asset) => ({ id: asset.id, label: formatSequenceAssetLabel(asset), title: asset.label ?? asset.filename })),
    [overlayAssets]
  );
  const canRandomizeFoundry = Boolean(variant && variant.clips.length > 1 && transitionMaskAssets.length > 0);
  const canRandomizeOverlays = Boolean(variant && variant.clips.length > 0 && overlayAssets.length > 0);
  const variantSequence = useMemo(
    () => variant ? project.sequences.find((candidate) => candidate.id === variant.sequenceId) : undefined,
    [project.sequences, variant]
  );
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
                    borderRadius: 999,
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
              onClick={() => {
                if (!variant) {
                  return;
                }

                setPreviewPath(undefined);
                void api.jobs.runPreview({
                  project,
                  projectRoot,
                  variantId: variant.id,
                  outputPath: `${projectRoot}/.afterimage/preview/${variant.id}.mp4`
                });
              }}
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
            <ToolbarButton disabled={!canRandomizeFoundry} onClick={() => variant && randomizeFoundryTransitionsAction(variant.id)}>Shuffle Masks</ToolbarButton>
            <ToolbarButton disabled={!canRandomizeOverlays} onClick={() => variant && randomizeFoundryOverlaysAction(variant.id)}>Shuffle Overlays</ToolbarButton>
            <ToolbarButton onClick={() => variant && addMarkerAction(variant.id, `Marker ${Date.now() % 1000}`, 500)}>Add Marker</ToolbarButton>
            <ToolbarButton onClick={() => variant && addSectionAction(variant.id, `Section ${Date.now() % 1000}`, 0, 1500)}>Add Section</ToolbarButton>
          </div>
        </div>
        {previewJob && previewJob.status !== 'completed' ? (
          <div style={{ marginBottom: 16 }}>
            <JobRow job={previewJob} />
          </div>
        ) : null}
        <div className="studio-scrollable" style={{ display: 'grid', gap: 10, minHeight: 0 }}>
          {(variant?.clips.length ?? 0) > 0 ? (variant?.clips ?? []).map((clip, clipIndex, clips) => {
            const canUseMaskTransition = clipIndex < clips.length - 1;

            return (
              <div key={clip.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14, background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'start' }}>
                  <div style={{ minWidth: 0 }}>
                    <strong>{clip.id}</strong>
                    <div style={{ color: muted, fontSize: 13 }}>timeline {clip.timelineStartMs}ms | source {clip.sourceStartMs}ms | duration {clip.durationMs}ms</div>
                    <div style={{ color: muted, fontSize: 13 }}>
                      transition {clip.transition}
                      {clip.transition !== 'cut' ? ` @ ${clip.transitionDurationMs ?? 600}ms` : ''}
                      {clip.transition === 'mask' ? ' | white reveals next clip' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <ToolbarButton onClick={() => variant && moveClipAction(variant.id, clip.id, -1)}>Up</ToolbarButton>
                    <ToolbarButton onClick={() => variant && moveClipAction(variant.id, clip.id, 1)}>Down</ToolbarButton>
                    <ToolbarButton onClick={() => variant && trimClipAction(variant.id, clip.id, -250)}>[</ToolbarButton>
                    <ToolbarButton onClick={() => variant && trimClipAction(variant.id, clip.id, 250)}>]</ToolbarButton>
                    <ToolbarButton onClick={() => variant && removeClipAction(variant.id, clip.id)}>Remove</ToolbarButton>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 180px minmax(0, 1fr)', gap: 12, marginTop: 14, alignItems: 'start' }}>
                  <label style={{ display: 'grid', gap: 6, color: muted, fontSize: 12, minWidth: 0 }}>
                    Clip overlay
                    <select
                      value={clip.overlayAssetId ?? ''}
                      onChange={(event) => variant && setClipOverlayAssetAction(variant.id, clip.id, event.target.value || undefined)}
                      style={{ width: '100%', minWidth: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#f6f7f9', borderRadius: 10, padding: '8px 10px' }}
                      title={overlayAssets.find((asset) => asset.id === clip.overlayAssetId)?.label ?? overlayAssets.find((asset) => asset.id === clip.overlayAssetId)?.filename}
                    >
                      <option value="">No overlay</option>
                      {overlayOptions.map((asset) => (
                        <option key={asset.id} value={asset.id} title={asset.title}>{asset.label}</option>
                      ))}
                    </select>
                  </label>

                  <div style={{ display: 'grid', gap: 10 }}>
                    <label style={{ display: 'grid', gap: 6, color: muted, fontSize: 12, minWidth: 0 }}>
                      Transition
                      <select
                        value={clip.transition}
                        onChange={(event) => variant && setClipTransitionAction(variant.id, clip.id, event.target.value as TransitionStyle)}
                        style={{ width: '100%', minWidth: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#f6f7f9', borderRadius: 10, padding: '8px 10px' }}
                      >
                        <option value="cut">Cut</option>
                        <option value="crossfade">Crossfade</option>
                        <option value="mask" disabled={!canUseMaskTransition}>Mask</option>
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: 6, color: muted, fontSize: 12, minWidth: 0 }}>
                      Duration ms
                      <input
                        type="number"
                        min={100}
                        step={50}
                        value={clip.transition === 'cut' ? '' : String(clip.transitionDurationMs ?? 600)}
                        disabled={clip.transition === 'cut'}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value);
                          if (!variant || Number.isNaN(nextValue)) {
                            return;
                          }
                          setClipTransitionDurationAction(variant.id, clip.id, nextValue);
                        }}
                        style={{ width: '100%', minWidth: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#f6f7f9', borderRadius: 10, padding: '8px 10px' }}
                      />
                    </label>
                  </div>

                  <label style={{ display: 'grid', gap: 6, color: muted, fontSize: 12, minWidth: 0 }}>
                    Mask asset
                    <select
                      value={clip.transitionAssetId ?? ''}
                      disabled={clip.transition !== 'mask'}
                      onChange={(event) => variant && setClipTransitionAssetAction(variant.id, clip.id, event.target.value || undefined)}
                      style={{ width: '100%', minWidth: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#f6f7f9', borderRadius: 10, padding: '8px 10px' }}
                      title={transitionMaskAssets.find((asset) => asset.id === clip.transitionAssetId)?.label ?? transitionMaskAssets.find((asset) => asset.id === clip.transitionAssetId)?.filename}
                    >
                      <option value="">Select mask asset…</option>
                      {transitionMaskOptions.map((asset) => (
                        <option key={asset.id} value={asset.id} title={asset.title}>{asset.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                  {clip.transition === 'mask' ? (
                    <div style={{ color: muted, fontSize: 12, lineHeight: 1.5 }}>
                      White luma in the mask reveals the next clip.
                      {!clip.transitionAssetId ? ' Pick a mask asset before building preview.' : ''}
                    </div>
                  ) : (
                    <div style={{ color: muted, fontSize: 12, lineHeight: 1.5 }}>
                      Use masks for reveal transitions. Overlays stay independent and ride over the clip.
                    </div>
                  )}
                  {clip.overlayAssetId ? (
                    <div style={{ color: muted, fontSize: 12, lineHeight: 1.5 }}>
                      Overlay is blended over this clip independently of the transition.
                    </div>
                  ) : null}
                </div>
              </div>
            );
          }) : (
            <div style={{ border: '1px dashed rgba(255,255,255,0.16)', borderRadius: 18, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>No sequence has been assembled yet</div>
              <div style={{ color: muted, lineHeight: 1.6, maxWidth: 520, margin: '0 auto 18px' }}>
                Review cuts first, then build a sequence from approved material. The sequence builder becomes useful once you have something worth arranging.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <ToolbarButton primary onClick={() => setCurrentTab('cuts')}>Open Cut Review</ToolbarButton>
                <ToolbarButton disabled={!variant} onClick={() => variant && buildVariantFromReviewedCutsAction(variant.id, 'balanced')}>
                  Build From Approved Cuts
                </ToolbarButton>
              </div>
            </div>
          )}
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
  const stack = useMemo(() => getStackForCurrentVariant(project, selectedVariantId), [project, selectedVariantId]);
  const presets = useMemo(() => loadPresetLibrary().presets, []);
  const selectedFilter = useMemo(
    () => stack?.filters.find((filter) => filter.id === selectedFilterId) ?? stack?.filters[0],
    [selectedFilterId, stack]
  );
  const selectedFilterDefinition = getFilterDefinition(selectedFilter?.type ?? '');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16, height: '100%', minHeight: 0 }}>
      <Panel title="Style Stack" bodyStyle={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {supportedFilterDefinitions.map((definition) => (
            <ToolbarButton key={definition.type} primary={definition.type === 'contrast'} onClick={() => addFilter(definition.type)}>
              Add {definition.label}
            </ToolbarButton>
          ))}
          <ToolbarButton onClick={() => stack && randomizeStack(stack.id)}>Randomize Stack</ToolbarButton>
        </div>
        <div className="studio-scrollable" style={{ display: 'grid', gap: 10, minHeight: 0 }}>
          {stack?.filters.map((filter, index) => (
            <div key={filter.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => selectFilter(filter.id)}
                  style={{
                    border: selectedFilter?.id === filter.id ? '1px solid rgba(136, 160, 191, 0.42)' : 'none',
                    background: selectedFilter?.id === filter.id ? 'rgba(114, 133, 166, 0.12)' : 'transparent',
                    color: '#f6f7f9',
                    padding: 10,
                    borderRadius: 12,
                    textAlign: 'left',
                    flex: 1
                  }}
                >
                  <strong>{getFilterDefinition(filter.type)?.label ?? filter.type}</strong>
                  <div style={{ color: muted, fontSize: 13 }}>mix {Number(filter.mix ?? 1).toFixed(2)} • {filter.enabled === false ? 'bypassed' : 'enabled'}</div>
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <ToolbarButton onClick={() => stack && moveFilter(stack.id, filter.id, -1)} disabled={index === 0}>Up</ToolbarButton>
                  <ToolbarButton onClick={() => stack && moveFilter(stack.id, filter.id, 1)} disabled={index === (stack.filters.length - 1)}>Down</ToolbarButton>
                  <ToolbarButton onClick={() => stack && toggleFilter(stack.id, filter.id)}>{filter.enabled === false ? 'Enable' : 'Bypass'}</ToolbarButton>
                  <ToolbarButton onClick={() => stack && randomizeFilter(stack.id, filter.id)}>Randomize</ToolbarButton>
                  <ToolbarButton onClick={() => stack && removeFilter(stack.id, filter.id)}>Remove</ToolbarButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div style={{ display: 'grid', gap: 16, minHeight: 0 }}>
        <Panel title="Filter Editor" bodyStyle={{ minHeight: 0 }}>
          {stack && selectedFilter && selectedFilterDefinition ? (
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{selectedFilterDefinition.label}</div>
                <div style={{ color: muted, fontSize: 13 }}>{selectedFilter.id}</div>
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
          <div className="studio-scrollable" style={{ display: 'grid', gap: 10, minHeight: 0 }}>
            {presets.map((preset) => (
              <div key={preset.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <strong>{preset.name}</strong>
                    <div style={{ color: muted, fontSize: 13 }}>
                      {preset.filters.map((filter) => getFilterDefinition(filter.type)?.label ?? filter.type).join(' • ')}
                    </div>
                  </div>
                  <span style={pillStyle()}>{preset.family}</span>
                </div>
                <div style={{ marginTop: 12 }}>
                  <ToolbarButton onClick={() => applyPreset(preset.id)}>Apply To Sequence Stack</ToolbarButton>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

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
  const stack = useMemo(() => getStackForCurrentVariant(project, selectedVariantId), [project, selectedVariantId]);
  const stackFilters = stack?.filters ?? [];
  const targetFilter = stackFilters.find((filter) => filter.id === selectedFilterId) ?? stackFilters[0];
  const targetProperties = getSupportedAutomationProperties(targetFilter?.type ?? '');
  const variant = useMemo(() => getCurrentVariant(project, selectedVariantId), [project, selectedVariantId]);
  const durationMs = useMemo(
    () => Math.max(...(variant?.clips.map((clip) => clip.timelineStartMs + clip.durationMs) ?? [0]), 1),
    [variant]
  );

  return (
    <div style={{ display: 'grid', gap: 16, height: '100%', minHeight: 0 }}>
      <Panel title="Automation" bodyStyle={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <ToolbarButton
            primary
            onClick={() => targetFilter && addLane(targetFilter.id, targetProperties[0] ?? 'mix', `Lane ${project.automationLanes.length + 1}`)}
            disabled={!targetFilter}
          >
            Add Lane
          </ToolbarButton>
        </div>
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

export function ExportView() {
  const api = getDesktopApi();
  const project = useProjectSessionStore((state) => state.project);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot) ?? '.';
  const toggleProfile = useProjectSessionStore((state) => state.toggleExportProfile);
  const selectedVariantId = useUiStore((state) => state.selectedVariantId);
  const selectVariant = useUiStore((state) => state.selectVariant);
  const allJobs = useJobsStore((state) => state.jobs);
  const variant = useMemo(() => getCurrentVariant(project, selectedVariantId), [project, selectedVariantId]);
  const exportJobs = useMemo(() => allJobs.filter((job) => job.type === 'export'), [allJobs]);
  const enabledProfileIds = useMemo(() => getEnabledExportProfileIds(project.exportSelections), [project.exportSelections]);

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) minmax(220px, 0.75fr)', gap: 16, height: '100%', minHeight: 0 }}>
      <Panel title="Export Profiles" bodyStyle={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {project.variants.map((candidate, index) => (
            <ToolbarButton key={candidate.id} primary={candidate.id === variant?.id} onClick={() => selectVariant(candidate.id)}>
              {formatSequenceName(candidate.name, index)}
            </ToolbarButton>
          ))}
        </div>
        <div className="studio-scrollable" style={{ display: 'grid', gap: 10, minHeight: 0 }}>
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
      <Panel title="Render Queue" bodyStyle={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr)', minHeight: 0 }}>
        <div className="studio-scrollable" style={{ display: 'grid', gap: 8, minHeight: 0 }}>
          {exportJobs.length > 0 ? exportJobs.map((job) => (
            <JobRow key={job.id} job={job} />
          )) : (
            <div style={{ border: '1px dashed rgba(255,255,255,0.14)', borderRadius: 16, padding: 18, color: muted, lineHeight: 1.6 }}>
              No export jobs yet. Enable at least one delivery profile, then render the selected sequence and watch the queue here.
            </div>
          )}
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
    <div style={{ display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr) minmax(0, 1fr)', gap: 16, height: '100%', minHeight: 0 }}>
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
      <Panel title="Job Log" bodyStyle={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr)', minHeight: 0 }}>
        <div className="studio-scrollable" style={{ display: 'grid', gap: 8, minHeight: 0 }}>
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      </Panel>
      <Panel title="Application Log" bodyStyle={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr)', minHeight: 0 }}>
        <div className="studio-scrollable" style={{ display: 'grid', gap: 8, minHeight: 0 }}>
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
    case 'catalog':
      return <CatalogView />;
    case 'media':
      return <MediaView />;
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
