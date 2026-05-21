import { getFilterDefinition } from './filters.js';
import { CURRENT_PROJECT_VERSION } from './types.js';
import type {
  AnalysisFile,
  AnalysisRef,
  ArchiveAcceptanceScope,
  ArchiveMetadataFile,
  ArchiveWeightedTag,
  ArchiveWorldAffinityCandidate,
  AssetRole,
  AudioChangeEvent,
  AudioChangeTrack,
  AutomationLane,
  BeatTrack,
  Bin,
  CaptureEvent,
  CaptureLog,
  CaptureSession,
  CompositionAcceptedArchiveReference,
  CompositionRejectedArchiveReference,
  CutCandidate,
  EntropyState,
  ExportSelection,
  FilterInstance,
  FilterStack,
  JsonPrimitive,
  Marker,
  MediaAsset,
  MidiGestureTrack,
  MidiMappingFile,
  ModulationEndpoint,
  ModulationMapping,
  ModulationRoute,
  ModulationScope,
  NormalizedArchiveMetadataFile,
  NormalizedCompositionIdentity,
  NormalizedProjectFile,
  NormalizedSceneDefinition,
  NormalizedSceneLayerDefinition,
  Preset,
  PresetFilter,
  ProbeMetadata,
  ProjectFile,
  ProjectPathRef,
  SceneActivation,
  SceneClimate,
  SceneDefinition,
  SceneLayerDefinition,
  SceneLayerInfluence,
  SceneTransition,
  Section,
  Sequence,
  SequenceClip,
  SyncEvent,
  SyncEventTrack,
  Variant
} from './types.js';
import {
  clampUnit,
  compareNumbers,
  compareStrings,
  normalizeBoolean,
  normalizeJsonRecord,
  normalizeNumber,
  normalizeSortedStringArray,
  normalizeStringArray,
  normalizeUnit,
  sortById
} from './utils.js';

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

export function normalizeArchiveMetadataFile(archive: ArchiveMetadataFile): NormalizedArchiveMetadataFile {
  return {
    ...archive,
    segments: sortById((archive.segments ?? []).map((segment) => ({
      ...segment,
      tags: normalizeStringArray(segment.tags),
      motifIds: normalizeStringArray(segment.motifIds),
      atmosphereIds: normalizeStringArray(segment.atmosphereIds),
      materialIds: normalizeStringArray(segment.materialIds),
      motionIds: normalizeStringArray(segment.motionIds),
      behaviourSeedIds: normalizeStringArray(segment.behaviourSeedIds)
    }))),
    motifs: sortById((archive.motifs ?? []).map((motif) => ({
      ...motif,
      segmentIds: normalizeStringArray(motif.segmentIds),
      descriptors: normalizeStringArray(motif.descriptors)
    }))),
    atmospheres: normalizeArchiveWeightedTags(archive.atmospheres),
    materials: normalizeArchiveWeightedTags(archive.materials),
    motion: normalizeArchiveWeightedTags(archive.motion),
    behaviourSeeds: sortById((archive.behaviourSeeds ?? []).map((seed) => ({
      ...seed,
      segmentIds: normalizeStringArray(seed.segmentIds),
      motifIds: normalizeStringArray(seed.motifIds),
      atmosphereIds: normalizeStringArray(seed.atmosphereIds),
      parameters: normalizeJsonRecord(seed.parameters)
    }))),
    recurrence: sortById((archive.recurrence ?? []).map((link) => ({ ...link }))),
    affinity: sortById((archive.affinity ?? []).map(normalizeArchiveWorldAffinityCandidate))
  };
}

function normalizeArchiveWeightedTags(tags: ArchiveWeightedTag[] | undefined): ArchiveWeightedTag[] {
  return sortById((tags ?? []).map((tag) => ({
    ...tag,
    segmentIds: normalizeStringArray(tag.segmentIds),
    descriptors: normalizeStringArray(tag.descriptors)
  })));
}

