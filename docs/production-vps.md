# Production VPS Server Configuration

This file documents the hosting configuration for the **LineWatch TO** production server.

Do not commit passwords, SMTP credentials, VAPID private keys, or WireGuard private keys. Store application secrets in `.env.production` on the VPS and keep that file out of Git.

## Hardware And Operating System

- Cloud provider: Oracle Cloud Infrastructure Always Free Tier with PAYG account.
- Instance shape: `VM.Standard.A1.Flex` ARM64 Ampere.
- Compute: 2 OCPUs and 12 GB RAM.
- Boot volume: 100 GB.
- Operating system: Ubuntu 24.04 LTS aarch64.

## Host-Managed Services

The host manages:

- Docker Engine and the Docker Compose plugin.
- WireGuard.
- OCI ingress rules.
- Host firewall rules.
- The repository checkout and server-local `.env.production`.

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

PostGIS is built from `infra/postgres/Dockerfile`, which extends the official multi-architecture `postgres:17-bookworm` image. The official `postgis/postgis` image used for local development does not publish an ARM64 manifest for the selected tag.

Only Caddy publishes host ports.

## Domains

- `linewatchto.ca` routes to the frontend.
- `www.linewatchto.ca` routes to the frontend.
- `linewatchto.ca/api/*` routes to the backend.
- `www.linewatchto.ca/api/*` routes to the backend.
- `api.linewatchto.ca/*` routes to the backend.

Create `A` records for the three hostnames pointing to the VPS public IP. When using Cloudflare, begin with DNS-only records while checking Caddy certificate issuance.

## Persistent Volumes

- `postgres_prod_data`
- `redis_prod_data`
- `caddy_data`
- `caddy_config`

## Server-Local Files

- Recommended checkout: `/home/ubuntu/ttc-reliability-navigator`.
- Production env: `.env.production` in the checkout.
- Production env template: `.env.production.example`.
- Caddy config: `Caddyfile`, mounted read-only into Caddy.

Prepare the env file:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Replace the example `POSTGRES_PASSWORD`. Compose passes that value to both PostgreSQL and the backend. Configure SMTP and VAPID secrets only when those features are intentionally enabled.

## Common Commands

Validate configuration:

```bash
LINEWATCH_PROD_ENV_FILE=.env.production \
  docker compose --env-file .env.production -f docker-compose.prod.yml config
```

Start or update:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Check state:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Read logs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f caddy frontend backend
```

Run health checks:

```bash
curl https://linewatchto.ca/api/health
curl https://api.linewatchto.ca/api/health
curl https://api.linewatchto.ca/api/health/ingestion
curl https://api.linewatchto.ca/api/health/schedule
```

Create a database backup:

```bash
scripts/prod-backup-postgres.sh
```

Restore a database backup:

```bash
gzip -dc tmp/prod-backups/linewatch-postgres-YYYYMMDDTHHMMSSZ.sql.gz | \
  docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

## Deployment Verification

After DNS and TLS are active:

```bash
LINEWATCH_DEPLOY_FRONTEND_URL=https://linewatchto.ca \
LINEWATCH_DEPLOY_BACKEND_URL=https://api.linewatchto.ca \
node scripts/smoke-deploy.mjs
```

Do not describe the dashboard as live unless `/api/health/ingestion` reports a fresh successful ingestion run.
