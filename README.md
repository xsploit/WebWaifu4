# YourWifey Stream

Source-of-truth README for the standalone Twitch-first web waifu stream overlay.

Current as of 2026-05-14. This file should describe what the repo actually does
today. If code and this README disagree, fix the README or the code in the same
change.

## What This Is

YourWifey Stream is a React/Vite browser overlay with a VRM avatar, Twitch chat
intake, OpenAI-backed replies, browser/local and remote TTS, subtitles, memory,
and animation metadata.

The current product target is not a single-user chat toy. It is a Twitch-first
stream assistant where Twitch chat and the local chat box both become normalized
participant turns. The local chat box still has trusted/controller power, but it
is rendered to the AI as another participant in the room.

## Current Architecture

```text
Browser overlay
  React UI, VRM stage, settings menu, local chat, direct Twitch IRC
  -> normalizes local/Twitch input into ChatTurn
  -> queues or batches chat work
  -> renders POML prompt context
  -> calls local/server AI proxy
  -> streams text into subtitles/TTS/animation metadata

AI/TTS server
  Node HTTP server on BOT_PORT, default 8787
  -> /health
  -> /ai/chat
  -> /ai/poml/render
  -> /ai/embeddings
  -> /tts/voices
  -> /tts/stream
  -> /ws overlay event socket

Stream routelet
  Linux VPS runner
  -> starts built overlay
  -> starts Chromium under Xvfb
  -> routes browser audio into Pulse/PipeWire
  -> FFmpeg maps Chromium video plus browser audio to RTMP
```

The browser is the primary Twitch reader. The server defaults to
`TWITCH_MOCK=true`, which means "server Twitch is off / client-direct mode" in
normal overlay operation. Use `TWITCH_MOCK=false` only when intentionally testing
the older server-owned IRC path.

## Important Source Files

- `src/App.tsx`: main overlay shell, chat intake, queueing, prompt calls, TTS,
  model/persona switching, settings wiring, command handling.
- `src/lib/chat/chat-turn.ts`: normalized `ChatTurn` model for local and Twitch
  participant messages.
- `src/lib/chat/templates/yourwifey-responses.poml`: live POML prompt template.
- `src/lib/chat/poml.ts`: browser/server POML render helper.
- `src/lib/chat/prompt.ts`: prompt context builder that feeds POML.
- `src/lib/chat/grillo-context.ts`: Grillo-style strict context lanes and budget
  reduction.
- `src/lib/chat/grillo-memory.ts`: browser localStorage memory repository.
- `src/lib/chat/grillo-memory-loop.ts`: structured JSON memory worker/tool loop.
- `src/lib/chat/reply-metadata.ts`: hidden reply metadata contract and mapping
  to animation/facial expression.
- `src/lib/tts/manager.ts`: browser TTS playback, queueing, audio capture, and
  lip sync.
- `server/src/index.ts`: local/server HTTP API, SSE streaming, embeddings, TTS
  proxy, health, overlay socket, mock/server IRC entrypoints.
- `server/src/ai/OpenAiResponsesProvider.ts`: OpenAI Responses API provider,
  conversation/previous-response/stateless modes, WebSocket/HTTP streaming, and
  Tavily tool calls.
- `server/src/tts/RemoteTtsProvider.ts`: Fish Speech and Inworld TTS adapters.
- `src/lib/vrm/sequencer.ts`: bundled animation catalog, weights, and sequencer.
- `scripts/stream-routelet.sh`: Linux stream loop for Chromium/Xvfb/Pulse/FFmpeg.
- `docs/grillo-memory-status.md`: current memory-system status and completion bar.
- `docs/STREAM_ROUTELET.md`: routelet signal flow and VPS smoke-test notes.

## Chat Model

All chat intake should flow through one shape:

```ts
type ChatTurn = {
  source: 'local' | 'twitch';
  channel: string;
  login: string;
  displayName: string;
  text: string;
  timestamp: number;
  badges: string[];
  isMod: boolean;
  isBroadcaster: boolean;
  isLocal: boolean;
  isTrustedController: boolean;
  firstTimeChatter?: boolean;
};
```

