import type {
  AnalysisFile,
  MediaAsset,
  NormalizedProjectFile,
  ProjectPathRef
} from '@afterimage/project-model';

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

export interface ProjectCommandMap {
  'project.create': {
    payload: { name?: string } | undefined;
    result: ProjectSessionSnapshot | null;
  };
  'project.open': {
    payload: undefined;
    result: ProjectSessionSnapshot | null;
  };
  'project.openAt': {
    payload: string;
    result: ProjectSessionSnapshot;
  };
  'project.removeRecentProject': {
    payload: string;
    result: string[];
  };
  'project.save': {
    payload: SaveProjectRequest;
    result: ProjectSessionSnapshot;
  };
  'project.saveAs': {
    payload: SaveProjectRequest;
    result: ProjectSessionSnapshot | null;
  };
  'project.duplicate': {
    payload: SaveProjectRequest;
    result: ProjectSessionSnapshot | null;
  };
  'project.revealFolder': {
    payload: string;
    result: void;
  };
  'project.importMedia': {
    payload: string | undefined;
    result: MediaAsset[];
  };
  'project.importMusic': {
    payload: string | undefined;
    result: MediaAsset[];
  };
  'project.importTransitionMasks': {
    payload: string | undefined;
    result: MediaAsset[];
  };
  'project.importTransitionOverlays': {
    payload: string | undefined;
    result: MediaAsset[];
  };
  'project.relinkAsset': {
    payload: { projectRoot: string; assetId: string; currentPath?: string };
    result: RelinkAssetResult | null;
  };
}

export interface ProjectQueryMap {
  'project.getInitialState': {
    payload: undefined;
    result: ProjectSessionSnapshot;
  };
  'project.loadAnalysis': {
    payload: string;
    result: AnalysisFile | null;
  };
}

export interface ProjectEventMap {
  'project.recentProjectsChanged': string[];
}
