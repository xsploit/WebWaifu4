# Grillo Memory Adaptation Status

## Goal

Adapt the useful non-Discord parts of `C:\Users\SUBSECT\Downloads\ClosedRouter\grillo_next` into YourWifey Stream: strict context lanes, durable scoped memory, diary/reflection, candidate promotion, semantic recall, tool-aware prompt context, and observability while keeping OpenAI Responses as the AI provider.

## Source Of Truth

- Worktree: `C:\Users\SUBSECT\Documents\Codex\2026-05-04\https-github-com-prismml-eng-bonsai\yourwifey-stream`
- Reference: `C:\Users\SUBSECT\Downloads\ClosedRouter\grillo_next`
- Prompt: `plugins\ralph-wiggum-loop\prompts\yourwifey-grillo-memory-next.prompt.md`
- Completion promise: `YOURWIFEY_GRILLO_MEMORY_COMPLETE`

## Current State

- Added a Grillo-style context packet in `src/lib/chat/grillo-context.ts`.
- Added a Grillo-style browser memory repository in `src/lib/chat/grillo-memory.ts`.
- Added a Grillo-style background worker tool loop in `src/lib/chat/grillo-memory-loop.ts`.
- Prompt rendering now has strict lanes: `background_information`, `instructions`, `channel_history`, `relationship_memory`, `recalled_memories`, `thoughts`, and `output_description`.
- Recent local/Twitch transcript context now feeds the packet as `channel_history` instead of being duplicated into the current turn prompt.
- Completed local/Twitch replies now write scoped Grillo candidates and diary entries, then promote repeated high-confidence candidates into memory blocks.
- Scheduled/manual memory passes now run a tool loop before the legacy relationship merge. The loop can read/search/list memory, write candidates, write diary entries, write consolidated memory blocks, insert archival thread memory, and recover candidate/diary objects that were returned without an explicit tool call.
- Grillo memory is scoped by conversation state key and participant key. It currently persists in browser localStorage. Server JSONL/SQLite backing is still the next implementation step.

## Verification Log

- 2026-05-13 22:16: `npx vitest run src/lib/chat/grillo-context.test.ts src/lib/chat/prompt.test.ts` -> passed, 9 tests.
- 2026-05-13 22:17: `git diff --check` -> passed.
- 2026-05-13 22:17: `npx vitest run src/lib/chat/grillo-context.test.ts src/lib/chat/prompt.test.ts src/lib/chat/chat-turn.test.ts server/src/ai/OpenAiResponsesProvider.test.ts` -> passed, 24 tests.
- 2026-05-13 22:17: `.\plugins\ralph-wiggum-loop\scripts\run-codex-ralph-loop.ps1 -PromptFile .\plugins\ralph-wiggum-loop\prompts\yourwifey-grillo-memory-next.prompt.md -MaxIterations 1 -DryRun` -> passed, resolved workdir/prompt/logs.
- 2026-05-13 22:18: `npm run build` -> passed with existing Vite warnings for onnxruntime-web eval and large chunks.
- 2026-05-13 22:34: `npx vitest run src/lib/chat/grillo-memory.test.ts src/lib/chat/grillo-context.test.ts src/lib/chat/prompt.test.ts src/lib/chat/chat-turn.test.ts server/src/ai/OpenAiResponsesProvider.test.ts` -> passed, 27 tests.
- 2026-05-13 22:34: `npm run build` -> passed with existing Vite warnings for onnxruntime-web eval and large chunks.
- 2026-05-13 22:50: `npx vitest run src/lib/chat/grillo-memory-loop.test.ts src/lib/chat/grillo-memory.test.ts src/lib/chat/grillo-context.test.ts src/lib/chat/prompt.test.ts src/lib/chat/chat-turn.test.ts server/src/ai/OpenAiResponsesProvider.test.ts` -> passed, 30 tests.
- 2026-05-13 22:50: `npm run build` -> passed with existing Vite warnings for onnxruntime-web eval and large chunks.

## Next Patch

Implement the durable memory repository:

- Make the worker loop use native OpenAI tool calls when the server provider exposes app-local tools, while keeping the JSON loop fallback.
- Add a visible memory/debug panel or command output for recent worker rounds, side effects, and tool errors.
- Move the localStorage repository behind server JSONL or SQLite only if we need multi-browser/session durability.

## Completion Bar

Do not claim `YOURWIFEY_GRILLO_MEMORY_COMPLETE` until:

- Durable scoped memory backs the context packet.
- Candidate extraction/promotion exists and is tested.
- Diary/reflection records are stored separately from relationship memory.
- Semantic recall and budget reduction are tested.
- OpenAI Responses state remains isolated per persona/channel/source.
- `npm run build` passes.
