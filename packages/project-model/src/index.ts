export const CURRENT_PROJECT_VERSION = 2;

export type RuntimeMode = 'studio' | 'live-desktop' | 'live-appliance';
export type PresetFamily = 'vhs' | 'liminal' | 'imagined-futures' | 'glitch';
export type MidiBindingMode = 'set' | 'toggle' | 'scale' | 'trigger';
export type ProbeStreamType = 'video' | 'audio' | 'subtitle' | 'data' | 'unknown';
export type MediaType = 'video' | 'image' | 'audio';
export type AssetRole = 'source' | 'music' | 'transition-mask' | 'transition-overlay';
export type ImportStatus = 'ready' | 'excluded' | 'missing';
export type AnalysisStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed';
export type CutStatus = 'new' | 'kept' | 'rejected' | 'favorite';
export type AudioChangeKind = 'energy-shift' | 'spectral-change' | 'silence-start' | 'silence-end' | 'onset-cluster';
export type AudioChangeSource = 'astats' | 'aspectralstats' | 'ebur128' | 'silencedetect' | 'derived';
export type SyncEventSource = 'audio-change' | 'beat' | 'downbeat' | 'midi' | 'manual';
export type SyncEventKind = 'change' | 'accent' | 'section' | 'silence-boundary' | 'cue' | 'beat' | 'downbeat';
export type SyncMode = 'texture' | 'pulse' | 'performance' | 'hybrid' | 'custom';
export type TransitionStyle = 'cut' | 'crossfade' | 'mask';
export type AssistedGenerationStrategy =
  | 'manual'
  | 'chronological'
  | 'marker-aware'
  | 'motif'
  | 'seeded-constrained';
export type FilterStackScope = 'sequence' | 'clip' | 'preset';
export type SupportedFilterType = 'contrast' | 'brightness' | 'blur' | 'bloom-soft' | 'glitch-bands' | 'chroma-bleed';
export type AutomationTargetProperty = 'mix' | 'contrast' | 'brightness' | 'radius' | 'strength';
export type StudioErrorCode =
  | 'invalid-project-file'
  | 'schema-validation-failure'
  | 'migration-failure'
  | 'missing-media'
  | 'unsupported-media'
  | 'toolchain-unavailable'
  | 'analysis-failure'
  | 'render-failure'
  | 'output-path-failure'
  | 'permission-failure';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ProjectPathRef {
  absolutePath: string;
  relativePath?: string;
}

export interface ProjectMetadata {
  createdAt: string;
  updatedAt?: string;
  projectFileName?: string;
  currentProfileSet?: string;
}

export interface MediaAsset {
  id: string;
  filename: string;
  mediaType: MediaType;
  assetRole?: AssetRole;
  path: ProjectPathRef;
  label?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  frameRate?: number;
  hasAudio: boolean;
  importStatus?: ImportStatus;
  analysisStatus?: AnalysisStatus;
  favorite?: boolean;
  tags?: string[];
  notes?: string;
}

export interface PresetFilter {
  type: string;
  amount: number;
  mix?: number;
  seed?: number;
}

export interface Preset {
  id: string;
  name: string;
  family: PresetFamily;
  filters: PresetFilter[];
}

export interface ProbeStream {
  codecType: ProbeStreamType;
  codecName?: string;
  width?: number;
  height?: number;
  sampleRate?: number;
  channels?: number;
  avgFrameRate?: string;
}

export interface ProbeMetadata {
  formatName?: string;
  durationMs: number;
  bitRate?: number;
  streams: ProbeStream[];
}

export interface SceneCut {
  timeMs: number;
  score: number;
}

export interface ThumbnailReference {
  id: string;
  timeMs: number;
  path: string;
}

export interface WaveformSummary {
  durationMs: number;
  peaks: number[];
}

export interface AudioChangeEvent {
  id: string;
  timeMs: number;
  kind: AudioChangeKind;
  source: AudioChangeSource;
  strength: number;
  confidence?: number;
  durationMs?: number;
  label?: string;
  metadata?: Record<string, JsonPrimitive>;
}

export interface AudioChangeTrack {
  id: string;
  assetId: string;
  generatedBy: string[];
  events: AudioChangeEvent[];
}

export interface SyncEvent {
  id: string;
  timeMs: number;
  source: SyncEventSource;
  kind: SyncEventKind;
  strength?: number;
  confidence?: number;
  label?: string;
  audioChangeEventId?: string;
}

export interface SyncEventTrack {
  id: string;
  assetId: string;
  derivedFromTrackId?: string;
  events: SyncEvent[];
}

export interface BeatEvent {
  id: string;
  timeMs: number;
  kind: 'beat' | 'downbeat';
  confidence?: number;
  bpm?: number;
}

export interface BeatTrack {
  id: string;
  assetId: string;
  events: BeatEvent[];
}

export interface MidiGestureEvent {
  id: string;
  timeMs: number;
  source: string;
  value?: number;
  label?: string;
}

export interface MidiGestureTrack {
  id: string;
  assetId: string;
  events: MidiGestureEvent[];
}

export interface LumaSummary {
  average: number;
  minimum: number;
  maximum: number;
}

export interface MotionSummary {
  average: number;
  peak: number;
}

export interface AnalysisSummary {
  sceneCount: number;
  durationMs?: number;
  thumbnailCount?: number;
  waveformGenerated?: boolean;
  lumaAverage?: number;
  motionAverage?: number;
  changeEventCount?: number;
  syncEventCount?: number;
  beatEventCount?: number;
}

export interface AnalysisFile {
  id: string;
  assetId: string;
  probe: ProbeMetadata;
  sceneCuts: SceneCut[];
  thumbnails?: ThumbnailReference[];
  waveform?: WaveformSummary;
  audioChangeTrack?: AudioChangeTrack;
  syncEventTrack?: SyncEventTrack;
  beatTrack?: BeatTrack;
  midiGestureTrack?: MidiGestureTrack;
  luma?: LumaSummary;
  motion?: MotionSummary;
  summary?: AnalysisSummary;
}

