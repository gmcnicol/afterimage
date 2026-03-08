import { normalizeProject, type AutomationLane, type NormalizedProjectFile } from '@afterimage/project-model';

export function addAutomationLane(project: NormalizedProjectFile, lane: AutomationLane): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    automationLanes: [...project.automationLanes, lane]
  });
}

export function addLaneKeyframe(project: NormalizedProjectFile, laneId: string, keyframe: { id: string; timeMs: number; value: number }): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    automationLanes: project.automationLanes.map((lane) => lane.id === laneId ? {
      ...lane,
      keyframes: [...lane.keyframes, keyframe]
    } : lane)
  });
}

export function resetLane(project: NormalizedProjectFile, laneId: string): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    automationLanes: project.automationLanes.map((lane) => lane.id === laneId ? {
      ...lane,
      keyframes: []
    } : lane)
  });
}
