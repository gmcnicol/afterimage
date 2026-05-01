import type { ExportProfileId } from '@afterimage/export-profiles';
import type { ExportSelection, NormalizedProjectFile } from '@afterimage/project-model';
import type {
  AnalysisAgentInput,
  PreviewRenderAgentInput,
  StudioAgentOutput
} from './agents.js';

export type DesktopJobResult = StudioAgentOutput;

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

export interface JobLaunchResult {
  jobIds: string[];
}

export interface RunAnalysisRequest extends AnalysisAgentInput {}

export interface RunPreviewRequest extends PreviewRenderAgentInput {}

export interface RunExportRequest extends RunPreviewRequest {
  profileIds: ExportProfileId[];
  selections?: ExportSelection[];
}

export interface JobsCommandMap {
  'jobs.runAnalysis': {
    payload: RunAnalysisRequest;
    result: JobLaunchResult;
  };
  'jobs.runPreview': {
    payload: RunPreviewRequest;
    result: JobLaunchResult;
  };
  'jobs.runExport': {
    payload: RunExportRequest;
    result: JobLaunchResult;
  };
  'jobs.cancel': {
    payload: string;
    result: boolean;
  };
  'jobs.retry': {
    payload: string;
    result: JobLaunchResult;
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