export interface AnalysisRef {
  id: string;
  assetId: string;
  path: string;
  thumbnailManifestPath?: string;
  waveformPath?: string;
  summary?: AnalysisSummary;
}

export interface CutCandidate {
  id: string;
  assetId: string;
  analysisRefId?: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  sceneScore?: number;
  motion?: MotionSummary;
  luma?: LumaSummary;
  thumbnailPath?: string;
  tags?: string[];
  note?: string;
  status?: CutStatus;
  favorite?: boolean;
  binIds?: string[];
}

export interface Bin {
  id: string;
  name: string;
  cutIds: string[];
  note?: string;
}

export interface Marker {
  id: string;
  timeMs: number;
  label: string;
  kind?: 'marker' | 'beat' | 'chapter';
}

export interface Section {
  id: string;
  startMs: number;
  endMs: number;
  label: string;
}

export interface FilterInstance {
  id: string;
  type: string;
  enabled?: boolean;
  orderIndex: number;
  parameters?: Record<string, JsonPrimitive>;
  mix?: number;
  seed?: number;
  automationLaneIds?: string[];
}

export interface FilterStack {
  id: string;
  name: string;
  scope: FilterStackScope;
  family?: PresetFamily;
  filters: FilterInstance[];
}

export interface SequenceClip {
  id: string;
  assetId: string;
  cutId?: string;
  timelineStartMs: number;
  sourceStartMs: number;
  durationMs: number;
  overlayAssetId?: string;
  overlayCutId?: string;
  transition?: TransitionStyle;
  transitionDurationMs?: number;
  transitionAssetId?: string;
  transitionCutId?: string;
  transitionOverlayAssetId?: string;
  transitionOverlayCutId?: string;
  presetId?: string;
  stackOverrideId?: string;
  tags?: string[];
  notes?: string;
}

export interface AssistedGenerationMetadata {
  strategy: AssistedGenerationStrategy;
  seed?: number;
  parameters?: Record<string, JsonValue>;
  sourcePoolIds?: string[];
  durationTargetMs?: number;
  exclusionTags?: string[];
}

export interface MusicAlignment {
  primaryAssetId?: string;
  analysisRefId?: string;
  syncMode?: SyncMode;
  beatMarkers?: Marker[];
  chapterPoints?: number[];
  snapToBeatGrid?: boolean;
}

export interface Variant {
  id: string;
  sequenceId: string;
  name: string;
  clips: SequenceClip[];
  markers?: Marker[];
  sections?: Section[];
  stackId?: string;
  favorite?: boolean;
  locked?: boolean;
  assistedGeneration?: AssistedGenerationMetadata;
  musicAlignment?: MusicAlignment;
}

export interface Sequence {
  id: string;
  name: string;
  variantIds: string[];
  defaultVariantId?: string;
  favorite?: boolean;
  notes?: string;
}

export interface AutomationKeyframe {
  id: string;
  timeMs: number;
  value: number;
}

export interface AutomationSectionValue {
  sectionId: string;
  value: number;
}

export interface MidiBinding {
  id: string;
  source: string;
  target: string;
  mode: MidiBindingMode;
}

export interface MidiMappingFile {
  id: string;
  name: string;
  bindings: MidiBinding[];
}

export interface MidiIntent {
  id: string;
  mappingId: string;
  source: string;
  quantizeMs?: number;
}

export interface AutomationTarget {
  filterId: string;
  property: AutomationTargetProperty;
}

export interface AutomationLane {
  id: string;
  name: string;
  target: AutomationTarget;
  enabled?: boolean;
  keyframes: AutomationKeyframe[];
  sectionValues?: AutomationSectionValue[];
  midiIntent?: MidiIntent;
}

export interface ExportSelection {
  profileId: string;
  enabled?: boolean;
  overwriteExisting?: boolean;
  lastOutputDirectory?: string;
}

export interface FeatureFlags {
  recordedMidiAutomation?: boolean;
  advancedBeatDetection?: boolean;
  proxyGeneration?: boolean;
  advancedAssistedSequencing?: boolean;
  complexTransitions?: boolean;
}

export interface ProjectFile {
  id: string;
  name: string;
  mode: RuntimeMode;
  version: number;
  description?: string;
  metadata?: ProjectMetadata;
  assets: MediaAsset[];
  presets: Preset[];
  analysisRefs?: AnalysisRef[];
  cutCandidates?: CutCandidate[];
  bins?: Bin[];
  sequences: Sequence[];
  variants: Variant[];
  filterStacks?: FilterStack[];
  automationLanes?: AutomationLane[];
  midiMappings?: MidiMappingFile[];
  exportSelections?: ExportSelection[];
  defaultSequenceId?: string;
  featureFlags?: FeatureFlags;
  notes?: string;
  tags?: string[];
}

export interface NormalizedProjectFile extends Omit<ProjectFile,
  | 'analysisRefs'
  | 'cutCandidates'
  | 'bins'
  | 'filterStacks'
  | 'automationLanes'
  | 'midiMappings'
  | 'exportSelections'
  | 'metadata'
  | 'featureFlags'
  | 'tags'> {
  metadata: ProjectMetadata;
  analysisRefs: AnalysisRef[];
  cutCandidates: CutCandidate[];
  bins: Bin[];
  filterStacks: FilterStack[];
  automationLanes: AutomationLane[];
  midiMappings: MidiMappingFile[];
  exportSelections: ExportSelection[];
  featureFlags: FeatureFlags;
  tags: string[];
}

export interface ProjectIntegrityIssue {
  code: 'duplicate-id' | 'missing-reference' | 'invalid-range' | 'unsupported-value';
  path: string;
  message: string;
}

export interface FilterParameterDefinition {
  key: Exclude<AutomationTargetProperty, 'mix'>;
  label: string;
  min: number;
  max: number;
  defaultValue: number;
  step: number;
}

export interface FilterDefinition {
  type: SupportedFilterType;
  label: string;
  ffmpegGroup: 'eq' | 'gblur' | 'noise';
  parameters: readonly FilterParameterDefinition[];
}

