# On-Demand Staging

This document describes the owner-only staging environment for LineWatch TO.

Staging is production-like enough for week-long feature validation, but it is not production:

- It builds images from the current checkout on the development server.
- It uses a separate Compose project name.
- It uses separate Postgres, Redis, and Caddy volumes.
- It uses a separate `.env.staging` file.
- It can be exposed through Cloudflare Tunnel.
- It should be protected with Cloudflare Access before sharing beyond the owner.

Do not copy production secrets or production database dumps into staging.

## First-Time Setup

Create the staging env file:

```bash
cp .env.staging.example .env.staging
chmod 600 .env.staging
```

Edit `.env.staging`:

- Replace `POSTGRES_PASSWORD`.
- Set `LINEWATCH_STAGING_HOSTNAME` to the staging hostname.
- Set `LINEWATCH_STAGING_PUBLIC_ORIGIN` to `https://<staging-hostname>`.
- Update `LINEWATCH_AUTH_ALLOWED_ORIGINS` to the same public origin.
- Update `LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL` to the same public origin.
- Leave `LINEWATCH_PUSH_ENABLED=false` unless Web Push is being tested with separate staging VAPID keys.

## Cloudflare Tunnel

Recommended hostname:

```text
staging.linewatchto.ca
```

Create a named Cloudflare Tunnel and route the staging hostname to it using the Cloudflare dashboard or `cloudflared`.

The tunnel service inside Compose forwards to Caddy inside the staging Compose network:

```text
cloudflared -> caddy:8080 -> frontend:3000
                         -> backend:8080 for /api/*
```

Add the tunnel token to `.env.staging`:

```bash
LINEWATCH_CLOUDFLARED_TUNNEL_TOKEN=replace_with_cloudflare_tunnel_token
```

Protect the hostname with Cloudflare Access before sharing it with testers. A simple owner-only policy is enough for routine testing.

If Cloudflare Access blocks unauthenticated Node smoke checks, use the default local smoke check instead of the public hostname. The default smoke origin is:

```text
http://127.0.0.1:8090
```

## Start Staging

Run:

```bash
scripts/staging-up.sh
```

This command:

- validates Compose configuration;
- builds local backend, frontend, and PostGIS images;
- starts Postgres, Redis, backend, frontend, Caddy, and optionally cloudflared;
- waits for health checks;
- prints local and public URLs.

If `.env.staging` has no tunnel token, staging still starts locally at:

```text
http://127.0.0.1:8090
```

To force local-only staging even when a tunnel token exists:

```bash
LINEWATCH_STAGING_SKIP_TUNNEL=true scripts/staging-up.sh
```

## Smoke Check

Run:

```bash
scripts/staging-smoke.sh
```

By default this checks the local Caddy port so it works even when the public staging hostname is protected by Cloudflare Access.

To smoke-check the public hostname:

```bash
LINEWATCH_STAGING_SMOKE_ORIGIN=https://staging.linewatchto.ca scripts/staging-smoke.sh
```

## Routine Operations

Check containers:

```bash
scripts/staging-compose.sh ps
```

Read logs:

```bash
scripts/staging-compose.sh logs -f caddy frontend backend
```

Stop staging without deleting data:

```bash
scripts/staging-down.sh
```

Reset staging data and volumes:

```bash
LINEWATCH_STAGING_RESET_CONFIRM=reset-staging scripts/staging-reset.sh
```

The reset command deletes only volumes under the staging Compose project. It does not target the production Compose project or production volumes.

## Validation Checklist Before Production Deployment

Use staging to verify:

- `/api/health` returns `status: ok`.
- `/api/health/ingestion` reports whether dashboard data is fresh.
- `/api/health/schedule` reports schedule import and latest refresh status.
- Map overlays render and can be tapped/clicked.
- Station detail opens and arrival state is clearly source-labeled.
- Account register/login/logout works.
- Password reset dev link flow works when email is disabled.
- Saved commute creation and impact matching works.
- PWA install/update behavior works on a real phone when testing through HTTPS tunnel.
- Web Push works only if separate staging VAPID keys are configured and browser permission is granted.

Do not describe staging data as production data or official TTC data. LineWatch TO remains an unofficial dashboard using public source-linked data.
