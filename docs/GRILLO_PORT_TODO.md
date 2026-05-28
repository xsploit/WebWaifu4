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

Do this before broader worker work:

1. Finish native GRILLO visibility on existing `/memory/status` and `/memory/graph`.
2. Surface recent `TurnEvent`, `MemorySlot`, `MemorySlotPatch`, `GrilloActivity`, and `WorkerContextTrace` rows in the Memory/G.R.I.L.L.O. UI.
3. Add one focused backend test and one focused UI test for those surfaces.
4. Run focused tests, `npm run build`, and `git diff --check`.
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

## Phase 2 - Backend GRILLO Service

- [ ] Move GRILLO worker ownership to the backend.
- [ ] Add backend service lifecycle:
  - [ ] start with backend
  - [ ] stop on backend shutdown
  - [ ] no orphan timers
  - [ ] no second backend
- [ ] Implement worker state in Ladybug.
- [ ] Implement tick guard so only one GRILLO tick runs at a time.
- [ ] Implement tasks:
  - [ ] extraction
  - [ ] reflection beat
  - [ ] relationship beat
  - [ ] curiosity beat
  - [ ] tag elaboration beat
  - [ ] consolidation
  - [ ] semantic indexing
  - [ ] compaction
  - [ ] debrief/recovery
- [ ] Add run traces for every task.
- [ ] Add clear status for no-op runs.

## Phase 3 - Worker Tools

- [ ] Port/adapt core worker tools:
  - [ ] `core.worker_memory_read`
  - [ ] `core.worker_memory_search`
  - [ ] `core.worker_candidate_list`
  - [ ] `core.worker_candidate_write`
  - [ ] `core.worker_diary_write`
  - [ ] `core.worker_memory_write`
  - [ ] `core.worker_profile_patch`
  - [ ] `core.worker_memory_insert_archival`
  - [ ] emotion read/update tools if useful
- [ ] Make all tool writes go through Ladybug.
- [ ] Add tool-call telemetry:
  - [ ] name
  - [ ] args summary
  - [ ] result
  - [ ] duration
  - [ ] error
- [ ] Add debrief recovery for missing candidate/diary writes.
- [ ] Verify worker tools are separate from public chat tools.

## Phase 4 - Lanes And Providers

- [ ] Keep same provider infrastructure.
- [ ] Add/verify configurable lanes:
  - [ ] chat lane
  - [ ] GRILLO/reflection lane
  - [ ] embedding lane
- [ ] Let reflection lane choose its own provider/model.
- [ ] Let embedding lane choose browser local, local model, or provider-based when supported.
- [ ] Ensure memory-scoped requests do not expose normal public chat tools.
- [ ] Ensure OpenRouter and Vercel Gateway models work through the same lane shape.

## Phase 5 - Context Packet And POML

- [ ] Build canonical GRILLO context packet:
  - [ ] `background_information`
  - [ ] `channel_history`
  - [ ] `relationship_memory`
  - [ ] `recalled_memories`
  - [ ] `thoughts`
  - [ ] `output_description`
- [ ] Budget and reduce context before POML render.
- [ ] Inject the single GRILLO packet into POML.
- [ ] Remove duplicate old memory prompt inputs after packet is verified.
- [ ] Show exact injected packet in the UI.
- [ ] Add tests proving POML receives memory slots, diary thoughts, semantic recall, and relationship state.

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
  - [ ] enabled state
  - [ ] current mode
  - [ ] backend status
  - [ ] lane provider/model values
  - [ ] beat interval
  - [ ] turn cadence
  - [ ] last run
  - [ ] last beat type
  - [ ] last run reason/no-op reason
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
  - [ ] worker tools
  - [ ] context packet reduction
  - [ ] POML injection
  - [ ] Twitch intake filtering
- [ ] Integration tests:
  - [ ] local chat -> extraction -> candidate/diary/slot
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
