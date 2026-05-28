import { hashIdentity } from './identity.js';
import type {
  BuildPreviewCapabilityReportOptions,
  PreviewBackendIdentity,
  PreviewBackendRequirementReport,
  PreviewCapability,
  PreviewCapabilityReport,
  PreviewCapabilityStatus,
  RenderGraphPlan
} from './types.js';

const DEFAULT_FFMPEG_PREVIEW_BACKEND: PreviewBackendIdentity = {
  backend: 'ffmpeg',
  label: 'FFmpeg command preview',
  runtime: 'command'
};

function withoutUndefinedEntries<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));
}

function toBackendRequirementReport(plan: RenderGraphPlan): PreviewBackendRequirementReport[] {
  return plan.backendRequirements.map((requirement) => withoutUndefinedEntries({
    id: requirement.id,
    backend: requirement.backend,
    required: requirement.required,
    capabilities: [...requirement.capabilities],
    binary: requirement.binary,
    sourceRequirementId: requirement.id,
    provenance: requirement.provenance,
    metadata: requirement.metadata
  }) as unknown as PreviewBackendRequirementReport);
}

function toRequiredCapabilities(plan: RenderGraphPlan): PreviewCapability[] {
  const capabilities = new Map<string, PreviewCapability>();

  for (const requirement of plan.backendRequirements) {
    for (const capability of requirement.capabilities) {
      const id = `capability:${requirement.backend}:${capability}`;
      const existing = capabilities.get(id);

      if (existing) {
        existing.requirementIds = [...(existing.requirementIds ?? []), requirement.id];
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

function inferPreviewCapabilityStatus(
  plan: RenderGraphPlan,
  options: BuildPreviewCapabilityReportOptions
): PreviewCapabilityStatus {
  if (options.status) {
    return options.status;
  }

  if ((options.rejectionReasons ?? []).length > 0) {
    return 'rejected';
  }

  if (plan.identity.mode !== 'preview') {
    return 'unsupported';
  }

  if ((options.degradations ?? []).length > 0) {
    return 'approximated';
  }

  return 'supported';
}

export function buildPreviewCapabilityReport(
  plan: RenderGraphPlan,
  options: BuildPreviewCapabilityReportOptions = {}
): PreviewCapabilityReport {
  const backend = options.backend ?? DEFAULT_FFMPEG_PREVIEW_BACKEND;
  const diagnostics = [
    ...plan.diagnostics.map((diagnostic) => ({ ...diagnostic })),
    ...(options.additionalDiagnostics ?? []).map((diagnostic) => ({ ...diagnostic }))
  ];
  const backendRequirements = toBackendRequirementReport(plan);
  const requiredCapabilities = toRequiredCapabilities(plan);
  const optionalCapabilities = options.optionalCapabilities ?? [];
  const degradations = options.degradations ?? [];
  const rejectionReasons = options.rejectionReasons ?? [];
  const status = inferPreviewCapabilityStatus(plan, options);
  const reportId = `preview-capability-report:${hashIdentity({
    backend,
    planId: plan.identity.planId,
    status,
    backendRequirements,
    requiredCapabilities,
    optionalCapabilities,
    degradations,
    rejectionReasons,
    diagnostics: diagnostics.map((diagnostic) => diagnostic.id)
  })}`;

  return withoutUndefinedEntries({
    schemaVersion: 1,
    id: reportId,
    status,
    backend,
    renderGraph: {
      planId: plan.identity.planId,
      projectId: plan.identity.projectId,
      sequenceId: plan.identity.sequenceId,
      variantId: plan.identity.variantId,
      mode: plan.identity.mode,
      passIds: plan.passes.map((pass) => pass.id),
      artifactIds: plan.artifacts.map((artifact) => artifact.id),
      requirementIds: plan.backendRequirements.map((requirement) => requirement.id),
      diagnosticIds: plan.diagnostics.map((diagnostic) => diagnostic.id)
    },
    target: {
      outputPath: plan.target.outputPath,
      profile: plan.target.profile,
      durationMs: plan.target.durationMs
    },
    backendRequirements,
    requiredCapabilities,
    optionalCapabilities,
    degradations,
    rejectionReasons,
    diagnostics,
    runtimeDiagnostics: options.runtimeDiagnostics,
    deviceDiagnostics: options.deviceDiagnostics,
    metadata: options.metadata
  }) as unknown as PreviewCapabilityReport;
}
