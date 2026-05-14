# YourWifey Productization Ralph Status

## Current Goal

Turn YourWifey Stream from a working Twitch-first AI overlay into a polished,
sellable product without losing the fast local stream workflow. Productization is
split into bounded Ralph lanes so polish, review, performance, and commercial
architecture do not overwrite each other's scope.

## Source Of Truth

- Worktree: `C:\Users\SUBSECT\Documents\Codex\2026-05-04\https-github-com-prismml-eng-bonsai\yourwifey-stream`
- Current branch: `github-main`
- Existing app source of truth: `README.md`
- Memory status: `docs\grillo-memory-status.md`
- Productization status: `docs\PRODUCTIZATION_RALPH_STATUS.md`
- Ralph runner: `plugins\ralph-wiggum-loop\scripts\run-codex-ralph-loop.ps1`

## Lane Order

1. Polish lane: make the existing stream app feel professional and consistent.
2. Code-review lane: hunt for real defects, stale assumptions, missing tests, and
   release blockers.
3. Efficiency lane: find blocked threads, slow paths, runaway queues, heavy main
   thread work, broken cleanup, and avoidable latency.
4. Commercial-production lane: plan and then implement the paid product spine:
   auth, billing, credits, tenancy, quotas, deployment, and admin controls.

Each lane uses its own prompt and completion promise. Keep `MaxIterations` small,
inspect `.ralph-loop`, inspect this status doc, and checkpoint coherent work.
Run one Ralph lane at a time. The runner shares `.ralph-loop\ralph-state.json`,
so parallel lane launches can collide on the state file.

## Product Stack Decision

Initial recommendation until code proves otherwise:

- Auth: Clerk for dashboard login, session management, and user/org identity.
- Billing: Stripe Checkout, Customer Portal, and signed webhooks.
- Database: Postgres with a typed TS ORM. Prefer Drizzle unless a future lane
  proves Prisma is a better fit for this repo.
- Credits: append-only ledger plus usage events, not only a mutable balance.
- Overlay access: signed overlay tokens scoped to user/project/scene, not full
  dashboard sessions.
- Provider accounting: normalize OpenAI, Fish Speech, Inworld, Tavily, and future
  tools into one usage-event model with estimated cost, actual cost when known,
  and configurable markup.

Do not add these dependencies in a drive-by way. The commercial lane should first
land a minimal schema/config/design checkpoint, then implement one vertical slice.

## Ralph Lanes

### Polish

- Prompt: `plugins\ralph-wiggum-loop\prompts\yourwifey-polish-next.prompt.md`
- Completion promise: `YOURWIFEY_POLISH_COMPLETE`
- First bar: existing overlay/settings/chat/TTS/animation UX is coherent enough
  for live demos, with no stale labels or obvious broken controls.

### Code Review

- Prompt: `plugins\ralph-wiggum-loop\prompts\yourwifey-code-review-next.prompt.md`
- Completion promise: `YOURWIFEY_CODE_REVIEW_COMPLETE`
- First bar: no critical/high/medium release blockers remain untracked, and
  actionable findings are either fixed or written into this doc with file/line
  evidence.

### Efficiency

- Prompt: `plugins\ralph-wiggum-loop\prompts\yourwifey-efficiency-next.prompt.md`
- Completion promise: `YOURWIFEY_EFFICIENCY_COMPLETE`
- First bar: chat, Responses streaming, TTS, memory worker, animation, and VPS
  routelet have been checked for blocking work, queue stalls, duplicate work,
  leaks, and poor cleanup.

### Commercial Production

- Prompt: `plugins\ralph-wiggum-loop\prompts\yourwifey-commercial-next.prompt.md`
- Completion promise: `YOURWIFEY_COMMERCIAL_READY`
- First bar: product spine is designed and then implemented in slices: auth,
  tenancy, DB, credits, billing, rate limits, admin, and deploy hardening.

## Run Commands

Dry-run a lane:

