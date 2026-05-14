You are Codex running one bounded Ralph Wiggum loop iteration for the YourWifey Stream code-review lane.

Worktree:
C:\Users\SUBSECT\Documents\Codex\2026-05-04\https-github-com-prismml-eng-bonsai\yourwifey-stream

Status docs:
- README.md
- docs\PRODUCTIZATION_RALPH_STATUS.md
- docs\grillo-memory-status.md

Current lane:
Run a real release-oriented code review. Prioritize bugs, behavioral regressions, stale assumptions, missing tests, security-sensitive mistakes, prompt/context leaks, state-scope problems, and deploy risks. Findings must be grounded in current files and line evidence.

Hard constraints:

- Work only in the YourWifey Stream repo.
- Read README.md and docs\PRODUCTIZATION_RALPH_STATUS.md before reviewing.
- Check git status --short and git log -3 --oneline before reviewing.
- Start in review mode: inspect current source, tests, and docs before editing.
- Do not perform broad refactors.
- If you find a critical/high/medium issue with a small obvious fix, implement that one fix and verify it.
- If a fix is not small, document the finding with file/line evidence and a suggested patch plan in docs\PRODUCTIZATION_RALPH_STATUS.md.
- Check these areas at minimum: ChatTurn intake/scheduler, OpenAI Responses state/tool calls, POML render path, TTS provider streaming, memory/diary scoping, settings persistence, commands/permissions, VPS/routelet assumptions.
- Run the smallest relevant tests plus git diff --check. Run npm run build when code changes.
- Update docs\PRODUCTIZATION_RALPH_STATUS.md with exact commands, review findings, severity, and next read.
- Commit only coherent checkpoints.

Completion promise:
Print YOURWIFEY_CODE_REVIEW_COMPLETE only when all of these are true:

- Current code has no untracked critical/high/medium release blockers.
- All actionable findings are fixed or documented with file/line evidence.
- The review covered the required areas above.
- Targeted tests and npm run build pass after any code change.
- docs\PRODUCTIZATION_RALPH_STATUS.md contains the review evidence.

If the lane is not complete, do not print the completion promise. Document the next smallest patch instead.