const SUPPORTED_FILTER_DEFINITIONS = [
  {
    type: 'contrast',
    label: 'Contrast',
    ffmpegGroup: 'eq',
    parameters: [
      {
        key: 'contrast',
        label: 'Contrast',
        min: 0,
        max: 1,
        defaultValue: 0.35,
        step: 0.01
      }
    ]
  },
  {
    type: 'brightness',
    label: 'Brightness',
    ffmpegGroup: 'eq',
    parameters: [
      {
        key: 'brightness',
        label: 'Brightness',
        min: 0,
        max: 1,
        defaultValue: 0.5,
        step: 0.01
      }
    ]
  },
  {
    type: 'blur',
    label: 'Blur',
    ffmpegGroup: 'gblur',
    parameters: [
      {
        key: 'radius',
        label: 'Radius',
        min: 0,
        max: 1,
        defaultValue: 0.24,
        step: 0.01
      }
    ]
  },
  {
    type: 'bloom-soft',
    label: 'Bloom Soft',
    ffmpegGroup: 'gblur',
    parameters: [
      {
        key: 'strength',
        label: 'Strength',
        min: 0,
        max: 1,
        defaultValue: 0.28,
        step: 0.01
      }
    ]
  },
  {
    type: 'glitch-bands',
    label: 'Glitch Bands',
    ffmpegGroup: 'noise',
    parameters: [
      {
        key: 'strength',
        label: 'Strength',
        min: 0,
        max: 1,
        defaultValue: 0.22,
        step: 0.01
      }
    ]
  },
  {
    type: 'chroma-bleed',
    label: 'Chroma Bleed',
    ffmpegGroup: 'eq',
    parameters: [
      {
        key: 'strength',
        label: 'Strength',
        min: 0,
        max: 1,
        defaultValue: 0.25,
        step: 0.01
      }
    ]
  }
] as const satisfies readonly FilterDefinition[];

export const supportedFilterDefinitions = SUPPORTED_FILTER_DEFINITIONS;
export const supportedFilterTypes = SUPPORTED_FILTER_DEFINITIONS.map((definition) => definition.type);

export function isSupportedFilterType(value: string): value is SupportedFilterType {
  return supportedFilterTypes.includes(value as SupportedFilterType);
}

export function getFilterDefinition(type: string): FilterDefinition | undefined {
  return SUPPORTED_FILTER_DEFINITIONS.find((definition) => definition.type === type);
}

export function getDefaultFilterParameters(type: SupportedFilterType): Record<Exclude<AutomationTargetProperty, 'mix'>, JsonPrimitive> {
  const definition = getFilterDefinition(type);
  return Object.fromEntries(
    (definition?.parameters ?? []).map((parameter) => [parameter.key, parameter.defaultValue])
  ) as Record<Exclude<AutomationTargetProperty, 'mix'>, JsonPrimitive>;
}

export function getSupportedAutomationProperties(type: string): AutomationTargetProperty[] {
  const definition = getFilterDefinition(type);
  return definition ? ['mix', ...definition.parameters.map((parameter) => parameter.key)] : [];
}

export function getFilterParameterValue(filter: FilterInstance | PresetFilter, property: Exclude<AutomationTargetProperty, 'mix'>): number | undefined {
  if ('amount' in filter) {
    return property === getPrimaryAutomationProperty(filter.type) ? filter.amount : undefined;
  }

  const value = filter.parameters?.[property];
  return typeof value === 'number' ? value : undefined;
}

