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

Production application images are built by the successful `main` CI run on a native ARM64 GitHub runner and published to GHCR. The CI run records each image's registry digest. The manual GitHub Actions deployment button selects those exact digests through `.env.release`; the VPS never runs `docker compose build` or `up --build`.

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

- Production checkout: `/home/ubuntu/apps/linewatchto`.
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

GitHub Actions CI owns:

- Backend and frontend validation before publication.
- Native ARM64 builds for `frontend`, `backend`, and `postgres` after both CI jobs pass on a `main` push.
- GHCR publication under the full Git SHA using the workflow's `GITHUB_TOKEN`.
- A per-run `release-images-<full-git-sha>` artifact recording the exact image digests.
- A startup check against the published frontend image, then digest and revision verification before deployment.

The VPS owns:

- Docker Compose runtime only.
- `.env.production`, `.env.release`, Docker volumes, Caddy data, and WireGuard access.
- Pulling published images, health-gated startup, backups, logs, and rollback.

For the existing `linewatch-frontend`, `linewatch-backend`, and `linewatch-postgres` GHCR packages, grant this repository **Actions write access** to each package if they were first published with a personal access token. The CI `publish` job uses `packages: write` and `GITHUB_TOKEN`; it does not need a stored GHCR token. Keep these packages public so the VPS can pull without registry credentials. See [GitHub's package access settings](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility#ensuring-workflow-access-to-your-package).

The frontend image's public build settings come from **repository Actions variables** (not the VPS runtime env file). Set any values you currently supply to `prod-build-push.sh`:

| Optional repository variable | Default when unset |
| --- | --- |
| `NEXT_PUBLIC_LINEWATCH_SUPPORT_URL` | `https://ko-fi.com/linewatchto` |
| `NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS` | `30000` |
| `NEXT_PUBLIC_LINEWATCH_TRAIN_MARKER_REFRESH_MS` | `4000` |
| `NEXT_PUBLIC_LINEWATCH_GOOGLE_SITE_VERIFICATION` | Empty |
| `NEXT_PUBLIC_LINEWATCH_BING_SITE_VERIFICATION` | Empty |

These values are compiled into the public frontend image. Change one by changing the variable and pushing a new commit; existing SHA images are reused on reruns, so a variable change alone does not replace an existing release.

The local builder remains as an emergency fallback. It reuses an existing SHA tag rather than replacing it. To deliberately rebuild an existing tag, set `LINEWATCH_ALLOW_IMAGE_OVERWRITE=true`; doing so can change what that tag points to, so use a new commit for normal releases. If manual GHCR authentication is needed on the development server:

```bash
export CR_PAT=your_write_packages_token
printf '%s' "$CR_PAT" | docker login ghcr.io -u calebhabesh --password-stdin
unset CR_PAT
```

Build and publish from a clean development-server checkout only for the manual fallback:

```bash
scripts/prod-build-push.sh
```

If a GHCR package is newly created as private, make it public before VPS deployment. Verify anonymous reads for all three images:

```bash
docker logout ghcr.io
docker pull ghcr.io/calebhabesh/linewatch-frontend:<full-git-sha>
docker pull ghcr.io/calebhabesh/linewatch-backend:<full-git-sha>
docker pull ghcr.io/calebhabesh/linewatch-postgres:<full-git-sha>
```

## Common Commands

### Deploy through GitHub Actions

1. Push the commit to `main` and wait for the **CI** workflow to pass.
2. CI builds and publishes the three ARM64 images under that full SHA, checks the frontend image, and saves their digests in the run's release artifact.
3. In GitHub, open **Actions → Deploy Production → Run workflow**, select `main`, and leave `sha` blank to deploy the selected main commit. Enter a previous full SHA to redeploy an older release.

The deploy workflow checks the latest main-push CI result for that SHA, downloads its digest artifact, and verifies all three images still exist for the selected commit. It then connects to the VPS, locks the release, fetches the commit, runs `prod-backup-postgres.sh`, checks out the commit, and runs `prod-deploy.sh` with the pinned digests. GitHub Actions executes the public HTTP smoke check afterward. A failed backup stops before checkout and deployment. The workflow fails if the public smoke check fails; it does not automatically roll back after the release file has been promoted.

For commits made **before** CI image publication, the deploy workflow can verify and recover digests from the older SHA tags, but the older checkout's Compose configuration deploys by tag. Digest-pinned deployment applies to releases containing the new Compose and deployment scripts. For CI-built commits, a missing or expired release artifact stops deployment by default. In a recovery case, select **Recover digests from SHA tags** on the button; this verifies the image revision labels and pins the current tag digests, but cannot prove they are the same digests originally recorded by CI. GitHub Actions artifacts have a configurable retention period; retain the artifact for the rollback window you need. [GitHub artifact retention](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)

Create a GitHub Environment named `production` and add these **environment secrets**:

| Name | Value |
| --- | --- |
| `VPS_HOST` | SSH host; use `10.0.0.1` when connecting over WireGuard. |
| `VPS_USER` | SSH user with access to the production checkout and Docker, currently `ubuntu`. |
| `VPS_SSH_KEY` | Private key for a dedicated deploy SSH key whose public key is authorized on the VPS. |
| `VPS_SSH_KNOWN_HOSTS` | Pinned SSH host key entry for `VPS_HOST`; verify the fingerprint through an existing trusted connection before storing it. |
| `VPS_WIREGUARD_CONFIG` | Full client `wg0.conf` for a **dedicated Actions peer**, if SSH is private to WireGuard. Add its public key as a new peer on the VPS first. Omit only when the runner has another authorized SSH route. |

Optional `production` environment **variables** are `VPS_SSH_PORT` (default `22`) and `VPS_DEPLOY_PATH` (default `/home/ubuntu/apps/linewatchto`). Keep `.env.production`, `.env.release`, provider credentials, and persistent volumes on the VPS; they are not Actions secrets. If using WireGuard, the runner config should route only the VPS tunnel address through the peer (for example `AllowedIPs = 10.0.0.1/32`), and the VPS must allow that dedicated peer to reach SSH. Do not open public SSH solely for this workflow. GitHub's [WireGuard runner guide](https://docs.github.com/en/actions/how-tos/manage-runners/github-hosted-runners/connect-to-a-private-network/connect-with-wireguard) describes the peer setup.

The production checkout needs a working `origin` fetch and must have no tracked local changes. Actions leaves it detached at the deployed SHA. The new workflow file and scripts must be pushed to `main` before the button appears. No production credentials or WireGuard keys belong in Git.

The current backup script keeps only the latest verified local dump, deleting the prior dump after a successful new backup. Arrange separate retained/off-host backups before relying on this as your only restore point. A failed dump preserves the previous one. `.env.release` records the deployed SHA and exact image digests; old GHCR versions can be pulled again after local Docker image pruning, provided they have not been deleted from GHCR. Rollback across Flyway migrations still requires schema compatibility review.

### Manual fallback

Validate configuration:

```bash
scripts/prod-compose.sh config
```

First deployment:

```bash
git fetch --no-tags origin main
git checkout --detach <full-git-sha>
scripts/prod-deploy.sh <full-git-sha>
```

The deployment validates the host-side production Caddyfile in a fresh one-off container, then recreates only Caddy after the stack is healthy. Recreation is required because Git may atomically replace the bind-mounted file, leaving an existing container attached to its previous inode. A validation or Caddy restart failure leaves the previous release tag recorded and stops the deployment before image cleanup.

Once the candidate stack is healthy and the release file has been promoted, deployment prunes Docker images that are not referenced by any container. This keeps immutable release tags from accumulating on the boot volume without touching running images or persistent volumes. Rollback can pull an uncached public GHCR image again. Temporarily set `LINEWATCH_DEPLOY_PRUNE_IMAGES=false` to skip this cleanup while troubleshooting.

Routine deployment after the first database exists:

```bash
git fetch --no-tags origin main
scripts/prod-backup-postgres.sh
git checkout --detach <full-git-sha>
scripts/prod-deploy.sh <full-git-sha>
LINEWATCH_DEPLOY_FRONTEND_URL=https://linewatchto.ca \
LINEWATCH_DEPLOY_BACKEND_URL=https://api.linewatchto.ca \
node scripts/smoke-deploy.mjs
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
scripts/prod-backup-postgres.sh
git checkout --detach <previous-full-git-sha>
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

Ensure your `.env.production` has the Grafana Cloud tokens and configurations populated as described in [observability.md](observability.md).

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
