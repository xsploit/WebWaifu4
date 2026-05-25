import { contextBridge, ipcRenderer } from 'electron';

const params = new URLSearchParams(globalThis.location.search);
const initialMode = params.get('desktopMode') || 'editor';
const initialBackendPort = params.get('botPort') || '8797';

function applyDocumentFlags(mode = initialMode) {
  document.documentElement.dataset.webwaifuDesktop = 'true';
  document.documentElement.dataset.webwaifuWindowMode = mode;
}

applyDocumentFlags(initialMode);
globalThis.addEventListener('DOMContentLoaded', () => applyDocumentFlags(initialMode));

contextBridge.exposeInMainWorld('webWaifuDesktop', {
  backendPort: initialBackendPort,
  isDesktop: true,
  mode: initialMode,
  getRuntime: () => ipcRenderer.invoke('desktop:get-runtime'),
  relaunchWindowMode: (mode) => ipcRenderer.invoke('desktop:relaunch-window-mode', mode),
  setClickThrough: (enabled) => ipcRenderer.invoke('desktop:set-click-through', enabled),
  onRuntimeChanged: (callback) => {
    const listener = (_event, runtime) => {
      if (runtime?.mode) {
        applyDocumentFlags(runtime.mode);
      }
      callback(runtime);
    };
    ipcRenderer.on('desktop-window-mode-changed', listener);
    return () => ipcRenderer.off('desktop-window-mode-changed', listener);
  },
  onSceneBackgroundModeRequested: (callback) => {
    const listener = (_event, mode) => callback(mode);
    ipcRenderer.on('desktop-scene-background-mode', listener);
    return () => ipcRenderer.off('desktop-scene-background-mode', listener);
  },
  onOpenAboutRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('desktop-open-about', listener);
    return () => ipcRenderer.off('desktop-open-about', listener);
  },
});