export function getPrimaryAutomationProperty(type: string): Exclude<AutomationTargetProperty, 'mix'> | undefined {
  return getFilterDefinition(type)?.parameters[0]?.key;
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

function normalizeBoolean(value: boolean | undefined, fallback: boolean): boolean {
  return value ?? fallback;
}

function normalizeNumber(value: number | undefined, fallback: number): number {
  return value ?? fallback;
}

function normalizeStringArray(value: string[] | undefined): string[] {
  return [...new Set(value ?? [])].sort(compareStrings);
}

function clampUnit(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeJsonRecord(record: Record<string, JsonPrimitive> | undefined): Record<string, JsonPrimitive> {
  return Object.fromEntries(Object.entries(record ?? {}).sort(([left], [right]) => compareStrings(left, right)));
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => compareStrings(left.id, right.id));
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function normalizeProjectPathRef(path: ProjectPathRef): ProjectPathRef {
  return {
    absolutePath: path.absolutePath,
    relativePath: path.relativePath
  };
}

export function normalizePresetFilter(filter: PresetFilter): PresetFilter {
  return {
    ...filter,
    amount: clampUnit(filter.amount) ?? 0,
    mix: filter.mix ?? 1
  };
}

export function normalizePreset(preset: Preset): Preset {
  return {
    ...preset,
    filters: preset.filters.map(normalizePresetFilter)
  };
}

export function normalizeMediaAsset(asset: MediaAsset): MediaAsset {
  const normalizedTags = normalizeStringArray(asset.tags);
  const defaultRole: AssetRole = asset.mediaType === 'audio' || normalizedTags.includes('music')
    ? 'music'
    : 'source';

  return {
    ...asset,
    path: normalizeProjectPathRef(asset.path),
    hasAudio: normalizeBoolean(asset.hasAudio, asset.mediaType !== 'image'),
    assetRole: asset.assetRole ?? defaultRole,
    importStatus: asset.importStatus ?? 'ready',
    analysisStatus: asset.analysisStatus ?? 'pending',
    favorite: normalizeBoolean(asset.favorite, false),
    tags: normalizedTags
  };
}

export function normalizeProbeMetadata(probe: ProbeMetadata): ProbeMetadata {
  return {
    ...probe,
    streams: probe.streams.map((stream) => ({ ...stream }))
  };
}

export function normalizeAudioChangeEvent(event: AudioChangeEvent): AudioChangeEvent {
  return {
    ...event,
    strength: clampUnit(event.strength) ?? 0,
    confidence: clampUnit(event.confidence),
    metadata: normalizeJsonRecord(event.metadata)
  };
}

export function normalizeAudioChangeTrack(track: AudioChangeTrack): AudioChangeTrack {
  return {
    ...track,
    generatedBy: normalizeStringArray(track.generatedBy),
    events: sortById(track.events.map(normalizeAudioChangeEvent))
      .sort((left, right) => compareNumbers(left.timeMs, right.timeMs) || compareStrings(left.id, right.id))
  };
}

export function normalizeSyncEvent(event: SyncEvent): SyncEvent {
  return {
    ...event,
    strength: clampUnit(event.strength),
    confidence: clampUnit(event.confidence)
  };
}

export function normalizeSyncEventTrack(track: SyncEventTrack): SyncEventTrack {
  return {
    ...track,
    events: sortById(track.events.map(normalizeSyncEvent))
      .sort((left, right) => compareNumbers(left.timeMs, right.timeMs) || compareStrings(left.id, right.id))
  };
}

export function normalizeBeatTrack(track: BeatTrack): BeatTrack {
  return {
    ...track,
    events: sortById(track.events.map((event) => ({
      ...event,
      confidence: clampUnit(event.confidence)
    }))).sort((left, right) => compareNumbers(left.timeMs, right.timeMs) || compareStrings(left.id, right.id))
  };
}

export function normalizeMidiGestureTrack(track: MidiGestureTrack): MidiGestureTrack {
  return {
    ...track,
    events: sortById(track.events.map((event) => ({ ...event })))
      .sort((left, right) => compareNumbers(left.timeMs, right.timeMs) || compareStrings(left.id, right.id))
  };
}

export function normalizeAnalysisFile(file: AnalysisFile): AnalysisFile {
  const sceneCuts = [...file.sceneCuts].sort((left, right) => compareNumbers(left.timeMs, right.timeMs) || compareNumbers(left.score, right.score));
  const thumbnails = sortById((file.thumbnails ?? []).map((thumbnail) => ({ ...thumbnail })));
  const waveform = file.waveform ? {
    durationMs: file.waveform.durationMs,
    peaks: [...file.waveform.peaks]
  } : undefined;
  const audioChangeTrack = file.audioChangeTrack ? normalizeAudioChangeTrack(file.audioChangeTrack) : undefined;
  const syncEventTrack = file.syncEventTrack ? normalizeSyncEventTrack(file.syncEventTrack) : undefined;
  const beatTrack = file.beatTrack ? normalizeBeatTrack(file.beatTrack) : undefined;
  const midiGestureTrack = file.midiGestureTrack ? normalizeMidiGestureTrack(file.midiGestureTrack) : undefined;
  const luma = file.luma ? { ...file.luma } : undefined;
  const motion = file.motion ? { ...file.motion } : undefined;

  return {
    ...file,
    probe: normalizeProbeMetadata(file.probe),
    sceneCuts,
    thumbnails,
    waveform,
    audioChangeTrack,
    syncEventTrack,
    beatTrack,
    midiGestureTrack,
    luma,
    motion,
    summary: file.summary ?? {
      sceneCount: sceneCuts.length,
      durationMs: file.probe.durationMs,
      thumbnailCount: thumbnails.length,
      waveformGenerated: waveform !== undefined,
      lumaAverage: luma?.average,
      motionAverage: motion?.average,
      changeEventCount: audioChangeTrack?.events.length,
      syncEventCount: syncEventTrack?.events.length,
      beatEventCount: beatTrack?.events.length
    }
  };
}

export function normalizeAnalysisRef(ref: AnalysisRef): AnalysisRef {
  return {
    ...ref,
    summary: ref.summary ? { ...ref.summary } : undefined
  };
}

export function normalizeCutCandidate(candidate: CutCandidate): CutCandidate {
  return {
    ...candidate,
    tags: normalizeStringArray(candidate.tags),
    status: candidate.status ?? 'new',
    favorite: normalizeBoolean(candidate.favorite, false),
    binIds: normalizeStringArray(candidate.binIds)
  };
}

export function normalizeBin(bin: Bin): Bin {
  return {
    ...bin,
    cutIds: normalizeStringArray(bin.cutIds)
  };
}

export function normalizeMarker(marker: Marker): Marker {
  return {
    ...marker,
    kind: marker.kind ?? 'marker'
  };
}

export function normalizeSection(section: Section): Section {
  return { ...section };
}

export function normalizeFilterInstance(filter: FilterInstance): FilterInstance {
  const definition = getFilterDefinition(filter.type);
  const normalizedParameters = normalizeJsonRecord(filter.parameters);
  const mergedParameters = definition
    ? Object.fromEntries(
        definition.parameters.map((parameter) => {
          const candidate = normalizedParameters[parameter.key];
          const numericValue = typeof candidate === 'number' ? candidate : parameter.defaultValue;
          return [parameter.key, Math.max(parameter.min, Math.min(parameter.max, numericValue))];
        })
      )
    : normalizedParameters;

  return {
    ...filter,
    enabled: normalizeBoolean(filter.enabled, true),
    parameters: mergedParameters,
    mix: clampUnit(filter.mix) ?? 1,
    automationLaneIds: normalizeStringArray(filter.automationLaneIds)
  };
}

export function normalizeFilterStack(stack: FilterStack): FilterStack {
  return {
    ...stack,
    filters: [...stack.filters]
      .map(normalizeFilterInstance)
      .sort((left, right) => compareNumbers(left.orderIndex, right.orderIndex) || compareStrings(left.id, right.id))
  };
}

export function normalizeSequenceClip(clip: SequenceClip): SequenceClip {
  return {
    ...clip,
    overlayAssetId: clip.overlayAssetId,
    overlayCutId: clip.overlayCutId,
    transition: clip.transition ?? 'cut',
    transitionDurationMs: clip.transition === 'crossfade' || clip.transition === 'mask'
      ? normalizeNumber(clip.transitionDurationMs, 250)
      : clip.transitionDurationMs,
    transitionCutId: clip.transitionCutId,
    transitionOverlayCutId: clip.transitionOverlayCutId,
    tags: normalizeStringArray(clip.tags)
  };
}

export function normalizeVariant(variant: Variant): Variant {
  return {
    ...variant,
    clips: [...variant.clips]
      .map(normalizeSequenceClip)
      .sort((left, right) => compareNumbers(left.timelineStartMs, right.timelineStartMs) || compareStrings(left.id, right.id)),
    markers: sortById((variant.markers ?? []).map(normalizeMarker)).sort((left, right) => compareNumbers(left.timeMs, right.timeMs) || compareStrings(left.id, right.id)),
    sections: sortById((variant.sections ?? []).map(normalizeSection)).sort((left, right) => compareNumbers(left.startMs, right.startMs) || compareStrings(left.id, right.id)),
    favorite: normalizeBoolean(variant.favorite, false),
    locked: normalizeBoolean(variant.locked, false),
    assistedGeneration: {
      strategy: variant.assistedGeneration?.strategy ?? 'manual',
      seed: variant.assistedGeneration?.seed,
      parameters: variant.assistedGeneration?.parameters ? structuredClone(variant.assistedGeneration.parameters) : {},
      sourcePoolIds: normalizeStringArray(variant.assistedGeneration?.sourcePoolIds),
      durationTargetMs: variant.assistedGeneration?.durationTargetMs,
      exclusionTags: normalizeStringArray(variant.assistedGeneration?.exclusionTags)
    },
    musicAlignment: variant.musicAlignment ? {
      primaryAssetId: variant.musicAlignment.primaryAssetId,
      analysisRefId: variant.musicAlignment.analysisRefId,
      syncMode: variant.musicAlignment.syncMode ?? 'texture',
      beatMarkers: sortById((variant.musicAlignment.beatMarkers ?? []).map(normalizeMarker)).sort((left, right) => compareNumbers(left.timeMs, right.timeMs) || compareStrings(left.id, right.id)),
      chapterPoints: [...(variant.musicAlignment.chapterPoints ?? [])].sort(compareNumbers),
      snapToBeatGrid: normalizeBoolean(variant.musicAlignment.snapToBeatGrid, true)
    } : undefined
  };
}

export function normalizeSequence(sequence: Sequence): Sequence {
  return {
    ...sequence,
    variantIds: normalizeStringArray(sequence.variantIds),
    favorite: normalizeBoolean(sequence.favorite, false)
  };
}

export function normalizeAutomationLane(lane: AutomationLane): AutomationLane {
  return {
    ...lane,
    enabled: normalizeBoolean(lane.enabled, true),
    keyframes: [...lane.keyframes]
      .map((keyframe) => ({ ...keyframe }))
      .sort((left, right) => compareNumbers(left.timeMs, right.timeMs) || compareStrings(left.id, right.id)),
    sectionValues: [...(lane.sectionValues ?? [])].sort((left, right) => compareStrings(left.sectionId, right.sectionId)),
    midiIntent: lane.midiIntent ? { ...lane.midiIntent } : undefined
  };
}

export function normalizeMidiMappingFile(mapping: MidiMappingFile): MidiMappingFile {
  return {
    ...mapping,
    bindings: sortById(mapping.bindings.map((binding) => ({ ...binding })))
  };
}

export function normalizeExportSelection(selection: ExportSelection): ExportSelection {
  return {
    ...selection,
    enabled: normalizeBoolean(selection.enabled, true),
    overwriteExisting: normalizeBoolean(selection.overwriteExisting, true)
  };
}

export function normalizeProject(project: ProjectFile): NormalizedProjectFile {
  return {
    ...project,
    version: CURRENT_PROJECT_VERSION,
    metadata: {
      createdAt: project.metadata?.createdAt ?? new Date(0).toISOString(),
      updatedAt: project.metadata?.updatedAt,
      projectFileName: project.metadata?.projectFileName,
      currentProfileSet: project.metadata?.currentProfileSet
    },
    assets: sortById(project.assets.map(normalizeMediaAsset)),
    presets: sortById(project.presets.map(normalizePreset)),
    analysisRefs: sortById((project.analysisRefs ?? []).map(normalizeAnalysisRef)),
    cutCandidates: sortById((project.cutCandidates ?? []).map(normalizeCutCandidate)),
    bins: sortById((project.bins ?? []).map(normalizeBin)),
    sequences: sortById(project.sequences.map(normalizeSequence)),
    variants: sortById(project.variants.map(normalizeVariant)),
    filterStacks: sortById((project.filterStacks ?? []).map(normalizeFilterStack)),
    automationLanes: sortById((project.automationLanes ?? []).map(normalizeAutomationLane)),
    midiMappings: sortById((project.midiMappings ?? []).map(normalizeMidiMappingFile)),
    exportSelections: [...(project.exportSelections ?? [])]
      .map(normalizeExportSelection)
      .sort((left, right) => compareStrings(left.profileId, right.profileId)),
    featureFlags: {
      recordedMidiAutomation: normalizeBoolean(project.featureFlags?.recordedMidiAutomation, false),
      advancedBeatDetection: normalizeBoolean(project.featureFlags?.advancedBeatDetection, false),
      proxyGeneration: normalizeBoolean(project.featureFlags?.proxyGeneration, false),
      advancedAssistedSequencing: normalizeBoolean(project.featureFlags?.advancedAssistedSequencing, false),
      complexTransitions: normalizeBoolean(project.featureFlags?.complexTransitions, false)
    },
    tags: normalizeStringArray(project.tags)
  };
}

function collectDuplicateIdIssues(kind: string, ids: string[]): ProjectIntegrityIssue[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.add(id);
    } else {
      seen.add(id);
    }
  }

  return [...duplicates].sort(compareStrings).map((id) => ({
    code: 'duplicate-id',
    path: kind,
    message: `Duplicate ${kind} id "${id}" detected.`
  }));
}

