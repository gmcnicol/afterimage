import type {
  FieldGeneratorManifest,
  FieldSampleChannel,
  NormalizedProjectFile,
  RuntimeCostClass,
  RuntimeFieldScalePreset,
  RuntimePerformanceProfile,
  SpatialFieldDefinition,
  SpatialFieldDimensions,
  SpatialFieldFrameIdentity,
  SpatialFieldKind,
  SpatialFieldPersistencePolicy,
  SpatialFieldRuntimeState,
  SpatialFieldStoragePolicy
} from './types.js';
import { normalizeProject } from './normalization.js';

export type SpatialFieldRuntimeStorageMode = SpatialFieldStoragePolicy | 'cpu-fallback';
export type SpatialFieldRuntimeProfileFit = 'fits' | 'degraded' | 'cost-exceeded' | 'memory-exceeded';
export type SpatialFieldRuntimeDiagnosticSeverity = 'info' | 'warning' | 'error';
export type SpatialFieldRuntimeDiagnosticCode =
  | 'field-runtime-webgpu-unavailable'
  | 'field-runtime-cpu-fallback'
  | 'field-runtime-cost-budget'
  | 'field-runtime-memory-budget'
  | 'field-runtime-persistent-ping-pong'
  | 'field-runtime-history-window'
  | 'field-runtime-high-quality-flow-unavailable';
export type SpatialFieldRuntimeBufferSlotRole = 'current' | 'previous' | 'history';
export type SpatialFieldRuntimePersistencePlanKind = 'single-frame' | 'ping-pong' | 'history-window';
export type SpatialFieldRuntimeUpdatePassKind = 'replace' | 'accumulate' | 'decay' | 'diffuse' | 'smear';

export interface SpatialFieldRuntimeDiagnostic {
  id: string;
  fieldId?: string;
  generatorId?: string;
  severity: SpatialFieldRuntimeDiagnosticSeverity;
  code: SpatialFieldRuntimeDiagnosticCode | string;
  message: string;
}

export interface SpatialFieldRuntimeFrameSlot {
  id: string;
  fieldId: string;
  role: SpatialFieldRuntimeBufferSlotRole;
  bufferIndex: number;
  frame: SpatialFieldFrameIdentity;
  historyIndex?: number;
  estimatedBytes: number;
}

export interface SpatialFieldRuntimePersistencePlan {
  kind: SpatialFieldRuntimePersistencePlanKind;
  lifetime?: SpatialFieldPersistencePolicy['lifetime'];
  storageIntent?: SpatialFieldPersistencePolicy['storageIntent'];
  accumulation: SpatialFieldPersistencePolicy['accumulation'];
  windowFrames: number;
  bufferCount: number;
  slots: SpatialFieldRuntimeFrameSlot[];
}

export interface SpatialFieldRuntimeUpdatePassDescriptor {
  id: string;
  fieldId: string;
  kind: SpatialFieldRuntimeUpdatePassKind;
  sourceSlotIds: string[];
  targetSlotId: string;
  iterationCount: number;
  workgroupSize: [number, number, number];
  dimensions: SpatialFieldDimensions;
  deterministicFrameId: string;
  decay?: number;
  clamp?: boolean;
}

export interface SpatialFieldRuntimeExecutionSession {
  id: string;
  fieldId: string;
  profileId?: string;
  dimensions: SpatialFieldDimensions;
  storageMode: SpatialFieldRuntimeStorageMode;
  persistencePlan: SpatialFieldRuntimePersistencePlan;
  updatePasses: SpatialFieldRuntimeUpdatePassDescriptor[];
  estimatedBytes: number;
  deterministicIdentity: string;
}

export interface SpatialFieldRuntimeReport {
  fieldId: string;
  fieldKind: SpatialFieldKind;
  generatorId?: string;
  dimensions: SpatialFieldDimensions;
  storageMode: SpatialFieldRuntimeStorageMode;
  requestedStorage: SpatialFieldStoragePolicy;
  currentFrameId: string;
  previousFrameId?: string;
  costClass: RuntimeCostClass;
  persistencePolicy?: SpatialFieldPersistencePolicy;
  profileFit: SpatialFieldRuntimeProfileFit;
  estimatedBytes: number;
  bufferCount: number;
  frameSlots: SpatialFieldRuntimeFrameSlot[];
  persistencePlan: SpatialFieldRuntimePersistencePlan;
  updatePasses: SpatialFieldRuntimeUpdatePassDescriptor[];
  diagnostics: SpatialFieldRuntimeDiagnostic[];
  runtimeState: SpatialFieldRuntimeState;
}

