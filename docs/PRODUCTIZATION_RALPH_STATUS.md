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
- 2026-05-15: Polish checkpoint cleaned up the product dashboard UI after the
  first VPS upload exposed that the account/dashboard pages still looked like a
  debug modal. Reworked `ProductPages` and product CSS into a full-height BYOK
  Studio shell with left navigation, compact header, separated dashboard
  sections for current scene, overlay, settings, and account, plus less noisy
  button/card styling.
- 2026-05-15: `npm run build` -> passed locally with existing
  `onnxruntime-web` eval and large chunk warnings. `git diff --check` -> passed
  with line-ending warnings only. Commit `436d763 style(byok): clean up product
dashboard ui` was pushed to `codex/byok-product-spine`, hot-uploaded to the
  OVH VPS, rebuilt there, and restarted. VPS checks: `/dashboard` and `/`
  returned HTTP 200 through `https://148-113-191-103.sslip.io/`; bot health
  stayed OK on `127.0.0.1:8787`.
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
- 2026-05-16: Claude UI implementation pass, Codex-reviewed and tightened.
  Scope stayed in `src\components\product\ProductPages.tsx` and
  `src\style.css`. Product pages now match the dark waifu/editor shell more
  closely: neon red/pink glass panels, clipped HUD buttons, auth-aware product
  nav, local-only dashboard launchpad, cloud CTA, polished login/account flow,
  auto-redirecting auth callback, and no dashboard Account duplicate card.
  Codex patched the redirect effects to avoid broad `props` dependencies and
  added signed-in Overlay navigation. Verification:
  `npx prettier --write src/components/product/ProductPages.tsx src/style.css`
  -> passed; `npm run build` -> passed with existing `onnxruntime-web` eval and
  large chunk warnings; `git diff --check` -> passed with line-ending warnings
  only; local preview route smoke for `/`, `/dashboard`, `/login`, `/account`,
  and `/overlay/private-preview` -> HTTP 200; Chrome headless screenshot of
  `/dashboard` rendered the product shell correctly.
- 2026-05-16: Supabase project `btjccsyoevbczmamoamt` configured locally and
  on the OVH VPS. Added ignored local `.env` / `.env.local` values and upserted
  the same Supabase public/admin config plus generated overlay signing secret
  into `/home/ubuntu/yourwifey-stream/.env`. Added VPS standalone support for
  BYOK cloud routes: `serve-dist.mjs` now proxies `/api/*` to the bot API
  process, `server\src\index.ts` mounts compiled `/api/byok/*` handlers, and
  `tsconfig.api.json` now emits `api-dist` for that runtime. Verification:
  Supabase `/auth/v1/settings` -> HTTP 200; `npm run build` -> passed with
  existing `onnxruntime-web` eval and large chunk warnings; local direct
  `/api/byok/profile` and proxied `/api/byok/profile` -> expected HTTP 401 JSON
  auth-required response instead of 404/501. VPS Caddy also had an older
  `/api/*` strip-prefix rule; backed up `/etc/caddy/Caddyfile`, removed the
  strip so `/api/byok/*` reaches the bot process intact, validated/reloaded
  Caddy, and confirmed public
  `https://148-113-191-103.sslip.io/api/byok/profile` now returns expected HTTP
  401 `supabase-auth-required` JSON.
