import {
  planSpatialRuntime,
  type BehaviourRuntimeProfile,
  type BehaviourRuntimeProfileId,
  type PlannedSpatialField,
  type SpatialFieldDefinition,
  type SpatialFieldDimensions,
  type SpatialFieldRuntimeAdapter,
  type SpatialRuntimeDiagnostic,
  type SpatialRuntimePlan
} from '@afterimage/project-model';

export interface CpuSpatialRuntimeBuffer {
  id: string;
  fieldId: string;
  dimensions: SpatialFieldDimensions;
  values: Float32Array;
}

export interface CpuSpatialRuntimeField {
  fieldId: string;
  kind: SpatialFieldDefinition['kind'];
  access: SpatialFieldDefinition['access'];
  dimensions: SpatialFieldDimensions;
  planned: PlannedSpatialField;
  buffers: CpuSpatialRuntimeBuffer[];
  readBufferIndex: number;
  writeBufferIndex: number;
}

export interface CpuSpatialRuntimeSession {
  adapterId: string;
  plan: SpatialRuntimePlan;
  fieldOrder: string[];
  fields: Record<string, CpuSpatialRuntimeField>;
  diagnostics: SpatialRuntimeDiagnostic[];
  frameIndex: number;
}

export interface AllocateSpatialRuntimeSessionInput {
  fields: SpatialFieldDefinition[];
  sourceDimensions: SpatialFieldDimensions;
  outputDimensions: SpatialFieldDimensions;
  profile?: BehaviourRuntimeProfile | BehaviourRuntimeProfileId;
  initialValues?: Record<string, ArrayLike<number>>;
}

export interface ExecuteSpatialRuntimePassesInput {
  session: CpuSpatialRuntimeSession;
  passes: CpuSpatialRuntimePass[];
  maxPasses?: number;
}

export interface ExecuteSpatialRuntimePassesResult {
  session: CpuSpatialRuntimeSession;
  executedPasses: number;
  diagnostics: SpatialRuntimeDiagnostic[];
}

export interface BaseCpuSpatialRuntimePass {
  kind: CpuSpatialRuntimePass['kind'];
  targetFieldId: string;
  clampMin?: number;
  clampMax?: number;
}

export interface AccumulateCpuSpatialRuntimePass extends BaseCpuSpatialRuntimePass {
  kind: 'accumulate';
  sourceFieldId?: string;
  amount?: number;
  sourceScale?: number;
  decay?: number;
}

export interface DiffusionCpuSpatialRuntimePass extends BaseCpuSpatialRuntimePass {
  kind: 'diffusion';
  sourceFieldId?: string;
  rate?: number;
  iterations?: number;
}

export interface FlowPropagationCpuSpatialRuntimePass extends BaseCpuSpatialRuntimePass {
  kind: 'flow-propagation';
  sourceFieldId: string;
  flowXFieldId: string;
  flowYFieldId: string;
  step?: number;
}

export interface MemoryPersistenceCpuSpatialRuntimePass extends BaseCpuSpatialRuntimePass {
  kind: 'memory-persistence';
  sourceFieldId?: string;
  persistence?: number;
  influence?: number;
  decay?: number;
}

export interface DirectionalSmearCpuSpatialRuntimePass extends BaseCpuSpatialRuntimePass {
  kind: 'directional-smear';
  sourceFieldId: string;
  directionX: number;
  directionY: number;
  distance?: number;
  strength?: number;
}

export type CpuSpatialRuntimePass =
  | AccumulateCpuSpatialRuntimePass
  | DiffusionCpuSpatialRuntimePass
  | FlowPropagationCpuSpatialRuntimePass
  | MemoryPersistenceCpuSpatialRuntimePass
  | DirectionalSmearCpuSpatialRuntimePass;

interface ResolvedPassFields {
  target: CpuSpatialRuntimeField;
  source?: CpuSpatialRuntimeField;
  flowX?: CpuSpatialRuntimeField;
  flowY?: CpuSpatialRuntimeField;
}

const BYTES_PER_FLOAT32 = 4;

export function createCpuSpatialRuntimeAdapter(): SpatialFieldRuntimeAdapter {
  return {
    id: 'cpu-spatial-runtime',
    capabilities: {
      webgpuAvailable: false,
      supportedStoragePolicies: ['cpu-buffer']
    },
    plan(input) {
      return planSpatialRuntime({
        ...input,
        capabilities: this.capabilities,
        bytesPerTexel: BYTES_PER_FLOAT32
      });
    }
  };
}

