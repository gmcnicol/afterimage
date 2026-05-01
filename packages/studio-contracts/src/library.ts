import type {
  AnalysisRef,
  AnalysisStatus,
  AssetRole,
  MediaAsset,
  MediaType
} from '@afterimage/project-model';

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
  sortBy?: 'filename' | 'role' | 'type' | 'cuts' | 'duration' | 'analysis';
  sortDirection?: 'asc' | 'desc';
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

export interface LibraryRemoveAssetsRequest {
  assetIds: string[];
}

export interface LibraryCommandMap {
  'library.addRoot': {
    payload: LibraryAddRootRequest;
    result: LibraryRoot | null;
  };
  'library.removeRoot': {
    payload: string;
    result: boolean;
  };
  'library.rescanRoot': {
    payload: string;
    result: LibraryRoot;
  };
  'library.rescanAll': {
    payload: undefined;
    result: LibraryRoot[];
  };
  'library.clearAndRescanAll': {
    payload: undefined;
    result: LibraryRoot[];
  };
  'library.importAssets': {
    payload: LibraryImportAssetsRequest;
    result: MediaAsset[];
  };
  'library.removeAssets': {
    payload: LibraryRemoveAssetsRequest;
    result: number;
  };
}

export interface LibraryQueryMap {
  'library.listRoots': {
    payload: undefined;
    result: LibraryRoot[];
  };
  'library.listDirectories': {
    payload: string | undefined;
    result: LibraryDirectory[];
  };
  'library.searchAssets': {
    payload: LibrarySearchRequest | undefined;
    result: LibrarySearchResult;
  };
}
