# YourWifey Stream Overlay

Browser-first Twitch chat overlay with VRM, Piper TTS, subtitles, and Twitch
chat AI intake.

## Startup

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

`npm run dev` starts the overlay and local AI proxy together. Real Twitch chat is
client-side only in the browser; the server starts in mock Twitch mode so it
cannot double-read chat.

Use `npm run dev:overlay` for front-end only, or `npm run dev:bot:irc` only when
intentionally testing the old server-owned Twitch IRC path.

For Vercel, set `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-5-nano`,
`AI_PROVIDER=openai-responses`, `VITE_AI_PROXY_ENABLED=true`,
and `VITE_OPENAI_MODEL=gpt-5-nano` as environment variables. Do not use a
`VITE_` variable for the API key.

## Twitch

Defaults:

- Channel: `subsect`
- Controller: `subsect`, broadcaster, and mods
- Commands: `!yw help`, `!yw status`, `!yw state`, `!yw refresh`,
  `!yw channel <name>`, `!yw llm <model>`, `!yw vrm <id>`, `!yw camera close`,
  `!yw anim <name|index>`, `!yw tts on|off`, `!yw audio`, `!yw say <text>`

## Browser Audio

Piper TTS plays in the browser and also exposes a capture stream for server or
browser-based streamers:

```js
const audioStream = window.__yourwifeyAudio?.getStream();
```

The stream contains Piper speech audio after the browser audio graph is armed.
`window.__yourwifeyAudio?.resume()` can be called by a streaming wrapper after a
page gesture or with Chrome autoplay enabled.

## Deployment Reality

Vercel works for the overlay, browser-side Twitch IRC, browser Piper TTS, and
the `/api/ai/chat` OpenAI proxy route. It does not work as the long-running
FFmpeg RTMP streamer because serverless functions are short-lived and do not
own a persistent desktop, browser, or audio device.

A Linode or similar VPS is the right place for actual Twitch streaming. Run a
production build in Chromium, enable autoplay for the controlled browser, route
browser audio through PulseAudio or PipeWire, and let FFmpeg capture Chromium
video plus that virtual audio sink. The in-page `window.__yourwifeyAudio`
stream is useful for browser wrappers, but FFmpeg normally hears Piper because
Chromium outputs WebAudio to the server audio device.

For the server-controlled Chromium path, use `VITE_AUTO_RESUME_AUDIO=true` plus
Chrome's `--autoplay-policy=no-user-gesture-required`. Keep that off in normal
local dev to avoid expected browser autoplay warnings.

Local front-end only runs can still read Twitch chat. AI replies need either
`npm run dev` so the local proxy is listening on `127.0.0.1:8787`, or a deployed
`/api/ai/chat` route.

See [docs/TWITCH_IRC_STREAM_BOT.md](docs/TWITCH_IRC_STREAM_BOT.md) for the full
operator notes, and [docs/STREAM_ROUTELET.md](docs/STREAM_ROUTELET.md) for the
Linode/FFmpeg routelet loop.
