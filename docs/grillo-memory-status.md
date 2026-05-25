# Grillo Memory Adaptation Status

## Goal

Adapt the useful non-Discord parts of `C:\Users\SUBSECT\Downloads\ClosedRouter\grillo_next` into Web Waifu 4: strict context lanes, durable scoped memory, diary/reflection, candidate promotion, semantic recall, tool-aware prompt context, and observability while keeping OpenAI Responses as the AI provider.

## Source Of Truth

- Worktree: `C:\Users\SUBSECT\Documents\GitHub\WebWaifu4`
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
- Grillo memory is scoped by conversation state key and participant key. In desktop mode it tries the local backend LadybugDB routes first, then falls back to browser IndexedDB with legacy localStorage fallback.
- Semantic vector memory uses the same desktop-backend-first path, then falls back to browser IndexedDB/localStorage, calls `/ai/embeddings` for query/save vectors, and does local cosine/lexical/recency scoring before injection into the Grillo/POML context.
- LadybugDB now has runtime backend routes for Grillo snapshots, semantic snapshots, memory scopes, participant/persona rows, graph candidate rows, graph diary rows, graph block rows, graph semantic rows, graph relationship edges, and a read-only graph summary for the Memory tab. Packaged Electron starts a bundled Node sidecar so `@ladybugdb/core` loads under Node instead of Electron.
- The Memory tab now shows the last main-reply prompt injection snapshot: source/state key, current turn text, relationship memory lane, recalled memories lane, and semantic memory lane.

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
- 2026-05-24 18:08: `npx vitest run src/lib/chat/prompt.test.ts src/lib/chat/semantic-memory.test.ts src/lib/chat/grillo-memory-loop.test.ts src/lib/chat/grillo-memory.test.ts src/lib/chat/chat-turn.test.ts` -> passed, 25 tests.
- 2026-05-24 18:12: `npm run probe:ladybug-memory` -> passed, verdict `ladybug-memory-graph-probe-pass`.
- 2026-05-25 00:10: `npx vitest run src/lib/chat/semantic-memory.test.ts src/lib/chat/grillo-memory.test.ts src/lib/chat/grillo-memory-loop.test.ts src/lib/chat/prompt.test.ts` -> passed, 23 tests.
- 2026-05-25 00:12: local Node backend `/memory/status`, `/memory/grillo`, and `/memory/semantic` smoke -> passed save/load for one Grillo candidate and one semantic record.
- 2026-05-25 00:14: `npm run desktop:pack` -> passed. Packaged smoke: app opens, `/health` returns 200, backend closes after app exit; `/memory/status` reports Ladybug unavailable in packaged Electron because the native module does not load under Electron.
- 2026-05-25 00:45: `npm run desktop:pack` -> passed with bundled Node sidecar. Packaged EXE smoke: app opens, `/health` returns 200, `/memory/status` returns `ok:true` with `backend: ladybug`, and backend closes after app exit.
- 2026-05-25 00:52: packaged EXE `/memory/grillo` and `/memory/semantic` smoke -> passed save/load through the Ladybug sidecar.
- 2026-05-25 00:58: `npx vitest run server/src/memory/LadybugMemoryService.test.ts src/lib/chat/semantic-memory.test.ts src/lib/chat/grillo-memory.test.ts src/lib/chat/grillo-memory-loop.test.ts src/lib/chat/prompt.test.ts` -> passed, 24 tests.
- 2026-05-25 01:08: `npx vitest run server/src/memory/LadybugMemoryService.test.ts` -> passed, verifies graph summary scopes, participants, personas, relation types, and recent memory rows.
- 2026-05-25 01:09: `npm run build` -> passed with existing Vite warnings for onnxruntime-web eval and large chunks.
- 2026-05-25 01:09: `npx vitest run server/src/memory/LadybugMemoryService.test.ts src/lib/chat/semantic-memory.test.ts src/lib/chat/grillo-memory.test.ts src/lib/chat/grillo-memory-loop.test.ts src/lib/chat/prompt.test.ts` -> passed, 24 tests.
- 2026-05-25 01:11: `npm run desktop:pack` -> passed. Packaged EXE smoke: `/health` 200, `/memory/status` reports `backend: ladybug`, `/memory/graph` returns scopes/edges/recent rows after Grillo and semantic writes, and backend closes after app exit.
- 2026-05-25 01:13: `npx vitest run src/lib/chat/memory-backend-parity.test.ts` -> passed, verifies Ladybug-backed Grillo and semantic records enter the actual rendered POML prompt lanes.
- 2026-05-25 01:13: `npm run build` -> passed with existing Vite warnings for onnxruntime-web eval and large chunks.
- 2026-05-25 01:16: `npm run build` -> passed with existing Vite warnings for onnxruntime-web eval and large chunks.
- 2026-05-25 01:16: `npx vitest run src/lib/chat/memory-backend-parity.test.ts server/src/memory/LadybugMemoryService.test.ts src/lib/chat/semantic-memory.test.ts src/lib/chat/grillo-memory.test.ts src/lib/chat/grillo-memory-loop.test.ts src/lib/chat/prompt.test.ts` -> passed, 25 tests.

## Next Patch

Continue the Ladybug migration:

- Expand the visible Memory tab with pending worker turn counts, worker side effects, and provider/embedding failures.
- Add a packaged-runtime chat smoke that proves a completed local reply writes Grillo and semantic memory through Ladybug, not only direct memory endpoints.

## Completion Bar

Do not claim `YOURWIFEY_GRILLO_MEMORY_COMPLETE` until:

- Durable scoped memory backs the context packet.
- Candidate extraction/promotion exists and is tested.
- Diary/reflection records are stored separately from relationship memory.
- Semantic recall, browser vector scoring, and budget reduction are tested.
- OpenAI Responses state remains isolated per persona/channel/source.
- `npm run build` passes.