```powershell
.\plugins\ralph-wiggum-loop\scripts\run-codex-ralph-loop.ps1 `
  -PromptFile .\plugins\ralph-wiggum-loop\prompts\yourwifey-polish-next.prompt.md `
  -MaxIterations 1 `
  -DryRun
```

First live pass for a lane:

```powershell
.\plugins\ralph-wiggum-loop\scripts\run-codex-ralph-loop.ps1 `
  -PromptFile .\plugins\ralph-wiggum-loop\prompts\yourwifey-polish-next.prompt.md `
  -CompletionPromise YOURWIFEY_POLISH_COMPLETE `
  -MaxIterations 1 `
  -MinIterations 1 `
  -Sandbox danger-full-access `
  -SkipGitRepoCheck
```

Bounded sprint after one clean live pass:

```powershell
.\plugins\ralph-wiggum-loop\scripts\run-codex-ralph-loop.ps1 `
  -PromptFile .\plugins\ralph-wiggum-loop\prompts\yourwifey-polish-next.prompt.md `
  -CompletionPromise YOURWIFEY_POLISH_COMPLETE `
  -MaxIterations 4 `
  -MinIterations 1 `
  -Sandbox danger-full-access `
  -SkipGitRepoCheck
```

Swap the prompt and completion promise for the other lanes.

## Verification Log

- 2026-05-14: Created productization Ralph status doc and split prompts for
  polish, code review, efficiency, and commercial-production work.
- 2026-05-14: Dry-run validation showed the runner state file is shared; do not
  launch Ralph lanes in parallel.
- 2026-05-14: Polish iteration inspected `README.md`,
  `docs\PRODUCTIZATION_RALPH_STATUS.md`, `docs\grillo-memory-status.md`,
  `.ralph-loop\ralph-state.json`, `git status --short` (clean), and
  `git log -3 --oneline` (`a9b9e45`, `28e0c68`, `2782074`). Patch landed
  Twitch channel persistence for the operator settings path: saved as
  `yourwifey.twitchChannel.v1`, normalized without `#`, hydrated before direct
  browser IRC starts, and reflected in the startup status line.
- 2026-05-14: `npx vitest run src/lib/chat/storage.test.ts` -> passed, 1 file,
  2 tests. `npm run build` -> passed with existing `onnxruntime-web` eval and
  large chunk warnings. `git diff --check` -> passed with line-ending warnings
  only.
- 2026-05-14: Polish iteration inspected `README.md`,
  `docs\PRODUCTIZATION_RALPH_STATUS.md`, `docs\grillo-memory-status.md`,
  `src\components\menu\SettingsPanel.tsx`,
  `src\components\menu\tabs\ContextTab.tsx`,
  `src\components\menu\tabs\AnimTab.tsx`, `git status --short` (clean), and
  `git log -3 --oneline` (`e0665b3`, `a9b9e45`, `28e0c68`). Finding: generated
  Silly Tavern animation labels were not title-cased because
  `src\lib\vrm\sequencer.ts` used an escaped word-boundary regex
  (`/\\b\\w/g`). Patch changed the formatter to real word boundaries so the
  settings animation playlist shows title-cased names such as
  `Silly Action Attention Seeking`, and added `src\lib\vrm\sequencer.test.ts`.
- 2026-05-14: `npx vitest run src/lib/vrm/sequencer.test.ts` -> passed, 1 file,
  1 test. `npm run build` -> passed with existing `onnxruntime-web` eval and
  large chunk warnings. `git diff --check` -> passed with line-ending warnings
  only.
- 2026-05-14: Polish iteration inspected `README.md`,
  `docs\PRODUCTIZATION_RALPH_STATUS.md`, `docs\grillo-memory-status.md`,
  `src\components\menu\tabs\ContextTab.tsx`,
  `src\components\menu\tabs\TwitchTab.tsx`,
  `src\components\menu\tabs\TtsTab.tsx`, and TTS wiring in `src\App.tsx`;
  `git status --short` was clean and `git log -3 --oneline` showed `ed02ad4`,
  `e0665b3`, and `a9b9e45`. Finding: the TTS surface still used stale
  `FishSpeech`/`Inworld Realtime` wording and remote voice registry
  empty/error/manual states were not consistently visible. Patch centralized TTS
  provider labels, changed Inworld to `Inworld Stream`, spaced `Fish Speech`,
  and added an operator-visible remote voice list status line for loading,
  errors, empty server-default mode, and manual voice ids.
