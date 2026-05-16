# YourWifey BYOK

Source-of-truth README for the current YourWifey BYOK / stream overlay repo.

Current as of 2026-05-16. This document is intentionally factual. If this file
and the code disagree, fix one of them in the same checkpoint.

## What This Is

YourWifey is a React/Vite browser overlay for a live AI VTuber-style stream
assistant. It combines:

- VRM avatar rendering and animation sequencing.
- Local chat and direct browser-side Twitch IRC intake.
- OpenAI Responses API chat through a backend proxy.
- Browser-local BYOK provider keys.
- Fish Speech, Inworld, and Piper TTS paths.
- POML prompt rendering.
- Local relationship memory, diary, Grillo-style memory, and semantic memory.
- Supabase-backed product/auth/cloud-sync scaffolding.
- A VPS/routelet deployment path for live streaming experiments.

It is not a finished commercial product yet. It is a working prototype/product
shell with several real systems wired and several still-partial product pieces.

## Repository State

- Main working branch: `codex/byok-product-spine`
- GitHub remote: `origin` points at `xsploit/yourwifey-stream`
- Local target repo: `C:\Users\SUBSECT\Documents\GitHub\YourWifey-BYOK`
- Current live fun VPS: `https://148-113-191-103.sslip.io/`
- VPS app path: `/home/ubuntu/yourwifey-stream`
- VPS API service: `yourwifey-ai.service` on port `8787`
- VPS static overlay server: `serve-dist.mjs` on port `4173`

Key status docs:

- `docs/PRODUCTIZATION_RALPH_STATUS.md`
- `docs/BYOK_PRODUCT_STATUS.md`
- `docs/BYOK_PRODUCT_PLAN.md`
- `docs/OVH_VPS_DEPLOY_RUNBOOK.md`
- `docs/VERCEL_SUPABASE_BYOK.md`
- `docs/grillo-memory-status.md`

## Quick Commands

Install:

```powershell
npm install
```

Run overlay plus local AI proxy:

```powershell
npm run dev
```

Run only the overlay:

```powershell
npm run dev:overlay
```

Run only the AI/TTS server:

```powershell
npm run dev:ai
```

Build everything:

```powershell
npm run build
```

Focused verification used most often:

```powershell
npx vitest run server/src/ai/OpenAiResponsesProvider.test.ts api/ai/chat.test.ts src/lib/product/provider-key-vault.test.ts
git diff --check
npm run build
```

## Current Runtime Shape

```text
Browser app
  React/Vite UI
  VRM stage
  settings panel
  local chat
  browser Twitch IRC
  browser-local provider key vault
  IndexedDB/localStorage memory/settings
        |
        v
Node AI/TTS proxy
  /health
  /ai/chat
  /ai/models
  /ai/embeddings
  /ai/poml/render
  /tts/voices
  /tts/stream
  /ws overlay socket
        |
        v
Provider APIs
  OpenAI Responses
  OpenRouter Responses-compatible path
  Tavily
  Fish Speech
  Inworld
```

For the VPS, `serve-dist.mjs` serves the built `dist` folder and proxies
`/api/ai/*`, `/api/tts/*`, and `/api/mock/*` to the Node server on `8787`.

For Vercel-shaped deployment, the frontend serves from `dist` and serverless
API routes live under `api/**`.

## What Works Right Now

### Overlay

- Main editor/overlay page loads.
- Dashboard/account/login/overlay route shell exists.
- VRM rendering and model switching exist.
- Character/persona switching exists.
- Character background/persona defaults exist.
- Animation sequencing exists with weighted categories.
- Local chat and Twitch chat go through normalized chat turns.
- Chat panel and settings persistence exist.

### Twitch Intake

- Browser-side direct Twitch IRC is the expected normal mode.
- Server Twitch defaults to mock/client-direct mode.
- Local chat is treated as a participant turn, not as a magic single-user path.
- Local chat is also trusted/controller-capable.
- Twitch metadata includes source/channel/login/display/badges/mod/broadcaster
  where available.
- Under the active chatter threshold, direct tagged Twitch and local messages go
  into a sequential queue.
- Over the threshold, Twitch can batch messages into a room-context turn.

Current queue constants live in `src/App.tsx`:

