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

## Window Modes

- `editor`: normal framed setup window.
- `desktop`: frameless transparent window for desktop companion use.
- `overlay`: frameless transparent always-on-top window, with optional click-through from the Electron menu.

Switch modes from the Electron menu. Mode switching relaunches the app because window frame/transparent behavior is safest when selected at window creation time.

## Commands

```powershell
npm run desktop:dev
npm run desktop:dev:irc
npm run desktop:start
npm run desktop:pack
```

## Follow-Up Work

- Add persisted desktop window bounds per mode.
- Add in-app buttons for desktop mode and click-through instead of menu-only controls.
- Add an installer icon and signed release config.
- Smoke test packaged builds on a 4K/HiDPI display.
- Consider an Electrobun spike only after Electron behavior is verified.
