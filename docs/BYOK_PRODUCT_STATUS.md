# YourWifey BYOK Product Status

Current hosted product target: Vercel only,
`https://yourwifey-byok.vercel.app`. Older VPS entries in this status log are
historical evidence, not active deployment guidance.

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
  untracked product prompt from the local loop workflow.
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
- 2026-05-15: committed a reusable BYOK product prompt for the local loop
  workflow. The loop workflow was later removed from the public repo.
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
- 2026-05-15: `git status --short` before this checkpoint -> clean.
- 2026-05-15: `git log -5 --oneline` before this checkpoint -> top commit
  `be54bdb feat(byok): add account auth shell`; then `d68c9c7`,
  `d4a02ed`, `dc6be3c`, and `cf5ad9b`.
- 2026-05-15: read `docs\BYOK_PRODUCT_STATUS.md`,
  `docs\BYOK_PRODUCT_PLAN.md`, `src\components\menu\tabs\AccountTab.tsx`,
  `src\lib\product\supabase-auth-shell.ts`,
  `src\lib\product\account-mode.ts`,
  `src\lib\product\server-route-ownership.ts`, `api\ai\chat.ts`,
  `src\App.tsx`, `src\lib\chat\storage.ts`,
  `src\components\menu\SettingsPanel.tsx`, and the existing API/typecheck
  configs before choosing the patch.
- 2026-05-15: added `src\lib\product\supabase-auth-session.ts` and
  `src\lib\product\supabase-auth-session.test.ts`; wired Supabase session
  hydration and local sign-out through `src\App.tsx`,
  `src\components\menu\SettingsPanel.tsx`, and
  `src\components\menu\tabs\AccountTab.tsx`.
- 2026-05-15: decision: Supabase magic-link callback handling remains no-SDK.
  The browser parses implicit-flow callback tokens, strips auth parameters from
  the URL, stores only the Supabase auth session in browser local storage, and
  fetches `/auth/v1/user` with the public anon key plus the Supabase access
  token. Supabase OAuth provider tokens and secret-shaped user metadata are not
  copied into account mode. Missing, expired, failed, or PKCE-code-only
  sessions leave the overlay in guest local-only mode.
- 2026-05-15: `npx vitest run src/lib/product/supabase-auth-session.test.ts`
  -> 1 file, 7 tests passed.
- 2026-05-15: `npx vitest run src/lib/product/byok.test.ts
src/lib/product/provider-key-vault.test.ts
src/lib/product/scene-export.test.ts src/lib/product/supabase-env.test.ts
src/lib/product/account-mode.test.ts src/lib/product/supabase-schema.test.ts
src/lib/product/server-route-ownership.test.ts
src/lib/product/supabase-auth-shell.test.ts
src/lib/product/supabase-auth-session.test.ts` -> 9 files, 48 tests passed.
- 2026-05-15: `npx prettier --write src/App.tsx
src/components/menu/SettingsPanel.tsx
src/components/menu/tabs/AccountTab.tsx
src/lib/product/supabase-auth-session.ts
src/lib/product/supabase-auth-session.test.ts` -> formatted touched app and
  session files.
- 2026-05-15: `npm run build` -> passed. Existing Vite warnings remained:
  onnxruntime-web eval and large bundle chunks.
- 2026-05-15: final `npx vitest run src/lib/product/byok.test.ts
src/lib/product/provider-key-vault.test.ts
src/lib/product/scene-export.test.ts src/lib/product/supabase-env.test.ts
src/lib/product/account-mode.test.ts src/lib/product/supabase-schema.test.ts
src/lib/product/server-route-ownership.test.ts
src/lib/product/supabase-auth-shell.test.ts
src/lib/product/supabase-auth-session.test.ts` -> 9 files, 48 tests passed.
- 2026-05-15: final `npx prettier --check docs/BYOK_PRODUCT_PLAN.md
docs/BYOK_PRODUCT_STATUS.md src/App.tsx
src/components/menu/SettingsPanel.tsx
src/components/menu/tabs/AccountTab.tsx
src/lib/product/supabase-auth-session.ts
src/lib/product/supabase-auth-session.test.ts` -> passed.
- 2026-05-15: final `git diff --check` -> passed. Git emitted LF/CRLF
  warnings for the two BYOK docs and touched TS/TSX files.