- Active chatter window: 120 seconds.
- Direct-mode threshold: 10 active chatters.
- Reply cooldown: 2 seconds.
- Twitch context window: 80 turns.
- Default batch max wait: 30 seconds.

### OpenAI / AI

- OpenAI Responses API is the primary backend path.
- Responses WebSocket mode works again after fixing premature stream terminal
  event handling.
- Conversations API state is supported.
- Conversation state is scoped by channel/persona, for example:
  - `local:persona:hikari-chan`
  - `twitch:subsect:persona:hikari-chan`
- HTTP streaming mode also works.
- Previous-response mode exists where supported.
- Stateless mode exists for memory/background work.
- Prompt cache fields are sent when configured.
- `max_output_tokens` is wired from the UI max output setting to the backend
  Responses payload.
- `OPENAI_REASONING_EFFORT=none` means no `reasoning` object is sent.
- Runtime compatibility handling strips unsupported `reasoning` or
  `temperature` if the provider rejects that parameter, then remembers that
  model capability for the process lifetime.
- Tavily tools can be provided from the browser-local vault and routed through
  the backend.

Recent live smoke on the VPS confirmed WebSocket + conversation can return:

```text
delta: OK
done: OK
provider: openai-responses-ws
stateMode: conversation
transport: websocket
reasoningEffort: null
```

### POML Prompting

POML is real here. The prompt template is:

```text
src/lib/chat/templates/yourwifey-responses.poml
```

The installed dependency is:

```text
pomljs: file:vendor/pomljs-0.0.9.tgz
```

The prompt path renders persona, current turn metadata, Twitch/local mode,
relationship memory, Grillo context, diary, semantic memory, TTS policy,
animation catalog, tool policy, and reply metadata instructions.

Important files:

- `src/lib/chat/prompt.ts`
- `src/lib/chat/poml.ts`
- `server/src/ai/PomlRenderer.ts`
- `api/ai/poml/render.ts`

### Memory

Current memory is browser-first.

Relationship memory:

- Stored locally.
- Tracks stage, mood, trust, attraction, respect, irritation, jealousy, guard,
  facts, summary, diary entry, and diary history.

Grillo-style memory:

- Stored locally.
- Has candidate memories, promoted memory blocks, diary entries, and background
  worker/tool-loop behavior.

Semantic memory:

- Uses local browser storage and embeddings where available.
- Falls back instead of blocking chat when embeddings are unavailable.

This is not yet a robust multi-user cloud memory product.

### TTS

Piper:

- Browser/local TTS path.
- Uses web worker and local browser audio.

Fish Speech:

- Remote provider path exists.
- Voice listing through `/tts/voices` works.
- Live bridge mode streams text into backend TTS.
- Browser supplies provider key headers from the local vault when configured.

Inworld:

- Remote provider path exists.
- SDK/package is present.
- Still needs more real-world testing for best low-latency streaming behavior.

### BYOK Product Shell

BYOK means provider API keys are intended to stay browser-local for v1.

Current browser-local key slots include:

- OpenAI
- OpenRouter
- Fish Speech
- Inworld
- Tavily

The backend receives provider keys from the browser as request headers for the
active request. Provider keys are not supposed to be stored in Supabase cloud
settings.

### Supabase / Cloud Product Scaffolding

Supabase is the chosen product stack for:

- Magic-link auth.
- Profiles.
- Workspaces.
- Scenes.
- Scene settings.
- Overlay tokens.
- Storage contract.

There is a migration:

```text
supabase/migrations/20260515000100_byok_product_spine.sql
```

Serverless BYOK routes exist under:

```text
api/byok/**
```

Cloud settings sync exists as a product path, but provider secrets remain
local-only by design.

## What Is Partial Or Not Done

- This is not production-ready commercial software.
- Stripe/payments/credits are intentionally not implemented in this BYOK fork.
- Public OBS overlay sharing exists as signed-token route work, but token
  lifecycle/revocation still needs more hardening.
- Supabase product data routes exist, but more browser smoke and policy review
  are still needed.
- Cloud memory is not the main memory system yet.
- Provider API keys do not have a hosted encrypted vault.
- TTS streaming still needs more real-stream soak testing, especially Fish and
  Inworld under long replies and queue pressure.
