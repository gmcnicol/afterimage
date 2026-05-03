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
import { useProjectOverviewClient } from './hooks';
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

export function ProjectView() {
  const api = useProjectOverviewClient();
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
