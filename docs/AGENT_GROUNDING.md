# Web Waifu 4 Agent Grounding

This document is mandatory working context for Codex/Claude/agent sessions.
It exists to prevent wrong-repo drift, scope drift, and accidental regression of
the local-first Web Waifu 4 runtime.

If you are resuming after compaction, a crash, a tool reset, or a new thread,
read this file before touching code.

## Authoritative Repo

Only work in:

```text
C:\Users\SUBSECT\Documents\GitHub\WebWaifu4
```

Before any read/edit/test/commit checkpoint, run:

```powershell
git rev-parse --show-toplevel
git status --short --branch
```

The root must be:

```text
C:/Users/SUBSECT/Documents/GitHub/WebWaifu4
```

If it is anything else, stop and correct the cwd first.

Do not "continue from memory" while standing in the wrong Git root. Similar
files are not proof that the target is correct.

## Wrong Repos

Do not do Web Waifu 4 work in these paths:

```text
C:\Users\SUBSECT\Documents\New project 3
C:\Users\SUBSECT\Documents\New project 3\YourWifey-Local-src
C:\Users\SUBSECT\Documents\GitHub\YourWifey-Local
```

Similar code is not enough. The target repo is `WebWaifu4`.

If work was accidentally done in a wrong repo:

1. Stop all edits there.
2. Do not commit or push from that repo.
3. Inspect the diff only to identify whether anything valuable must be ported.
4. Re-apply the minimum useful patch in `WebWaifu4`.
5. Record the mistake in the user-facing status before continuing.

## Current Product Direction

Web Waifu 4 is local-first:

- no Supabase
- no Vercel dependency
- no hosted login
- no payment layer
- provider keys stay local/browser-supplied or local ENV on the user's machine
- local backend handles provider execution, WebSockets, TTS, memory, and runtime APIs

This is not the BYOK cloud fork. Do not add back Supabase/Vercel/Auth/product
shell work unless explicitly requested for a separate repo.

## Active Goal

Finish the Ladybug-backed memory system:

- Ladybug is the preferred backend memory database when the local backend is running.
- IndexedDB/local browser storage is fallback behavior.
- Semantic memory stores turns with embeddings and supports vector search.
- Grillo memory, reflective diary, emotion state, and relationship profiles persist and are inspectable.
- Memory worker writes must persist through the backend path.
- Prompt construction must inject useful memory context into POML.
- Clear/reset must clear Grillo, diary/emotion, relationship, and semantic memory for the active scope.

Do not mark the memory goal complete until a requirement-by-requirement audit
proves:

- local and Twitch chat turns both reach the memory worker cadence
- semantic records persist with embeddings when an embedding provider is configured
- vector search returns useful memories for prompt context
- relationship facts, diary/reflection, emotion state, and memory blocks are persisted
- the frontend can inspect the backend memory state
- reset/clear removes every memory class for the active scope
- focused tests and `npm run build` pass

## Checkpoint Rules

For each coherent patch:

1. Confirm repo root.
2. Inspect git status.
3. Make the narrowest patch.
4. Run focused tests.
5. Run `npm run build`.
6. Run `git diff --check`.
7. Commit only intended files.
8. Push to `origin/main`.

Ignore unrelated untracked files unless the user explicitly asks to include them.

## Do Not Drift

- Do not change Fish TTS/WebSocket streaming while working on memory/database
  unless a failing test proves the memory change requires it.
- Do not switch providers, routing modes, or frontend key handling as part of a
  memory checkpoint.
- Do not create new architecture if the existing module already has the concept.
- Do not chase UI polish, Electron packaging, hosted deploys, or cloud auth while
  the active checkpoint is memory/database.
- Do not report "done" without the exact tests/build that prove it.

## Current Known Local State

Unrelated untracked files may exist:

```text
docs/MARLIN_SIDECAR.md
release-video/
server/src/marlin/
```

Ignore them unless the user explicitly asks to include or clean them.
