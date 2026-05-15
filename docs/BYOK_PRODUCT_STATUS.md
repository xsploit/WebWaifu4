# YourWifey BYOK Product Status

## Current Goal

Make a separated bring-your-own-key product fork that can grow into a login,
scene/settings sync, and account-based stream assistant without adding payments
or managed AI credits.

## Source Of Truth

- Worktree: `C:\Users\SUBSECT\Documents\GitHub\YourWifey-BYOK`
- Branch: `codex/byok-product-spine`
- Base: `origin/github-main` at `8cf539d`
- Status docs: `docs\BYOK_PRODUCT_STATUS.md`, `docs\BYOK_PRODUCT_PLAN.md`
- Do not touch: original Codex worktree dirty commercial checkpoint.

## Last Clean Checkpoint

- 2026-05-15: cloned `https://github.com/xsploit/yourwifey-stream.git` into
  `C:\Users\SUBSECT\Documents\GitHub\YourWifey-BYOK`.
- 2026-05-15: checked out `codex/byok-product-spine` from
  `origin/github-main`.

## Current Lane

commercial / product architecture

## Evidence Log

- 2026-05-15: `git status --short` -> clean after branch checkout.
- 2026-05-15: read `codex-work-rhythm` skill and applied one-checkpoint rule.
- 2026-05-15: added `src\lib\product\byok.ts`,
  `src\lib\product\byok.test.ts`, and `docs\BYOK_PRODUCT_PLAN.md`.
- 2026-05-15: `npx prettier --check docs/BYOK_PRODUCT_PLAN.md
docs/BYOK_PRODUCT_STATUS.md src/lib/product/byok.ts
src/lib/product/byok.test.ts` -> passed.
- 2026-05-15: `npx vitest run src/lib/product/byok.test.ts` -> 1 file,
  5 tests passed.
- 2026-05-15: `git diff --check` -> passed.
- 2026-05-15: `npm run build` -> passed. Existing Vite warnings remained:
  onnxruntime-web eval and large bundle chunks.
- 2026-05-15: committed `f276929 feat(byok): add local provider key vault`.
- 2026-05-15: pushed `codex/byok-product-spine` to `origin`.
- 2026-05-15: added `src\lib\product\scene-export.ts` and
  `src\lib\product\scene-export.test.ts`.
- 2026-05-15: `npx vitest run src/lib/product/byok.test.ts
src/lib/product/provider-key-vault.test.ts src/lib/product/scene-export.test.ts` ->
  3 files, 13 tests passed.
- 2026-05-15: `git diff --check` -> passed.
- 2026-05-15: `npm run build` -> passed. Existing Vite warnings remained:
  onnxruntime-web eval and large bundle chunks.
- 2026-05-15: committed `1610392 chore(byok): add product spine contracts`.
- 2026-05-15: added `src\lib\product\provider-key-vault.ts` and
  `src\lib\product\provider-key-vault.test.ts`.
- 2026-05-15: `npx vitest run src/lib/product/byok.test.ts
src/lib/product/provider-key-vault.test.ts` -> 2 files, 9 tests passed.
- 2026-05-15: `git diff --check` -> passed.
- 2026-05-15: `npm run build` -> passed. Existing Vite warnings remained:
  onnxruntime-web eval and large bundle chunks.
- 2026-05-15: locked BYOK stack decision to Supabase Auth, Supabase Postgres,
  and Supabase Storage while preserving local-only mode and browser-local
  provider keys.
- 2026-05-15: `npx prettier --check docs/BYOK_PRODUCT_PLAN.md
docs/BYOK_PRODUCT_STATUS.md src/lib/product/byok.ts
src/lib/product/byok.test.ts` -> passed.
- 2026-05-15: `npx vitest run src/lib/product/byok.test.ts
src/lib/product/provider-key-vault.test.ts src/lib/product/scene-export.test.ts` ->
  3 files, 14 tests passed.
