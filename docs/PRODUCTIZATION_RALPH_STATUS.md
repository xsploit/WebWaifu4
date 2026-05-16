# YourWifey Productization Ralph Status

## Current Goal

Turn YourWifey Stream from a working Twitch-first AI overlay into a polished,
sellable product without losing the fast local stream workflow. Productization is
split into bounded Ralph lanes so polish, review, performance, and commercial
architecture do not overwrite each other's scope.

## Source Of Truth

- Worktree: `C:\Users\SUBSECT\Documents\GitHub\YourWifey-BYOK`
- Current branch: `codex/byok-product-spine`
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

Current BYOK fork decision:

- Auth: Supabase magic-link for dashboard login and browser session state.
- Database: Supabase Postgres for profiles, workspaces, scenes, and safe
  non-secret settings.
- Storage mode: users can stay local-only or use cloud sync for safe settings.
- Provider API keys: browser-local only for v1; cloud stores descriptors/settings,
  never provider key values.
- Billing: out of scope for the BYOK MVP. If paid managed credits return later,
  use Stripe Checkout, Customer Portal, signed webhooks, and an append-only
  usage ledger instead of only a mutable balance.
- Overlay access: signed overlay tokens scoped to workspace/scene, not full
  dashboard sessions.
- Provider accounting: future managed mode should normalize OpenAI, Fish Speech,
  Inworld, Tavily, and future tools into one usage-event model with estimated
  cost, actual cost when known, and configurable markup.

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
- 2026-05-15: Work-rhythm checkpoint implemented the BYOK product auth/cloud
  sync spine. Added internal route parsing for `/`, `/login`, `/auth/callback`,
  `/account`, `/dashboard`, and `/overlay/:sceneId`; added product pages for
  magic-link login, callback status, dashboard, and account/profile editing;
  converted `/api/byok/profile` and `/api/byok/workspaces/:workspaceId` from
  authorization-only stubs into real Supabase-backed JSON routes; added
  profile/workspace/scene bootstrap helpers with defaults `My Stream` and
  `Main Overlay`; and added browser API helpers that attach the Supabase bearer
  token while keeping provider keys browser-local.
- 2026-05-15: Auth/API security pass for the checkpoint found no new blocker:
  provider key material is still blocked by the existing cloud route secret
  scanner, service-role credentials remain server-side in `api/byok/_lib`, CORS
  stays allowlist/local-only, workspace writes still pass the owner guard before
  database mutation, and product UI/API helper tests assert secret-shaped data is
  not placed in synced request bodies.
- 2026-05-15: `npx vitest run src/lib/product/app-route.test.ts
src/lib/product/byok-api.test.ts src/lib/product/byok-route-stub.test.ts
api/byok/_lib/supabase-context.test.ts api/byok/_lib/product-data.test.ts` ->
  passed, 5 files, 21 tests. `npm run build` -> passed with existing
  `onnxruntime-web` eval and large chunk warnings. `git diff --check` -> passed
  with line-ending warnings only.
- 2026-05-15: Work-rhythm checkpoint added the safe cloud settings sync layer.
  Added `src\lib\product\cloud-settings.ts` to serialize only non-secret
  product settings for cloud sync: personas, active persona/model, AI settings,
  UI state, Twitch channel, sequencer, and visual settings. Chat history,
  relationship memory, and relationship memory maps are explicitly local-only
  until the memory policy is implemented. Added
  `/api/byok/workspaces/:workspaceId/settings/:settingId` for GET/PATCH synced
  settings and extended the BYOK API client with setting fetch/patch helpers.
- 2026-05-15: Security pass for the settings checkpoint found no new blocker:
  `assertSettingCanSync` rejects provider-key records, route body scanning still
  rejects secret-shaped payloads before database mutation, route ownership still
  requires workspace reader/owner access, and allowed storage classes are limited
  to `public-overlay` plus `synced-private`.
