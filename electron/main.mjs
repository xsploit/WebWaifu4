import {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  net as electronNet,
  protocol,
  shell,
  screen,
} from 'electron';
import http from 'node:http';
import fs from 'node:fs';
import nodeNet from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
let backendPort = normalizePort(process.env.ELECTRON_BOT_PORT || process.env.BOT_PORT || '8797');
const devServerUrl = (process.env.ELECTRON_DEV_SERVER_URL || '').trim();
const externalBackend = process.env.ELECTRON_BACKEND_EXTERNAL === 'true';
const allowedWindowModes = new Set(['editor', 'desktop', 'overlay']);

let mainWindow = null;
let windowMode = readInitialWindowMode();
let clickThrough = false;
let appProtocolRegistered = false;

app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (
  process.argv.includes('--transparent-software') ||
  process.env.ELECTRON_TRANSPARENT_SOFTWARE === 'true'
) {
  app.disableHardwareAcceleration();
}
protocol.registerSchemesAsPrivileged([
  {
    privileges: {
      bypassCSP: false,
      corsEnabled: true,
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true,
    },
    scheme: 'webwaifu',
  },
]);

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
    backgroundMaterial: 'none',
    frame: !transparent,
    transparent,
    hasShadow: !transparent,
    resizable: !transparent,
    fullscreenable: !transparent,
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

function normalizePort(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return String(Number.isFinite(parsed) && parsed > 0 && parsed < 65536 ? parsed : 8797);
}

function isBackendHealthy(port) {
  return new Promise((resolve) => {
    const request = http.get(
      {
        host: '127.0.0.1',
        path: '/health',
        port,
        timeout: 1200,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      },
    );
    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}

function canListenOnPort(port) {
  return new Promise((resolve) => {
    const probe = nodeNet.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => {
      probe.close(() => resolve(true));
    });
    probe.listen(Number(port), '127.0.0.1');
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 50 && port < 65536; port += 1) {
    if (await canListenOnPort(String(port))) {
      return String(port);
    }
  }
  throw new Error(`No available backend port near ${startPort}.`);
}

async function waitForBackendHealth(port) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isBackendHealthy(port)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Local backend did not become healthy on port ${port}.`);
}

async function startBackendIfNeeded() {
  if (externalBackend) {
    return;
  }

  if (!(await canListenOnPort(backendPort))) {
    const requestedPort = backendPort;
    backendPort = await findAvailablePort(Number.parseInt(requestedPort, 10) + 1);
    console.warn(
      `[desktop] port ${requestedPort} is busy; starting this app backend on ${backendPort}`,
    );
  }

  process.env.BOT_PORT = backendPort;
  process.env.TWITCH_MOCK ??= 'true';
  process.env.VITE_BOT_PORT ??= backendPort;

  const serverEntry = path.join(appRoot, 'server', 'dist', 'index.js');
  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Missing compiled backend: ${serverEntry}. Run npm run build first.`);
  }

  await import(pathToFileURL(serverEntry).href);
  await waitForBackendHealth(backendPort);
}

function resolveRendererFile(requestUrl) {
  const distDir = path.join(appRoot, 'dist');
  const url = new URL(requestUrl);
  const safePath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const candidate = path.resolve(distDir, safePath);
  const insideDist = candidate === distDir || candidate.startsWith(`${distDir}${path.sep}`);
  return insideDist && fs.existsSync(candidate) ? candidate : path.join(distDir, 'index.html');
}

function registerRendererProtocol() {
  if (devServerUrl) {
    return Promise.resolve(devServerUrl);
  }

  const distDir = path.join(appRoot, 'dist');
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error(
      `Missing built UI: ${path.join(distDir, 'index.html')}. Run npm run build first.`,
    );
  }

  if (!appProtocolRegistered) {
    protocol.handle('webwaifu', (request) => {
      const filePath = resolveRendererFile(request.url);
      return electronNet.fetch(pathToFileURL(filePath).toString());
    });
    appProtocolRegistered = true;
  }

  return Promise.resolve('webwaifu://app/index.html');
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
  const rendererBaseUrl = await registerRendererProtocol();

  mainWindow = new BrowserWindow(getWindowOptions(windowMode));
  mainWindow.setBackgroundColor(windowMode === 'editor' ? '#02040a' : '#00000000');
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
      label: 'File',
      submenu: [
        { label: 'Open Editor Window', click: () => relaunchWithMode('editor') },
        { label: 'Open Desktop Transparent Window', click: () => relaunchWithMode('desktop') },
        { label: 'Open OBS Overlay Window', click: () => relaunchWithMode('overlay') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
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
      ],
    },
    {
      label: 'Background',
      submenu: [
        {
          label: 'Transparent Scene',
          click: () => {
            mainWindow?.webContents.send('desktop-scene-background-mode', 'transparent');
          },
        },
        {
          label: 'Chroma Key Scene',
          click: () => {
            mainWindow?.webContents.send('desktop-scene-background-mode', 'chroma');
          },
        },
        {
          label: 'Character Background Scene',
          click: () => {
            mainWindow?.webContents.send('desktop-scene-background-mode', 'persona');
          },
        },
        { type: 'separator' },
        {
          label: 'Transparent Desktop Window',
          click: () => {
            mainWindow?.webContents.send('desktop-scene-background-mode', 'transparent');
            relaunchWithMode('desktop');
          },
        },
        {
          label: 'Transparent OBS Overlay Window',
          click: () => {
            mainWindow?.webContents.send('desktop-scene-background-mode', 'transparent');
            relaunchWithMode('overlay');
          },
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About WebWaifu 4',
          click: () => {
            mainWindow?.webContents.send('desktop-open-about');
          },
        },
        {
          label: 'Open Project on GitHub',
          click: () => {
            void shell.openExternal('https://github.com/xsploit/WebWaifu4');
          },
        },
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  mainWindow?.setMenu(menu);
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

app
  .whenReady()
  .then(createWindow)
  .catch((error) => {
    console.error('[desktop] failed to start', error);
    app.quit();
  });
