# YourWifey Ralph Loop

This is the bounded Codex loop for repeated YourWifey Stream work. Keep each
lane narrow and inspect `.ralph-loop/`, `git status --short`, and the relevant
status doc before trusting a longer run.

Run one lane at a time. The runner writes shared state in
`.ralph-loop\ralph-state.json`; parallel launches can collide.

## Productization Lanes

- Polish: `prompts\yourwifey-polish-next.prompt.md`,
  `YOURWIFEY_POLISH_COMPLETE`
- Code review: `prompts\yourwifey-code-review-next.prompt.md`,
  `YOURWIFEY_CODE_REVIEW_COMPLETE`
- Efficiency / blocked threads: `prompts\yourwifey-efficiency-next.prompt.md`,
  `YOURWIFEY_EFFICIENCY_COMPLETE`
- Commercial production: `prompts\yourwifey-commercial-next.prompt.md`,
  `YOURWIFEY_COMMERCIAL_READY`
- Grillo memory: `prompts\yourwifey-grillo-memory-next.prompt.md`,
  `YOURWIFEY_GRILLO_MEMORY_COMPLETE`

Shared productization status lives in
`docs\PRODUCTIZATION_RALPH_STATUS.md`.

Dry run a productization lane:

```powershell
.\plugins\ralph-wiggum-loop\scripts\run-codex-ralph-loop.ps1 `
  -PromptFile .\plugins\ralph-wiggum-loop\prompts\yourwifey-polish-next.prompt.md `
  -MaxIterations 1 `
  -DryRun
```

One live polish iteration:

```powershell
.\plugins\ralph-wiggum-loop\scripts\run-codex-ralph-loop.ps1 `
  -PromptFile .\plugins\ralph-wiggum-loop\prompts\yourwifey-polish-next.prompt.md `
  -CompletionPromise YOURWIFEY_POLISH_COMPLETE `
  -MaxIterations 1 `
  -MinIterations 1 `
  -Sandbox danger-full-access `
  -ApprovalPolicy never `
  -IterationTimeoutSeconds 7200 `
  -SkipGitRepoCheck
```

Swap `PromptFile` and `CompletionPromise` for the other lanes.

## Grillo Memory Lane

This original lane is for the Grillo memory adaptation work.

Dry run from the repo root:

```powershell
.\plugins\ralph-wiggum-loop\scripts\run-codex-ralph-loop.ps1 `
  -PromptFile .\plugins\ralph-wiggum-loop\prompts\yourwifey-grillo-memory-next.prompt.md `
  -MaxIterations 1 `
  -DryRun
```

One live iteration:

```powershell
.\plugins\ralph-wiggum-loop\scripts\run-codex-ralph-loop.ps1 `
  -PromptFile .\plugins\ralph-wiggum-loop\prompts\yourwifey-grillo-memory-next.prompt.md `
  -CompletionPromise YOURWIFEY_GRILLO_MEMORY_COMPLETE `
  -MaxIterations 1 `
  -MinIterations 1 `
  -Sandbox danger-full-access `
  -SkipGitRepoCheck
```

Bounded sprint:

```powershell
.\plugins\ralph-wiggum-loop\scripts\run-codex-ralph-loop.ps1 `
  -PromptFile .\plugins\ralph-wiggum-loop\prompts\yourwifey-grillo-memory-next.prompt.md `
  -CompletionPromise YOURWIFEY_GRILLO_MEMORY_COMPLETE `
  -MaxIterations 4 `
  -MinIterations 1 `
  -Sandbox danger-full-access `
  -ApprovalPolicy never `
  -IterationTimeoutSeconds 7200 `
  -SkipGitRepoCheck
```

Operator controls:

```powershell
.\plugins\ralph-wiggum-loop\scripts\run-codex-ralph-loop.ps1 -Status
.\plugins\ralph-wiggum-loop\scripts\run-codex-ralph-loop.ps1 -AddContext "Next pass: focus only on SQLite storage."
.\plugins\ralph-wiggum-loop\scripts\run-codex-ralph-loop.ps1 -ClearContext
```

Logs go to `.ralph-loop/`. Keep `MaxIterations` small and inspect the status doc after each sprint.

## Headless Codex Notes

The runner uses `codex exec`, not the interactive TUI. For unattended runs it
passes `--ask-for-approval never` by default, keeps sandbox mode explicit, writes
the final assistant message to `.ralph-loop`, and kills a stuck iteration after
`-IterationTimeoutSeconds`.

Use `-DryRun` first and confirm the printed command contains:

```text
codex exec ... --sandbox danger-full-access --ask-for-approval never
```