- 2026-05-14: `npx vitest run src/lib/tts/labels.test.ts` -> passed, 1 file,
  2 tests. `npm run build` -> passed with existing `onnxruntime-web` eval and
  large chunk warnings. `git diff --check` -> passed with line-ending warnings
  only.
- 2026-05-14: Polish iteration inspected `README.md`,
  `docs\PRODUCTIZATION_RALPH_STATUS.md`, `docs\grillo-memory-status.md`,
  `src\components\chat\ChatLog.tsx`, `src\components\chat\ChatBar.tsx`,
  `src\components\menu\SettingsPanel.tsx`,
  `src\components\menu\tabs\ContextTab.tsx`,
  `src\components\menu\tabs\TwitchTab.tsx`,
  `src\components\menu\tabs\AiTab.tsx`, and `src\style.css`;
  `git status --short` was clean and `git log -3 --oneline` showed `e29ff0c`,
  `ed02ad4`, and `e0665b3`. Finding: the overlay chat still said
  `Waiting for Twitch chat.` even though the same overlay renders local test
  messages, and the first-reply state could show stale waiting copy while the
  assistant was already generating. Patch changed the overlay header to
  `Live Chat`, added state-aware empty copy for expanded, collapsed, and
  generating states, and covered the copy in
  `src\components\chat\ChatLog.test.ts`.
- 2026-05-14: Focused sanitizer test initially exposed an overlay safety edge:
  local URLs such as `http://localhost:8787/path` were reduced to generic
  `[link]` instead of `[local]`. Patch now preserves local endpoint redaction as
  `[local]` before the generic URL scrub.
- 2026-05-14: `npx vitest run src/components/chat/ChatLog.test.ts` -> passed, 1
  file, 4 tests. `npm run build` -> passed with existing `onnxruntime-web` eval
  and large chunk warnings. `git diff --check` -> passed with line-ending
  warnings only.
- 2026-05-14: Code-review iteration inspected `README.md`,
  `docs\PRODUCTIZATION_RALPH_STATUS.md`, `docs\grillo-memory-status.md`,
  `docs\STREAM_ROUTELET.md`, `git status --short` (clean), and
  `git log -3 --oneline` (`66c9267`, `e29ff0c`, `ed02ad4`) before editing.
  Required-area review covered ChatTurn intake/scheduler in `src\App.tsx`,
  `src\lib\chat\chat-turn.ts`, and `server\src\scheduler\ChatScheduler.ts`;
  OpenAI Responses state/tool calls in `server\src\ai\OpenAiResponsesProvider.ts`
  and `api\ai\chat.ts`; POML rendering in `src\lib\chat\prompt.ts`,
  `src\lib\chat\poml.ts`, and the POML template; TTS streaming in
  `src\lib\tts\manager.ts`, `server\src\tts\RemoteTtsProvider.ts`, and
  `server\src\index.ts`; memory/diary scoping in `src\App.tsx` and
  `src\lib\chat\grillo-memory-loop.ts`; settings persistence in
  `src\lib\chat\storage.ts`; command permissions in `src\App.tsx` and
  `server\src\commands\CommandRouter.ts`; and VPS assumptions in
  `scripts\stream-routelet.sh` plus `docs\STREAM_ROUTELET.md`.
- 2026-05-14: Finding fixed, Medium: scoped relationship memory commits could
  overwrite the currently displayed/ref relationship memory even when the commit
  belonged to another state key, such as a Twitch reply or stale background diary
  pass finishing while the operator was viewing local persona memory. Evidence
  before the patch was the unconditional display update in `src\App.tsx`'s
  `commitScopedRelationshipMemory`; current fix keeps all writes in
  `relationshipMemories` while only exposing the memory when the committed key
  matches the active key (`src\App.tsx`, `src\lib\chat\scoped-relationship-memory.ts`).
