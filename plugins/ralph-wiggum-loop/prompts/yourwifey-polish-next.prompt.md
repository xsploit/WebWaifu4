You are Codex running one bounded Ralph Wiggum loop iteration for the YourWifey Stream polish lane.

Worktree:
C:\Users\SUBSECT\Documents\Codex\2026-05-04\https-github-com-prismml-eng-bonsai\yourwifey-stream

Status docs:
- README.md
- docs\PRODUCTIZATION_RALPH_STATUS.md
- docs\grillo-memory-status.md

Current lane:
Make the existing Twitch-first overlay feel coherent and professional for live demos. Focus on the actual app that exists today: settings, chat intake, TTS controls, model/persona switching, animation mapping, memory visibility, and stream overlay reliability.

Hard constraints:

- Work only in the YourWifey Stream repo.
- Read README.md and docs\PRODUCTIZATION_RALPH_STATUS.md before editing.
- Check git status --short and git log -3 --oneline before editing.
- Preserve the unified Twitch/local ChatTurn path.
- Do not add auth, Stripe, database, or unrelated product dependencies in this lane.
- Do not add Run.game, Discord bot, or donor-platform assumptions.
- Make one narrow verified patch per iteration.
- Prefer fixing stale labels, broken controls, missing settings persistence, poor empty/error states, and obvious demo-blocking UI issues.
- If a broad issue is found, document it in docs\PRODUCTIZATION_RALPH_STATUS.md and pick the smallest safe patch.
- Run the smallest relevant tests plus git diff --check. Run npm run build when the patch touches shared TS, Vite, UI wiring, or settings.
- Update docs\PRODUCTIZATION_RALPH_STATUS.md with exact commands, results, findings, and next read.
- Commit only coherent checkpoints.

Good next patches:

- Verify settings tabs cover AI, TTS, Twitch/local chat, memory, diary, tools, and animation mapping.
- Remove stale labels or controls that no longer apply.
- Make settings persistence obvious and testable.
- Improve chat/overlay empty states and error handling without exposing sensitive runtime details.
- Restore or clarify animation labels/weights/categories where the UI drifted.
- Add small tests for settings persistence or label mapping when practical.

Completion promise:
Print YOURWIFEY_POLISH_COMPLETE only when all of these are true:

- Existing overlay controls are demo-ready and not obviously stale.
- Twitch/local chat controls are discoverable and saved.
- AI/TTS/memory/animation controls are coherent enough for a streamer to operate.
- No known demo-blocking polish issues remain undocumented.
- Targeted tests and npm run build pass.
- docs\PRODUCTIZATION_RALPH_STATUS.md documents the final polish evidence.

If the lane is not complete, do not print the completion promise. Document the next smallest patch instead.
