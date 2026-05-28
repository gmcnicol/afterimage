import { buildPreviewCapabilityReport } from './preview-capability.js';
import type {
  PreviewAdapterCapabilityContext,
  PreviewAdapterReadinessResult,
  PreviewCapability,
  PreviewCapabilityRejectionReason,
  PreviewCapabilityStatus,
  RenderGraphCapabilityDiagnostic,
  RenderGraphNodeKind,
  RenderGraphPlan
} from './types.js';

export const PREVIEW_ADAPTER_UNSUPPORTED_NODE_KIND = 'PREVIEW_ADAPTER_UNSUPPORTED_NODE_KIND';
export const PREVIEW_ADAPTER_MISSING_DETERMINISTIC_SEED = 'PREVIEW_ADAPTER_MISSING_DETERMINISTIC_SEED';
export const PREVIEW_ADAPTER_MISSING_REQUIRED_CAPABILITY = 'PREVIEW_ADAPTER_MISSING_REQUIRED_CAPABILITY';
export const PREVIEW_ADAPTER_NON_PREVIEW_PLAN = 'PREVIEW_ADAPTER_NON_PREVIEW_PLAN';

function uniqueValues<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function toDiagnosticId(scope: string, value: string): string {
  return `diagnostic:preview-adapter:${scope}:${value}`;
}

function toRequiredCapabilities(plan: RenderGraphPlan): PreviewCapability[] {
  const capabilities = new Map<string, PreviewCapability>();

  for (const requirement of plan.backendRequirements.filter((requirement) => requirement.required)) {
    for (const capability of requirement.capabilities) {
      const id = `capability:${requirement.backend}:${capability}`;
      const existing = capabilities.get(id);

      if (existing) {
        existing.requirementIds = uniqueValues([...(existing.requirementIds ?? []), requirement.id]);
        continue;
      }

      capabilities.set(id, {
        id,
        label: capability,
        capability,
        backend: requirement.backend,
        requirementIds: [requirement.id]
      });
    }
  }

  return [...capabilities.values()];
}

function buildUnsupportedNodeDiagnostics(
  plan: RenderGraphPlan,
  context: PreviewAdapterCapabilityContext
): RenderGraphCapabilityDiagnostic[] {
  const supportedNodeKinds = new Set(context.supportedNodeKinds);

  return plan.nodes
    .filter((node) => !supportedNodeKinds.has(node.kind))
    .map((node) => ({
      id: toDiagnosticId('unsupported-node-kind', node.id),
      severity: 'error',
      code: PREVIEW_ADAPTER_UNSUPPORTED_NODE_KIND,
      message: `Preview adapter "${context.backend.label}" does not support render graph node kind "${node.kind}".`,
      nodeId: node.id
    }));
}

function buildMissingSeedDiagnostics(
  context: PreviewAdapterCapabilityContext
): RenderGraphCapabilityDiagnostic[] {
  const availableSeedIds = new Set(context.availableSeedIds ?? []);

  return uniqueValues(context.requiredSeedIds ?? [])
    .filter((seedId) => !availableSeedIds.has(seedId))
    .map((seedId) => ({
      id: toDiagnosticId('missing-seed', seedId),
      severity: 'error',
      code: PREVIEW_ADAPTER_MISSING_DETERMINISTIC_SEED,
      message: `Preview adapter "${context.backend.label}" is missing deterministic seed "${seedId}".`
    }));
}

function buildMissingCapabilityDiagnostics(
  requiredCapabilities: PreviewCapability[],
  context: PreviewAdapterCapabilityContext
): RenderGraphCapabilityDiagnostic[] {
  const supportedCapabilities = new Set(context.supportedCapabilities);

  return requiredCapabilities
    .filter((capability) =>
      !supportedCapabilities.has(capability.capability) && !supportedCapabilities.has(capability.id)
    )
    .map((capability) => ({
      id: toDiagnosticId('missing-required-capability', capability.id),
      severity: 'error',
      code: PREVIEW_ADAPTER_MISSING_REQUIRED_CAPABILITY,
      message: `Preview adapter "${context.backend.label}" does not declare required capability "${capability.capability}".`,
      requirementId: capability.requirementIds?.[0]
    }));
}

