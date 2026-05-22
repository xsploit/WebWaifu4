# Vercel + Supabase BYOK Deployment

Current as of 2026-05-15.

This fork is designed to run in two modes:

- Guest/local-only: no login, settings stay in the browser.
- Supabase cloud sync: OAuth login, profiles/workspaces/scenes/safe settings
  in Supabase, provider API keys still stay browser-local.

## 1. Create Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/20260515000100_byok_product_spine.sql` in the SQL
   editor or through the Supabase CLI.
3. Enable the OAuth providers you plan to expose, usually Google and/or GitHub,
   in Supabase Auth. Configure each provider with its OAuth client ID and
   secret first.
4. Set Supabase Auth URL Configuration for the hosted app:
   - Site URL: `https://your-domain.example`
   - Redirect URL: `https://your-domain.example/auth/callback`
   - local dev: `http://localhost:5173/auth/callback`
     Remove stale VPS or tunnel URLs from this config before production, or OAuth
     can bounce back to the wrong frontend after Google/GitHub login.
5. Create a storage bucket named `yourwifey-assets` if asset upload work is
   enabled later. The current BYOK MVP does not require uploads to use auth,
   sync, backups, or OBS overlay tokens.

## 2. Configure Vercel Env

Browser-visible:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_OAUTH_PROVIDERS
```

`VITE_SUPABASE_OAUTH_PROVIDERS` is optional. The app probes Supabase Auth
`/auth/v1/settings` in the browser and uses the live Google/GitHub provider
flags when Supabase is reachable. You can still set it to `google,github` as a
local fallback, but Supabase will reject a provider until that provider has a
client ID and secret configured in Supabase Auth.

Server-only:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
SUPABASE_JWT_SECRET
SUPABASE_STORAGE_BUCKET
OVERLAY_SIGNING_SECRET
```

Optional AI Gateway:

```text
AI_GATEWAY_API_KEY
```

`vercel-gateway-responses` uses `AI_GATEWAY_API_KEY`, Vercel's automatic
`VERCEL_OIDC_TOKEN`, or Vercel's `x-vercel-oidc-token` function request header
only as the backend credential for Vercel AI Gateway. For `openai/...` Gateway
models, the browser vault still supplies the user's local OpenAI key per request
through `providerOptions.gateway.byok.openai`, so the app does not upload or
store that provider key in Supabase. If no Gateway backend credential is
available, request-scoped Gateway BYOK fails closed with a configuration error
instead of treating an OpenAI key as a Vercel bearer token.

Legacy `VITE_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` names still work, but Supabase's new
publishable/secret key names are preferred. Use `.env.example` as the source of
truth for names. Never create `VITE_` variables for Supabase secret keys,
service-role keys, JWT, overlay-signing, OpenAI, Fish, Inworld, or Tavily
secrets.

## 3. Deploy Shape

Vercel build command:

```powershell
npm run build
```

Vercel output directory:

```text
dist
```

Serverless APIs live under:

```text
api/byok/*
```

`vercel.json` pins the build command, `dist` output directory, and SPA rewrites
for `/home`, `/login`, `/auth/callback`, `/account`, `/dashboard`, `/editor`,
and `/overlay/:sceneId`.

The local/VPS bot server still exists for streaming and power-user workflows,
but the BYOK account/cloud-sync path is Vercel-shaped.

## 4. Smoke Test

1. Open `/login`, click an enabled OAuth provider, and complete `/auth/callback`.
2. Open `/dashboard`; it should bootstrap a profile, one workspace, and one
   default scene.
3. Click `Sync settings`, then `Load cloud`.
4. Click `Export backup`; confirm the JSON contains safe settings only.
5. Click `Issue OBS URL`; open the generated `/overlay/:sceneId?token=...` URL
   in a private/incognito browser.
6. Confirm the overlay loads without dashboard chrome and does not require a
   Supabase account session.

## Security Notes

- Provider keys are local-only in v1.
- Cloud settings are filtered by `assertSettingCanSync`.
- Public OBS overlay config returns only `public-overlay` records.
- Service-role and signing secrets stay server-side.
- Relationship memory and chat history are not exported by scene backups.