export interface SpatialFieldRuntimePlan {
  schemaVersion: 1;
  runtimeProfileId?: string;
  frame: SpatialFieldFrameIdentity;
  sourceDimensions: SpatialFieldDimensions;
  outputDimensions: SpatialFieldDimensions;
  generators: FieldGeneratorManifest[];
  totalEstimatedBytes: number;
  memoryBudgetBytes?: number;
  executionSessions: SpatialFieldRuntimeExecutionSession[];
  updatePasses: SpatialFieldRuntimeUpdatePassDescriptor[];
  reports: SpatialFieldRuntimeReport[];
  diagnostics: SpatialFieldRuntimeDiagnostic[];
}

export interface BuildSpatialFieldRuntimePlanInput {
  project: NormalizedProjectFile;
  runtimeProfile?: RuntimePerformanceProfile;
  sourceDimensions?: SpatialFieldDimensions;
  outputDimensions: SpatialFieldDimensions;
  frameIndex?: number;
  timeMs?: number;
  generation?: number;
  webgpuAvailable?: boolean;
  highQualityOpticalFlowAvailable?: boolean;
}

export interface MotionFrameInput {
  width: number;
  height: number;
  data: ArrayLike<number>;
  channels?: 1 | 4;
}

export interface MotionFieldGenerationInput {
  previous: MotionFrameInput;
  current: MotionFrameInput;
  outputDimensions?: SpatialFieldDimensions;
  outputFieldIds?: {
    motion?: string;
    flowX?: string;
    flowY?: string;
  };
  cacheIdentityInputs?: string[];
}

export interface MotionFieldOutput {
  fieldId: string;
  kind: 'motion' | 'flow_x' | 'flow_y';
  channels: FieldSampleChannel[];
  values: Float32Array;
  stats: SpatialFieldStatSummary;
}

export interface SpatialFieldStatSummary {
  min: number;
  max: number;
  mean: number;
  nonZeroRatio: number;
  histogram: number[];
}

export interface MotionFieldGenerationResult {
  dimensions: SpatialFieldDimensions;
  outputs: MotionFieldOutput[];
  cacheIdentityInputs: string[];
}

const costRank: Record<RuntimeCostClass, number> = {
  cheap: 0,
  moderate: 1,
  expensive: 2,
  dangerous: 3
};

const scalePresetMultiplier: Record<RuntimeFieldScalePreset, number> = {
  source: 1,
  full: 1,
  'three-quarter': 0.75,
  half: 0.5,
  quarter: 0.25,
  eighth: 0.125
};

const BYTES_PER_FIELD_TEXEL = 4;

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function exceedsRuntimeBudget(costClass: RuntimeCostClass, profile: RuntimePerformanceProfile | undefined): boolean {
  return profile ? costRank[costClass] > costRank[profile.maxCostClass] : false;
}

function frameDurationMs(profile: RuntimePerformanceProfile | undefined): number {
  return 1000 / Math.max(1, profile?.targetFps ?? 30);
}

function runtimeScale(profile: RuntimePerformanceProfile | undefined): number {
  return profile ? scalePresetMultiplier[profile.fieldScalePreset] : 1;
}

function scaledDimension(value: number, scale: number): number {
  return Math.max(1, Math.trunc(value * scale));
}

