# Standalone LM Studio Plan

## Direction

Build this as a separate app.

Keep:
- the VRM renderer
- Piper TTS
- lipsync
- STT
- persona/chat UI
- local animation and visual settings

Remove:
- RUN.game platform dependency
- RUN.game storage dependency
- RUN.game AI completion dependency
- RUN.game asset fetch dependency

Replace the AI path with LM Studio.

## What Is Actually Tied To RUN.game

The coupling is limited and very manageable.

### 1. Bootstrap

- [src/main.tsx](C:/Users/SUBSECT/Documents/GitHub/YourWifey/src/main.tsx)

Current use:
- `RundotGameAPI.initializeAsync()`

Standalone replacement:
- remove SDK init entirely
- render the app directly

### 2. App runtime context and lifecycle

- [src/App.tsx](C:/Users/SUBSECT/Documents/GitHub/YourWifey/src/App.tsx)

Current use:
- `RundotGameAPI.system.getSafeArea()`
- `RundotGameAPI.log(...)`
- `RundotGameAPI.lifecycles.onPause/onSleep/onResume/onAwake`
- `RundotGameAPI.context.launchParams/shareParams/notificationParams`

Standalone replacement:
- safe area defaults to zeroes
- logging becomes `console`
- lifecycle hooks become browser visibility/focus listeners or no-ops
- runtime context becomes local app context, optional Discord Activity context later

### 3. AI completion and model list

- [src/App.tsx](C:/Users/SUBSECT/Documents/GitHub/YourWifey/src/App.tsx)

Current use:
- `RundotGameAPI.ai.getAvailableCompletionModels()`
- `RundotGameAPI.ai.requestChatCompletionAsync(...)`

Standalone replacement:
- LM Studio OpenAI-compatible endpoint
- use `/v1/models`
- use `/v1/chat/completions`

This app already structures prompts/messages cleanly enough to swap providers without redesigning the whole UI.

### 4. Persistence

- [src/lib/chat/storage.ts](C:/Users/SUBSECT/Documents/GitHub/YourWifey/src/lib/chat/storage.ts)

Current use:
- `RundotGameAPI.appStorage.getItem(...)`
- `RundotGameAPI.appStorage.setItem(...)`

Standalone replacement:
- `localStorage` for normal browser mode
- optional file-backed or IndexedDB mode later if needed

### 5. Asset fetch

- [src/lib/cdn/assets.ts](C:/Users/SUBSECT/Documents/GitHub/YourWifey/src/lib/cdn/assets.ts)

Current use:
- RUN.game asset fetch path

Standalone replacement:
- fetch from `public/`
- or plain URL fetch
- or drag/drop local assets

## What Already Survives The Extraction

These parts are already the good part and should mostly stay as-is:

- [src/components/VrmStage.tsx](C:/Users/SUBSECT/Documents/GitHub/YourWifey/src/components/VrmStage.tsx)
- [src/lib/vrm](C:/Users/SUBSECT/Documents/GitHub/YourWifey/src/lib/vrm)
- [src/lib/tts/manager.ts](C:/Users/SUBSECT/Documents/GitHub/YourWifey/src/lib/tts/manager.ts)
- [src/lib/stt/recorder.ts](C:/Users/SUBSECT/Documents/GitHub/YourWifey/src/lib/stt/recorder.ts)
- [src/lib/chat/prompt.ts](C:/Users/SUBSECT/Documents/GitHub/YourWifey/src/lib/chat/prompt.ts)
- [src/lib/chat/defaults.ts](C:/Users/SUBSECT/Documents/GitHub/YourWifey/src/lib/chat/defaults.ts)

This is why extraction makes sense. The face/voice stack is already here.

## Recommended New Shape

Create a small host abstraction layer:

- `src/lib/host/types.ts`
- `src/lib/host/browserHost.ts`
- `src/lib/host/lmstudio.ts`
- `src/lib/host/storage.ts`

### Host responsibilities

#### storage
- load persisted state
- save persisted state

#### ai
- list models
- chat completion

#### runtime context
- launch/share/notification context
- safe area
- lifecycle events

#### assets
- fetch bundled VRM and animation files

Then `App.tsx` stops calling RUN.game directly and talks to the host layer instead.

## LM Studio Contract

Target LM Studio as an OpenAI-compatible local server.

Use:
- `GET /v1/models`
- `POST /v1/chat/completions`

Suggested env/config:
- `VITE_LM_STUDIO_BASE_URL=http://127.0.0.1:1234`
- optional API key field left blank by default

Behavior:
- if LM Studio is down, the UI should stay alive and show a clear status
- if model list fetch fails, keep last model and allow manual entry

## Best Product Split

### Standalone app

This repo becomes:
- browser/desktop waifu shell
- local LM Studio chat front-end
- Piper voice front-end
- local VRM avatar app

### Discord bridge later

Then optionally:
- feed it from `dvb`
- or embed it in a Discord Activity
- or use it as an OBS/browser source

That keeps the avatar product usable even without Discord.

## Suggested Implementation Order

1. Remove direct RUN.game init from bootstrap.
2. Introduce browser storage adapter.
3. Introduce LM Studio client.
4. Move AI calls behind the new client.
5. Replace asset loading with plain public/local fetch.
6. Replace RUN context/lifecycle with browser fallbacks.
7. Rename app/docs so it is no longer framed as a RUN.game template.

## Immediate Goal

First milestone should be:

- app boots without RUN.game
- VRM model loads
- Piper still works
- chat still works through LM Studio
- local persistence still works

That gives you the actual waifu app before Discord integration.
