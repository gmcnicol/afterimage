import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DesktopApi, DesktopJob } from '../src/shared/contracts.js';

const api: DesktopApi = {
  project: {
    getInitialState: () => ipcRenderer.invoke('project:getInitialState'),
    subscribeRecentProjects: (listener) => {
      const handler = (_event: IpcRendererEvent, recentProjects: string[]) => listener(recentProjects);
      ipcRenderer.on('project:recentProjectsUpdated', handler);
      return () => {
        ipcRenderer.removeListener('project:recentProjectsUpdated', handler);
      };
    },
    createProject: (options) => ipcRenderer.invoke('project:create', options),
    openProject: () => ipcRenderer.invoke('project:open'),
    openProjectAt: (projectFilePath) => ipcRenderer.invoke('project:openAt', projectFilePath),
    removeRecentProject: (projectFilePath) => ipcRenderer.invoke('project:removeRecentProject', projectFilePath),
    saveProject: (input) => ipcRenderer.invoke('project:save', input),
    saveProjectAs: (input) => ipcRenderer.invoke('project:saveAs', input),
    duplicateProject: (input) => ipcRenderer.invoke('project:duplicate', input),
    revealProjectFolder: (projectFilePath) => ipcRenderer.invoke('project:revealFolder', projectFilePath),
    loadAnalysis: (analysisPath) => ipcRenderer.invoke('project:loadAnalysis', analysisPath),
    importMedia: (projectRoot) => ipcRenderer.invoke('project:importMedia', projectRoot),
    importMusic: (projectRoot) => ipcRenderer.invoke('project:importMusic', projectRoot),
    importTransitionMasks: (projectRoot) => ipcRenderer.invoke('project:importTransitionMasks', projectRoot),
    importTransitionOverlays: (projectRoot) => ipcRenderer.invoke('project:importTransitionOverlays', projectRoot),
    relinkAsset: (input) => ipcRenderer.invoke('project:relinkAsset', input)
  },
  library: {
    addRoot: (input) => ipcRenderer.invoke('library:addRoot', input),
    removeRoot: (rootId) => ipcRenderer.invoke('library:removeRoot', rootId),
    rescanRoot: (rootId) => ipcRenderer.invoke('library:rescanRoot', rootId),
    rescanAll: () => ipcRenderer.invoke('library:rescanAll'),
    clearAndRescanAll: () => ipcRenderer.invoke('library:clearAndRescanAll'),
    listRoots: () => ipcRenderer.invoke('library:listRoots'),
    listDirectories: (rootId) => ipcRenderer.invoke('library:listDirectories', rootId),
    searchAssets: (input) => ipcRenderer.invoke('library:searchAssets', input),
    importAssets: (input) => ipcRenderer.invoke('library:importAssets', input),
    removeAssets: (input) => ipcRenderer.invoke('library:removeAssets', input)
  },
  jobs: {
    list: () => ipcRenderer.invoke('jobs:list'),
    subscribe: (listener) => {
      const handler = (_event: IpcRendererEvent, jobs: DesktopJob[]) => listener(jobs);
      ipcRenderer.on('jobs:updated', handler);
      return () => {
        ipcRenderer.removeListener('jobs:updated', handler);
      };
    },
    runAnalysis: (input) => ipcRenderer.invoke('jobs:runAnalysis', input),
    runPreview: (input) => ipcRenderer.invoke('jobs:runPreview', input),
    runExport: (input) => ipcRenderer.invoke('jobs:runExport', input),
    cancel: (jobId) => ipcRenderer.invoke('jobs:cancel', jobId),
    retry: (jobId) => ipcRenderer.invoke('jobs:retry', jobId)
  },
  diagnostics: {
    getReport: (input) => ipcRenderer.invoke('diagnostics:getReport', input),
    getLogs: () => ipcRenderer.invoke('diagnostics:getLogs')
  },
  shell: {
    revealPath: (targetPath) => ipcRenderer.invoke('shell:revealPath', targetPath),
    getRuntimeInfo: () => ipcRenderer.invoke('shell:getRuntimeInfo')
  }
};

contextBridge.exposeInMainWorld('afterimage', api);
