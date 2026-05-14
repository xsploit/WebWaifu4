You are Codex running one bounded Ralph Wiggum loop iteration for the YourWifey Stream commercial-production lane.

Worktree:
C:\Users\SUBSECT\Documents\Codex\2026-05-04\https-github-com-prismml-eng-bonsai\yourwifey-stream

Status docs:
- README.md
- docs\PRODUCTIZATION_RALPH_STATUS.md
- docs\grillo-memory-status.md

Current lane:
Prepare the app to become a paid product: user login, projects/scenes, paid credits, usage accounting for OpenAI/Fish/Inworld/Tavily, protected settings, signed overlay tokens, admin controls, and production deployment boundaries.

Default stack direction:
- Clerk for auth.
- Stripe Checkout, Customer Portal, and signed webhooks for billing.
- Postgres with Drizzle unless repo evidence points elsewhere.
- Append-only credit ledger plus usage_events, not only a mutable balance.
- Signed overlay tokens for public stream pages.

Hard constraints:

- Work only in the YourWifey Stream repo.
- Read README.md and docs\PRODUCTIZATION_RALPH_STATUS.md before editing.
- Check git status --short and git log -3 --oneline before editing.
- Do not blindly install Clerk, Stripe, Postgres, or ORM dependencies before writing the first concrete architecture checkpoint.
- First implementation slice must be thin and reversible: schema/config/contracts/tests before broad UI rewrites.
- Keep existing local/dev overlay flow working.
- Keep OpenAI Responses as the primary AI path.
- Keep Twitch/local ChatTurn semantics intact.
- Design credit debits around actual provider calls: OpenAI, Fish Speech, Inworld, Tavily, and future tools.
- Include webhook idempotency, auth boundary tests, and usage ledger tests before claiming production readiness.
- Update docs\PRODUCTIZATION_RALPH_STATUS.md with exact commands, decisions, implementation status, and next read.
- Commit only coherent checkpoints.

Good next patches:

- Add a commercial architecture section with concrete tables, env vars, route boundaries, and migration plan.
- Add typed interfaces for users/projects/scenes/provider settings/usage events/credit ledger without wiring vendor SDKs yet.
- Add env examples for future Clerk/Stripe/Postgres config.
- Add tests for credit math or usage normalization if interfaces already exist.
- Identify which settings are per-user, per-project, per-scene, per-character, or global.

Completion promise:
Print YOURWIFEY_COMMERCIAL_READY only when all of these are true:

- Auth, billing, DB, credits, tenancy, overlay tokens, quotas, and admin surfaces are implemented or explicitly staged with verified code checkpoints.
- Usage accounting covers OpenAI, Fish Speech, Inworld, Tavily/tools, and future provider costs.
- User/project/scene ownership protects settings and provider secrets.
- Stripe webhook idempotency and credit ledger tests exist.
- Existing local stream workflow still works.
- npm run build passes.
- docs\PRODUCTIZATION_RALPH_STATUS.md documents final architecture and evidence.

If the lane is not complete, do not print the completion promise. Document the next smallest patch instead.
