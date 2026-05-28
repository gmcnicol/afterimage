import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveCompositionIntent } from '@afterimage/domain-operations';
import {
  buildPreviewRenderGraphPlan,
  evaluatePreviewAdapterReadiness,
  type PreviewBackendIdentity,
  type RenderGraphCapabilityDiagnostic,
  type RenderGraphNodeKind
} from '@afterimage/ffmpeg-compiler';
import type { NormalizedProjectFile, ProjectIntegrityIssue } from '@afterimage/project-model';
import { parseProject, ValidationError, type ValidationIssue } from '@afterimage/schema-validators';
import type {
  LiveCompositionRef,
  LiveSessionDiagnostic,
  LiveSessionReadiness,
  LiveSessionSnapshot
} from '@afterimage/studio-contracts';

const FFMPEG_COMMAND_PREVIEW_BACKEND: PreviewBackendIdentity = {
  backend: 'ffmpeg',
  label: 'FFmpeg command preview',
  runtime: 'command'
};

const NO_PROJECT_DIAGNOSTIC: LiveSessionDiagnostic = {
  id: 'diagnostic:live-session:no-project',
  severity: 'error',
  code: 'LIVE_SESSION_NO_PROJECT',
  message: 'No project file was supplied. Start Live Desktop with --project /path/to/project.afterimage.json.',
  source: 'live-session'
};

export interface LiveSessionService {
  getSession(): Promise<LiveSessionSnapshot>;
}

export interface CreateLiveSessionServiceOptions {
  projectPath?: string;
}

function blockedReadiness(diagnostics: LiveSessionDiagnostic[]): LiveSessionReadiness {
  return {
    status: 'blocked',
    previewStatus: 'not-evaluated',
    backend: FFMPEG_COMMAND_PREVIEW_BACKEND,
    diagnostics
  };
}

function toNoProjectSnapshot(): LiveSessionSnapshot {
  return {
    schemaVersion: 1,
    readiness: blockedReadiness([NO_PROJECT_DIAGNOSTIC])
  };
}

function toLoadFailureSnapshot(projectPath: string, error: unknown): LiveSessionSnapshot {
  return {
    schemaVersion: 1,
    projectPath,
    projectRoot: path.dirname(projectPath),
    readiness: blockedReadiness([{
      id: 'diagnostic:live-session:project-load-failed',
      severity: 'error',
      code: 'LIVE_SESSION_PROJECT_LOAD_FAILED',
      message: error instanceof Error ? error.message : 'Project file could not be loaded.',
      source: 'project-loader',
      path: projectPath
    }])
  };
}

function validationIssueToDiagnostic(issue: ValidationIssue, index: number, code: string): LiveSessionDiagnostic {
  return {
    id: `diagnostic:live-session:project-parse:${index}`,
    severity: 'error',
    code,
    message: issue.message,
    source: 'project-parser',
    path: issue.path
  };
}

function toParseFailureSnapshot(projectPath: string, error: unknown): LiveSessionSnapshot {
  const diagnostics = error instanceof ValidationError
    ? error.issues.map((issue, index) => validationIssueToDiagnostic(issue, index, error.code))
    : [{
        id: 'diagnostic:live-session:project-parse:0',
        severity: 'error' as const,
        code: 'LIVE_SESSION_PROJECT_PARSE_FAILED',
        message: error instanceof Error ? error.message : 'Project file could not be parsed.',
        source: 'project-parser' as const
      }];

  return {
    schemaVersion: 1,
    projectPath,
    projectRoot: path.dirname(projectPath),
    readiness: blockedReadiness(diagnostics)
  };
}

function projectIssueToDiagnostic(issue: ProjectIntegrityIssue, index: number): LiveSessionDiagnostic {
  return {
    id: `diagnostic:live-session:composition-resolver:${index}`,
    severity: 'error',
    code: `COMPOSITION_${issue.code.toUpperCase().replace(/-/g, '_')}`,
    message: issue.message,
    source: 'composition-resolver',
    path: issue.path
  };
}

