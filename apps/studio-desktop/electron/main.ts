import path from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell, type IpcMainInvokeEvent } from 'electron';
import type {
  DesktopJob,
  ProjectSessionSnapshot,
  RunAnalysisRequest,
  RunExportRequest,
  RunPreviewRequest,
  SaveProjectRequest
} from '../src/shared/contracts.js';
import { createDiagnosticsService } from './services/diagnostics-service.js';
import { createJobManager } from './services/job-manager.js';
import { createLogger } from './services/logger.js';
import { createProjectService } from './services/project-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

protocol.registerSchemesAsPrivileged([
  {
        scheme: 'afterimage-file',
        privileges: {
          standard: true,
          secure: true,
          bypassCSP: true,
          corsEnabled: true,
          supportFetchAPI: true,
          stream: true
        }
  }
]);

let mainWindow: BrowserWindow | null = null;

const logger = createLogger();
const projectService = createProjectService({
  dialog,
  shell,
  logger,
  recentProjectsPath: path.join(app.getPath('userData'), 'recent-projects.json')
});
const diagnosticsService = createDiagnosticsService({ logger });
const jobManager = createJobManager({
  logger,
  onJobsChanged(jobs: DesktopJob[]) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('jobs:updated', jobs);
    }
  }
});

function getStartupProjectPath(argv: string[]): string | undefined {
  const projectFlagIndex = argv.indexOf('--project');
  if (projectFlagIndex === -1) {
    return undefined;
  }

  return argv[projectFlagIndex + 1];
}

const startupProjectPath = getStartupProjectPath(process.argv);
let startupSessionPromise: Promise<ProjectSessionSnapshot> | undefined;

function getContentType(absolutePath: string): string {
  const extension = path.extname(absolutePath).toLowerCase();
  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

async function handleLocalAssetRequest(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const absolutePath = requestUrl.host && requestUrl.host !== 'local'
    ? decodeURIComponent(`/${requestUrl.host}${requestUrl.pathname}`)
    : decodeURIComponent(requestUrl.pathname);

  if (!path.isAbsolute(absolutePath)) {
    return new Response('Invalid path.', { status: 400 });
  }

  const fileStat = await stat(absolutePath);
  const rangeHeader = request.headers.get('range');
  const contentType = getContentType(absolutePath);

  if (rangeHeader) {
    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (!match) {
      return new Response('Invalid range.', { status: 416 });
    }

    const start = match[1] ? Number.parseInt(match[1], 10) : 0;
    const end = match[2] ? Number.parseInt(match[2], 10) : fileStat.size - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start || end >= fileStat.size) {
      return new Response('Invalid range.', {
        status: 416,
        headers: {
          'Content-Range': `bytes */${fileStat.size}`
        }
      });
    }

    return new Response(Readable.toWeb(createReadStream(absolutePath, { start, end })), {
      status: 206,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
        'Content-Type': contentType,
        'Cache-Control': 'no-store'
      }
    });
  }

  return new Response(Readable.toWeb(createReadStream(absolutePath)), {
    status: 200,
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(fileStat.size),
      'Content-Type': contentType,
      'Cache-Control': 'no-store'
    }
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1200,
    minHeight: 820,
    backgroundColor: '#0b0d12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  const rendererUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(rendererUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  void mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  protocol.handle('afterimage-file', handleLocalAssetRequest);

  ipcMain.handle('project:getInitialState', async () => {
    if (!startupProjectPath) {
      return projectService.getInitialState();
    }

    if (!startupSessionPromise) {
      startupSessionPromise = projectService.openProjectAt(startupProjectPath);
    }

    return startupSessionPromise;
  });
  ipcMain.handle('project:create', async (_event: IpcMainInvokeEvent, options?: { name?: string }) => projectService.createProject(options));
  ipcMain.handle('project:open', async () => projectService.openProject());
  ipcMain.handle('project:openAt', async (_event: IpcMainInvokeEvent, projectFilePath: string) => projectService.openProjectAt(projectFilePath));
  ipcMain.handle('project:save', async (_event: IpcMainInvokeEvent, input: SaveProjectRequest) => projectService.saveProject(input));
  ipcMain.handle('project:saveAs', async (_event: IpcMainInvokeEvent, input: SaveProjectRequest) => projectService.saveProjectAs(input));
  ipcMain.handle('project:duplicate', async (_event: IpcMainInvokeEvent, input: SaveProjectRequest) => projectService.duplicateProject(input));
  ipcMain.handle('project:revealFolder', async (_event: IpcMainInvokeEvent, projectFilePath: string) => projectService.revealProjectFolder(projectFilePath));
  ipcMain.handle('project:loadAnalysis', async (_event: IpcMainInvokeEvent, analysisPath: string) => projectService.loadAnalysis(analysisPath));
  ipcMain.handle('project:importMedia', async (_event: IpcMainInvokeEvent, projectRoot?: string) => projectService.importMedia(projectRoot));
  ipcMain.handle('project:importMusic', async (_event: IpcMainInvokeEvent, projectRoot?: string) => projectService.importMusic(projectRoot));
  ipcMain.handle(
    'project:relinkAsset',
    async (_event: IpcMainInvokeEvent, input: { projectRoot: string; assetId: string; currentPath?: string }) => projectService.relinkAsset(input)
  );

  ipcMain.handle('jobs:list', async () => jobManager.list());
  ipcMain.handle('jobs:runAnalysis', async (_event: IpcMainInvokeEvent, input: RunAnalysisRequest) => jobManager.runAnalysis(input));
  ipcMain.handle('jobs:runPreview', async (_event: IpcMainInvokeEvent, input: RunPreviewRequest) => jobManager.runPreview(input));
  ipcMain.handle('jobs:runExport', async (_event: IpcMainInvokeEvent, input: RunExportRequest) => jobManager.runExport(input));
  ipcMain.handle('jobs:cancel', async (_event: IpcMainInvokeEvent, jobId: string) => jobManager.cancel(jobId));
  ipcMain.handle('jobs:retry', async (_event: IpcMainInvokeEvent, jobId: string) => jobManager.retry(jobId));

  ipcMain.handle(
    'diagnostics:getReport',
    async (_event: IpcMainInvokeEvent, input?: { project?: RunAnalysisRequest['project']; projectRoot?: string }) => diagnosticsService.getReport(input)
  );
  ipcMain.handle('diagnostics:getLogs', async () => logger.list());
  ipcMain.handle('shell:revealPath', async (_event: IpcMainInvokeEvent, targetPath: string) => shell.showItemInFolder(targetPath));
  ipcMain.handle('shell:getRuntimeInfo', async () => ({
    platform: process.platform,
    node: process.version,
    electron: process.versions.electron ?? 'unknown'
  }));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
