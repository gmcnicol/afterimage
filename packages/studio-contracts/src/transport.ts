import type { DiagnosticsQueryMap } from './diagnostics.js';
import type { JobsCommandMap, JobsEventMap, JobsQueryMap } from './jobs.js';
import type { LibraryCommandMap, LibraryQueryMap } from './library.js';
import type { ProjectCommandMap, ProjectEventMap, ProjectQueryMap } from './project.js';
import type { ShellCommandMap, ShellQueryMap } from './shell.js';

export type StudioCommandMap =
  & ProjectCommandMap
  & LibraryCommandMap
  & JobsCommandMap
  & ShellCommandMap;

export type StudioQueryMap =
  & ProjectQueryMap
  & LibraryQueryMap
  & JobsQueryMap
  & DiagnosticsQueryMap
  & ShellQueryMap;

export type StudioEventMap =
  & JobsEventMap
  & ProjectEventMap;

export type StudioCommandRoute = keyof StudioCommandMap & string;
export type StudioQueryRoute = keyof StudioQueryMap & string;
export type StudioEventType = keyof StudioEventMap & string;

export type StudioInvokeEnvelope =
  | {
      [Route in StudioCommandRoute]: {
        kind: 'command';
        route: Route;
        payload: StudioCommandMap[Route]['payload'];
      }
    }[StudioCommandRoute]
  | {
      [Route in StudioQueryRoute]: {
        kind: 'query';
        route: Route;
        payload: StudioQueryMap[Route]['payload'];
      }
    }[StudioQueryRoute];

export interface StudioPreloadBridge {
  invoke<Route extends StudioCommandRoute>(
    kind: 'command',
    route: Route,
    payload: StudioCommandMap[Route]['payload']
  ): Promise<StudioCommandMap[Route]['result']>;
  invoke<Route extends StudioQueryRoute>(
    kind: 'query',
    route: Route,
    payload: StudioQueryMap[Route]['payload']
  ): Promise<StudioQueryMap[Route]['result']>;
  subscribe<EventType extends StudioEventType>(
    eventType: EventType,
    listener: (payload: StudioEventMap[EventType]) => void
  ): () => void;
}

export interface StudioClient {
  project: {
    getInitialState: () => Promise<ProjectQueryMap['project.getInitialState']['result']>;
    subscribeRecentProjects: (listener: (recentProjects: ProjectEventMap['project.recentProjectsChanged']) => void) => () => void;
    createProject: (options?: ProjectCommandMap['project.create']['payload']) => Promise<ProjectCommandMap['project.create']['result']>;
    openProject: () => Promise<ProjectCommandMap['project.open']['result']>;
    openProjectAt: (projectFilePath: string) => Promise<ProjectCommandMap['project.openAt']['result']>;
    removeRecentProject: (projectFilePath: string) => Promise<ProjectCommandMap['project.removeRecentProject']['result']>;
    saveProject: (input: ProjectCommandMap['project.save']['payload']) => Promise<ProjectCommandMap['project.save']['result']>;
    saveProjectAs: (input: ProjectCommandMap['project.saveAs']['payload']) => Promise<ProjectCommandMap['project.saveAs']['result']>;
    duplicateProject: (input: ProjectCommandMap['project.duplicate']['payload']) => Promise<ProjectCommandMap['project.duplicate']['result']>;
    revealProjectFolder: (projectFilePath: string) => Promise<ProjectCommandMap['project.revealFolder']['result']>;
    loadAnalysis: (analysisPath: string) => Promise<ProjectQueryMap['project.loadAnalysis']['result']>;
    importMedia: (projectRoot?: string) => Promise<ProjectCommandMap['project.importMedia']['result']>;
    importMusic: (projectRoot?: string) => Promise<ProjectCommandMap['project.importMusic']['result']>;
    importTransitionMasks: (projectRoot?: string) => Promise<ProjectCommandMap['project.importTransitionMasks']['result']>;
    importTransitionOverlays: (projectRoot?: string) => Promise<ProjectCommandMap['project.importTransitionOverlays']['result']>;
    relinkAsset: (input: ProjectCommandMap['project.relinkAsset']['payload']) => Promise<ProjectCommandMap['project.relinkAsset']['result']>;
    importCueFile: () => Promise<ProjectCommandMap['project.importCueFile']['result']>;
  };
  library: {
    addRoot: (input: LibraryCommandMap['library.addRoot']['payload']) => Promise<LibraryCommandMap['library.addRoot']['result']>;
    removeRoot: (rootId: string) => Promise<LibraryCommandMap['library.removeRoot']['result']>;
    rescanRoot: (rootId: string) => Promise<LibraryCommandMap['library.rescanRoot']['result']>;
    rescanAll: () => Promise<LibraryCommandMap['library.rescanAll']['result']>;
    clearAndRescanAll: () => Promise<LibraryCommandMap['library.clearAndRescanAll']['result']>;
    listRoots: () => Promise<LibraryQueryMap['library.listRoots']['result']>;
    listDirectories: (rootId?: string) => Promise<LibraryQueryMap['library.listDirectories']['result']>;
    searchAssets: (input?: LibraryQueryMap['library.searchAssets']['payload']) => Promise<LibraryQueryMap['library.searchAssets']['result']>;
    importAssets: (input: LibraryCommandMap['library.importAssets']['payload']) => Promise<LibraryCommandMap['library.importAssets']['result']>;
    removeAssets: (input: LibraryCommandMap['library.removeAssets']['payload']) => Promise<LibraryCommandMap['library.removeAssets']['result']>;
  };
  jobs: {
    list: () => Promise<JobsQueryMap['jobs.list']['result']>;
    subscribe: (listener: (jobs: JobsEventMap['jobs.updated']) => void) => () => void;
    runAnalysis: (input: JobsCommandMap['jobs.runAnalysis']['payload']) => Promise<JobsCommandMap['jobs.runAnalysis']['result']>;
    runPreview: (input: JobsCommandMap['jobs.runPreview']['payload']) => Promise<JobsCommandMap['jobs.runPreview']['result']>;
    runExport: (input: JobsCommandMap['jobs.runExport']['payload']) => Promise<JobsCommandMap['jobs.runExport']['result']>;
    cancel: (jobId: string) => Promise<JobsCommandMap['jobs.cancel']['result']>;
    retry: (jobId: string) => Promise<JobsCommandMap['jobs.retry']['result']>;
  };
  diagnostics: {
    getReport: (input?: DiagnosticsQueryMap['diagnostics.getReport']['payload']) => Promise<DiagnosticsQueryMap['diagnostics.getReport']['result']>;
    getLogs: () => Promise<DiagnosticsQueryMap['diagnostics.getLogs']['result']>;
  };
  shell: {
    revealPath: (path: string) => Promise<ShellCommandMap['shell.revealPath']['result']>;
    getRuntimeInfo: () => Promise<ShellQueryMap['shell.getRuntimeInfo']['result']>;
  };
}
