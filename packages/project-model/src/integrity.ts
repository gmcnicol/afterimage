import { getFilterDefinition, getSupportedAutomationProperties, isSupportedFilterType } from './filters.js';
import type { AutomationTargetProperty, ModulationEndpoint, ModulationScope, NormalizedProjectFile, ProjectIntegrityIssue } from './types.js';
import { compareNumbers, compareStrings } from './utils.js';

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

function validateModulationScope(
  issues: ProjectIntegrityIssue[],
  path: string,
  ownerLabel: string,
  scope: ModulationScope,
  refs: {
    compositionId: string;
    sequenceIds: Set<string>;
    variantIds: Set<string>;
    sceneIds: Set<string>;
    layerIds: Set<string>;
    clipIds: Set<string>;
  }
): void {
  if (scope.compositionId && scope.compositionId !== refs.compositionId) {
    pushMissingReference(issues, `${path}.compositionId`, `${ownerLabel} references missing composition "${scope.compositionId}".`);
  }
  if (scope.sequenceId && !refs.sequenceIds.has(scope.sequenceId)) {
    pushMissingReference(issues, `${path}.sequenceId`, `${ownerLabel} references missing sequence "${scope.sequenceId}".`);
  }
  if (scope.variantId && !refs.variantIds.has(scope.variantId)) {
    pushMissingReference(issues, `${path}.variantId`, `${ownerLabel} references missing variant "${scope.variantId}".`);
  }
  if (scope.sceneId && !refs.sceneIds.has(scope.sceneId)) {
    pushMissingReference(issues, `${path}.sceneId`, `${ownerLabel} references missing scene "${scope.sceneId}".`);
  }
  if (scope.layerId && !refs.layerIds.has(scope.layerId)) {
    pushMissingReference(issues, `${path}.layerId`, `${ownerLabel} references missing layer "${scope.layerId}".`);
  }
  if (scope.clipId && !refs.clipIds.has(scope.clipId)) {
    pushMissingReference(issues, `${path}.clipId`, `${ownerLabel} references missing clip "${scope.clipId}".`);
  }
}

