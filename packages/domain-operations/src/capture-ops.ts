import {
  normalizeProject,
  type CaptureEvent,
  type CaptureSession,
  type EntropyState,
  type ModulationRoute,
  type NormalizedProjectFile
} from '@afterimage/project-model';

export function addModulationRoute(project: NormalizedProjectFile, route: ModulationRoute): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    composition: {
      ...project.composition,
      modulationRoutes: [...project.composition.modulationRoutes, route]
    }
  });
}

export function updateModulationRoute(project: NormalizedProjectFile, routeId: string, patch: Partial<ModulationRoute>): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    composition: {
      ...project.composition,
      modulationRoutes: project.composition.modulationRoutes.map((route) => route.id === routeId ? {
        ...route,
        ...patch,
        id: route.id
      } : route)
    }
  });
}

export function removeModulationRoute(project: NormalizedProjectFile, routeId: string): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    composition: {
      ...project.composition,
      modulationRoutes: project.composition.modulationRoutes.filter((route) => route.id !== routeId)
    }
  });
}

export function addEntropyState(project: NormalizedProjectFile, state: EntropyState): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    composition: {
      ...project.composition,
      entropyStates: [...project.composition.entropyStates, state]
    }
  });
}

export function updateEntropyState(project: NormalizedProjectFile, stateId: string, patch: Partial<EntropyState>): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    composition: {
      ...project.composition,
      entropyStates: project.composition.entropyStates.map((state) => state.id === stateId ? {
        ...state,
        ...patch,
        id: state.id
      } : state)
    }
  });
}

export function removeEntropyState(project: NormalizedProjectFile, stateId: string): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    composition: {
      ...project.composition,
      entropyStates: project.composition.entropyStates.filter((state) => state.id !== stateId)
    }
  });
}

export function createCaptureSession(project: NormalizedProjectFile, session: CaptureSession): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    captureSessions: [...project.captureSessions, session],
    captureLogs: [
      ...project.captureLogs,
      {
        id: `log-${session.id}`,
        captureSessionId: session.id,
        events: []
      }
    ]
  });
}

export function completeCaptureSession(project: NormalizedProjectFile, sessionId: string, completedAt: string): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    captureSessions: project.captureSessions.map((session) => session.id === sessionId ? {
      ...session,
      status: 'completed',
      completedAt
    } : session)
  });
}

export function appendCaptureEvent(project: NormalizedProjectFile, logId: string, event: Omit<CaptureEvent, 'index'> & { index?: number }): NormalizedProjectFile {
  const targetLog = project.captureLogs.find((log) => log.id === logId);
  const nextIndex = event.index ?? ((targetLog?.events.reduce((max, candidate) => Math.max(max, candidate.index), -1) ?? -1) + 1);

  return normalizeProject({
    ...project,
    captureLogs: project.captureLogs.map((log) => log.id === logId ? {
      ...log,
      events: [
        ...log.events,
        {
          ...event,
          index: nextIndex
        }
      ]
    } : log)
  });
}