Current behavior:

- Local chat becomes `source: "local"`, `channel: "local"`,
  `isLocal: true`, and `isTrustedController: true`.
- Twitch chat becomes `source: "twitch"` with channel, login, display name,
  badges, broadcaster/mod metadata, and a derived trusted-controller flag.
- The local controller is not assumed for every Twitch message.
- The prompt transcript renders participant lines like
  `DisplayName: message` plus metadata.

## Twitch Intake Rules

Default constants in `src/App.tsx`:

- Active chatter window: 120 seconds.
- Direct-mode threshold: 10 active chatters.
- Reply gap/cooldown: 2 seconds.
- Twitch context window: 80 turns.
- Default batch max wait: 30 seconds.

Under the active chatter threshold, tagged Twitch messages and local participant
messages go into the same sequential reply queue. The app waits for the current
reply/TTS path to complete and applies the cooldown before processing the next
queued job.

Above the threshold, Twitch chat enters balanced batch mode. The app batches room
context by message count/time while local trusted turns and commands can still
force operator-style work.

## Commands

Client-side startup currently advertises these commands:

```text
!yw help
!yw status
!yw audio
!yw state
!yw state reset
!yw refresh
!yw channel <name>
!yw persona <riko|neuro|hikari>
!yw llm <model>
!yw vrm <id>
!yw camera close|full
!yw anim <name|index>
!yw tts on|off
!yw autospeak on|off
!yw say <text>
!yw chat on|off
```

Server-side command prefixes default to:

```text
!yw, !yourwifey, !waifu
```

Server-side admins always include `subsect`; mods are allowed by default.

## AI Provider

Default app model settings:

- Chat model: `gpt-5.4-nano`
- Memory worker model: `gpt-5.4-mini`
- Browser AI transport mode: `websocket`
- OpenAI state mode: `conversation`
- Temperature: `0.85`
- Max output tokens: `300`

Server provider modes:

- `AI_PROVIDER=mock`
- `AI_PROVIDER=openai-compatible`
- `AI_PROVIDER=openai-responses`
- `AI_PROVIDER=openai-responses-ws`

The OpenAI Responses provider supports:

- `/responses` HTTP calls.
- HTTP streaming.
- Responses WebSocket requests.
- Conversations API state.
- `previous_response_id` state where supported.
- Stateless mode for memory/background work.
- Prompt cache key and retention fields.
- JSON schema / JSON object response formats.
- Tavily-backed tool calls when `TAVILY_API_KEY` is configured.

Conversation state is scoped by keys such as:

```text
twitch:<channel>:persona:<persona-id>
local:persona:<persona-id>
```

Memory/background requests use separate state scope or stateless behavior so
they do not contaminate the live chat conversation.

## POML Prompting

POML is real in this repo. The template is
`src/lib/chat/templates/yourwifey-responses.poml`, and the package dependency is
`pomljs` from `vendor/pomljs-0.0.9.tgz`.

The prompt path renders:

- Persona context.
- Live task.
- Prompt state.
- Response priority stack.
- Style controls.
- Conditional local/Twitch/batch mode.
- Relationship dynamics.
- Tool policy.
- Reply metadata contract.
- TTS instructions.
- Animation catalog.
- Turn metadata.
- Grillo context packet.
- Private diary and semantic memory, when relevant.
- Current turn transcript as a human message.

The app owns state mutation, memory writes, TTS playback, and avatar execution.
POML owns prompt layout and conditional context.

## Memory System

There are two memory layers right now.

Legacy relationship memory:

- Stored in browser localStorage.
- Tracks relationship stage, mood, trust, attraction, respect, irritation,
  jealousy, guard, facts, summary, diary entry, and diary history.
- Still used for persona tone and continuity.

Grillo-style memory:

- Stored in browser localStorage under scoped keys.
- Tracks memory candidates, promoted memory blocks, diary entries, and promoted
  candidate ids.
- Scopes by conversation/source/persona and participant key.
- Adds strict context lanes: `background_information`, `instructions`,
  `channel_history`, `relationship_memory`, `recalled_memories`, `thoughts`,
  and `output_description`.
