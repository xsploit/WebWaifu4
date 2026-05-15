# YourWifey BYOK Product Plan

Current as of 2026-05-15.

This fork turns the Twitch-first overlay into a product-shaped app where users
can log in, save scenes/settings, and bring their own provider keys. No payments
or managed AI credits are in scope for this version.

## Product Shape

The product is a stream-ready AI VTuber assistant kit:

- Browser overlay for OBS, Shadow PC, local browser, or hosted overlay URL.
- Twitch chat intake with the existing local/direct mode still available.
- Login/account shell for saving scenes, characters, settings, and memory.
- BYO provider keys for OpenAI, Fish Speech, Inworld, Tavily, and future tools.
- Import/export for scenes so local-only users are not locked into cloud sync.

## Stack Decision

Recommended hosted stack:

- Vercel for the dashboard, overlay pages, and serverless API routes.
- Supabase Auth for login, social providers, and Twitch-capable identity.
- Supabase Postgres for users/workspaces/scenes/settings/memory metadata, with
  row-level security as the cloud authorization layer.
- Supabase Storage for uploaded VRMs/backgrounds/animation packs at first;
  external object storage can be added later if asset traffic grows.
- Optional realtime Node worker later for backend Twitch, long WebSocket TTS, and
  always-on stream jobs. Keep the existing local/VPS routelet for power users.

Clerk remains a possible future swap if polished auth UI becomes more important
than owning the auth/database coupling. Firebase is not the default because the
product data wants relational ownership, scoped memory, scene config, and
server-side route policies.

This checkpoint does not install Supabase dependencies. It locks the stack
decision, product contracts, Supabase environment contract, account-mode
contract, and initial Supabase SQL/RLS contract first so the next checkpoint can
add route ownership tests without smearing provider keys through app state.

## Supabase Environment Contract

Browser cloud-sync config:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Server cloud-sync/admin config:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for admin/server-only routes.
- `SUPABASE_JWT_SECRET` for future token verification.
- `SUPABASE_STORAGE_BUCKET`, defaulting to `yourwifey-assets`.

Absent browser config keeps cloud sync disabled and local-only overlay mode
available. Partial or insecure config is treated as misconfigured. Service-role
and JWT secrets must never be projected into browser/public config.

## Key Storage Policy

Default mode: `local-indexeddb`.

- Provider API keys stay in browser storage and never sync to the database.
- Cloud sync stores non-secret settings only.
- The backend can still proxy calls when the local browser sends the key for
  that request, but the server must not persist it.

Optional future mode: `hosted-encrypted-vault`.

- User keys are encrypted server-side and never returned to the browser.
- Backend provider proxy uses decrypted keys only in memory for one request.
- Requires a stronger security pass before shipping.

## Data Model

Initial migration tables:

- `profiles`: Supabase auth user id and product profile.
- `workspaces`: owner, storage mode, key mode.
- `workspace_members`: future team support.
- `scenes`: Twitch channel, overlay config, active character.
- `characters`: persona, VRM, background, TTS voice.
- `synced_settings`: non-secret settings by workspace/scene/character.
- `provider_secret_descriptors`: redacted key metadata only.
- `overlay_tokens`: signed short-lived overlay sessions and revocation.
- `memory_entries`: relationship/semantic/diary metadata scoped by user/scene.
- `assets`: uploaded VRMs/backgrounds/animation packs.

No `credit_ledger`, `stripe_events`, or payments in this BYOK fork.

Cloud database rows are cloud-sync rows. Guest local-only mode stays outside
Supabase and continues to use browser/local storage. The first migration keeps
`provider_key_mode` pinned to `local-indexeddb`; a hosted encrypted vault must
arrive as a later migration with a specific security design and tests.

## Security Boundaries

- Public overlay gets signed scene tokens, not account cookies.
- Provider keys are never included in public overlay config.
- Synced settings reject API key fields.
- Server routes must check workspace ownership before reading scenes/settings.
- Supabase RLS must enforce the same ownership checks for cloud tables.
- Supabase service-role keys are server-only and never exposed to the browser.
- Local-only mode must keep working without login.
- Exported scene files must omit provider keys by default.

## Implementation Order

1. Add BYOK product contracts and tests. Done in this checkpoint.
2. Add local key-vault abstraction backed by browser storage. Done in the
   second checkpoint.
3. Add scene import/export with secret omission tests. Done in the third
   checkpoint.
4. Lock Supabase Auth/Postgres as the BYOK stack. Done in the fourth checkpoint.
5. Add Supabase client/server environment contracts. Done in the fifth
   checkpoint without installing SDKs or blocking local-only mode.
6. Add a minimal auth/account mode model that distinguishes guest local-only
   users from Supabase-authenticated cloud-sync users. Done in the sixth
   checkpoint as a contract-only resolver with no Supabase SDK dependency or UI
   wiring.
7. Add Supabase SQL migrations/RLS for profiles/workspaces/scenes/settings.
   Done in the seventh checkpoint as a migration plus static contract tests.
8. Add server route guards and ownership tests.
9. Add optional hosted encrypted vault only after a security review.
