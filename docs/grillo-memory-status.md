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
- Prompt rendering now has strict lanes: `background_information`, `instructions`, `channel_history`, `relationship_memory`, `recalled_memories`, `thoughts`, and `output_description`.
- Recent local/Twitch transcript context now feeds the packet as `channel_history` instead of being duplicated into the current turn prompt.
- Existing local relationship memory, diary context, and semantic memory are still the backing sources. Durable DB-backed Grillo memory is not implemented yet.

## Verification Log

- 2026-05-13 22:16: `npx vitest run src/lib/chat/grillo-context.test.ts src/lib/chat/prompt.test.ts` -> passed, 9 tests.
- 2026-05-13 22:17: `git diff --check` -> passed.
- 2026-05-13 22:17: `npx vitest run src/lib/chat/grillo-context.test.ts src/lib/chat/prompt.test.ts src/lib/chat/chat-turn.test.ts server/src/ai/OpenAiResponsesProvider.test.ts` -> passed, 24 tests.
- 2026-05-13 22:17: `.\plugins\ralph-wiggum-loop\scripts\run-codex-ralph-loop.ps1 -PromptFile .\plugins\ralph-wiggum-loop\prompts\yourwifey-grillo-memory-next.prompt.md -MaxIterations 1 -DryRun` -> passed, resolved workdir/prompt/logs.
- 2026-05-13 22:18: `npm run build` -> passed with existing Vite warnings for onnxruntime-web eval and large chunks.

## Next Patch

Implement the durable memory repository:

- Choose server JSONL or SQLite first, with a browser fallback only when the server store is unavailable.
- Add scoped records for participant memory, diary/reflection, semantic recall metadata, and memory candidates.
- Add API endpoints or reuse the AI server so the browser can write completed turns and read context packets.
- Keep all scopes keyed by source/channel/persona/participant.

## Completion Bar

Do not claim `YOURWIFEY_GRILLO_MEMORY_COMPLETE` until:

- Durable scoped memory backs the context packet.
- Candidate extraction/promotion exists and is tested.
- Diary/reflection records are stored separately from relationship memory.
- Semantic recall and budget reduction are tested.
- OpenAI Responses state remains isolated per persona/channel/source.
- `npm run build` passes.
