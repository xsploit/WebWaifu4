# YourWifey BYOK

**YourWifey BYOK** is a stream-ready AI avatar overlay for Twitch creators. It
connects live chat to a VRM character, renders personality-driven replies with
OpenAI Responses, speaks through configurable TTS providers, and keeps creator
API keys local by default.

The project is currently a working product prototype: the live overlay,
chat-to-avatar loop, BYOK key flow, memory stack, and Supabase product shell are
implemented, while payments, hosted credit management, and public launch
hardening are intentionally out of scope for this fork.

Canonical hosted product:

```text
https://yourwifey-byok.vercel.app
```

This BYOK fork is Vercel-only for hosted product work. Old VPS or `sslip.io`
URLs are stale experiments and are not product entry points.

## Highlights

- **Twitch-first chat intake** with local chat treated as another participant
  while retaining trusted creator controls.
- **VRM avatar runtime** with character presets, animation metadata, expression
  hooks, weighted animation categories, and overlay-friendly layout.
- **OpenAI Responses support** with HTTP, HTTP streaming, WebSocket streaming,
  Conversations API state, structured output, and prompt-cache fields.
- **BYOK provider model** for OpenAI, OpenRouter, Fish Speech, Inworld, and
  Tavily keys.
- **Real prompt rendering through POML** for persona, Twitch context, memory,
  tools, TTS policy, and animation metadata.
- **Local-first memory** with relationship state, diary entries, Grillo-style
  memory blocks, and semantic recall when embeddings are available.
- **Supabase product scaffold** for magic-link auth, profiles, workspaces,
  scenes, settings sync, overlay tokens, and storage contracts.
- **OBS overlay routes** for browser-source preview and tokenized scene loading.

## How It Works

```text
Twitch IRC / local chat
        |
        v
Normalized chat turn
        |
        v
Queue, batch, command, and memory pipeline
        |
        v
POML-rendered prompt + provider request
        |
        v
OpenAI Responses / compatible provider
        |
        v
Streaming text, reply metadata, TTS, and animation triggers
        |
        v
VRM avatar overlay for browser, OBS, or stream capture
```

The app is built around one core rule: **every message is a participant turn**.
Twitch messages, local messages, and trusted creator commands use the same
intake shape before scheduling, memory lookup, POML rendering, AI generation,
TTS playback, and animation selection.

## Product Modes

| Mode               | Purpose                                               | Status               |
| ------------------ | ----------------------------------------------------- | -------------------- |
| Local-only overlay | Run the avatar and settings locally without login     | Working              |
| Signed-in BYOK     | Save profile/workspace/scene data through Supabase    | Implemented scaffold |
| OBS overlay        | Load an overlay-focused route for capture             | Working preview path |
| Commercial SaaS    | Managed billing, credits, support, and multi-user ops | Not implemented      |

## Architecture

```text
Browser app
  React + Vite
  VRM stage
  settings and dashboard surfaces
  local chat
  browser Twitch IRC
  browser-local provider key vault
  IndexedDB / localStorage memory and settings
        |
        v
Vercel serverless APIs
  /api/ai/chat
  /api/ai/models
  /api/ai/embeddings
  /api/ai/poml/render
  /api/byok/*
        |
        v
External providers
  OpenAI Responses
  OpenRouter Responses-compatible APIs
  Tavily search/crawl tools
  Fish Speech
  Inworld TTS
  Supabase Auth/Postgres/Storage
```

The product deployment target is Vercel plus Supabase. Local scripts still exist
for development, but hosted product URLs, auth callbacks, cloud sync, and overlay
links should use the Vercel origin only.

## Quick Start

```powershell
npm install
npm run dev
```

Run the frontend and backend separately:

```powershell
npm run dev:overlay
npm run dev:ai
```

Build the app:

```powershell
npm run build
```

## Configuration

