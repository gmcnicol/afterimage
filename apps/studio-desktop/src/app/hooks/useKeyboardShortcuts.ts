import { startTransition, useEffect, useEffectEvent } from 'react';
import { getDefaultVariant } from '@afterimage/project-model';
import { getDesktopApi } from '../../lib/desktop-api';
import { useProjectSessionStore } from '../../stores/project-session-store';
import { useUiStore } from '../../stores/ui-store';
import { getEnabledExportProfileIds, resolveProjectFilePath } from '../utils';

export function useKeyboardShortcuts(): void {
  const api = getDesktopApi();
  const currentTab = useUiStore((state) => state.currentTab);
  const setCurrentTab = useUiStore((state) => state.setCurrentTab);
  const project = useProjectSessionStore((state) => state.project);
  const projectFilePath = useProjectSessionStore((state) => state.projectFilePath);
  const projectRoot = useProjectSessionStore((state) => state.projectRoot);
  const selectedCutId = useUiStore((state) => state.selectedCutId);
  const selectedFilterId = useUiStore((state) => state.selectedFilterId);
  const selectedVariantId = useUiStore((state) => state.selectedVariantId);
  const updateCutFavorite = useProjectSessionStore((state) => state.toggleCutFavorite);
  const addCutToSequence = useProjectSessionStore((state) => state.addCutToSequence);
  const safeRandomizeFilter = useProjectSessionStore((state) => state.safeRandomizeFilter);
  const safeRandomizeStack = useProjectSessionStore((state) => state.safeRandomizeStack);
  const addNotification = useUiStore((state) => state.addNotification);
  const save = useEffectEvent(async () => {
    try {
      const resolvedProjectFilePath = resolveProjectFilePath(projectFilePath, projectRoot, project.metadata.projectFileName);
      const session = await api.project.saveProject({
        project,
        projectFilePath: resolvedProjectFilePath
      });
      useProjectSessionStore.getState().setSession(session);
      addNotification('Saved project.', 'success', 1800);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('cancelled')) {
        return;
      }
      addNotification(`Save failed: ${message}`, 'warn', 3600);
    }
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey;

      if (isMeta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }

      if (isMeta && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void api.project.openProject().then((session) => {
          if (session) {
            useProjectSessionStore.getState().setSession(session);
          }
        });
      }

      if (isMeta && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        void api.project.createProject().then((session) => {
          if (session) {
            useProjectSessionStore.getState().setSession(session);
          }
        });
      }

      if (event.key.toLowerCase() === 'a' && selectedCutId) {
        event.preventDefault();
        addCutToSequence(selectedCutId);
      }

      if (event.key.toLowerCase() === 'f' && selectedCutId) {
        event.preventDefault();
        updateCutFavorite(selectedCutId);
      }

      if (event.key.toLowerCase() === 'r' && selectedFilterId) {
        event.preventDefault();
        const stackId = project.variants.find((variant) => variant.id === (selectedVariantId ?? getDefaultVariant(project)?.id))?.stackId;
        if (stackId) {
          safeRandomizeFilter(stackId, selectedFilterId);
        }
      }

      if (event.shiftKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        const stackId = project.variants.find((variant) => variant.id === (selectedVariantId ?? getDefaultVariant(project)?.id))?.stackId;
        if (stackId) {
          safeRandomizeStack(stackId);
        }
      }

      if (isMeta && event.key === 'Enter') {
        event.preventDefault();
        void api.jobs.runExport({
          project,
          projectRoot: projectRoot ?? '.',
          outputPath: `${projectRoot ?? '.'}/exports/${project.id}`,
          profileIds: getEnabledExportProfileIds(project.exportSelections),
          selections: project.exportSelections
        });
        setCurrentTab('export');
      }

      if (event.key === ' ' && currentTab !== 'cuts') {
        event.preventDefault();
        startTransition(() => {
          setCurrentTab(currentTab === 'sequence' ? 'cuts' : 'sequence');
        });
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [addCutToSequence, addNotification, api.jobs, api.project, currentTab, project, projectFilePath, projectRoot, safeRandomizeFilter, safeRandomizeStack, save, selectedCutId, selectedFilterId, selectedVariantId, setCurrentTab, updateCutFavorite]);
}