- 2026-05-15: `npx vitest run src/lib/product/cloud-settings.test.ts
src/lib/product/byok-api.test.ts src/lib/product/byok.test.ts
src/lib/product/byok-route-stub.test.ts api/byok/_lib/product-data.test.ts
api/byok/_lib/supabase-context.test.ts` -> passed, 6 files, 24 tests.
  `npm run build` -> passed with existing `onnxruntime-web` eval and large chunk
  warnings. `git diff --check` -> passed with line-ending warnings only.
- 2026-05-15: Work-rhythm UI checkpoint wired the dashboard `Sync settings`
  button to the safe cloud settings adapter. The editor now passes the current
  persisted-state snapshot into product pages, and dashboard sync uploads only
  the records emitted by `buildCloudSettingRecords`; chat history and
  relationship memory remain local-only. Status copy reports the number of safe
  records synced.
- 2026-05-15: `npx vitest run src/lib/product/cloud-settings.test.ts
src/lib/product/byok-api.test.ts` -> passed, 2 files, 7 tests. `npm run build`
  -> passed with existing `onnxruntime-web` eval and large chunk warnings.
  `git diff --check` -> passed with line-ending warnings only.
- 2026-05-15: Work-rhythm checkpoint closed the cloud settings restore loop.
  Added `GET /api/byok/workspaces/:workspaceId/settings` to list synced settings,
  added client fetch helpers, and added `applyCloudSettingRecords` so Dashboard
  can load cloud settings back into the editor. Restore applies only the safe
  BYOK setting allowlist and keeps relationship memory/chat history local-only.
  If a synced bundled VRM model id changes, the editor triggers the bundled
  model loader after applying the state snapshot.
- 2026-05-15: Security pass for restore found no new blocker: list/read routes
  require workspace reader access, writes still require owner access, cloud
  records pass `assertSettingCanSync`, and restore ignores non-allowlisted keys.
- 2026-05-15: `npx vitest run src/lib/product/cloud-settings.test.ts
src/lib/product/byok-api.test.ts src/lib/product/byok.test.ts
src/lib/product/byok-route-stub.test.ts api/byok/_lib/product-data.test.ts
api/byok/_lib/supabase-context.test.ts` -> passed, 6 files, 26 tests.
  `npm run build` -> passed with existing `onnxruntime-web` eval and large chunk
  warnings. `git diff --check` -> passed with line-ending warnings only.
- 2026-05-15: Work-rhythm checkpoint added scoped OBS overlay sharing
  groundwork. Dashboard can issue a signed OBS overlay URL for the default
  scene. Added `POST
/api/byok/workspaces/:workspaceId/scenes/:sceneId/overlay-tokens` for owner
  token issuance and `GET /api/byok/overlay/:sceneId/config` for token-scoped
  public overlay config. Tokens are HMAC-signed server-side, default to 30 days,
  and carry only workspace/scene/scope/expiry claims.
- 2026-05-15: Security pass for overlay sharing found no new blocker: the
  public overlay route requires a valid scoped overlay token, only returns
  `public-overlay` setting records, verifies scene/workspace binding, and never
  uses the dashboard bearer session for OBS access. Token signing uses
  `OVERLAY_SIGNING_SECRET` when configured, falling back to existing server-only
  secrets.
- 2026-05-15: `npx vitest run api/byok/_lib/overlay-token.test.ts
api/byok/_lib/product-data.test.ts api/byok/_lib/supabase-context.test.ts
src/lib/product/byok-api.test.ts src/lib/product/byok-route-stub.test.ts
src/lib/product/byok.test.ts` -> passed, 6 files, 25 tests. `npm run build`
  -> passed with existing `onnxruntime-web` eval and large chunk warnings.
  `git diff --check` -> passed with line-ending warnings only.
- 2026-05-15: Work-rhythm checkpoint added safe scene backup import/export.
  Dashboard now has `Export backup` and `Import backup` controls; exported
  files contain only the same safe setting records used by cloud sync. Import
  validates the backup shape before applying records through the existing safe
  cloud settings path. Chat history and relationship memory are counted/reported
  but never included in the backup payload.
- 2026-05-15: Security pass for scene backup found no new blocker: backup import
  filters by app/version, safe setting key allowlist, and allowed storage
  classes before applying records. The serializer does not include chat history,
  relationship facts, provider key fields, or secret-shaped API key values.
