import { normalizeProject, type AutomationKeyframe, type AutomationLane, type AutomationTargetProperty, type NormalizedProjectFile } from '@afterimage/project-model';

function sortKeyframes(keyframes: AutomationKeyframe[]): AutomationKeyframe[] {
  return [...keyframes].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id));
}

export function addAutomationLane(project: NormalizedProjectFile, lane: AutomationLane): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    automationLanes: [...project.automationLanes, lane],
    filterStacks: project.filterStacks.map((stack) => ({
      ...stack,
      filters: stack.filters.map((filter) => filter.id === lane.target.filterId ? {
        ...filter,
        automationLaneIds: Array.from(new Set([...(filter.automationLaneIds ?? []), lane.id]))
      } : filter)
    }))
  });
}

export function removeAutomationLane(project: NormalizedProjectFile, laneId: string): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    automationLanes: project.automationLanes.filter((lane) => lane.id !== laneId),
    filterStacks: project.filterStacks.map((stack) => ({
      ...stack,
      filters: stack.filters.map((filter) => ({
        ...filter,
        automationLaneIds: (filter.automationLaneIds ?? []).filter((candidate) => candidate !== laneId)
      }))
    }))
  });
}

export function updateAutomationLaneTarget(
  project: NormalizedProjectFile,
  laneId: string,
  target: { filterId: string; property: AutomationTargetProperty }
): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    automationLanes: project.automationLanes.map((lane) => lane.id === laneId ? {
      ...lane,
      target
    } : lane),
    filterStacks: project.filterStacks.map((stack) => ({
      ...stack,
      filters: stack.filters.map((filter) => ({
        ...filter,
        automationLaneIds: filter.id === target.filterId
          ? Array.from(new Set([...(filter.automationLaneIds ?? []), laneId]))
          : (filter.automationLaneIds ?? []).filter((candidate) => candidate !== laneId)
      }))
    }))
  });
}

export function setAutomationLaneEnabled(project: NormalizedProjectFile, laneId: string, enabled: boolean): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    automationLanes: project.automationLanes.map((lane) => lane.id === laneId ? {
      ...lane,
      enabled
    } : lane)
  });
}

export function addLaneKeyframe(project: NormalizedProjectFile, laneId: string, keyframe: AutomationKeyframe): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    automationLanes: project.automationLanes.map((lane) => lane.id === laneId ? {
      ...lane,
      keyframes: sortKeyframes([...lane.keyframes, keyframe])
    } : lane)
  });
}

export function updateLaneKeyframe(
  project: NormalizedProjectFile,
  laneId: string,
  keyframeId: string,
  patch: Partial<Pick<AutomationKeyframe, 'timeMs' | 'value'>>
): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    automationLanes: project.automationLanes.map((lane) => lane.id === laneId ? {
      ...lane,
      keyframes: sortKeyframes(lane.keyframes.map((keyframe) => keyframe.id === keyframeId ? {
        ...keyframe,
        ...patch
      } : keyframe))
    } : lane)
  });
}

export function removeLaneKeyframe(project: NormalizedProjectFile, laneId: string, keyframeId: string): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    automationLanes: project.automationLanes.map((lane) => lane.id === laneId ? {
      ...lane,
      keyframes: lane.keyframes.filter((keyframe) => keyframe.id !== keyframeId)
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
