# G.R.I.L.L.O. Port TODO

Goal: port the `grillo_next` memory worker architecture into WebWaifu4 one-to-one in spirit, adapted to the WebWaifu local backend, LadybugDB, Twitch/local modes, POML, and existing provider lanes.

## Locked Decisions

- Work only in `C:\Users\SUBSECT\Documents\GitHub\WebWaifu4`.
- Do not use `C:\Users\SUBSECT\Documents\New project 3` for this project.
- Commit and push each passing implementation slice.
- Rebuild the packaged EXE with `npm run desktop:pack` after each meaningful implementation slice.
- `grillo_next` is a reference for core memory-worker behavior, not gospel.
- Do not copy Discord-bot architecture, channel assumptions, framework glue, or autonomous posting behavior.
- Port only the durable GRILLO concepts that fit WebWaifu: beats, worker tools, candidates, diary, relationship/profile state, recall, semantic indexing, context packet, and traceability.
- LadybugDB is the canonical GRILLO database.
- Clean slate is allowed. Do not design around old snapshot compatibility.
- One backend process owns AI proxy, TTS, tools, POML render, Ladybug memory, and GRILLO.
- React/Electron controls and displays GRILLO. It does not own the worker loop.
- GRILLO is the memory system: relationship memory, diary, semantic recall, slots, candidates, and blocks.
- Main chat, GRILLO/reflection, and embeddings are separate lanes using the same provider infrastructure.
- Local mode is first-class. Stream/Twitch mode is a switch.
- GRILLO must not ingest raw Twitch noise without filtering/scoring.
- External autonomous actions are disabled by default. Internal reflection is allowed.
- POML receives the final reduced GRILLO context packet.

## Do Not Do

- Do not create a second JSONL/SQLite memory database beside Ladybug.
- Do not keep old relationship/semantic/diary lanes as competing prompt inputs once GRILLO packet injection is wired.
- Do not run the real GRILLO worker in React.
- Do not add Discord bot code.
- Do not treat Discord thread/channel behavior as the default WebWaifu behavior.
- Do not rely on OpenAI Conversations API for memory/context.
- Do not add autonomous Twitch posting or unprompted speech by default.
- Do not make regex keyword hacks for tool or memory behavior.

## Immediate Next Slice

Harden Electron/backend lifecycle so packaged WebWaifu does not leave stale local backends:

1. Inspect Electron startup, backend port selection, frontend backend URL injection, and shutdown cleanup.
2. Ensure packaged app starts exactly one owned backend.
3. If the preferred port is busy, reuse only a compatible owned backend or choose a new port and pass it to the renderer.
4. Ensure app exit shuts down backend, GRILLO timers, sockets, and bridge processes.
5. Add or update packaged smoke coverage for `/health`, `/memory/status`, and `/memory/grillo/runtime`.
6. Run focused lifecycle checks, `npm run build`, `npm run desktop:pack`, and `git diff --check`.
7. Commit only the intended files.
8. Push the commit to `origin main`.

Do not touch Fish TTS, OpenAI WebSocket streaming, provider routing, GRILLO memory semantics, or public chat tools during this slice.

Current slice definition of done:

- [x] Electron startup has one clear backend owner path.
- [x] Renderer receives the actual backend URL/port.
- [x] Busy preferred port path is deterministic and tested.
- [x] App exit shuts down owned backend resources.
- [x] Packaged smoke proves backend health and GRILLO runtime status.
- [x] `npm run build` passes.
- [x] `npm run desktop:pack` rebuilds the EXE.
- [x] `git diff --check` passes.
- [x] Commit and push only the intended lifecycle files.

## Phase 1 - Ladybug GRILLO Store

- [x] Define canonical Ladybug entities:
  - [x] `TurnEvent`
  - [x] `MemoryCandidate`
  - [x] `DiaryEntry`
  - [x] `MemoryBlock`
  - [x] `MemorySlot`
  - [x] `MemorySlotPatch`
  - [x] `RelationshipProfile`
  - [x] `EmotionState`
  - [x] `GrilloActivity`
  - [x] `WorkerContextTrace`
  - [x] `SemanticRecord`
  - [x] `SemanticVector`
- [ ] Define graph relations:
  - [x] scope -> turn
  - [x] scope -> candidate
  - [x] scope -> diary
  - [x] scope -> block
  - [x] scope -> slot
  - [x] scope -> semantic record
  - [x] scope -> relationship profile
  - [x] candidate -> participant
  - [x] diary -> participant
  - [x] semantic/vector -> persona
  - [x] block/slot -> source candidates
  - [x] relationship -> persona/participant
- [ ] Implement a Ladybug-backed repository matching the GRILLO storage contract.
- [x] Add unit tests for append/read/replace/singleton/slot APIs.
- [x] Add graph summary tests proving nodes and edges are real, not just JSON snapshots.

