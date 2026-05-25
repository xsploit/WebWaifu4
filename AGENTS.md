# Web Waifu 4 Agent Notes

This repo is a standalone Twitch-first stream overlay with a local/server AI backend.

## Grounding Rules

- Authoritative repo path: `C:\Users\SUBSECT\Documents\GitHub\WebWaifu4`.
- Read `docs\AGENT_GROUNDING.md` before continuing long-running work.
- Before edits, run `git rev-parse --show-toplevel` and confirm it prints the path above.
- Never implement Web Waifu 4 work in `C:\Users\SUBSECT\Documents\New project 3`, `C:\Users\SUBSECT\Documents\New project 3\YourWifey-Local-src`, or any copied source folder.
- If the shell or tool reports a different Git root, stop immediately. Do not inspect, edit, test, commit, or "continue from memory" until the cwd is corrected.
- If a tool is pinned to a different workspace root, do not use that tool for repo reads/writes. Use PowerShell in the authoritative repo path instead.
- Keep a short status note when correcting cwd mistakes so the next agent does not inherit stale assumptions.
- Keep commits small and push each coherent checkpoint to `origin/main`.
- Ignore unrelated untracked files unless the user explicitly asks to include them.
- Use `npm run build` for the full frontend, bot, and API build.
- Keep browser assets under `public/` or `public/cdn-assets/` and load them by normal URL/fetch paths.
- Do not add host SDK dependencies or platform-specific deploy tooling unless the user explicitly asks for that platform again.

## Checkpoint Rules

For every coherent code checkpoint:

1. Confirm repo root with `git rev-parse --show-toplevel`.
2. Inspect `git status --short --branch`.
3. Make the narrowest patch that advances the active goal.
4. Run focused tests for touched code.
5. Run `npm run build`.
6. Run `git diff --check`.
7. Commit only the intended files.
8. Push to `origin/main`.

## Active Memory/Ladybug Goal

The active implementation target is local-first memory backed by Ladybug:

- Ladybug is the preferred backend memory database when the local backend is available.
- IndexedDB/local browser storage is fallback behavior, not the final backend-first path.
- Semantic memory must store user/assistant turns with embeddings and support vector search.
- Grillo memory, reflective diary state, emotion state, and relationship profiles must be persisted and inspectable.
- The memory worker must be able to read/search/write through the backend path and feed useful memory into the POML prompt.
- Clear/reset actions must clear relationship, Grillo, diary/emotion, and semantic memory for the active scope.
- Every memory checkpoint needs focused tests plus `npm run build` before commit.

## Current Non-Goals

- Do not reintroduce Supabase, Vercel, hosted login, cloud sync, or payment work into this local-first repo.
- Do not move provider execution into unrelated frontend-only paths unless explicitly requested.
- Do not change Fish TTS/WebSocket streaming while doing memory/database work unless a memory change directly requires it.