function buildMissingCapabilityRejectionReasons(
  missingCapabilities: PreviewCapability[],
  diagnostics: RenderGraphCapabilityDiagnostic[],
  context: PreviewAdapterCapabilityContext
): PreviewCapabilityRejectionReason[] {
  return missingCapabilities.map((capability) => {
    const diagnostic = diagnostics.find((candidate) => candidate.id.endsWith(capability.id));

    return {
      id: `rejection:${context.backend.backend}:missing-required-capability:${capability.capability}`,
      label: `Missing required capability ${capability.capability}`,
      reason: `Preview adapter "${context.backend.label}" would produce a misleading preview without required capability "${capability.capability}".`,
      severity: 'error',
      diagnosticCode: PREVIEW_ADAPTER_MISSING_REQUIRED_CAPABILITY,
      capabilityIds: [capability.id],
      diagnosticIds: diagnostic ? [diagnostic.id] : [],
      requirementIds: capability.requirementIds
    };
  });
}

function buildNonPreviewPlanDiagnostic(
  plan: RenderGraphPlan,
  context: PreviewAdapterCapabilityContext
): RenderGraphCapabilityDiagnostic[] {
  if (plan.identity.mode === 'preview') {
    return [];
  }

  return [{
    id: toDiagnosticId('non-preview-plan', plan.identity.planId),
    severity: 'error',
    code: PREVIEW_ADAPTER_NON_PREVIEW_PLAN,
    message: `Preview adapter "${context.backend.label}" can only evaluate preview render graph plans.`
  }];
}

function inferReadinessStatus(options: {
  rejectionReasons: PreviewCapabilityRejectionReason[];
  unsupportedNodeDiagnostics: RenderGraphCapabilityDiagnostic[];
  missingSeedDiagnostics: RenderGraphCapabilityDiagnostic[];
  nonPreviewPlanDiagnostics: RenderGraphCapabilityDiagnostic[];
}): PreviewCapabilityStatus {
  if (options.rejectionReasons.length > 0) {
    return 'rejected';
  }

  if (
    options.unsupportedNodeDiagnostics.length > 0 ||
    options.missingSeedDiagnostics.length > 0 ||
    options.nonPreviewPlanDiagnostics.length > 0
  ) {
    return 'unsupported';
  }

  return 'supported';
}

export function evaluatePreviewAdapterReadiness(
  plan: RenderGraphPlan,
  context: PreviewAdapterCapabilityContext
): PreviewAdapterReadinessResult {
  const requiredCapabilities = toRequiredCapabilities(plan);
  const unsupportedNodeDiagnostics = buildUnsupportedNodeDiagnostics(plan, context);
  const missingSeedDiagnostics = buildMissingSeedDiagnostics(context);
  const missingCapabilityDiagnostics = buildMissingCapabilityDiagnostics(requiredCapabilities, context);
  const nonPreviewPlanDiagnostics = buildNonPreviewPlanDiagnostic(plan, context);
  const missingRequiredCapabilities = requiredCapabilities.filter((capability) =>
    missingCapabilityDiagnostics.some((diagnostic) => diagnostic.id.endsWith(capability.id))
  );
  const rejectionReasons = [
    ...(context.rejectionReasons ?? []),
    ...buildMissingCapabilityRejectionReasons(missingRequiredCapabilities, missingCapabilityDiagnostics, context)
  ];
  const status = inferReadinessStatus({
    rejectionReasons,
    unsupportedNodeDiagnostics,
    missingSeedDiagnostics,
    nonPreviewPlanDiagnostics
  });
  const additionalDiagnostics = [
    ...unsupportedNodeDiagnostics,
    ...missingSeedDiagnostics,
    ...missingCapabilityDiagnostics,
    ...nonPreviewPlanDiagnostics
  ];
  const report = buildPreviewCapabilityReport(plan, {
    backend: context.backend,
    status,
    optionalCapabilities: context.optionalCapabilities,
    rejectionReasons,
    additionalDiagnostics,
    runtimeDiagnostics: context.runtimeDiagnostics,
    deviceDiagnostics: context.deviceDiagnostics,
    metadata: context.metadata
  });

  return {
    status,
    report,
    diagnostics: report.diagnostics,
    unsupportedNodeKinds: uniqueValues(unsupportedNodeDiagnostics
      .map((diagnostic) => plan.nodes.find((node) => node.id === diagnostic.nodeId)?.kind)
      .filter((kind): kind is RenderGraphNodeKind => kind !== undefined)),
    missingRequiredCapabilities,
    missingRequiredSeedIds: uniqueValues(context.requiredSeedIds ?? [])
      .filter((seedId) => !(context.availableSeedIds ?? []).includes(seedId)),
    rejectionReasons
  };
}