Start from `.env.example`. Common local development settings:

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
VITE_SUPABASE_OAUTH_PROVIDERS
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
SUPABASE_JWT_SECRET
SUPABASE_STORAGE_BUCKET
OVERLAY_SIGNING_SECRET
```

`VITE_SUPABASE_OAUTH_PROVIDERS` is optional. The app checks Supabase Auth
`/auth/v1/settings` at runtime and uses the live Google/GitHub provider flags
when Supabase is reachable. OAuth still requires provider credentials in
Supabase Auth: enable the provider, add its client ID and secret, and register
`https://<project-ref>.supabase.co/auth/v1/callback` in the provider console.

Provider API keys are user-owned BYOK values. They should be saved through the
browser-local provider vault and sent to the backend only for active requests.
They should not be stored as cloud settings or exposed as `VITE_` provider
secret variables.

## Chat And Control Model

Local chat and Twitch chat share the same normalized turn pipeline.

- Local chat uses `source: "local"`, `channel: "local"`, `isLocal: true`, and
  `isTrustedController: true`.
- Twitch chat uses `source: "twitch"` with channel, login, display name, badge,
  moderator, broadcaster, and trusted-controller metadata where available.
- The AI receives speaker metadata, source metadata, trust metadata, and
  transcript context.
- Trusted commands are permission checked from the normalized turn, not from a
  separate one-off local path.

Queue defaults:

| Setting                | Default            |
| ---------------------- | ------------------ |
| Active chatter window  | 120 seconds        |
| Direct reply threshold | 10 active chatters |
| Reply cooldown         | 2 seconds          |
| Twitch context window  | 80 turns           |
| Batch max wait         | 30 seconds         |

Under the threshold, tagged Twitch messages and local messages enter the same
sequential response queue. Over the threshold, Twitch can move into batch mode
while local trusted commands remain available for creator control.

## AI Providers

OpenAI Responses is the primary stateful provider path.

Supported OpenAI modes:

- HTTP Responses calls.
- HTTP streaming.
- Responses WebSocket streaming.
- Conversations API state scoped by channel and persona.
- Previous-response state where supported.
- Stateless requests for memory and background tasks.
- Structured output through JSON schema or JSON object modes.
- Tavily tool calls when configured.

Conversation state is scoped with keys such as:

```text
local:persona:hikari-chan
twitch:subsect:persona:hikari-chan
```

Provider compatibility is handled defensively. Max output is wired to
`max_output_tokens`; `OPENAI_REASONING_EFFORT=none` sends no `reasoning`
object; unsupported `reasoning` or `temperature` parameters are stripped and
retried per process-level model capability detection.

### OpenRouter

OpenRouter support is available as a Responses-compatible provider path, but it
does not behave like OpenAI Conversations. The app owns state for OpenRouter:
it resends the rendered POML prompt, transcript, diary, Grillo memory, and
semantic context instead of assuming provider-side conversation objects.

Use OpenAI Responses when provider-native Conversations state is required.

## Prompting With POML

YourWifey uses a real POML render path, not a string-only prompt wrapper.

| File                                              | Role                       |
| ------------------------------------------------- | -------------------------- |
| `src/lib/chat/templates/yourwifey-responses.poml` | Main prompt template       |
| `src/lib/chat/prompt.ts`                          | Browser prompt builder     |
| `src/lib/chat/poml.ts`                            | Browser render helpers     |
| `server/src/ai/PomlRenderer.ts`                   | Server render path         |
| `api/ai/poml/render.ts`                           | Serverless render endpoint |

The rendered prompt includes persona, style controls, source metadata,
Twitch/local intake mode, relationship memory, Grillo context, diary context,
semantic memory, TTS policy, animation catalog, tool policy, and reply metadata
instructions.

For prompt changes, verify the rendered prompt output path instead of only
checking the template file.

## Memory

YourWifey is currently browser-first for memory.

| Layer               | Storage                      | Purpose                                            |
| ------------------- | ---------------------------- | -------------------------------------------------- |
| Relationship memory | Browser storage              | Mood, facts, trust, summaries, relationship state  |
| Diary               | Browser storage              | Private character reflections and recent context   |
| Grillo memory       | Browser storage              | Candidate memories, promoted blocks, diary entries |
| Semantic memory     | Browser storage + embeddings | Relevant recall for current turns                  |

