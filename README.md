<div align="center">

# 💋 Web Waifu 4

### *Your own VTuber co-host. Running on your machine.*

A local-first stream assistant for OBS and Twitch — VRM avatars, realtime TTS,
persistent character memory, and a brain that lives entirely on your hardware.

<br/>

![local-first](https://img.shields.io/badge/local--first-no_cloud-ff3b6b?style=for-the-badge)
![node](https://img.shields.io/badge/node-20%2B-3c873a?style=for-the-badge&logo=node.js&logoColor=white)
![react](https://img.shields.io/badge/react-19-61dafb?style=for-the-badge&logo=react&logoColor=black)
![three.js](https://img.shields.io/badge/three.js-r170-000?style=for-the-badge&logo=three.js&logoColor=white)
![vite](https://img.shields.io/badge/vite-7-646cff?style=for-the-badge&logo=vite&logoColor=white)
![twitch](https://img.shields.io/badge/twitch-IRC-9146ff?style=for-the-badge&logo=twitch&logoColor=white)

</div>

---

## 🌶️ What this is

Web Waifu 4 is a **VTuber stream brain you run on your own PC**.

It loads a VRM avatar in an OBS-ready overlay, listens to Twitch chat and local text chat, routes queued turns through your chosen LLM provider, speaks replies with real TTS in real time, and remembers who said what across sessions.

Optional stream audio transcription can add ambient context from a configured Twitch stream or local capture source. That context helps the character understand what is happening on stream, but it is not currently a push-to-talk/local microphone conversation mode.

Everything that isn't a paid provider call (OpenAI, OpenRouter, Fish, Inworld, Tavily) happens on your machine. No accounts. No cloud sync. No telemetry. Your keys, your memory, your VRMs, your backups.

---

## ✨ What it does

**🧠 Brain**
- Unified queue for local chat **and** Twitch chat — same routing, same response path
- OpenAI Responses & OpenRouter-compatible providers
- Grillo-style relationship memory, reflective diary, semantic recall over embeddings
- Memory passes run in a worker so the UI never freezes mid-stream

**🎙️ Voice**
- Piper, Fish Speech, and Inworld TTS
- Fish Speech **live bridge** — text streams straight into one continuous realtime audio stream
- Per-persona voice bindings

**🎭 Avatar**
- React + Three.js overlay (drop into OBS as a Browser Source or use the editor standalone)
- VRM loading with custom uploads, facial expressions, gaze, animation playlists
- Emotion mapping driven by the brain's mood state, weighted ambient idle loops

**📺 Stream**
- Twitch IRC with command handling and a mod-aware queue
- Optional Whisper transcription of a configured stream or capture source (ambient context only)
- Optional stream-frame vision context for "she can see what's on screen"
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

If `SERVER_PROVIDER_PROXY_ENABLED=false`, the backend won't fall back to ENV keys.
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

Stored on your machine, never uploaded:

- App settings · personas · voice bindings
- Twitch intake settings
- Chat & queue state
- Relationship memory + reflective diary
- Semantic memory + embeddings
- Saved VRM uploads
- Provider key vault

Use **Settings → Account → Export Local Backup** to move a configured setup to another machine. The backup includes provider keys, saved VRMs, memory, and settings — **treat it like a private secrets file**.

---

## 🎤 Twitch Stream Context

Chat and ambient context are kept separate:

- **Chat messages** → enter the response queue
- **Local text chat** → enters the same response queue as a local participant
- **Stream transcription + vision snippets** → injected as context only; they do not behave like chat messages
- Whisper transcription needs a provider key plus `ffmpeg` and either `yt-dlp` or `streamlink`
- Built-in local microphone prompting is not part of this local release yet

---

## 📜 Useful Commands

```powershell
npm run dev          # overlay + AI backend
npm run build        # build for OBS
npm run start:stream # serve built overlay + bot
npm test             # vitest
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
```

<div align="center">

---

**Built for streamers who'd rather own their stack than rent it.**

</div>
