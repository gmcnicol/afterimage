import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DesktopApi, DesktopJob } from '../src/shared/contracts.js';

const api: DesktopApi = {
  project: {
    getInitialState: () => ipcRenderer.invoke('project:getInitialState'),
    createProject: (options) => ipcRenderer.invoke('project:create', options),
    openProject: () => ipcRenderer.invoke('project:open'),
    openProjectAt: (projectFilePath) => ipcRenderer.invoke('project:openAt', projectFilePath),
    saveProject: (input) => ipcRenderer.invoke('project:save', input),
    saveProjectAs: (input) => ipcRenderer.invoke('project:saveAs', input),
    duplicateProject: (input) => ipcRenderer.invoke('project:duplicate', input),
    revealProjectFolder: (projectFilePath) => ipcRenderer.invoke('project:revealFolder', projectFilePath),
    loadAnalysis: (analysisPath) => ipcRenderer.invoke('project:loadAnalysis', analysisPath),
    importMedia: (projectRoot) => ipcRenderer.invoke('project:importMedia', projectRoot),
    importMusic: (projectRoot) => ipcRenderer.invoke('project:importMusic', projectRoot),
    relinkAsset: (input) => ipcRenderer.invoke('project:relinkAsset', input)
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