- 2026-05-14: `npx vitest run src/lib/chat/scoped-relationship-memory.test.ts
  src/lib/chat/storage.test.ts src/lib/chat/grillo-memory-loop.test.ts` ->
  passed, 3 files, 7 tests. First run failed on a missing test-file close paren
  and was fixed before rerun. `git diff --check` -> passed with line-ending
  warnings only. `npm run build` -> passed with existing `onnxruntime-web` eval
  and large chunk warnings.
- 2026-05-14: Code-review iteration inspected `README.md`,
  `docs\PRODUCTIZATION_RALPH_STATUS.md`, `docs\grillo-memory-status.md`,
  `docs\STREAM_ROUTELET.md`, `git status --short` (clean), and
  `git log -3 --oneline` (`9b6bdd1`, `66c9267`, `e29ff0c`) before editing.
  Required-area review covered ChatTurn intake/scheduler in `src\App.tsx`,
  `src\lib\chat\chat-turn.ts`, and `server\src\scheduler\ChatScheduler.ts`;
  OpenAI Responses state/tool calls in `server\src\ai\OpenAiResponsesProvider.ts`
  and `api\ai\chat.ts`; POML rendering in `src\lib\chat\prompt.ts`,
  `src\lib\chat\poml.ts`, `api\ai\poml\render.ts`, and `server\src\index.ts`;
  TTS streaming in `src\lib\tts\manager.ts`,
  `server\src\tts\RemoteTtsProvider.ts`, and `server\src\index.ts`;
  memory/diary scoping in `src\App.tsx` and
  `src\lib\chat\grillo-memory-loop.ts`; settings persistence in
  `src\lib\chat\storage.ts`; command permissions in `src\App.tsx` and
  `server\src\commands\CommandRouter.ts`; and VPS assumptions in
  `scripts\stream-routelet.sh` plus `docs\STREAM_ROUTELET.md`.
- 2026-05-14: Finding fixed, Medium: the serverless `/api/ai/chat` streaming
  path could lose Responses tool-call arguments when
  `response.output_item.added` arrived before the final `call_id`, so Tavily
  tool follow-up could run with empty args or skip the intended query. Evidence
  before the patch was the route's stricter `isFunctionCallItem` gate and
  output-index map in `api\ai\chat.ts`, while the long-running provider already
  had late-`call_id` tracking in `server\src\ai\OpenAiResponsesProvider.ts`.
  Current fix adds serverless streamed function-call state and merges completed
  calls in `api\ai\chat.ts`; regression coverage in `api\ai\chat.test.ts`
  simulates `call_search_b` receiving arguments before its `call_id` and asserts
  both `alpha` and `beta` Tavily queries plus both function outputs.
- 2026-05-14: `npx vitest run api/ai/chat.test.ts
  server/src/ai/OpenAiResponsesProvider.test.ts` -> passed, 2 files, 19 tests.
  `npm run build` -> passed with existing `onnxruntime-web` eval and large chunk
  warnings. `git diff --check` -> passed with line-ending warnings only.
- 2026-05-14: Efficiency iteration inspected `README.md`,
  `docs\PRODUCTIZATION_RALPH_STATUS.md`, `docs\STREAM_ROUTELET.md`,
  `docs\grillo-memory-status.md`, `git status --short` (clean), and
  `git log -3 --oneline` (`04c7ce8`, `9b6bdd1`, `66c9267`) before editing.
  Required-area review covered browser Twitch intake, direct queue drain, batch
  timers, and cooldown in `src\App.tsx`; older server scheduler drain behavior
  in `server\src\scheduler\ChatScheduler.ts`; OpenAI Responses streaming and
  tool rounds in `server\src\ai\OpenAiResponsesProvider.ts` and `api\ai\chat.ts`;
  Fish/Inworld/Piper buffering and cleanup in `src\lib\tts\manager.ts`,
  `server\src\tts\RemoteTtsProvider.ts`, and `src\lib\tts\piper.ts`; memory
  worker/background loops in `src\App.tsx` and
  `src\lib\chat\grillo-memory-loop.ts`; VRM animation/frame/timer cleanup in
  `src\components\VrmStage.tsx` and `src\lib\vrm\sequencer.ts`; direct Twitch
  and overlay socket listener cleanup in `src\lib\twitch\direct-irc.ts` and
  `src\App.tsx`; routelet process cleanup in `scripts\stream-routelet.sh`; and
  current bundle warnings from `npm run build`.
