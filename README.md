# Web Waifu 4

Local-first VTuber stream assistant for OBS, Twitch chat, local chat, VRM avatars, realtime TTS, tools, and persistent character memory.

This repository is the standalone local build. It is intentionally not the SaaS/Auth/Vercel fork:

- No Supabase login.
- No Vercel deployment path.
- No hosted cloud sync.
- No billing, accounts, or public overlay links.
- Settings, chat state, memory, embeddings, saved VRMs, voice presets, and provider keys stay in browser/local machine storage.

## Features

- React + Three.js overlay/editor for local browser use or OBS Browser Source.
- Unified local chat and Twitch chat intake through the same queue and response path.
- OpenAI Responses and OpenRouter-compatible Responses provider modes.
- Piper, Fish Speech, and Inworld TTS through the local backend.
- Fish Speech live bridge support for streaming text into one realtime TTS stream.
- Grillo-style relationship memory, reflective diary state, semantic memory, and worker-assisted memory passes.
- VRM avatar loading, saved custom VRMs, facial expressions, gaze, animation playlists, emotion mapping, and weighted ambient loops.
- Twitch IRC, command handling, optional stream audio transcription, and optional stream frame vision context.
- Local backup import/export for moving a configured setup to another streaming PC.

## Requirements

- Node.js 20+
- npm
- Chromium-based browser for the editor and OBS preview
- Optional: `ffmpeg` plus `yt-dlp` or `streamlink` for Twitch stream transcription and frame sampling

## Quick Start

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open the editor:

```text
http://localhost:5173
```

`npm run dev` starts:

- Vite overlay/editor on `http://localhost:5173`
- Local AI/TTS backend on `http://localhost:8797`

## Provider Keys

Open `Settings -> Account -> Browser Provider Keys`.

Supported browser-vault keys:

- OpenAI
- OpenRouter
- Fish Speech
- Inworld
- Tavily

Keys are stored in the browser provider vault and sent to the local backend only for the current request. The backend still performs provider calls so WebSockets, TTS streaming, CORS, provider SDKs, and provider-specific request formats stay server-side.

Optional local-machine ENV fallback is available for private setups:

```env
SERVER_PROVIDER_PROXY_ENABLED=true
OPENAI_API_KEY=
OPENROUTER_API_KEY=
FISH_AUDIO_API_KEY=
INWORLD_API_KEY=
TAVILY_API_KEY=
```

If `SERVER_PROVIDER_PROXY_ENABLED=false`, the backend will not use ENV provider keys as fallback.

## OBS Usage

For development, add an OBS Browser Source pointed at:

```text
http://localhost:5173
```

For a built local runtime:

```powershell
npm run build
npm run start:stream
```

`npm run start:stream` serves the built overlay with the same local `/api/*` proxy behavior as Vite. Then point OBS at:

```text
http://localhost:4173
```

## Local Data

Stored locally:

- App settings
- Personas and voice bindings
- Twitch intake settings
- Chat and queue state
- Relationship memory and reflective diary state
- Semantic memory records and embeddings
- Saved VRM uploads
- Provider key vault entries

Use `Settings -> Account -> Export Local Backup` to move a configured setup to another machine. The backup includes provider keys, saved VRMs, memory, and app settings, so treat it like a private local secrets file.

## Twitch Stream Context

Twitch chat and ambient stream context are separate:

- Chat messages enter the response queue.
- Stream transcription and vision snippets are injected as context only.
- Whisper transcription requires a provider key plus `ffmpeg` and either `yt-dlp` or `streamlink`.

## Useful Commands

```powershell
npm run dev
npm run build
npm run start:stream
npm test
```

For backend-only work:

```powershell
npm run dev:ai
npm run dev:bot
npm run dev:bot:irc
npm run build:bot
```

## Project Layout

```text
src/                 React overlay/editor
server/src/          Local AI, Twitch, TTS, websocket backend
public/assets/       VRM, background, and animation assets
public/cdn-assets/   Large static local assets served by the overlay host
docs/                Focused local runtime notes
vendor/              Vendored runtime packages used by the local build
```

## Development Notes

- Keep hosted auth, cloud sync, billing, and public OBS sharing in a separate fork.
- Keep realtime provider calls on the local backend path; the browser supplies keys, not provider protocol glue.
- Run `npm test -- --run` and `npm run build` before publishing a release build.
