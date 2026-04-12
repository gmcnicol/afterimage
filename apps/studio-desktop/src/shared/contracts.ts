import type { ExportProfileId } from '@afterimage/export-profiles';
import type {
  AnalysisFile,
  ExportSelection,
  MediaAsset,
  NormalizedProjectFile,
  ProjectPathRef
} from '@afterimage/project-model';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: string;
}

export interface DesktopJobResult {
  kind: 'analysis' | 'preview' | 'export';
  project?: NormalizedProjectFile;
  outputPath?: string;
}

export interface DesktopJob {
  id: string;
  type: 'analysis' | 'thumbnails' | 'waveform' | 'preview' | 'export';
  target: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: string;
  endedAt?: string;
  progress?: number;
  log: string[];
  error?: string;
  result?: DesktopJobResult;
}

export interface DiagnosticsSnapshot {
  toolchain: {
    available: boolean;
    warnings: string[];
    versions: Record<string, { path: string; versionLine?: string; available: boolean } | undefined>;
  };
  warnings: string[];
  missingMedia: string[];
  recentCommands: string[];
  logs: LogEntry[];
  environmentSummary: Record<string, string>;
}

export interface ProjectSessionSnapshot {
  project: NormalizedProjectFile;
  projectFilePath?: string;
  projectRoot?: string;
  recentProjects: string[];
}

export interface SaveProjectRequest {
  project: NormalizedProjectFile;
  projectFilePath?: string;
}

export interface RelinkAssetResult {
  assetId: string;
  path: ProjectPathRef;
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

export interface DesktopApi {
  project: {
    getInitialState: () => Promise<ProjectSessionSnapshot>;
    subscribeRecentProjects: (listener: (recentProjects: string[]) => void) => () => void;
    createProject: (options?: { name?: string }) => Promise<ProjectSessionSnapshot | null>;
    openProject: () => Promise<ProjectSessionSnapshot | null>;
    openProjectAt: (projectFilePath: string) => Promise<ProjectSessionSnapshot>;
    removeRecentProject: (projectFilePath: string) => Promise<string[]>;
    saveProject: (input: SaveProjectRequest) => Promise<ProjectSessionSnapshot>;
    saveProjectAs: (input: SaveProjectRequest) => Promise<ProjectSessionSnapshot | null>;
    duplicateProject: (input: SaveProjectRequest) => Promise<ProjectSessionSnapshot | null>;
    revealProjectFolder: (projectFilePath: string) => Promise<void>;
    loadAnalysis: (analysisPath: string) => Promise<AnalysisFile | null>;
    importMedia: (projectRoot?: string) => Promise<MediaAsset[]>;
    importMusic: (projectRoot?: string) => Promise<MediaAsset[]>;
    importTransitionMasks: (projectRoot?: string) => Promise<MediaAsset[]>;
    importTransitionOverlays: (projectRoot?: string) => Promise<MediaAsset[]>;
    relinkAsset: (input: { projectRoot: string; assetId: string; currentPath?: string }) => Promise<RelinkAssetResult | null>;
  };
  jobs: {
    list: () => Promise<DesktopJob[]>;
    subscribe: (listener: (jobs: DesktopJob[]) => void) => () => void;
    runAnalysis: (input: RunAnalysisRequest) => Promise<DesktopJob[]>;
    runPreview: (input: RunPreviewRequest) => Promise<DesktopJob | null>;
    runExport: (input: RunExportRequest) => Promise<DesktopJob[]>;
    cancel: (jobId: string) => Promise<boolean>;
    retry: (jobId: string) => Promise<DesktopJob | null>;
  };
  diagnostics: {
    getReport: (input?: { project?: NormalizedProjectFile; projectRoot?: string }) => Promise<DiagnosticsSnapshot>;
    getLogs: () => Promise<LogEntry[]>;
  };
  shell: {
    revealPath: (path: string) => Promise<void>;
    getRuntimeInfo: () => Promise<Record<string, string>>;
  };
}
