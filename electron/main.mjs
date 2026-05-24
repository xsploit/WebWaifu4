import { app, BrowserWindow, Menu, ipcMain, shell, screen } from 'electron';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const backendPort = String(process.env.ELECTRON_BOT_PORT || process.env.BOT_PORT || '8797');
const devServerUrl = (process.env.ELECTRON_DEV_SERVER_URL || '').trim();
const externalBackend = process.env.ELECTRON_BACKEND_EXTERNAL === 'true';
const allowedWindowModes = new Set(['editor', 'desktop', 'overlay']);

let mainWindow = null;
let staticServer = null;
let windowMode = readInitialWindowMode();
let clickThrough = false;

app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function readInitialWindowMode() {
  const argMode = process.argv
    .find((arg) => arg.startsWith('--window-mode='))
    ?.split('=')
    .slice(1)
    .join('=');
  const mode = (argMode || process.env.ELECTRON_WINDOW_MODE || 'editor').toLowerCase();
  return allowedWindowModes.has(mode) ? mode : 'editor';
}

function getWindowOptions(mode) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  const transparent = mode !== 'editor';
  const overlay = mode === 'overlay';

  return {
    width: overlay ? Math.round(workArea.width * 0.42) : Math.min(1480, workArea.width),
    height: overlay ? Math.round(workArea.height * 0.72) : Math.min(960, workArea.height),
    minWidth: overlay ? 320 : 1040,
    minHeight: overlay ? 360 : 720,
    x: overlay ? workArea.x + workArea.width - Math.round(workArea.width * 0.42) - 24 : undefined,
    y: overlay ? workArea.y + 24 : undefined,
    title: 'WebWaifu 4',
    backgroundColor: transparent ? '#00000000' : '#02040a',
    frame: !transparent,
    transparent,
    hasShadow: !transparent,
    resizable: true,
    fullscreenable: true,
    skipTaskbar: overlay,
    alwaysOnTop: transparent,
    useContentSize: false,
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(appRoot, 'electron', 'preload.mjs'),
      sandbox: false,
    },
  };
}

async function startBackendIfNeeded() {
  if (externalBackend) {
    return;
  }

  process.env.BOT_PORT = backendPort;
  process.env.TWITCH_MOCK ??= 'true';
  process.env.VITE_BOT_PORT ??= backendPort;

  const serverEntry = path.join(appRoot, 'server', 'dist', 'index.js');
  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Missing compiled backend: ${serverEntry}. Run npm run build first.`);
  }

  await import(pathToFileURL(serverEntry).href);
}

function startStaticServer() {
  if (devServerUrl) {
    return Promise.resolve(devServerUrl);
  }

  const distDir = path.join(appRoot, 'dist');
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error(
      `Missing built UI: ${path.join(distDir, 'index.html')}. Run npm run build first.`,
    );
  }

  staticServer = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    const safePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '') || 'index.html';
    const candidate = path.resolve(distDir, safePath);
    const insideDist = candidate === distDir || candidate.startsWith(`${distDir}${path.sep}`);
    const filePath =
      insideDist && fs.existsSync(candidate) ? candidate : path.join(distDir, 'index.html');
    const stream = fs.createReadStream(filePath);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', getContentType(filePath));
    stream.on('error', () => {
      response.writeHead(404);
      response.end('Not found');
    });
    stream.pipe(response);
  });

  return new Promise((resolve, reject) => {
    staticServer?.once('error', reject);
    staticServer?.listen(0, '127.0.0.1', () => {
      const address = staticServer?.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Desktop static server did not expose a TCP address.'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.vrm': 'model/gltf-binary',
      '.vrma': 'model/gltf-binary',
      '.wasm': 'application/wasm',
    }[ext] || 'application/octet-stream'
  );
}

function buildRendererUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set('desktop', '1');
  url.searchParams.set('desktopMode', windowMode);
  url.searchParams.set('botPort', backendPort);
  return url.toString();
}

async function createWindow() {
  await startBackendIfNeeded();
  const rendererBaseUrl = await startStaticServer();

  mainWindow = new BrowserWindow(getWindowOptions(windowMode));
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url);
    const current = new URL(mainWindow?.webContents.getURL() || rendererBaseUrl);
    if (target.origin !== current.origin) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  await mainWindow.loadURL(buildRendererUrl(rendererBaseUrl));
  applyLiveWindowOptions();
  installMenu();
}

function applyLiveWindowOptions() {
  if (!mainWindow) {
    return;
  }
  const transparent = windowMode !== 'editor';
  mainWindow.setAlwaysOnTop(transparent, transparent ? 'floating' : 'normal');
  mainWindow.setSkipTaskbar(windowMode === 'overlay');
  mainWindow.setIgnoreMouseEvents(clickThrough, { forward: true });
  mainWindow.webContents.send('desktop-window-mode-changed', {
    backendPort,
    clickThrough,
    mode: windowMode,
  });
}

function relaunchWithMode(mode) {
  if (!allowedWindowModes.has(mode) || mode === windowMode) {
    return;
  }
  app.relaunch({
    args: [
      ...process.argv.slice(1).filter((arg) => !arg.startsWith('--window-mode=')),
      `--window-mode=${mode}`,
    ],
  });
  app.exit(0);
}

function installMenu() {
  const template = [
    {
      label: 'WebWaifu 4',
      submenu: [
        { label: 'Relaunch as Editor', click: () => relaunchWithMode('editor') },
        { label: 'Relaunch as Desktop Transparent', click: () => relaunchWithMode('desktop') },
        { label: 'Relaunch as Overlay', click: () => relaunchWithMode('overlay') },
        { type: 'separator' },
        {
          label: 'Click Through Overlay',
          type: 'checkbox',
          checked: clickThrough,
          click: (item) => {
            clickThrough = item.checked;
            applyLiveWindowOptions();
          },
        },
        { role: 'toggleDevTools' },
        { role: 'reload' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('desktop:get-runtime', () => ({
  backendPort,
  clickThrough,
  mode: windowMode,
}));

ipcMain.handle('desktop:set-click-through', (_event, enabled) => {
  clickThrough = Boolean(enabled);
  applyLiveWindowOptions();
  return { backendPort, clickThrough, mode: windowMode };
});

ipcMain.handle('desktop:relaunch-window-mode', (_event, mode) => {
  relaunchWithMode(String(mode));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  staticServer?.close();
});

app
  .whenReady()
  .then(createWindow)
  .catch((error) => {
    console.error('[desktop] failed to start', error);
    app.quit();
  });