- 2026-05-16 heartbeat checkpoint: proved the next Supabase blocker. Read
  `git status --short` (clean), recent commits (`1c41259`, `882a4dd`,
  `b5007b8`, `e440acd`, `436d763`), this status doc, and
  `supabase\migrations\20260515000100_byok_product_spine.sql`. Supabase Auth
  settings still returns HTTP 200, but server-side Node `fetch` with the
  configured server key returns HTTP 404 for every expected migration table:
  `profiles`, `workspaces`, `workspace_members`, `scenes`, `characters`,
  `synced_settings`, `provider_secret_descriptors`, `overlay_tokens`,
  `memory_entries`, and `assets`, each reporting that the table is not in the
  public schema cache. A PowerShell probe with `sb_secret` returned Supabase's
  browser-use guard; official Supabase docs confirm secret keys are blocked for
  browser-like clients, so the decisive check is the Node/server-side fetch.
  No runtime code changed in this checkpoint, so no `npm run build` or VPS
  deploy was required. Security review: checked staged/tracked diff for
  `sb_secret`, `sb_publishable`, and provider-secret strings before commit;
  only ignored `.env`/`.env.local` contain configured key values.
- 2026-05-16: Supabase MCP was added to Codex and authenticated for project
  `btjccsyoevbczmamoamt`. Configured
  `C:\Users\SUBSECT\.codex\config.toml` with
  `remote_mcp_client_enabled = true`, ran `codex mcp add supabase --url ...`,
  and completed `codex mcp login supabase`; `codex mcp list` / `codex mcp get
  supabase` show the remote MCP server enabled with OAuth auth. Current Codex
  session did not expose Supabase MCP tools until a tool/session reload, so the
  migration was applied through the authenticated Supabase dashboard SQL editor.
- 2026-05-16: Applied
  `supabase\migrations\20260515000100_byok_product_spine.sql` in the Supabase
  SQL editor for project `btjccsyoevbczmamoamt`. Server-side Node REST probe
  with the configured ignored `.env.local` admin key now returns HTTP 200 for
  all expected BYOK tables: `profiles`, `workspaces`, `workspace_members`,
  `scenes`, `characters`, `synced_settings`,
  `provider_secret_descriptors`, `overlay_tokens`, `memory_entries`, and
  `assets`. Public VPS route smoke
  `https://148-113-191-103.sslip.io/api/byok/profile` returns expected HTTP
  401 `supabase-auth-required`, proving the route is live and now blocked only
  by auth instead of missing tables. Verification:
  `npx vitest run` over all `src\lib\product\*.test.ts` and
  `api\byok\_lib\*.test.ts` -> passed, 17 files, 88 tests; `npm run build` ->
  passed with existing `onnxruntime-web` eval and large chunk warnings.
- 2026-05-16: Real auth/bootstrap smoke found and fixed two Supabase BYOK
  bootstrap defects. First, `ensureByokProfile` wrote `profiles.email`, but the
  migration did not create the column; patched the migration to include
  `email text` plus an idempotent `alter table public.profiles add column if not
  exists email text`, applied that alter in Supabase SQL editor, and forced a
  PostgREST schema reload with `notify pgrst, 'reload schema'`. Second,
  `ensureDefaultScene` inserted `active_character_id: ''` into a uuid column;
  patched the bootstrap payload to use `null` and added test coverage. Live
  local API smoke against the real Supabase project created a temporary auth
  user, signed in, called `GET /api/byok/profile`, created profile/workspace/
  scene, called `GET /api/byok/workspaces/:workspaceId`, and deleted the test
  user: all checks passed. Verification: `npx vitest run` over all
  `src\lib\product\*.test.ts` and `api\byok\_lib\*.test.ts` -> passed, 17
  files, 89 tests; `npm run build` -> passed with existing `onnxruntime-web`
  eval and large chunk warnings; `git diff --check` -> passed with line-ending
  warnings only. VPS public smoke still needs the rebuilt API bundle deployed;
  SSH key auth from this Codex session returned permission denied, so hot-upload
  was not completed in this checkpoint.