Progress note:

- 2026-05-28: Added native Ladybug GRILLO record primitives for append/read/singleton/slot writes, plus graph mirrors for turns, candidates, diary, slots, activity, and worker traces. Focused Ladybug memory test passes.
- 2026-05-28: Exposed native GRILLO turns, slots, slot patches, activity rows, and worker traces through `/memory/graph` and the Memory UI. Focused Ladybug and ContextTab tests pass.
- 2026-05-28: Added backend-owned GRILLO service slice with `/memory/grillo/turn` and `/memory/grillo/run/manual`. It writes turn pairs, manual candidate/diary/slot updates, activity rows, and worker traces through Ladybug. Focused service tests and full build pass.
- 2026-05-28: Wired completed chat replies to `/memory/grillo/turn` through the Ladybug memory client. The app records the model-visible prompt plus parsed assistant reply as native GRILLO turn events without blocking TTS/UI playback.
- 2026-05-28: Added `/memory/grillo/context` for canonical Ladybug GRILLO context packets and threaded that packet into the POML-rendered chat prompt. The Memory UI now shows the exact last injected native packet.
- 2026-05-28: Added a backend worker-tool foundation for read/search/list, candidate writes, diary writes, memory slot/block writes, profile patches, and archival semantic inserts. Tool telemetry is recorded in GRILLO activity rows, and focused service tests prove tool writes feed the context packet.
- 2026-05-28: Added backend GRILLO runtime lifecycle, `/memory/grillo/runtime`, `/memory/grillo/run/tick`, Ladybug `memory_worker_state`, shutdown cleanup, no-op tick activity, and overlap guarding.
- 2026-05-28: Wired backend GRILLO runtime status and manual tick control into the Memory UI, refreshed through the same backend polling path as Ladybug status and graph state.
- 2026-05-28: Replaced the default no-op backend tick with a native extraction pass over completed turn pairs. It writes candidates, diary thoughts, and open-thread slots through worker tools, records extraction traces, persists processed turn ids, and proves the context packet sees the extracted memory.
- 2026-05-28: Verified the provider lane keeps public runtime search tools out of `stateScope: memory` requests while normal chat requests still receive Tavily tools and agentic loop controls. Focused `AiSdkGatewayProvider` tests pass.
- 2026-05-28: Wired manual backend GRILLO ticks into the existing provider infrastructure. The Memory UI passes browser-vault provider headers plus the selected memory-worker model, the backend calls the same `/ai/chat` path with `stateScope: memory`, and `GrilloWorkerService` runs an LLM-guided JSON worker-tool loop against Ladybug worker tools. If no provider key is available, the existing deterministic backend extraction remains the fallback.
- 2026-05-28: Added backend debrief recovery for provider-backed extraction ticks. If the LLM-guided worker reaches `done` without candidate or diary writes, the backend runs one recovery prompt in the same `stateScope: memory` lane before marking source turns processed. Focused service tests prove recovered candidate/diary writes land in Ladybug and are tracked in worker state.
- 2026-05-28: Added explicit backend reflection and relationship beats on the same memory lane. Manual backend ticks now accept a `beatType`, write traces with the beat task type, store last beat/tool-call status, and the Memory UI exposes separate Run Extraction and Run Beat controls plus last beat/tool count status. Focused service, client, and ContextTab tests pass.
- 2026-05-28: Added explicit backend consolidation and compaction beats on the same memory lane. Both beats write typed worker traces, update runtime beat/tool-call status, and have Memory UI buttons. Focused service, client, ContextTab, build, package, and diff-check gates pass.
- 2026-05-28: Added explicit backend curiosity and tag elaboration beats on the same memory lane. Both beats have dedicated worker prompts, typed traces, runtime beat/tool-call status, and focused service tests proving Ladybug writes. Focused service, client, build, and package gates pass.
- 2026-05-28: Added backend semantic indexing as a GRILLO beat. It embeds completed GRILLO turn pairs through the embedding lane, writes Ladybug semantic records/vectors, records typed indexing traces, and persists indexed turn ids for retry-safe follow-up runs. Focused service, client, and build gates pass.
- 2026-05-28: Added graph lineage edges from memory blocks/slots back to source candidates and optional relationship participant edges alongside existing persona links. Focused Ladybug graph tests prove the new relations.
- 2026-05-28: Reworked the Memory Worker operator panel as G.R.I.L.L.O. trace inspection. The graph summary now exposes worker prompt/system prompt and activity prompt/output text, and the UI renders latest worker prompt/output plus graph-backed memory rows.
- 2026-05-28: Renamed reset controls to explicit `Clear GRILLO Memory` and `Reset Chat Context` actions. The UI now states that chat-context reset keeps durable memory while GRILLO clear removes the current scope's relationship, diary, GRILLO, and semantic recall.
- 2026-05-28: Added backend GRILLO emotion read/update worker tools. Emotion state now upserts one canonical Ladybug record per scope, replaces graph intensities instead of duplicating them, and records normal worker-tool telemetry.
- 2026-05-28: Added Local/Stream mode GRILLO intake gating. Twitch is local-only by default, Stream Mode must be enabled before IRC starts, raw Twitch turns only feed durable memory when they are mentions or trusted roles, and batch summaries can still feed GRILLO without storing every low-signal chat line.
- 2026-05-28: Extended Electron backend warmup and packaged UI smoke coverage to require `/memory/grillo/runtime` in addition to `/health`. The packaged smoke now proves the renderer sees the backend port, backend health responds, GRILLO runtime responds, and the backend port closes after Electron exits.
- 2026-05-28: Tightened the desktop port-fallback smoke. It now blocks the preferred port, expects Electron to choose the next port, verifies `/health`, `/memory/status`, and `/memory/grillo/runtime`, inspects the renderer bridge over CDP to prove the fallback port reached the frontend, and verifies the fallback backend closes after Electron exits.
- 2026-05-28: Made Electron backend ownership explicit in the desktop runtime bridge. Packaged smokes now assert `backendOwner=owned`, while dev external-backend mode remains a separate explicit path.
- 2026-05-28: Hardened backend shutdown by tracking HTTP sockets and draining/destroying remaining keep-alive or streaming connections after GRILLO, provider cache, Twitch source, overlay sockets, and Ladybug shutdown.
- 2026-05-28: Made the native Ladybug GRILLO context packet authoritative for prompt memory lanes. When the packet is present, old browser relationship memory, diary thoughts, semantic recall, and duplicate channel history are not appended into the POML memory block.
- 2026-05-28: Split the embedding lane into provider and browser/local model configuration. The local transformers.js worker accepts and caches per-model extractors, prompt recall/semantic save/worker memory paths thread the selected local model id, the Context tab exposes both fields plus a Run Semantic Indexing button, and the backend `/memory/grillo/run/tick` respects `embeddingMode` so `browser` mode no longer silently calls provider embeddings (existing `semantic_indexing_requires_embedding` no-op path covers it).
- 2026-05-28: Added token-backed Electron/backend ownership reuse. Packaged Electron now reuses a busy preferred port only when `/health` proves a compatible WebWaifu backend with the same owner token, exposes `backendReused` to the renderer, and can shut down a reused owned backend through a token-protected local shutdown route. New packaged smoke coverage proves owned reuse, and existing fallback smoke still proves non-owned busy ports fall forward.
- 2026-05-28: Added a G.R.I.L.L.O. lane snapshot to the Memory tab. It now shows current Local/Queue/Batch mode, chat lane provider/model/transport/state mode, GRILLO lane provider/model/tool-round cap, embedding lane source/provider/local models, and turn cadence across current/all scopes.
- 2026-05-28: Added explicit Stream Mode GRILLO intake scoring. Twitch turns can enter durable memory for trusted roles, direct persona mentions, explicit durable-memory cues, emotional/relationship signals, stream-relevant badges/first-chat signals, or repeated batch topics; single low-signal Twitch chatter stays short-term. Focused intake tests cover all scoring categories.

