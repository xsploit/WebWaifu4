# Twitch IRC Stream Chat

> Archived stream-bot notes. The hosted BYOK product path is Vercel-only at
> `https://yourwifey-byok.vercel.app`. Do not use local/VPS routelet or Linode
> notes here as product deployment guidance.

This pass adds Twitch IRC chat for the stream overlay described in
`docs/ORIGINAL_YOURWIFEY_STREAM_HANDOFF.md`.

The overlay now listens to Twitch chat client-side by default:

- WebSocket: `wss://irc-ws.chat.twitch.tv:443`
- Nick: anonymous `justinfan#####`
- Channel: `#subsect` by default
- Auth: no OAuth for read-only listening; the browser uses the anonymous
  `justinfan#####` IRC handshake
- Controller: `subsect`, broadcaster, and mods can run `!yw` commands

Change the browser-side channel with:

```dotenv
VITE_TWITCH_CHANNEL=subsect
VITE_DIRECT_TWITCH_CHAT=true
```

Set `VITE_DIRECT_TWITCH_CHAT=false` only if you want to disable direct browser
IRC. Keep `VITE_STREAM_BOT_WS_ENABLED=false` for the normal client-Twitch path;
the old server Twitch socket path is opt-in only. The overlay is standalone and
does not boot a host game SDK in the stream browser.

## Browser Twitch AI Mode

The current live path is browser-first:

- Twitch viewer messages and AI replies are rendered in the public overlay
  chat.
- Startup, connection, queue, proxy, and error details stay out of the public
  overlay chat. The overlay also redacts links, local paths, localhost, IPs,
  API-key-looking strings, and OAuth-token-looking strings before text renders.
- `!yw ...` commands are handled separately and never trigger an AI reply.
- With 10 or fewer active chatters in the last 2 minutes, messages tagged with
  the active personality name, such as `@Riko ...`, are added to the AI reply
  queue. The default Riko profile also accepts `@Rico`.
- The reply queue waits about 3 seconds between AI jobs.
- Above 10 active chatters, messages are batched into one room-level reply.
- Batch size starts at 10 messages, then rises to 20, 50, and 100 as active
  chatters increase.
- If a batch does not fill, a timer flushes it after roughly 30 seconds, or
  roughly 45 seconds once the active chatter count is above 100.
- AI state is scoped by Twitch channel and personality. The browser sends keys
  like `twitch:subsect:persona:riko`, so switching chat rooms starts using that
  room's own OpenAI response chain or Conversation API object.

Twitch IRC does not expose a reliable live viewer count in the anonymous
read-only connection, so the current threshold uses active chatters seen in the
last 2 minutes.

## Voice And Subtitles

Browser Piper is the active TTS path. Mic capture, VAD, Whisper, and browser STT
were removed from the overlay.

AI replies stream through the local proxy or Vercel route with Server-Sent
Events. The browser updates the visible assistant message on each text delta,
cuts complete sentence/clause chunks as soon as they appear, and queues those
chunks into Piper immediately. Piper starts synthesizing later chunks while the
current chunk is still playing, which keeps spoken replies moving instead of
waiting for the full LLM response.

Subtitles use Piper chunk word-boundary timing from the TTS worker. These
boundaries are estimated offsets and durations for the spoken chunk, good enough
for stream subtitles without running Whisper over the generated audio.

## Dev Mode

Run the autonomous local stream stack:

```powershell
npm run dev
```

That starts:

- Vite overlay on `0.0.0.0:5173`.
- Browser direct Twitch IRC for real chat.
- Local AI proxy on `127.0.0.1:8787`.
- Server Twitch locked to mock mode so it cannot double-read real chat.

For a front-end-only run with no local AI proxy:

```powershell
npm run dev:overlay
```

Copy `.env.example` to `.env` and fill the API key locally. Do not put the key
in a `VITE_` variable unless you intentionally want it embedded in browser
JavaScript.

The local AI proxy uses OpenAI automatically when `OPENAI_API_KEY` is present:

