import { useEffect, useEffectEvent, useRef } from 'react';
import { getStudioClient } from '../../lib/studio-client';
import { useProjectSessionStore } from '../../stores/project-session-store';
import { useUiStore } from '../../stores/ui-store';
import { resolveProjectFilePath } from '../utils';

export function useProjectAutosave(): void {
  const api = getStudioClient();
  const project = useProjectSessionStore((state) => state.project);
  const projectFilePath = useProjectSessionStore((state) => state.projectFilePath);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot);
  const dirty = useProjectSessionStore((state) => state.dirty);
  const setSession = useProjectSessionStore((state) => state.setSession);
  const addNotification = useUiStore((state) => state.addNotification);
  const autosaveTimerRef = useRef<number | undefined>(undefined);
  const autosavingRef = useRef(false);

  const autosave = useEffectEvent(async () => {
    const resolvedProjectFilePath = resolveProjectFilePath(projectFilePath, projectRoot, project.metadata.projectFileName);
    if (!resolvedProjectFilePath || autosavingRef.current) {
      return;
    }

    autosavingRef.current = true;
    try {
      const latestState = useProjectSessionStore.getState();
      const latestProjectFilePath = resolveProjectFilePath(
        latestState.projectFilePath,
        latestState.projectRoot,
        latestState.project.metadata.projectFileName
      );
      if (!latestState.dirty || !latestProjectFilePath) {
        return;
      }

      const session = await api.project.saveProject({
        project: latestState.project,
        projectFilePath: latestProjectFilePath
      });
      setSession(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addNotification(`Autosave failed: ${message}`, 'warn', 5200);
    } finally {
      autosavingRef.current = false;
    }
  });

  useEffect(() => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = undefined;
    }

    const resolvedProjectFilePath = resolveProjectFilePath(projectFilePath, projectRoot, project.metadata.projectFileName);
    if (!dirty || !resolvedProjectFilePath) {
      return;
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      void autosave();
    }, 900);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = undefined;
      }
    };
  }, [autosave, dirty, project, projectFilePath, projectRoot]);
}
