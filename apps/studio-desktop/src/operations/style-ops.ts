import {
  getFilterStackById,
  normalizeProject,
  type FilterInstance,
  type NormalizedProjectFile
} from '@afterimage/project-model';

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function addFilterToStack(project: NormalizedProjectFile, stackId: string, filter: Omit<FilterInstance, 'orderIndex'>): NormalizedProjectFile {
  const stack = getFilterStackById(project, stackId);
  if (!stack) {
    return project;
  }

  return normalizeProject({
    ...project,
    filterStacks: project.filterStacks.map((candidate) => candidate.id === stackId ? {
      ...candidate,
      filters: [
        ...candidate.filters,
        {
          ...filter,
          orderIndex: candidate.filters.length
        }
      ]
    } : candidate)
  });
}

export function toggleFilterEnabled(project: NormalizedProjectFile, stackId: string, filterId: string): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    filterStacks: project.filterStacks.map((stack) => stack.id === stackId ? {
      ...stack,
      filters: stack.filters.map((filter) => filter.id === filterId ? {
        ...filter,
        enabled: !(filter.enabled ?? true)
      } : filter)
    } : stack)
  });
}

export function safeRandomizeFilter(project: NormalizedProjectFile, stackId: string, filterId: string): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    filterStacks: project.filterStacks.map((stack) => stack.id === stackId ? {
      ...stack,
      filters: stack.filters.map((filter) => filter.id === filterId ? {
        ...filter,
        mix: clamp(((filter.mix ?? 0.5) * 0.7) + 0.2),
        parameters: {
          ...filter.parameters,
          amount: clamp((Number(filter.parameters?.amount ?? 0.3) * 0.8) + 0.12)
        }
      } : filter)
    } : stack)
  });
}

export function safeRandomizeStack(project: NormalizedProjectFile, stackId: string): NormalizedProjectFile {
  const stack = getFilterStackById(project, stackId);
  if (!stack) {
    return project;
  }

  return stack.filters.reduce(
    (nextProject, filter) => safeRandomizeFilter(nextProject, stackId, filter.id),
    project
  );
}