function resolveFieldDimensions(
  field: SpatialFieldDefinition,
  input: Pick<BuildSpatialFieldRuntimePlanInput, 'sourceDimensions' | 'outputDimensions' | 'runtimeProfile'>
): SpatialFieldDimensions {
  const profileScale = runtimeScale(input.runtimeProfile);

  switch (field.resolution.kind) {
    case 'source-sized':
      return {
        width: scaledDimension(input.sourceDimensions?.width ?? input.outputDimensions.width, profileScale),
        height: scaledDimension(input.sourceDimensions?.height ?? input.outputDimensions.height, profileScale)
      };
    case 'output-sized':
      return {
        width: scaledDimension(input.outputDimensions.width, profileScale),
        height: scaledDimension(input.outputDimensions.height, profileScale)
      };
    case 'scaled': {
      const fieldScale = field.resolution.scale ?? 1;
      return {
        width: scaledDimension(input.outputDimensions.width, fieldScale * profileScale),
        height: scaledDimension(input.outputDimensions.height, fieldScale * profileScale)
      };
    }
    case 'fixed':
      return {
        width: Math.max(1, Math.trunc(field.resolution.width ?? 1)),
        height: Math.max(1, Math.trunc(field.resolution.height ?? 1))
      };
  }
}

function createFrameIdentity(input: {
  project: NormalizedProjectFile;
  frameIndex: number;
  timeMs: number;
}): SpatialFieldFrameIdentity {
  const frameIndex = Math.max(0, Math.trunc(input.frameIndex));
  const timeMs = Math.max(0, Math.trunc(input.timeMs));

  return {
    frameId: `${input.project.composition.id}:${input.project.composition.sequenceId}:${input.project.composition.variantId}:${frameIndex}:${timeMs}`,
    frameIndex,
    timeMs,
    compositionId: input.project.composition.id,
    sequenceId: input.project.composition.sequenceId,
    variantId: input.project.composition.variantId
  };
}

function previousFrameIdentity(
  project: NormalizedProjectFile,
  current: SpatialFieldFrameIdentity,
  profile: RuntimePerformanceProfile | undefined
): SpatialFieldFrameIdentity {
  const previousFrameIndex = Math.max(0, current.frameIndex - 1);
  const previousTimeMs = Math.max(0, Math.trunc(current.timeMs - frameDurationMs(profile)));

  return createFrameIdentity({
    project,
    frameIndex: previousFrameIndex,
    timeMs: previousTimeMs
  });
}

function findGeneratorId(field: SpatialFieldDefinition, generators: FieldGeneratorManifest[]): string | undefined {
  return generators.find((generator) => generator.outputs.some((output) => output.fieldId === field.id))?.id;
}

function createRuntimeMotionGenerators(
  project: NormalizedProjectFile,
  input: BuildSpatialFieldRuntimePlanInput,
  authoredGenerators: FieldGeneratorManifest[]
): FieldGeneratorManifest[] {
  const generatedFieldIds = new Set(authoredGenerators.flatMap((generator) => generator.outputs.map((output) => output.fieldId)));
  const motionField = project.composition.spatialFields.find((field) => field.kind === 'motion');
  const flowXField = project.composition.spatialFields.find((field) => field.kind === 'flow_x');
  const flowYField = project.composition.spatialFields.find((field) => field.kind === 'flow_y');

  if (!motionField || generatedFieldIds.has(motionField.id)) {
    return [];
  }

  return [createMotionFrameDifferenceManifest({
    id: 'generator-motion-frame-difference-runtime',
    assetId: project.composition.assetIds[0],
    motionFieldId: motionField.id,
    flowXFieldId: flowXField && !generatedFieldIds.has(flowXField.id) ? flowXField.id : undefined,
    flowYFieldId: flowYField && !generatedFieldIds.has(flowYField.id) ? flowYField.id : undefined,
    scope: motionField.scope,
    cacheIdentityInputs: [
      input.runtimeProfile?.id,
      `source:${input.sourceDimensions?.width ?? input.outputDimensions.width}x${input.sourceDimensions?.height ?? input.outputDimensions.height}`,
      `output:${input.outputDimensions.width}x${input.outputDimensions.height}`
    ].filter((value): value is string => Boolean(value))
  })];
}

function boundedHistoryWindowFrames(
  field: SpatialFieldDefinition,
  profile: RuntimePerformanceProfile | undefined
): number {
  const access = field.persistence?.previousFrameAccess;
  if (!field.persistence || access === 'none') {
    return 0;
  }
  if (access === 'previous-frame') {
    return 1;
  }

  const requestedWindow = Math.max(1, Math.trunc(field.persistence.windowFrames ?? 2));
  const profileLimit = profile ? Math.max(1, Math.trunc(profile.maxPasses)) : requestedWindow;

  return Math.min(requestedWindow, profileLimit);
}