function normalizeArchiveWorldAffinityCandidate(candidate: ArchiveWorldAffinityCandidate): ArchiveWorldAffinityCandidate {
  return {
    ...candidate,
    descriptors: normalizeStringArray(candidate.descriptors)
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

export function normalizeModulationEndpoint(endpoint: ModulationEndpoint): ModulationEndpoint {
  return { ...endpoint };
}

export function normalizeModulationScope(scope: ModulationScope | undefined): ModulationScope {
  return {
    compositionId: scope?.compositionId,
    sequenceId: scope?.sequenceId,
    variantId: scope?.variantId,
    sceneId: scope?.sceneId,
    layerId: scope?.layerId,
    clipId: scope?.clipId
  };
}

export function normalizeModulationMapping(mapping: ModulationMapping): ModulationMapping {
  return {
    ...mapping,
    clamp: normalizeBoolean(mapping.clamp, true),
    invert: normalizeBoolean(mapping.invert, false)
  };
}

export function normalizeModulationRoute(route: ModulationRoute): ModulationRoute {
  return {
    ...route,
    source: normalizeModulationEndpoint(route.source),
    target: normalizeModulationEndpoint(route.target),
    mapping: normalizeModulationMapping(route.mapping),
    scope: normalizeModulationScope(route.scope),
    capturePolicy: route.capturePolicy ?? 'record',
    enabled: normalizeBoolean(route.enabled, true)
  };
}

export function normalizeEntropyState(state: EntropyState): EntropyState {
  return {
    ...state,
    source: normalizeModulationEndpoint(state.source),
    target: normalizeModulationEndpoint(state.target),
    scope: normalizeModulationScope(state.scope),
    value: normalizeUnit(state.value, 0),
    capturePolicy: state.capturePolicy ?? 'record',
    enabled: normalizeBoolean(state.enabled, true)
  };
}

export function normalizeCaptureSession(session: CaptureSession): CaptureSession {
  return {
    ...session,
    status: session.status ?? 'open',
    timebase: {
      ...session.timebase,
      kind: session.timebase.kind ?? 'project-ms'
    },
    admittedInputIds: normalizeStringArray(session.admittedInputIds),
    seedIds: normalizeStringArray(session.seedIds),
    metadata: normalizeJsonRecord(session.metadata)
  };
}

export function normalizeCaptureEvent(event: CaptureEvent): CaptureEvent {
  return {
    ...event,
    source: normalizeModulationEndpoint(event.source),
    target: event.target ? normalizeModulationEndpoint(event.target) : undefined,
    replayCritical: normalizeBoolean(event.replayCritical, false),
    payload: event.payload === undefined ? undefined : structuredClone(event.payload)
  };
}

export function normalizeCaptureLog(log: CaptureLog): CaptureLog {
  return {
    ...log,
    events: [...log.events]
      .map(normalizeCaptureEvent)
      .sort((left, right) => compareNumbers(left.index, right.index) || compareNumbers(left.compositionTimeMs ?? left.captureTimeMs, right.compositionTimeMs ?? right.captureTimeMs) || compareStrings(left.id, right.id))
  };
}

function findDefaultSequence(project: ProjectFile): Sequence | undefined {
  return project.defaultSequenceId
    ? project.sequences.find((sequence) => sequence.id === project.defaultSequenceId)
    : project.sequences[0];
}

function findDefaultVariant(project: ProjectFile, sequence: Sequence | undefined): Variant | undefined {
  const variantId = sequence?.defaultVariantId ?? sequence?.variantIds[0];
  return variantId ? project.variants.find((variant) => variant.id === variantId) : project.variants[0];
}

function collectVariantAssetIds(variant: Variant | undefined): string[] {
  if (!variant) {
    return [];
  }

  return normalizeStringArray([
    ...variant.clips.flatMap((clip) => [
      clip.assetId,
      clip.overlayAssetId,
      clip.transitionAssetId,
      clip.transitionOverlayAssetId
    ]),
    variant.musicAlignment?.primaryAssetId
  ].filter((assetId): assetId is string => assetId !== undefined));
}

function getVariantDurationMs(variant: Variant | undefined): number {
  if (!variant || variant.clips.length === 0) {
    return 0;
  }

  return Math.max(...variant.clips.map((clip) => clip.timelineStartMs + clip.durationMs));
}

function createDefaultScene(variant: Variant | undefined, layers: SceneLayerDefinition[]): SceneDefinition {
  return {
    id: 'scene-main',
    name: 'Main Scene',
    climate: {
      atmosphere: 'default',
      pressure: 0,
      entropyBias: 0,
      cohesion: 1,
      memory: 0,
      volatility: 0,
      motifIds: [],
      archiveSegmentIds: [],
      materialTags: [],
      behaviourIds: []
    },
    activation: [
      {
        id: 'activation-main',
        kind: 'timeline',
        startMs: 0,
        endMs: getVariantDurationMs(variant)
      }
    ],
    transitions: [],
    layerIds: layers.map((layer) => layer.id),
    archiveReferenceIds: []
  };
}

function createDefaultLayers(variant: Variant | undefined): SceneLayerDefinition[] {
  return (variant?.clips ?? []).map((clip, index) => ({
    id: `layer-${clip.id}`,
    name: `Layer ${index + 1}`,
    sceneId: 'scene-main',
    orderIndex: index,
    scope: 'source-clip',
    contribution: 'source',
    influence: ['pixels'],
    blendIntent: 'normal',
    mix: 1,
    assetId: clip.assetId,
    cutId: clip.cutId,
    clipId: clip.id,
    stackId: clip.stackOverrideId ?? variant?.stackId,
    archiveReferenceIds: [],
    renderIntent: {
      passKind: 'source',
      requiredCapabilities: []
    }
  }));
}

export function normalizeSceneClimate(climate: SceneClimate | undefined): SceneClimate {
  return {
    atmosphere: climate?.atmosphere,
    pressure: normalizeUnit(climate?.pressure, 0),
    entropyBias: normalizeUnit(climate?.entropyBias, 0),
    cohesion: normalizeUnit(climate?.cohesion, 1),
    memory: normalizeUnit(climate?.memory, 0),
    volatility: normalizeUnit(climate?.volatility, 0),
    motifIds: normalizeStringArray(climate?.motifIds),
    archiveSegmentIds: normalizeStringArray(climate?.archiveSegmentIds),
    materialTags: normalizeStringArray(climate?.materialTags),
    behaviourIds: normalizeStringArray(climate?.behaviourIds),
    transitionTendency: clampUnit(climate?.transitionTendency)
  };
}

export function normalizeSceneActivation(activation: SceneActivation): SceneActivation {
  return { ...activation };
}

export function normalizeSceneTransition(transition: SceneTransition): SceneTransition {
  return {
    ...transition,
    style: transition.style ?? 'cut',
    durationMs: Math.max(0, transition.durationMs),
    pressureHandoff: clampUnit(transition.pressureHandoff),
    entropyHandoff: clampUnit(transition.entropyHandoff)
  };
}

export function normalizeSceneDefinition(scene: SceneDefinition): NormalizedSceneDefinition {
  return {
    ...scene,
    climate: normalizeSceneClimate(scene.climate),
    activation: sortById((scene.activation ?? []).map(normalizeSceneActivation))
      .sort((left, right) => compareNumbers(left.startMs ?? 0, right.startMs ?? 0) || compareStrings(left.id, right.id)),
    transitions: sortById((scene.transitions ?? []).map(normalizeSceneTransition)),
    layerIds: normalizeStringArray(scene.layerIds),
    archiveReferenceIds: normalizeStringArray(scene.archiveReferenceIds)
  };
}

export function normalizeSceneLayerDefinition(layer: SceneLayerDefinition): NormalizedSceneLayerDefinition {
  return {
    ...layer,
    influence: normalizeStringArray(layer.influence) as SceneLayerInfluence[],
    blendIntent: layer.blendIntent ?? 'normal',
    mix: normalizeUnit(layer.mix, 1),
    archiveReferenceIds: normalizeStringArray(layer.archiveReferenceIds),
    renderIntent: {
      ...layer.renderIntent,
      requiredCapabilities: normalizeStringArray(layer.renderIntent.requiredCapabilities)
    }
  };
}

export function normalizeArchiveAcceptanceScope(scope: ArchiveAcceptanceScope | undefined): ArchiveAcceptanceScope {
  return {
    compositionId: scope?.compositionId,
    sequenceId: scope?.sequenceId,
    variantId: scope?.variantId,
    sceneId: scope?.sceneId,
    layerId: scope?.layerId,
    clipId: scope?.clipId
  };
}

export function normalizeAcceptedArchiveReference(reference: CompositionAcceptedArchiveReference): CompositionAcceptedArchiveReference {
  return {
    ...reference,
    targetIds: normalizeStringArray(reference.targetIds),
    scope: normalizeArchiveAcceptanceScope(reference.scope)
  };
}

export function normalizeRejectedArchiveReference(reference: CompositionRejectedArchiveReference): CompositionRejectedArchiveReference {
  return {
    ...reference,
    targetIds: normalizeStringArray(reference.targetIds),
    scope: normalizeArchiveAcceptanceScope(reference.scope)
  };
}

export function normalizeCompositionIdentity(project: ProjectFile): NormalizedCompositionIdentity {
  const sequence = project.composition
    ? project.sequences.find((candidate) => candidate.id === project.composition?.sequenceId)
    : findDefaultSequence(project);
  const variant = project.composition
    ? project.variants.find((candidate) => candidate.id === project.composition?.variantId)
    : findDefaultVariant(project, sequence);
  const enabledExportProfileIds = (project.exportSelections ?? [])
    .filter((selection) => selection.enabled ?? true)
    .map((selection) => selection.profileId);
  const fallbackExportProfileIds = (project.exportSelections ?? []).map((selection) => selection.profileId);
  const authoredLayers = project.composition?.layers ?? [];
  const layers = authoredLayers.length > 0 ? authoredLayers : createDefaultLayers(variant);
  const authoredScenes = project.composition?.scenes ?? [];
  const scenes = authoredScenes.length > 0 ? authoredScenes : [createDefaultScene(variant, layers)];

  return {
    id: project.composition?.id ?? 'composition-main',
    name: project.composition?.name ?? project.name,
    sequenceId: project.composition?.sequenceId ?? sequence?.id ?? '',
    variantId: project.composition?.variantId ?? variant?.id ?? '',
    assetIds: project.composition
      ? normalizeSortedStringArray(project.composition.assetIds)
      : collectVariantAssetIds(variant),
    exportProfileIds: project.composition
      ? normalizeSortedStringArray(project.composition.exportProfileIds)
      : normalizeStringArray(enabledExportProfileIds.length > 0 ? enabledExportProfileIds : fallbackExportProfileIds),
    deterministicSeeds: sortById((project.composition?.deterministicSeeds ?? []).map((seed) => ({ ...seed }))),
    acceptedArchiveReferences: sortById((project.composition?.acceptedArchiveReferences ?? []).map(normalizeAcceptedArchiveReference)),
    rejectedArchiveReferences: sortById((project.composition?.rejectedArchiveReferences ?? []).map(normalizeRejectedArchiveReference)),
    modulationRoutes: sortById((project.composition?.modulationRoutes ?? []).map(normalizeModulationRoute)),
    entropyStates: sortById((project.composition?.entropyStates ?? []).map(normalizeEntropyState)),
    scenes: sortById(scenes.map(normalizeSceneDefinition)),
    layers: [...layers]
      .map(normalizeSceneLayerDefinition)
      .sort((left, right) => compareStrings(left.sceneId, right.sceneId) || compareNumbers(left.orderIndex, right.orderIndex) || compareStrings(left.id, right.id))
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
    composition: normalizeCompositionIdentity(project),
    captureSessions: sortById((project.captureSessions ?? []).map(normalizeCaptureSession)),
    captureLogs: sortById((project.captureLogs ?? []).map(normalizeCaptureLog)),
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
