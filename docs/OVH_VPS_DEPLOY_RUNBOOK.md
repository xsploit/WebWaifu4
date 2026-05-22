# OVH VPS Deploy Runbook

Archived for this BYOK fork.

Do not use this runbook for the hosted product. The canonical BYOK product
deployment is Vercel:

```text
https://yourwifey-byok.vercel.app
```

This document is retained only as historical reference for the old stream
runtime experiment.

Current as of 2026-05-16.

This file exists because the OVH VPS SSH key has been rediscovered more than
once. Use this first before trying generic SSH commands.

## VPS Identity

- Host: `148.113.191.103`
- User: `ubuntu`
- SSH key: `C:\Users\SUBSECT\.ssh\yourwifey_ovh_ed25519`
- Public URL: `https://148-113-191-103.sslip.io/`
- Remote app dir: `/home/ubuntu/yourwifey-stream`

Always pass the key explicitly:

```powershell
ssh -i $env:USERPROFILE\.ssh\yourwifey_ovh_ed25519 `
  -o IdentitiesOnly=yes `
  ubuntu@148.113.191.103
```

Do not rely on default `ssh ubuntu@148.113.191.103`; this Codex session may not
have an agent-loaded default identity.

## Remote Runtime Shape

The remote app directory is an uploaded runtime tree, not a git checkout.
`git pull` inside `/home/ubuntu/yourwifey-stream` is not the deploy path unless
the directory is intentionally converted into a repo later.

Current long-running processes:

- API/bot server: `node /home/ubuntu/yourwifey-stream/server/dist/index.js`
- Static overlay/API proxy: `node /home/ubuntu/yourwifey-stream/serve-dist.mjs`
- API port: `8787`
- Overlay port: `4173`
- Caddy serves the public HTTPS URL and proxies to the Node runtime.

Check remote state:

```powershell
ssh -i $env:USERPROFILE\.ssh\yourwifey_ovh_ed25519 `
  -o BatchMode=yes `
  -o IdentitiesOnly=yes `
  ubuntu@148.113.191.103 `
  "ps -eo pid,ppid,cmd | grep -E 'server/dist/index.js|serve-dist.mjs' | grep -v grep; curl -fsS http://127.0.0.1:8787/health"
```

## API-Only Deploy

Use this when the fix only touches `api/`, `api-dist/`, or BYOK serverless route
code compiled into `api-dist`.

1. Build locally:

```powershell
npm run build
```

2. Upload rebuilt `api-dist` and preserve a remote backup:

```powershell
$key = "$env:USERPROFILE\.ssh\yourwifey_ovh_ed25519"
$remote = "ubuntu@148.113.191.103"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

ssh -i $key -o BatchMode=yes -o IdentitiesOnly=yes $remote `
  "set -e; cd /home/ubuntu/yourwifey-stream; rm -rf .tmp/api-dist-upload; mkdir -p .tmp; if [ -d api-dist ]; then cp -a api-dist .tmp/api-dist-backup-$stamp; fi; mkdir -p .tmp/api-dist-upload"

scp -i $key -o BatchMode=yes -o IdentitiesOnly=yes -r api-dist\* `
  "${remote}:/home/ubuntu/yourwifey-stream/.tmp/api-dist-upload/"

ssh -i $key -o BatchMode=yes -o IdentitiesOnly=yes $remote `
  "set -e; cd /home/ubuntu/yourwifey-stream; rm -rf api-dist; mv .tmp/api-dist-upload api-dist"
```

3. Restart API process:

```powershell
ssh -i $env:USERPROFILE\.ssh\yourwifey_ovh_ed25519 `
  -o BatchMode=yes `
  -o IdentitiesOnly=yes `
  ubuntu@148.113.191.103 `
  'cd /home/ubuntu/yourwifey-stream; pkill -f "/home/ubuntu/yourwifey-stream/server/dist/index.js" || true; sleep 1; nohup node /home/ubuntu/yourwifey-stream/server/dist/index.js > /home/ubuntu/yourwifey-stream/.tmp/ai.log 2>&1 & echo $! > /home/ubuntu/yourwifey-stream/.tmp/ai.pid; sleep 3; ps -eo pid,cmd | grep -E "server/dist/index.js" | grep -v grep; curl -fsS http://127.0.0.1:8787/health'
```

If PowerShell tries to evaluate shell syntax, use single quotes around the
remote command, as shown above.

## Full Runtime Deploy

Use this when `dist`, `server/dist`, `serve-dist.mjs`, assets, or config-shaped
runtime files changed. Preserve `.env` and `node_modules` unless there is an
explicit reason not to.

Minimum safe shape:

1. Run `npm run build` locally.
2. Upload only the changed runtime directories/files.
3. Preserve remote `.env`.
4. Restart both Node processes:

```powershell
ssh -i $env:USERPROFILE\.ssh\yourwifey_ovh_ed25519 `
  -o BatchMode=yes `
  -o IdentitiesOnly=yes `
  ubuntu@148.113.191.103 `
  'cd /home/ubuntu/yourwifey-stream; pkill -f "/home/ubuntu/yourwifey-stream/server/dist/index.js" || true; pkill -f "/home/ubuntu/yourwifey-stream/serve-dist.mjs" || true; sleep 1; nohup node /home/ubuntu/yourwifey-stream/server/dist/index.js > /home/ubuntu/yourwifey-stream/.tmp/ai.log 2>&1 & echo $! > /home/ubuntu/yourwifey-stream/.tmp/ai.pid; nohup env OVERLAY_PORT=4173 node /home/ubuntu/yourwifey-stream/serve-dist.mjs > /home/ubuntu/yourwifey-stream/.tmp/overlay.log 2>&1 & echo $! > /home/ubuntu/yourwifey-stream/.tmp/overlay.pid; sleep 3; ps -eo pid,cmd | grep -E "server/dist/index.js|serve-dist.mjs" | grep -v grep; curl -fsS http://127.0.0.1:8787/health'
```

## Required Smoke Tests

Unauthenticated route should be alive:

```powershell
Invoke-WebRequest `
  -Uri "https://148-113-191-103.sslip.io/api/byok/profile" `
  -UseBasicParsing `
  -TimeoutSec 20 `
  -SkipHttpErrorCheck |
  Select-Object StatusCode, Content
```

Expected unauthenticated result: HTTP `401` with
`reason: "supabase-auth-required"`.

Authenticated BYOK smoke should create a temporary Supabase auth user, sign in,
call the public VPS `/api/byok/profile`, verify profile/workspace/scene
bootstrap, read the workspace, and delete the temporary user. Keep the smoke
script local or in `scripts/` if it becomes reusable; do not print tokens or key
values.

## Known 2026-05-16 Fix

The `e7785f2` fix changed compiled BYOK API behavior:

- `profiles.email` exists in the migration.
- default scene bootstrap sends `active_character_id: null`, not an empty
  string.

If the public authenticated smoke returns `Supabase did not return a default
scene`, the VPS is still running stale pre-`e7785f2` compiled API code.