function persistenceBufferCount(
  field: SpatialFieldDefinition,
  profile: RuntimePerformanceProfile | undefined
): number {
  return 1 + boundedHistoryWindowFrames(field, profile);
}

function previousFrameIdentities(input: {
  project: NormalizedProjectFile;
  current: SpatialFieldFrameIdentity;
  profile: RuntimePerformanceProfile | undefined;
  count: number;
}): SpatialFieldFrameIdentity[] {
  return Array.from({ length: input.count }, (_, index) => {
    const offset = index + 1;
    return createFrameIdentity({
      project: input.project,
      frameIndex: Math.max(0, input.current.frameIndex - offset),
      timeMs: Math.max(0, Math.trunc(input.current.timeMs - frameDurationMs(input.profile) * offset))
    });
  });
}

function slotId(fieldId: string, role: SpatialFieldRuntimeBufferSlotRole, index: number): string {
  return `field-slot:${fieldId}:${role}:${index}`;
}

function createPersistencePlan(input: {
  field: SpatialFieldDefinition;
  dimensions: SpatialFieldDimensions;
  frame: SpatialFieldFrameIdentity;
  historyFrames: SpatialFieldFrameIdentity[];
  profile: RuntimePerformanceProfile | undefined;
}): SpatialFieldRuntimePersistencePlan {
  const slotBytes = input.dimensions.width * input.dimensions.height * BYTES_PER_FIELD_TEXEL;
  const currentSlot: SpatialFieldRuntimeFrameSlot = {
    id: slotId(input.field.id, 'current', 0),
    fieldId: input.field.id,
    role: 'current',
    bufferIndex: 0,
    frame: input.frame,
    estimatedBytes: slotBytes
  };
  const historySlots: SpatialFieldRuntimeFrameSlot[] = input.historyFrames.map((historyFrame, index) => ({
    id: slotId(input.field.id, index === 0 ? 'previous' : 'history', index + 1),
    fieldId: input.field.id,
    role: index === 0 ? 'previous' : 'history',
    bufferIndex: index + 1,
    frame: historyFrame,
    historyIndex: index + 1,
    estimatedBytes: slotBytes
  }));
  const access = input.field.persistence?.previousFrameAccess;
  const kind: SpatialFieldRuntimePersistencePlanKind = !input.field.persistence || access === 'none'
    ? 'single-frame'
    : access === 'previous-frame'
      ? 'ping-pong'
      : 'history-window';

  return {
    kind,
    lifetime: input.field.persistence?.lifetime,
    storageIntent: input.field.persistence?.storageIntent,
    accumulation: input.field.persistence?.accumulation ?? { kind: 'replace' },
    windowFrames: input.historyFrames.length,
    bufferCount: 1 + input.historyFrames.length,
    slots: [currentSlot, ...historySlots]
  };
}

function updatePassKind(policy: SpatialFieldPersistencePolicy['accumulation']): SpatialFieldRuntimeUpdatePassKind {
  switch (policy.kind) {
    case 'replace':
      return 'replace';
    case 'accumulate':
      return 'accumulate';
    case 'decay':
      return 'decay';
  }
}

function createUpdatePasses(input: {
  field: SpatialFieldDefinition;
  dimensions: SpatialFieldDimensions;
  frame: SpatialFieldFrameIdentity;
  persistencePlan: SpatialFieldRuntimePersistencePlan;
  profile: RuntimePerformanceProfile | undefined;
}): SpatialFieldRuntimeUpdatePassDescriptor[] {
  const targetSlot = input.persistencePlan.slots.find((slot) => slot.role === 'current') ?? input.persistencePlan.slots[0];
  const historySlotIds = input.persistencePlan.slots
    .filter((slot) => slot.role === 'previous' || slot.role === 'history')
    .map((slot) => slot.id);
  const accumulation = input.persistencePlan.accumulation;
  const basePass: SpatialFieldRuntimeUpdatePassDescriptor = {
    id: `field-pass:${input.field.id}:${input.frame.frameIndex}:update`,
    fieldId: input.field.id,
    kind: updatePassKind(accumulation),
    sourceSlotIds: historySlotIds,
    targetSlotId: targetSlot.id,
    iterationCount: 1,
    workgroupSize: [8, 8, 1],
    dimensions: input.dimensions,
    deterministicFrameId: input.frame.frameId,
    decay: accumulation.decay,
    clamp: accumulation.clamp
  };

  if (input.field.kind !== 'viscosity' && input.field.kind !== 'flow_x' && input.field.kind !== 'flow_y') {
    return [basePass];
  }

  const boundedIterations = Math.max(1, Math.min(input.profile?.maxPasses ?? 1, input.persistencePlan.windowFrames + 1));
  return [
    basePass,
    {
      ...basePass,
      id: `field-pass:${input.field.id}:${input.frame.frameIndex}:spread`,
      kind: input.field.kind === 'viscosity' ? 'diffuse' : 'smear',
      iterationCount: boundedIterations
    }
  ];
}

