# Production Compose Stack Design

Date: 2026-06-19

## Context

LineWatchTO will run on one Oracle Cloud Always Free Ampere VPS with 2 OCPUs, 12 GB RAM, Ubuntu 24.04, and the `linewatchto.ca` domain. The repository currently has a local-only `docker-compose.yml` for PostgreSQL/PostGIS and Redis, a backend Dockerfile, and untracked draft production files for Caddy, Compose, frontend Docker, and VPS notes.

The production target is a self-hosted app stack on the VPS. WireGuard remains host-level infrastructure so SSH can be closed to the public internet after the VPN path is verified.

## Goals

- Run the frontend, backend, PostgreSQL/PostGIS, Redis, and Caddy through one production Docker Compose stack.
- Expose only HTTP, HTTPS, and WireGuard publicly.
- Keep SSH available only through WireGuard.
- Keep database, Redis, backend, and frontend container ports off the public internet.
- Make frontend browser API calls same-origin through `/api/*` so auth cookies and mobile use stay simple.
- Preserve a direct backend hostname at `api.linewatchto.ca` for health checks, smoke checks, and portfolio clarity.
- Store all production secrets outside Git in a server-local env file.
- Keep the setup small enough for the Oracle free-tier VPS and easy to restore.

## Non-Goals

- Kubernetes, Nomad, Swarm, or multi-node orchestration.
- Public database or Redis access.
- Automated blue/green deploys.
- Paid managed database/cache services.
- Claiming live TTC status unless ingestion is enabled and fresh.
- Adding new product features while building the deployment stack.

## Recommended Approach

Use Docker Compose for app services and stateful dependencies, with Caddy as the only public HTTP entrypoint.

Host-managed services:

- Docker Engine and Compose plugin.
- WireGuard server on UDP `51820`.
- Host firewall rules.
- OCI ingress rules.
- Optional host-level backup timer or cron job.

Compose-managed services:

- `caddy`: HTTPS termination and reverse proxy.
- `frontend`: Next.js standalone server.
- `backend`: Spring Boot API.
- `postgres`: PostGIS database.
- `redis`: dashboard cache and supporting cache usage.

This is the standard small-VPS production pattern: one reverse proxy at the edge, private Docker networking for internal services, Docker volumes for state, and a VPN for administration.

## Network And Domain Routing

Public OCI ingress should allow only:

- TCP `80`
- TCP `443`
- UDP `51820`

TCP `22` should remain open only until WireGuard is verified after reboot. Then remove the public SSH ingress rule and allow SSH only from the WireGuard interface.

Caddy should route:

- `linewatchto.ca` -> frontend
- `www.linewatchto.ca` -> frontend
- `linewatchto.ca/api/*` -> backend
- `www.linewatchto.ca/api/*` -> backend
- `api.linewatchto.ca/*` -> backend

The frontend should not publish a browser-visible API base URL pointing at Docker service names. Client-side code should use same-origin `/api/*`. Server-side Next.js data loading and rewrites should use `http://backend:8080` inside the Docker network.

## Compose Service Design

### `postgres`

- Image: PostGIS image compatible with ARM64.
- Persistent volume: `postgres_prod_data`.
- No public port mapping.
- Healthcheck: `pg_isready`.
- Credentials from production env file.

### `redis`

- Image: `redis:7-alpine`.
- Persistent volume: `redis_prod_data`.
- No public port mapping.
- Healthcheck: `redis-cli ping`.
- Append-only persistence enabled unless verification shows the extra disk write is not worth it.

### `backend`

- Built from `backend/Dockerfile`.
- Depends on healthy Postgres and Redis.
- Internal port: `8080`.
- No public port mapping.
- Uses Compose service names:
  - `SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/linewatch`
  - `SPRING_DATA_REDIS_HOST=redis`
  - `SPRING_DATA_REDIS_PORT=6379`
- Production auth and ingestion values come from the env file.
- Web Push env names must match Spring config:
  - `LINEWATCH_PUSH_VAPID_PUBLIC_KEY`
  - `LINEWATCH_PUSH_VAPID_PRIVATE_KEY`
  - `LINEWATCH_PUSH_VAPID_SUBJECT`
- Healthcheck must use a tool available in the runtime image or the image must install the tool explicitly.

### `frontend`