function pushMissingReference(issues: ProjectIntegrityIssue[], path: string, message: string): void {
  issues.push({
    code: 'missing-reference',
    path,
    message
  });
}

export function collectProjectIntegrityIssues(project: NormalizedProjectFile): ProjectIntegrityIssue[] {
  const issues: ProjectIntegrityIssue[] = [];
  const assetIds = new Set(project.assets.map((asset) => asset.id));
  const presetIds = new Set(project.presets.map((preset) => preset.id));
  const analysisRefIds = new Set(project.analysisRefs.map((ref) => ref.id));
  const cutIds = new Set(project.cutCandidates.map((cut) => cut.id));
  const binIds = new Set(project.bins.map((bin) => bin.id));
  const sequenceIds = new Set(project.sequences.map((sequence) => sequence.id));
  const variantIds = new Set(project.variants.map((variant) => variant.id));
  const stackIds = new Set(project.filterStacks.map((stack) => stack.id));
  const laneIds = new Set(project.automationLanes.map((lane) => lane.id));
  const midiMappingIds = new Set(project.midiMappings.map((mapping) => mapping.id));

  issues.push(...collectDuplicateIdIssues('assets', project.assets.map((asset) => asset.id)));
  issues.push(...collectDuplicateIdIssues('presets', project.presets.map((preset) => preset.id)));
  issues.push(...collectDuplicateIdIssues('analysisRefs', project.analysisRefs.map((ref) => ref.id)));
  issues.push(...collectDuplicateIdIssues('cutCandidates', project.cutCandidates.map((cut) => cut.id)));
  issues.push(...collectDuplicateIdIssues('bins', project.bins.map((bin) => bin.id)));
  issues.push(...collectDuplicateIdIssues('sequences', project.sequences.map((sequence) => sequence.id)));
  issues.push(...collectDuplicateIdIssues('variants', project.variants.map((variant) => variant.id)));
  issues.push(...collectDuplicateIdIssues('filterStacks', project.filterStacks.map((stack) => stack.id)));
  issues.push(...collectDuplicateIdIssues('automationLanes', project.automationLanes.map((lane) => lane.id)));
  issues.push(...collectDuplicateIdIssues('midiMappings', project.midiMappings.map((mapping) => mapping.id)));

  for (const ref of project.analysisRefs) {
    if (!assetIds.has(ref.assetId)) {
      pushMissingReference(issues, `analysisRefs.${ref.id}.assetId`, `Analysis ref "${ref.id}" references missing asset "${ref.assetId}".`);
    }
  }

  for (const cut of project.cutCandidates) {
    if (!assetIds.has(cut.assetId)) {
      pushMissingReference(issues, `cutCandidates.${cut.id}.assetId`, `Cut candidate "${cut.id}" references missing asset "${cut.assetId}".`);
    }
    if (cut.analysisRefId && !analysisRefIds.has(cut.analysisRefId)) {
      pushMissingReference(issues, `cutCandidates.${cut.id}.analysisRefId`, `Cut candidate "${cut.id}" references missing analysis ref "${cut.analysisRefId}".`);
    }
    for (const binId of cut.binIds ?? []) {
      if (!binIds.has(binId)) {
        pushMissingReference(issues, `cutCandidates.${cut.id}.binIds`, `Cut candidate "${cut.id}" references missing bin "${binId}".`);
      }
    }
  }

  for (const bin of project.bins) {
    for (const cutId of bin.cutIds) {
      if (!cutIds.has(cutId)) {
        pushMissingReference(issues, `bins.${bin.id}.cutIds`, `Bin "${bin.id}" references missing cut "${cutId}".`);
      }
    }
  }

  for (const sequence of project.sequences) {
    if (sequence.defaultVariantId && !variantIds.has(sequence.defaultVariantId)) {
      pushMissingReference(issues, `sequences.${sequence.id}.defaultVariantId`, `Sequence "${sequence.id}" references missing variant "${sequence.defaultVariantId}".`);
    }
    for (const variantId of sequence.variantIds) {
      if (!variantIds.has(variantId)) {
        pushMissingReference(issues, `sequences.${sequence.id}.variantIds`, `Sequence "${sequence.id}" references missing variant "${variantId}".`);
      }
    }
  }

  for (const variant of project.variants) {
    if (!sequenceIds.has(variant.sequenceId)) {
      pushMissingReference(issues, `variants.${variant.id}.sequenceId`, `Variant "${variant.id}" references missing sequence "${variant.sequenceId}".`);
    }
    if (variant.stackId && !stackIds.has(variant.stackId)) {
      pushMissingReference(issues, `variants.${variant.id}.stackId`, `Variant "${variant.id}" references missing filter stack "${variant.stackId}".`);
    }
    if (variant.musicAlignment?.primaryAssetId && !assetIds.has(variant.musicAlignment.primaryAssetId)) {
      pushMissingReference(issues, `variants.${variant.id}.musicAlignment.primaryAssetId`, `Variant "${variant.id}" references missing music asset "${variant.musicAlignment.primaryAssetId}".`);
    }
    if (variant.musicAlignment?.analysisRefId && !analysisRefIds.has(variant.musicAlignment.analysisRefId)) {
      pushMissingReference(issues, `variants.${variant.id}.musicAlignment.analysisRefId`, `Variant "${variant.id}" references missing analysis ref "${variant.musicAlignment.analysisRefId}".`);
    }
    issues.push(...collectDuplicateIdIssues(`variants.${variant.id}.clips`, variant.clips.map((clip) => clip.id)));
    issues.push(...collectDuplicateIdIssues(`variants.${variant.id}.markers`, (variant.markers ?? []).map((marker) => marker.id)));
    issues.push(...collectDuplicateIdIssues(`variants.${variant.id}.sections`, (variant.sections ?? []).map((section) => section.id)));

    for (const clip of variant.clips) {
      if (!assetIds.has(clip.assetId)) {
        pushMissingReference(issues, `variants.${variant.id}.clips.${clip.id}.assetId`, `Sequence clip "${clip.id}" references missing asset "${clip.assetId}".`);
      }
      if (clip.overlayAssetId && !assetIds.has(clip.overlayAssetId)) {
        pushMissingReference(issues, `variants.${variant.id}.clips.${clip.id}.overlayAssetId`, `Sequence clip "${clip.id}" references missing overlay asset "${clip.overlayAssetId}".`);
      }
      if (clip.overlayCutId && !cutIds.has(clip.overlayCutId)) {
        pushMissingReference(issues, `variants.${variant.id}.clips.${clip.id}.overlayCutId`, `Sequence clip "${clip.id}" references missing overlay cut "${clip.overlayCutId}".`);
      }
      if (clip.transition === 'mask' && !clip.transitionAssetId) {
        issues.push({
          code: 'missing-reference',
          path: `variants.${variant.id}.clips.${clip.id}.transitionAssetId`,
          message: `Sequence clip "${clip.id}" uses mask transition without a transition asset.`
        });
      }
      if (clip.transitionAssetId && !assetIds.has(clip.transitionAssetId)) {
        pushMissingReference(issues, `variants.${variant.id}.clips.${clip.id}.transitionAssetId`, `Sequence clip "${clip.id}" references missing transition asset "${clip.transitionAssetId}".`);
      }
      if (clip.transitionCutId && !cutIds.has(clip.transitionCutId)) {
        pushMissingReference(issues, `variants.${variant.id}.clips.${clip.id}.transitionCutId`, `Sequence clip "${clip.id}" references missing transition cut "${clip.transitionCutId}".`);
      }
      if (clip.transitionOverlayAssetId && !assetIds.has(clip.transitionOverlayAssetId)) {
        pushMissingReference(issues, `variants.${variant.id}.clips.${clip.id}.transitionOverlayAssetId`, `Sequence clip "${clip.id}" references missing transition overlay asset "${clip.transitionOverlayAssetId}".`);
      }
      if (clip.transitionOverlayCutId && !cutIds.has(clip.transitionOverlayCutId)) {
        pushMissingReference(issues, `variants.${variant.id}.clips.${clip.id}.transitionOverlayCutId`, `Sequence clip "${clip.id}" references missing transition overlay cut "${clip.transitionOverlayCutId}".`);
      }
      if (clip.cutId && !cutIds.has(clip.cutId)) {
        pushMissingReference(issues, `variants.${variant.id}.clips.${clip.id}.cutId`, `Sequence clip "${clip.id}" references missing cut "${clip.cutId}".`);
      }
      if (clip.presetId && !presetIds.has(clip.presetId)) {
        pushMissingReference(issues, `variants.${variant.id}.clips.${clip.id}.presetId`, `Sequence clip "${clip.id}" references missing preset "${clip.presetId}".`);
      }
      if (clip.stackOverrideId && !stackIds.has(clip.stackOverrideId)) {
        pushMissingReference(issues, `variants.${variant.id}.clips.${clip.id}.stackOverrideId`, `Sequence clip "${clip.id}" references missing filter stack "${clip.stackOverrideId}".`);
      }
      if (clip.durationMs <= 0) {
        issues.push({
          code: 'invalid-range',
          path: `variants.${variant.id}.clips.${clip.id}.durationMs`,
          message: `Sequence clip "${clip.id}" must have a positive duration.`
        });
      }
      if (clip.transition === 'mask' && clip.transitionDurationMs !== undefined && clip.transitionDurationMs <= 0) {
        issues.push({
          code: 'invalid-range',
          path: `variants.${variant.id}.clips.${clip.id}.transitionDurationMs`,
          message: `Sequence clip "${clip.id}" must have a positive mask transition duration.`
        });
      }
    }

    const orderedClips = [...variant.clips].sort((left, right) => compareNumbers(left.timelineStartMs, right.timelineStartMs) || compareStrings(left.id, right.id));
    orderedClips.forEach((clip, index) => {
      if (clip.transition === 'mask' && index === orderedClips.length - 1) {
        issues.push({
          code: 'invalid-range',
          path: `variants.${variant.id}.clips.${clip.id}.transition`,
          message: `Sequence clip "${clip.id}" cannot use a mask transition without a following clip.`
        });
      }
    });
  }

  const filterIds = new Set(project.filterStacks.flatMap((stack) => stack.filters.map((filter) => filter.id)));
  for (const stack of project.filterStacks) {
    issues.push(...collectDuplicateIdIssues(`filterStacks.${stack.id}.filters`, stack.filters.map((filter) => filter.id)));
    for (const filter of stack.filters) {
      const definition = getFilterDefinition(filter.type);
      if (!definition) {
        issues.push({
          code: 'unsupported-value',
          path: `filterStacks.${stack.id}.filters.${filter.id}.type`,
          message: `Filter "${filter.id}" uses unsupported type "${filter.type}".`
        });
      }
      for (const laneId of filter.automationLaneIds ?? []) {
        if (!laneIds.has(laneId)) {
          pushMissingReference(issues, `filterStacks.${stack.id}.filters.${filter.id}.automationLaneIds`, `Filter "${filter.id}" references missing automation lane "${laneId}".`);
        }
      }
      if (definition) {
        const supportedKeys = new Set(definition.parameters.map((parameter) => parameter.key));
        for (const parameterKey of Object.keys(filter.parameters ?? {})) {
          if (!supportedKeys.has(parameterKey as Exclude<AutomationTargetProperty, 'mix'>)) {
            issues.push({
              code: 'unsupported-value',
              path: `filterStacks.${stack.id}.filters.${filter.id}.parameters.${parameterKey}`,
              message: `Filter "${filter.id}" does not support parameter "${parameterKey}".`
            });
          }
        }
      }
    }
  }

  for (const lane of project.automationLanes) {
    if (!filterIds.has(lane.target.filterId)) {
      pushMissingReference(issues, `automationLanes.${lane.id}.target.filterId`, `Automation lane "${lane.id}" references missing filter "${lane.target.filterId}".`);
    } else {
      const targetFilter = project.filterStacks
        .flatMap((stack) => stack.filters)
        .find((filter) => filter.id === lane.target.filterId);
      if (targetFilter) {
        const supportedProperties = new Set(getSupportedAutomationProperties(targetFilter.type));
        if (!supportedProperties.has(lane.target.property)) {
          issues.push({
            code: 'unsupported-value',
            path: `automationLanes.${lane.id}.target.property`,
            message: `Automation lane "${lane.id}" targets unsupported property "${lane.target.property}" for filter "${targetFilter.id}".`
          });
        }
      }
    }
    if (lane.midiIntent && !midiMappingIds.has(lane.midiIntent.mappingId)) {
      pushMissingReference(issues, `automationLanes.${lane.id}.midiIntent.mappingId`, `Automation lane "${lane.id}" references missing MIDI mapping "${lane.midiIntent.mappingId}".`);
    }
    issues.push(...collectDuplicateIdIssues(`automationLanes.${lane.id}.keyframes`, lane.keyframes.map((keyframe) => keyframe.id)));
  }

  for (const preset of project.presets) {
    for (const filter of preset.filters) {
      if (!isSupportedFilterType(filter.type)) {
        issues.push({
          code: 'unsupported-value',
          path: `presets.${preset.id}.filters.${filter.type}`,
          message: `Preset "${preset.id}" uses unsupported filter type "${filter.type}".`
        });
      }
    }
  }

  if (project.defaultSequenceId && !sequenceIds.has(project.defaultSequenceId)) {
    pushMissingReference(issues, 'defaultSequenceId', `Project references missing default sequence "${project.defaultSequenceId}".`);
  }

  return issues.sort((left, right) => compareStrings(left.path, right.path) || compareStrings(left.message, right.message));
}

