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
   in Supabase Auth. Configure the OAuth app credentials in the provider and
   Supabase first.
4. Add the hosted app URL to Supabase Auth redirect URLs:
   - `https://your-domain.example/auth/callback`
   - local dev: `http://localhost:5173/auth/callback`
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

`VITE_SUPABASE_OAUTH_PROVIDERS` is a comma-separated allowlist for providers
that are already enabled in Supabase Auth, for example `google,github`. Leave it
empty until the provider is enabled; otherwise Supabase returns
`Unsupported provider: provider is not enabled`.

Server-only:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
SUPABASE_JWT_SECRET
SUPABASE_STORAGE_BUCKET
OVERLAY_SIGNING_SECRET
```

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
for `/login`, `/auth/callback`, `/account`, `/dashboard`, and
`/overlay/:sceneId`.

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