- 2026-05-15: `git diff --check` -> passed.
- 2026-05-15: `npm run build` -> passed. Existing Vite warnings remained:
  onnxruntime-web eval and large bundle chunks.
- 2026-05-15: `git status --short` before this checkpoint -> one pre-existing
  untracked prompt file:
  `?? plugins/ralph-wiggum-loop/prompts/yourwifey-byok-product-next.prompt.md`.
  Ralph left it uncommitted.
- 2026-05-15: `git log -5 --oneline` before this checkpoint -> top commit
  `8943e0b chore(byok): lock supabase product stack`; then `f7e47d4`,
  `f276929`, `1610392`, and `8cf539d`.
- 2026-05-15: added `src\lib\product\supabase-env.ts` and
  `src\lib\product\supabase-env.test.ts`.
- 2026-05-15: decision: Supabase config remains a pure contract layer with no
  SDK dependency yet. Missing browser config disables cloud sync but preserves
  local-only mode; partial/insecure config is misconfigured; service-role/JWT
  values are server-only and excluded from public projections.
- 2026-05-15: `npx vitest run src/lib/product/byok.test.ts
src/lib/product/provider-key-vault.test.ts src/lib/product/scene-export.test.ts
src/lib/product/supabase-env.test.ts` -> 4 files, 22 tests passed.
- 2026-05-15: `npx prettier --check docs/BYOK_PRODUCT_PLAN.md
docs/BYOK_PRODUCT_STATUS.md src/lib/product/supabase-env.ts
src/lib/product/supabase-env.test.ts` -> passed.
- 2026-05-15: `git diff --check` -> passed. Git emitted LF/CRLF warnings for
  the two BYOK docs.
- 2026-05-15: `npm run build` -> passed. Existing Vite warnings remained:
  onnxruntime-web eval and large bundle chunks.
- 2026-05-15: committed reusable BYOK Ralph prompt at
  `plugins\ralph-wiggum-loop\prompts\yourwifey-byok-product-next.prompt.md`.
- 2026-05-15: `git status --short` before this checkpoint -> clean.
- 2026-05-15: `git log -5 --oneline` before this checkpoint -> top commit
  `cf5ad9b chore(byok): add ralph product prompt`; then `1e7bf3c`,
  `8943e0b`, `f7e47d4`, and `f276929`.
- 2026-05-15: read `src\App.tsx`,
  `src\components\menu\SettingsPanel.tsx`,
  `src\lib\product\supabase-env.ts`, and
  `src\lib\product\provider-key-vault.ts` before choosing the patch.
- 2026-05-15: added `src\lib\product\account-mode.ts` and
  `src\lib\product\account-mode.test.ts`.
- 2026-05-15: decision: account mode remains a pure contract layer for now.
  Missing or misconfigured Supabase env resolves to guest local-only mode.
  Configured Supabase plus a signed-in auth identity resolves to cloud-sync
  account mode. Provider key mode stays `local-indexeddb` in both modes, and
  the account-mode projection does not copy anon keys or auth metadata into UI
  state.
- 2026-05-15: `npx vitest run src/lib/product/account-mode.test.ts` -> 1 file,
  5 tests passed.
- 2026-05-15: `npx vitest run src/lib/product/byok.test.ts
src/lib/product/provider-key-vault.test.ts src/lib/product/scene-export.test.ts
src/lib/product/supabase-env.test.ts src/lib/product/account-mode.test.ts` ->
  5 files, 27 tests passed.
- 2026-05-15: first `npm run build` attempt exposed a TypeScript narrowing bug:
  `ProviderKeyMode` was too broad for the account-mode `local-indexeddb`
  contract. Fixed by pinning the account-mode provider key mode literal.
- 2026-05-15: `npm run build` -> passed. Existing Vite warnings remained:
  onnxruntime-web eval and large bundle chunks.
