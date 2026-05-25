# Web Waifu 4 Agent Notes

This repo is a standalone Twitch-first stream overlay with a local/server AI backend.

- Authoritative repo path: `C:\Users\SUBSECT\Documents\GitHub\WebWaifu4`.
- Before edits, run `git rev-parse --show-toplevel` and confirm it prints the path above.
- Never implement Web Waifu 4 work in `C:\Users\SUBSECT\Documents\New project 3\YourWifey-Local-src`.
- If the shell or tool reports a different Git root, stop and relocate before editing.
- Keep commits small and push each coherent checkpoint to `origin/main`.
- Ignore unrelated untracked files unless the user explicitly asks to include them.
- Use `npm run build` for the full frontend, bot, and API build.
- Keep browser assets under `public/` or `public/cdn-assets/` and load them by normal URL/fetch paths.
- Do not add host SDK dependencies or platform-specific deploy tooling unless the user explicitly asks for that platform again.

## Active Memory/Ladybug Goal

The active implementation target is local-first memory backed by Ladybug:

- Ladybug is the preferred backend memory database when the local backend is available.
- IndexedDB/local browser storage is fallback behavior, not the final backend-first path.
- Semantic memory must store user/assistant turns with embeddings and support vector search.
- Grillo memory, reflective diary state, emotion state, and relationship profiles must be persisted and inspectable.
- The memory worker must be able to read/search/write through the backend path and feed useful memory into the POML prompt.
- Clear/reset actions must clear relationship, Grillo, diary/emotion, and semantic memory for the active scope.
- Every memory checkpoint needs focused tests plus `npm run build` before commit.
