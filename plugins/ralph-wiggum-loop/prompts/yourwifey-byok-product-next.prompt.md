You are Codex running one bounded Ralph Wiggum loop iteration for the YourWifey BYOK product fork.

Worktree:
C:\Users\SUBSECT\Documents\GitHub\YourWifey-BYOK

Status docs:

- docs\BYOK_PRODUCT_STATUS.md
- docs\BYOK_PRODUCT_PLAN.md

Current lane:
Make the BYOK fork a real multi-user product without payments or managed credits. Users bring their own OpenAI/Fish/Inworld/Tavily keys. Local-only overlay mode must keep working without login.

Locked stack:

- Supabase Auth for login and social providers.
- Supabase Postgres for profiles, workspaces, scenes, characters, synced settings, memory metadata, and RLS.
- Supabase Storage for uploaded VRMs/backgrounds/animation packs at first.
- Vercel for hosted dashboard/overlay/API routes.
- No Stripe, no credit ledger, no managed provider credits in this fork.
- Provider API keys stay browser-local by default. Do not persist provider keys to cloud DB unless an explicit hosted encrypted vault design and tests are added later.

Hard constraints:

- Work only in the BYOK fork at the worktree above.
- Read docs\BYOK_PRODUCT_STATUS.md and docs\BYOK_PRODUCT_PLAN.md before editing.
- Check git status --short and git log -5 --oneline before editing.
- Keep changes narrow, coherent, and reversible.
- Do not install broad vendor SDKs before the contract/config layer is clear.
- Preserve existing OpenAI Responses, Twitch/local chat, TTS, animation, and local settings behavior.
- Update docs\BYOK_PRODUCT_STATUS.md with exact commands, decisions, implementation status, and next read.
- Run targeted tests, git diff --check, and npm run build when code changed.
- Commit and push only a coherent clean checkpoint.

Good next patches, in priority order:

1. Add Supabase client/server environment contracts and tests.
2. Add a minimal auth/account mode model that distinguishes guest local-only users from Supabase-authenticated cloud-sync users.
3. Add Supabase SQL migration/RLS files for profiles/workspaces/scenes/settings without wiring the UI yet.
4. Add route/ownership contract tests for future server APIs.
5. Add UI shell only after contracts and safety rules are verified.

Completion promise:
Print YOURWIFEY_BYOK_PRODUCT_READY only when all of these are true:

- Supabase Auth login/account shell exists and local-only mode still works.
- Supabase schema/RLS exists for profiles/workspaces/scenes/settings.
- Cloud sync stores only non-secret settings.
- Provider API keys stay browser-local by default.
- Scene import/export still omits secrets.
- Route ownership/security tests exist.
- npm run build passes.
- docs\BYOK_PRODUCT_STATUS.md documents final architecture and evidence.

If the lane is not complete, do not print the completion promise. Document the next smallest patch instead.