- 2026-05-15: `npx prettier --write docs/BYOK_PRODUCT_PLAN.md
docs/BYOK_PRODUCT_STATUS.md src/lib/product/account-mode.ts
src/lib/product/account-mode.test.ts` -> formatted the status doc and
  account-mode source.
- 2026-05-15: `npx prettier --check docs/BYOK_PRODUCT_PLAN.md
docs/BYOK_PRODUCT_STATUS.md src/lib/product/account-mode.ts
src/lib/product/account-mode.test.ts` -> passed.
- 2026-05-15: `git diff --check` -> passed. Git emitted LF/CRLF warnings for
  the two BYOK docs.
- 2026-05-15: `git status --short` before this checkpoint -> clean.
- 2026-05-15: `git log -5 --oneline` before this checkpoint -> top commit
  `dc6be3c feat(byok): add account mode contract`; then `cf5ad9b`,
  `1e7bf3c`, `8943e0b`, and `f7e47d4`.
- 2026-05-15: read `docs\BYOK_PRODUCT_STATUS.md`,
  `docs\BYOK_PRODUCT_PLAN.md`, `src\lib\product\byok.ts`,
  `src\lib\product\account-mode.ts`, and
  `src\lib\product\supabase-env.ts`; checked for existing migration
  directories and found none.
- 2026-05-15: added
  `supabase\migrations\20260515000100_byok_product_spine.sql` and
  `src\lib\product\supabase-schema.test.ts`.
- 2026-05-15: decision: Supabase cloud rows are cloud-sync rows only; guest
  local-only mode remains outside the database. The first RLS schema pins
  workspace and provider descriptor key mode to `local-indexeddb`, stores only
  redacted provider secret descriptors, stores overlay token hashes instead of
  raw tokens, and limits synced settings to `public-overlay` or
  `synced-private` keys that do not look like API keys/secrets/tokens.
- 2026-05-15: decision: authenticated users get explicit table grants, RLS is
  enabled and forced on every product table, workspace members can read scoped
  records, and only workspace owners can write scoped records in this first
  contract.
- 2026-05-15: `npx vitest run src/lib/product/supabase-schema.test.ts` -> 1
  file, 5 tests passed.
- 2026-05-15: `npx vitest run src/lib/product/byok.test.ts
src/lib/product/provider-key-vault.test.ts src/lib/product/scene-export.test.ts
src/lib/product/supabase-env.test.ts src/lib/product/account-mode.test.ts
src/lib/product/supabase-schema.test.ts` -> 6 files, 32 tests passed.
- 2026-05-15: `npx prettier --check docs/BYOK_PRODUCT_PLAN.md
docs/BYOK_PRODUCT_STATUS.md src/lib/product/supabase-schema.test.ts` ->
  passed.
- 2026-05-15: `git diff --check` -> passed. Git emitted LF/CRLF warnings for
  the two BYOK docs.
- 2026-05-15: `npm run build` -> passed. Existing Vite warnings remained:
  onnxruntime-web eval and large bundle chunks.
- 2026-05-15: `git status --short` before this checkpoint -> clean.
- 2026-05-15: `git log -5 --oneline` before this checkpoint -> top commit
  `d4a02ed feat(byok): add supabase schema rls`; then `dc6be3c`, `cf5ad9b`,
  `1e7bf3c`, and `8943e0b`.
- 2026-05-15: read `api\ai\chat.ts`, `api\ai\embeddings.ts`,
  `api\ai\poml\render.ts`, `server\src\index.ts`,
  `supabase\migrations\20260515000100_byok_product_spine.sql`,
  `src\lib\product\byok.ts`, `src\lib\product\account-mode.ts`, and
  `src\lib\product\supabase-env.ts` before choosing the patch.
- 2026-05-15: added `src\lib\product\server-route-ownership.ts` and
  `src\lib\product\server-route-ownership.test.ts`.