export function allocateSpatialRuntimeSession(input: AllocateSpatialRuntimeSessionInput): CpuSpatialRuntimeSession {
  const adapter = createCpuSpatialRuntimeAdapter();
  const plan = adapter.plan({
    fields: input.fields,
    sourceDimensions: input.sourceDimensions,
    outputDimensions: input.outputDimensions,
    profile: input.profile
  });
  const fieldsById = new Map(input.fields.map((field) => [field.id, field]));
  const fields: Record<string, CpuSpatialRuntimeField> = {};
  const diagnostics = [...plan.diagnostics];

  for (const planned of plan.fields) {
    const definition = fieldsById.get(planned.fieldId);
    const bufferCount = planned.pingPong ? 2 : 1;
    const buffers = Array.from({ length: bufferCount }, (_value, index): CpuSpatialRuntimeBuffer => ({
      id: `${planned.fieldId}:buffer-${index}`,
      fieldId: planned.fieldId,
      dimensions: planned.dimensions,
      values: new Float32Array(planned.dimensions.width * planned.dimensions.height)
    }));

    const initialValues = input.initialValues?.[planned.fieldId];
    if (initialValues) {
      for (const buffer of buffers) {
        copyInitialValues(buffer, initialValues, diagnostics);
      }
    }

    fields[planned.fieldId] = {
      fieldId: planned.fieldId,
      kind: planned.kind,
      access: definition?.access ?? 'read-write',
      dimensions: planned.dimensions,
      planned,
      buffers,
      readBufferIndex: 0,
      writeBufferIndex: planned.pingPong ? 1 : 0
    };
  }

  return {
    adapterId: adapter.id,
    plan,
    fieldOrder: plan.fields.map((field) => field.fieldId),
    fields,
    diagnostics,
    frameIndex: 0
  };
}

export function getCpuSpatialRuntimeField(session: CpuSpatialRuntimeSession, fieldId: string): CpuSpatialRuntimeField {
  const field = session.fields[fieldId];
  if (!field) {
    throw new Error(`Spatial runtime field "${fieldId}" is not allocated.`);
  }
  return field;
}

export function readCpuSpatialField(session: CpuSpatialRuntimeSession, fieldId: string): Float32Array {
  const field = getCpuSpatialRuntimeField(session, fieldId);
  return field.buffers[field.readBufferIndex].values;
}

export function writeCpuSpatialField(session: CpuSpatialRuntimeSession, fieldId: string): Float32Array {
  const field = getCpuSpatialRuntimeField(session, fieldId);
  return field.buffers[field.writeBufferIndex].values;
}

export function swapCpuSpatialRuntimeField(session: CpuSpatialRuntimeSession, fieldId: string): void {
  const field = getCpuSpatialRuntimeField(session, fieldId);
  if (field.buffers.length < 2) {
    return;
  }

  const previousRead = field.readBufferIndex;
  field.readBufferIndex = field.writeBufferIndex;
  field.writeBufferIndex = previousRead;
}

export function swapCpuSpatialRuntimeSession(session: CpuSpatialRuntimeSession): void {
  for (const fieldId of session.fieldOrder) {
    swapCpuSpatialRuntimeField(session, fieldId);
  }
  session.frameIndex += 1;
}

export function executeSpatialRuntimePasses(input: ExecuteSpatialRuntimePassesInput): ExecuteSpatialRuntimePassesResult {
  const diagnostics: SpatialRuntimeDiagnostic[] = [];
  const maxPasses = input.maxPasses ?? input.session.plan.profile.maxPassesPerFrame;

  if (input.passes.length > maxPasses) {
    diagnostics.push({
      id: 'spatial-runtime.pass-budget-exceeded',
      severity: 'error',
      message: `Spatial runtime execution received ${input.passes.length} passes, exceeding the limit of ${maxPasses}.`
    });
    input.session.diagnostics.push(...diagnostics);
    return {
      session: input.session,
      executedPasses: 0,
      diagnostics
    };
  }

  let executedPasses = 0;
  for (const [index, pass] of input.passes.entries()) {
    const resolved = resolvePassFields(input.session, pass, index, diagnostics);
    if (!resolved) {
      continue;
    }

    switch (pass.kind) {
      case 'accumulate':
        executeAccumulatePass(pass, resolved);
        break;
      case 'diffusion':
        executeDiffusionPass(pass, resolved);
        break;
      case 'flow-propagation':
        executeFlowPropagationPass(pass, resolved);
        break;
      case 'memory-persistence':
        executeMemoryPersistencePass(pass, resolved);
        break;
      case 'directional-smear':
        executeDirectionalSmearPass(pass, resolved);
        break;
      default:
        assertNever(pass);
    }

    swapCpuSpatialRuntimeField(input.session, pass.targetFieldId);
    executedPasses += 1;
  }

  input.session.diagnostics.push(...diagnostics);
  return {
    session: input.session,
    executedPasses,
    diagnostics
  };
}