- 2026-05-16 heartbeat deploy checkpoint: confirmed the remaining blocker is
  deploy access, not Supabase schema or local API code. `git status --short`
  was clean and recent commits were `e7785f2`, `ff6a9bd`, `1cc345e`,
  `1c41259`, and `882a4dd`. SSH deploy probe
  `ssh -o BatchMode=yes -o ConnectTimeout=10 ubuntu@148.113.191.103 "cd
  /home/ubuntu/yourwifey-stream && ..."` still failed with
  `Permission denied (publickey,password)`. Public authenticated VPS smoke
  created a temporary Supabase auth user, signed in, called
  `https://148-113-191-103.sslip.io/api/byok/profile`, and cleaned the user up;
  the deployed API still returned HTTP 500 `byok-route-failed` with
  `Supabase did not return a default scene`, which matches the stale pre-`e7785f2`
  bundle. No code changed in this checkpoint, so no `npm run build` or deploy
  was run. Security review: the smoke used ignored local env values and printed
  only statuses/error text, not access tokens or key material.
- 2026-05-16 VPS deploy recovery checkpoint: found the correct SSH key at
  `C:\Users\SUBSECT\.ssh\yourwifey_ovh_ed25519` and confirmed
  `ubuntu@148.113.191.103` login. Remote app directory
  `/home/ubuntu/yourwifey-stream` is an uploaded runtime tree, not a git
  checkout, so deploy used a direct `api-dist` upload. Backed up the remote
  `api-dist` into `.tmp/api-dist-backup-*`, uploaded the rebuilt local
  `api-dist`, and restarted the bot API process. Health check
  `http://127.0.0.1:8787/health` returned OK. Public authenticated VPS smoke
  created a temporary Supabase auth user, signed in, called
  `https://148-113-191-103.sslip.io/api/byok/profile`, confirmed
  profile/workspace/scene bootstrap, called
  `/api/byok/workspaces/:workspaceId`, and deleted the temporary user; all
  checks passed. Overlay process was not rebuilt because this fix only touched
  compiled BYOK API runtime. Security review: deploy preserved remote `.env`
  and `node_modules`, and smoke output did not print tokens or key material.
- 2026-05-16: Ported the supplied Gemini/HTML dashboard references into the
  BYOK product shell. `ProductPages` now renders a YW HUD nav, top status bar,
  provider status rows, and launch checklist; `src\style.css` now mirrors the
  reference dark glass/crimson HUD theme with scanline, grid background,
  clipped controls, compact cards, and neon status LEDs. Verification:
  `npx vitest run src/lib/product/app-route.test.ts src/lib/product/byok-api.test.ts`
  -> passed, 2 files, 16 tests; `npm run build` -> passed with existing
  `onnxruntime-web` eval and large chunk warnings; `git diff --check` ->
  passed with line-ending warnings only. Deployed the rebuilt `dist` to the OVH
  VPS with a tarball upload after a wildcard `scp` attempt partially copied only
  directories; public `https://148-113-191-103.sslip.io/dashboard` returned HTTP
  200 and referenced the new `index-6PgvHPxW.css` asset. API route
  `/api/byok/profile` still returns the expected unauthenticated HTTP 401.
