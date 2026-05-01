import {
  getDefaultFilterParameters,
  getFilterDefinition,
  getFilterStackById,
  getPrimaryAutomationProperty,
  getPresetById,
  normalizeProject,
  type AutomationTargetProperty,
  type FilterInstance,
  type JsonPrimitive,
  type NormalizedProjectFile,
  type SupportedFilterType
} from '@afterimage/project-model';

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function reindexFilters(filters: FilterInstance[]): FilterInstance[] {
  return filters.map((filter, index) => ({
    ...filter,
    orderIndex: index
  }));
}

function makeAuthoredFilter(filter: Omit<FilterInstance, 'orderIndex'>): Omit<FilterInstance, 'orderIndex'> {
  if (!getFilterDefinition(filter.type)) {
    return {
      ...filter,
      parameters: { ...(filter.parameters ?? {}) },
      mix: clampUnit(Number(filter.mix ?? 1))
    };
  }

  return {
    ...filter,
    parameters: {
      ...getDefaultFilterParameters(filter.type as SupportedFilterType),
      ...(filter.parameters ?? {})
    },
    mix: clampUnit(Number(filter.mix ?? 1))
  };
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
      filters: reindexFilters([
        ...candidate.filters,
        {
          ...makeAuthoredFilter(filter),
          orderIndex: candidate.filters.length
        }
      ])
    } : candidate)
  });
}

export function removeFilterFromStack(project: NormalizedProjectFile, stackId: string, filterId: string): NormalizedProjectFile {
  const removedFilter = getFilterStackById(project, stackId)?.filters.find((filter) => filter.id === filterId);
  if (!removedFilter) {
    return project;
  }

  const removedLaneIds = new Set(removedFilter.automationLaneIds ?? []);

  return normalizeProject({
    ...project,
    filterStacks: project.filterStacks.map((stack) => stack.id === stackId ? {
      ...stack,
      filters: reindexFilters(stack.filters.filter((filter) => filter.id !== filterId))
    } : {
      ...stack,
      filters: stack.filters.map((filter) => ({
        ...filter,
        automationLaneIds: (filter.automationLaneIds ?? []).filter((laneId) => !removedLaneIds.has(laneId))
      }))
    }),
    automationLanes: project.automationLanes.filter((lane) => !removedLaneIds.has(lane.id))
  });
}

export function moveFilterInStack(project: NormalizedProjectFile, stackId: string, filterId: string, direction: -1 | 1): NormalizedProjectFile {
  const stack = getFilterStackById(project, stackId);
  if (!stack) {
    return project;
  }

  const index = stack.filters.findIndex((filter) => filter.id === filterId);
  if (index < 0) {
    return project;
  }

  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= stack.filters.length) {
    return project;
  }

  const filters = [...stack.filters];
  const [moved] = filters.splice(index, 1);
  filters.splice(nextIndex, 0, moved);

  return normalizeProject({
    ...project,
    filterStacks: project.filterStacks.map((candidate) => candidate.id === stackId ? {
      ...candidate,
      filters: reindexFilters(filters)
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

export function updateFilterMix(project: NormalizedProjectFile, stackId: string, filterId: string, mix: number): NormalizedProjectFile {
  return normalizeProject({
    ...project,
    filterStacks: project.filterStacks.map((stack) => stack.id === stackId ? {
      ...stack,
      filters: stack.filters.map((filter) => filter.id === filterId ? {
        ...filter,
        mix: clampUnit(mix)
      } : filter)
    } : stack)
  });
}

export function updateFilterParameter(
  project: NormalizedProjectFile,
  stackId: string,
  filterId: string,
  key: Exclude<AutomationTargetProperty, 'mix'>,
  value: number
): NormalizedProjectFile {
  const stack = getFilterStackById(project, stackId);
  const filter = stack?.filters.find((candidate) => candidate.id === filterId);
  const definition = filter ? getFilterDefinition(filter.type) : undefined;
  const parameter = definition?.parameters.find((candidate) => candidate.key === key);
  if (!parameter) {
    return project;
  }

  const clampedValue = Math.max(parameter.min, Math.min(parameter.max, value));

  return normalizeProject({
    ...project,
    filterStacks: project.filterStacks.map((candidate) => candidate.id === stackId ? {
      ...candidate,
      filters: candidate.filters.map((stackFilter) => stackFilter.id === filterId ? {
        ...stackFilter,
        parameters: {
          ...(stackFilter.parameters ?? {}),
          [key]: clampedValue
        }
      } : stackFilter)
    } : candidate)
  });
}

export function safeRandomizeFilter(project: NormalizedProjectFile, stackId: string, filterId: string): NormalizedProjectFile {
  const stack = getFilterStackById(project, stackId);
  const filter = stack?.filters.find((candidate) => candidate.id === filterId);
  const definition = filter ? getFilterDefinition(filter.type) : undefined;
  if (!filter || !definition) {
    return project;
  }

  let nextProject = updateFilterMix(project, stackId, filterId, ((filter.mix ?? 0.5) * 0.7) + 0.2);
  for (const parameter of definition.parameters) {
    const currentValue = Number(filter.parameters?.[parameter.key] ?? parameter.defaultValue);
    const randomizedValue = Math.max(
      parameter.min,
      Math.min(parameter.max, (currentValue * 0.78) + (parameter.defaultValue * 0.22))
    );
    nextProject = updateFilterParameter(nextProject, stackId, filterId, parameter.key, randomizedValue);
  }

  return nextProject;
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

export function applyPresetToStack(project: NormalizedProjectFile, presetId: string, stackId: string): NormalizedProjectFile {
  const preset = getPresetById(project, presetId);
  const stack = getFilterStackById(project, stackId);
  if (!preset || !stack) {
    return project;
  }

  const filters = preset.filters.flatMap((presetFilter, index) => {
    const definition = getFilterDefinition(presetFilter.type);
    const primaryKey = getPrimaryAutomationProperty(presetFilter.type);
    if (!definition || !primaryKey) {
      return [];
    }

    const parameters: Record<string, JsonPrimitive> = {
      ...getDefaultFilterParameters(definition.type)
    };
    parameters[primaryKey] = clampUnit(presetFilter.amount);

    return [{
      id: `${stackId}-${preset.id}-${index + 1}`,
      type: presetFilter.type,
      enabled: true,
      orderIndex: index,
      parameters,
      mix: clampUnit(presetFilter.mix ?? 1),
      seed: presetFilter.seed
    } satisfies FilterInstance];
  });

  return normalizeProject({
    ...project,
    filterStacks: project.filterStacks.map((candidate) => candidate.id === stackId ? {
      ...candidate,
      family: preset.family,
      filters: reindexFilters(filters)
    } : candidate),
    automationLanes: project.automationLanes.filter((lane) => !stack.filters.some((filter) => filter.automationLaneIds?.includes(lane.id)))
  });
}
