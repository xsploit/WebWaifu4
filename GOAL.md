# WebWaifu 4 Goal

## Active Goal

Make WebWaifu 4 a fully working Electron desktop app without breaking the local browser or OBS runtime.

## Must Be True

- Electron editor mode opens without a JavaScript main-process error.
- Electron does not crash when the default backend port is already in use.
- If the requested backend port already hosts a healthy WebWaifu backend, Electron reuses it.
- If the requested backend port is busy but not healthy, Electron chooses an available fallback port and passes it to the renderer.
- The packaged unpacked app can launch and expose a healthy backend.
- The app still builds, tests, and passes the Ralph evaluator.

## Current Focus

Finish Electron reliability first. UI polish and installer branding come after the app reliably boots.