- 2026-05-15: decision: future hosted product APIs live under `/api/byok/*`
  and start with a pure route contract instead of installing Supabase SDKs.
  Signed-in Supabase cloud-sync users are required for account routes, workspace
  owners can write, workspace members can read, and local-only guests stay out
  of cloud DB routes.
- 2026-05-15: decision: public overlay config reads require a matching scoped
  overlay token and can only expose `public-overlay` settings. Cloud route
  request bodies reject secret-shaped fields, including nested JSON inside
  `valueJson`.
- 2026-05-15: `npx vitest run
src/lib/product/server-route-ownership.test.ts` -> 1 file, 5 tests passed.
- 2026-05-15: `npx vitest run src/lib/product/byok.test.ts
src/lib/product/provider-key-vault.test.ts
src/lib/product/scene-export.test.ts src/lib/product/supabase-env.test.ts
src/lib/product/account-mode.test.ts
src/lib/product/supabase-schema.test.ts
src/lib/product/server-route-ownership.test.ts` -> 7 files, 37 tests passed.
- 2026-05-15: first `npm run build` attempts exposed a TypeScript fixture
  issue in `src\lib\product\server-route-ownership.test.ts`: overlay-token
  `scopes` was first readonly, then widened to `string[]`, while
  `OverlayTokenClaims.scopes` expects product scope literals. Fixed by
  annotating the fixture as `OverlayTokenClaims`.
- 2026-05-15: `npx prettier --check docs/BYOK_PRODUCT_PLAN.md
docs/BYOK_PRODUCT_STATUS.md src/lib/product/server-route-ownership.ts
src/lib/product/server-route-ownership.test.ts` -> passed.
- 2026-05-15: `git diff --check` -> passed. Git emitted LF/CRLF warnings for
  the two BYOK docs.
- 2026-05-15: `npm run build` -> passed. Existing Vite warnings remained:
  onnxruntime-web eval and large bundle chunks.
- 2026-05-15: `git status --short` before this checkpoint -> clean.
- 2026-05-15: `git log -5 --oneline` before this checkpoint -> top commit
  `d68c9c7 feat(byok): add route ownership contracts`; then `d4a02ed`,
  `dc6be3c`, `cf5ad9b`, and `1e7bf3c`.
- 2026-05-15: read `docs\BYOK_PRODUCT_STATUS.md`,
  `docs\BYOK_PRODUCT_PLAN.md`, `src\App.tsx`,
  `src\components\menu\SettingsPanel.tsx`,
  `src\lib\product\account-mode.ts`,
  `src\lib\product\server-route-ownership.ts`, and the existing local settings
  load/save path in `src\lib\chat\storage.ts` before choosing the patch.
- 2026-05-15: added `src\lib\product\supabase-auth-shell.ts`,
  `src\lib\product\supabase-auth-shell.test.ts`, and
  `src\components\menu\tabs\AccountTab.tsx`; wired an `Account` settings tab
  through `src\components\menu\SettingsPanel.tsx`, `src\App.tsx`,
  `src\lib\menu\types.ts`, and `src\lib\chat\storage.ts`.
- 2026-05-15: decision: the first auth/account UI shell remains no-SDK and
  no-cloud-write. It reads the existing Supabase browser env contract, keeps
  unauthenticated users in guest local-only mode, and can request a Supabase
  Auth magic link with only the public anon key when Supabase is configured.
  Provider API keys remain browser-local and are not added to account state or
  synced settings.
- 2026-05-15: `npx vitest run src/lib/product/account-mode.test.ts
src/lib/product/supabase-auth-shell.test.ts` -> 2 files, 9 tests passed.
- 2026-05-15: `npx vitest run src/lib/product/byok.test.ts
src/lib/product/provider-key-vault.test.ts
src/lib/product/scene-export.test.ts src/lib/product/supabase-env.test.ts
src/lib/product/account-mode.test.ts src/lib/product/supabase-schema.test.ts
src/lib/product/server-route-ownership.test.ts
src/lib/product/supabase-auth-shell.test.ts` -> 8 files, 41 tests passed.
- 2026-05-15: first `npm run build` attempt exposed a TypeScript
  `noPropertyAccessFromIndexSignature` issue in
  `src\lib\product\supabase-auth-shell.ts` for `email_redirect_to`; fixed it by
  using bracket assignment.
