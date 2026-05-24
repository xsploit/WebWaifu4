# WebWaifu 4 Roadmap

## Current Goal

Turn the local-first Web Waifu runtime into a desktop app without breaking the browser/OBS workflow.

## Locked Decisions

- Product name: WebWaifu 4.
- First desktop target: Electron.
- Keep provider calls on the local backend path.
- Keep provider keys in browser-local storage for this release line.
- Preserve the browser/OBS overlay path.
- Treat ElectroBun as a later spike after Electron is verified on HiDPI/4K displays.

## MVP Desktop Acceptance

- `npm run desktop:dev` opens Electron against Vite and the local backend.
- `npm run desktop:start` builds and opens the compiled app against the compiled backend.
- Editor mode is framed and usable for setup.
- Desktop mode is transparent/frameless.
- Overlay mode is transparent, always-on-top, and can be made click-through.
- AI, POML, TTS, and overlay WebSocket URLs route to the local backend in Electron.
- Existing browser `npm run dev`, `npm run start:stream`, tests, and build still work.

## Next Work

- Persist desktop window bounds per mode.
- Add in-app desktop mode controls, not only Electron menu controls.
- Add installer icon/signing config.
- Run a real packaged build smoke on a 4K/HiDPI display.
- Revisit ElectroBun only after Electron is stable.