export function resolveProjectPathCandidates(projectRoot: string, pathRef: ProjectPathRef): string[] {
  const candidates = [];

  if (pathRef.relativePath) {
    candidates.push(`${projectRoot}/${pathRef.relativePath}`.replace(/\\/g, '/'));
  }

  candidates.push(pathRef.absolutePath);
  return [...new Set(candidates)];
}

export function getAssetById(project: NormalizedProjectFile, assetId: string): MediaAsset | undefined {
  return project.assets.find((asset) => asset.id === assetId);
}

export function getPresetById(project: NormalizedProjectFile, presetId: string): Preset | undefined {
  return project.presets.find((preset) => preset.id === presetId);
}

export function getAnalysisRefById(project: NormalizedProjectFile, analysisRefId: string): AnalysisRef | undefined {
  return project.analysisRefs.find((analysisRef) => analysisRef.id === analysisRefId);
}

export function getCutCandidateById(project: NormalizedProjectFile, cutId: string): CutCandidate | undefined {
  return project.cutCandidates.find((cut) => cut.id === cutId);
}

export function getBinById(project: NormalizedProjectFile, binId: string): Bin | undefined {
  return project.bins.find((bin) => bin.id === binId);
}

export function getSequenceById(project: NormalizedProjectFile, sequenceId: string): Sequence | undefined {
  return project.sequences.find((sequence) => sequence.id === sequenceId);
}