- Has a background memory worker that uses structured JSON/tool-call shaped
  output to read/search/write local memory state.
- The Memory tab exposes current scope, blocks, candidates, diary entries,
  promoted count, and recent worker state.

Semantic vector memory:

- Stored in browser IndexedDB when available.
- Migrates/falls back to the older semantic memory localStorage records.
- Calls `/ai/embeddings` to embed the current query before prompt build when the
  active scope already has records.
- Saves completed user/assistant turns with their embedding after each reply.
- Searches locally in the browser with cosine similarity plus lexical and recency
  scoring, then injects the top matches into the Grillo/POML context.

Current limitation: durable server JSONL/SQLite memory is not implemented yet.
The current Grillo repository is browser localStorage, while semantic vector
memory is browser IndexedDB/localStorage fallback.

## TTS

Supported providers:

- Piper in browser.
- Fish Speech through server `/tts/stream`.
- Inworld through server `/tts/stream`.

Default app TTS settings:

- Provider: Piper.
- Auto-speak: on.
- Simulated streaming display: on.
- Remote TTS mode default: `live-bridge`.
- Fish model default: `s2`.
- Fish latency default: `balanced`.
- Fish condition-on-previous-chunks: on.
- Inworld model default: `inworld-tts-2`.
- Inworld delivery mode default: `BALANCED`.

Remote TTS behavior:

- Fish Speech is the real live bridge. OpenAI text deltas can be streamed into a
  single Fish realtime TTS request.
- Inworld uses the installed SDK `stream()` path. Inworld `live-bridge` is
  normalized to full-response mode because the current adapter is not a fake
  bidirectional bridge.
- Sentence-chunk mode exists for remote providers that need smaller text
  windows.

Browser audio exposes:

```js
window.__yourwifeyAudio?.resume();
window.__yourwifeyAudio?.getStream();
```

The routelet captures the actual Chromium/WebAudio output through Pulse/PipeWire
for FFmpeg.

## VRM, Animations, And Visuals

Default bundled model id is `neuro-sama`.

Bundled model labels in `src/App.tsx` include:

- Riko Final Fixed
- Peak Riko
- Hikari / Hikky C
- Neuro-sama
- Neuro Clown

Animation support includes:

- Legacy FBX idle/thinking animations.
- Sachi VRMA animations.
- Silly BVH animations.
- Silly Tavern BVH manifest animations.

The sequencer stores per-animation:

- `enabled`
- `experimental`
- `weight`
- `loopEligible`
- `purpose`
- `tags`

Reply metadata maps AI intent to facial expression and animation:

```text
emotion, expression, motion, purpose, intensity, animation
```

Movement and pose animations are intentionally discouraged for normal replies
unless the AI or user explicitly asks for them.

Visual settings include locked/custom camera, model position/rotation/scale,
auto blink, auto gaze, pointer-follow option, arm clip guard, crossfade duration,
anime outline, exposure, RGB color correction, and lighting controls.

## Settings UI

The side settings panel is the primary operator surface. Current tabs:

- Avatar
- Animation
- Character
- AI
- Twitch
- Memory
- TTS

State is persisted in browser localStorage for personas, active persona, AI/TTS
settings, chat history, relationship memory, scoped relationship memories, UI
state, active tab, current bundled model, sequencer settings, and visual
settings.

## Environment

Start from `.env.example`.

Core browser/server flags:

```text
VITE_TWITCH_CHANNEL=subsect
VITE_DIRECT_TWITCH_CHAT=true
VITE_STREAM_BOT_WS_ENABLED=false
VITE_AI_PROXY_ENABLED=true
VITE_OPENAI_MODEL=gpt-5.4-nano
VITE_AUTO_RESUME_AUDIO=false
VITE_RUN_GAME_SDK_ENABLED=false

TWITCH_MOCK=true
TWITCH_CHANNEL=subsect
COMMAND_ADMINS=subsect

AI_PROVIDER=openai-responses
OPENAI_MODEL=gpt-5.4-nano
OPENAI_WS_URL=wss://api.openai.com/v1/responses
OPENAI_STATE_MODE=conversation
OPENAI_PROMPT_CACHE_KEY=yourwifey-stream
OPENAI_REASONING_EFFORT=none
OPENAI_STORE=false
```