If embeddings are unavailable, semantic memory falls back without blocking chat.
Durable cloud memory is not the primary memory model yet.

## TTS

| Provider    | Path                 | Status                                           |
| ----------- | -------------------- | ------------------------------------------------ |
| Piper       | Browser/local worker | Working local path                               |
| Fish Speech | Backend remote route | Voices and live bridge path exist                |
| Inworld     | Backend remote route | SDK-backed route exists; needs more soak testing |

Fish and Inworld keys can be supplied from the browser-local key vault and
forwarded to the backend per request. Remote streaming quality still needs more
long-form testing under real chat pressure before it should be treated as
production-stable.

## Supabase Product Shell

Supabase is used for the product scaffold:

- Magic-link authentication.
- Profiles.
- Workspaces.
- Scenes.
- Scene settings.
- Signed overlay tokens.
- Storage contracts.

Schema migration:

```text
supabase/migrations/20260515000100_byok_product_spine.sql
```

Serverless BYOK routes:

```text
api/byok/**
```

Cloud sync is intended for safe profile, workspace, scene, and non-secret
settings. Provider API keys remain local-only in the BYOK model.

## Repository Guide

| Area                 | Paths                                                       |
| -------------------- | ----------------------------------------------------------- |
| Main app             | `src/App.tsx`, `src/components/menu/**`                     |
| Chat and prompts     | `src/lib/chat/**`                                           |
| TTS                  | `src/lib/tts/**`, `server/src/tts/**`                       |
| VRM and animation    | `src/lib/vrm/**`                                            |
| Product/BYOK         | `src/lib/product/**`, `api/byok/**`                         |
| AI backend           | `server/src/ai/**`, `api/ai/**`                             |
| Twitch and commands  | `server/src/twitch/**`, `server/src/commands/**`            |
| Deployment           | `vercel.json`, `docs/VERCEL_SUPABASE_BYOK.md`               |
| Archived experiments | `docs/OVH_VPS_DEPLOY_RUNBOOK.md`, `docs/STREAM_ROUTELET.md` |

Planning and status docs:

- `docs/BYOK_PRODUCT_STATUS.md`
- `docs/BYOK_PRODUCT_PLAN.md`
- `docs/grillo-memory-status.md`

## Verification

Minimum verification for common AI, provider, or product changes:

```powershell
npx vitest run server/src/ai/OpenAiResponsesProvider.test.ts api/ai/chat.test.ts src/lib/product/provider-key-vault.test.ts
git diff --check
npm run build
```

For Supabase/product changes, also run the relevant tests under:

```text
src/lib/product/*.test.ts
api/byok/**/*.test.ts
```

For prompt/POML changes, smoke the real rendered prompt path.

## Current Project Boundary

This fork is not a finished commercial launch. The following are not complete:

- Stripe, payments, managed credits, and hosted billing operations.
- Public overlay token lifecycle hardening and revocation UX.
- Hosted encrypted provider-key storage.
- Durable cloud memory as the primary memory layer.
- Full product onboarding, landing page, pricing, support, and abuse controls.
- Long-running production infrastructure for WebSocket-heavy TTS/LLM workloads.

The current focus is a creator-owned BYOK product shell: strong local operation,
optional account sync, clean overlay paths, and a reliable live assistant loop.

## Roadmap

Near-term:

- Browser smoke with a saved OpenAI key in WebSocket + Conversations mode.
- Fish and Inworld BYOK long-reply smoke tests.
- Semantic memory write/read verification after real chat.
- Signed overlay token lifecycle hardening.
- Product UI pass using the existing avatar overlay theme.

Later:

- Public landing page and onboarding flow.
- Hosted worker strategy for low-latency WebSocket and TTS workloads.
- Optional managed credits and payment architecture.
- Team/workspace roles, sharing, and moderation controls.
- Production monitoring, rate limits, and abuse handling.