function diagnosticId(parts: Array<string | undefined>): string {
  return ['diagnostic', 'field-runtime', ...parts.filter((part): part is string => Boolean(part))].join(':');
}

function fieldRuntimeDiagnostic(
  code: SpatialFieldRuntimeDiagnosticCode,
  field: SpatialFieldDefinition,
  severity: SpatialFieldRuntimeDiagnosticSeverity,
  message: string,
  generatorId?: string
): SpatialFieldRuntimeDiagnostic {
  return {
    id: diagnosticId([code, field.id, generatorId]),
    fieldId: field.id,
    generatorId,
    severity,
    code,
    message
  };
}

function createRuntimeState(input: {
  project: NormalizedProjectFile;
  field: SpatialFieldDefinition;
  generatorId?: string;
  frame: SpatialFieldFrameIdentity;
  historyFrames: SpatialFieldFrameIdentity[];
  dimensions: SpatialFieldDimensions;
  storage: SpatialFieldStoragePolicy;
  generation: number;
}): SpatialFieldRuntimeState {
  const previousFrame = input.historyFrames[0];

  return {
    fieldId: input.field.id,
    kind: input.field.kind,
    sourceClass: input.field.sourceClass ?? 'behavioural-state',
    currentFrame: input.frame,
    previousFrame,
    frame: input.frame,
    dimensions: input.dimensions,
    storage: input.storage,
    access: input.field.access ?? 'read-write',
    persistence: input.field.persistence,
    persistenceWindow: input.historyFrames.length > 0 ? [...input.historyFrames, input.frame] : undefined,
    generation: input.generation,
    provenance: {
      seedId: input.field.seedId ?? input.field.persistence?.replayIdentity.seedId,
      generation: input.generation,
      sourceFieldIds: input.field.persistence?.replayIdentity.identityInputs,
      generator: input.generatorId,
      generatorVersion: input.generatorId ? 'runtime-manifest' : undefined
    }
  };
}