- 2026-05-16 auth UX smoke checkpoint: fixed and deployed three live blockers
  found during the deployed browser smoke. First, `/auth/callback` and
  `/overlay/:sceneId` were blank because Vite emitted `./assets/...` URLs that
  resolved as `/auth/assets/...` or `/overlay/assets/...` on nested routes;
  commit `4c8347f` changes `vite.config.ts` to root asset URLs and the rebuilt
  `dist` was deployed to the OVH VPS. Second, cloud sync rejected safe
  `aiSettings.maxTokens` as secret material; commit `9b1d7db` narrows the
  route secret-key detector so real `apiKey`/`accessToken`/`clientSecret`
  shapes are still blocked while safe tuning keys pass, then rebuilt
  `server/dist` and `api-dist` were deployed and the API was restarted from
  `/home/ubuntu/yourwifey-stream` so remote `.env` loading stayed intact. Third,
  Supabase `synced_settings.id` is UUID, but the UI used string IDs such as
  `aiSettings`; commit `d2c2b8a` now emits deterministic UUID setting IDs and
  the rebuilt `dist` was deployed.

  Smoke results: Supabase OTP/magic-link request against a throwaway account
  was blocked by Supabase HTTP 429, so full inbox-link delivery remains
  rate-limited. A real callback/session URL for the same throwaway account
  redirected into `/dashboard` and persisted signed-in cloud state. Dashboard
  smoke passed: `Push to cloud` reported `Synced 8 safe settings`, `Pull from
  cloud` reported `Loaded 8 cloud settings into the editor`, and `Issue OBS URL`
  produced a signed `/overlay/:sceneId?token=...` URL expiring
  `2026-06-15T05:10:06.274Z`. Direct overlay config API probe with that token
  returned HTTP 200 with `settingsCount: 5`, `sceneName: Main Overlay`, and
  `twitchChannel: subsect`; however, the overlay page itself still displayed
  `Loading OBS overlay config...`, so the next UI/product blocker is the overlay
  route's client-side config-effect completion/render path. The temporary
  Supabase smoke user was deleted after the run. Verification:
  `npx vitest run src/lib/product/app-route.test.ts src/lib/product/supabase-auth-session.test.ts src/lib/product/byok-api.test.ts`
  -> passed, 3 files, 25 tests;
  `npx vitest run src/lib/product/server-route-ownership.test.ts src/lib/product/cloud-settings.test.ts src/lib/product/byok-api.test.ts`
  -> passed, 3 files, 17 tests; `npm run build` -> passed with existing
  `onnxruntime-web` eval and large chunk warnings; `git diff --check` ->
  passed with line-ending warnings only. Security review: tracked diffs were
  scanned for concrete Supabase/OpenAI/Fish/Inworld token values before commit,
  provider keys still stay browser-local, and the throwaway auth user cleanup
  invalidated the smoke account.
- 2026-05-16 overlay loader checkpoint: verified `codex mcp list` and
  `codex mcp get supabase` show Supabase MCP registered/enabled with OAuth for
  project `btjccsyoevbczmamoamt`, but this running desktop session still did
  not expose callable `mcp__supabase__*` tools through `tool_search`; future
  Supabase schema/data work should be run from a fresh Codex session or after
  MCP tool reload so database inspection happens through the MCP tool surface.
  Fixed the signed overlay page loading-state bug in commit `6ff14da`: the
  overlay config effect now depends only on route/token and calls the latest
  cloud-settings applier through a ref, so state changes cannot cancel a
  successful config fetch and leave `Loading OBS overlay config...` stuck.
  Verification: `npx vitest run src/lib/product/app-route.test.ts src/lib/product/byok-api.test.ts src/lib/product/cloud-settings.test.ts`
  -> passed, 3 files, 20 tests; `npm run build` -> passed with existing
  `onnxruntime-web` eval and large chunk warnings; `git diff --check` ->
  passed with line-ending warnings only. Deployed rebuilt `dist` to the OVH VPS
  and verified the public bundle references `/assets/index-iDLgo-6s.js`.
  Browser smoke with a fresh temporary Supabase account issued a signed overlay
  URL, loaded `/overlay/:sceneId?token=...`, and confirmed the page no longer
  displayed loading or invalid-token text; the temporary user was deleted after
  the smoke.
- 2026-05-16 overlay health marker checkpoint: added an invisible DOM-ready
  marker for signed OBS overlay routes in commit `6fc46f6`. The overlay still
  renders cleanly for OBS, but successful config load now emits
  `data-testid="obs-overlay-ready"` with the loaded scene id, giving browser
  smoke tests and operators a concrete health signal instead of relying on an
  empty DOM. Verification:
  `npx vitest run src/lib/product/app-route.test.ts src/lib/product/byok-api.test.ts src/lib/product/cloud-settings.test.ts`
  -> passed, 3 files, 20 tests; `npm run build` -> passed with existing
  `onnxruntime-web` eval and large chunk warnings; `git diff --check` ->
  passed with line-ending warnings only. Deployed rebuilt `dist` to the OVH VPS
  and verified public assets `index-wPAcj9D0.js` / `index-DzqHIr0q.css`.
  Fresh signed overlay browser smoke passed with `markerCount: 1`, matching
  scene id, `stillLoading: false`, `invalid: false`, and no browser warnings or
  errors. The temporary Supabase smoke user was deleted after verification.