- 2026-05-14: Finding fixed, Medium: the VPS routelet only sent `SIGTERM` to
  the recorded root PID for Chromium, Xvfb, and the locally started
  `npm run start:stream` app. Evidence before the patch: `start_chromium` and
  `start_app_if_needed` launch background shell/process trees, but
  `cleanup_run`/`cleanup_all` killed only `$CHROME_PID`, `$XVFB_PID`, and
  `$APP_PID`. A routelet restart or exit could leave Chromium renderer/GPU or
  app child processes behind. Patch added `terminate_process_tree`, reusing the
  existing descendant walk, with configurable `STREAM_CLEANUP_GRACE_SECONDS`
  before `SIGKILL`, and routelet cleanup now stops Chromium, Xvfb, and the app
  process tree.
- 2026-05-14: `bash -n scripts/stream-routelet.sh` -> passed. `npm run build`
  -> passed with existing `onnxruntime-web` eval and large chunk warnings.
  `git diff --check` -> passed with line-ending warnings only.
- 2026-05-14: Efficiency iteration inspected `README.md`,
  `docs\PRODUCTIZATION_RALPH_STATUS.md`, `docs\STREAM_ROUTELET.md`,
  `docs\grillo-memory-status.md`, `.ralph-loop\ralph-state.json`,
  `git status --short` (clean before edits), and `git log -3 --oneline`
  (`0253a5c`, `04c7ce8`, `9b6bdd1`) before editing. Required-area read
  covered browser direct Twitch queue drain/cooldown and batch timers in
  `src\App.tsx`, older server scheduler queue caps in
  `server\src\scheduler\ChatScheduler.ts`, OpenAI Responses streaming/tool
  rounds in `server\src\ai\OpenAiResponsesProvider.ts` and `api\ai\chat.ts`,
  Fish/Inworld/Piper buffering and cleanup in `src\lib\tts\manager.ts`,
  `server\src\tts\RemoteTtsProvider.ts`, and `src\lib\tts\piper.ts`, memory
  worker loops in `src\lib\chat\grillo-memory-loop.ts`, VRM animation cleanup
  in `src\components\VrmStage.tsx` and `src\lib\vrm\sequencer.ts`, direct IRC
  listener cleanup in `src\lib\twitch\direct-irc.ts`, routelet cleanup in
  `scripts\stream-routelet.sh`, and current bundle warnings from
  `npm run build`.
- 2026-05-14: Finding fixed, Medium: browser direct Twitch AI jobs had no
  pending queue cap. Evidence before the patch: `enqueueTwitchAiJob` in
  `src\App.tsx` pushed directly to `twitchAiQueueRef.current`, while
  `processTwitchAiQueue` serialized every job behind reply/TTS completion and a
  2 second reply gap. A slow AI/TTS period could turn chat mentions or batch
  work into stale, unbounded backlog. Patch added
  `src\lib\chat\twitch-ai-queue.ts` with an 8-job pending cap, direct-reply
  freshness policy, batch coalescing, a 120-message retained batch cap, and an
  operator-visible backpressure status line. `!yw status` / `!yw state` now
  show queue length against the cap.
- 2026-05-14: `npx vitest run src/lib/chat/twitch-ai-queue.test.ts` -> passed,
  1 file, 3 tests. `npm run build` -> passed with existing `onnxruntime-web`
  eval and large chunk warnings. `git diff --check` -> passed with line-ending
  warnings only.
