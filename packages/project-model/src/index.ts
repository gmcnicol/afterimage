export type RuntimeMode = 'studio' | 'live-desktop' | 'live-appliance';
export type PresetFamily = 'vhs' | 'liminal' | 'imagined-futures' | 'glitch';
export type MidiBindingMode = 'set' | 'toggle' | 'scale' | 'trigger';
export type ProbeStreamType = 'video' | 'audio' | 'subtitle' | 'data' | 'unknown';

export interface ProjectSource {
  id: string;
  path: string;
  label?: string;
  hasVideo?: boolean;
  hasAudio?: boolean;
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

export interface SequenceItem {
  id: string;
  sourceId: string;
  timelineStartMs: number;
  sourceStartMs: number;
  durationMs: number;
  presetId?: string;
}

export interface ProjectSequence {
  id: string;
  name: string;
  items: SequenceItem[];
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

export interface AnalysisSummary {
  sceneCount: number;
  durationMs?: number;
}

export interface AnalysisFile {
  id: string;
  sourceId: string;
  probe: ProbeMetadata;
  sceneCuts: SceneCut[];
  summary?: AnalysisSummary;
}

export interface AnalysisRef {
  id: string;
  sourceId: string;
  path: string;
  summary?: AnalysisSummary;
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

export interface ProjectFile {
  id: string;
  name: string;
  mode: RuntimeMode;
  version: number;
  description?: string;
  sources: ProjectSource[];
  presets: Preset[];
  sequence: ProjectSequence;
  midiMappings?: MidiMappingFile[];
  analysisRefs?: AnalysisRef[];
}

export interface NormalizedProjectFile extends Omit<ProjectFile, 'sources' | 'presets' | 'sequence' | 'midiMappings' | 'analysisRefs'> {
  sources: ProjectSource[];
  presets: Preset[];
  sequence: ProjectSequence;
  midiMappings: MidiMappingFile[];
  analysisRefs: AnalysisRef[];
}

export interface ProjectIntegrityIssue {
  code: 'duplicate-id' | 'missing-reference';
  path: string;
  message: string;
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

export function normalizePresetFilter(filter: PresetFilter): PresetFilter {
  return {
    ...filter,
    mix: filter.mix ?? 1
  };
}

export function normalizePreset(preset: Preset): Preset {
  return {
    ...preset,
    filters: [...preset.filters].map(normalizePresetFilter)
  };
}

export function normalizeProjectSource(source: ProjectSource): ProjectSource {
  return {
    ...source,
    hasVideo: normalizeBoolean(source.hasVideo, true),
    hasAudio: normalizeBoolean(source.hasAudio, true)
  };
}

export function normalizeSequenceItem(item: SequenceItem): SequenceItem {
  return { ...item };
}

export function normalizeSequence(sequence: ProjectSequence): ProjectSequence {
  return {
    ...sequence,
    items: [...sequence.items]
      .map(normalizeSequenceItem)
      .sort((left, right) => compareNumbers(left.timelineStartMs, right.timelineStartMs) || compareStrings(left.id, right.id))
  };
}

export function normalizeSceneCut(cut: SceneCut): SceneCut {
  return { ...cut };
}

export function normalizeAnalysisFile(file: AnalysisFile): AnalysisFile {
  const sceneCuts = [...file.sceneCuts]
    .map(normalizeSceneCut)
    .sort((left, right) => compareNumbers(left.timeMs, right.timeMs) || compareNumbers(left.score, right.score));

  return {
    ...file,
    probe: {
      ...file.probe,
      streams: [...file.probe.streams].map((stream) => ({ ...stream }))
    },
    sceneCuts,
    summary: file.summary ?? {
      sceneCount: sceneCuts.length,
      durationMs: file.probe.durationMs
    }
  };
}

export function normalizeAnalysisRef(ref: AnalysisRef): AnalysisRef {
  return {
    ...ref,
    summary: ref.summary ? { ...ref.summary } : undefined
  };
}

export function normalizeMidiMappingFile(mapping: MidiMappingFile): MidiMappingFile {
  return {
    ...mapping,
    bindings: [...mapping.bindings].map((binding) => ({ ...binding })).sort((left, right) => compareStrings(left.id, right.id))
  };
}

export function normalizeProject(project: ProjectFile): NormalizedProjectFile {
  return {
    ...project,
    sources: [...project.sources].map(normalizeProjectSource).sort((left, right) => compareStrings(left.id, right.id)),
    presets: [...project.presets].map(normalizePreset).sort((left, right) => compareStrings(left.id, right.id)),
    sequence: normalizeSequence(project.sequence),
    midiMappings: [...(project.midiMappings ?? [])]
      .map(normalizeMidiMappingFile)
      .sort((left, right) => compareStrings(left.id, right.id)),
    analysisRefs: [...(project.analysisRefs ?? [])]
      .map(normalizeAnalysisRef)
      .sort((left, right) => compareStrings(left.id, right.id))
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

  return [...duplicates]
    .sort(compareStrings)
    .map((id) => ({
      code: 'duplicate-id',
      path: kind,
      message: `Duplicate ${kind} id "${id}" detected.`
    }));
}

export function collectProjectIntegrityIssues(project: NormalizedProjectFile): ProjectIntegrityIssue[] {
  const issues: ProjectIntegrityIssue[] = [];
  const sourceIds = new Set(project.sources.map((source) => source.id));
  const presetIds = new Set(project.presets.map((preset) => preset.id));

  issues.push(...collectDuplicateIdIssues('sources', project.sources.map((source) => source.id)));
  issues.push(...collectDuplicateIdIssues('presets', project.presets.map((preset) => preset.id)));
  issues.push(...collectDuplicateIdIssues('sequence.items', project.sequence.items.map((item) => item.id)));
  issues.push(...collectDuplicateIdIssues('midiMappings', project.midiMappings.map((mapping) => mapping.id)));
  issues.push(...collectDuplicateIdIssues('analysisRefs', project.analysisRefs.map((ref) => ref.id)));

  for (const item of project.sequence.items) {
    if (!sourceIds.has(item.sourceId)) {
      issues.push({
        code: 'missing-reference',
        path: `sequence.items.${item.id}.sourceId`,
        message: `Sequence item "${item.id}" references missing source "${item.sourceId}".`
      });
    }

    if (item.presetId && !presetIds.has(item.presetId)) {
      issues.push({
        code: 'missing-reference',
        path: `sequence.items.${item.id}.presetId`,
        message: `Sequence item "${item.id}" references missing preset "${item.presetId}".`
      });
    }
  }

  for (const ref of project.analysisRefs) {
    if (!sourceIds.has(ref.sourceId)) {
      issues.push({
        code: 'missing-reference',
        path: `analysisRefs.${ref.id}.sourceId`,
        message: `Analysis ref "${ref.id}" references missing source "${ref.sourceId}".`
      });
    }
  }

  return issues.sort((left, right) => compareStrings(left.path, right.path) || compareStrings(left.message, right.message));
}

export function getSourceById(project: NormalizedProjectFile, sourceId: string): ProjectSource | undefined {
  return project.sources.find((source) => source.id === sourceId);
}

export function getPresetById(project: NormalizedProjectFile, presetId: string): Preset | undefined {
  return project.presets.find((preset) => preset.id === presetId);
}

export function getMidiMappingById(project: NormalizedProjectFile, mappingId: string): MidiMappingFile | undefined {
  return project.midiMappings.find((mapping) => mapping.id === mappingId);
}

export function getAnalysisRefById(project: NormalizedProjectFile, analysisRefId: string): AnalysisRef | undefined {
  return project.analysisRefs.find((analysisRef) => analysisRef.id === analysisRefId);
}

export function getSequenceItemById(project: NormalizedProjectFile, itemId: string): SequenceItem | undefined {
  return project.sequence.items.find((item) => item.id === itemId);
}