- The UI is functional but still needs a serious product/design pass.
- The VPS is a fun/live test box, not the final product deployment target.
- Vercel is the intended product-shaped deployment target, but WebSocket-heavy
  live workloads may still need a separate long-running worker.

## OpenRouter Truth

OpenRouter support exists, but it is not equivalent to OpenAI Conversations API.

The OpenRouter path is treated as app-owned state:

- No provider conversation object.
- No assumption of provider-side statefulness.
- App resends rendered POML, transcript, diary, Grillo memory, and semantic
  memory context.
- OpenRouter is labeled as `OpenRouter Responses (App Memory)`.

Use OpenAI Responses when you want provider Conversations API behavior.

## Important Settings Truth

- Max output is wired to `max_output_tokens`.
- Temperature is sent when allowed and stripped only if the provider rejects it.
- Reasoning is disabled when configured as `none`.
- WebSocket status in the AI tab should reflect the selected transport mode.
- WebSocket requests are request-scoped: the socket opens per reply and is idle
  between replies.
- Tools display as available only when Tavily is configured through server env
  or browser-vault header.

## Environment

Start from:

```text
.env.example
```

Important local/VPS values:

```text
AI_PROVIDER=openai-responses-ws
OPENAI_MODEL=gpt-5.4-nano
OPENAI_WS_URL=wss://api.openai.com/v1/responses
OPENAI_REASONING_EFFORT=none
TWITCH_MOCK=true
BOT_PORT=8787
TTS_PROVIDER=piper
```

Important Supabase values:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
SUPABASE_JWT_SECRET
SUPABASE_STORAGE_BUCKET
OVERLAY_SIGNING_SECRET
```

Do not add `VITE_` provider API secrets. Provider keys are user BYOK values and
belong in the browser-local provider vault.

## Core Files

Frontend:

- `src/App.tsx`
- `src/components/menu/SettingsPanel.tsx`
- `src/components/menu/tabs/*`
- `src/lib/chat/*`
- `src/lib/tts/*`
- `src/lib/vrm/*`
- `src/lib/product/*`

Backend:

- `server/src/index.ts`
- `server/src/config.ts`
- `server/src/ai/OpenAiResponsesProvider.ts`
- `server/src/ai/TavilyTools.ts`
- `server/src/tts/RemoteTtsProvider.ts`
- `server/src/commands/*`
- `server/src/twitch/*`

Serverless:

- `api/ai/chat.ts`
- `api/ai/embeddings.ts`
- `api/ai/poml/render.ts`
- `api/byok/**`

Deployment:

- `serve-dist.mjs`
- `scripts/stream-routelet.sh`
- `vercel.json`
- `docs/OVH_VPS_DEPLOY_RUNBOOK.md`
- `docs/VERCEL_SUPABASE_BYOK.md`

## Known Sharp Edges

- `npm run build` currently emits expected Vite warnings about
  `onnxruntime-web` using eval and large chunks.
- WebSocket Responses must wait for `response.completed`; lifecycle events like
  `response.output_text.done` are not final completion.
- Low max-output values can still cause incomplete replies, especially on
  reasoning-style models.
- Remote TTS and live-bridge paths can affect perceived chat latency.
- Restarting the VPS service can hang if stale processes still hold ports
  `8787` or `4173`; use the VPS runbook.
- Some product docs contain older checkpoint history; this README is the
  shortest current truth layer.

## Minimum Ship Checks

Before saying a checkpoint is good:

```powershell
npx vitest run server/src/ai/OpenAiResponsesProvider.test.ts api/ai/chat.test.ts src/lib/product/provider-key-vault.test.ts
git diff --check
npm run build
```

For product/auth/Supabase work, also run relevant tests under:

```text
src/lib/product/*.test.ts
api/byok/**/*.test.ts
```

For prompt/POML work, verify the actual rendered prompt path, not just the
template file.

## Current Next Work

Highest-value next checks:

- Browser smoke with saved OpenAI key in WebSocket + conversation mode.
- Browser smoke for Fish/Inworld BYOK keys and long TTS replies.
- Confirm semantic memory lookup/write after real chat.
- Review and harden signed overlay token lifecycle.
- Continue UI/product polish from the current theme instead of generic SaaS UI.
- Decide whether long-running WebSocket/TTS work stays on VPS/worker while the
  dashboard deploys on Vercel.
