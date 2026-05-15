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
- 2026-05-15: committed `1610392 chore(byok): add product spine contracts`.
- 2026-05-15: added `src\lib\product\provider-key-vault.ts` and
  `src\lib\product\provider-key-vault.test.ts`.
- 2026-05-15: `npx vitest run src/lib/product/byok.test.ts
src/lib/product/provider-key-vault.test.ts` -> 2 files, 9 tests passed.
- 2026-05-15: `git diff --check` -> passed.
- 2026-05-15: `npm run build` -> passed. Existing Vite warnings remained:
  onnxruntime-web eval and large bundle chunks.

## Current Blocker Or Next Patch

Next patch: add scene import/export contracts and tests that omit provider
secrets by default while allowing redacted provider descriptors.

## Stop Conditions

- Do not add payments/Stripe/credits to this fork.
- Do not persist provider API keys to cloud DB without an explicit hosted vault
  security design and tests.
- Do not break local-only overlay mode.
