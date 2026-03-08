export type RuntimeMode = 'studio' | 'live-desktop' | 'live-appliance';

export interface ProjectFile {
  id: string;
  name: string;
  mode: RuntimeMode;
  version: number;
  description?: string;
  presetIds?: string[];
  sequenceId?: string;
  analysisIds?: string[];
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
  family: 'vhs' | 'liminal' | 'imagined-futures' | 'glitch';
  filters: PresetFilter[];
}

export interface SequenceItem {
  sourceId: string;
  startMs: number;
  durationMs: number;
  presetId?: string;
}

export interface SequenceFile {
  id: string;
  name: string;
  items: SequenceItem[];
}

export interface SceneCut {
  timeMs: number;
  score: number;
}

export interface AnalysisFile {
  id: string;
  sourceId: string;
  sceneCuts: SceneCut[];
}

export interface MidiBinding {
  source: string;
  target: string;
  mode: 'set' | 'toggle' | 'scale' | 'trigger';
}

export interface MidiMappingFile {
  id: string;
  name: string;
  bindings: MidiBinding[];
}
