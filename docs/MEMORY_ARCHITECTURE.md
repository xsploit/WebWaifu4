# WebWaifu 4 Memory Architecture

This document reflects the current code, not the older BYOK/VPS branch.

## Current Runtime

WebWaifu 4 has two memory layers today.

1. **Grillo-style relationship memory**
   - Code: `src/lib/chat/grillo-memory.ts`, `src/lib/chat/grillo-memory-loop.ts`, `src/lib/chat/grillo-context.ts`
   - Storage: browser IndexedDB database `yourwifey-grillo-memory`, with legacy localStorage fallback.
   - Scope: conversation state key plus participant key.
   - Local scope example: `local:persona:hikari-chan`
   - Twitch scope example: `twitch:subsect:persona:hikari-chan`
   - Participant examples: `local:local:subby`, `twitch:subsect:viewername`
   - Contents: candidates, promoted memory blocks, reflective diary entries, and decayed emotion state.

2. **Semantic memory**
   - Code: `src/lib/chat/semantic-memory.ts`
   - Storage: browser IndexedDB database `yourwifey-memory`, store `semanticRecords`, with legacy localStorage fallback.
   - Scope: same conversation state key as the chat reply.
   - Contents: user text, assistant text, optional embedding, timestamp, persona id.
   - Retrieval: embedding cosine score when available, plus lexical and recency scoring.

## What Is Saved

Local chat and Twitch chat both enter the same normalized `ChatTurn` shape before memory.

- Local chat uses `createLocalChatTurn(...)`.
- Twitch chat uses `createTwitchChatTurn(...)`.
- Both call `recordRawChatMemoryTurns(...)` before the AI reply when they enter the queue.
- Completed AI replies call:
  - `rememberSemanticTurn(...)`
  - `recordGrilloMemoryTurnAsync(...)`
  - relationship-memory update and scheduled memory-worker refresh.

That means user messages are saved in semantic memory as part of a user/assistant turn after a successful assistant reply. Raw chat turns also feed Grillo candidate/diary extraction before and after the reply.

## What Is Injected Into The AI

The main reply path builds memory context in `runChatAiJob(...)` before calling the provider.

Injected into POML:

- `grilloMemory` from `buildGrilloMemoryPromptAdditionsAsync(...)`
- `semanticMemoryContext` from `getSemanticMemoryContext(...)`
- scoped relationship memory from `getScopedRelationshipMemory(stateKey)`
- recent normalized local/Twitch transcript as `channelHistory`
- current turn metadata: source, speaker, channel, trusted/controller flags, intake mode, Twitch badges/mod/broadcaster flags, and state key.

`src/lib/chat/prompt.ts` then builds the strict Grillo lanes and passes them into `src/lib/chat/templates/yourwifey-responses.poml`.

The important prompt lanes are:

- `channel_history`
- `relationship_memory`
- `recalled_memories`
- `thoughts`

## Memory Worker

The worker runs on chat-message cadence and manual runs.

- Cadence setting: `aiSettings.memoryAgentIntervalMessages`
- Pending counts include local and Twitch `ChatTurn` messages.
- The worker has a JSON tool loop with memory tools:
  - read memory
  - search memory
  - list memory
  - write candidate
  - write diary
  - write consolidated memory block
  - insert semantic archival thread memory
- The worker can use the same selected LLM provider path as chat, but with `disableState: true` and `stateScope: memory` so it does not pollute chat conversation state.

## Known Weak Spots

- The architecture is functionally wired, but split across relationship state, Grillo IndexedDB, semantic IndexedDB, and chat history. Debugging it is harder than it should be.
- Semantic memory is stored only after a completed assistant reply. If a provider fails before completion, that turn may still exist in Grillo raw-turn memory but not in semantic memory.
- The memory worker can insert semantic memories, but the main assistant does not currently receive direct write tools. That is intentional for now; direct main-agent memory tools would need strict permissions and UX so a normal reply cannot silently rewrite durable state in surprising ways.
- Twitch is still treated as a runtime mode instead of a fully explicit top-level product mode. The code supports Twitch off by default through environment flags, but the UX should make "Local", "OBS character", and "Twitch co-host" modes clearer.

## LadybugDB Probe

LadybugDB was tested as a Node/Electron-side graph memory candidate.

- Package: `@ladybugdb/core@0.16.1`
- Probe script: `scripts/probe-ladybug-memory.mjs`
- Command: `npm run probe:ladybug-memory`
- Result: pass on Windows with local and Twitch participants, chat turns, memory facts, and diary edges.

Current recommendation:

- Keep Ladybug as a dev/probe dependency for now.
- Do not replace the browser IndexedDB stores in this checkpoint.
- If we adopt it, use one backend/Electron `MemoryGraphService` as the only writable DB owner, then expose small local endpoints or IPC methods to the renderer.
- Keep provider keys out of Ladybug. It should store memory graph data, participant relationships, diary, facts, and recall metadata only.

## Recommended Next Migration

1. Add `MemoryRepository` interfaces for Grillo state and semantic state.
2. Keep IndexedDB as the default implementation.
3. Add an Electron/backend Ladybug implementation behind a feature flag.
4. Write adapter tests that prove local and Twitch scopes return identical prompt context across IndexedDB and Ladybug.
5. Add a Memory Debug page that shows:
   - current scope
   - pending worker turns
   - last worker run
   - injected Grillo lanes
   - injected semantic matches
   - failed embedding/provider status
6. Only after that, make Ladybug the desktop default if it is stable in packaged Electron.
