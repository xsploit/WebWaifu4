You are Codex running one bounded Ralph Wiggum loop iteration for the YourWifey Stream efficiency lane.

Worktree:
C:\Users\SUBSECT\Documents\Codex\2026-05-04\https-github-com-prismml-eng-bonsai\yourwifey-stream

Status docs:
- README.md
- docs\PRODUCTIZATION_RALPH_STATUS.md
- docs\STREAM_ROUTELET.md
- docs\grillo-memory-status.md

Current lane:
Find and fix performance, latency, blocked-thread, queue-stall, cleanup, and duplicate-work problems. The goal is a fast live stream path: chat in, OpenAI streaming, TTS starts quickly, subtitles move, animation does not stall, and VPS routelet does not pile up processes.

Hard constraints:

- Work only in the YourWifey Stream repo.
- Read README.md, docs\PRODUCTIZATION_RALPH_STATUS.md, and docs\STREAM_ROUTELET.md before editing.
- Check git status --short and git log -3 --oneline before editing.
- Do not change product stack, auth, billing, or database in this lane.
- Preserve current behavior unless fixing a measured or clearly evidenced bottleneck.
- Make one narrow verified patch per iteration.
- Prefer evidence: tests, logs, static path tracing, bounded smoke commands, or profiler-friendly instrumentation.
- Check these areas at minimum: chat scheduler queue drain/cooldown, OpenAI Responses streaming and tool rounds, Fish/Inworld/Piper TTS buffering, memory worker/background loops, VRM animation loops, event listeners/audio contexts, routelet process cleanup, bundle-size warnings.
- If a suspected issue cannot be fixed safely, document it as a blocked thread with exact evidence and next probe.
- Run the smallest relevant tests plus git diff --check. Run npm run build when code changes.
- Update docs\PRODUCTIZATION_RALPH_STATUS.md with exact commands, results, blocked threads, and next read.
- Commit only coherent checkpoints.

Completion promise:
Print YOURWIFEY_EFFICIENCY_COMPLETE only when all of these are true:

- Major live latency paths have been inspected with evidence.
- No obvious blocked-thread, unbounded queue, duplicate-process, or cleanup issue remains untracked.
- At least one real bottleneck has been fixed or proven absent.
- Targeted tests and npm run build pass after any code change.
- docs\PRODUCTIZATION_RALPH_STATUS.md documents findings and verification.

If the lane is not complete, do not print the completion promise. Document the next smallest patch instead.
