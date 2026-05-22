import { Screen } from '@afterimage/ui';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useProjectAutosave } from '../hooks/useProjectAutosave';
import { ActiveView } from '../views';
import { BottomTaskStatusBar } from './BottomTaskStatusBar';
import { MacroNavigation } from './MacroNavigation';
import { NotificationCenter } from './NotificationCenter';
import { TaskFlyout } from './TaskFlyout';
import { WorkspaceContextBar } from './WorkspaceContextBar';

export function StudioShell() {
  useProjectAutosave();
  useKeyboardShortcuts();

  return (
    <Screen>
      <div className="studio-shell">
        <NotificationCenter />
        <div className="studio-shell__frame">
          <MacroNavigation />
          <main className="studio-shell__main">
            <WorkspaceContextBar />
            <div className="studio-main-surface">
              <ActiveView />
            </div>
          </main>
          <BottomTaskStatusBar />
        </div>
        <TaskFlyout />
      </div>
    </Screen>
  );
}