export function buildSpatialFieldRuntimePlan(input: BuildSpatialFieldRuntimePlanInput): SpatialFieldRuntimePlan {
  const project = normalizeProject(input.project);
  const runtimeProfile = input.runtimeProfile;
  const generators = [
    ...project.composition.fieldGenerators,
    ...createRuntimeMotionGenerators(project, input, project.composition.fieldGenerators)
  ].sort((left, right) => compareStrings(left.id, right.id));
  const sourceDimensions = input.sourceDimensions ?? input.outputDimensions;
  const frame = createFrameIdentity({
    project,
    frameIndex: input.frameIndex ?? 0,
    timeMs: input.timeMs ?? 0
  });
  const memoryBudgetBytes = runtimeProfile ? runtimeProfile.memoryBudgetMb * 1024 * 1024 : undefined;
  let runningBytes = 0;
  const reports = project.composition.spatialFields.map((field): SpatialFieldRuntimeReport => {
    const generatorId = findGeneratorId(field, generators);
    const dimensions = resolveFieldDimensions(field, {
      sourceDimensions,
      outputDimensions: input.outputDimensions,
      runtimeProfile
    });
    const historyFrameCount = boundedHistoryWindowFrames(field, runtimeProfile);
    const historyFrames = previousFrameIdentities({
      project,
      current: frame,
      profile: runtimeProfile,
      count: historyFrameCount
    });
    const persistencePlan = createPersistencePlan({
      field,
      dimensions,
      frame,
      historyFrames,
      profile: runtimeProfile
    });
    const updatePasses = createUpdatePasses({
      field,
      dimensions,
      frame,
      persistencePlan,
      profile: runtimeProfile
    });
    const bufferCount = persistencePlan.bufferCount;
    const estimatedBytes = persistencePlan.slots.reduce((sum, slot) => sum + slot.estimatedBytes, 0);
    const requestedStorage = field.storage ?? 'gpu-texture';
    const diagnostics: SpatialFieldRuntimeDiagnostic[] = [];
    const previousFrame = historyFrames[0];
    const costExceeded = exceedsRuntimeBudget(field.costClass ?? 'moderate', runtimeProfile);
    const memoryExceeded = memoryBudgetBytes !== undefined && runningBytes + estimatedBytes > memoryBudgetBytes;
    const webgpuUnavailable = requestedStorage === 'gpu-texture' && input.webgpuAvailable === false;
    const flowNeedsDegradation = (field.kind === 'flow_x' || field.kind === 'flow_y') && input.highQualityOpticalFlowAvailable === false;

    runningBytes += estimatedBytes;

    if (webgpuUnavailable) {
      diagnostics.push(fieldRuntimeDiagnostic(
        'field-runtime-webgpu-unavailable',
        field,
        'warning',
        `Spatial field "${field.id}" requested GPU texture storage, but WebGPU is unavailable; CPU fallback will be used.`,
        generatorId
      ));
    }
    if (costExceeded) {
      diagnostics.push(fieldRuntimeDiagnostic(
        'field-runtime-cost-budget',
        field,
        'warning',
        `Spatial field "${field.id}" cost class "${field.costClass ?? 'moderate'}" exceeds runtime profile "${runtimeProfile?.id}" budget "${runtimeProfile?.maxCostClass}".`,
        generatorId
      ));
    }
    if (memoryExceeded) {
      diagnostics.push(fieldRuntimeDiagnostic(
        'field-runtime-memory-budget',
        field,
        runtimeProfile?.fallbackPreference === 'fail-fast' ? 'error' : 'warning',
        `Spatial field "${field.id}" estimated allocation ${estimatedBytes} bytes exceeds remaining runtime memory budget.`,
        generatorId
      ));
    }
    if (previousFrame) {
      diagnostics.push(fieldRuntimeDiagnostic(
        'field-runtime-persistent-ping-pong',
        field,
        'info',
        `Spatial field "${field.id}" exposes current frame "${frame.frameId}" and previous frame "${previousFrame.frameId}".`,
        generatorId
      ));
    }
    if (persistencePlan.kind === 'history-window') {
      diagnostics.push(fieldRuntimeDiagnostic(
        'field-runtime-history-window',
        field,
        'info',
        `Spatial field "${field.id}" keeps ${persistencePlan.windowFrames} deterministic history frame${persistencePlan.windowFrames === 1 ? '' : 's'} for bounded persistence.`,
        generatorId
      ));
    }
    if (flowNeedsDegradation) {
      diagnostics.push(fieldRuntimeDiagnostic(
        'field-runtime-high-quality-flow-unavailable',
        field,
        'info',
        `Spatial field "${field.id}" uses deterministic frame differencing because high-quality optical flow is unavailable.`,
        generatorId
      ));
    }
    if (webgpuUnavailable || memoryExceeded || costExceeded) {
      diagnostics.push(fieldRuntimeDiagnostic(
        'field-runtime-cpu-fallback',
        field,
        memoryExceeded && runtimeProfile?.fallbackPreference === 'fail-fast' ? 'error' : 'warning',
        `Spatial field "${field.id}" is planned with CPU fallback diagnostics; export semantics are unchanged.`,
        generatorId
      ));
    }

    const storageMode: SpatialFieldRuntimeStorageMode = webgpuUnavailable || memoryExceeded ? 'cpu-fallback' : requestedStorage;
    const profileFit: SpatialFieldRuntimeProfileFit = memoryExceeded
      ? 'memory-exceeded'
      : costExceeded
        ? 'cost-exceeded'
        : webgpuUnavailable || flowNeedsDegradation
          ? 'degraded'
          : 'fits';
    const runtimeState = createRuntimeState({
      project,
      field,
      generatorId,
      frame,
      historyFrames,
      dimensions,
      storage: storageMode === 'cpu-fallback' ? 'cpu-buffer' : storageMode,
      generation: input.generation ?? 0
    });

    return {
      fieldId: field.id,
      fieldKind: field.kind,
      generatorId,
      dimensions,
      storageMode,
      requestedStorage,
      currentFrameId: frame.frameId,
      previousFrameId: previousFrame?.frameId,
      costClass: field.costClass ?? 'moderate',
      persistencePolicy: field.persistence,
      profileFit,
      estimatedBytes,
      bufferCount,
      frameSlots: persistencePlan.slots,
      persistencePlan,
      updatePasses,
      diagnostics,
      runtimeState
    };
  });
  const diagnostics = reports.flatMap((report) => report.diagnostics)
    .sort((left, right) => compareStrings(left.id, right.id));

  return {
    schemaVersion: 1,
    runtimeProfileId: runtimeProfile?.id,
    frame,
    sourceDimensions,
    outputDimensions: input.outputDimensions,
    generators,
    totalEstimatedBytes: reports.reduce((sum, report) => sum + report.estimatedBytes, 0),
    memoryBudgetBytes,
    executionSessions: reports.map((report): SpatialFieldRuntimeExecutionSession => ({
      id: `field-session:${report.fieldId}:${frame.frameIndex}:${runtimeProfile?.id ?? 'default'}`,
      fieldId: report.fieldId,
      profileId: runtimeProfile?.id,
      dimensions: report.dimensions,
      storageMode: report.storageMode,
      persistencePlan: report.persistencePlan,
      updatePasses: report.updatePasses,
      estimatedBytes: report.estimatedBytes,
      deterministicIdentity: [
        report.fieldId,
        runtimeProfile?.id ?? 'default',
        report.currentFrameId,
        report.previousFrameId ?? 'none',
        report.persistencePlan.kind,
        report.persistencePlan.windowFrames,
        report.bufferCount
      ].join(':')
    })),
    updatePasses: reports.flatMap((report) => report.updatePasses),
    reports,
    diagnostics
  };
}

