# Discord Waifu Bridge

## Call It What It Is

`YourWifey` is the better base for the actual "waifu in Discord" experience.

Use this repo as:
- the avatar shell
- the VRM renderer
- the Piper/TTS playback layer
- the lipsync/animation layer
- the local persona/chat sandbox

Use `dvb` as:
- the Discord bot
- the Discord message/voice ingestion layer
- the server/channel/user context layer
- the agent/autonomy/heartbeat layer

Do not treat the Discord operator panel as the main product. The panel is optional operator UI. The real product is the avatar.

## Why This Repo Wins

This repo already has the important pieces:

- VRM stage and camera/runtime:
  - [src/components/VrmStage.tsx](C:/Users/SUBSECT/Documents/GitHub/YourWifey/src/components/VrmStage.tsx)
- VRM loading, animation, post-processing, lipsync:
  - [src/lib/vrm/loadVrm.ts](C:/Users/SUBSECT/Documents/GitHub/YourWifey/src/lib/vrm/loadVrm.ts)
  - [src/lib/vrm/animation.ts](C:/Users/SUBSECT/Documents/GitHub/YourWifey/src/lib/vrm/animation.ts)
  - [src/lib/vrm/lipsync.ts](C:/Users/SUBSECT/Documents/GitHub/YourWifey/src/lib/vrm/lipsync.ts)
  - [src/lib/vrm/postprocessing.ts](C:/Users/SUBSECT/Documents/GitHub/YourWifey/src/lib/vrm/postprocessing.ts)
- Piper TTS manager with playback, analyser data, and lip sync:
  - [src/lib/tts/manager.ts](C:/Users/SUBSECT/Documents/GitHub/YourWifey/src/lib/tts/manager.ts)
- Persona defaults including Neuro-sama:
  - [src/lib/chat/defaults.ts](C:/Users/SUBSECT/Documents/GitHub/YourWifey/src/lib/chat/defaults.ts)
- Existing local demos for LM Studio + Piper:
  - [lmstudio-piper-chat-demo.js](C:/Users/SUBSECT/Documents/GitHub/YourWifey/lmstudio-piper-chat-demo.js)
  - [piper-tts-test.js](C:/Users/SUBSECT/Documents/GitHub/YourWifey/piper-tts-test.js)

That means the face layer already exists here. Rebuilding it in `dvb` would be backwards.

## Correct Architecture

### `YourWifey`

Responsible for:
- rendering the avatar
- playing TTS audio
- driving mouth/lipsync/animation
- showing chat text locally
- handling model/voice switching
- showing subtitles from Piper word-boundary timing

### `dvb`

Responsible for:
- Discord DMs, mentions, threads, channels, voice
- guild/user/channel/message lookup
- autonomy, heartbeat, memory, moderation policy
- Codex app-server integration
- deciding what the avatar should say or do

### Bridge

The missing piece is a websocket/event bridge between the two.

`dvb` sends events like:
- `scope_activated`
- `user_message`
- `assistant_text_delta`
- `assistant_text_final`
- `tts_request`
- `animation_cue`
- `persona_switch`
- `voice_session_state`
- `heartbeat_event`

`YourWifey` sends events like:
- `ui_ready`
- `avatar_loaded`
- `tts_started`
- `tts_finished`
- `avatar_state`

## Best Product Shape

### Mode 1: Standalone desktop/browser waifu

`YourWifey` can already operate as a local app-like experience:
- local chat UI
- local model selection
- local Piper TTS
- Piper-timed subtitles
- local persona swap

### Mode 2: Discord Activity waifu

Put `YourWifey` inside the Discord Activity iframe and let `dvb` feed it:
- Discord user talks in chat or voice
- `dvb` receives the event
- Codex/agent produces the response
- `YourWifey` renders the speaking avatar and local UI

### Mode 3: Stream/VTuber overlay

Use `YourWifey` as the visible front-end while `dvb` stays invisible:
- OBS/browser source
- Discord as the control/input layer
- avatar as the visible personality

## What To Reuse Immediately

Keep these from `YourWifey`:
- `VrmStage`
- Piper manager
- lipsync
- visual settings / animation sequencer
- persona system
- Neuro-sama bundled model option

Keep these from `dvb`:
- Discord ingestion
- Codex threads and scope model
- heartbeat/autonomy
- guild/channel/user tools
- voice receive/transcribe flow
- TTS orchestration decisions

## What Not To Do

Do not:
- rebuild VRM rendering inside `dvb`
- make the panel the main user-facing experience
- duplicate Piper/lipsync code in both repos
- force Discord chat embeds to carry the whole personality experience

The avatar repo should be the face.
The Discord bot repo should be the brainstem and input bus.

## Suggested Integration Order

1. Add a small websocket bridge server to `YourWifey`.
2. Add a matching bridge client in `dvb`.
3. Make `dvb` send `assistant_text_final` and `tts_request`.
4. Make `YourWifey` play Piper audio and animate the VRM.
5. Add persona/model switching from Discord operator commands.
6. Only after that, care about a richer Discord Activity shell.

## Immediate Build Target

The first real version should be:

- Discord message or voice comes into `dvb`
- Codex decides the response
- `dvb` sends text + voice cue to `YourWifey`
- `YourWifey` speaks as Neuro-sama or another persona using Piper
- VRM animates on screen

That gets you the actual experience fast, without getting trapped in operator UI work.