function previewDiagnosticToLiveDiagnostic(
  diagnostic: RenderGraphCapabilityDiagnostic,
  index: number
): LiveSessionDiagnostic {
  return {
    id: diagnostic.id || `diagnostic:live-session:preview-adapter:${index}`,
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    source: 'preview-adapter',
    path: diagnostic.path,
    nodeId: diagnostic.nodeId,
    passId: diagnostic.passId,
    requirementId: diagnostic.requirementId
  };
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined))]
    .sort((left, right) => left.localeCompare(right));
}

function collectRequiredSeedIds(project: NormalizedProjectFile): string[] {
  return uniqueSorted([
    ...project.composition.modulationRoutes.map((route) => route.seedId),
    ...project.composition.entropyStates.map((state) => state.seedId),
    ...project.captureSessions.flatMap((session) => session.seedIds),
    ...project.captureLogs.flatMap((log) => log.events.map((event) => event.seedId))
  ]);
}

function toCompositionRef(project: NormalizedProjectFile, intent: {
  sequence: { id: string; name: string };
  variant: { id: string; name: string };
}): LiveCompositionRef {
  return {
    projectId: project.id,
    projectName: project.name,
    compositionId: project.composition.id,
    compositionName: project.composition.name,
    sequenceId: intent.sequence.id,
    sequenceName: intent.sequence.name,
    variantId: intent.variant.id,
    variantName: intent.variant.name
  };
}

export function buildLiveSessionSnapshotFromProject(
  project: NormalizedProjectFile,
  projectPath: string
): LiveSessionSnapshot {
  const projectRoot = path.dirname(projectPath);
  const intentResult = resolveCompositionIntent({ project });

  if (!intentResult.ok) {
    return {
      schemaVersion: 1,
      projectPath,
      projectRoot,
      readiness: blockedReadiness(intentResult.diagnostics.map(projectIssueToDiagnostic))
    };
  }

  const { intent } = intentResult;
  const plan = buildPreviewRenderGraphPlan(project, {
    sequenceId: intent.sequence.id,
    variantId: intent.variant.id,
    outputPath: path.join(projectRoot, '.afterimage', 'preview', `${intent.variant.id}.mp4`)
  });
  const adapter = evaluatePreviewAdapterReadiness(plan, {
    backend: FFMPEG_COMMAND_PREVIEW_BACKEND,
    supportedNodeKinds: uniqueSorted(plan.nodes.map((node) => node.kind)) as RenderGraphNodeKind[],
    supportedCapabilities: uniqueSorted(plan.backendRequirements.flatMap((requirement) => requirement.capabilities)),
    requiredSeedIds: collectRequiredSeedIds(project),
    availableSeedIds: project.composition.deterministicSeeds.map((seed) => seed.id),
    runtimeDiagnostics: {
      environment: 'electron',
      renderer: 'ffmpeg-command-preview',
      available: true
    }
  });
  const status = adapter.status === 'supported' || adapter.status === 'approximated'
    ? 'ready'
    : 'blocked';

  return {
    schemaVersion: 1,
    projectPath,
    projectRoot,
    compositionRef: toCompositionRef(project, intent),
    readiness: {
      status,
      previewStatus: adapter.status,
      backend: FFMPEG_COMMAND_PREVIEW_BACKEND,
      diagnostics: adapter.diagnostics.map(previewDiagnosticToLiveDiagnostic),
      report: adapter.report,
      adapter
    }
  };
}

export function createLiveSessionService(options: CreateLiveSessionServiceOptions): LiveSessionService {
  return {
    async getSession() {
      if (!options.projectPath) {
        return toNoProjectSnapshot();
      }

      const projectPath = path.resolve(options.projectPath);
      let parsedJson: unknown;

      try {
        parsedJson = JSON.parse(await readFile(projectPath, 'utf8')) as unknown;
      } catch (error) {
        return toLoadFailureSnapshot(projectPath, error);
      }

      try {
        return buildLiveSessionSnapshotFromProject(parseProject(parsedJson), projectPath);
      } catch (error) {
        return toParseFailureSnapshot(projectPath, error);
      }
    }
  };
}
