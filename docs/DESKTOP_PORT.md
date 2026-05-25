# WebWaifu 4 Desktop Port

This fork uses Electron first.

## Decision

Electron is the first desktop target because WebWaifu 4 depends heavily on Chromium-grade WebGL, Web Audio, WebSocket streaming, local media playback, and predictable HiDPI behavior. Electrobun stays worth revisiting later for smaller bundles, but this checkpoint favors the least risky renderer for VRM/OBS-style work.

## Runtime Shape

- `electron/main.mjs` starts the desktop window.
- In development, `npm run desktop:dev` starts Vite, the local backend, and Electron.
- In built mode, Electron imports `server/dist/index.js` and serves `dist/` through a tiny local static server.
- The React app still talks to the local backend at `http://127.0.0.1:8797`.
- Provider keys remain in the renderer's existing browser-local storage path and are sent to the local backend only for the current provider request.
- If the requested backend port already has a healthy WebWaifu `/health` endpoint, Electron reuses that backend instead of starting a second listener.
- If the requested backend port is busy but does not expose healthy WebWaifu `/health`, Electron picks the next available local port and passes that port to the renderer.

## Window Modes

- `editor`: normal framed setup window.
- `desktop`: frameless transparent window for desktop companion use.
- `overlay`: frameless transparent always-on-top window, with optional click-through from the Electron menu.

Switch modes from the Electron menu. Mode switching relaunches the app because window frame/transparent behavior is safest when selected at window creation time.

The renderer also shows a compact desktop control strip when running in Electron. It can relaunch
Editor/Desktop/Overlay, switch the scene between Transparent/Chroma/Painted, toggle click-through,
and open Background settings. This is intentional because frameless transparent windows do not show
normal native chrome, and Electron menus can be hard to discover in overlay-style windows.

Transparent mode requires both layers to agree:

- Electron must create the window with `transparent: true`, `frame: false`, transparent
  `backgroundColor`, and non-resizable transparent options.
- React/Three.js must render with transparent CSS and a transparent WebGL clear color.

Electron documents two important limitations: transparent windows are not safely resizable on some
platforms, and opening DevTools can make transparency stop rendering. If a GPU/compositor issue still
paints the window, launch with:

```powershell
$env:ELECTRON_TRANSPARENT_SOFTWARE='true'
npm run desktop:start -- --window-mode=desktop
```

There is also a standalone transparency harness:

```powershell
npm run desktop:test:transparent
npm run desktop:test:transparent:bare
npm run desktop:test:transparent:software
```

Use it before blaming the main app. The harness has Bare Alpha, Transparent, Green, Magenta, Blue,
and WebGL alpha modes. Bare Alpha is the strict pass-through test: no shaded panel, no swatch, no
canvas paint. If standalone Bare Alpha is still blue, the issue is Electron/Windows/GPU
composition. If standalone works but WebWaifu does not, the issue is an app layer.

## Commands

```powershell
npm run desktop:dev
npm run desktop:dev:irc
npm run desktop:start
npm run desktop:pack
npm run desktop:test:transparent
npm run desktop:test:transparent:bare
```

## Follow-Up Work

- Add persisted desktop window bounds per mode.
- Add an installer icon and signed release config.
- Smoke test packaged builds on a 4K/HiDPI display.
- Consider an Electrobun spike only after Electron behavior is verified.
