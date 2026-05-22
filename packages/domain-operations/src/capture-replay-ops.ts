import {
  collectProjectIntegrityIssues,
  getDefaultSequence,
  getDefaultVariant,
  getSupportedAutomationProperties,
  getMidiMappingById,
  getSequenceById,
  getVariantById,
  type AutomationTargetProperty,
  type CaptureEvent,
  type CaptureLog,
  type CaptureSession,
  type CompositionDeterministicSeed,
  type FilterInstance,
  type MidiMappingFile,
  type ModulationEndpoint,
  type ModulationMapping,
  type ModulationMappingKind,
  type ModulationRoute,
  type NormalizedCompositionIdentity,
  type NormalizedProjectFile,
  type ProjectIntegrityIssue,
  type Sequence,
  type Variant
} from '@afterimage/project-model';

export type CaptureReplaySkipReason =
  | 'missing-session'
  | 'missing-source'
  | 'missing-target'
  | 'missing-route'
  | 'missing-mapping'
  | 'missing-seed'
  | 'ignored-by-policy'
  | 'not-replay-critical';

export interface CaptureReplayOptions {
  replayCriticalOnly?: boolean;
}

export interface NormalizedCaptureReplayEvent {
  id: string;
  event: CaptureEvent;
  index: number;
  captureTimeMs: number;
  effectiveCompositionTimeMs: number;
  replayCritical: boolean;
  replayable: boolean;
  skipReasons: CaptureReplaySkipReason[];
  diagnostics: ProjectIntegrityIssue[];
  route?: ModulationRoute;
  mapping?: MidiMappingFile;
  seed?: CompositionDeterministicSeed;
}

export interface CaptureReplayIntent {
  projectId: string;
  projectName: string;
  composition: NormalizedCompositionIdentity;
  sequence: Sequence;
  variant: Variant;
  captureSession?: CaptureSession;
  captureLog: CaptureLog;
  replayEvents: NormalizedCaptureReplayEvent[];
  skippedEvents: NormalizedCaptureReplayEvent[];
  referencedRoutes: ModulationRoute[];
  referencedMappings: MidiMappingFile[];
  referencedSeeds: CompositionDeterministicSeed[];
  diagnostics: ProjectIntegrityIssue[];
}

export interface ResolveCaptureReplayIntentInput {
  project: NormalizedProjectFile;
  captureSessionId?: string;
  captureLogId?: string;
  sequenceId?: string;
  variantId?: string;
  availableArchiveIds?: string[];
  options?: CaptureReplayOptions;
}

export type ResolveCaptureReplayIntentResult =
  | {
      ok: true;
      intent: CaptureReplayIntent;
      diagnostics: ProjectIntegrityIssue[];
    }
  | {
      ok: false;
      diagnostics: ProjectIntegrityIssue[];
      intent?: undefined;
    };

export interface CaptureReplayFilterOverrideEvent {
  eventId: string;
  routeId?: string;
  seedId?: string;
  captureTimeMs: number;
  compositionTimeMs: number;
  filterId: string;
  property: AutomationTargetProperty;
  value: number;
  mappingKind: Extract<ModulationMappingKind, 'linear' | 'step' | 'trigger'>;
}

export interface CaptureReplaySkippedRenderEvent {
  eventId: string;
  path: string;
  code: ProjectIntegrityIssue['code'];
  message: string;
}

export interface CaptureReplayRenderState {
  projectId: string;
  compositionId: string;
  sequenceId: string;
  variantId: string;
  captureSessionId?: string;
  captureLogId: string;
  replayEventIds: string[];
  filterOverrides: CaptureReplayFilterOverrideEvent[];
  skippedEvents: CaptureReplaySkippedRenderEvent[];
}

