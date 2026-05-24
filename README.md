<div align="center">

# 💋 Web Waifu 4

### *Your own VTuber co-host. Running on your machine.*

A local-first stream assistant for OBS and Twitch — VRM avatars, realtime TTS,
persistent character memory, and a local app shell you control.

<br/>

![local-first](https://img.shields.io/badge/local--first-no_cloud-ff3b6b?style=for-the-badge)
![node](https://img.shields.io/badge/node-20%2B-3c873a?style=for-the-badge&logo=node.js&logoColor=white)
![react](https://img.shields.io/badge/react-18-61dafb?style=for-the-badge&logo=react&logoColor=black)
![three.js](https://img.shields.io/badge/three.js-r170-000?style=for-the-badge&logo=three.js&logoColor=white)
![vite](https://img.shields.io/badge/vite-6-646cff?style=for-the-badge&logo=vite&logoColor=white)
![twitch](https://img.shields.io/badge/twitch-IRC-9146ff?style=for-the-badge&logo=twitch&logoColor=white)

</div>

---

## 🌶️ What this is

Web Waifu 4 is a **VTuber stream brain you run on your own PC**.

It loads a VRM avatar in an OBS-ready overlay, reads Twitch chat and local text chat through one queue, routes replies through your chosen LLM provider, speaks with real TTS, and remembers useful stream context across sessions.

Everything that is not a paid provider call happens on your machine. OpenAI, OpenRouter, Fish Speech, Inworld, Tavily, and Whisper requests go to those providers only when you enable and configure them. No hosted accounts, no cloud sync, no payments, no telemetry. Your app settings, memory, VRMs, voices, backups, and browser-vault provider keys stay local.

---

## ✨ What it does

**🧠 Brain**
- Unified queue for local text chat **and** Twitch chat — same routing, same response path
- OpenAI Responses and OpenRouter-compatible provider paths
- Structured replies with visible dialogue plus emotion metadata for avatar reactions
- Relationship memory, reflective diary, and semantic recall over embeddings
- Background memory passes so longer memory work does not freeze the UI
- Optional runtime tools for web search, URL open/crawl, and fresh context when enabled

**🎙️ Voice**
- Piper, Fish Speech, and Inworld TTS
- Fish Speech **live bridge** — text streams straight into one continuous realtime audio stream
- Per-persona voice bindings
- Voice Lab entries for saved provider voice IDs and Fish Speech / Inworld sample-based voice creation flows

**🎭 Avatar**
- React + Three.js overlay (drop into OBS as a Browser Source or use the editor standalone)
- VRM loading with custom uploads, saved local avatar library, facial expressions, gaze, and animation playlists
- Emotion mapping from assistant output into VRM expressions and reaction animations
- Weighted ambient idle/talking loops and visual tuning controls

**📺 Stream**
- Twitch IRC with command handling and a mod-aware queue
- Local text chat behaves like another participant while still allowing trusted local controls
- Optional Whisper transcription from a configured Twitch stream or capture source (ambient context only)
- Optional stream-frame vision context when the selected model supports images
- Stream transcription and vision snippets are context, not chat turns
- Backup import/export to migrate a configured setup between PCs

---

## 🛠️ Requirements

| | |
|---|---|
| **Node.js** | 20+ |
| **npm** | bundled with Node |
| **Browser** | Chromium-based (Chrome, Edge, Brave, etc.) |
| **Optional** | `ffmpeg` + `yt-dlp` or `streamlink` for stream transcription |

---

## 🚀 Quick Start

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Then open the editor:

```
http://localhost:5173
```

`npm run dev` boots two processes:

| Service | URL |
|---|---|
| 🎨 Vite overlay / editor | `http://localhost:5173` |
| 🤖 Local AI + TTS backend | `http://localhost:8797` |

---

## 🔑 Provider Keys

Open **Settings → Account → Browser Provider Keys**.

Supported in the browser vault:

- OpenAI
- OpenRouter
- Fish Speech
- Inworld
- Tavily

Keys live in the browser vault and are only sent to your local backend for the current request. The backend performs the actual provider calls — WebSockets, TTS streaming, CORS, SDKs, and provider-specific request shapes stay server-side.

<details>
<summary><b>Prefer ENV-based keys?</b></summary>

```env
SERVER_PROVIDER_PROXY_ENABLED=true
OPENAI_API_KEY=
OPENROUTER_API_KEY=
FISH_AUDIO_API_KEY=
INWORLD_API_KEY=
TAVILY_API_KEY=
```

If `SERVER_PROVIDER_PROXY_ENABLED=false`, the backend will not fall back to ENV keys.
</details>

---

## 📺 OBS Setup

**During development**, point an OBS Browser Source at:

```
http://localhost:5173
```

**For a built runtime:**

```powershell
npm run build
npm run start:stream
```

Then point OBS at:

```
http://localhost:4173
```

`npm run start:stream` serves the built overlay with the same local `/api/*` proxy behavior as Vite.

---

## 💾 Your Data

Stored on your machine by this app:

- App settings · personas · voice bindings
- Twitch intake settings
- Chat & queue state
- Relationship memory + reflective diary
- Semantic memory + embeddings
- Saved VRM uploads
- Provider key vault

Use **Settings → Account → Export Local Backup** to move a configured setup to another machine. Backups can include provider keys, saved VRMs, memory, and settings — **treat exported backups like private secrets files**.

---

## 🎤 Twitch Stream Context

Chat and ambient context are kept separate:

- **Chat messages** → enter the response queue
- **Stream transcription + vision snippets** → injected as context only
- Whisper transcription needs an OpenAI-compatible provider key plus `ffmpeg` and either `yt-dlp` or `streamlink`

---

## 📜 Useful Commands

```powershell
npm run dev          # overlay + AI backend
npm run build        # build for OBS
npm run start:stream # serve built overlay + bot
npm test             # vitest
npm run bench:fish   # Fish Speech websocket latency benchmark
npm run bench:pipeline # LLM-to-Fish pipeline latency benchmark
```

<details>
<summary><b>Backend-only workflows</b></summary>

```powershell
npm run dev:ai         # AI server only
npm run dev:bot        # bot with mocked Twitch
npm run dev:bot:irc    # bot with real Twitch IRC
npm run build:bot      # compile server TS
```
</details>

---

## 📂 Project Layout

```text
src/                 React overlay / editor
server/src/          Local AI, Twitch, TTS, websocket backend
public/assets/       VRM, background, animation assets
public/cdn-assets/   Large static local assets
docs/                Focused local runtime notes
vendor/              Vendored runtime packages
scripts/             Benchmarks and utility scripts
```

---

## 🧭 Release Scope

This repo is the local-first public release line for Web Waifu 4. The hosted BYOK/Supabase/Vercel experiment is intentionally not part of this release path. The goal here is a self-owned desktop/OBS workflow that users can run, configure, and back up themselves.

<div align="center">

---

**Built for streamers who'd rather own their stack than rent it.**

</div>
