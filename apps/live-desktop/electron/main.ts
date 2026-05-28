import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import type { LiveInvokeEnvelope, LiveQueryMap } from '@afterimage/studio-contracts';
import { createLiveSessionService } from './services/live-session-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function getStartupProjectPath(argv: string[]): string | undefined {
  const projectFlagIndex = argv.indexOf('--project');
  if (projectFlagIndex === -1) {
    return undefined;
  }

  const projectPath = argv[projectFlagIndex + 1];
  return projectPath && !projectPath.startsWith('--') ? projectPath : undefined;
}

const liveSessionService = createLiveSessionService({
  projectPath: getStartupProjectPath(process.argv)
});

const queries = {
  'live.getSession': (_payload: undefined) => liveSessionService.getSession()
} satisfies {
  [Route in keyof LiveQueryMap & string]: (
    payload: LiveQueryMap[Route]['payload']
  ) => Promise<LiveQueryMap[Route]['result']> | LiveQueryMap[Route]['result'];
};

async function handleLiveInvoke(envelope: LiveInvokeEnvelope): Promise<unknown> {
  if (envelope.kind !== 'query') {
    throw new Error(`Unknown Live route kind: ${(envelope as { kind?: unknown }).kind}`);
  }

  const handler = queries[envelope.route];
  if (!handler) {
    throw new Error(`Unknown Live query route: ${envelope.route}`);
  }

  return handler(envelope.payload as never);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#101216',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  const rendererUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5174';

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL || !app.isPackaged) {
    void mainWindow.loadURL(rendererUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  void mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('live:invoke', async (_event, envelope: LiveInvokeEnvelope) => handleLiveInvoke(envelope));
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
