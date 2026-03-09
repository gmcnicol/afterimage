import { useEffect, useEffectEvent, useRef } from 'react';
import type { DesktopJob } from '../../lib/desktop-api';
import { getDesktopApi } from '../../lib/desktop-api';
import { useDiagnosticsStore } from '../../stores/diagnostics-store';
import { useJobsStore } from '../../stores/jobs-store';
import { useProjectSessionStore } from '../../stores/project-session-store';
import { useUiStore } from '../../stores/ui-store';

export function useDesktopBootstrap(): void {
  const api = getDesktopApi();
  const setSession = useProjectSessionStore((state) => state.setSession);
  const setJobs = useJobsStore((state) => state.setJobs);
  const upsertJobs = useJobsStore((state) => state.upsertJobs);
  const setReport = useDiagnosticsStore((state) => state.setReport);
  const setLogs = useDiagnosticsStore((state) => state.setLogs);
  const setProject = useProjectSessionStore((state) => state.setProject);
  const setPreviewPath = useUiStore((state) => state.setPreviewPath);
  const handledProjectJobIds = useRef(new Set<string>());

  const applyJobEffects = useEffectEvent(async (jobs: DesktopJob[]) => {
    upsertJobs(jobs);
    for (const job of jobs) {
      if ((job.status === 'failed' || job.status === 'cancelled') && job.result?.project) {
        handledProjectJobIds.current.add(job.id);
      }

      if (job.status === 'completed' && job.result?.project && !handledProjectJobIds.current.has(job.id)) {
        handledProjectJobIds.current.add(job.id);
        const currentSession = useProjectSessionStore.getState();

        if (currentSession.projectFilePath) {
          try {
            const session = await api.project.saveProject({
              project: job.result.project,
              projectFilePath: currentSession.projectFilePath
            });
            useProjectSessionStore.getState().setSession(session);
          } catch {
            setProject(job.result.project);
          }
        } else {
          setProject(job.result.project);
        }
      }
      if (job.status === 'completed' && job.result?.kind === 'preview' && job.result.outputPath) {
        setPreviewPath(job.result.outputPath);
      }
    }
  });

  const refreshDiagnostics = useEffectEvent(async () => {
    const [report, logs] = await Promise.all([
      api.diagnostics.getReport(),
      api.diagnostics.getLogs()
    ]);
    setReport(report);
    setLogs(logs);
  });

  useEffect(() => {
    let isActive = true;

    void (async () => {
      const [session, jobs, report, logs] = await Promise.all([
        api.project.getInitialState(),
        api.jobs.list(),
        api.diagnostics.getReport(),
        api.diagnostics.getLogs()
      ]);

      if (!isActive) {
        return;
      }

      const currentSession = useProjectSessionStore.getState();
      const shouldApplySession = !currentSession.dirty
        && currentSession.project.assets.length === 0
        && !currentSession.projectFilePath;

      if (shouldApplySession) {
        setSession(session);
      }
      setJobs(jobs);
      setReport(report);
      setLogs(logs);
    })();

    const unsubscribe = api.jobs.subscribe((jobs) => {
      if (isActive) {
        applyJobEffects(jobs);
        void refreshDiagnostics();
      }
    });

    const intervalId = window.setInterval(() => {
      if (isActive) {
        void refreshDiagnostics();
      }
    }, 2000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
      unsubscribe();
    };
  }, [api, applyJobEffects, refreshDiagnostics, setJobs, setLogs, setReport, setSession]);
}