```dotenv
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-nano
VITE_OPENAI_MODEL=gpt-5-nano
AI_PROVIDER=openai-responses
OPENAI_WS_URL=wss://api.openai.com/v1/responses
```

For Vercel, set the same values in the project environment. The browser uses
`/api/ai/chat` in production, backed by `api/ai/chat.ts`. `OPENAI_WS_URL` does
not force websocket mode; set `AI_PROVIDER=openai-responses-ws` only when you
are intentionally testing the websocket provider. The default and Vercel path is
HTTP Responses because serverless functions should not hold a persistent
WebSocket.

## Browser Audio Capture

Piper speech is browser audio. The overlay exposes the mixed TTS stream, and
the Web Audio graph is armed when TTS plays or when a wrapper calls `resume()`:

```js
const audioStream = window.__yourwifeyAudio?.getStream();
await window.__yourwifeyAudio?.resume();
```

A browser-based streamer can combine that audio track with a canvas/page capture
stream instead of recording the desktop. The `!yw audio` command reports whether
the browser audio context is running and whether an audio track is available.

## Uploading And Streaming

What works on Vercel:

- Static overlay UI.
- Browser-side anonymous Twitch IRC read-only chat.
- Browser Piper TTS, subtitles, animation, and VRM rendering.
- `/api/ai/chat` backed by `OPENAI_API_KEY` in Vercel environment variables.

What does not work on Vercel:

- A long-running FFmpeg RTMP process.
- Persistent headless Chromium.
- Persistent OpenAI WebSocket state.
- Server-owned audio devices or virtual displays.

What works on a Linode/VPS:

- The same production overlay build.
- The local Node OpenAI proxy, including the WebSocket Responses provider.
- A controlled Chromium instance pointed at the overlay URL.
- FFmpeg capture of Chromium video plus browser audio through PulseAudio or
  PipeWire.

For FFmpeg, the browser has to be the audio source. The exposed
`window.__yourwifeyAudio.getStream()` is available for browser wrappers, but a
plain FFmpeg process normally captures audio from the system audio sink. On a
Linux VPS that means running Chromium with audio output enabled and capturing
the monitor source of a virtual PulseAudio/PipeWire sink.

The repo includes `scripts/stream-routelet.sh` for that path. It starts or reuses
the overlay, launches Xvfb and Chromium, routes Chromium audio into the
`yourwifey_stream` Pulse/PipeWire sink, then runs FFmpeg with:

```bash
-map 0:v:0 -map 1:a:0
```

See `docs/STREAM_ROUTELET.md` for the full Linode routelet runbook.

For a controlled server browser, set `VITE_AUTO_RESUME_AUDIO=true` and launch
Chromium with autoplay allowed, for example
`--autoplay-policy=no-user-gesture-required`. Leave it off during normal local
dev so Chrome does not spam expected WebAudio autoplay warnings.

## Mock Chat Smoke

The local AI process stays in mock Twitch mode by default. Inject mock chat only
when testing the old server path:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:8787/mock/chat `
  -ContentType application/json `
  -Body '{"user":"viewer1","displayName":"Viewer1","text":"hello @yourwifey"}'
```

## Server Twitch IRC

The server Twitch reader is no longer part of the default startup. The browser
is the real Twitch listener. Only use this when intentionally testing the old
server-owned IRC path:

```dotenv
TWITCH_MOCK=false
TWITCH_CHANNEL=subsect
BOT_PORT=8787
COMMAND_ADMINS=subsect

