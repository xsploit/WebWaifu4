# Web Waifu 4 Ladybug Memory Completion Audit

Last audited: 2026-05-25

This file is the repo-local proof checklist for the active Ladybug memory goal. It is intentionally narrow: memory/database only, no provider routing, TTS, Electron polish, hosted auth, or deploy work.

## Requirements And Evidence

1. **Work must happen in the WebWaifu4 repo.**
   - Evidence: `AGENTS.md` and `docs/AGENT_GROUNDING.md` name `C:\Users\SUBSECT\Documents\GitHub\WebWaifu4` as the only valid repo.
   - Required command before checkpoints: `git rev-parse --show-toplevel` must print `C:/Users/SUBSECT/Documents/GitHub/WebWaifu4`.

2. **Ladybug is the preferred backend memory database when the local backend is available.**
   - Evidence: `src/lib/chat/ladybug-memory-client.ts` resolves desktop backend first, explicit backend second, Vite `/api/memory/*` third, then local Node fallback.
   - Evidence: `server/src/index.ts` exposes `/memory/status`, `/memory/graph`, `/memory/grillo`, `/memory/semantic`, `/memory/semantic/search`, and `/memory/relationships` through `LadybugMemoryService`.

3. **IndexedDB/local storage remains fallback behavior, not the primary backend path.**
   - Evidence: `src/lib/chat/grillo-memory.ts` hydrates from Ladybug first, then IndexedDB, then legacy localStorage.
   - Evidence: `src/lib/chat/semantic-memory.ts` loads/saves/searches Ladybug first, then IndexedDB/local fallback.

4. **Semantic memory stores user/assistant turns with embeddings and supports vector search.**
   - Evidence: `src/lib/chat/semantic-memory.ts` stores `userText`, `assistantText`, combined text, persona id, scope key, and optional embedding.
   - Evidence: `server/src/memory/LadybugMemoryService.ts` stores semantic records and vector rows; `querySemanticVectors` powers `/memory/semantic/search`.
   - Evidence: `server/src/memory/LadybugMemoryService.test.ts` checks stored embeddings, vector matches, semantic counts, and vector cleanup.

5. **Local and Twitch chat both feed memory.**
   - Evidence: `src/App.tsx` calls `recordRawChatMemoryTurns(...)` for local sends and direct Twitch chat intake.
   - Evidence: completed replies call semantic save and Grillo save for the active local or Twitch state key.
   - Evidence: `src/lib/chat/memory-ladybug-pipeline.test.ts` proves local and Twitch paths reach Ladybug graph, vectors, cadence, and prompt injection without cross-scope bleed.

6. **The memory worker is Ladybug-first and can read/search/write.**
   - Evidence: `src/App.tsx` runs `runGrilloMemoryWorkerLoop(...)` with semantic `insert` and `search` adapters that call the same Ladybug-first semantic APIs.
   - Evidence: worker JSON tools write candidates, diary entries, blocks, and semantic archival memory.
   - Evidence: `src/lib/chat/memory-ladybug-pipeline.test.ts` proves worker tool writes persist before the worker pass completes.

7. **Relationship graphs, diary/reflection, emotion state, candidates, blocks, participants, personas, semantic records, vectors, and edges persist.**
   - Evidence: `server/src/memory/LadybugMemoryService.ts` mirrors snapshots into queryable graph rows.
   - Evidence: `scripts/probe-ladybug-memory.ts` exercises local and Twitch scopes, relationship profiles/facts, semantic records/vectors, emotion rows, diary rows, graph rows, and vector search.
   - Evidence: `npm run probe:ladybug-memory` must return `ladybug-memory-service-probe-pass`.

8. **Prompt construction injects useful memory context.**
   - Evidence: `src/App.tsx` calls `getSemanticMemoryContext(...)`, `buildGrilloMemoryPromptAdditionsAsync(...)`, and scoped relationship memory before `buildChatCompletionMessages(...)`.
   - Evidence: `src/lib/chat/memory-backend-parity.test.ts` verifies Ladybug-backed Grillo and vector records land in the same prompt lanes.
   - Evidence: `src/lib/chat/memory-ladybug-pipeline.test.ts` verifies relationship memory, recalled Grillo memory, semantic memory, source metadata, and local/Twitch scope isolation in rendered POML.

9. **Clear/reset removes every active-scope memory class.**
   - Evidence: `src/App.tsx` clear/reset paths call relationship clear, `clearGrilloMemoryStateAsync(...)`, and `clearSemanticMemory(...)`, then refresh backend status.
   - Evidence: `server/src/memory/LadybugMemoryService.test.ts` verifies clearing one scope removes Grillo, semantic, vectors, relationships, candidates, diary, emotion rows, and graph references while preserving sibling scopes.

10. **Frontend inspectability exists.**
    - Evidence: `src/components/menu/tabs/ContextTab.tsx` renders backend status, database path, graph counts, scopes, participants, personas, edges, candidates, diary, relationships, relationship facts, blocks, emotions, semantic records, vectors, pending worker counts, embedding status, and last prompt-injection snapshot.
    - Evidence: `src/components/menu/tabs/ContextTab.test.tsx` asserts those fields render.

## Verification Commands

Run these from `C:\Users\SUBSECT\Documents\GitHub\WebWaifu4`:

```powershell
git rev-parse --show-toplevel
git status --short --branch
npx vitest run src/components/menu/tabs/ContextTab.test.tsx src/lib/chat/ladybug-memory-client.test.ts src/lib/chat/memory-backend-parity.test.ts src/lib/chat/memory-ladybug-pipeline.test.ts server/src/memory/LadybugMemoryService.test.ts src/lib/chat/semantic-memory.test.ts src/lib/chat/grillo-memory.test.ts src/lib/chat/memory-agent.test.ts src/lib/chat/chat-turn.test.ts
npm run probe:ladybug-memory
npm run build
git diff --check
```

## Completion Standard

The Ladybug memory goal is complete only when all checklist items above remain true in the current worktree and all verification commands pass. Any future memory change must update this audit if it changes storage ownership, prompt injection, worker behavior, graph rows, or clear/reset semantics.
