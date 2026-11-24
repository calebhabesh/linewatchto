# Production VPS Server Configuration

This file documents the hosting configuration for the **LineWatchTO** production server.

Do not commit passwords, SMTP credentials, VAPID private keys, or SSH deploy keys. Store application secrets in `.env.production` on the VPS and keep that file out of Git.

## Hardware And Operating System

- Cloud provider: Oracle Cloud Infrastructure Always Free Tier with PAYG account.
- Instance shape: `VM.Standard.A1.Flex` ARM64 Ampere.
- Compute: 4 OCPUs and 24 GB RAM.
- Boot volume: 100 GB.
- Operating system: Ubuntu 24.04 LTS aarch64.

## Host-Managed Services

The host manages:

- Docker Engine and the Docker Compose plugin.
- Tailscale.
- OCI ingress rules.
- Host firewall rules.
- The repository checkout, server-local `.env.production`, and generated `.env.release`.
- Persistent Docker volumes and Caddy data.

Tailscale stays outside Compose because it protects access to Docker and the host itself.

## Public Network

Public traffic reaches the sites only through Cloudflare Tunnel: each `cloudflared` connector dials out, and the LineWatchTO one reaches Caddy at `https://caddy:443` on the Compose network. No container publishes a public port, and TLS certificates still renew through the tunnel.

OCI ingress (the default security list) allows only:

- TCP `8443` and UDP `3478` for the `orbit-net` relay.
- ICMP types 3 and 4.

There is no public TCP `22`, `80`, or `443`. SSH is reached only over Tailscale (`100.67.196.101`).

The host firewall repeats those limits so a loosened security list does not expose the host. `/etc/iptables/rules.v4` and `rules.v6` are loaded at boot by `netfilter-persistent`, before Docker and Tailscale add their own chains. Edit those files by hand; never replace them with `iptables-save` output, which would capture Docker's per-container rules. They:

- accept SSH only on `tailscale0`;
- accept the Tailscale (UDP `41641`) and `orbit-net` ports, and reject all other inbound traffic;
- drop new connections from the public interface (`enp0s6`) to containers in `DOCKER-USER`, because Docker's published ports bypass `INPUT`.

`sshd` allows only `ubuntu`, with keys only and no root login (`/etc/ssh/sshd_config.d/10-hardening.conf`). Unattended upgrades install security updates daily and reboot at 09:00 UTC when a kernel or libc update needs it (`/etc/apt/apt.conf.d/52unattended-reboot`).

## Private access

Every device reaches the VPS over the owner's tailnet (`100.67.196.101`, MagicDNS `main-instance-vnic`), and GitHub Actions deploys join it as ephemeral `tag:ci` nodes (see the deploy setup below).

WireGuard (hub `10.0.0.1`) was retired on 2026-11-18: `wg-quick@wg0` is disabled, its firewall rules and the UDP `51820` security-list rule are removed, and its config and keys are kept root-only in `/root/wireguard-retired-20261118T145943Z`.

## Production Compose Stack

Compose services:

