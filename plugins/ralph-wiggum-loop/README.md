# YourWifey Ralph Loop

This is the bounded Codex loop for the Grillo memory adaptation work.

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
  -SkipGitRepoCheck
```

Operator controls:

```powershell
.\plugins\ralph-wiggum-loop\scripts\run-codex-ralph-loop.ps1 -Status
.\plugins\ralph-wiggum-loop\scripts\run-codex-ralph-loop.ps1 -AddContext "Next pass: focus only on SQLite storage."
.\plugins\ralph-wiggum-loop\scripts\run-codex-ralph-loop.ps1 -ClearContext
```

Logs go to `.ralph-loop/`. Keep `MaxIterations` small and inspect the status doc after each sprint.