export function getVariantById(project: NormalizedProjectFile, variantId: string): Variant | undefined {
  return project.variants.find((variant) => variant.id === variantId);
}

export function getFilterStackById(project: NormalizedProjectFile, stackId: string): FilterStack | undefined {
  return project.filterStacks.find((stack) => stack.id === stackId);
}

export function getAutomationLaneById(project: NormalizedProjectFile, laneId: string): AutomationLane | undefined {
  return project.automationLanes.find((lane) => lane.id === laneId);
}

export function getMidiMappingById(project: NormalizedProjectFile, mappingId: string): MidiMappingFile | undefined {
  return project.midiMappings.find((mapping) => mapping.id === mappingId);
}

export function getDefaultSequence(project: NormalizedProjectFile): Sequence | undefined {
  return project.defaultSequenceId ? getSequenceById(project, project.defaultSequenceId) : project.sequences[0];
}

export function getDefaultVariant(project: NormalizedProjectFile, sequenceId?: string): Variant | undefined {
  const sequence = sequenceId ? getSequenceById(project, sequenceId) : getDefaultSequence(project);
  if (!sequence) {
    return undefined;
  }

  const variantId = sequence.defaultVariantId ?? sequence.variantIds[0];
  return variantId ? getVariantById(project, variantId) : undefined;
}

