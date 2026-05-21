import { getExportProfileById, type ExportProfileId } from '@afterimage/export-profiles';
import type {
  NormalizedProjectFile,
  ProjectFile
} from '@afterimage/project-model';
import {
  buildExportRenderGraphPlan,
  buildPreviewRenderGraphPlan,
  buildRenderGraphPlan
} from './render-graph.js';
import type {
  CommandSpec,
  ExportRequest,
  PreviewPlan,
  PreviewRequest,
  RenderGraphPass,
  RenderGraphPlan,
  RenderPlan,
  RenderRequest,
  ResolvedFfmpegTools
} from './types.js';

function compileFfmpegRenderPass(plan: RenderGraphPlan): CommandSpec {
  const ffmpegPasses = plan.passes.filter((pass) => pass.backend === 'ffmpeg');

  if (ffmpegPasses.length !== 1) {
    throw new Error(`Expected exactly one FFmpeg render pass, found ${ffmpegPasses.length}.`);
  }

  const command = (ffmpegPasses[0] as RenderGraphPass & { command?: CommandSpec }).command;
  if (!command) {
    throw new Error(`FFmpeg render pass "${ffmpegPasses[0].id}" does not include a command.`);
  }

  return command;
}

export function buildPreviewPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: PreviewRequest,
  tools?: ResolvedFfmpegTools
): PreviewPlan {
  const graphPlan = buildPreviewRenderGraphPlan(project, request, tools);

  return {
    projectId: graphPlan.identity.projectId,
    sequenceId: graphPlan.identity.sequenceId,
    variantId: graphPlan.identity.variantId,
    outputPath: graphPlan.target.outputPath,
    command: compileFfmpegRenderPass(graphPlan)
  };
}

export function buildExportPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: ExportRequest,
  tools?: ResolvedFfmpegTools
): RenderPlan {
  const graphPlan = buildExportRenderGraphPlan(project, request, tools);

  return {
    projectId: graphPlan.identity.projectId,
    sequenceId: graphPlan.identity.sequenceId,
    variantId: graphPlan.identity.variantId,
    outputPath: graphPlan.target.outputPath,
    command: compileFfmpegRenderPass(graphPlan)
  };
}

export function buildRenderPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: RenderRequest,
  tools?: ResolvedFfmpegTools
): RenderPlan {
  const graphPlan = buildRenderGraphPlan(project, request, request.profile, 'render', tools);

  return {
    projectId: graphPlan.identity.projectId,
    sequenceId: graphPlan.identity.sequenceId,
    variantId: graphPlan.identity.variantId,
    outputPath: graphPlan.target.outputPath,
    command: compileFfmpegRenderPass(graphPlan)
  };
}

export function buildProfileExportPlan(
  project: ProjectFile | NormalizedProjectFile,
  request: Omit<ExportRequest, 'profile'> & { profileId: ExportProfileId },
  tools?: ResolvedFfmpegTools
): RenderPlan {
  return buildExportPlan(project, {
    ...request,
    profile: getExportProfileById(request.profileId)
  }, tools);
}
