import { useProjectSessionStore } from '../stores/project-session-store';
import { useDesktopBootstrap } from './hooks/useDesktopBootstrap';
import { LoadingShell, StudioShell } from './shell';

export function App() {
  useDesktopBootstrap();
  const ready = useProjectSessionStore((state) => state.ready);

  return ready ? <StudioShell /> : <LoadingShell />;
}
