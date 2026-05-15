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
- Clerk for auth.
- Postgres plus Drizzle for users/workspaces/scenes/settings/memory metadata.
- Optional realtime Node worker later for backend Twitch, long WebSocket TTS, and
  always-on stream jobs. Keep the existing local/VPS routelet for power users.
- Object storage later for uploaded VRMs/backgrounds/voice assets.

This checkpoint does not install Clerk, Drizzle, or Postgres dependencies. It
adds the contracts and security rules first so the next checkpoint can wire the
right DB/auth pieces without smearing keys through app state.

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

Initial tables once DB is added:

- `users`: Clerk subject and profile.
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

## Security Boundaries

- Public overlay gets signed scene tokens, not account cookies.
- Provider keys are never included in public overlay config.
- Synced settings reject API key fields.
- Server routes must check workspace ownership before reading scenes/settings.
- Local-only mode must keep working without login.
- Exported scene files must omit provider keys by default.

## Implementation Order

1. Add BYOK product contracts and tests. Done in this checkpoint.
2. Add local key-vault abstraction backed by IndexedDB/localStorage fallback.
3. Add scene import/export with secret omission tests.
4. Add Clerk auth shell and account state without blocking local-only mode.
5. Add Drizzle schema/migrations for users/workspaces/scenes/settings.
6. Add server route guards and ownership tests.
7. Add optional hosted encrypted vault only after a security review.
