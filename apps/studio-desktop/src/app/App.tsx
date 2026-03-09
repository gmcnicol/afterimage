import { useState } from 'react';
import { Screen } from '@afterimage/ui';
import { getDesktopApi } from '../lib/desktop-api';
import { useJobsStore } from '../stores/jobs-store';
import { useProjectSessionStore } from '../stores/project-session-store';
import { useUiStore } from '../stores/ui-store';
import { ToolbarButton } from './components/ToolbarButton';
import { useDesktopBootstrap } from './hooks/useDesktopBootstrap';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useProjectAutosave } from './hooks/useProjectAutosave';
import { accent, muted, pillStyle } from './styles';
import { resolveProjectFilePath, tabs } from './utils';
import { ActiveView } from './views';

function NotificationCenter() {
  const notifications = useUiStore((state) => state.notifications);
  const removeNotification = useUiStore((state) => state.removeNotification);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 24,
      right: 24,
      display: 'grid',
      gap: 10,
      zIndex: 20,
      width: 360
    }}>
      {notifications.map((notification) => (
        <button
          key={notification.id}
          type="button"
          onClick={() => removeNotification(notification.id)}
          style={{
            textAlign: 'left',
            borderRadius: 16,
            padding: '12px 16px',
            border: `1px solid ${notification.tone === 'success' ? 'rgba(112, 231, 183, 0.35)' : notification.tone === 'warn' ? 'rgba(255, 159, 127, 0.35)' : 'rgba(151, 179, 255, 0.35)'}`,
            background: notification.tone === 'success'
              ? 'linear-gradient(135deg, rgba(56, 123, 97, 0.28), rgba(255,255,255,0.03))'
              : notification.tone === 'warn'
                ? 'linear-gradient(135deg, rgba(244, 135, 98, 0.15), rgba(255,255,255,0.03))'
                : 'linear-gradient(135deg, rgba(91, 137, 255, 0.18), rgba(255,255,255,0.03))',
            color: '#f6f7f9',
            boxShadow: '0 18px 40px rgba(0,0,0,0.28)'
          }}
        >
          {notification.message}
        </button>
      ))}
    </div>
  );
}

function Sidebar() {
  const currentTab = useUiStore((state) => state.currentTab);
  const setCurrentTab = useUiStore((state) => state.setCurrentTab);

  return (
    <aside style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setCurrentTab(tab.id)}
          style={{
            textAlign: 'left',
            borderRadius: 18,
            border: tab.id === currentTab ? '1px solid rgba(255, 159, 127, 0.48)' : '1px solid rgba(255,255,255,0.07)',
            background: tab.id === currentTab ? 'linear-gradient(135deg, rgba(244, 135, 98, 0.18), rgba(255,255,255,0.03))' : 'rgba(18, 21, 29, 0.92)',
            color: '#f6f7f9',
            padding: '14px 16px',
            fontWeight: 700
          }}
        >
          {tab.label}
        </button>
      ))}
    </aside>
  );
}

function Header() {
  const api = getDesktopApi();
  const currentTab = useUiStore((state) => state.currentTab);
  const addNotification = useUiStore((state) => state.addNotification);
  const project = useProjectSessionStore((state) => state.project);
  const projectFilePath = useProjectSessionStore((state) => state.projectFilePath);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot);
  const dirty = useProjectSessionStore((state) => state.dirty);
  const setSession = useProjectSessionStore((state) => state.setSession);
  const jobs = useJobsStore((state) => state.jobs);
  const [savingProject, setSavingProject] = useState(false);

  const saveProject = async () => {
    if (savingProject) {
      return;
    }

    setSavingProject(true);
    try {
      const resolvedProjectFilePath = resolveProjectFilePath(projectFilePath, projectRoot, project.metadata.projectFileName);
      const session = await api.project.saveProject({ project, projectFilePath: resolvedProjectFilePath });
      setSession(session);
      addNotification('Saved project.', 'success', 1800);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes('cancelled')) {
        addNotification(`Save failed: ${message}`, 'warn', 3600);
      }
    } finally {
      setSavingProject(false);
    }
  };

  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 20 }}>
      <div>
        <div style={{ color: accent, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 12, fontWeight: 800 }}>Afterimage Studio Desktop</div>
        <h1 style={{ margin: '8px 0 4px', fontSize: 34 }}>Offline authoring workstation</h1>
        <div style={{ color: muted }}>{project.name} • {project.assets.length} assets • {project.cutCandidates.length} cuts • {jobs.filter((job) => job.status === 'running').length} active jobs</div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <ToolbarButton primary onClick={() => void saveProject()} disabled={savingProject}>
          {savingProject ? 'Saving…' : 'Save'}
        </ToolbarButton>
        <span style={pillStyle(dirty ? 'warn' : 'success')}>{dirty ? 'Unsaved project' : 'Saved project'}</span>
        <span style={pillStyle()}>{currentTab}</span>
      </div>
    </header>
  );
}

export function App() {
  useDesktopBootstrap();
  useProjectAutosave();
  useKeyboardShortcuts();

  return (
    <Screen>
      <div style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top left, rgba(244, 135, 98, 0.18), transparent 28%), radial-gradient(circle at bottom right, rgba(91, 137, 255, 0.12), transparent 22%), linear-gradient(180deg, #0c0f14, #0a0d12 55%, #090b10)',
        color: '#f6f7f9',
        fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
        padding: 24
      }}>
        <Header />
        <NotificationCenter />
        <div style={{ display: 'grid', gridTemplateColumns: '240px minmax(0, 1fr)', gap: 18 }}>
          <Sidebar />
          <main style={{ display: 'grid', gap: 16 }}>
            <ActiveView />
          </main>
        </div>
      </div>
    </Screen>
  );
}