- 2026-05-15: final `npm run build` -> passed. Existing Vite warnings
  remained: onnxruntime-web eval and large bundle chunks.
- 2026-05-15: committed `feat(byok): hydrate supabase auth sessions`.
- 2026-05-15: pushed `codex/byok-product-spine` to `origin`.
- 2026-05-15: attempted one more Ralph pass; it timed out while the stale
  `.ralph-loop` state still pointed at the previous session-auth checkpoint.
  Stopped only the stale child process tree and marked the generated state file
  as `stale_stopped`. The tracked worktree remained clean.
- 2026-05-15: added `src\lib\product\byok-route-stub.ts` and
  `src\lib\product\byok-route-stub.test.ts`; added fail-closed serverless
  scaffolds at `api\byok\profile.ts`,
  `api\byok\workspaces\[workspaceId].ts`, and
  `api\byok\_lib\route-stub.ts`.
- 2026-05-15: decision: the first BYOK profile/workspace API endpoints must
  not trust client-provided auth or workspace ownership. Until the real
  Supabase auth/workspace resolver is wired, the serverless routes return
  `route-context-not-wired` and still reject secret-shaped request bodies. The
  shared route-stub contract tests prove that owner/member authorization and
  secret rejection run before any future DB implementation.
- 2026-05-15: `npx vitest run src/lib/product/byok-route-stub.test.ts
src/lib/product/server-route-ownership.test.ts
src/lib/product/supabase-auth-session.test.ts` -> 3 files, 16 tests passed.
- 2026-05-15: first `npm run build` for route stubs exposed a NodeNext API
  typecheck issue: importing shared extensionless app modules from `api/**`
  forced `tsconfig.api` to compile them under NodeNext. Fixed by keeping the
  serverless fail-closed adapter local to `api\byok\_lib\route-stub.ts` while
  retaining the rich shared ownership contract in `src\lib\product`.
- 2026-05-15: `npx vitest run src/lib/product/byok.test.ts
src/lib/product/provider-key-vault.test.ts
src/lib/product/scene-export.test.ts src/lib/product/supabase-env.test.ts
src/lib/product/account-mode.test.ts src/lib/product/supabase-schema.test.ts
src/lib/product/server-route-ownership.test.ts
src/lib/product/supabase-auth-shell.test.ts
src/lib/product/supabase-auth-session.test.ts
src/lib/product/byok-route-stub.test.ts src/lib/chat/storage.test.ts` -> 11
  files, 54 tests passed.
- 2026-05-15: `git diff --check` -> passed.
- 2026-05-15: `npm run build` -> passed. Existing Vite warnings remained:
  onnxruntime-web eval and large bundle chunks.
- 2026-05-15: applied one `codex-work-rhythm` checkpoint for Supabase route
  context resolution. Added `api\byok\_lib\supabase-context.ts` and
  `api\byok\_lib\supabase-context.test.ts`; updated
  `api\byok\_lib\route-stub.ts` to call the real context resolver and shared
  `src\lib\product\byok-route-stub.ts` contract.
- 2026-05-15: decision: API routes now verify bearer sessions through
  Supabase Auth `/auth/v1/user` with the anon key, resolve workspace owner and
  member snapshots from Supabase REST with the server-only service role key,
  and still fail closed when server Supabase env is not admin-ready. Provider
  keys remain outside cloud route context and synced settings.
- 2026-05-15: updated shared product-contract imports to explicit `.js`
  specifiers where the API NodeNext build imports them:
  `src\lib\product\account-mode.ts`,
  `src\lib\product\byok-route-stub.ts`,
  `src\lib\product\server-route-ownership.ts`, and
  `src\lib\product\supabase-env.ts`.
- 2026-05-15: `npx vitest run api/byok/_lib/supabase-context.test.ts
src/lib/product/byok-route-stub.test.ts
src/lib/product/server-route-ownership.test.ts` -> 3 files, 13 tests passed.
- 2026-05-15: first `npm run build` after the resolver exposed one NodeNext
  test import issue in `api\byok\_lib\supabase-context.test.ts`; fixed the
  local import to `./supabase-context.js`.
