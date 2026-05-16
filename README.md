# YourWifey BYOK

YourWifey BYOK is a Twitch-first AI stream assistant and browser overlay. It
combines a VRM avatar, local and Twitch chat intake, OpenAI Responses-powered
conversation, browser-local provider keys, TTS, memory, animation metadata, and
a Supabase-backed product shell.

This README reflects the current repo state as of **2026-05-16**. It is meant
to be operational, not aspirational: if code and this document disagree, update
one of them in the same checkpoint.

## Status At A Glance

| Area                       | Current Status                                                            |
| -------------------------- | ------------------------------------------------------------------------- |
| Overlay/editor             | Working prototype                                                         |
| Local chat + Twitch intake | Working, unified through normalized chat turns                            |
| OpenAI Responses           | Working through backend proxy                                             |
| Responses WebSocket        | Working, request-scoped per reply                                         |
| Conversations API          | Working, scoped by persona/channel                                        |
| OpenRouter                 | Partial, app-owned memory only                                            |
| TTS                        | Piper works locally; Fish/Inworld routes exist and need more soak testing |
| Memory                     | Browser-first relationship, diary, Grillo, and semantic memory            |
| BYOK keys                  | Browser-local vault, sent to backend per request                          |
| Supabase product shell     | Implemented scaffold, still needs more product hardening                  |
| Payments/credits           | Not implemented in this fork                                              |
| Production readiness       | Not ready for commercial launch                                           |

## What This Project Does

YourWifey turns chat input into a live avatar response loop:

1. Local chat and Twitch IRC messages become normalized participant turns.
2. Messages are queued or batched based on chat activity.
3. The app builds a POML-rendered prompt with persona, chat metadata, memory,
   tools, TTS policy, and animation context.
4. The backend calls OpenAI Responses or a compatible provider.
5. Text streams into subtitles and TTS.
6. Reply metadata drives animation and expression selection.
7. Browser audio can be captured by the streaming routelet for OBS/RTMP tests.

The intended product direction is a BYOK stream assistant: users bring their
own OpenAI/Fish/Inworld/Tavily keys, keep provider secrets local, and optionally
sync safe profile/workspace/scene settings through Supabase.

## Repository And Runtime

| Item                | Value                                              |
| ------------------- | -------------------------------------------------- |
| Local repo          | `C:\Users\SUBSECT\Documents\GitHub\YourWifey-BYOK` |
| Main working branch | `codex/byok-product-spine`                         |
| GitHub remote       | `xsploit/yourwifey-stream`                         |
| Live test URL       | `https://148-113-191-103.sslip.io/`                |
| VPS app directory   | `/home/ubuntu/yourwifey-stream`                    |
| VPS API service     | `yourwifey-ai.service` on `:8787`                  |
| VPS static overlay  | `serve-dist.mjs` on `:4173`                        |

Status and planning docs:

- `docs/PRODUCTIZATION_RALPH_STATUS.md`
- `docs/BYOK_PRODUCT_STATUS.md`
- `docs/BYOK_PRODUCT_PLAN.md`
- `docs/OVH_VPS_DEPLOY_RUNBOOK.md`
- `docs/VERCEL_SUPABASE_BYOK.md`
- `docs/grillo-memory-status.md`

## Architecture

```text
Browser app
  React / Vite UI
  VRM stage
  settings panel
  local chat
  browser-side Twitch IRC
  browser-local provider key vault
  IndexedDB / localStorage memory and settings
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
  Tavily tools
  Fish Speech
  Inworld TTS
```

For the VPS deployment, `serve-dist.mjs` serves `dist` and proxies
`/api/ai/*`, `/api/tts/*`, and `/api/mock/*` to the Node server on port `8787`.

For Vercel-shaped deployment, static output comes from `dist` and serverless
routes live under `api/**`.

## Quick Start

Install dependencies:

```powershell
npm install
```

Run the overlay and local AI/TTS proxy:

```powershell
npm run dev
```

Run pieces separately:

```powershell
npm run dev:overlay
npm run dev:ai
```

Build everything:

```powershell
npm run build
```

