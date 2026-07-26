# On-Demand Staging

This document describes the owner-only staging environment for LineWatchTO.

Staging is intended to be production-functional for owner testing, while remaining isolated from production:

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
- Configure staging-owned SMTP credentials if password-reset email should be exercised.
- Configure staging-owned VAPID keys if Web Push should be exercised.
- Leave Grafana and Cloudflare Web Analytics values blank unless observability or analytics are under test.

## Functional Parity Boundary

Staging should match production for app behavior: auth rate limits, password-reset mode, alert ingestion polling and freshness, scheduled-arrival refresh, TTC performance refresh, dashboard cache TTLs, and Web Push enablement/timing.

Staging may differ for environment identity and isolation: database name/user/password, hostname/origin, local port, Compose project, build label, Cloudflare tunnel token, `LINEWATCH_ENVIRONMENT`, observability host/project labels, SMTP secret, VAPID secrets, Grafana credentials, and Cloudflare Web Analytics token.

Check tracked env examples with:

```bash
scripts/check-env-functional-parity.sh
```

Check the local staging env against the production example with:

```bash
scripts/check-env-functional-parity.sh .env.production.example .env.staging
```

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
- derives the frontend app version from `frontend/package.json` unless `NEXT_PUBLIC_LINEWATCH_APP_VERSION` is explicitly set in the shell;
- derives the staging build label from the current Git SHA unless `LINEWATCH_STAGING_BUILD_LABEL` is explicitly set;
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

## Staging Monitoring

Observability is optional in staging and uses a separate compose profile `observability`.

To run observability in staging:
1. Populate Grafana Cloud variables in `.env.staging`.
2. Start the staging Alloy collector:
   ```bash
   scripts/staging-observability-up.sh
   ```
3. Stop the collector:
   ```bash
   scripts/staging-compose.sh stop alloy
   ```

Actuator endpoints run on private port `9090` and are blocked publicly at the edge. Verify public blocking:
```bash
curl -i http://127.0.0.1:8090/actuator/prometheus
# Expected: HTTP 404
```

## Validation Checklist Before Production Deployment

Use staging to verify:

- `/api/health` returns `status: ok`.
- `/api/health/ingestion` reports whether dashboard data is fresh.
- `/api/health/schedule` reports schedule import and latest refresh status.
- Map overlays render and can be tapped/clicked.
- Station detail opens and arrival state is clearly source-labeled.
- Account register/login/logout works.
- Password reset email flow works when staging SMTP credentials are configured.
- My Commutes creation and impact matching works.
- PWA install/update behavior works on a real phone when testing through HTTPS tunnel.
- Web Push works when staging VAPID keys are configured, browser permission is granted, and fresh dashboard-visible impacts exist.

Do not describe staging data as production data or official TTC data. LineWatchTO remains an unofficial dashboard using public source-linked data.