- `caddy`: reverse proxy and automatic TLS behind the tunnel.
- `cloudflared` (`tunnel` profile): Cloudflare Tunnel connector; reads its token from `secrets/cloudflared-tunnel-token`.
- `frontend`: Next.js standalone server on the private Compose network.
- `backend`: Spring Boot API on the private Compose network.
- `postgres`: PostgreSQL 17 with PostGIS on a persistent volume.
- `redis`: Redis 7 with append-only persistence on a persistent volume.
- `schedule-assets`: keeps the schedule-derived Map View and search files current with the TTC and GO GTFS (plan 16; see [Schedule assets](#schedule-assets)).

Production Compose sets memory ceilings for the always-on services so a leak or runaway query cannot consume the full 24 GB host. Current caps are:

```text
postgres: 8 GB
backend: 6 GB
frontend: 1 GB
redis: 1 GB
caddy: 512 MB
schedule-assets: 3 GB (the TTC bus generator peaks near 1.5 GB for about a minute)
alloy: 512 MB, only when the observability profile is enabled
```

The backend JVM heap remains capped separately by `JAVA_TOOL_OPTIONS=-Xmx4g`; the backend container limit includes JVM native memory, metaspace, thread stacks, and process overhead. The caps intentionally leave several GB for Ubuntu, Docker, kernel memory, filesystem cache, deploys, backups, and temporary burst overhead.

Production application images are built by the successful `main` CI run on a native ARM64 GitHub runner and published to GHCR. The CI run records each image's registry digest. The manual GitHub Actions deployment button selects those exact digests through `.env.release`; the VPS never runs `docker compose build` or `up --build`.

The production PostGIS image is built from `infra/postgres/Dockerfile`, which extends the official multi-architecture `postgres:17-bookworm` image. The official `postgis/postgis` image used for local development does not publish an ARM64 manifest for the selected tag.

No service publishes a public host port; Alloy binds `127.0.0.1:12345` only.

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
- `linewatchto_schedule_assets_data` (generated, public files; safe to recreate, see [Schedule assets](#schedule-assets))

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
- Tunnel token: `secrets/cloudflared-tunnel-token`, readable only by the `cloudflared` image user (`sudo chown 65532:65532` and `chmod 400`). Keeping it out of `.env.production` and the command line hides it from `docker inspect`, the process list, and the backend's environment.

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
- `.env.production`, `.env.release`, Docker volumes, and Caddy data.
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
| `VPS_HOST` | SSH host: the VPS's Tailscale address, `100.67.196.101`. |
| `VPS_USER` | SSH user with access to the production checkout and Docker, currently `ubuntu`. |
| `VPS_SSH_KEY` | Private key for a dedicated deploy SSH key. On the VPS its public key is pinned to the deploy gate: `command="/usr/local/sbin/linewatch-deploy-gate",from="100.64.0.0/10,fd7a:115c:a1e0::/48",restrict` (tailnet addresses only). The gate (`scripts/prod-ssh-deploy-gate.sh`, installed as a root-owned copy) ignores the script the workflow sends, accepts only the release arguments, and runs `prod-remote-release.sh` from `origin/main`, so the key cannot run other commands. Reinstall the copy when the gate changes. |
| `VPS_SSH_KNOWN_HOSTS` | Pinned SSH host key entry for `VPS_HOST`; verify the fingerprint through an existing trusted connection before storing it. |

Optional `production` environment **variables** are `VPS_SSH_PORT` (default `22`) and `VPS_DEPLOY_PATH` (default `/home/ubuntu/apps/linewatchto`). Keep `.env.production`, `.env.release`, provider credentials, and persistent volumes on the VPS; they are not Actions secrets.

The runner reaches SSH over **Tailscale** (since 2026-11-18; before that, a dedicated WireGuard peer). The Deploy job joins the tailnet as an ephemeral `tag:ci` node with Tailscale workload identity: the trust credential "GitHub Actions Deploys" accepts GitHub's OIDC token for subject `repo:calebhabesh@87959618/*:environment:production` (GitHub's immutable subject, with the account and repository IDs) (Auth Keys write, `tag:ci`), so no Tailscale secret is stored. Its client ID and audience are the `production` environment **variables** `TS_OAUTH_CLIENT_ID` and `TS_AUDIENCE`, and the job needs `id-token: write`. The tailnet policy grants `tag:ci` only `tcp:22` on `100.67.196.101`; the owner's devices (`autogroup:member`) keep full access. The `production` environment is limited to the `main` branch. CourtLens deploys the same way. Do not open public SSH for this workflow.

The production checkout needs a working `origin` fetch and must have no tracked local changes. Actions leaves it detached at the deployed SHA. The new workflow file and scripts must be pushed to `main` before the button appears. No production credentials belong in Git.

The pre-deploy backup script keeps only the latest verified local dump on the VPS, deleting the prior dump after a successful new backup; a failed dump preserves the previous one. Retained copies are the nightly encrypted off-host backups described in [Backups](#backups). `.env.release` records the deployed SHA and exact image digests; old GHCR versions can be pulled again after local Docker image pruning, provided they have not been deleted from GHCR. Rollback across Flyway migrations still requires schema compatibility review.

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

A non-empty `possibleDuplicates` in the regional-ingestion response lists GO/UP events from the latest poll that may be one rider event published twice. Concurrent incidents can match too, so review the pairs (`scripts/audit-metrolinx-duplicates.sh` against a local copy of the feed shows why each stays separate) rather than treating them as failures.

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

## Backups

- **Pre-deploy dump.** `scripts/prod-backup-postgres.sh` runs before every deploy and keeps only the latest verified local dump in `tmp/prod-backups`. It is the release's rollback point, not a retained backup.
- **Nightly off-host copies** (plan 17 A4). `linewatch-offsite-backup.timer`, a host systemd timer independent of the application and of deploys, runs `scripts/prod-backup-offsite.sh` at 07:15 UTC (up to 10 minutes later). Copies go to Cloudflare R2, encrypted on the host with `age` to the owner's public key. The private key never lives on the VPS.

### What a copy holds

`pg_dump -Fc` of the whole schema, with data for every table except these (resolved against production on 2026-11-24):

| Pattern | Tables | Why |
| --- | --- | --- |
| `gtfs_*` | routes, schedule_imports, service_exceptions, services, station_stops, stop_times, stops, trips | Re-imported from the TTC feed |
| `ttc_surface_*` | routes, station_connections, station_stops, stop_routes, stop_times, stops, trips | Re-imported from the TTC feed |
| `regional_gtfs_*` | departures, schedule_imports, service_exceptions, services | Re-imported from GO and UP |
| `ttc_alert_source_records`, `metrolinx_*_source_records` | ttc_alert_source_records, metrolinx_alert_source_records, metrolinx_operational_source_records | Raw provider records stay on the host |

Everything else is included: alerts, snapshots, alert_active_periods, regional alerts and snapshots, cancellations, ingestion runs (and `metrolinx_ingestion_source_runs`), `reliability_schedule_days`, `reliability_service_spans`, `reliability_observation_windows`, and accounts, sessions, push subscriptions (keys included) and saved commutes. Each run compares the dump's table list with the live schema. Data must be present for every table outside the patterns and absent for every table inside them, each pattern must match a table, and the core tables must exist. Otherwise nothing is uploaded. A new table is therefore backed up by default. A new raw-record table needs a pattern in the script and here before it ships. No kept table holds an FK into an excluded one, so `pg_restore --exit-on-error` succeeds (rehearsed 2026-11-24).

Owner decision, 2026-11-24: four kept tables carry a raw TTC open-data payload column (`alerts`, `accessibility_outages`, `surface_service_notices` and `ttc_announcements`, all `raw_payload`; about 17 MB). Those columns stay in the copy, encrypted. No raw source-record table and no Metrolinx payload leaves the host. On 2026-11-24 the kept tables held about 148 MB of table data and the excluded ones about 532 MB.

### How a run works

1. `pg_dump` writes into the postgres container's `/tmp`. `pg_restore` then reads the whole archive back, and the table-list check runs.
2. The archive streams out of the container through `age -R <recipients>` into `tmp/offsite-backups/run.*`, so only ciphertext touches the host disk. The container copy is then removed (on failure too).
3. `rclone copyto` uploads `linewatch-postgres-YYYYMMDDTHHMMSSZ.dump.age`. The bucket listing must then show it at the local size.
4. Only then are older copies pruned. Objects with other names are never touched.
5. The script writes `/var/lib/linewatch/textfile-metrics/linewatch_offsite_backup.prom`.

Any failure exits non-zero, deletes nothing off-host, and removes the local and container temporary files. A failed prune keeps the new copy, still records it as the newest copy, and fails the run. The script refuses a settings file readable by group or others, and refuses any file holding `AGE-SECRET-KEY-`.

**Retention: 14 daily, 8 weekly (ISO weeks), 12 monthly**, about 30 copies. A run keeps the newest copy of each of the 14 newest UTC days, the 8 newest weeks and the 12 newest months that have copies. The script enforces this, not R2 lifecycle rules. Lifecycle rules only expire objects by age per prefix: they cannot keep "the newest copy of each week" without uploading extra copies under per-tier prefixes, and they keep deleting while backups fail (a 15-day outage would leave no daily copy). Script-side selection counts only periods that have copies and prunes only after the new copy verifies. The trade-off is that the R2 token needs delete rights, so a compromised VPS could delete copies. An R2 bucket lock (for example 7 days) would protect the newest week. With a lock, a second copy taken the same day cannot be pruned until it ages out, and the nightly run fails until then.

**Staleness alert.** The Grafana rule "Off-host backup stale" fires when `time() - linewatch_offsite_backup_last_success_timestamp_seconds` exceeds 36 hours for 15 minutes, or when the metric is missing. Alloy's unix exporter reads the textfile through the host-root mount (`textfile` block in `config.alloy`). This mechanism was chosen because the value is the dump time of the newest verified copy, so it ages even when the timer stops running altogether, which no "run failed" signal can show. It also needs no new credentials or network path. The backend cannot see host timers, and Alloy ships only Docker logs, not the systemd journal.

### Owner setup (once)

1. On a trusted machine (never the VPS), run `age-keygen -o linewatch-offsite.key`. It prints the public key (`age1...`). Keep the key file offline; a second recipient key is optional.
2. In R2, create the bucket (for example `cf r2 buckets create`). Create an S3 API token with Object Read & Write scoped to that bucket for the VPS, and a separate read-only token for restores.
3. On the VPS:

```bash
sudo apt-get install -y age rclone
sudo install -d -o ubuntu -g ubuntu -m 755 /var/lib/linewatch /var/lib/linewatch/textfile-metrics
install -d -m 700 ~/.config/linewatch
printf '%s\n' 'age1...' > ~/.config/linewatch/offsite-backup.age-recipients
install -m 600 /dev/null ~/.config/linewatch/offsite-backup.env
```

   `~/.config/linewatch/offsite-backup.env` (mode 600; rclone reads the remote from these variables):

```env
LINEWATCH_OFFSITE_REMOTE=r2offsite:<bucket>/postgres
RCLONE_CONFIG_R2OFFSITE_TYPE=s3
RCLONE_CONFIG_R2OFFSITE_PROVIDER=Cloudflare
RCLONE_CONFIG_R2OFFSITE_ACCESS_KEY_ID=<access key id>
RCLONE_CONFIG_R2OFFSITE_SECRET_ACCESS_KEY=<secret>
RCLONE_CONFIG_R2OFFSITE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
RCLONE_CONFIG_R2OFFSITE_NO_CHECK_BUCKET=true
```

4. Deploy a release containing these files. Then recreate Alloy so it reads the new config (a plain `up` does not notice a changed bind-mounted file): `COMPOSE_PROFILES=observability scripts/prod-compose.sh up -d --no-build --force-recreate --wait alloy`.
5. Install the units, run the first upload by hand, then enable the timer:

```bash
sudo install -m 644 infra/systemd/linewatch-offsite-backup.service infra/systemd/linewatch-offsite-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start linewatch-offsite-backup.service
journalctl -u linewatch-offsite-backup.service -n 30 --no-pager
cat /var/lib/linewatch/textfile-metrics/linewatch_offsite_backup.prom
sudo systemctl enable --now linewatch-offsite-backup.timer
systemctl list-timers linewatch-offsite-backup.timer --no-pager
```

   Reinstall the unit copies whenever the files in `infra/systemd` change.
6. Once the first copy has verified, apply the alert rules: `node scripts/grafana-apply-alerts.mjs`. The rule alerts on no data, so applying it earlier sends an email.

### Restore drill

Run this on the owner's machine with throwaway containers, never against the dev or test database. Repeat it after setup and after any change to the backup.

```bash
rclone lsf r2restore:<bucket>/postgres | sort | tail -1      # newest copy, read-only token
rclone copyto r2restore:<bucket>/postgres/<name> ./<name>
age -d -i linewatch-offsite.key -o linewatch.dump <name>
docker run -d --rm --name linewatch-restore-drill -e POSTGRES_USER=linewatch \
  -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=postgres -p 127.0.0.1:5440:5432 postgis/postgis:17-3.6
docker exec linewatch-restore-drill createdb -U linewatch -T template0 linewatch
docker cp linewatch.dump linewatch-restore-drill:/tmp/linewatch.dump
docker exec linewatch-restore-drill pg_restore -U linewatch -d linewatch \
  --no-owner --no-privileges --exit-on-error /tmp/linewatch.dump
```

To re-import schedules, run the backend at the deployed commit (`LINEWATCH_IMAGE_TAG` in `.env.release`), extracted with `git archive <sha> backend | tar -x -C <scratch>`, so the dev backend's `target/classes` stay untouched. Point it at the drill database and a throwaway Redis, with alert ingestion off (the default) and production's retention:

```bash
docker run -d --rm --name linewatch-restore-redis -p 127.0.0.1:6390:6379 redis:7-alpine
SPRING_DATASOURCE_URL=jdbc:postgresql://127.0.0.1:5440/linewatch SPRING_DATASOURCE_PASSWORD=drill \
SPRING_DATA_REDIS_PORT=6390 SERVER_PORT=8097 \
LINEWATCH_ARRIVALS_ENABLED=true LINEWATCH_ARRIVALS_GTFS_REFRESH_ENABLED=true \
LINEWATCH_REGIONAL_ARRIVALS_ENABLED=true LINEWATCH_REGIONAL_ARRIVALS_SCHEDULE_ENABLED=true \
LINEWATCH_REGIONAL_ARRIVALS_SCHEDULE_REFRESH_ENABLED=true \
LINEWATCH_MAINTENANCE_INGESTION_RUN_RETENTION=P3650D \
  mvn -q -f <scratch>/backend/pom.xml spring-boot:run
```

When `/api/health/schedule` and `/api/health/regional-schedule` on port 8097 report active imports and the first maintenance run has passed (10 minutes after start), run against port 5440:

- the A1 production done check and the A3 production done check from [plan 17](refactor-plan/17-reliability-analytics.md). A1 must match production's output up to the copy's date, and A3 must report 0 mismatched days;
- once A5 lands, its parity check (this restored copy is A5's parity fixture).

Record the copy name, its size, the restore time and the check results in plan 17 A4. Then stop both containers and delete `linewatch.dump` and the downloaded copy: they hold account data.

A production restore follows the same decrypt and `pg_restore` steps into an empty production database (copy the archive to the VPS over Tailscale). The schedule tables then refill through the production refresh flags.

## Schedule assets

The `schedule-assets` service (plan 16, `services/schedule-assets/`) checks the TTC CKAN package
hourly and the GO GTFS zip every 6 hours, regenerates the Map View routes and stops, the search
indexes and the GO stop list when the extracted tables change, validates them, and publishes
content-hashed files plus `manifest.json` into `linewatchto_schedule_assets_data`. Caddy serves the
manifest and hashed files at `/data/schedule/` (read-only mount); the backend reads the GO stop
list from the same volume (read-only, every minute). A new schedule needs no release.

- Bootstrap: on an empty volume the service first publishes the files baked into its image (the
  release's committed copies, `origin: "release"`), then checks both feeds.
- Health: `curl -s https://linewatchto.ca/api/health/schedule-assets | jq` (feed versions and
  periods, last check and success per network, `failing` or `stale`). Compare `feedVersion` and
  the period with `/api/health/schedule` and `/api/health/regional-schedule`.
- Logs: `scripts/prod-compose.sh logs --tail 100 schedule-assets` (one JSON line per event:
  `checked`, `published`, `rejected`, `check-failed`); Alloy ships them with the other containers.
- A rejected feed keeps the last good files in service and is not regenerated again until the
  feed or the generator changes. The rejection's problems are in the log and in
  `/srv/schedule/.state/state.json` inside the container.
- A `check-failed` at stage `generate` is a generator bug on a new feed; the event's message is
  the generator's first error line. Reproduce it with the cached archive
  (`docker exec linewatchto-schedule-assets-1 cat /srv/schedule/.state/gtfs/go.zip > go.zip`,
  then the generator with `--go-gtfs go.zip` and scratch `--output`/`--backend-stops`). The
  Schedule assets rules in [observability.md](observability.md#alerts) alert on two failed
  checks in a row, a stale network, and a published feed ending within 7 days.
- Force a full regeneration from the cached archives (for example after a manual fix):
  `scripts/prod-compose.sh exec schedule-assets rm /srv/schedule/.state/state.json` then
  `scripts/prod-compose.sh restart schedule-assets`.
- Reset: stop the service, remove and recreate the volume (`docker volume rm
  linewatchto_schedule_assets_data && scripts/prod-init-volumes.sh`), then deploy or start it
  again. The site keeps working meanwhile: without a manifest, pages use the release's files.
  Open pages that already read the manifest reread it when a hashed file is gone.
- First deploy of a four-image release: create the volume (`scripts/prod-init-volumes.sh`) and
  reinstall the deploy gate's root copy, which must accept the fourth image:
  `sudo install -m 755 scripts/prod-ssh-deploy-gate.sh /usr/local/sbin/linewatch-deploy-gate`.
  The old gate rejects six arguments, so a deploy before the reinstall fails without changes.

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
