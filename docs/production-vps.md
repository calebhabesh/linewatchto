# Production VPS Server Configuration

This file documents the hosting configuration for the **LineWatchTO** production server.

Do not commit passwords, SMTP credentials, VAPID private keys, or WireGuard private keys. Store application secrets in `.env.production` on the VPS and keep that file out of Git.

## Hardware And Operating System

- Cloud provider: Oracle Cloud Infrastructure Always Free Tier with PAYG account.
- Instance shape: `VM.Standard.A1.Flex` ARM64 Ampere.
- Compute: 4 OCPUs and 24 GB RAM.
- Boot volume: 100 GB.
- Operating system: Ubuntu 24.04 LTS aarch64.

## Host-Managed Services

The host manages:

- Docker Engine and the Docker Compose plugin.
- WireGuard.
- OCI ingress rules.
- Host firewall rules.
- The repository checkout, server-local `.env.production`, and generated `.env.release`.
- Persistent Docker volumes and Caddy data.

WireGuard stays outside Compose because it protects access to Docker and the host itself.

## Public Network

OCI ingress and the host firewall should allow:

- TCP `80` for Caddy HTTP redirects and certificate issuance.
- TCP `443` for the app and API.
- UDP `51820` for WireGuard.

Keep public TCP `22` only until WireGuard SSH has been verified after a VPS reboot. Then remove public SSH ingress.

