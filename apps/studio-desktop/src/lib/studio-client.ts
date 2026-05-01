import type {
  DesktopJob,
  DiagnosticsSnapshot,
  LibraryAsset,
  LibraryDirectory,
  LibraryRoot,
  LibrarySearchRequest,
  LibrarySearchResult,
  LogEntry,
  ProjectSessionSnapshot,
  RelinkAssetResult,
  RunAnalysisRequest,
  RunExportRequest,
  RunPreviewRequest,
  SaveProjectRequest,
  StudioClient,
  StudioPreloadBridge
} from '@afterimage/studio-contracts';

export type {
  DesktopJob,
  DiagnosticsSnapshot,
  LibraryAsset,
  LibraryDirectory,
  LibraryRoot,
  LibrarySearchRequest,
  LibrarySearchResult,
  LogEntry,
  ProjectSessionSnapshot,
  RelinkAssetResult,
  RunAnalysisRequest,
  RunExportRequest,
  RunPreviewRequest,
  SaveProjectRequest,
  StudioClient
} from '@afterimage/studio-contracts';

declare global {
  interface Window {
    afterimage?: StudioPreloadBridge;
  }
}

let cachedStudioClient: StudioClient | undefined;

function getBridge(): StudioPreloadBridge {
  if (!window.afterimage) {
    throw new Error('Afterimage Studio preload bridge is unavailable.');
  }

  return window.afterimage;
}

export function createStudioClient(bridge: StudioPreloadBridge): StudioClient {
  return {
    project: {
      getInitialState: () => bridge.invoke('query', 'project.getInitialState', undefined),
      subscribeRecentProjects: (listener) => bridge.subscribe('project.recentProjectsChanged', listener),
      createProject: (options) => bridge.invoke('command', 'project.create', options),
      openProject: () => bridge.invoke('command', 'project.open', undefined),
      openProjectAt: (projectFilePath) => bridge.invoke('command', 'project.openAt', projectFilePath),
      removeRecentProject: (projectFilePath) => bridge.invoke('command', 'project.removeRecentProject', projectFilePath),
      saveProject: (input) => bridge.invoke('command', 'project.save', input),
      saveProjectAs: (input) => bridge.invoke('command', 'project.saveAs', input),
      duplicateProject: (input) => bridge.invoke('command', 'project.duplicate', input),
      revealProjectFolder: (projectFilePath) => bridge.invoke('command', 'project.revealFolder', projectFilePath),
      loadAnalysis: (analysisPath) => bridge.invoke('query', 'project.loadAnalysis', analysisPath),
      importMedia: (projectRoot) => bridge.invoke('command', 'project.importMedia', projectRoot),
      importMusic: (projectRoot) => bridge.invoke('command', 'project.importMusic', projectRoot),
      importTransitionMasks: (projectRoot) => bridge.invoke('command', 'project.importTransitionMasks', projectRoot),
      importTransitionOverlays: (projectRoot) => bridge.invoke('command', 'project.importTransitionOverlays', projectRoot),
      relinkAsset: (input) => bridge.invoke('command', 'project.relinkAsset', input)
    },
    library: {
      addRoot: (input) => bridge.invoke('command', 'library.addRoot', input),
      removeRoot: (rootId) => bridge.invoke('command', 'library.removeRoot', rootId),
      rescanRoot: (rootId) => bridge.invoke('command', 'library.rescanRoot', rootId),
      rescanAll: () => bridge.invoke('command', 'library.rescanAll', undefined),
      clearAndRescanAll: () => bridge.invoke('command', 'library.clearAndRescanAll', undefined),
      listRoots: () => bridge.invoke('query', 'library.listRoots', undefined),
      listDirectories: (rootId) => bridge.invoke('query', 'library.listDirectories', rootId),
      searchAssets: (input) => bridge.invoke('query', 'library.searchAssets', input),
      importAssets: (input) => bridge.invoke('command', 'library.importAssets', input),
      removeAssets: (input) => bridge.invoke('command', 'library.removeAssets', input)
    },
    jobs: {
      list: () => bridge.invoke('query', 'jobs.list', undefined),
      subscribe: (listener) => bridge.subscribe('jobs.updated', listener),
      runAnalysis: (input) => bridge.invoke('command', 'jobs.runAnalysis', input),
      runPreview: (input) => bridge.invoke('command', 'jobs.runPreview', input),
      runExport: (input) => bridge.invoke('command', 'jobs.runExport', input),
      cancel: (jobId) => bridge.invoke('command', 'jobs.cancel', jobId),
      retry: (jobId) => bridge.invoke('command', 'jobs.retry', jobId)
    },
    diagnostics: {
      getReport: (input) => bridge.invoke('query', 'diagnostics.getReport', input),
      getLogs: () => bridge.invoke('query', 'diagnostics.getLogs', undefined)
    },
    shell: {
      revealPath: (targetPath) => bridge.invoke('command', 'shell.revealPath', targetPath),
      getRuntimeInfo: () => bridge.invoke('query', 'shell.getRuntimeInfo', undefined)
    }
  };
}

export function getStudioClient(): StudioClient {
  cachedStudioClient ??= createStudioClient(getBridge());
  return cachedStudioClient;
}
