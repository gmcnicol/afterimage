import type { ExportProfileId } from '@afterimage/export-profiles';
import type {
  AnalysisFile,
  AnalysisRef,
  AnalysisStatus,
  AssetRole,
  ExportSelection,
  MediaAsset,
  MediaType,
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

export type LibraryScanStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed';

export interface LibraryRoot {
  id: string;
  path: string;
  role: AssetRole;
  enabled: boolean;
  lastScanStatus: LibraryScanStatus;
  lastScanStartedAt?: string;
  lastScanEndedAt?: string;
  lastScanError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryDirectory {
  id: string;
  rootId: string;
  path: string;
  parentPath?: string;
  fileCount: number;
  supportedFileCount: number;
  scannedAt: string;
}

export interface LibraryAsset {
  id: string;
  rootId: string;
  directoryId: string;
  path: string;
  filename: string;
  mediaType: MediaType;
  assetRole: AssetRole;
  fileSize: number;
  mtimeMs: number;
  hashKey: string;
  durationMs?: number;
  width?: number;
  height?: number;
  frameRate?: number;
  hasAudio: boolean;
  analysisStatus: AnalysisStatus;
  missing: boolean;
  analysisRef?: AnalysisRef;
  scannedAt: string;
  updatedAt: string;
}

export interface LibrarySearchRequest {
  query?: string;
  roles?: AssetRole[];
  mediaTypes?: MediaType[];
  analysisStatuses?: AnalysisStatus[];
  rootId?: string;
  includeMissing?: boolean;
  limit?: number;
  offset?: number;
}

export interface LibrarySearchResult {
  assets: LibraryAsset[];
  total: number;
}

export interface LibraryAddRootRequest {
  role: AssetRole;
}

export interface LibraryImportAssetsRequest {
  projectRoot?: string;
  assetIds: string[];
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
  library: {
    addRoot: (input: LibraryAddRootRequest) => Promise<LibraryRoot | null>;
    rescanRoot: (rootId: string) => Promise<LibraryRoot>;
    rescanAll: () => Promise<LibraryRoot[]>;
    listRoots: () => Promise<LibraryRoot[]>;
    listDirectories: (rootId?: string) => Promise<LibraryDirectory[]>;
    searchAssets: (input?: LibrarySearchRequest) => Promise<LibrarySearchResult>;
    importAssets: (input: LibraryImportAssetsRequest) => Promise<MediaAsset[]>;
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