export function createMotionFrameDifferenceManifest(input: {
  id?: string;
  assetId?: string;
  motionFieldId: string;
  flowXFieldId?: string;
  flowYFieldId?: string;
  scope?: FieldGeneratorManifest['scope'];
  cacheIdentityInputs?: string[];
}): FieldGeneratorManifest {
  const outputs = [
    {
      id: 'output-motion',
      kind: 'spatial-field' as const,
      fieldId: input.motionFieldId,
      channels: ['magnitude'] as FieldSampleChannel[]
    },
    ...(input.flowXFieldId ? [{
      id: 'output-flow-x',
      kind: 'spatial-field' as const,
      fieldId: input.flowXFieldId,
      channels: ['r'] as FieldSampleChannel[]
    }] : []),
    ...(input.flowYFieldId ? [{
      id: 'output-flow-y',
      kind: 'spatial-field' as const,
      fieldId: input.flowYFieldId,
      channels: ['g'] as FieldSampleChannel[]
    }] : [])
  ];

  return {
    id: input.id ?? 'generator-motion-frame-difference',
    kind: 'motion-frame-difference',
    name: 'Frame Difference Motion',
    inputs: input.assetId ? [{
      id: 'input-source-frames',
      kind: 'asset',
      refId: input.assetId,
      required: true
    }] : [],
    outputs,
    scope: input.scope ?? {},
    costClass: 'cheap',
    determinismMode: 'deterministic',
    capturePolicy: 'ignore',
    requiredCapabilities: ['field-generator:motion-frame-difference'],
    cacheIdentity: {
      version: 'motion-frame-difference@1',
      inputs: [...new Set([
        input.assetId,
        input.motionFieldId,
        input.flowXFieldId,
        input.flowYFieldId,
        ...(input.cacheIdentityInputs ?? [])
      ].filter((value): value is string => Boolean(value)))].sort(compareStrings)
    }
  };
}

