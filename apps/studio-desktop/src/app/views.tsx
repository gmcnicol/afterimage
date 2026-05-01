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
import { getDesktopApi, type DesktopJob, type LibraryAsset, type LibraryRoot, type LibrarySearchRequest } from '../lib/desktop-api';
import { useDiagnosticsStore } from '../stores/diagnostics-store';
import { useJobsStore } from '../stores/jobs-store';
import { useProjectSessionStore } from '../stores/project-session-store';
import { useUiStore } from '../stores/ui-store';
import { accent, muted, pillStyle } from './styles';
import { getEnabledExportProfileIds, resolveProjectFilePath, toMediaSrc } from './utils';
import { JobRow } from './components/JobRow';
import { StatCard } from './components/StatCard';
import { StudioDataGrid, type StudioGridAction } from './components/StudioDataGrid';
import { ToolbarButton } from './components/ToolbarButton';

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
  { value: 'source', label: 'Footage' },
  { value: 'transition-mask', label: 'Transitions' },
  { value: 'transition-overlay', label: 'Overlays' }
];

function formatCatalogRole(role: AssetRole): string {
  return catalogRoles.find((candidate) => candidate.value === role)?.label ?? formatParameterLabel(role);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getSceneSegments(analysis: AnalysisFile | null | undefined) {
  if (!analysis) {
    return [];
  }

  const durationMs = Math.max(analysis.summary?.durationMs ?? analysis.probe.durationMs ?? 0, 0);
  const cutPoints = analysis.sceneCuts
    .map((scene) => Math.max(0, Math.min(durationMs, Math.round(scene.timeMs))))
    .filter((timeMs) => timeMs > 0 && timeMs < durationMs)
    .sort((left, right) => left - right);
  const boundaries = [0, ...cutPoints, durationMs].filter((timeMs, index, values) => index === 0 || timeMs > values[index - 1]);

  return boundaries.slice(0, -1).map((startMs, index) => {
    const endMs = boundaries[index + 1];
    return {
      id: `scene-${index + 1}-${startMs}`,
      index,
      startMs,
      endMs,
      durationMs: Math.max(0, endMs - startMs),
      score: analysis.sceneCuts.find((scene) => Math.round(scene.timeMs) === startMs)?.score
    };
  }).filter((scene) => scene.durationMs > 0);
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

function formatSequenceCutLabel(project: NormalizedProjectFile, cut: CutCandidate): string {
  const asset = getAssetById(project, cut.assetId);
  const assetLabel = asset ? formatSequenceAssetLabel(asset) : cut.assetId;
  return `${assetLabel} @ ${formatMillisecondsClock(cut.startMs)} (${formatMillisecondsClock(cut.durationMs)})`;
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
                    borderRadius: 7,
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
  const filterColumns = useMemo<ColDef<FilterInstance>[]>(() => [
    {
      field: 'type',
      headerName: 'Filter',
      minWidth: 160,
      cellRenderer: ({ data }: { data?: FilterInstance }) => data ? <strong>{getFilterDefinition(data.type)?.label ?? data.type}</strong> : null
    },
    { field: 'mix', headerName: 'Mix', width: 90, valueFormatter: ({ value }) => Number(value ?? 1).toFixed(2) },
    { field: 'enabled', headerName: 'State', width: 110, valueFormatter: ({ value }) => value === false ? 'bypassed' : 'enabled' },
    {
      headerName: 'Actions',
      width: 260,
      sortable: false,
      cellRenderer: ({ data, node }: { data?: FilterInstance; node?: { rowIndex: number | null } }) => data && stack ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <ToolbarButton onClick={() => moveFilter(stack.id, data.id, -1)} disabled={(node?.rowIndex ?? 0) === 0} style={{ padding: '5px 7px' }}>Up</ToolbarButton>
          <ToolbarButton onClick={() => moveFilter(stack.id, data.id, 1)} disabled={(node?.rowIndex ?? 0) === stack.filters.length - 1} style={{ padding: '5px 7px' }}>Down</ToolbarButton>
          <ToolbarButton onClick={() => toggleFilter(stack.id, data.id)} style={{ padding: '5px 7px' }}>{data.enabled === false ? 'Enable' : 'Bypass'}</ToolbarButton>
          <ToolbarButton onClick={() => randomizeFilter(stack.id, data.id)} style={{ padding: '5px 7px' }}>Randomize</ToolbarButton>
          <ToolbarButton onClick={() => removeFilter(stack.id, data.id)} style={{ padding: '5px 7px' }}>Remove</ToolbarButton>
        </div>
      ) : null
    }
  ], [moveFilter, randomizeFilter, removeFilter, stack, toggleFilter]);
  const presetColumns = useMemo<ColDef<(typeof presets)[number]>[]>(() => [
    { field: 'name', headerName: 'Preset', minWidth: 170, cellRenderer: ({ value }: { value?: string }) => <strong>{value}</strong> },
    { field: 'family', headerName: 'Family', width: 120, cellRenderer: ({ value }: { value?: string }) => <span style={pillStyle()}>{value}</span> },
    {
      headerName: 'Filters',
      flex: 1.4,
      valueGetter: ({ data }) => data?.filters.map((filter) => getFilterDefinition(filter.type)?.label ?? filter.type).join(', ') ?? ''
    },
    {
      headerName: 'Actions',
      width: 120,
      sortable: false,
      cellRenderer: ({ data }: { data?: (typeof presets)[number] }) => data ? <ToolbarButton onClick={() => applyPreset(data.id)} style={{ padding: '5px 7px' }}>Apply</ToolbarButton> : null
    }
  ], [applyPreset, presets]);

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
        <StudioDataGrid
          rows={stack?.filters ?? []}
          columns={filterColumns}
          focusedRowId={selectedFilter?.id}
          onFocusRow={(filter) => selectFilter(filter.id)}
          onRowOpen={(filter) => selectFilter(filter.id)}
          rowHeight={48}
          emptyMessage="No filters in this stack"
        />
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
          <StudioDataGrid rows={presets} columns={presetColumns} rowHeight={48} emptyMessage="No presets available" />
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
      <Panel title="Render Queue" bodyStyle={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr)', minHeight: 0 }}>
        <div style={{ display: 'grid', minHeight: 0 }}>
          {exportJobs.length > 0 ? (
            <StudioDataGrid rows={exportJobs} columns={jobColumns} rowHeight={46} emptyMessage="No export jobs yet" />
          ) : (
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
