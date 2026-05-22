import { useUiStore } from '../../stores/ui-store';
import { getPrimaryWorkspaces, getWorkspaceDefinition } from './registry';

export function MacroNavigation() {
  const currentSpace = useUiStore((state) => state.currentSpace);
  const setCurrentSpace = useUiStore((state) => state.setCurrentSpace);
  const setWorkspaceSurface = useUiStore((state) => state.setWorkspaceSurface);
  const currentWorkspace = getWorkspaceDefinition(currentSpace);
  const primaryWorkspaces = getPrimaryWorkspaces();

  return (
    <nav className="studio-macrobar" aria-label="Studio spaces">
      <div className="studio-macrobar__modes">
        {primaryWorkspaces.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            className={`studio-macrobar__button${currentSpace === workspace.id ? ' is-current' : ''}`}
            aria-current={currentSpace === workspace.id ? 'page' : undefined}
            onClick={() => setCurrentSpace(workspace.id)}
          >
            {workspace.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="studio-macrobar__button studio-macrobar__action"
        onClick={() => setWorkspaceSurface(currentSpace, currentWorkspace.primaryAction.targetTab)}
      >
        {currentWorkspace.primaryAction.label}
      </button>
      <div className="studio-macrobar__right">
        <button
          type="button"
          className={`studio-macrobar__button${currentSpace === 'observatory' ? ' is-current' : ''}`}
          aria-current={currentSpace === 'observatory' ? 'page' : undefined}
          onClick={() => setCurrentSpace('observatory')}
        >
          Observatory
        </button>
      </div>
    </nav>
  );
}
