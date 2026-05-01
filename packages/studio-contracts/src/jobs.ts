import type { ExportProfileId } from '@afterimage/export-profiles';
import type { ExportSelection, NormalizedProjectFile } from '@afterimage/project-model';

export interface DesktopJobResult {
  kind: 'analysis' | 'preview' | 'export' | 'library-scan' | 'library-analysis';
  project?: NormalizedProjectFile;
  outputPath?: string;
  rootId?: string;
  assetIds?: string[];
}

export interface DesktopJob {
  id: string;
  type: 'analysis' | 'thumbnails' | 'waveform' | 'preview' | 'export' | 'library-scan' | 'library-analysis';
  target: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: string;
  endedAt?: string;
  progress?: number;
  log: string[];
  error?: string;
  result?: DesktopJobResult;
}

export interface RunAnalysisRequest {
  project: NormalizedProjectFile;
  projectRoot: string;
  assetIds: string[];
}

export interface RunPreviewRequest {
  project: NormalizedProjectFile;
  projectRoot: string;
  outputPath: string;
  sequenceId?: string;
  variantId?: string;
}

export interface RunExportRequest extends RunPreviewRequest {
  profileIds: ExportProfileId[];
  selections?: ExportSelection[];
}

export interface JobsCommandMap {
  'jobs.runAnalysis': {
    payload: RunAnalysisRequest;
    result: DesktopJob[];
  };
  'jobs.runPreview': {
    payload: RunPreviewRequest;
    result: DesktopJob | null;
  };
  'jobs.runExport': {
    payload: RunExportRequest;
    result: DesktopJob[];
  };
  'jobs.cancel': {
    payload: string;
    result: boolean;
  };
  'jobs.retry': {
    payload: string;
    result: DesktopJob | null;
  };
}

export interface JobsQueryMap {
  'jobs.list': {
    payload: undefined;
    result: DesktopJob[];
  };
}

export interface JobsEventMap {
  'jobs.updated': DesktopJob[];
}
