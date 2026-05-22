import type { ExportProfileId } from '@afterimage/export-profiles';
import type { NormalizedProjectFile } from '@afterimage/project-model';
import type { LibraryAsset } from './library.js';

export interface StudioRenderArtifact {
  id: string;
  role: 'preview-output' | 'export-output' | 'render-output' | 'finalize-output';
  path: string;
  cacheKey: string;
  producedBy: string;
  provenance: Record<string, unknown>;
}

export interface StudioRenderDiagnostic {
  id: string;
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  path?: string;
  nodeId?: string;
  passId?: string;
  requirementId?: string;
}

export interface AnalysisAgentInput {
  project: NormalizedProjectFile;
  projectRoot: string;
  assetIds: string[];
}

export interface AnalysisAgentOutput {
  kind: 'analysis';
  project: NormalizedProjectFile;
}

export interface PreviewRenderAgentInput {
  project: NormalizedProjectFile;
  projectRoot: string;
  outputPath: string;
  sequenceId?: string;
  variantId?: string;
  captureSessionId?: string;
  captureLogId?: string;
  availableArchiveIds?: string[];
}

export interface PreviewRenderAgentOutput {
  kind: 'preview';
  outputPath: string;
  artifacts?: StudioRenderArtifact[];
  diagnostics?: StudioRenderDiagnostic[];
}

export interface ExportRenderAgentInput extends PreviewRenderAgentInput {
  profileId: ExportProfileId;
}

export interface ExportRenderAgentOutput {
  kind: 'export';
  outputPath: string;
  artifacts?: StudioRenderArtifact[];
  diagnostics?: StudioRenderDiagnostic[];
}

export interface LibraryScanAgentInput {
  rootId: string;
  rootPath: string;
}

export interface LibraryScanAgentOutput {
  kind: 'library-scan';
  rootId: string;
}

export interface LibraryAnalysisAgentInput {
  rootId: string;
  rootPath: string;
  assets: LibraryAsset[];
}

export interface LibraryAnalysisAgentOutput {
  kind: 'library-analysis';
  assetIds: string[];
}

interface StudioAgentOutputFields {
  project?: NormalizedProjectFile;
  outputPath?: string;
  artifacts?: StudioRenderArtifact[];
  diagnostics?: StudioRenderDiagnostic[];
  rootId?: string;
  assetIds?: string[];
}

export type StudioAgentInput =
  | ({ agent: 'analysis' } & AnalysisAgentInput)
  | ({ agent: 'preview-render' } & PreviewRenderAgentInput)
  | ({ agent: 'export-render' } & ExportRenderAgentInput)
  | ({ agent: 'library-scan' } & LibraryScanAgentInput)
  | ({ agent: 'library-analysis' } & LibraryAnalysisAgentInput);

export type StudioAgentOutput = (
  | AnalysisAgentOutput
  | PreviewRenderAgentOutput
  | ExportRenderAgentOutput
  | LibraryScanAgentOutput
  | LibraryAnalysisAgentOutput
) & StudioAgentOutputFields;
