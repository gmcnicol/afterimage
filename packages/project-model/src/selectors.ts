import type {
  AnalysisRef,
  AutomationLane,
  Bin,
  CutCandidate,
  FilterStack,
  MediaAsset,
  MidiMappingFile,
  NormalizedProjectFile,
  Preset,
  ProjectPathRef,
  Sequence,
  Variant
} from './types.js';

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