Focused verification for common AI/provider changes:

```powershell
npx vitest run server/src/ai/OpenAiResponsesProvider.test.ts api/ai/chat.test.ts src/lib/product/provider-key-vault.test.ts
git diff --check
npm run build
```

## Configuration

Start from:

```text
.env.example
```

Common local/VPS settings:

```text
AI_PROVIDER=openai-responses-ws
OPENAI_MODEL=gpt-5.4-nano
OPENAI_WS_URL=wss://api.openai.com/v1/responses
OPENAI_REASONING_EFFORT=none
TWITCH_MOCK=true
BOT_PORT=8787
TTS_PROVIDER=piper
```

Supabase product settings:

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

Provider API keys are BYOK values. They should be stored through the
browser-local provider vault, not as `VITE_` provider secret variables.

## Chat And Twitch Intake

The app is no longer a single-user chat toy with Twitch attached. Local chat and
Twitch chat both flow through the same participant-turn model.

Current behavior:

- Local chat uses `source: "local"`, `channel: "local"`, `isLocal: true`, and
  `isTrustedController: true`.
- Twitch chat uses `source: "twitch"` with channel, login, display name,
  badges, moderator/broadcaster flags, and trusted-controller derivation.
- The AI is told who is speaking and whether that speaker is trusted.
- The local controller is not assumed to be every Twitch chatter.

Queue behavior:

- Active chatter window: 120 seconds.
- Direct mode threshold: 10 active chatters.
- Reply cooldown: 2 seconds.
- Twitch context window: 80 turns.
- Default batch max wait: 30 seconds.

Under the threshold, tagged Twitch messages and local messages enter the same
sequential queue. Over the threshold, Twitch moves toward batch mode while local
trusted commands can still act as operator input.

## AI Provider Behavior

OpenAI Responses is the primary stateful provider path.

Supported modes:

- HTTP Responses calls.
- HTTP streaming.
- Responses WebSocket.
- Conversations API state.
- Previous-response state where supported.
- Stateless mode for memory/background work.
- JSON schema / JSON object response formats.
- Tavily tool calls.

Conversation state is scoped by keys such as:

```text
local:persona:hikari-chan
twitch:subsect:persona:hikari-chan
```

Important settings:

- Max output is wired to `max_output_tokens`.
- `OPENAI_REASONING_EFFORT=none` sends no `reasoning` object.
- Temperature is sent when supported.
- If a provider rejects `reasoning` or `temperature`, the backend strips only
  that unsupported parameter, retries, and remembers the model capability for
  the process lifetime.
- WebSocket requests are request-scoped: the socket opens per reply and is idle
  between replies.
- Responses WebSocket parsing must wait for `response.completed`; lifecycle
  events such as `response.output_text.done` are not final completion.

Recent VPS smoke confirmed:

```text
delta: OK
done: OK
provider: openai-responses-ws
stateMode: conversation
transport: websocket
reasoningEffort: null
```

## OpenRouter

OpenRouter support exists, but it is not equivalent to OpenAI Conversations.

Current OpenRouter behavior:

- Uses an OpenRouter Responses-compatible path.
- Runs as app-owned state.
- Does not assume provider-side conversation objects.
- Resends rendered POML, transcript, diary, Grillo memory, and semantic memory
  context from the app.
- Is labeled in the UI as `OpenRouter Responses (App Memory)`.

Use OpenAI Responses when provider Conversations API behavior matters.

## Prompting With POML

POML is part of the real prompt path.

Template:

```text
src/lib/chat/templates/yourwifey-responses.poml
```

Dependency:

```text
pomljs: file:vendor/pomljs-0.0.9.tgz
```

The POML path renders:

- Persona and style controls.
- Current local/Twitch turn metadata.
- Twitch direct/batch mode context.
- Relationship memory.
- Grillo context.
- Diary and semantic memory, when relevant.
- TTS policy.
- Animation catalog.
- Tool policy.
- Reply metadata instructions.

Prompt-related files:

- `src/lib/chat/prompt.ts`
- `src/lib/chat/poml.ts`
- `server/src/ai/PomlRenderer.ts`
- `api/ai/poml/render.ts`