- 2026-05-15: `npx vitest run src/lib/product/supabase-auth-shell.test.ts` ->
  1 file, 4 tests passed.
- 2026-05-15: `npm run build` -> passed. Existing Vite warnings remained:
  onnxruntime-web eval and large bundle chunks.
- 2026-05-15: `npx prettier --write docs/BYOK_PRODUCT_PLAN.md
docs/BYOK_PRODUCT_STATUS.md src/App.tsx
src/components/menu/SettingsPanel.tsx
src/components/menu/tabs/AccountTab.tsx src/lib/chat/storage.ts
src/lib/menu/types.ts src/lib/product/supabase-auth-shell.ts
src/lib/product/supabase-auth-shell.test.ts` -> formatted touched files.
- 2026-05-15: `npx vitest run src/lib/chat/storage.test.ts
src/lib/product/byok.test.ts src/lib/product/provider-key-vault.test.ts
src/lib/product/scene-export.test.ts src/lib/product/supabase-env.test.ts
src/lib/product/account-mode.test.ts src/lib/product/supabase-schema.test.ts
src/lib/product/server-route-ownership.test.ts
src/lib/product/supabase-auth-shell.test.ts` -> 9 files, 43 tests passed.
- 2026-05-15: `npx prettier --check docs/BYOK_PRODUCT_PLAN.md
docs/BYOK_PRODUCT_STATUS.md src/App.tsx
src/components/menu/SettingsPanel.tsx
src/components/menu/tabs/AccountTab.tsx src/lib/chat/storage.ts
src/lib/menu/types.ts src/lib/product/supabase-auth-shell.ts
src/lib/product/supabase-auth-shell.test.ts` -> passed.
- 2026-05-15: `git diff --check` -> passed. Git emitted LF/CRLF warnings
  for the two BYOK docs and touched TS/TSX files.
- 2026-05-15: final `npm run build` -> passed. Existing Vite warnings
  remained: onnxruntime-web eval and large bundle chunks.
- 2026-05-15: review tweak: wrapped the Account tab magic-link request in a
  `finally` block so the submit button always re-enables after future request
  failures.
- 2026-05-15: after the review tweak,
  `npx vitest run src/lib/product/supabase-auth-shell.test.ts` -> 1 file, 4
  tests passed.
- 2026-05-15: after the review tweak,
  `npx prettier --check docs/BYOK_PRODUCT_STATUS.md docs/BYOK_PRODUCT_PLAN.md
src/components/menu/tabs/AccountTab.tsx` -> passed.
- 2026-05-15: after the review tweak, `git diff --check` -> passed. Git
  emitted LF/CRLF warnings for the two BYOK docs and touched TS/TSX files.
- 2026-05-15: after the review tweak, `npm run build` -> passed. Existing Vite
  warnings remained: onnxruntime-web eval and large bundle chunks.

## Current Blocker Or Next Patch

Next patch: add Supabase session hydration/callback handling or guarded
profile/workspace API route stubs, still without syncing provider keys. Next
read: `src\components\menu\tabs\AccountTab.tsx`,
`src\lib\product\supabase-auth-shell.ts`, `src\lib\product\account-mode.ts`,
`src\lib\product\server-route-ownership.ts`, and `api\ai\chat.ts` for existing
API route patterns.

## Stop Conditions

- Do not add payments/Stripe/credits to this fork.
- Do not persist provider API keys to cloud DB without an explicit hosted vault
  security design and tests.
- Do not break local-only overlay mode.
