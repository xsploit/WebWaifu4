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

## Current Blocker Or Next Patch

Run the polish lane once with `MaxIterations 1`, inspect `.ralph-loop`, inspect
`git status --short`, then either commit its coherent checkpoint or add operator
context for the next lane.

## Completion Bar

Do not claim the whole productization push is complete until:

- Polish lane has no obvious demo-blocking UX/control/settings issues.
- Code-review lane has no untracked critical/high/medium blockers.
- Efficiency lane has inspected and improved the major latency/blocking paths.
- Commercial-production lane has at least a minimal auth/billing/credit design
  and a staged implementation plan with tests.
- Any implemented code passes targeted tests, `git diff --check`, and
  `npm run build`.
