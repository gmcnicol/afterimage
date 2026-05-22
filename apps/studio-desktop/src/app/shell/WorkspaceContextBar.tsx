import { useProjectSessionStore } from '../../stores/project-session-store';
import { useUiStore } from '../../stores/ui-store';
import { pillStyle } from '../styles';
import { resolveProjectFilePath } from '../utils';
import { getWorkspaceDefinition, getWorkspaceSurface } from './registry';
import { useWorkflowMetrics } from './useWorkflowMetrics';
import { getSurfaceBadge, getSurfaceStatus } from './workspace-status';

export function WorkspaceContextBar() {
  const currentSpace = useUiStore((state) => state.currentSpace);
  const currentTab = useUiStore((state) => state.currentTab);
  const setWorkspaceSurface = useUiStore((state) => state.setWorkspaceSurface);
  const project = useProjectSessionStore((state) => state.project);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot);
  const projectFilePath = useProjectSessionStore((state) => state.projectFilePath);
  const dirty = useProjectSessionStore((state) => state.dirty);
  const metrics = useWorkflowMetrics();
  const activeWorkspace = getWorkspaceDefinition(currentSpace);
  const resolvedProjectFilePath = resolveProjectFilePath(projectFilePath, projectRoot, project.metadata.projectFileName);
  const surfaces = activeWorkspace.surfaces;

  return (
    <div className="studio-contextbar" aria-label={`${activeWorkspace.label} workspace`}>
      <div className="studio-contextbar__tabs">
        {surfaces.length > 1 ? surfaces.map((tab) => {
          const status = getSurfaceStatus(tab, metrics);
          const badge = getSurfaceBadge(tab, metrics);
          const surface = getWorkspaceSurface(tab);
          const isCurrent = currentTab === tab;
          return (
            <button
              key={tab}
              type="button"
              title={surface.description}
              className={`studio-contextbar__tab${isCurrent ? ' is-current' : ''}`}
              aria-current={isCurrent ? 'page' : undefined}
              onClick={() => setWorkspaceSurface(currentSpace, tab)}
            >
              {surface.label}
              {badge ? ` ${badge}` : ''}
              {' '}
              {status.label}
            </button>
          );
        }) : (
          <span className="studio-statusbar__label">{getWorkspaceSurface(surfaces[0]).description}</span>
        )}
      </div>
      <div className="studio-contextbar__meta">
        <span>{project.name}</span>
        <span style={pillStyle(dirty ? 'warn' : 'success')}>{dirty ? 'Unsaved' : 'Saved'}</span>
        {metrics.warningCount > 0 || metrics.missingMediaCount > 0 ? (
          <span style={pillStyle('warn')}>{metrics.warningCount + metrics.missingMediaCount} issues</span>
        ) : null}
        <span title={resolvedProjectFilePath}>{resolvedProjectFilePath ?? 'Unsaved project file'}</span>
      </div>
    </div>
  );
}