- 2026-05-14: Efficiency iteration inspected `README.md`,
  `docs\PRODUCTIZATION_RALPH_STATUS.md`, `docs\STREAM_ROUTELET.md`,
  `docs\grillo-memory-status.md`, `git status --short` (clean before edits),
  and `git log -3 --oneline` (`e73abcb`, `0253a5c`, `04c7ce8`) before
  editing. Required-area read covered browser direct Twitch queue
  drain/cooldown and backpressure in `src\App.tsx` plus
  `src\lib\chat\twitch-ai-queue.ts`, older server scheduler batch caps in
  `server\src\scheduler\ChatScheduler.ts`, OpenAI Responses streaming/tool
  rounds in `server\src\ai\OpenAiResponsesProvider.ts`, `api\ai\chat.ts`, and
  `server\src\index.ts`, Fish/Inworld/Piper buffering and cleanup in
  `src\lib\tts\manager.ts`, `server\src\tts\RemoteTtsProvider.ts`, and
  `src\lib\tts\piper.ts`, memory worker loops in `src\App.tsx` and
  `src\lib\chat\grillo-memory-loop.ts`, VRM animation/frame cleanup in
  `src\components\VrmStage.tsx` and `src\lib\vrm\sequencer.ts`, direct IRC and
  audio listener cleanup in `src\lib\twitch\direct-irc.ts` and `src\App.tsx`,
  routelet cleanup in `scripts\stream-routelet.sh`, and current bundle warnings
  from `npm run build`.
- 2026-05-14: Finding fixed, Medium: remote PCM TTS scheduling waited for a
  chunk's playback `ended` event before scheduling the next PCM chunk. Evidence
  before the patch: `src\lib\tts\manager.ts` chained live-bridge pushes through
  `tail.then(... await scheduleRemotePcmChunk(...))`, while
  `scheduleRemotePcmChunk` resolved only from `source.onended`; the remote
  `queueRemoteText` PCM path also treated that playback-end promise as the
  scheduling tail. Fish live-bridge audio could therefore sit in a client-side
  promise queue until the prior PCM buffer finished, defeating the existing
  `streamPlaybackEndTime` lookahead/crossfade logic and adding small gaps under
  streamed speech. Patch separates PCM scheduling order from playback completion:
  chunks are scheduled in arrival order as soon as their PCM bytes are decoded,
  but each push still resolves when its audio source ends so TTS busy/cooldown
  behavior stays intact. Added `src\lib\tts\manager.test.ts` with a fake
  `AudioContext` proving a second live PCM chunk is scheduled before the first
  chunk fires `onended`.
- 2026-05-14: `npx vitest run src/lib/tts/manager.test.ts
  server/src/tts/RemoteTtsProvider.test.ts` -> passed, 2 files, 3 tests.
  `npm run build` -> passed with existing `onnxruntime-web` eval warning and
  existing large chunk warnings (`index` about 1517 kB, `phonemizer` about
  1321 kB, `ort.min` about 537 kB). `git diff --check` -> passed with
  line-ending warnings only.

## Current Blocker Or Next Patch

Next efficiency read: inspect the SSE live-bridge close path for chat queue
stall risk. Current evidence to re-check: `server\src\index.ts` awaits
`bridgeDone` before emitting the final `done` event for `/ai/chat`, and
`RemoteTtsProvider` has a 45 second remote TTS timeout. If Fish generation hangs
after the AI text is complete, the browser can keep the chat job open until the
TTS timeout even though streamed text/audio already reached the overlay. Prove
whether this is acceptable with a fake provider/bridge test, or bound/decouple
the bridge drain safely.

Prior code-review next remains queued for that lane: inspect serverless
`/api/ai/embeddings.ts` parity against the long-running `/ai/embeddings` route,
then re-check command reply routing and routelet smoke-test failure handling.

## Completion Bar

Do not claim the whole productization push is complete until:

- Polish lane has no obvious demo-blocking UX/control/settings issues.
- Code-review lane has no untracked critical/high/medium blockers.
- Efficiency lane has inspected and improved the major latency/blocking paths.
- Commercial-production lane has at least a minimal auth/billing/credit design
  and a staged implementation plan with tests.
- Any implemented code passes targeted tests, `git diff --check`, and
  `npm run build`.
