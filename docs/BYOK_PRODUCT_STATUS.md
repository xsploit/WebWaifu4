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

## Current Blocker Or Next Patch

Next patch: add Supabase SQL migration/RLS files for profiles, workspaces,
scenes, characters, synced settings, memory metadata, and asset metadata before
wiring any UI shell. Next read: existing repo migration conventions if any,
`docs\BYOK_PRODUCT_PLAN.md`, and `src\lib\product\byok.ts`.

## Stop Conditions

- Do not add payments/Stripe/credits to this fork.
- Do not persist provider API keys to cloud DB without an explicit hosted vault
  security design and tests.
- Do not break local-only overlay mode.