AI_PROVIDER=mock
# AI_PROVIDER=openai-compatible
# AI_API_BASE_URL=http://127.0.0.1:1234/v1
# AI_API_KEY=...
# AI_MODEL=...
```

## OpenAI Responses Provider

The local AI proxy can call OpenAI while keeping the API key out of the browser:

```dotenv
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-nano
VITE_OPENAI_MODEL=gpt-5-nano
AI_PROVIDER=openai-responses
OPENAI_WS_URL=wss://api.openai.com/v1/responses
OPENAI_STATE_MODE=conversation
OPENAI_PROMPT_CACHE_KEY=yourwifey-stream
# OPENAI_PROMPT_CACHE_RETENTION=24h
OPENAI_STORE=false
```

Provider modes:

- If `OPENAI_API_KEY` is set and `AI_PROVIDER` is omitted, the proxy uses
  `openai-responses`.
- `AI_PROVIDER=openai-responses`: HTTP `POST /v1/responses`.
- `AI_PROVIDER=openai-responses-ws`: persistent WebSocket to `/v1/responses`.
  `OPENAI_WS_URL` is only used in this explicit websocket mode.
- `OPENAI_STATE_MODE=conversation`: default stream mode. Creates or reuses a
  durable Conversations API object per state key.
- `OPENAI_STATE_MODE=previous-response`: keeps a response chain in server
  memory using `previous_response_id` only when `OPENAI_STORE=true`; otherwise
  the proxy stays stateless and relies on the browser-sent chat history.
- `OPENAI_STATE_MODE=stateless`: sends each request independently.

State scoping:

- Normal overlay chat sends `stateScope=chat`.
- Twitch chat sends `stateKey=twitch:<channel>:persona:<personality>`, so each
  channel/personality pair has its own conversation.
- Local/manual chat sends `stateKey=local:persona:<personality>`.
- Browser relationship memory is still injected as prompt context, but the diary
  refresh worker sends `stateScope=memory` and `disableState=true`, so memory
  summarization cannot advance, reset, or pollute the live chat conversation.

Use an existing conversation with:

```dotenv
OPENAI_STATE_MODE=conversation
OPENAI_CONVERSATION_ID=conv_...
```

The server exposes a local proxy endpoint for browser/manual integrations:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:8787/ai/chat `
  -ContentType application/json `
  -Body '{"messages":[{"role":"system","content":"You are Riko."},{"role":"user","content":"Say hi to chat."}]}'
```

Prompt caching is automatic on recent OpenAI models. The bot also sends
`prompt_cache_key` when configured so repeated stream-character instructions
route to the same cache key. `OPENAI_PROMPT_CACHE_RETENTION=24h` enables
extended retention on supported models.

By default, AI replies go to the overlay only. Anonymous IRC cannot send chat
messages. Sending replies back into Twitch chat requires the old server IRC path
plus a bot account:

```dotenv
TWITCH_BOT_USERNAME=your_bot_login
TWITCH_OAUTH_TOKEN=oauth_or_bare_token
SEND_TWITCH_REPLIES=true
```

## Chat Control Commands

Control commands are intentionally isolated from normal AI chat. By default,
`subsect`, the broadcaster, and channel mods can control the stream. Override
that with:

```dotenv
COMMAND_ADMINS=subsect,another_login
COMMAND_ALLOW_MODS=true
COMMAND_PREFIXES=!yw,!yourwifey,!waifu
```

Useful commands:

```text
!yw help
!yw status
!yw audio
!yw state
!yw state reset
!yw refresh
!yw channel subsect
!yw channel other_channel
!yw llm gpt-4.1
!yw vrms
!yw vrm riko-final-fixed-v2
!yw camera close
!yw camera full
!yw anims
!yw anim dance
!yw anim 1
!yw anim start
!yw anim stop
!yw anim next
!yw anim random
!yw anim speed 1.25
!yw anim duration 12
!yw tts on
!yw tts off
!yw autospeak on
!yw say hello chat
!yw chat on
!yw chat off
```

`!yw channel <name>` switches the browser-side Twitch IRC room without
restarting the overlay. `subsect` remains an admin after switching rooms.

## Scheduler Defaults

- active chatter window: 120 seconds
- rolling context: 80 messages
- max context chars: 8000
- direct reply gap: 3 seconds between queued AI jobs
- batch sizes: 10, 20, 50, 100 as chat scales above 10 active chatters
- batch timer: 30 seconds normally, 45 seconds above 100 active chatters

IRC is isolated behind `server/src/twitch/TwitchChatSource.ts`, so EventSub can
replace it later without touching the scheduler.