For prompt changes, verify the rendered output path instead of only reading the
template file.

## Memory

The current memory system is browser-first.

| Layer               | Storage                                     | Current Use                                        |
| ------------------- | ------------------------------------------- | -------------------------------------------------- |
| Relationship memory | Browser local storage                       | Mood, relationship stage, facts, diary summary     |
| Grillo memory       | Browser local storage                       | Candidate memories, promoted blocks, diary entries |
| Semantic memory     | Browser storage + embeddings when available | Relevant recalled turns and context                |

If embeddings are unavailable, semantic memory falls back instead of blocking
chat. This is not yet a durable multi-user cloud memory system.

## TTS

| Provider    | Current Status                                                       |
| ----------- | -------------------------------------------------------------------- |
| Piper       | Browser/local path with worker-based playback                        |
| Fish Speech | Remote route exists; voices endpoint works; live bridge path exists  |
| Inworld     | Remote route exists; SDK/package is present; needs more soak testing |

Fish and Inworld provider keys can be supplied from the browser-local vault and
sent to the backend per request.

Long replies, queue pressure, and live-bridge behavior still need more
real-stream testing before treating remote TTS as production-grade.

## BYOK Product Shell

BYOK provider key slots currently include:

- OpenAI
- OpenRouter
- Fish Speech
- Inworld
- Tavily

Provider secrets are intended to remain browser-local. The backend receives
them as request headers for active work. Cloud settings should not store
provider API keys.

## Supabase Product Scaffold

Supabase is the selected stack for:

- Magic-link authentication.
- Profiles.
- Workspaces.
- Scenes.
- Scene settings.
- Overlay tokens.
- Storage contract.

Migration:

```text
supabase/migrations/20260515000100_byok_product_spine.sql
```

Serverless BYOK routes:

```text
api/byok/**
```

Cloud settings sync exists as a product path, but the product surface still
needs more browser smoke testing, policy review, and token lifecycle hardening.

## Important Files

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

## Current Limitations

- This is not ready for commercial launch.
- Payments, Stripe, and managed credits are intentionally not implemented in
  this BYOK fork.
- Public OBS overlay sharing has signed-token route work, but token lifecycle
  and revocation need more hardening.
- Supabase product data routes exist, but need more browser smoke and policy
  review.
- Cloud memory is not the primary memory system yet.
- Provider keys do not have a hosted encrypted vault.
- Remote TTS needs longer real-stream testing.
- The UI is functional but still needs a serious product design pass.
- The VPS is an experimental/live test environment, not the final product
  deployment target.
- Vercel is the intended product-shaped deployment target, but WebSocket-heavy
  live workloads may still need a separate long-running worker.

## Known Sharp Edges

- `npm run build` currently emits expected Vite warnings for `onnxruntime-web`
  eval usage and large chunks.
- Low max-output values can still cause incomplete replies.
- Remote TTS and live-bridge paths can affect perceived chat latency.
- Restarting the VPS can hang if stale processes still hold ports `8787` or
  `4173`; use the VPS runbook.
- Some status docs include older checkpoint history. This README is the concise
  current-state entry point.

## Verification Checklist

Minimum checkpoint verification:

```powershell
npx vitest run server/src/ai/OpenAiResponsesProvider.test.ts api/ai/chat.test.ts src/lib/product/provider-key-vault.test.ts
git diff --check
npm run build
```

For product/auth/Supabase changes, also run relevant tests under:

```text
src/lib/product/*.test.ts
api/byok/**/*.test.ts
```

For prompt/POML changes, smoke the real rendered prompt path.

## Next Useful Work

- Browser smoke with a saved OpenAI key in WebSocket + conversation mode.
- Browser smoke for Fish/Inworld BYOK keys and long TTS replies.
- Confirm semantic memory lookup/write after real chat.
- Harden signed overlay token lifecycle.
- Continue UI/product polish from the existing visual theme.
- Decide whether long-running WebSocket/TTS work stays on a VPS/worker while the
  dashboard deploys to Vercel.