## Phase 2 - Backend GRILLO Service

- [ ] Move GRILLO worker ownership to the backend.
- [x] Add backend endpoints for native turn ingest and manual GRILLO writes.
- [x] Wire completed local/Twitch assistant reply pairs into backend turn ingest.
- [ ] Add backend service lifecycle:
  - [x] start with backend
  - [x] stop on backend shutdown
  - [x] no orphan timers
  - [x] no second backend
- [x] Implement worker state in Ladybug.
- [x] Implement tick guard so only one GRILLO tick runs at a time.
- [ ] Implement tasks:
  - [x] extraction
  - [x] reflection beat
  - [x] relationship beat
  - [x] curiosity beat
  - [x] tag elaboration beat
  - [x] consolidation
  - [x] semantic indexing
  - [x] compaction
  - [x] debrief/recovery
- [ ] Add run traces for every task.
- [x] Add clear status for no-op runs.

## Phase 3 - Worker Tools

- [ ] Port/adapt core worker tools:
  - [x] `core.worker_memory_read`
  - [x] `core.worker_memory_search`
  - [x] `core.worker_candidate_list`
  - [x] `core.worker_candidate_write`
  - [x] `core.worker_diary_write`
  - [x] `core.worker_memory_write`
  - [x] `core.worker_profile_patch`
  - [x] `core.worker_memory_insert_archival`
  - [x] emotion read/update tools if useful
- [x] Make all tool writes go through Ladybug.
- [ ] Add tool-call telemetry:
  - [x] name
  - [x] args summary
  - [x] result
  - [x] duration
  - [x] error
