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
  Left it uncommitted.
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

## Current Blocker Or Next Patch

Next patch: add a minimal auth/account mode model that distinguishes guest
local-only users from Supabase-authenticated cloud-sync users, then read
`src\App.tsx`, `src\components\menu\SettingsPanel.tsx`,
`src\lib\product\supabase-env.ts`, and the provider key vault before wiring any
UI shell.

## Stop Conditions

- Do not add payments/Stripe/credits to this fork.
- Do not persist provider API keys to cloud DB without an explicit hosted vault
  security design and tests.
- Do not break local-only overlay mode.