Do not put the OpenAI API key in a `VITE_` variable. The browser calls the
server/API proxy, and the proxy owns provider credentials.

## Local Startup

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

`npm run dev` starts both overlay and AI server:

- Vite overlay: default Vite port.
- AI/TTS server: `127.0.0.1:8787`.
- Browser Twitch IRC: direct/client-side.
- Server Twitch: mock/client-direct mode.

Useful alternatives:

```powershell
npm run dev:overlay
npm run dev:ai
npm run dev:bot:irc
npm run preview
npm run start:stream
```

Use `dev:bot:irc` only when intentionally testing server-owned Twitch IRC.

## Build And Test

Full build:

```powershell
npm run build
```

This runs:

```text
tsc && vite build
tsc -p tsconfig.server.json
tsc -p tsconfig.api.json
```

Tests:

```powershell
npx vitest run
```

Useful focused tests:

```powershell
npx vitest run src/lib/chat/chat-turn.test.ts
npx vitest run src/lib/chat/prompt.test.ts
npx vitest run src/lib/chat/grillo-context.test.ts
npx vitest run src/lib/chat/grillo-memory.test.ts
npx vitest run src/lib/chat/grillo-memory-loop.test.ts
npx vitest run server/src/ai/OpenAiResponsesProvider.test.ts
npx vitest run server/src/tts/RemoteTtsProvider.test.ts
```

Expected build warnings today:

- `onnxruntime-web` uses eval in the bundled runtime.
- Vite warns that some output chunks are larger than 500 kB.

## VPS / Streaming Reality

Vercel can host the overlay and serverless API routes, but it is not the right
place for a long-running FFmpeg stream. Actual RTMP streaming needs a persistent
Linux box or cloud PC with Chromium, an audio device/sink, and FFmpeg.

The routelet signal flow is documented in `docs/STREAM_ROUTELET.md`.

Minimal package set on Ubuntu:

```bash
sudo apt update
sudo apt install -y ffmpeg xvfb x11-utils curl pulseaudio-utils pulseaudio
```

The routelet expects a built app, Chrome/Chromium, an overlay URL, and an RTMP
output. For Twitch:

```bash
export TWITCH_STREAM_KEY='live_...'
npm run stream:routelet
```

Important FFmpeg map:

```bash
-f x11grab -i :99.0+0,0
-f pulse -i yourwifey_stream.monitor
-map 0:v:0 -map 1:a:0
```

## Serverless API Routes

The `api/` folder mirrors core routes for serverless deployments:

- `api/ai/chat.ts`
- `api/ai/embeddings.ts`
- `api/ai/poml/render.ts`

The long-running Node server in `server/src/index.ts` is still the practical
local/VPS runtime because it also owns overlay WebSocket events, mock/server IRC,
and remote TTS streaming.

## What Is Not Done Yet

- Durable server-side Grillo/vector memory repository. Current Grillo memory is
  browser localStorage and semantic vector memory is browser IndexedDB.
- Full database-backed multi-browser memory sync.
- Inworld true bidirectional live bridge. Current Inworld path is SDK
  full-response stream or sentence chunks.
- GPU-native streaming stack. Current routelet is Chromium plus FFmpeg.
- A perfect animation set. The app supports FBX, VRMA, and BVH assets, but asset
  quality still varies and bad clips should be disabled or down-weighted.

## Development Rules For This Repo

- Treat this README as the factual entry point.
- Use existing code paths before adding parallel systems.
- Keep Twitch and local chat unified through `ChatTurn`.
- Keep POML prompt rendering real and test rendered output, not only templates.
- Keep OpenAI chat state scoped by source/channel/persona.
- Keep memory worker requests isolated from live chat state.
- Commit coherent checkpoints and run the smallest relevant verification.
