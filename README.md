<div align="center">

# 💋 Web Waifu 4

### _Your own VTuber co-host. Running on your machine._

Local-first OBS/Twitch assistant with a VRM avatar, realtime TTS, Twitch/local
chat intake, memory, tools, and provider keys stored in local browser storage.

<br/>

![local-first](https://img.shields.io/badge/local--first-no_cloud-ff3b6b?style=for-the-badge)
![node](https://img.shields.io/badge/node-20%2B-3c873a?style=for-the-badge&logo=node.js&logoColor=white)
![react](https://img.shields.io/badge/react-18-61dafb?style=for-the-badge&logo=react&logoColor=black)
![three.js](https://img.shields.io/badge/three.js-r170-000?style=for-the-badge&logo=three.js&logoColor=white)
![vite](https://img.shields.io/badge/vite-6-646cff?style=for-the-badge&logo=vite&logoColor=white)
![electron](https://img.shields.io/badge/electron-desktop-47848f?style=for-the-badge&logo=electron&logoColor=white)
![twitch](https://img.shields.io/badge/twitch-IRC-9146ff?style=for-the-badge&logo=twitch&logoColor=white)

<br/>

<a href="#-what-this-is">What This Is</a>
·
<a href="#-features">Features</a>
·
<a href="#-quick-start">Quick Start</a>
·
<a href="#-provider-keys">Provider Keys</a>
·
<a href="#-obs-setup">OBS Setup</a>
·
<a href="#-truth-table">Truth Table</a>

</div>

---

<h2 align="center">🌶️ What This Is</h2>

<p align="center">
  <strong>Web Waifu 4 is a VTuber stream brain you run locally.</strong>
</p>

<p align="center">
  It loads a VRM avatar in an OBS-ready overlay, reads Twitch chat and local
  text chat through one queue, routes replies through your selected LLM
  provider, speaks with TTS, and keeps useful character memory between sessions.
</p>

<p align="center">
  There are no hosted Web Waifu accounts, cloud sync, payments, or telemetry in
  this release line. Paid provider requests still go to the provider you choose:
  OpenAI, OpenRouter, Fish Speech, Inworld, Tavily, and Whisper/OpenAI
  transcription paths only run when configured.
</p>

---

<h2 align="center">✨ Features</h2>

<table>
  <tr>
    <td width="50%" valign="top">
      <h3 align="center">🧠 Brain</h3>
      <ul>
        <li>Unified queue for local text chat and Twitch chat.</li>
        <li>OpenAI Responses and OpenRouter-compatible provider paths.</li>
        <li>Structured replies with dialogue plus emotion metadata.</li>
        <li>Relationship memory, reflective diary, and semantic recall.</li>
        <li>Async/background memory passes for relationship, diary, and semantic recall.</li>
        <li>Optional runtime tools for web search, URL open/crawl, and fresh context.</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3 align="center">🎙️ Voice</h3>
      <ul>
        <li>Piper, Fish Speech, and Inworld TTS paths.</li>
        <li>Fish Speech live bridge for one continuous realtime audio stream.</li>
        <li>Per-persona voice bindings.</li>
        <li>Voice Lab records for saved provider voice IDs.</li>
        <li>Fish Speech and Inworld sample-based voice creation flows.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3 align="center">🎭 Avatar</h3>
      <ul>
        <li>Electron desktop shell plus browser/OBS runtime.</li>
        <li>React + Three.js VRM overlay for OBS or standalone editor use.</li>
        <li>Custom VRM upload and saved local avatar library.</li>
        <li>Facial expressions, gaze, blink, animation playlists, and tuning controls.</li>
        <li>Emotion mapping into VRM expressions and reaction animations.</li>
        <li>Weighted ambient idle/talking animation loops.</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3 align="center">📺 Stream</h3>
      <ul>
        <li>Twitch IRC intake with command handling and moderator-aware queue behavior.</li>
        <li>Local text chat behaves like another participant with trusted local controls.</li>
        <li>Optional OpenAI/Whisper transcription from a configured Twitch stream or capture source.</li>
        <li>Optional stream-frame vision context when the selected model supports images.</li>
        <li>Backup import/export for moving a setup between PCs.</li>
      </ul>
    </td>
  </tr>
</table>

---

<h2 align="center">🛠️ Requirements</h2>

<table align="center">
  <tr>
    <th>Requirement</th>
    <th>Truth</th>
  </tr>
  <tr>
    <td>Node.js</td>
    <td>20 or newer</td>
  </tr>
  <tr>
    <td>npm</td>
    <td>Bundled with Node</td>
  </tr>
  <tr>
    <td>Browser</td>
    <td>Chromium-based browser recommended</td>
  </tr>
  <tr>
    <td>Optional stream context tools</td>
    <td><code>ffmpeg</code> plus <code>yt-dlp</code> or <code>streamlink</code></td>
  </tr>
  <tr>
    <td>External provider accounts</td>
    <td>Only needed for provider features you enable</td>
  </tr>
</table>

---

<h2 align="center">🚀 Quick Start</h2>

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

<p align="center">
  Open the editor at <code>http://localhost:5173</code>.
</p>

<table align="center">
  <tr>
    <th>Service</th>
    <th>URL</th>
  </tr>
  <tr>
    <td>🎨 Vite overlay / editor</td>
    <td><code>http://localhost:5173</code></td>
  </tr>
  <tr>
    <td>🤖 Local AI + TTS backend</td>
    <td><code>http://localhost:8797</code></td>
  </tr>
</table>

`npm run dev` starts both processes. The default dev bot uses mocked Twitch
unless you run the real IRC command below.

---

<h2 align="center">🖥️ Desktop App</h2>

```powershell
npm run desktop:dev      # Electron + Vite + mocked Twitch backend
npm run desktop:dev:irc  # Electron + Vite + real Twitch IRC backend
npm run desktop:start    # build, start compiled backend, and open Electron
npm run desktop:pack     # build unpacked desktop app
```

The desktop shell is Electron. It keeps the existing React/Three.js app and
local Node backend, then adds desktop window modes:

<table align="center">
  <tr>
    <th>Mode</th>
    <th>Use</th>
  </tr>
  <tr>
    <td>Editor</td>
    <td>Normal framed desktop app for setup and testing</td>
  </tr>
  <tr>
    <td>Desktop Transparent</td>
    <td>Frameless transparent avatar window for sitting on the desktop</td>
  </tr>
  <tr>
    <td>Overlay</td>
    <td>Frameless always-on-top transparent window with optional click-through</td>
  </tr>
</table>

Use the Electron menu to relaunch between modes. The renderer still sends
provider requests to the same local backend on `127.0.0.1:8797`; API keys are
not moved into Electron main storage.

<h3 align="center">Release Verification</h3>

```powershell
npm run verify:release -- --backup "C:\path\to\web-waifu-4-local-backup.json"
```

This is the full local release gate. It runs diff whitespace checks,
TypeScript, the Vitest suite, the Ladybug memory probe, rebuilds the unpacked
Electron app, checks packaged editor and desktop modes, verifies port fallback
and relaunch behavior, then runs the packaged AI smoke against the backup keys.
The packaged AI smoke covers OpenAI WebSocket tools, OpenAI HTTP tools,
OpenRouter tools, structured TTS, live TTS, live tools with TTS, and the
OpenAI premium-model guard.

---

<h2 align="center">🔑 Provider Keys</h2>

<p align="center">
  Open <strong>Settings → Account → Browser Provider Keys</strong>.
</p>

<table align="center">
  <tr>
    <th>Provider</th>
    <th>Used For</th>
  </tr>
  <tr>
    <td>OpenAI</td>
    <td>Responses, OpenAI embeddings, optional transcription</td>
  </tr>
  <tr>
    <td>OpenRouter</td>
    <td>OpenRouter-compatible Responses plus routed embeddings</td>
  </tr>
  <tr>
    <td>Fish Speech</td>
    <td>Remote TTS, live bridge, voice listing/creation</td>
  </tr>
  <tr>
    <td>Inworld</td>
    <td>Remote TTS, voice listing/creation</td>
  </tr>
  <tr>
    <td>Tavily</td>
    <td>Optional web search / crawl tools</td>
  </tr>
</table>

Keys are stored in this browser's `localStorage`, not in a hosted Web Waifu
account, OS keychain, or cloud secret manager. When a provider call needs one,
the key is sent to the local backend for that request so the backend can handle
WebSockets, TTS streaming, CORS, SDK calls, and provider-specific request
shaping.

<details>
<summary><b>Prefer ENV-based fallback keys on a private local machine?</b></summary>

```env
SERVER_PROVIDER_PROXY_ENABLED=true
OPENAI_API_KEY=
OPENROUTER_API_KEY=
FISH_AUDIO_API_KEY=
INWORLD_API_KEY=
TAVILY_API_KEY=
```

If `SERVER_PROVIDER_PROXY_ENABLED=false`, the backend will not use ENV provider
keys as fallbacks.

</details>

---

<h2 align="center">📺 OBS Setup</h2>

<table align="center">
  <tr>
    <th>Mode</th>
    <th>Browser Source URL</th>
  </tr>
  <tr>
    <td>Development</td>
    <td><code>http://localhost:5173</code></td>
  </tr>
  <tr>
    <td>Built runtime</td>
    <td><code>http://localhost:4173</code></td>
  </tr>
</table>

For the built runtime:

```powershell
npm run build
npm run start:stream
```

`npm run start:stream` serves the built overlay with the same local `/api/*`
proxy behavior as Vite.

---

<h2 align="center">💾 Your Data</h2>

<table align="center">
  <tr>
    <th>Stored Locally By This App</th>
    <th>Notes</th>
  </tr>
  <tr>
    <td>App settings, personas, voice bindings</td>
    <td>Browser <code>localStorage</code></td>
  </tr>
  <tr>
    <td>Twitch intake settings</td>
    <td>Browser <code>localStorage</code></td>
  </tr>
  <tr>
    <td>Chat history and UI state</td>
    <td>Browser <code>localStorage</code></td>
  </tr>
  <tr>
    <td>Relationship memory and reflective diary</td>
    <td>Relationship profile in <code>localStorage</code>; memory engine records in IndexedDB with fallback</td>
  </tr>
  <tr>
    <td>Semantic memory and embeddings</td>
    <td>Browser IndexedDB/local storage paths</td>
  </tr>
  <tr>
    <td>Saved VRM uploads</td>
    <td>Browser-local saved asset library</td>
  </tr>
  <tr>
    <td>Provider keys</td>
    <td>Browser <code>localStorage</code> through the provider-key helper</td>
  </tr>
</table>

Use **Settings → Account → Export Local Backup** to move a configured setup to
another machine. Backups can include provider keys, saved VRMs, memory, and
settings, so treat exported backups like private secrets files.

---

<h2 align="center">🎤 Twitch Stream Context</h2>

<table align="center">
  <tr>
    <th>Input Type</th>
    <th>How It Is Used</th>
  </tr>
  <tr>
    <td>Twitch chat</td>
    <td>Enters the response queue</td>
  </tr>
  <tr>
    <td>Local text chat</td>
    <td>Enters the same response queue as a local participant</td>
  </tr>
  <tr>
    <td>Stream transcription</td>
    <td>Ambient context only</td>
  </tr>
  <tr>
    <td>Stream-frame vision</td>
    <td>Ambient context only when enabled and model-supported</td>
  </tr>
</table>

Transcription uses the OpenAI-compatible transcription endpoint and needs an
OpenAI provider key plus `ffmpeg` and either `yt-dlp` or `streamlink`.

---

<h2 align="center">📜 Useful Commands</h2>

```powershell
npm run dev            # overlay/editor plus local backend
npm run build          # production build for OBS/local serving
npm run start:stream   # serve built overlay plus local bot/backend
npm run desktop:dev    # desktop app dev mode
npm run desktop:start  # built desktop app from this checkout
npm run desktop:pack   # unpacked Electron build
npm test               # vitest suite
npm run bench:fish     # Fish Speech websocket latency benchmark
npm run bench:pipeline # LLM-to-Fish pipeline latency benchmark
```

<details>
<summary><b>Backend-only workflows</b></summary>

```powershell
npm run dev:ai       # AI server only
npm run dev:bot      # bot with mocked Twitch source
npm run dev:bot:irc  # bot with real Twitch IRC
npm run build:bot    # compile server TypeScript
```

</details>

---

<h2 align="center">📂 Project Layout</h2>

```text
src/                 React overlay / editor
electron/            Electron desktop shell and preload bridge
server/src/          Local AI, Twitch, TTS, websocket backend
public/assets/       VRM, background, animation assets
public/cdn-assets/   Large static local assets
docs/                Focused local runtime notes
vendor/              Vendored runtime packages
scripts/             Benchmarks and utility scripts
```

---

<h2 align="center">✅ Truth Table</h2>

<table align="center">
  <tr>
    <th>Claim</th>
    <th>Status</th>
  </tr>
  <tr>
    <td>Local-first app</td>
    <td>True: app state and runtime shell are local</td>
  </tr>
  <tr>
    <td>Desktop app</td>
    <td>Electron wrapper added; renderer and backend are still the same local stack</td>
  </tr>
  <tr>
    <td>Hosted accounts</td>
    <td>Not part of this release</td>
  </tr>
  <tr>
    <td>Supabase/Vercel cloud sync</td>
    <td>Not part of this release</td>
  </tr>
  <tr>
    <td>Payments/credits</td>
    <td>Not part of this release</td>
  </tr>
  <tr>
    <td>Provider calls</td>
    <td>External when enabled and configured</td>
  </tr>
  <tr>
    <td>Browser provider keys</td>
    <td>Stored in browser <code>localStorage</code>; sent to local backend per request</td>
  </tr>
  <tr>
    <td>Local mic chat</td>
    <td>Not claimed; current queue is local text chat plus Twitch chat</td>
  </tr>
  <tr>
    <td>Stream audio transcription</td>
    <td>Optional ambient context, not a chat turn</td>
  </tr>
  <tr>
    <td>Stream image context</td>
    <td>Optional ambient context when enabled and model-supported</td>
  </tr>
  <tr>
    <td>OpenAI transport/state</td>
    <td>Supports configured HTTP stream, WebSocket, conversation, previous-response, or stateless modes</td>
  </tr>
  <tr>
    <td>OpenRouter transport/state</td>
    <td>Normalized to HTTP stream and app-owned stateless state by default</td>
  </tr>
  <tr>
    <td>License</td>
    <td><code>UNLICENSED</code> in <code>package.json</code></td>
  </tr>
</table>

---

<h2 align="center">🧭 Release Scope</h2>

<p align="center">
  This repo is the local-first public release line for Web Waifu 4. The hosted
  BYOK/Supabase/Vercel experiment is intentionally not part of this release
  path. The goal here is a self-owned desktop/OBS workflow that users can run,
  configure, and back up themselves.
</p>

<div align="center">

---

**Built for streamers who'd rather own their stack than rent it.**

</div>