- 2026-05-15: `npx vitest run api/byok/_lib/supabase-context.test.ts
src/lib/product/byok.test.ts src/lib/product/provider-key-vault.test.ts
src/lib/product/scene-export.test.ts src/lib/product/supabase-env.test.ts
src/lib/product/account-mode.test.ts src/lib/product/supabase-schema.test.ts
src/lib/product/server-route-ownership.test.ts
src/lib/product/supabase-auth-shell.test.ts
src/lib/product/supabase-auth-session.test.ts
src/lib/product/byok-route-stub.test.ts src/lib/chat/storage.test.ts` -> 12
  files, 58 tests passed.
- 2026-05-15: `git diff --check` -> passed. Git emitted LF/CRLF warnings for
  touched files.
- 2026-05-15: `npm run build` -> passed. Existing Vite warnings remained:
  onnxruntime-web eval and large bundle chunks.
- 2026-05-15: applied one `codex-work-rhythm` checkpoint for the Claude auth
  review fixes. Added a Supabase auth session lifecycle watcher that rehydrates
  on expiry and cross-tab storage changes, and wired `src\App.tsx` through that
  watcher instead of one-shot hydration.
- 2026-05-15: tightened BYOK API CORS from wildcard to explicit allowlist
  resolution via `BYOK_CORS_ALLOWED_ORIGINS`, app origin env vars, Vercel origin
  env vars, and localhost dev origins. Added `Vary: Origin`.
- 2026-05-15: normalized workspace missing and workspace denied failures to the
  same `workspace-access-denied` response, and guarded the Account tab magic
  link submit path against state updates after unmount.
- 2026-05-15: `npx vitest run src/lib/product/supabase-auth-session.test.ts
api/byok/_lib/supabase-context.test.ts src/lib/product/server-route-ownership.test.ts
src/lib/product/byok-route-stub.test.ts` -> 4 files, 23 tests passed after
  fixing the lifecycle test clock.
- 2026-05-15: `npx vitest run src/lib/product/byok.test.ts
src/lib/product/provider-key-vault.test.ts src/lib/product/scene-export.test.ts
src/lib/product/supabase-env.test.ts src/lib/product/account-mode.test.ts
src/lib/product/supabase-schema.test.ts src/lib/product/server-route-ownership.test.ts
src/lib/product/supabase-auth-shell.test.ts src/lib/product/supabase-auth-session.test.ts
src/lib/product/byok-route-stub.test.ts src/lib/chat/storage.test.ts
api/byok/_lib/supabase-context.test.ts` -> 12 files, 61 tests passed.
- 2026-05-15: `npx prettier --check src/App.tsx
src/components/menu/tabs/AccountTab.tsx src/lib/product/supabase-auth-session.ts
src/lib/product/supabase-auth-session.test.ts src/lib/product/server-route-ownership.ts
api/byok/_lib/route-stub.ts api/byok/_lib/supabase-context.test.ts
docs/BYOK_PRODUCT_STATUS.md` -> passed.
- 2026-05-15: `git diff --check` -> passed. Git emitted LF/CRLF warnings for
  touched files.
- 2026-05-15: `npm run build` -> passed. Existing Vite warnings remained:
  onnxruntime-web eval and large bundle chunks.
- 2026-05-18: authenticated the configured Supabase MCP and checked project
  `btjccsyoevbczmamoamt`; live Auth settings report `external.google=false`
  and `external.github=false`, while email auth is enabled. Management API
  docs and MCP docs confirm Google/GitHub OAuth cannot be enabled without each
  provider's client ID and secret.
- 2026-05-18: changed the product login page and Account tab to probe
  Supabase Auth `/auth/v1/settings` with the publishable key and use the live
  Google/GitHub provider flags instead of requiring a rebuild-time
  `VITE_SUPABASE_OAUTH_PROVIDERS` allowlist. If both providers are disabled,
  the UI now says Supabase Auth reports them disabled and names the missing
  provider credential setup.
- 2026-05-18: `npx vitest run
src/lib/product/supabase-auth-shell.test.ts
src/lib/product/supabase-env.test.ts src/lib/product/app-route.test.ts` -> 3
  files, 31 tests passed.
- 2026-05-18: `npx tsc --noEmit`, `git diff --check`, and `npm run build` ->
  passed. Existing Vite warnings remained: onnxruntime-web eval and large
  bundle chunks.