export function createEmptyProject(input: {
  id: string;
  name: string;
  mode?: RuntimeMode;
  description?: string;
}): NormalizedProjectFile {
  const timestamp = new Date().toISOString();

  return normalizeProject({
    id: input.id,
    name: input.name,
    mode: input.mode ?? 'studio',
    version: CURRENT_PROJECT_VERSION,
    description: input.description,
    metadata: {
      createdAt: timestamp,
      updatedAt: timestamp,
      projectFileName: `${slugify(input.name) || 'afterimage-project'}.afterimage.json`,
      currentProfileSet: 'default'
    },
    assets: [],
    presets: [],
    sequences: [
      {
        id: 'sequence-main',
        name: 'Main Sequence',
        variantIds: ['variant-main'],
        defaultVariantId: 'variant-main',
        favorite: true
      }
    ],
    variants: [
      {
        id: 'variant-main',
        sequenceId: 'sequence-main',
        name: 'Sequence 001',
        clips: [],
        markers: [],
        sections: [],
        stackId: 'stack-sequence-main',
        favorite: true,
        assistedGeneration: {
          strategy: 'manual'
        }
      }
    ],
    analysisRefs: [],
    cutCandidates: [],
    bins: [],
    filterStacks: [
      {
        id: 'stack-sequence-main',
        name: 'Sequence Stack',
        scope: 'sequence',
        filters: []
      }
    ],
    automationLanes: [],
    midiMappings: [],
    exportSelections: [
      { profileId: 'landscape-master', enabled: true, overwriteExisting: true },
      { profileId: 'portrait-short-form', enabled: false, overwriteExisting: true },
      { profileId: 'square-social', enabled: false, overwriteExisting: true },
      { profileId: 'archive-master', enabled: false, overwriteExisting: true }
    ],
    defaultSequenceId: 'sequence-main',
    featureFlags: {},
    tags: []
  });
}