- [x] Add debrief recovery for missing candidate/diary writes.
- [x] Verify worker tools are separate from public chat tools.

## Phase 4 - Lanes And Providers

- [ ] Keep same provider infrastructure.
- [x] Add/verify configurable lanes:
  - [x] chat lane
  - [x] GRILLO/reflection lane
  - [x] embedding lane
- [x] Let reflection lane choose its own provider/model.
- [x] Let embedding lane choose browser local, local model, or provider-based when supported.
- [x] Ensure memory-scoped requests do not expose normal public chat tools.
- [ ] Ensure OpenRouter and Vercel Gateway models work through the same lane shape.

## Phase 5 - Context Packet And POML

- [x] Build canonical GRILLO context packet:
  - [x] `background_information`
  - [x] `channel_history`
  - [x] `relationship_memory`
  - [x] `recalled_memories`
  - [x] `thoughts`
  - [x] `output_description`
- [x] Budget and reduce context before POML render.
- [x] Inject the canonical GRILLO packet into POML.
- [x] Remove duplicate old memory prompt inputs after packet is verified.
- [x] Show exact injected packet in the UI.
- [x] Add tests proving POML receives memory slots, diary thoughts, semantic recall, and relationship state.

## Phase 6 - Local Mode And Stream Mode

- [x] Add clear Local/Stream mode setting.
- [ ] Local mode:
  - [x] local chat turns feed GRILLO
  - [x] no Twitch intake by default
  - [ ] controller/local participant is scoped clearly
- [ ] Stream mode:
  - [x] Twitch intake enabled
  - [x] direct mentions and high-signal turns feed GRILLO
  - [x] batch summaries can feed GRILLO
  - [x] low-signal chatter stays short-term only
- [x] Add Twitch memory intake scoring/filtering:
  - [x] direct mention
  - [x] broadcaster/mod/controller
  - [x] explicit preference/fact/goal/boundary
  - [x] repeated topic thread
  - [x] emotional/relationship signal
  - [x] stream event relevance
- [x] Add tests so Twitch spam does not create durable memory spam.

## Phase 7 - GRILLO Operator UI

- [x] Rename/rework Memory Worker panel into G.R.I.L.L.O.
- [ ] Show:
  - [x] enabled state
  - [x] current mode
  - [x] backend status
  - [x] lane provider/model values
  - [x] beat interval
  - [x] turn cadence
  - [x] last run
  - [x] last beat type
  - [x] last run reason/no-op reason
  - [x] last tool calls
  - [x] last worker prompt
  - [x] last worker output
  - [x] injected context packet
  - [x] candidates
  - [x] diary entries
  - [x] memory slots/blocks
  - [x] semantic recall/vector counts
  - [x] graph counts/relations
- [ ] Add buttons:
  - [x] Run Extraction
  - [x] Run Beat
  - [x] Run Consolidation
  - [x] Run Compaction
  - [x] Run Semantic Indexing
  - [x] Clear GRILLO Memory
  - [x] Reset Chat Context

## Phase 8 - Backend/Electron Lifecycle

- [x] Ensure Electron starts exactly one backend.
- [x] Ensure frontend receives the backend URL/port correctly.
- [ ] If port is busy:
  - [x] reuse only if it is our owned compatible backend
  - [x] otherwise choose a new port and pass it to frontend
- [x] Ensure app exit shuts down backend, GRILLO timers, TTS bridges, and sockets.
- [x] Add packaged app smoke test for backend health and GRILLO status.
- [x] Compile the EXE after each meaningful implementation slice.

## Phase 9 - Verification Gates

- [ ] Unit tests:
  - [ ] Ladybug GRILLO repository
  - [x] worker tools
  - [ ] context packet reduction
  - [ ] POML injection
  - [x] Twitch intake filtering
- [ ] Integration tests:
  - [x] local chat -> extraction -> candidate/diary/slot
  - [ ] semantic recall -> context packet -> POML
  - [ ] manual beat -> trace visible in UI endpoint
  - [ ] stream mode does not ingest low-signal spam
- [ ] Runtime smoke:
  - [x] backend health
  - [x] memory status
  - [ ] graph summary
  - [ ] chat reply with injected GRILLO context
  - [x] packaged EXE starts and exits cleanly
- [ ] Commit after each passing slice.

## First Slice

Start with the smallest useful vertical slice:

1. Add Ladybug-backed GRILLO repository primitives.
2. Write one local chat turn pair as `TurnEvent`.
3. Run extraction manually through backend.
4. Write one `MemoryCandidate`, one `DiaryEntry`, and one `MemorySlot`.
5. Expose status/trace endpoint.
6. Show it in the GRILLO UI panel.
7. Inject the resulting GRILLO context packet into POML.
8. Test and compile.
