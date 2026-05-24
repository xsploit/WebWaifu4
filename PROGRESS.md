# WebWaifu 4 Progress

## 2026-05-24

### Completed

- Created a fresh `WebWaifu4` project from `YourWifey-Local`.
- Chose Electron as the first desktop target because it is safer for Chromium/WebGL/Web Audio/HiDPI behavior.
- Added Electron main/preload shell.
- Added editor, transparent desktop, and transparent overlay launch modes.
- Added Electron menu actions for relaunching modes and toggling click-through.
- Added desktop runtime URL helpers so AI, POML, TTS, and overlay WebSocket calls target the local backend.
- Added transparent desktop CSS mode.
- Added desktop README and docs.
- Bootstrapped Ralph fixed-point loop files.

### Verified

- `npm run build`
- `node --check electron/main.mjs`
- `node --check electron/preload.mjs`
- `npm run test -- src/lib/desktop/runtime.test.ts src/lib/chat/reply-metadata.test.ts src/lib/vrm/sequencer.test.ts`
- `py -3 scripts/ralph_eval.py`
- `npm run desktop:pack`
- Packaged launch smoke: `release\win-unpacked\WebWaifu 4.exe --window-mode=editor` stayed alive for 8 seconds; local health probe returned 200.
- Fixed packaged Electron `EADDRINUSE` crash on port `8797`.
- Verified packaged app reuses an existing healthy backend on port `8797`.
- Verified packaged app falls back from a dummy busy unhealthy port `8897` to a healthy backend on `8898`.
- Added `GOAL.md` and wired Ralph prompt/evaluator to it.
- Added `npm run desktop:clean` so repeated desktop packs remove stale `release/` output before `electron-builder`.
- Final desktop checkpoint:
  - `py -3 -m py_compile scripts\ralph_eval.py runner.py`
  - `node --check electron/main.mjs`
  - `node --check electron/preload.mjs`
  - `npm run test -- src/lib/desktop/runtime.test.ts`
  - `py -3 scripts/ralph_eval.py` -> `desktop_pack_passed=true`, `ralph_eval_passed=true`
  - `git diff --check`
  - Packaged launch smoke on `8797` -> alive, title `Web Waifu 4`, health `200`
  - Packaged fallback smoke with dummy `8897` -> alive, title `Web Waifu 4`, fallback health `8898=200`

### Current Next Step

- Add persisted desktop window bounds and in-app desktop mode controls after the port-aware Electron boot fix.
