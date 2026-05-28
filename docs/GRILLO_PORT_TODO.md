# G.R.I.L.L.O. Port TODO

Goal: port the `grillo_next` memory worker architecture into WebWaifu4 one-to-one in spirit, adapted to the WebWaifu local backend, LadybugDB, Twitch/local modes, POML, and existing provider lanes.

## Locked Decisions

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
- Do not rely on OpenAI Conversations API for memory/context.
- Do not add autonomous Twitch posting or unprompted speech by default.
- Do not make regex keyword hacks for tool or memory behavior.

## Immediate Next Slice

Do this before removing the old React memory worker:

1. Add explicit reflection/relationship beat tasks on top of the same backend memory lane.
2. Add UI controls for Run Beat and show the last beat type/tool-call summary from backend traces/activity.
3. Keep the deterministic extraction fallback only for missing provider keys; provider-backed manual ticks should use the LLM-guided worker loop.
4. Run focused tests, `npm run build`, `npm run desktop:pack`, and `git diff --check`.
5. Commit only the intended files.

Do not touch Fish TTS, OpenAI WebSocket streaming, provider routing, or Electron transparency during this slice.

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
  - [ ] block/slot -> source candidates
  - [ ] relationship -> persona/participant
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

## Phase 2 - Backend GRILLO Service

- [ ] Move GRILLO worker ownership to the backend.
- [x] Add backend endpoints for native turn ingest and manual GRILLO writes.
- [x] Wire completed local/Twitch assistant reply pairs into backend turn ingest.
- [ ] Add backend service lifecycle:
  - [x] start with backend
  - [x] stop on backend shutdown
  - [x] no orphan timers
  - [ ] no second backend
- [x] Implement worker state in Ladybug.
- [x] Implement tick guard so only one GRILLO tick runs at a time.
- [ ] Implement tasks:
  - [x] extraction
  - [ ] reflection beat
  - [ ] relationship beat
  - [ ] curiosity beat
  - [ ] tag elaboration beat
  - [ ] consolidation
  - [ ] semantic indexing
  - [ ] compaction
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
  - [ ] emotion read/update tools if useful
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
- [ ] Add/verify configurable lanes:
  - [x] chat lane
  - [x] GRILLO/reflection lane
  - [ ] embedding lane
- [x] Let reflection lane choose its own provider/model.
- [ ] Let embedding lane choose browser local, local model, or provider-based when supported.
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
- [ ] Remove duplicate old memory prompt inputs after packet is verified.
- [x] Show exact injected packet in the UI.
- [x] Add tests proving POML receives memory slots, diary thoughts, semantic recall, and relationship state.

## Phase 6 - Local Mode And Stream Mode

- [ ] Add clear Local/Stream mode setting.
- [ ] Local mode:
  - [ ] local chat turns feed GRILLO
  - [ ] no Twitch intake by default
  - [ ] controller/local participant is scoped clearly
- [ ] Stream mode:
  - [ ] Twitch intake enabled
  - [ ] direct mentions and high-signal turns feed GRILLO
  - [ ] batch summaries can feed GRILLO
  - [ ] low-signal chatter stays short-term only
- [ ] Add Twitch memory intake scoring/filtering:
  - [ ] direct mention
  - [ ] broadcaster/mod/controller
  - [ ] explicit preference/fact/goal/boundary
  - [ ] repeated topic thread
  - [ ] emotional/relationship signal
  - [ ] stream event relevance
- [ ] Add tests so Twitch spam does not create durable memory spam.

## Phase 7 - GRILLO Operator UI

- [ ] Rename/rework Memory Worker panel into G.R.I.L.L.O.
- [ ] Show:
  - [x] enabled state
  - [ ] current mode
  - [x] backend status
  - [ ] lane provider/model values
  - [x] beat interval
  - [ ] turn cadence
  - [x] last run
  - [ ] last beat type
  - [x] last run reason/no-op reason
  - [ ] last tool calls
  - [ ] last worker prompt
  - [ ] last worker output
  - [ ] injected context packet
  - [ ] candidates
  - [ ] diary entries
  - [ ] memory slots/blocks
  - [ ] semantic recall/vector counts
  - [ ] graph counts/relations
- [ ] Add buttons:
  - [ ] Run Extraction
  - [ ] Run Beat
  - [ ] Run Consolidation
  - [ ] Run Compaction
  - [ ] Clear GRILLO Memory
  - [ ] Reset Chat Context

## Phase 8 - Backend/Electron Lifecycle

- [ ] Ensure Electron starts exactly one backend.
- [ ] Ensure frontend receives the backend URL/port correctly.
- [ ] If port is busy:
  - [ ] reuse only if it is our owned compatible backend
  - [ ] otherwise choose a new port and pass it to frontend
- [ ] Ensure app exit shuts down backend, GRILLO timers, TTS bridges, and sockets.
- [ ] Add packaged app smoke test for backend health and GRILLO status.
- [ ] Compile the EXE after each meaningful implementation slice.

## Phase 9 - Verification Gates

- [ ] Unit tests:
  - [ ] Ladybug GRILLO repository
  - [x] worker tools
  - [ ] context packet reduction
  - [ ] POML injection
  - [ ] Twitch intake filtering
- [ ] Integration tests:
  - [x] local chat -> extraction -> candidate/diary/slot
  - [ ] semantic recall -> context packet -> POML
  - [ ] manual beat -> trace visible in UI endpoint
  - [ ] stream mode does not ingest low-signal spam
- [ ] Runtime smoke:
  - [ ] backend health
  - [ ] memory status
  - [ ] graph summary
  - [ ] chat reply with injected GRILLO context
  - [ ] packaged EXE starts and exits cleanly
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
