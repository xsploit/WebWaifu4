# Grillo Memory Adaptation Status

## Goal

Adapt the useful non-Discord parts of `C:\Users\SUBSECT\Downloads\ClosedRouter\grillo_next` into YourWifey Stream: strict context lanes, durable scoped memory, diary/reflection, candidate promotion, semantic recall, tool-aware prompt context, and observability while keeping OpenAI Responses as the AI provider.

## Source Of Truth

- Worktree: `C:\Users\SUBSECT\Documents\Codex\2026-05-04\https-github-com-prismml-eng-bonsai\yourwifey-stream`
- Reference: `C:\Users\SUBSECT\Downloads\ClosedRouter\grillo_next`
- Historical loop prompt and completion-promise files were removed from the
  public repo; this document is now only the Grillo memory implementation
  status.

## Current State

- Added a Grillo-style context packet in `src/lib/chat/grillo-context.ts`.
- Added a Grillo-style browser memory repository in `src/lib/chat/grillo-memory.ts`.
- Added a Grillo-style background worker tool loop in `src/lib/chat/grillo-memory-loop.ts`.
- Prompt rendering now has strict lanes: `background_information`, `instructions`, `channel_history`, `relationship_memory`, `recalled_memories`, `thoughts`, and `output_description`.
- Recent local/Twitch transcript context now feeds the packet as `channel_history` instead of being duplicated into the current turn prompt.
- Completed local/Twitch replies now write scoped Grillo candidates and diary entries, then promote repeated high-confidence candidates into memory blocks.
- Scheduled/manual memory passes now run a tool loop before the legacy relationship merge. The loop can read/search/list memory, write candidates, write diary entries, write consolidated memory blocks, insert archival thread memory, and recover candidate/diary objects that were returned without an explicit tool call.
- The worker loop now requests a `json_schema` structured output contract named `grillo_worker_loop`, and the runtime accepts both `{toolCalls:[...]}` JSON and OpenAI-style `tool_calls` / function-call shaped JSON with stringified arguments.
- Grillo memory is scoped by conversation state key and participant key. It currently persists in browser localStorage. Server JSONL/SQLite backing is still the next implementation step.
- Semantic vector memory now persists in browser IndexedDB when available, migrates/falls back to the older semantic localStorage records, calls `/ai/embeddings` for query/save vectors, and does local cosine/lexical/recency scoring before injection into the Grillo/POML context.

## Verification Log

- 2026-05-13 22:16: `npx vitest run src/lib/chat/grillo-context.test.ts src/lib/chat/prompt.test.ts` -> passed, 9 tests.
- 2026-05-13 22:17: `git diff --check` -> passed.
- 2026-05-13 22:17: `npx vitest run src/lib/chat/grillo-context.test.ts src/lib/chat/prompt.test.ts src/lib/chat/chat-turn.test.ts server/src/ai/OpenAiResponsesProvider.test.ts` -> passed, 24 tests.
- 2026-05-13 22:17: local loop dry run -> passed, resolved
  workdir/prompt/logs. The loop files were later removed from the public repo.
- 2026-05-13 22:18: `npm run build` -> passed with existing Vite warnings for onnxruntime-web eval and large chunks.
- 2026-05-13 22:34: `npx vitest run src/lib/chat/grillo-memory.test.ts src/lib/chat/grillo-context.test.ts src/lib/chat/prompt.test.ts src/lib/chat/chat-turn.test.ts server/src/ai/OpenAiResponsesProvider.test.ts` -> passed, 27 tests.
- 2026-05-13 22:34: `npm run build` -> passed with existing Vite warnings for onnxruntime-web eval and large chunks.
- 2026-05-13 22:50: `npx vitest run src/lib/chat/grillo-memory-loop.test.ts src/lib/chat/grillo-memory.test.ts src/lib/chat/grillo-context.test.ts src/lib/chat/prompt.test.ts src/lib/chat/chat-turn.test.ts server/src/ai/OpenAiResponsesProvider.test.ts` -> passed, 30 tests.
- 2026-05-13 22:50: `npm run build` -> passed with existing Vite warnings for onnxruntime-web eval and large chunks.
- 2026-05-13 23:06: `npx vitest run src/lib/chat/grillo-memory-loop.test.ts src/lib/chat/grillo-memory.test.ts src/lib/chat/grillo-context.test.ts src/lib/chat/prompt.test.ts src/lib/chat/chat-turn.test.ts server/src/ai/OpenAiResponsesProvider.test.ts` -> passed, 32 tests.
- 2026-05-13 23:06: `git diff --check` -> passed with line-ending warnings only.
- 2026-05-13 23:06: `npm run build` -> passed with existing Vite warnings for onnxruntime-web eval and large chunks.
- 2026-05-14 00:25: `npx vitest run src/lib/chat/semantic-memory.test.ts src/lib/chat/grillo-memory.test.ts src/lib/chat/grillo-context.test.ts src/lib/chat/prompt.test.ts src/lib/chat/chat-turn.test.ts` -> passed, 18 tests.
- 2026-05-14 00:26: `npm run build` -> passed with existing Vite warnings for onnxruntime-web eval and large chunks.

## Next Patch

Implement the durable memory repository:

- Make the worker loop use native OpenAI app-local tool definitions when the server provider exposes them; the structured JSON tool loop remains the browser-safe fallback.
- Add a visible memory/debug panel or command output for recent worker rounds, side effects, and tool errors.
- Move the Grillo localStorage repository and browser IndexedDB semantic vector store behind server JSONL or SQLite only if we need multi-browser/session durability.

## Completion Bar

Do not claim `YOURWIFEY_GRILLO_MEMORY_COMPLETE` until:

- Durable scoped memory backs the context packet.
- Candidate extraction/promotion exists and is tested.
- Diary/reflection records are stored separately from relationship memory.
- Semantic recall, browser vector scoring, and budget reduction are tested.
- OpenAI Responses state remains isolated per persona/channel/source.
- `npm run build` passes.
