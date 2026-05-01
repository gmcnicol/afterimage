import type { ExportProfileId } from '@afterimage/export-profiles';
import type { NormalizedProjectFile } from '@afterimage/project-model';
import type { LibraryAsset } from './library.js';

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
}

export interface PreviewRenderAgentOutput {
  kind: 'preview';
  outputPath: string;
}

export interface ExportRenderAgentInput extends PreviewRenderAgentInput {
  profileId: ExportProfileId;
}

export interface ExportRenderAgentOutput {
  kind: 'export';
  outputPath: string;
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
