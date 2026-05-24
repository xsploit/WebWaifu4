# Web Waifu 4

Your own VTuber co-host, running on your machine.

Web Waifu 4 is a local-first stream assistant for OBS and Twitch. It loads a
VRM avatar, reads Twitch and local text chat through one queue, routes replies
through your chosen LLM provider, speaks with real TTS, and keeps character
memory on your computer.

This release is intentionally local-only. There are no hosted accounts, cloud
sync, payments, or telemetry. Provider calls still use paid third-party APIs
when you enable them, but app state, memory, saved VRMs, voice bindings, and
backups stay local.

## What It Does

### Stream Brain

- Unified queue for local text chat and Twitch chat.
- OpenAI Responses and OpenRouter-compatible provider paths.
- Structured assistant replies with visible message text plus emotion metadata.
- Relationship memory, reflective diary, and semantic recall.
- Background memory worker so long memory passes do not freeze the UI.
- Runtime tools for web search, URL open/crawl, and fresh context when enabled.

### Voice

- Piper, Fish Speech, and Inworld TTS paths.
- Fish Speech live bridge streams text into one continuous realtime audio
  request instead of stitching separate clips together.
- Per-persona voice bindings.
- Browser-local provider key vault, passed only to the local backend for the
  current request.

### Avatar

- React + Three.js VRM overlay for OBS Browser Source or standalone editor use.
- Custom VRM upload and saved local avatar library.
- Facial expressions, gaze, blink, animation playlists, and visual tuning.
- Emotion mapping from the assistant brain into VRM expressions and reaction
  animations.
- Weighted ambient idle/talking animation loops.

### Twitch And Stream Context

- Twitch IRC intake with command handling and moderator-aware queue behavior.
- Local text chat behaves like another participant while still allowing trusted
  local controls.
- Optional Whisper transcription from a configured stream or capture source.
- Optional stream-frame vision context when the selected model supports images.
- Stream transcription and vision snippets are ambient context, not chat turns.

## Requirements

| Requirement | Version / Notes |
| --- | --- |
| Node.js | 20 or newer |
| npm | Bundled with Node |
| Browser | Chromium-based browser recommended |
| Optional | `ffmpeg` plus `yt-dlp` or `streamlink` for stream transcription |

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

`npm run dev` starts both local services:

| Service | URL |
| --- | --- |
| Vite overlay/editor | `http://localhost:5173` |
| Local AI/TTS backend | `http://localhost:8797` |

## Provider Keys

Open `Settings -> Account -> Browser Provider Keys`.

Supported browser-vault providers:

- OpenAI
- OpenRouter
- Fish Speech
- Inworld
- Tavily

Keys are stored locally in the browser vault and are only sent to your local
backend for the current request. The backend performs provider-specific work
such as WebSockets, TTS streaming, CORS handling, SDK calls, and request shaping.

If you prefer environment-based keys for a private local machine, copy
`.env.example` to `.env.local` and configure the provider variables there.
The local backend will only use server-side provider keys when that mode is
enabled in configuration.

## OBS Setup

For development, point an OBS Browser Source at:

```text
http://localhost:5173
```

For a built runtime:

```powershell
npm run build
npm run start:stream
```

Then point OBS at:

```text
http://localhost:4173
```

`npm run start:stream` serves the built overlay with the same local API proxy
behavior used by the Vite development server.

## Your Data

Stored locally:

- App settings, personas, and voice bindings.
- Twitch intake settings.
- Chat and queue state.
- Relationship memory and reflective diary.
- Semantic memory and embeddings.
- Saved VRM uploads.
- Provider key vault.

Use `Settings -> Account -> Export Local Backup` to move a configured setup to
another machine. Backups can include provider keys, saved VRMs, memory, and
settings, so treat exported files like private secrets.

## Useful Commands

```powershell
npm run dev          # overlay/editor plus local backend
npm run build        # production build
npm run start:stream # serve built overlay and local backend
npm test             # vitest suite
```

Backend-only workflows:

```powershell
npm run dev:ai       # AI server only
npm run dev:bot      # bot with mocked Twitch source
npm run dev:bot:irc  # bot with real Twitch IRC
npm run build:bot    # compile server TypeScript
```

## Project Layout

```text
src/                 React overlay and editor
server/src/          Local AI, Twitch, TTS, and websocket backend
public/assets/       VRM, background, and animation assets
public/cdn-assets/   Large static local assets
docs/                Focused local runtime notes
vendor/              Vendored runtime packages
scripts/             Benchmarks and utility scripts
```

## Release Notes

This repo is the local-first public release line for Web Waifu 4. The older
hosted BYOK/Supabase/Vercel experiment was intentionally removed from this
release path. The current goal is a self-owned desktop/OBS workflow that users
can run and back up themselves.

Built for streamers who would rather own their stack than rent it.
