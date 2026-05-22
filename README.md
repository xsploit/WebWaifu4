# YourWifey Local

Local-first VTuber stream assistant for OBS, Twitch chat, local chat, VRM avatars, realtime TTS, and persistent memory.

This fork is intentionally local-only:

- No Supabase login.
- No Vercel deployment path.
- No hosted cloud sync.
- Provider API keys live in the browser vault and can be exported in a local backup JSON.
- Settings, chat state, memory, embeddings, saved VRMs, and voice presets stay in browser storage.

## What It Does

- Runs a React/Three.js VRM overlay/editor for local browser or OBS Browser Source.
- Normalizes Twitch chat and local chat into the same queue.
- Streams replies through OpenAI Responses or OpenRouter-compatible Responses.
- Supports Piper, Fish Speech, and Inworld TTS paths through the local backend.
- Stores Grillo-style relationship memory, diary/reflection state, semantic memory, and settings locally.
- Supports Twitch IRC, optional stream audio transcription, optional stream frame vision context, avatar animation mapping, facial expressions, voice lab presets, and local transfer backups.

## Requirements

- Node.js 20+
- npm
- A Chromium browser for the editor/OBS preview
- Optional: `ffmpeg` plus `yt-dlp` or `streamlink` for Twitch stream transcription and vision sampling

## Quick Start

```powershell
npm install
copy .env.example .env.local
npm run dev
```

Open:

```text
http://localhost:5173
```

The dev command starts both:

- Vite overlay/editor on `5173`
- Local AI/TTS backend on `8797`

## Provider Keys

Open `Settings -> Account -> Browser Provider Keys`.

Supported local vault keys:

- OpenAI
- OpenRouter
- Fish Speech
- Inworld
- Tavily

The browser sends the selected key to the local backend only for the current request. The backend handles provider calls so WebSockets, TTS streaming, CORS, and provider-specific request formats stay server-side.

Optional ENV fallback is still available for private local machines:

```env
SERVER_PROVIDER_PROXY_ENABLED=true
OPENAI_API_KEY=
OPENROUTER_API_KEY=
FISH_AUDIO_API_KEY=
INWORLD_API_KEY=
TAVILY_API_KEY=
```

If `SERVER_PROVIDER_PROXY_ENABLED=false`, the backend will not use ENV provider keys as fallback.

## OBS

For development, add an OBS Browser Source pointed at:

```text
http://localhost:5173
```

For a production local build:

```powershell
npm run build
npm run start:stream
```

`npm run start:stream` serves the built overlay through `serve-dist.mjs`, which keeps the same local `/api/*` proxy behavior as Vite. Then point OBS at:

```text
http://localhost:4173
```

## Local Data

Stored locally:

- App settings
- Personas and voice bindings
- Twitch intake settings
- Memory and diary state
- Semantic memory records and embeddings
- Saved VRM uploads
- Provider key vault entries

Use `Settings -> Account -> Export Local Backup` to move the whole setup to another machine. Importing a backup normalizes old or partial settings so missing fields fall back safely.

## Twitch Stream Context

Twitch chat is handled separately from ambient stream context.

- Chat messages enter the response queue.
- Stream transcription and vision snippets are context only.
- Whisper transcription requires a provider key plus `ffmpeg` and either `yt-dlp` or `streamlink`.

## Useful Commands

```powershell
npm run dev
npm run build
npm run start:stream
npm test
npm run format:check
```

## Project Layout

```text
src/                 React overlay/editor
server/src/          Local AI, Twitch, TTS, websocket backend
public/assets/       VRM, background, and animation assets
public/cdn-assets/   Large static local assets served by the overlay host
docs/                Focused local runtime notes
```

## Notes

This repo is not a SaaS product shell. It is the local streaming build. If you want hosted auth, accounts, cloud sync, billing, or public OBS links later, keep that in a separate fork so the local runtime stays stable.