- 2026-05-15: `npx vitest run src/lib/product/scene-backup.test.ts
src/lib/product/cloud-settings.test.ts src/lib/product/byok.test.ts` ->
  passed, 3 files, 13 tests. `npm run build` -> passed with existing
  `onnxruntime-web` eval and large chunk warnings.
- 2026-05-15: Work-rhythm checkpoint wired signed OBS overlay URLs into the
  browser overlay route. `/overlay/:sceneId?token=...` now fetches the
  token-scoped public overlay config, applies returned public settings through
  the safe cloud settings adapter, and uses the scene Twitch channel from the
  public config. `/overlay/:sceneId` without a token remains a private/local
  preview path.
- 2026-05-15: Security pass for overlay hydration found no new blocker: the
  front end sends only the scoped overlay token to the public overlay config
  endpoint, never dashboard bearer auth; the server route still filters to
  `public-overlay` records only.
- 2026-05-15: `npx vitest run src/lib/product/byok-api.test.ts
src/lib/product/cloud-settings.test.ts src/lib/product/app-route.test.ts` ->
  passed, 3 files, 20 tests.
- 2026-05-15: Work-rhythm checkpoint added deployment source-of-truth docs for
  the BYOK hosted path. Added `.env.example` with browser-visible and
  server-only variables, added `docs\VERCEL_SUPABASE_BYOK.md` with Supabase
  migration/auth redirect/Vercel env/smoke-test steps, and updated `README.md`
  to describe the product shell routes plus deployment runbook.
- 2026-05-15: Security pass for the deployment docs found no new blocker:
  placeholders only, no real key material; docs explicitly warn against `VITE_`
  provider/service-role/JWT/signing secrets and keep provider keys browser-local
  for v1.
- 2026-05-15: `npx vitest run src/lib/product/supabase-schema.test.ts
src/lib/product/supabase-env.test.ts src/lib/product/byok.test.ts` -> passed,
  3 files, 19 tests.
- 2026-05-15: Security/review checkpoint swept BYOK auth/API token and secret
  handling with grep probes plus targeted route/env/token tests. The sweep found
  a stale safety-net test: `server-route-ownership.test.ts` still expected the
  older route contract list and failed after profile write plus setting list/read
  routes were added. Fixed the test expectation so the route contract table is
  covered again.
- 2026-05-15: `git grep` secret probe found only placeholders, redaction tests,
  and documentation examples. Targeted auth/API test rerun:
  `npx vitest run src/lib/product/supabase-env.test.ts
src/lib/product/byok.test.ts src/lib/product/server-route-ownership.test.ts
api/byok/_lib/overlay-token.test.ts api/byok/_lib/supabase-context.test.ts
src/lib/product/byok-api.test.ts` -> passed, 6 files, 33 tests.
- 2026-05-15: Hosted deployment checkpoint added `vercel.json` with the pinned
  build command/output directory and SPA rewrites for product routes. This keeps
  direct refresh/open of `/login`, `/auth/callback`, `/account`, `/dashboard`,
  and `/overlay/:sceneId` from falling through to a hosted 404 while preserving
  `/api/byok/*` as serverless API routes.
- 2026-05-15: Supabase key compatibility checkpoint updated the env reader to
  accept the new Supabase API key names. `VITE_SUPABASE_PUBLISHABLE_KEY` and
  `SUPABASE_PUBLISHABLE_KEY` now map to the public browser/API key slot, while
  `SUPABASE_SECRET_KEY` maps to the server-only admin key slot. Legacy
  `*_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` names remain supported.
- 2026-05-15: Security pass for key compatibility found no new blocker:
  `VITE_SUPABASE_SECRET_KEY` is explicitly rejected as browser-exposed secret
  material, docs prefer publishable/secret names, and `.env.example` contains
  placeholders only. `npx vitest run src/lib/product/supabase-env.test.ts
src/lib/product/account-mode.test.ts src/lib/product/supabase-auth-shell.test.ts
src/lib/product/supabase-auth-session.test.ts src/lib/product/byok.test.ts` ->
  passed, 5 files, 35 tests.
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