- Built from a new `frontend/Dockerfile` using Next.js `output: "standalone"`.
- Internal port: `3000`.
- No public port mapping.
- Runtime env:
  - `BACKEND_URL=http://backend:8080`
  - `LINEWATCH_BACKEND_URL=http://backend:8080`
  - `NODE_ENV=production`
  - `PORT=3000`
  - no `NEXT_PUBLIC_LINEWATCH_API_BASE_URL` for normal production
- Healthcheck must use a tool available in the runtime image or the image must install the tool explicitly.

### `caddy`

- Image: `caddy:2-alpine`.
- Public port mappings:
  - `80:80`
  - `443:443`
- Volumes:
  - production Caddyfile
  - `caddy_data`
  - `caddy_config`
- Depends on frontend and backend.
- Owns TLS certificate automation.

## Secrets And Configuration

The repo should include a committed production env template, not real secrets. The actual file should live on the server and be ignored by Git.

Required production settings include:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `LINEWATCH_AUTH_SECURE_COOKIE=true`
- `LINEWATCH_AUTH_ALLOWED_ORIGINS=https://linewatchto.ca,https://www.linewatchto.ca`
- `LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS=false`
- `LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL=https://linewatchto.ca`
- `LINEWATCH_INGESTION_ALERTS_ENABLED=true`
- `LINEWATCH_ARRIVALS_GTFS_REFRESH_ENABLED=true`
- mail settings only after the sending domain is verified
- push settings only after VAPID keys are generated and push is intentionally enabled

## Persistence And Backups

Persistent Docker volumes:

- `postgres_prod_data`
- `redis_prod_data`
- `caddy_data`
- `caddy_config`

Backups should start with a simple server-side script that writes timestamped dumps outside the Docker volume:

- `pg_dump` for the `linewatch` database.
- optional Redis snapshot copy if Redis data becomes important beyond cache.
- optional Caddy data backup for certificate continuity.

At least one restore command should be documented. A backup without a tested restore path is not enough for production.

## Security Model

- OCI ingress exposes only `80`, `443`, and `51820/udp`.
- Host firewall mirrors OCI ingress.
- SSH is allowed through WireGuard only after VPN verification.
- Postgres, Redis, backend, and frontend bind only to the Docker network.
- Caddy sets basic security headers for browser responses.
- Production env files are never committed.
- Database passwords, VAPID private keys, SMTP credentials, and WireGuard private keys stay outside the repo.

## Existing Draft File Corrections

The current untracked draft files can be used as a starting point, but implementation should correct these points:

- `Caddyfile` should also route `api.linewatchto.ca` to the backend, not only `/api/*` on the root domain.
- `docker-compose.prod.yml` should not pass `NEXT_PUBLIC_LINEWATCH_API_BASE_URL=http://backend:8080` to the frontend because browsers cannot resolve Docker service names.
- Backend push env names should use `LINEWATCH_PUSH_VAPID_PUBLIC_KEY` and `LINEWATCH_PUSH_VAPID_PRIVATE_KEY`, not generic `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.
- Backend and frontend healthchecks should not assume `curl` or `wget` exists unless the Dockerfiles install them.
- `docs/production-vps.md` should be updated from native systemd services to the Compose-managed design.

## Deployment Flow

1. Build and test locally.
2. Copy or pull the repo on the VPS over WireGuard SSH.
3. Create the production env file on the server from the committed template.
4. Start the stack with Docker Compose.
5. Verify Caddy obtains certificates for `linewatchto.ca`, `www.linewatchto.ca`, and `api.linewatchto.ca`.
6. Run backend health checks.
7. Run the deployment smoke checker against the public frontend and backend URLs.
8. Verify WireGuard SSH still works after reboot.
9. Remove public SSH ingress.

## Verification

Before calling the production stack complete:

- Frontend fixture tests pass.
- Frontend typecheck passes.
- Frontend lint passes.
- Frontend production build passes.
- Backend tests pass.
- Production images build on the local machine or CI.
- `docker compose` config validation passes for the production file.
- On the VPS, all production services become healthy.
- Public checks pass:
  - `https://linewatchto.ca`
  - `https://linewatchto.ca/api/health`
  - `https://api.linewatchto.ca/api/health`
  - deployment smoke checker.

## Documentation Updates

Implementation should update:

- `README.md` production section.
- `docs/production-vps.md`.
- `.env.example` or a new production env template.
- `AGENTS.md` and `GEMINI.md` only if deployment reality or agent guidance changes.

## Approved Scope

This design approves a full self-hosted production Docker Compose stack for LineWatchTO on the Oracle VPS, with WireGuard retained as host-level administrative access.