- 2026-05-18: committed `8d62f76` (`fix(auth): probe Supabase OAuth providers
live`), pushed `codex/byok-product-spine`, deployed rebuilt `dist` to
  `/home/ubuntu/yourwifey-stream`, restarted `serve-dist.mjs`, and verified the
  public login page serves `assets/index-Bz31DrR8.js`. Remote
  `http://127.0.0.1:8787/health` returned `ok: true`.
- 2026-05-21: added Twitch stream audio context sampling behind a Twitch tab
  toggle. The backend resolves live Twitch audio with `yt-dlp` or `streamlink`,
  captures a short mono sample with `ffmpeg`, transcribes it through OpenAI
  `whisper-1` by default, and injects recent snippets as ambient prompt context
  only. Provider keys still come from the browser vault request header and are
  not synced to cloud.
- 2026-05-21: `npx vitest run src/lib/chat/storage.test.ts
src/lib/product/cloud-settings.test.ts src/lib/chat/prompt.test.ts` -> 3 files,
  15 tests passed.
- 2026-05-21: `git diff --check` -> passed. Git emitted LF/CRLF warnings for
  touched files.
- 2026-05-21: `npm run build` -> passed. Existing Vite warnings remained:
  onnxruntime-web eval and large bundle chunks.
- 2026-05-21: committed `3d0bfec` (`feat(twitch): add whisper stream context`),
  pushed `codex/byok-product-spine`, deployed rebuilt `dist`, `server/dist`,
  `api-dist`, and `serve-dist.mjs` to `/home/ubuntu/yourwifey-stream`, restarted
  the server and overlay processes, and verified public health plus frontend
  bundle `assets/index-DlhDWS_t.js`. The VPS has `/usr/bin/ffmpeg`,
  `/usr/bin/yt-dlp`, and `/usr/bin/streamlink`.
- 2026-05-21: added Twitch stream vision context behind a Twitch tab toggle.
  The backend exposes `/api/twitch/capture-frame`, resolves the live stream
  with the same Twitch tooling, captures one scaled JPEG frame with `ffmpeg`,
  and the chat path attaches the latest fresh frame to the current user prompt
  only when the selected model appears to support image input.
- 2026-05-21: `npx vitest run server/src/ai/OpenAiResponsesProvider.test.ts
src/lib/chat/storage.test.ts src/lib/product/cloud-settings.test.ts
src/lib/chat/prompt.test.ts` -> 4 files, 42 tests passed.
- 2026-05-21: `git diff --check` -> passed. Git emitted LF/CRLF warnings for
  touched files.
- 2026-05-21: `npm run build` -> passed. Existing Vite warnings remained:
  onnxruntime-web eval and large bundle chunks.
- 2026-05-21: committed `c75540a` (`feat(twitch): add stream vision context`),
  pushed `codex/byok-product-spine`, deployed rebuilt runtime files to the VPS,
  restarted server and overlay processes, and verified public health plus
  frontend bundle `assets/index-C4RBeZTg.js`. Public frame-capture smoke reached
  the endpoint and failed with the expected "channel is not currently live"
  Twitch resolver error for `subsect`.
- 2026-05-22: set Vercel production `VITE_PUBLIC_APP_URL` to
  `https://yourwifey-byok.vercel.app` so OAuth callback URLs are baked to the
  Vercel product origin, not an old local/VPS host.
- 2026-05-22: committed `f0f6e18` (`docs(product): make vercel the only hosted target`),
  pushed `codex/byok-product-spine` and `YourWifey-BYOK` `main`, and deployed
  production Vercel `dpl_6YeqZ4gJMrtDrMBzaamP73xePA4u`.
- 2026-05-22: verified `https://yourwifey-byok.vercel.app` is READY, aliased,
  and serving `assets/index-CbUxo2xE.js`; `/dashboard`, `/editor`, and
  `/auth/callback` return 200 from Vercel with no old `sslip.io` or
  `148-113-191-103` host in HTML/JS.

## Current Blocker Or Next Patch

Next patch: browser-smoke OAuth login against
`https://yourwifey-byok.vercel.app/login` and confirm Supabase returns to
`https://yourwifey-byok.vercel.app/auth/callback`.

## Stop Conditions

- Do not add payments/Stripe/credits to this fork.
- Do not persist provider API keys to cloud DB without an explicit hosted vault
  security design and tests.
- Do not break local-only overlay mode.
- Do not deploy or debug the old VPS/`sslip.io` host for this BYOK product path.
