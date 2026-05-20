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
export type ArchiveSourceSystem = 'darklife' | 'afterimage' | 'manual';
export type ArchiveSourceKind = 'public-domain' | 'capture' | 'livestream' | 'generated' | 'manual' | 'unknown';
export type ArchiveRecurrenceRelationship =
  | 'visual-similarity'
  | 'atmosphere-similarity'
  | 'motif-recurrence'
  | 'source-lineage'
  | 'performance-reuse';
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
export type SceneActivationKind = 'timeline' | 'manual' | 'capture' | 'entropy' | 'archive' | 'audio';
export type SceneLayerScope = 'composition' | 'scene' | 'scene-transition' | 'source-clip' | 'archive-segment' | 'behaviour' | 'diagnostic';
export type SceneLayerContribution =
  | 'source'
  | 'texture'
  | 'mask'
  | 'transition-overlay'
  | 'atmospheric-overlay'
  | 'generated-material'
  | 'archive-resurfacing'
  | 'field-visualization'
  | 'diagnostic';
export type SceneLayerInfluence = 'pixels' | 'mask' | 'field' | 'modulation' | 'material' | 'diagnostic';
export type SceneLayerBlendIntent = 'normal' | 'mix' | 'add-luma' | 'screen' | 'multiply' | 'masked-merge';
export type SceneLayerRenderPassKind = 'source' | 'mask' | 'overlay' | 'behaviour' | 'diagnostic';
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

export interface ArchiveProvenance {
  sourceKind: ArchiveSourceKind;
  sourceUri?: string;
  rightsStatus?: string;
  license?: string;
  generator?: string;
  generatorVersion?: string;
  notes?: string;
}

export interface ArchiveTimeRange {
  startMs: number;
  endMs: number;
}

export interface ArchiveSegment {
  id: string;
  range: ArchiveTimeRange;
  label?: string;
  confidence?: number;
  tags?: string[];
  motifIds?: string[];
  atmosphereIds?: string[];
  materialIds?: string[];
  motionIds?: string[];
  behaviourSeedIds?: string[];
}

export interface ArchiveMotifCandidate {
  id: string;
  label: string;
  confidence?: number;
  weight?: number;
  segmentIds?: string[];
  descriptors?: string[];
  recurrenceGroupId?: string;
}

export interface ArchiveWeightedTag {
  id: string;
  label: string;
  confidence?: number;
  intensity?: number;
  segmentIds?: string[];
  descriptors?: string[];
}

export interface ArchiveBehaviourSeed {
  id: string;
  type: string;
  strength?: number;
  confidence?: number;
  seed?: number;
  segmentIds?: string[];
  motifIds?: string[];
  atmosphereIds?: string[];
  parameters?: Record<string, JsonPrimitive>;
}

export interface ArchiveRecurrenceLink {
  id: string;
  sourceId: string;
  targetId: string;
  relationship: ArchiveRecurrenceRelationship;
  strength?: number;
  explanation?: string;
}

export interface ArchiveMetadataFile {
  id: string;
  version: 1;
  sourceSystem: ArchiveSourceSystem;
  sourceAssetId: string;
  generatedAt?: string;
  provenance: ArchiveProvenance;
  segments?: ArchiveSegment[];
  motifs?: ArchiveMotifCandidate[];
  atmospheres?: ArchiveWeightedTag[];
  materials?: ArchiveWeightedTag[];
  motion?: ArchiveWeightedTag[];
  behaviourSeeds?: ArchiveBehaviourSeed[];
  recurrence?: ArchiveRecurrenceLink[];
  notes?: string;
}

export interface NormalizedArchiveMetadataFile extends Omit<ArchiveMetadataFile,
  | 'segments'
  | 'motifs'
  | 'atmospheres'
  | 'materials'
  | 'motion'
  | 'behaviourSeeds'
  | 'recurrence'> {
  segments: ArchiveSegment[];
  motifs: ArchiveMotifCandidate[];
  atmospheres: ArchiveWeightedTag[];
  materials: ArchiveWeightedTag[];
  motion: ArchiveWeightedTag[];
  behaviourSeeds: ArchiveBehaviourSeed[];
  recurrence: ArchiveRecurrenceLink[];
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

export interface CompositionDeterministicSeed {
  id: string;
  value: number;
  label?: string;
}

export interface SceneClimate {
  atmosphere?: string;
  pressure?: number;
  entropyBias?: number;
  cohesion?: number;
  memory?: number;
  volatility?: number;
  motifIds?: string[];
  archiveSegmentIds?: string[];
  materialTags?: string[];
  behaviourIds?: string[];
  transitionTendency?: number;
}

export interface SceneActivation {
  id: string;
  kind: SceneActivationKind;
  startMs?: number;
  endMs?: number;
  sourceId?: string;
}

export interface SceneTransition {
  id: string;
  toSceneId: string;
  style: TransitionStyle;
  durationMs: number;
  pressureHandoff?: number;
  entropyHandoff?: number;
  maskAssetId?: string;
  overlayAssetId?: string;
}

export interface SceneDefinition {
  id: string;
  name: string;
  climate?: SceneClimate;
  activation?: SceneActivation[];
  transitions?: SceneTransition[];
  layerIds?: string[];
  archiveReferenceIds?: string[];
}

export interface SceneLayerRenderIntent {
  passKind: SceneLayerRenderPassKind;
  requiredCapabilities?: string[];
}

export interface SceneLayerDefinition {
  id: string;
  name: string;
  sceneId: string;
  orderIndex: number;
  scope: SceneLayerScope;
  contribution: SceneLayerContribution;
  influence?: SceneLayerInfluence[];
  blendIntent?: SceneLayerBlendIntent;
  mix?: number;
  assetId?: string;
  cutId?: string;
  clipId?: string;
  stackId?: string;
  maskLayerId?: string;
  archiveReferenceIds?: string[];
  renderIntent: SceneLayerRenderIntent;
}

export interface CompositionIdentity {
  id: string;
  name: string;
  sequenceId: string;
  variantId: string;
  assetIds: string[];
  exportProfileIds: string[];
  deterministicSeeds: CompositionDeterministicSeed[];
  scenes?: SceneDefinition[];
  layers?: SceneLayerDefinition[];
}

export interface NormalizedSceneDefinition extends Omit<SceneDefinition,
  | 'activation'
  | 'transitions'
  | 'layerIds'
  | 'archiveReferenceIds'
  | 'climate'> {
  climate: SceneClimate;
  activation: SceneActivation[];
  transitions: SceneTransition[];
  layerIds: string[];
  archiveReferenceIds: string[];
}

export interface NormalizedSceneLayerDefinition extends Omit<SceneLayerDefinition,
  | 'influence'
  | 'blendIntent'
  | 'mix'
  | 'archiveReferenceIds'> {
  influence: SceneLayerInfluence[];
  blendIntent: SceneLayerBlendIntent;
  mix: number;
  archiveReferenceIds: string[];
}

export interface NormalizedCompositionIdentity extends Omit<CompositionIdentity,
  | 'scenes'
  | 'layers'> {
  scenes: NormalizedSceneDefinition[];
  layers: NormalizedSceneLayerDefinition[];
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
  composition?: CompositionIdentity;
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
  | 'composition'
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
  composition: NormalizedCompositionIdentity;
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