export type ResolveCaptureReplayRenderStateResult =
  | {
      ok: true;
      intent: CaptureReplayIntent;
      renderState: CaptureReplayRenderState;
      diagnostics: ProjectIntegrityIssue[];
    }
  | {
      ok: false;
      diagnostics: ProjectIntegrityIssue[];
      intent?: undefined;
      renderState?: undefined;
    };

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function compareReplayEvents(left: NormalizedCaptureReplayEvent, right: NormalizedCaptureReplayEvent): number {
  return left.index - right.index
    || left.effectiveCompositionTimeMs - right.effectiveCompositionTimeMs
    || compareStrings(left.id, right.id);
}

function pushDiagnostic(issues: ProjectIntegrityIssue[], path: string, message: string): void {
  issues.push({
    code: 'missing-reference',
    path,
    message
  });
}

function pushUnsupportedDiagnostic(issues: ProjectIntegrityIssue[], path: string, message: string): void {
  issues.push({
    code: 'unsupported-value',
    path,
    message
  });
}

function uniqueDiagnostics(issues: ProjectIntegrityIssue[]): ProjectIntegrityIssue[] {
  const seen = new Set<string>();
  return issues
    .sort((left, right) => compareStrings(left.path, right.path) || compareStrings(left.message, right.message))
    .filter((issue) => {
      const key = `${issue.code}:${issue.path}:${issue.message}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => compareStrings(left.id, right.id));
}

function isCaptureDiagnostic(issue: ProjectIntegrityIssue): boolean {
  return issue.path.startsWith('captureLogs.') || issue.path.startsWith('captureSessions.');
}

function findRoute(project: NormalizedProjectFile, routeId: string | undefined): ModulationRoute | undefined {
  return routeId ? project.composition.modulationRoutes.find((route) => route.id === routeId) : undefined;
}

function findSeed(project: NormalizedProjectFile, seedId: string | undefined): CompositionDeterministicSeed | undefined {
  return seedId ? project.composition.deterministicSeeds.find((seed) => seed.id === seedId) : undefined;
}

function findFilter(project: NormalizedProjectFile, filterId: string): FilterInstance | undefined {
  return project.filterStacks
    .flatMap((stack) => stack.filters)
    .find((filter) => filter.id === filterId);
}

function endpointExists(project: NormalizedProjectFile, endpoint: ModulationEndpoint): boolean {
  switch (endpoint.kind) {
    case 'automation-lane':
      return project.automationLanes.some((lane) => lane.id === endpoint.id);
    case 'midi-binding':
      return project.midiMappings.some((mapping) => mapping.bindings.some((binding) => binding.id === endpoint.id));
    case 'capture-event':
      return project.captureLogs.some((log) => log.events.some((event) => event.id === endpoint.id));
    case 'entropy-state':
      return project.composition.entropyStates.some((state) => state.id === endpoint.id);
    case 'modulation-route':
      return project.composition.modulationRoutes.some((route) => route.id === endpoint.id);
    case 'filter':
      return project.filterStacks.some((stack) => stack.filters.some((filter) => filter.id === endpoint.id));
    case 'scene':
    case 'scene-climate':
      return project.composition.scenes.some((scene) => scene.id === endpoint.id);
    case 'layer':
      return project.composition.layers.some((layer) => layer.id === endpoint.id);
    case 'composition':
      return endpoint.id === project.composition.id;
    case 'manual':
      return true;
  }
}

function endpointLabel(endpoint: ModulationEndpoint): string {
  switch (endpoint.kind) {
    case 'automation-lane':
      return 'automation lane';
    case 'midi-binding':
      return 'MIDI binding';
    case 'capture-event':
      return 'capture event';
    case 'entropy-state':
      return 'entropy state';
    case 'modulation-route':
      return 'modulation route';
    case 'filter':
      return 'filter';
    case 'scene':
    case 'scene-climate':
      return 'scene';
    case 'layer':
      return 'layer';
    case 'composition':
      return 'composition';
    case 'manual':
      return 'manual endpoint';
  }
}

function endpointCapturePolicy(project: NormalizedProjectFile, endpoint: ModulationEndpoint): 'ignore' | 'record' | 'replay-critical' | undefined {
  if (endpoint.kind === 'modulation-route') {
    return project.composition.modulationRoutes.find((route) => route.id === endpoint.id)?.capturePolicy;
  }
  if (endpoint.kind === 'entropy-state') {
    return project.composition.entropyStates.find((state) => state.id === endpoint.id)?.capturePolicy;
  }
  return undefined;
}

function resolveCaptureLog(project: NormalizedProjectFile, input: ResolveCaptureReplayIntentInput, diagnostics: ProjectIntegrityIssue[]): CaptureLog | undefined {
  if (input.captureLogId) {
    const captureLog = project.captureLogs.find((log) => log.id === input.captureLogId);
    if (!captureLog) {
      pushDiagnostic(diagnostics, 'captureLogId', `Capture replay references missing capture log "${input.captureLogId}".`);
    }
    return captureLog;
  }

  if (input.captureSessionId) {
    const captureLog = project.captureLogs.find((log) => log.captureSessionId === input.captureSessionId);
    if (!captureLog) {
      pushDiagnostic(diagnostics, 'captureLogId', `Capture replay references missing capture log for session "${input.captureSessionId}".`);
    }
    return captureLog;
  }

  const captureLog = project.captureLogs[0];
  if (!captureLog) {
    pushDiagnostic(diagnostics, 'captureLogId', 'Capture replay references missing capture log.');
  }
  return captureLog;
}

function resolveCaptureSession(project: NormalizedProjectFile, input: ResolveCaptureReplayIntentInput, captureLog: CaptureLog | undefined, diagnostics: ProjectIntegrityIssue[]): CaptureSession | undefined {
  const captureSessionId = input.captureSessionId ?? captureLog?.captureSessionId;
  if (!captureSessionId) {
    return undefined;
  }

  const captureSession = project.captureSessions.find((session) => session.id === captureSessionId);
  if (!captureSession) {
    pushDiagnostic(diagnostics, 'captureSessionId', `Capture replay references missing capture session "${captureSessionId}".`);
  }
  return captureSession;
}

function resolveSequence(project: NormalizedProjectFile, input: ResolveCaptureReplayIntentInput, captureSession: CaptureSession | undefined, diagnostics: ProjectIntegrityIssue[]): Sequence | undefined {
  const sequenceId = input.sequenceId ?? captureSession?.sequenceId;
  const sequence = sequenceId
    ? getSequenceById(project, sequenceId)
    : getSequenceById(project, project.composition.sequenceId) ?? getDefaultSequence(project);

  if (!sequence) {
    pushDiagnostic(diagnostics, 'sequenceId', `Capture replay references missing sequence "${sequenceId ?? project.composition.sequenceId}".`);
  }
  return sequence;
}

function resolveVariant(project: NormalizedProjectFile, input: ResolveCaptureReplayIntentInput, captureSession: CaptureSession | undefined, sequence: Sequence | undefined, diagnostics: ProjectIntegrityIssue[]): Variant | undefined {
  const variantId = input.variantId ?? captureSession?.variantId;
  const variant = variantId
    ? getVariantById(project, variantId)
    : sequence
      ? getVariantById(project, project.composition.variantId) ?? getDefaultVariant(project, sequence.id)
      : getVariantById(project, project.composition.variantId);

  if (!variant) {
    pushDiagnostic(diagnostics, 'variantId', `Capture replay references missing variant "${variantId ?? project.composition.variantId}".`);
    return undefined;
  }

  if (sequence && (variant.sequenceId !== sequence.id || !sequence.variantIds.includes(variant.id))) {
    pushDiagnostic(diagnostics, 'variantId', `Capture replay references variant "${variant.id}" outside sequence "${sequence.id}".`);
  }
  return variant;
}

function normalizeCaptureReplayEvent(
  project: NormalizedProjectFile,
  captureLog: CaptureLog,
  event: CaptureEvent,
  options: Required<CaptureReplayOptions>
): NormalizedCaptureReplayEvent {
  const diagnostics: ProjectIntegrityIssue[] = [];
  const skipReasons: CaptureReplaySkipReason[] = [];
  const path = `captureLogs.${captureLog.id}.events.${event.id}`;
  const route = findRoute(project, event.routeId);
  const mapping = event.mappingId ? getMidiMappingById(project, event.mappingId) : undefined;
  const seed = findSeed(project, event.seedId);

  if (!project.captureSessions.some((session) => session.id === event.captureId)) {
    skipReasons.push('missing-session');
    pushDiagnostic(diagnostics, `${path}.captureId`, `Capture event "${event.id}" references missing capture session "${event.captureId}".`);
  }

  if (!endpointExists(project, event.source)) {
    skipReasons.push('missing-source');
    pushDiagnostic(diagnostics, `${path}.source.id`, `Capture event "${event.id}" source references missing ${endpointLabel(event.source)} "${event.source.id}".`);
  }

  if (!event.target) {
    skipReasons.push('missing-target');
    pushDiagnostic(diagnostics, `${path}.target`, `Capture event "${event.id}" is missing a replay target.`);
  } else if (!endpointExists(project, event.target)) {
    skipReasons.push('missing-target');
    pushDiagnostic(diagnostics, `${path}.target.id`, `Capture event "${event.id}" target references missing ${endpointLabel(event.target)} "${event.target.id}".`);
  }

  if (event.routeId && !route) {
    skipReasons.push('missing-route');
    pushDiagnostic(diagnostics, `${path}.routeId`, `Capture event "${event.id}" references missing modulation route "${event.routeId}".`);
  }

  if (event.mappingId && !mapping) {
    skipReasons.push('missing-mapping');
    pushDiagnostic(diagnostics, `${path}.mappingId`, `Capture event "${event.id}" references missing MIDI mapping "${event.mappingId}".`);
  }

  if (event.seedId && !seed) {
    skipReasons.push('missing-seed');
    pushDiagnostic(diagnostics, `${path}.seedId`, `Capture event "${event.id}" references missing deterministic seed "${event.seedId}".`);
  }

  const sourcePolicy = endpointCapturePolicy(project, event.source);
  const targetPolicy = event.target ? endpointCapturePolicy(project, event.target) : undefined;
  const policyIgnored = route?.capturePolicy === 'ignore' || sourcePolicy === 'ignore' || targetPolicy === 'ignore';
  const replayCritical = event.replayCritical
    || route?.capturePolicy === 'replay-critical'
    || sourcePolicy === 'replay-critical'
    || targetPolicy === 'replay-critical';

  if (policyIgnored) {
    skipReasons.push('ignored-by-policy');
  } else if (options.replayCriticalOnly && !replayCritical) {
    skipReasons.push('not-replay-critical');
  }

  return {
    id: event.id,
    event,
    index: event.index,
    captureTimeMs: event.captureTimeMs,
    effectiveCompositionTimeMs: event.compositionTimeMs ?? event.captureTimeMs,
    replayCritical,
    replayable: skipReasons.length === 0,
    skipReasons: [...new Set(skipReasons)],
    diagnostics: uniqueDiagnostics(diagnostics),
    route,
    mapping,
    seed
  };
}

function collectReferenced<T extends { id: string }>(events: NormalizedCaptureReplayEvent[], pick: (event: NormalizedCaptureReplayEvent) => T | undefined): T[] {
  const byId = new Map<string, T>();
  for (const event of events) {
    const item = pick(event);
    if (item) {
      byId.set(item.id, item);
    }
  }
  return sortById([...byId.values()]);
}

export function normalizeCaptureReplayEvents(input: {
  project: NormalizedProjectFile;
  captureLog: CaptureLog;
  options?: CaptureReplayOptions;
}): NormalizedCaptureReplayEvent[] {
  const options: Required<CaptureReplayOptions> = {
    replayCriticalOnly: input.options?.replayCriticalOnly ?? true
  };

  return input.captureLog.events
    .map((event) => normalizeCaptureReplayEvent(input.project, input.captureLog, event, options))
    .sort(compareReplayEvents);
}

export function resolveCaptureReplayIntent(input: ResolveCaptureReplayIntentInput): ResolveCaptureReplayIntentResult {
  const diagnostics: ProjectIntegrityIssue[] = collectProjectIntegrityIssues(input.project, {
    availableArchiveIds: input.availableArchiveIds
  }).filter((issue) => !isCaptureDiagnostic(issue));

  const captureLog = resolveCaptureLog(input.project, input, diagnostics);
  const captureSession = resolveCaptureSession(input.project, input, captureLog, diagnostics);
  const sequence = resolveSequence(input.project, input, captureSession, diagnostics);
  const variant = resolveVariant(input.project, input, captureSession, sequence, diagnostics);

  const blockingDiagnostics = diagnostics.filter((issue) => issue.path !== 'captureSessionId');
  if (!captureLog || !sequence || !variant || blockingDiagnostics.length > 0) {
    return {
      ok: false,
      diagnostics: uniqueDiagnostics(diagnostics)
    };
  }

  const normalizedEvents = normalizeCaptureReplayEvents({
    project: input.project,
    captureLog,
    options: input.options
  });
  const replayEvents = normalizedEvents.filter((event) => event.replayable);
  const skippedEvents = normalizedEvents.filter((event) => !event.replayable);
  const replayDiagnostics = uniqueDiagnostics([
    ...diagnostics,
    ...normalizedEvents.flatMap((event) => event.diagnostics)
  ]);

  return {
    ok: true,
    diagnostics: replayDiagnostics,
    intent: {
      projectId: input.project.id,
      projectName: input.project.name,
      composition: input.project.composition,
      sequence,
      variant,
      captureSession,
      captureLog,
      replayEvents,
      skippedEvents,
      referencedRoutes: collectReferenced(replayEvents, (event) => event.route),
      referencedMappings: collectReferenced(replayEvents, (event) => event.mapping),
      referencedSeeds: collectReferenced(replayEvents, (event) => event.seed),
      diagnostics: replayDiagnostics
    }
  };
}

function getPayloadValue(event: NormalizedCaptureReplayEvent): number | undefined {
  const payload = event.event.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }

  const value = (payload as Record<string, unknown>).value;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mapCaptureValue(value: number, mapping: ModulationMapping): number {
  const inputMin = mapping.inputMin ?? 0;
  const inputMax = mapping.inputMax ?? 1;
  const outputMin = mapping.outputMin ?? 0;
  const outputMax = mapping.outputMax ?? 1;

  if (mapping.kind === 'trigger') {
    return outputMax;
  }

  if (mapping.kind === 'step') {
    const threshold = inputMax !== inputMin ? inputMax : inputMin;
    return value >= threshold ? outputMax : outputMin;
  }

  const span = inputMax === inputMin ? 1 : inputMax - inputMin;
  let ratio = (value - inputMin) / span;
  if (mapping.clamp !== false) {
    ratio = Math.min(1, Math.max(0, ratio));
  }
  if (mapping.invert === true) {
    ratio = 1 - ratio;
  }
  return outputMin + ((outputMax - outputMin) * ratio);
}

function resolveRenderOverride(
  project: NormalizedProjectFile,
  captureLogId: string,
  event: NormalizedCaptureReplayEvent
): { override?: CaptureReplayFilterOverrideEvent; diagnostics: ProjectIntegrityIssue[] } {
  const diagnostics: ProjectIntegrityIssue[] = [];
  const path = `captureLogs.${captureLogId}.events.${event.id}`;

  if (event.event.kind !== 'input' && event.event.kind !== 'modulation') {
    pushUnsupportedDiagnostic(diagnostics, `${path}.kind`, `Capture event "${event.id}" kind "${event.event.kind}" is not supported for render replay.`);
    return { diagnostics };
  }

  if (!event.event.target || event.event.target.kind !== 'filter') {
    pushUnsupportedDiagnostic(diagnostics, `${path}.target`, `Capture event "${event.id}" target is not a supported filter replay target.`);
    return { diagnostics };
  }

  const filter = findFilter(project, event.event.target.id);
  const property = event.event.target.property;
  if (!filter || !property) {
    pushUnsupportedDiagnostic(diagnostics, `${path}.target`, `Capture event "${event.id}" does not resolve to a supported filter property.`);
    return { diagnostics };
  }

  const supportedProperties = new Set(getSupportedAutomationProperties(filter.type));
  if (!supportedProperties.has(property as AutomationTargetProperty)) {
    pushUnsupportedDiagnostic(diagnostics, `${path}.target.property`, `Capture event "${event.id}" targets unsupported property "${property}" for filter "${filter.id}".`);
    return { diagnostics };
  }

  if (!event.route) {
    pushUnsupportedDiagnostic(diagnostics, `${path}.routeId`, `Capture event "${event.id}" has no modulation route mapping for render replay.`);
    return { diagnostics };
  }

  if (event.route.mapping.kind !== 'linear' && event.route.mapping.kind !== 'step' && event.route.mapping.kind !== 'trigger') {
    pushUnsupportedDiagnostic(diagnostics, `${path}.routeId`, `Capture event "${event.id}" mapping "${event.route.mapping.kind}" is not supported for render replay.`);
    return { diagnostics };
  }

  const payloadValue = getPayloadValue(event);
  if (payloadValue === undefined) {
    pushUnsupportedDiagnostic(diagnostics, `${path}.payload.value`, `Capture event "${event.id}" payload.value must be numeric for render replay.`);
    return { diagnostics };
  }

  return {
    diagnostics,
    override: {
      eventId: event.id,
      routeId: event.route.id,
      seedId: event.seed?.id,
      captureTimeMs: event.captureTimeMs,
      compositionTimeMs: event.effectiveCompositionTimeMs,
      filterId: filter.id,
      property: property as AutomationTargetProperty,
      value: mapCaptureValue(payloadValue, event.route.mapping),
      mappingKind: event.route.mapping.kind
    }
  };
}

export function resolveCaptureReplayRenderState(input: ResolveCaptureReplayIntentInput): ResolveCaptureReplayRenderStateResult {
  const intentResult = resolveCaptureReplayIntent(input);
  if (!intentResult.ok) {
    return intentResult;
  }

  const filterOverrides: CaptureReplayFilterOverrideEvent[] = [];
  const skippedEvents: CaptureReplaySkippedRenderEvent[] = intentResult.intent.skippedEvents.flatMap((event) => event.diagnostics.map((diagnostic) => ({
    eventId: event.id,
    path: diagnostic.path,
    code: diagnostic.code,
    message: diagnostic.message
  })));
  const renderDiagnostics: ProjectIntegrityIssue[] = [];

  for (const event of intentResult.intent.replayEvents) {
    const result = resolveRenderOverride(input.project, intentResult.intent.captureLog.id, event);
    if (result.override) {
      filterOverrides.push(result.override);
    }
    renderDiagnostics.push(...result.diagnostics);
    skippedEvents.push(...result.diagnostics.map((diagnostic) => ({
      eventId: event.id,
      path: diagnostic.path,
      code: diagnostic.code,
      message: diagnostic.message
    })));
  }

  filterOverrides.sort((left, right) => left.compositionTimeMs - right.compositionTimeMs || compareStrings(left.eventId, right.eventId));

  const diagnostics = uniqueDiagnostics([
    ...intentResult.diagnostics,
    ...renderDiagnostics
  ]);

  return {
    ok: true,
    intent: intentResult.intent,
    diagnostics,
    renderState: {
      projectId: intentResult.intent.projectId,
      compositionId: intentResult.intent.composition.id,
      sequenceId: intentResult.intent.sequence.id,
      variantId: intentResult.intent.variant.id,
      captureSessionId: intentResult.intent.captureSession?.id,
      captureLogId: intentResult.intent.captureLog.id,
      replayEventIds: intentResult.intent.replayEvents.map((event) => event.id),
      filterOverrides,
      skippedEvents
    }
  };
}
