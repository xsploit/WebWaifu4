# Web Waifu 4 Agent Grounding

This document exists to prevent wrong-repo drift.

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

## Wrong Repos

Do not do Web Waifu 4 work in these paths:

```text
C:\Users\SUBSECT\Documents\New project 3
C:\Users\SUBSECT\Documents\New project 3\YourWifey-Local-src
C:\Users\SUBSECT\Documents\GitHub\YourWifey-Local
```

Similar code is not enough. The target repo is `WebWaifu4`.

## Current Product Direction

Web Waifu 4 is local-first:

- no Supabase
- no Vercel dependency
- no hosted login
- no payment layer
- provider keys stay local/browser-supplied or local ENV on the user's machine
- local backend handles provider execution, WebSockets, TTS, memory, and runtime APIs

## Active Goal

Finish the Ladybug-backed memory system:

- Ladybug is the preferred backend memory database when the local backend is running.
- IndexedDB/local browser storage is fallback behavior.
- Semantic memory stores turns with embeddings and supports vector search.
- Grillo memory, reflective diary, emotion state, and relationship profiles persist and are inspectable.
- Memory worker writes must persist through the backend path.
- Prompt construction must inject useful memory context into POML.
- Clear/reset must clear Grillo, diary/emotion, relationship, and semantic memory for the active scope.

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