function lumaAt(frame: MotionFrameInput, x: number, y: number): number {
  const safeX = Math.max(0, Math.min(frame.width - 1, x));
  const safeY = Math.max(0, Math.min(frame.height - 1, y));
  const channels = frame.channels ?? 4;
  const offset = (safeY * frame.width + safeX) * channels;

  if (channels === 1) {
    return frame.data[safeY * frame.width + safeX] ?? 0;
  }

  const r = frame.data[offset] ?? 0;
  const g = frame.data[offset + 1] ?? r;
  const b = frame.data[offset + 2] ?? r;

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function sampleLuma(frame: MotionFrameInput, x: number, y: number, dimensions: SpatialFieldDimensions): number {
  const sourceX = Math.floor((x / Math.max(1, dimensions.width - 1)) * Math.max(0, frame.width - 1));
  const sourceY = Math.floor((y / Math.max(1, dimensions.height - 1)) * Math.max(0, frame.height - 1));

  return lumaAt(frame, sourceX, sourceY);
}

function summarize(values: Float32Array, buckets = 8): SpatialFieldStatSummary {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let nonZero = 0;

  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
    if (Math.abs(value) > 0.0001) {
      nonZero += 1;
    }
  }

  const histogram = Array.from({ length: buckets }, () => 0);
  const range = Math.max(0.0001, max - min);
  for (const value of values) {
    const bucket = Math.max(0, Math.min(buckets - 1, Math.floor(((value - min) / range) * buckets)));
    histogram[bucket] += 1;
  }

  return {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 0,
    mean: values.length > 0 ? sum / values.length : 0,
    nonZeroRatio: values.length > 0 ? nonZero / values.length : 0,
    histogram
  };
}

export function generateFrameDifferenceMotionFields(input: MotionFieldGenerationInput): MotionFieldGenerationResult {
  if (input.previous.width <= 0 || input.previous.height <= 0 || input.current.width <= 0 || input.current.height <= 0) {
    throw new Error('Motion frames must have positive dimensions.');
  }

  const dimensions = input.outputDimensions ?? {
    width: Math.min(input.previous.width, input.current.width),
    height: Math.min(input.previous.height, input.current.height)
  };
  const length = dimensions.width * dimensions.height;
  const motion = new Float32Array(length);
  const flowX = new Float32Array(length);
  const flowY = new Float32Array(length);

  for (let y = 0; y < dimensions.height; y += 1) {
    for (let x = 0; x < dimensions.width; x += 1) {
      const index = y * dimensions.width + x;
      const previous = sampleLuma(input.previous, x, y, dimensions);
      const current = sampleLuma(input.current, x, y, dimensions);
      const magnitude = Math.abs(current - previous) / 255;
      const right = sampleLuma(input.current, Math.min(dimensions.width - 1, x + 1), y, dimensions);
      const left = sampleLuma(input.current, Math.max(0, x - 1), y, dimensions);
      const down = sampleLuma(input.current, x, Math.min(dimensions.height - 1, y + 1), dimensions);
      const up = sampleLuma(input.current, x, Math.max(0, y - 1), dimensions);

      motion[index] = magnitude;
      flowX[index] = ((right - left) / 255) * magnitude;
      flowY[index] = ((down - up) / 255) * magnitude;
    }
  }

  return {
    dimensions,
    outputs: [
      {
        fieldId: input.outputFieldIds?.motion ?? 'field-motion-source',
        kind: 'motion',
        channels: ['magnitude'],
        values: motion,
        stats: summarize(motion)
      },
      {
        fieldId: input.outputFieldIds?.flowX ?? 'field-flow-x-scene',
        kind: 'flow_x',
        channels: ['r'],
        values: flowX,
        stats: summarize(flowX)
      },
      {
        fieldId: input.outputFieldIds?.flowY ?? 'field-flow-y-scene',
        kind: 'flow_y',
        channels: ['g'],
        values: flowY,
        stats: summarize(flowY)
      }
    ],
    cacheIdentityInputs: [
      'motion-frame-difference@1',
      `previous:${input.previous.width}x${input.previous.height}:${input.previous.data.length}`,
      `current:${input.current.width}x${input.current.height}:${input.current.data.length}`,
      `output:${dimensions.width}x${dimensions.height}`,
      ...(input.cacheIdentityInputs ?? [])
    ]
  };
}