function copyInitialValues(
  buffer: CpuSpatialRuntimeBuffer,
  initialValues: ArrayLike<number>,
  diagnostics: SpatialRuntimeDiagnostic[]
): void {
  if (initialValues.length !== buffer.values.length) {
    diagnostics.push({
      id: `spatial-field.${buffer.fieldId}.initial-value-size-mismatch`,
      severity: 'warning',
      fieldId: buffer.fieldId,
      message: `Spatial field "${buffer.fieldId}" initial values contain ${initialValues.length} samples, but the allocated field requires ${buffer.values.length}.`
    });
  }

  const sampleCount = Math.min(initialValues.length, buffer.values.length);
  for (let index = 0; index < sampleCount; index += 1) {
    buffer.values[index] = initialValues[index] ?? 0;
  }
}

function resolvePassFields(
  session: CpuSpatialRuntimeSession,
  pass: CpuSpatialRuntimePass,
  passIndex: number,
  diagnostics: SpatialRuntimeDiagnostic[]
): ResolvedPassFields | undefined {
  const target = resolveField(session, pass.targetFieldId, passIndex, diagnostics, 'target');
  if (!target) {
    return undefined;
  }

  const sourceFieldId = 'sourceFieldId' in pass ? pass.sourceFieldId : undefined;
  const source = sourceFieldId ? resolveField(session, sourceFieldId, passIndex, diagnostics, 'source') : undefined;
  const flowX = pass.kind === 'flow-propagation' ? resolveField(session, pass.flowXFieldId, passIndex, diagnostics, 'source') : undefined;
  const flowY = pass.kind === 'flow-propagation' ? resolveField(session, pass.flowYFieldId, passIndex, diagnostics, 'source') : undefined;

  if ((sourceFieldId && !source) || (pass.kind === 'flow-propagation' && (!flowX || !flowY))) {
    return undefined;
  }

  const comparedFields = [source, flowX, flowY].filter((field): field is CpuSpatialRuntimeField => Boolean(field));
  for (const field of comparedFields) {
    if (!sameDimensions(target.dimensions, field.dimensions)) {
      diagnostics.push({
        id: `spatial-pass.${passIndex}.${pass.kind}.dimension-mismatch`,
        severity: 'error',
        fieldId: target.fieldId,
        message: `Spatial runtime pass ${passIndex} (${pass.kind}) requires matching dimensions, but "${target.fieldId}" is ${target.dimensions.width}x${target.dimensions.height} and "${field.fieldId}" is ${field.dimensions.width}x${field.dimensions.height}.`
      });
      return undefined;
    }
  }

  return { target, source, flowX, flowY };
}

function resolveField(
  session: CpuSpatialRuntimeSession,
  fieldId: string,
  passIndex: number,
  diagnostics: SpatialRuntimeDiagnostic[],
  role: 'target' | 'source'
): CpuSpatialRuntimeField | undefined {
  const field = session.fields[fieldId];
  if (field) {
    return field;
  }

  diagnostics.push({
    id: `spatial-pass.${passIndex}.${role}-field-missing`,
    severity: 'error',
    fieldId,
    message: `Spatial runtime pass ${passIndex} references missing ${role} field "${fieldId}".`
  });
  return undefined;
}

function executeAccumulatePass(pass: AccumulateCpuSpatialRuntimePass, fields: ResolvedPassFields): void {
  const targetRead = readValues(fields.target);
  const targetWrite = writeValues(fields.target);
  const source = fields.source ? readValues(fields.source) : undefined;
  const amount = pass.amount ?? 0;
  const sourceScale = pass.sourceScale ?? 1;
  const retention = 1 - (pass.decay ?? 0);

  for (let index = 0; index < targetWrite.length; index += 1) {
    const sourceValue = source ? source[index] * sourceScale : 0;
    targetWrite[index] = clamp(targetRead[index] * retention + sourceValue + amount, pass);
  }
}

function executeDiffusionPass(pass: DiffusionCpuSpatialRuntimePass, fields: ResolvedPassFields): void {
  const rate = pass.rate ?? 0.25;
  const iterations = Math.max(1, Math.trunc(pass.iterations ?? 1));
  const dimensions = fields.target.dimensions;
  let source = fields.source ? readValues(fields.source) : readValues(fields.target);
  const scratch = new Float32Array(source.length);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const destination = iteration === iterations - 1 ? writeValues(fields.target) : scratch;
    diffuseInto(source, destination, dimensions, rate, pass);
    source = destination;
  }
}

function executeFlowPropagationPass(pass: FlowPropagationCpuSpatialRuntimePass, fields: ResolvedPassFields): void {
  if (!fields.source || !fields.flowX || !fields.flowY) {
    return;
  }

  const source = readValues(fields.source);
  const flowX = readValues(fields.flowX);
  const flowY = readValues(fields.flowY);
  const target = writeValues(fields.target);
  const dimensions = fields.target.dimensions;
  const step = pass.step ?? 1;

  for (let y = 0; y < dimensions.height; y += 1) {
    for (let x = 0; x < dimensions.width; x += 1) {
      const index = offset(x, y, dimensions.width);
      const sampleX = x - flowX[index] * step;
      const sampleY = y - flowY[index] * step;
      target[index] = clamp(sampleBilinear(source, dimensions, sampleX, sampleY), pass);
    }
  }
}

