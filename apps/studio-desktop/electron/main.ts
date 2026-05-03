import path from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createRouteRegistry, type RouteHandlerMap } from '@afterimage/studio-bus';
import type {
  StudioCommandMap,
  StudioEventMap,
  StudioEventType,
  StudioInvokeEnvelope,
  StudioQueryMap
} from '@afterimage/studio-contracts';
import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron';
import type {
  DesktopJob,
  ProjectSessionSnapshot,
} from '@afterimage/studio-contracts';
import { createDiagnosticsService } from './services/diagnostics-service.js';
import { createJobManager } from './services/job-manager.js';
import { createLogger } from './services/logger.js';
import { createLibraryService } from './services/library-service.js';
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
  recentProjectsPath: path.join(app.getPath('userData'), 'recent-projects.json'),
  onRecentProjectsChanged(recentProjects) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('studio:event', {
        type: 'project.recentProjectsChanged',
        payload: recentProjects
      } satisfies StudioEventEnvelope<'project.recentProjectsChanged'>);
    }
  }
});
const diagnosticsService = createDiagnosticsService({ logger });
const jobManager = createJobManager({
  logger,
  onJobsChanged(jobs: DesktopJob[]) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('studio:event', {
        type: 'jobs.updated',
        payload: jobs
      } satisfies StudioEventEnvelope<'jobs.updated'>);
    }
  }
});
const libraryService = createLibraryService({
  dialog,
  logger,
  databasePath: path.join(app.getPath('userData'), 'media-library.sqlite'),
  dataRoot: path.join(app.getPath('userData'), 'media-library'),
  runLibraryJob: (input) => {
    jobManager.runLibraryJob(input);
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

type StudioEventEnvelope<EventType extends StudioEventType = StudioEventType> = {
  type: EventType;
  payload: StudioEventMap[EventType];
};

function createStudioRouteRegistry() {
  const commands: RouteHandlerMap<StudioCommandMap> = {
    'project.create': (options) => projectService.createProject(options),
    'project.open': () => projectService.openProject(),
    'project.openAt': (projectFilePath) => projectService.openProjectAt(projectFilePath),
    'project.removeRecentProject': (projectFilePath) => projectService.removeRecentProject(projectFilePath),
    'project.save': (input) => projectService.saveProject(input),
    'project.saveAs': (input) => projectService.saveProjectAs(input),
    'project.duplicate': (input) => projectService.duplicateProject(input),
    'project.revealFolder': (projectFilePath) => projectService.revealProjectFolder(projectFilePath),
    'project.importMedia': (projectRoot) => projectService.importMedia(projectRoot),
    'project.importMusic': (projectRoot) => projectService.importMusic(projectRoot),
    'project.importTransitionMasks': (projectRoot) => projectService.importTransitionMasks(projectRoot),
    'project.importTransitionOverlays': (projectRoot) => projectService.importTransitionOverlays(projectRoot),
    'project.relinkAsset': (input) => projectService.relinkAsset(input),
    'project.importCueFile': () => projectService.importCueFile(),
    'project.applyOperation': (input) => projectService.applyProjectOperation(input),
    'project.materializeAnalysisCuts': (input) => projectService.materializeAnalysisCuts(input),
    'library.addRoot': (input) => libraryService.addRoot(input),
    'library.removeRoot': (rootId) => libraryService.removeRoot(rootId),
    'library.rescanRoot': (rootId) => libraryService.rescanRoot(rootId),
    'library.rescanAll': () => libraryService.rescanAll(),
    'library.clearAndRescanAll': () => libraryService.clearAndRescanAll(),
    'library.importAssets': (input) => libraryService.importAssets(input),
    'library.removeAssets': (input) => libraryService.removeAssets(input),
    'library.importAssetToProject': (input) => libraryService.importAssetToProject(input, projectService.commitProjectMutation),
    'jobs.runAnalysis': (input) => jobManager.runAnalysis(input),
    'jobs.runPreview': (input) => jobManager.runPreview(input),
    'jobs.runExport': (input) => jobManager.runExport(input),
    'jobs.cancel': (jobId) => jobManager.cancel(jobId),
    'jobs.retry': (jobId) => jobManager.retry(jobId),
    'shell.revealPath': (targetPath) => shell.showItemInFolder(targetPath)
  };

  const queries: RouteHandlerMap<StudioQueryMap> = {
    'project.getInitialState': async () => {
      if (!startupProjectPath) {
        return projectService.getInitialState();
      }

      if (!startupSessionPromise) {
        startupSessionPromise = projectService.openProjectAt(startupProjectPath);
      }

      return startupSessionPromise;
    },
    'project.loadAnalysis': (analysisPath) => projectService.loadAnalysis(analysisPath),
    'library.listRoots': () => libraryService.listRoots(),
    'library.listDirectories': (rootId) => libraryService.listDirectories(rootId),
    'library.searchAssets': (input) => libraryService.searchAssets(input),
    'jobs.list': () => jobManager.list(),
    'diagnostics.getReport': (input) => diagnosticsService.getReport(input),
    'diagnostics.getLogs': () => logger.list(),
    'shell.getRuntimeInfo': () => ({
      platform: process.platform,
      node: process.version,
      electron: process.versions.electron ?? 'unknown'
    })
  };

  return createRouteRegistry(commands, queries);
}

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
  const buildFullResponse = () => new Response(Readable.toWeb(createReadStream(absolutePath)), {
    status: 200,
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(fileStat.size),
      'Content-Type': contentType,
      'Cache-Control': 'no-store'
    }
  });

  if (rangeHeader) {
    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (!match) {
      return buildFullResponse();
    }

    const start = match[1] ? Number.parseInt(match[1], 10) : 0;
    const end = match[2] ? Number.parseInt(match[2], 10) : fileStat.size - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start || end >= fileStat.size) {
      return buildFullResponse();
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

  return buildFullResponse();
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

  const routeRegistry = createStudioRouteRegistry();
  ipcMain.handle('studio:invoke', async (_event, envelope: StudioInvokeEnvelope) => routeRegistry.handle(envelope));

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