function validateEndpointReference(
  issues: ProjectIntegrityIssue[],
  path: string,
  ownerLabel: string,
  endpoint: ModulationEndpoint,
  refs: {
    compositionId: string;
    laneIds: Set<string>;
    midiBindingIds: Set<string>;
    captureEventIds: Set<string>;
    entropyIds: Set<string>;
    routeIds: Set<string>;
    filterIds: Set<string>;
    sceneIds: Set<string>;
    layerIds: Set<string>;
  }
): void {
  switch (endpoint.kind) {
    case 'automation-lane':
      if (!refs.laneIds.has(endpoint.id)) {
        pushMissingReference(issues, `${path}.id`, `${ownerLabel} references missing automation lane "${endpoint.id}".`);
      }
      break;
    case 'midi-binding':
      if (!refs.midiBindingIds.has(endpoint.id)) {
        pushMissingReference(issues, `${path}.id`, `${ownerLabel} references missing MIDI binding "${endpoint.id}".`);
      }
      break;
    case 'capture-event':
      if (!refs.captureEventIds.has(endpoint.id)) {
        pushMissingReference(issues, `${path}.id`, `${ownerLabel} references missing capture event "${endpoint.id}".`);
      }
      break;
    case 'entropy-state':
      if (!refs.entropyIds.has(endpoint.id)) {
        pushMissingReference(issues, `${path}.id`, `${ownerLabel} references missing entropy state "${endpoint.id}".`);
      }
      break;
    case 'modulation-route':
      if (!refs.routeIds.has(endpoint.id)) {
        pushMissingReference(issues, `${path}.id`, `${ownerLabel} references missing modulation route "${endpoint.id}".`);
      }
      break;
    case 'filter':
      if (!refs.filterIds.has(endpoint.id)) {
        pushMissingReference(issues, `${path}.id`, `${ownerLabel} references missing filter "${endpoint.id}".`);
      }
      break;
    case 'scene':
    case 'scene-climate':
      if (!refs.sceneIds.has(endpoint.id)) {
        pushMissingReference(issues, `${path}.id`, `${ownerLabel} references missing scene "${endpoint.id}".`);
      }
      break;
    case 'layer':
      if (!refs.layerIds.has(endpoint.id)) {
        pushMissingReference(issues, `${path}.id`, `${ownerLabel} references missing layer "${endpoint.id}".`);
      }
      break;
    case 'composition':
      if (endpoint.id !== refs.compositionId) {
        pushMissingReference(issues, `${path}.id`, `${ownerLabel} references missing composition "${endpoint.id}".`);
      }
      break;
    case 'manual':
      break;
  }
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
  const exportProfileIds = new Set(project.exportSelections.map((selection) => selection.profileId));
  const sceneIds = new Set(project.composition.scenes.map((scene) => scene.id));
  const layerIds = new Set(project.composition.layers.map((layer) => layer.id));
  const clipIds = new Set(project.variants.flatMap((variant) => variant.clips.map((clip) => clip.id)));
  const seedIds = new Set(project.composition.deterministicSeeds.map((seed) => seed.id));
  const routeIds = new Set(project.composition.modulationRoutes.map((route) => route.id));
  const entropyIds = new Set(project.composition.entropyStates.map((state) => state.id));
  const captureSessionIds = new Set(project.captureSessions.map((session) => session.id));
  const captureEventIds = new Set(project.captureLogs.flatMap((log) => log.events.map((event) => event.id)));
  const midiBindingIds = new Set(project.midiMappings.flatMap((mapping) => mapping.bindings.map((binding) => binding.id)));

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
  issues.push(...collectDuplicateIdIssues('composition.assetIds', project.composition.assetIds));
  issues.push(...collectDuplicateIdIssues('composition.exportProfileIds', project.composition.exportProfileIds));
  issues.push(...collectDuplicateIdIssues('composition.deterministicSeeds', project.composition.deterministicSeeds.map((seed) => seed.id)));
  issues.push(...collectDuplicateIdIssues('composition.modulationRoutes', project.composition.modulationRoutes.map((route) => route.id)));
  issues.push(...collectDuplicateIdIssues('composition.entropyStates', project.composition.entropyStates.map((state) => state.id)));
  issues.push(...collectDuplicateIdIssues('composition.scenes', project.composition.scenes.map((scene) => scene.id)));
  issues.push(...collectDuplicateIdIssues('composition.layers', project.composition.layers.map((layer) => layer.id)));
  issues.push(...collectDuplicateIdIssues('captureSessions', project.captureSessions.map((session) => session.id)));
  issues.push(...collectDuplicateIdIssues('captureLogs', project.captureLogs.map((log) => log.id)));

  const filterIds = new Set(project.filterStacks.flatMap((stack) => stack.filters.map((filter) => filter.id)));
  const scopeRefs = { compositionId: project.composition.id, sequenceIds, variantIds, sceneIds, layerIds, clipIds };
  const endpointRefs = {
    compositionId: project.composition.id,
    laneIds,
    midiBindingIds,
    captureEventIds,
    entropyIds,
    routeIds,
    filterIds,
    sceneIds,
    layerIds
  };

  if (!sequenceIds.has(project.composition.sequenceId)) {
    pushMissingReference(issues, 'composition.sequenceId', `Composition "${project.composition.id}" references missing sequence "${project.composition.sequenceId}".`);
  }
  if (!variantIds.has(project.composition.variantId)) {
    pushMissingReference(issues, 'composition.variantId', `Composition "${project.composition.id}" references missing variant "${project.composition.variantId}".`);
  } else {
    const sequence = project.sequences.find((candidate) => candidate.id === project.composition.sequenceId);
    if (sequence && !sequence.variantIds.includes(project.composition.variantId)) {
      pushMissingReference(issues, 'composition.variantId', `Composition "${project.composition.id}" references variant "${project.composition.variantId}" outside sequence "${project.composition.sequenceId}".`);
    }
  }
  for (const assetId of project.composition.assetIds) {
    if (!assetIds.has(assetId)) {
      pushMissingReference(issues, 'composition.assetIds', `Composition "${project.composition.id}" references missing asset "${assetId}".`);
    }
  }
  for (const profileId of project.composition.exportProfileIds) {
    if (!exportProfileIds.has(profileId)) {
      pushMissingReference(issues, 'composition.exportProfileIds', `Composition "${project.composition.id}" references missing export profile selection "${profileId}".`);
    }
  }
  for (const route of project.composition.modulationRoutes) {
    validateEndpointReference(issues, `composition.modulationRoutes.${route.id}.source`, `Modulation route "${route.id}" source`, route.source, endpointRefs);
    validateEndpointReference(issues, `composition.modulationRoutes.${route.id}.target`, `Modulation route "${route.id}" target`, route.target, endpointRefs);
    validateModulationScope(issues, `composition.modulationRoutes.${route.id}.scope`, `Modulation route "${route.id}"`, route.scope, scopeRefs);
    if (route.seedId && !seedIds.has(route.seedId)) {
      pushMissingReference(issues, `composition.modulationRoutes.${route.id}.seedId`, `Modulation route "${route.id}" references missing deterministic seed "${route.seedId}".`);
    }
  }
  for (const state of project.composition.entropyStates) {
    validateEndpointReference(issues, `composition.entropyStates.${state.id}.source`, `Entropy state "${state.id}" source`, state.source, endpointRefs);
    validateEndpointReference(issues, `composition.entropyStates.${state.id}.target`, `Entropy state "${state.id}" target`, state.target, endpointRefs);
    validateModulationScope(issues, `composition.entropyStates.${state.id}.scope`, `Entropy state "${state.id}"`, state.scope, scopeRefs);
    if (state.seedId && !seedIds.has(state.seedId)) {
      pushMissingReference(issues, `composition.entropyStates.${state.id}.seedId`, `Entropy state "${state.id}" references missing deterministic seed "${state.seedId}".`);
    }
  }
  for (const scene of project.composition.scenes) {
    issues.push(...collectDuplicateIdIssues(`composition.scenes.${scene.id}.activation`, scene.activation.map((activation) => activation.id)));
    issues.push(...collectDuplicateIdIssues(`composition.scenes.${scene.id}.transitions`, scene.transitions.map((transition) => transition.id)));
    for (const activation of scene.activation) {
      if (activation.startMs !== undefined && activation.endMs !== undefined && activation.endMs < activation.startMs) {
        issues.push({
          code: 'invalid-range',
          path: `composition.scenes.${scene.id}.activation.${activation.id}`,
          message: `Scene activation "${activation.id}" cannot end before it starts.`
        });
      }
    }
    for (const transition of scene.transitions) {
      if (!sceneIds.has(transition.toSceneId)) {
        pushMissingReference(issues, `composition.scenes.${scene.id}.transitions.${transition.id}.toSceneId`, `Scene transition "${transition.id}" references missing scene "${transition.toSceneId}".`);
      }
      if (transition.maskAssetId && !assetIds.has(transition.maskAssetId)) {
        pushMissingReference(issues, `composition.scenes.${scene.id}.transitions.${transition.id}.maskAssetId`, `Scene transition "${transition.id}" references missing mask asset "${transition.maskAssetId}".`);
      }
      if (transition.overlayAssetId && !assetIds.has(transition.overlayAssetId)) {
        pushMissingReference(issues, `composition.scenes.${scene.id}.transitions.${transition.id}.overlayAssetId`, `Scene transition "${transition.id}" references missing overlay asset "${transition.overlayAssetId}".`);
      }
    }
    for (const layerId of scene.layerIds) {
      if (!layerIds.has(layerId)) {
        pushMissingReference(issues, `composition.scenes.${scene.id}.layerIds`, `Scene "${scene.id}" references missing layer "${layerId}".`);
      }
    }
  }
  for (const layer of project.composition.layers) {
    if (!sceneIds.has(layer.sceneId)) {
      pushMissingReference(issues, `composition.layers.${layer.id}.sceneId`, `Layer "${layer.id}" references missing scene "${layer.sceneId}".`);
    }
    if (layer.assetId && !assetIds.has(layer.assetId)) {
      pushMissingReference(issues, `composition.layers.${layer.id}.assetId`, `Layer "${layer.id}" references missing asset "${layer.assetId}".`);
    }
    if (layer.cutId && !cutIds.has(layer.cutId)) {
      pushMissingReference(issues, `composition.layers.${layer.id}.cutId`, `Layer "${layer.id}" references missing cut "${layer.cutId}".`);
    }
    if (layer.clipId && !clipIds.has(layer.clipId)) {
      pushMissingReference(issues, `composition.layers.${layer.id}.clipId`, `Layer "${layer.id}" references missing clip "${layer.clipId}".`);
    }
    if (layer.stackId && !stackIds.has(layer.stackId)) {
      pushMissingReference(issues, `composition.layers.${layer.id}.stackId`, `Layer "${layer.id}" references missing filter stack "${layer.stackId}".`);
    }
    if (layer.maskLayerId && !layerIds.has(layer.maskLayerId)) {
      pushMissingReference(issues, `composition.layers.${layer.id}.maskLayerId`, `Layer "${layer.id}" references missing mask layer "${layer.maskLayerId}".`);
    }
  }

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

  for (const session of project.captureSessions) {
    if (session.projectId !== project.id) {
      pushMissingReference(issues, `captureSessions.${session.id}.projectId`, `Capture session "${session.id}" references missing project "${session.projectId}".`);
    }
    if (session.compositionId && session.compositionId !== project.composition.id) {
      pushMissingReference(issues, `captureSessions.${session.id}.compositionId`, `Capture session "${session.id}" references missing composition "${session.compositionId}".`);
    }
    if (session.sequenceId && !sequenceIds.has(session.sequenceId)) {
      pushMissingReference(issues, `captureSessions.${session.id}.sequenceId`, `Capture session "${session.id}" references missing sequence "${session.sequenceId}".`);
    }
    if (session.variantId && !variantIds.has(session.variantId)) {
      pushMissingReference(issues, `captureSessions.${session.id}.variantId`, `Capture session "${session.id}" references missing variant "${session.variantId}".`);
    }
    for (const seedId of session.seedIds) {
      if (!seedIds.has(seedId)) {
        pushMissingReference(issues, `captureSessions.${session.id}.seedIds`, `Capture session "${session.id}" references missing deterministic seed "${seedId}".`);
      }
    }
  }

  for (const log of project.captureLogs) {
    if (!captureSessionIds.has(log.captureSessionId)) {
      pushMissingReference(issues, `captureLogs.${log.id}.captureSessionId`, `Capture log "${log.id}" references missing capture session "${log.captureSessionId}".`);
    }
    issues.push(...collectDuplicateIdIssues(`captureLogs.${log.id}.events`, log.events.map((event) => event.id)));
    issues.push(...collectDuplicateIdIssues(`captureLogs.${log.id}.eventIndexes`, log.events.map((event) => String(event.index))));
    for (const event of log.events) {
      if (!captureSessionIds.has(event.captureId)) {
        pushMissingReference(issues, `captureLogs.${log.id}.events.${event.id}.captureId`, `Capture event "${event.id}" references missing capture session "${event.captureId}".`);
      }
      validateEndpointReference(issues, `captureLogs.${log.id}.events.${event.id}.source`, `Capture event "${event.id}" source`, event.source, endpointRefs);
      if (event.target) {
        validateEndpointReference(issues, `captureLogs.${log.id}.events.${event.id}.target`, `Capture event "${event.id}" target`, event.target, endpointRefs);
      }
      if (event.routeId && !routeIds.has(event.routeId)) {
        pushMissingReference(issues, `captureLogs.${log.id}.events.${event.id}.routeId`, `Capture event "${event.id}" references missing modulation route "${event.routeId}".`);
      }
      if (event.mappingId && !midiMappingIds.has(event.mappingId)) {
        pushMissingReference(issues, `captureLogs.${log.id}.events.${event.id}.mappingId`, `Capture event "${event.id}" references missing MIDI mapping "${event.mappingId}".`);
      }
      if (event.seedId && !seedIds.has(event.seedId)) {
        pushMissingReference(issues, `captureLogs.${log.id}.events.${event.id}.seedId`, `Capture event "${event.id}" references missing deterministic seed "${event.seedId}".`);
      }
    }
  }

  return issues.sort((left, right) => compareStrings(left.path, right.path) || compareStrings(left.message, right.message));
}
