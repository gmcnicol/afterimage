import type {
  NormalizedProjectFile,
  SpatialFieldDefinition,
  SpatialFieldKind,
  SpatialFieldRuntimeReport
} from '@afterimage/project-model';

export type BehaviouralFieldTerm =
  | 'Drift'
  | 'Pressure'
  | 'Corrosion'
  | 'Instability'
  | 'Memory'
  | 'Contamination'
  | 'Migration'
  | 'Viscosity'
  | 'Turbulence';

export type BehaviouralFieldOverlayMode = 'isolate' | 'magnitude' | 'flow' | 'histogram';

export interface BehaviouralFieldOverlayCopy {
  mode: BehaviouralFieldOverlayMode;
  label: string;
  help: string;
}

export interface BehaviouralFieldCopy {
  fieldId: string;
  label: string;
  term: BehaviouralFieldTerm;
  context: string;
  description: string;
  status: string;
  preferredOverlayMode?: BehaviouralFieldOverlayMode;
  detailRows: Array<[string, string]>;
}

export const behaviouralFieldOverlayModes: BehaviouralFieldOverlayMode[] = ['isolate', 'magnitude', 'flow', 'histogram'];

export const behaviouralFieldOverlayCopy: Record<BehaviouralFieldOverlayMode, BehaviouralFieldOverlayCopy> = {
  isolate: {
    mode: 'isolate',
    label: 'Field',
    help: 'Shows the selected field on its own.'
  },
  magnitude: {
    mode: 'magnitude',
    label: 'Motion',
    help: 'Emphasizes where the field is strongest.'
  },
  flow: {
    mode: 'flow',
    label: 'Drift',
    help: 'Shows directional drift across the frame.'
  },
  histogram: {
    mode: 'histogram',
    label: 'Balance',
    help: 'Shows the distribution of values for diagnostics.'
  }
};

const fieldKindVocabulary: Record<SpatialFieldKind, {
  term: BehaviouralFieldTerm;
  description: string;
  preferredOverlayMode?: BehaviouralFieldOverlayMode;
}> = {
  entropy: {
    term: 'Instability',
    description: 'Shows where the scene is least settled.'
  },
  motion: {
    term: 'Turbulence',
    description: 'Shows where image movement is most active.',
    preferredOverlayMode: 'magnitude'
  },
  heat: {
    term: 'Corrosion',
    description: 'Shows where brightness can eat into the image.'
  },
  memory: {
    term: 'Memory',
    description: 'Shows what the scene carries forward from earlier frames.'
  },
  flow_x: {
    term: 'Drift',
    description: 'Shows horizontal movement in the scene.',
    preferredOverlayMode: 'flow'
  },
  flow_y: {
    term: 'Drift',
    description: 'Shows vertical movement in the scene.',
    preferredOverlayMode: 'flow'
  },
  pressure: {
    term: 'Pressure',
    description: 'Shows where the scene is being pushed or held.'
  },
  viscosity: {
    term: 'Viscosity',
    description: 'Shows where movement should feel thick or resistant.'
  }
};

function findField(project: NormalizedProjectFile | undefined, fieldId: string): SpatialFieldDefinition | undefined {
  return project?.composition.spatialFields.find((field) => field.id === fieldId);
}

function resolveFieldContext(project: NormalizedProjectFile | undefined, field: SpatialFieldDefinition | undefined): string {
  if (!project || !field) {
    return 'Composition';
  }

  const layer = field.scope?.layerId
    ? project.composition.layers.find((candidate) => candidate.id === field.scope?.layerId)
    : undefined;
  if (layer) {
    return layer.name;
  }

  const scene = field.scope?.sceneId
    ? project.composition.scenes.find((candidate) => candidate.id === field.scope?.sceneId)
    : undefined;
  if (scene) {
    return scene.name;
  }

  return project.composition.name;
}

function flowAxis(kind: SpatialFieldKind): string {
  if (kind === 'flow_x') {
    return ' X';
  }
  if (kind === 'flow_y') {
    return ' Y';
  }

  return '';
}

function profileFitLabel(report: SpatialFieldRuntimeReport): string {
  switch (report.profileFit) {
    case 'fits':
      return 'stable';
    case 'degraded':
      return 'softened for preview';
    case 'cost-exceeded':
      return 'over budget';
    case 'memory-exceeded':
      return 'too heavy for this profile';
  }
}

export function spatialSignalIdForField(fieldId: string): string {
  return `spatial-field:${fieldId}`;
}

export function fieldIdFromSpatialSignalId(signalId: string | undefined): string | undefined {
  return signalId?.startsWith('spatial-field:') ? signalId.slice('spatial-field:'.length) : undefined;
}

export function resolveBehaviouralFieldCopy(
  report: SpatialFieldRuntimeReport,
  project?: NormalizedProjectFile
): BehaviouralFieldCopy {
  const vocabulary = fieldKindVocabulary[report.fieldKind];
  const field = findField(project, report.fieldId);
  const context = resolveFieldContext(project, field);
  const label = `${context} ${vocabulary.term}${flowAxis(report.fieldKind)}`;
  const status = profileFitLabel(report);

  return {
    fieldId: report.fieldId,
    label,
    term: vocabulary.term,
    context,
    description: vocabulary.description,
    status,
    preferredOverlayMode: vocabulary.preferredOverlayMode,
    detailRows: [
      ['behaviour', vocabulary.term.toLowerCase()],
      ['context', context],
      ['field id', report.fieldId],
      ['generator id', report.generatorId ?? '-'],
      ['frame id', report.currentFrameId],
      ['previous frame', report.previousFrameId ?? '-'],
      ['storage mode', report.storageMode],
      ['profile fit', report.profileFit]
    ]
  };
}

export function resolveNextFieldSelectionFromSignal(
  signalId: string,
  currentFieldId: string | undefined,
  availableFieldIds: string[]
): string | undefined {
  const signalFieldId = fieldIdFromSpatialSignalId(signalId);
  if (signalFieldId && availableFieldIds.includes(signalFieldId)) {
    return signalFieldId;
  }
  if (currentFieldId && availableFieldIds.includes(currentFieldId)) {
    return currentFieldId;
  }

  return availableFieldIds[0];
}

export function resolveNextSignalSelectionFromField(fieldId: string, availableSignalIds: string[]): string | undefined {
  const signalId = spatialSignalIdForField(fieldId);
  return availableSignalIds.includes(signalId) ? signalId : undefined;
}

export function resolveFieldOverlayMode(input: {
  explicitMode?: BehaviouralFieldOverlayMode;
  selectedField?: SpatialFieldRuntimeReport;
  fieldCopy?: BehaviouralFieldCopy;
}): BehaviouralFieldOverlayMode {
  if (input.explicitMode) {
    return input.explicitMode;
  }

  return input.fieldCopy?.preferredOverlayMode
    ?? (input.selectedField?.fieldKind === 'flow_x' || input.selectedField?.fieldKind === 'flow_y' ? 'flow' : 'magnitude');
}