- 2026-05-16 account/profile smoke checkpoint: fresh temporary Supabase user
  signed into the deployed app through `/auth/callback`, loaded `/account` as a
  cloud-sync account, showed the expected email/display name, and `Save profile`
  returned `Profile saved.`. Follow-up authenticated `GET /api/byok/profile`
  returned HTTP 200 with `displayName: Profile Smoke`. The in-app browser's
  current typing backend could not modify the text input because its virtual
  clipboard path failed, so this smoke proves load/save but not manual text
  editing through browser automation. The temporary user was deleted after the
  smoke.
- 2026-05-16 unsigned overlay route checkpoint: fixed and deployed commit
  `9f40a6b`, which separates dashboard preview from signed OBS scene links.
  Dashboard preview now routes to `/overlay/private-preview`; real
  `/overlay/:sceneId` routes without `token=...` now show
  `Signed OBS overlay token required.` instead of silently rendering local
  preview state. Verification:
  `npx vitest run src/lib/product/app-route.test.ts src/lib/product/byok-api.test.ts src/lib/product/cloud-settings.test.ts`
  -> passed, 3 files, 20 tests; `npm run build` -> passed with existing
  `onnxruntime-web` eval and large chunk warnings; `git diff --check` -> passed
  with line-ending warnings only; tracked diff scan found no concrete
  secret/token values. Deployed rebuilt `dist` to the OVH VPS and verified the
  public bundle references `/assets/index-DVQfRG4z.js`. Chrome/Playwright smoke
  against the deployed app passed: `/overlay/private-preview` emitted one
  `data-testid="obs-overlay-ready"` marker with body text `OBS overlay ready`;
  `/overlay/not-a-real-scene` emitted zero ready markers and body text
  `Signed OBS overlay token required.`; both checks had no browser warnings.
- 2026-05-16 product shell typography checkpoint: fixed and deployed commit
  `9fc0b7e`, narrowing the supplied HUD-style references into the live BYOK
  product shell without touching overlay runtime behavior. The product pages now
  use their own sans/mono stacks instead of inheriting the stream character
  serif font, the dashboard header stays grouped on the left instead of splitting
  the eyebrow/title across the row, and HUD labels/buttons/status rows keep the
  mono treatment. Verification: `npm run build` -> passed with existing
  `onnxruntime-web` eval and large chunk warnings; `git diff --check` -> passed
  with line-ending warnings only; tracked diff scan found no concrete
  secret/token values. Deployed rebuilt `dist` to the OVH VPS and verified the
  public bundle references `/assets/index-Ds15Uoo1.js` and
  `/assets/index-C7wyL7B7.css`. Chrome/Playwright smoke against public
  `/dashboard` passed with `h1Font` and brand font set to the product sans stack,
  `.product-header` direction `column`, dashboard text present, and no browser
  warnings.

## Current Blocker Or Next Patch

Next UI/product patch: refresh Codex so Supabase MCP tools are actually exposed,
then use MCP to inspect the live BYOK Supabase tables/policies and record a
proper schema/data audit before doing more Supabase work. In parallel, continue
the product hardening lane by auditing the remaining signed-in/account flow
rough edges: sign-out cross-tab browser smoke, clearer production env
validation, and a deeper product dashboard/home UI pass using the supplied
style references once the functional account flow is locked.

Next efficiency read remains: inspect the SSE live-bridge close path for chat
queue stall risk. Current evidence to re-check: `server\src\index.ts` awaits
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