Suggested host firewall rules include:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 51820/udp
sudo ufw allow in on wg0 to any port 22 proto tcp
```

Review existing SSH access before enabling or reloading the firewall.

## WireGuard

- Hub IP: `10.0.0.1`.
- Address range: `10.0.0.0/24`.
- Config path: `/etc/wireguard/wg0.conf`.
- SSH command: `ssh ubuntu@10.0.0.1`.

Verify WireGuard starts automatically:

```bash
sudo systemctl enable --now wg-quick@wg0
sudo systemctl status wg-quick@wg0
```

## Production Compose Stack

Compose services:

- `caddy`: public reverse proxy and automatic TLS.
- `frontend`: Next.js standalone server on the private Compose network.
- `backend`: Spring Boot API on the private Compose network.
- `postgres`: PostgreSQL 17 with PostGIS on a persistent volume.
- `redis`: Redis 7 with append-only persistence on a persistent volume.

Production Compose sets memory ceilings for the always-on services so a leak or runaway query cannot consume the full 24 GB host. Current caps are:

```text
postgres: 8 GB
backend: 6 GB
frontend: 1 GB
redis: 1 GB
caddy: 512 MB
alloy: 512 MB, only when the observability profile is enabled
```

The backend JVM heap remains capped separately by `JAVA_TOOL_OPTIONS=-Xmx4g`; the backend container limit includes JVM native memory, metaspace, thread stacks, and process overhead. The caps intentionally leave several GB for Ubuntu, Docker, kernel memory, filesystem cache, WireGuard, deploys, backups, and temporary burst overhead.

Production application images are built on the development server, published as ARM64 GHCR images, and selected on the VPS through `.env.release`. The VPS never runs `docker compose build` or `up --build`.

The production PostGIS image is built from `infra/postgres/Dockerfile`, which extends the official multi-architecture `postgres:17-bookworm` image. The official `postgis/postgis` image used for local development does not publish an ARM64 manifest for the selected tag.

Only Caddy publishes host ports.

## Domains

- `linewatchto.ca` routes to the frontend.
- `www.linewatchto.ca` routes to the frontend.
- `linewatchto.ca/api/*` routes to the backend.
- `www.linewatchto.ca/api/*` routes to the backend.
- `api.linewatchto.ca/*` routes to the backend.

Create `A` records for the three hostnames pointing to the VPS public IP. When using Cloudflare, begin with DNS-only records while checking Caddy certificate issuance.

## Persistent Volumes

Production data uses canonical external Docker volume names so it remains independent of the
Compose project lifecycle and cannot be removed by `docker compose down --volumes`:

- `linewatchto_postgres_prod_data`
- `linewatchto_redis_prod_data`
- `linewatchto_caddy_data`
- `linewatchto_caddy_config`
- `linewatchto_alloy_prod_data`

Initialize them once on a new production host before the first deployment:

```bash
scripts/prod-init-volumes.sh
```

The command is idempotent and preserves every existing volume. Routine deployments deliberately
do not create missing external volumes: an unexpectedly missing production volume must stop the
deployment rather than silently initialize an empty database or certificate store.

## Server-Local Files

- Recommended checkout: `/home/ubuntu/ttc-reliability-navigator`.
- Production env: `.env.production` in the checkout.
- Production env template: `.env.production.example`.
- Release env: `.env.release` in the checkout, written by `scripts/prod-deploy.sh` after a healthy deployment.
- Release env template: `.env.release.example`.
- Caddy config: `Caddyfile`, mounted read-only into Caddy.

Prepare the env file:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Replace the example `POSTGRES_PASSWORD`. Compose passes that value to both PostgreSQL and the backend. Configure SMTP and VAPID secrets only when those features are intentionally enabled.

## Release Responsibilities

The development server owns:

- Docker Buildx and GHCR write authentication.
- ARM64 image builds for `frontend`, `backend`, and `postgres`.
- Publishing immutable tags under one full Git SHA.
- Anonymous registry verification before the VPS deploys.

The VPS owns:

- Docker Compose runtime only.
- `.env.production`, `.env.release`, Docker volumes, Caddy data, and WireGuard access.
- Pulling published images, health-gated startup, backups, logs, and rollback.

One-time GHCR login on the development server:

```bash
export CR_PAT=your_write_packages_token
printf '%s' "$CR_PAT" | docker login ghcr.io -u calebhabesh --password-stdin
unset CR_PAT
```

Build and publish from a clean development-server checkout:

```bash
scripts/prod-build-push.sh
```

The first command-line push creates private GHCR packages. Link `linewatch-frontend`, `linewatch-backend`, and `linewatch-postgres` to this repository, make them public, then verify anonymous reads:

```bash
docker logout ghcr.io
docker pull ghcr.io/calebhabesh/linewatch-frontend:<full-git-sha>
docker pull ghcr.io/calebhabesh/linewatch-backend:<full-git-sha>
docker pull ghcr.io/calebhabesh/linewatch-postgres:<full-git-sha>
```

## Common Commands

Validate configuration:

```bash
scripts/prod-compose.sh config
```

First deployment:

```bash
git pull --ff-only
scripts/prod-deploy.sh <full-git-sha>
```

Once the candidate stack is healthy and the release file has been promoted, deployment prunes Docker images that are not referenced by any container. This keeps immutable release tags from accumulating on the boot volume without touching running images or persistent volumes. Rollback can pull an uncached public GHCR image again. Temporarily set `LINEWATCH_DEPLOY_PRUNE_IMAGES=false` to skip this cleanup while troubleshooting.

Routine deployment after the first database exists:

```bash
git pull --ff-only
scripts/prod-backup-postgres.sh
scripts/prod-deploy.sh <full-git-sha>
```

Check state:

```bash
scripts/prod-compose.sh ps
```

Read logs:

```bash
scripts/prod-compose.sh logs -f caddy frontend backend
```

Rollback to a previous image set:

```bash
scripts/prod-deploy.sh <previous-full-git-sha>
```

Flyway migrations are not automatically reversed. Review schema compatibility before rolling back across database changes, or restore a known-good database backup.

Run health checks:

```bash
curl https://linewatchto.ca/api/health
curl https://api.linewatchto.ca/api/health
curl https://api.linewatchto.ca/api/health/ingestion
curl https://api.linewatchto.ca/api/health/schedule
curl https://api.linewatchto.ca/api/health/regional-ingestion
```

Create a database backup:

```bash
scripts/prod-backup-postgres.sh
```

Restore a database backup:

```bash
gzip -dc tmp/prod-backups/linewatch-postgres-YYYYMMDDTHHMMSSZ.sql.gz | \
  scripts/prod-compose.sh exec -T postgres \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

## Monitoring & Observability

Observability is optional and runs in a separate compose profile `observability`. 

Ensure your `.env.production` has the Grafana Cloud tokens and configurations populated as described in [docs/observability.md](file://~/dev/ttc-reliability-navigator/docs/observability.md).

Start the Grafana Alloy collector:
```bash
scripts/prod-observability-up.sh
```

Stop the collector:
```bash
scripts/prod-compose.sh stop alloy
```

Actuator endpoints run on private port `9090` inside the Docker bridge network and are blocked at the public edge by Caddy. Verify public blocking:
```bash
curl -i https://api.linewatchto.ca/actuator/prometheus
# Expected: HTTP 404
```

## Deployment Verification

After DNS and TLS are active:

```bash
LINEWATCH_DEPLOY_FRONTEND_URL=https://linewatchto.ca \
LINEWATCH_DEPLOY_BACKEND_URL=https://api.linewatchto.ca \
node scripts/smoke-deploy.mjs
```

Do not describe TTC dashboard data as live unless `/api/health/ingestion` reports a fresh successful ingestion run. Do not describe GO/UP dashboard data as live unless Metrolinx polling is configured and `/api/health/regional-ingestion` reports a fresh successful run. Store `LINEWATCH_INGESTION_METROLINX_API_KEY` only in the server-local `.env.production`; never add it to frontend variables or Git.