function executeMemoryPersistencePass(pass: MemoryPersistenceCpuSpatialRuntimePass, fields: ResolvedPassFields): void {
  const targetRead = readValues(fields.target);
  const targetWrite = writeValues(fields.target);
  const source = fields.source ? readValues(fields.source) : undefined;
  const persistence = pass.persistence ?? 0.9;
  const decay = pass.decay ?? 0;
  const influence = pass.influence ?? (source ? 1 - persistence : 0);
  const retainedScale = persistence * (1 - decay);

  for (let index = 0; index < targetWrite.length; index += 1) {
    const sourceValue = source ? source[index] * influence : 0;
    targetWrite[index] = clamp(targetRead[index] * retainedScale + sourceValue, pass);
  }
}

function executeDirectionalSmearPass(pass: DirectionalSmearCpuSpatialRuntimePass, fields: ResolvedPassFields): void {
  if (!fields.source) {
    return;
  }

  const source = readValues(fields.source);
  const target = writeValues(fields.target);
  const dimensions = fields.target.dimensions;
  const distance = Math.max(1, Math.trunc(pass.distance ?? 1));
  const strength = pass.strength ?? 0.5;
  const length = Math.hypot(pass.directionX, pass.directionY) || 1;
  const stepX = pass.directionX / length;
  const stepY = pass.directionY / length;

  for (let y = 0; y < dimensions.height; y += 1) {
    for (let x = 0; x < dimensions.width; x += 1) {
      const index = offset(x, y, dimensions.width);
      let total = 0;
      for (let sampleIndex = 1; sampleIndex <= distance; sampleIndex += 1) {
        total += sampleBilinear(source, dimensions, x - stepX * sampleIndex, y - stepY * sampleIndex);
      }
      const smeared = total / distance;
      target[index] = clamp(source[index] * (1 - strength) + smeared * strength, pass);
    }
  }
}

function diffuseInto(
  source: Float32Array,
  destination: Float32Array,
  dimensions: SpatialFieldDimensions,
  rate: number,
  pass: DiffusionCpuSpatialRuntimePass
): void {
  for (let y = 0; y < dimensions.height; y += 1) {
    for (let x = 0; x < dimensions.width; x += 1) {
      const index = offset(x, y, dimensions.width);
      const center = source[index];
      const left = source[offset(Math.max(0, x - 1), y, dimensions.width)];
      const right = source[offset(Math.min(dimensions.width - 1, x + 1), y, dimensions.width)];
      const up = source[offset(x, Math.max(0, y - 1), dimensions.width)];
      const down = source[offset(x, Math.min(dimensions.height - 1, y + 1), dimensions.width)];
      const neighbourAverage = (left + right + up + down) / 4;
      destination[index] = clamp(center + (neighbourAverage - center) * rate, pass);
    }
  }
}

function readValues(field: CpuSpatialRuntimeField): Float32Array {
  return field.buffers[field.readBufferIndex].values;
}

function writeValues(field: CpuSpatialRuntimeField): Float32Array {
  return field.buffers[field.writeBufferIndex].values;
}

function sameDimensions(left: SpatialFieldDimensions, right: SpatialFieldDimensions): boolean {
  return left.width === right.width && left.height === right.height;
}

function offset(x: number, y: number, width: number): number {
  return y * width + x;
}

function sampleBilinear(values: Float32Array, dimensions: SpatialFieldDimensions, x: number, y: number): number {
  const clampedX = clampNumber(x, 0, dimensions.width - 1);
  const clampedY = clampNumber(y, 0, dimensions.height - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(dimensions.width - 1, x0 + 1);
  const y1 = Math.min(dimensions.height - 1, y0 + 1);
  const tx = clampedX - x0;
  const ty = clampedY - y0;
  const top = lerp(values[offset(x0, y0, dimensions.width)], values[offset(x1, y0, dimensions.width)], tx);
  const bottom = lerp(values[offset(x0, y1, dimensions.width)], values[offset(x1, y1, dimensions.width)], tx);
  return lerp(top, bottom, ty);
}

function lerp(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function clamp(value: number, pass: BaseCpuSpatialRuntimePass): number {
  return clampNumber(value, pass.clampMin ?? Number.NEGATIVE_INFINITY, pass.clampMax ?? Number.POSITIVE_INFINITY);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function assertNever(value: never): never {
  throw new Error(`Unsupported spatial runtime pass: ${JSON.stringify(value)}`);
}
