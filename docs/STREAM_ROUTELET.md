# Stream Routelet

The stream routelet is the VPS-side loop that turns the browser overlay into an
RTMP stream. It is meant for Linode or another persistent Linux box, not Vercel.

## Signal Flow

```text
Twitch chat -> browser IRC -> OpenAI proxy -> browser Piper TTS
                                            -> VRM lipsync/subtitles

Chromium page video -> Xvfb display -> FFmpeg input 0
Chromium/Piper audio -> Pulse/PipeWire null sink -> FFmpeg input 1

FFmpeg -map 0:v:0 -map 1:a:0 -> Twitch RTMP
```

The OpenAI proxy keeps chat state per channel/persona. In conversation mode the
`#subsect` Riko stream uses a key like `twitch:subsect:persona:riko`; another
channel gets a separate Conversation API object. Browser relationship memory is
prompt context only, and memory refresh requests are sent stateless so they do
not contaminate the live chat conversation.

The important part is the FFmpeg map:

```bash
-f x11grab -i :99.0+0,0       # input 0: Chromium video
-f pulse -i yourwifey_stream.monitor  # input 1: Chromium/Piper audio
-map 0:v:0 -map 1:a:0
```

Piper stays client-side. FFmpeg hears it because Chromium plays WebAudio into the
`yourwifey_stream` Pulse/PipeWire sink, and FFmpeg captures that sink's monitor.

## Server Packages

On Ubuntu, install the runtime pieces:

```bash
sudo apt update
sudo apt install -y ffmpeg xvfb x11-utils curl pulseaudio-utils pulseaudio
```

Install Chrome or Chromium and make sure one of these commands exists:

```bash
google-chrome-stable
google-chrome
chromium
chromium-browser
```

If it is installed somewhere else, set `CHROME_BIN=/path/to/chrome`.

## Build And Run

Build with the standalone stream env enabled:

```bash
npm ci
VITE_DIRECT_TWITCH_CHAT=true \
VITE_STREAM_BOT_WS_ENABLED=false \
VITE_AI_PROXY_ENABLED=true \
VITE_RUN_GAME_SDK_ENABLED=false \
VITE_AUTO_RESUME_AUDIO=true \
npm run build
```

Then run the routelet:

```bash
export OPENAI_API_KEY='sk-...'
export OPENAI_MODEL='gpt-5-nano'
export AI_PROVIDER='openai-responses'
export OPENAI_STATE_MODE='conversation'
export TWITCH_STREAM_KEY='live_...'

npm run stream:routelet
```

The routelet defaults to:

```text
OVERLAY_URL=http://127.0.0.1:4173/?routelet=1
STREAM_WIDTH=1280
STREAM_HEIGHT=720
STREAM_FPS=60
STREAM_VIDEO_BITRATE=4500k
STREAM_AUDIO_BITRATE=160k
STREAM_LOOP=true
STREAM_START_APP=true
```

`?routelet=1` tells the browser audio layer to resume automatically in the
controlled Chromium session. The Chrome process also starts with
`--autoplay-policy=no-user-gesture-required`.

## Local Smoke Test

Before sending anything to Twitch, write a short FLV on the VPS:

```bash
STREAM_OUTPUT_URL=/tmp/yourwifey-smoke.flv \
STREAM_TEST_SECONDS=45 \
STREAM_FPS=60 \
STREAM_LOOP=false \
OVERLAY_URL='http://127.0.0.1:4173/?routelet=1&routeletSay=Routelet%20audio%20smoke%20test.&routeletSayDelayMs=14000' \
npm run stream:routelet

ffprobe -hide_banner /tmp/yourwifey-smoke.flv
```

The smoke file should contain one H.264 video stream and one AAC audio stream.
If the audio stream is silent, the problem is the Pulse/PipeWire sink path, not
Twitch.

## Loop Behavior

`scripts/stream-routelet.sh` starts the overlay if it is not already responding,
starts Xvfb when no display is available, creates a Pulse/PipeWire null sink,
launches Chromium, and starts FFmpeg.

If FFmpeg exits, the script kills Chromium, waits `STREAM_RESTART_DELAY` seconds,
then starts Chromium and FFmpeg again. Set `STREAM_LOOP=false` for one-shot
testing.

## Audio Monitoring

The stream hears audio from `yourwifey_stream.monitor`. If you also want to hear
the same audio through a real/default output device on a machine that has one:

```bash
STREAM_MONITOR_AUDIO=true npm run stream:routelet
```

That loads a PulseAudio loopback from `yourwifey_stream.monitor` to
`STREAM_MONITOR_SINK`, which defaults to `@DEFAULT_SINK@`.

## Useful Smoke Checks

With the overlay open, this should report a live audio track after the app has
mounted:

```js
await window.__yourwifeyAudio.resume()
window.__yourwifeyAudio.getStream().getAudioTracks()
```

In Twitch chat, `subsect` can use:

```text
!yw audio
!yw say hello chat
!yw tts on
!yw autospeak on
```

The expected result is:

- `!yw audio` reports `context=running` and `streamTracks=1`.
- `!yw say ...` speaks through Piper.
- FFmpeg maps `0:v:0` and `1:a:0` and Twitch receives both video and audio.
