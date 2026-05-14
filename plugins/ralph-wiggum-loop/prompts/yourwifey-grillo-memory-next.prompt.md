You are Codex running one bounded Ralph Wiggum loop iteration for YourWifey Stream.

Worktree:
C:\Users\SUBSECT\Documents\Codex\2026-05-04\https-github-com-prismml-eng-bonsai\yourwifey-stream

Reference source:
C:\Users\SUBSECT\Downloads\ClosedRouter\grillo_next

Current sprint:
Adapt the non-Discord parts of Grillo into YourWifey: context packets, strict memory lanes, durable scoped memory, diary/reflection, candidate promotion, semantic recall, tool-aware prompt context, and observability. Keep the current OpenAI Responses provider. Do not port the Discord bot surface.

Hard constraints:

- Work only in the YourWifey Stream repo unless reading the Grillo reference path.
- Read AGENTS.md and docs/grillo-memory-status.md before changing code.
- Check git status --short and git log -3 --oneline before editing.
- Keep OpenAI Responses as the primary AI path.
- Do not add Run.game, host SDK, Discord bot, or unrelated platform dependencies.
- Preserve the unified Twitch/local ChatTurn path. Local chat is a viewer participant with trusted controls.
- Keep context lane ownership strict: channel_history, relationship_memory, recalled_memories, thoughts.
- Make one narrow verified patch per iteration.
- Run the smallest relevant tests plus git diff --check.
- Update docs/grillo-memory-status.md with exact commands, results, and next read.
- Commit only coherent checkpoints.

Good next patches:

- Move Grillo memory from prompt-only context toward a real repository-backed store.
- Add server-side JSONL or SQLite storage for scoped memory records.
- Add a browser fallback only when the server store is unavailable.
- Add memory candidate schemas and promotion logic adapted from Grillo.
- Feed promoted memory and diary records into the Grillo context packet.
- Add tests for channel/persona/participant scoping.
- Add observability metadata: trace id, state key, dropped context counts, memory ids, tool rounds, latency.
- Keep POML rendering dynamic and inspect the rendered output when prompt shape changes.

Completion promise:
Print YOURWIFEY_GRILLO_MEMORY_COMPLETE only when all of these are true:

- Grillo-style context packets are built from durable scoped memory, not just transient local state.
- Local and Twitch memories are scoped by channel/source/persona/participant.
- Diary/reflection records and promoted memories both influence context conditionally.
- Semantic recall feeds recalled_memories with budget reduction.
- OpenAI Responses conversation state remains isolated per persona/channel/source.
- Tests cover the memory store, context packet, prompt render, and local/Twitch scoping.
- npm run build passes.
- docs/grillo-memory-status.md documents the final architecture and verification evidence.

If the sprint is not complete, do not print the completion promise. Document the next smallest patch instead.
