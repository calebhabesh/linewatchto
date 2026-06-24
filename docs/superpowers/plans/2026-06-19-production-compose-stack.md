# Production Compose Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production Docker Compose stack that self-hosts LineWatchTO on the Oracle VPS with Caddy, Next.js, Spring Boot, PostgreSQL/PostGIS, and Redis.

**Architecture:** WireGuard, Docker Engine, and host firewall rules remain host-managed. Docker Compose owns the HTTP app stack: Caddy is the only public web entrypoint, while frontend, backend, Postgres, and Redis communicate on a private Compose network. Browser API calls stay same-origin through `/api/*`; backend and frontend server-side calls use Docker service names.

**Tech Stack:** Docker Compose, Caddy 2, Next.js standalone output, Node 20 Alpine, Java 21 Spring Boot, PostgreSQL/PostGIS, Redis 7 Alpine, Bash.

---

## File Map

- Modify: `.gitignore` to allow committing the production env example while keeping real env files ignored.
- Modify: `.dockerignore` to allow the production env example in build context only when needed and keep real env files excluded.
- Create: `.env.production.example` as the committed production configuration template.
- Modify: `backend/Dockerfile` to run as a non-root user and include `curl` for health checks.
- Modify: `frontend/Dockerfile` to build Next standalone without baking a Docker-internal browser API URL into the client bundle.
- Modify: `docker-compose.prod.yml` to define the production service graph, private ports, volumes, health checks, and env wiring.
- Modify: `Caddyfile` to route root domains to frontend, `/api/*` to backend, and `api.linewatchto.ca` directly to backend.
- Create: `scripts/prod-backup-postgres.sh` for a simple timestamped database backup.
- Modify: `README.md` production deployment section.
- Modify: `docs/production-vps.md` to describe Compose-managed services instead of native systemd services.
- Modify: `AGENTS.md` and `GEMINI.md` together to reflect the new production Compose stack.

## Task 0: Baseline And Draft File Review

**Files:**
- Read: `Caddyfile`
- Read: `docker-compose.prod.yml`
- Read: `frontend/Dockerfile`
- Read: `docs/production-vps.md`
- Read: `docs/superpowers/specs/2026-06-19-production-compose-stack-design.md`

- [ ] **Step 1: Inspect current worktree**

Run:

```bash
git status --short --branch
```

Expected: untracked production draft files may appear. Do not delete them. Treat them as user work to refine.

- [ ] **Step 2: Read the approved design**

Run:

```bash
sed -n '1,260p' docs/superpowers/specs/2026-06-19-production-compose-stack-design.md
```

Expected: the approved design states full self-hosted Docker Compose with host-level WireGuard.

- [ ] **Step 3: Read current production drafts**

Run:

```bash
sed -n '1,240p' Caddyfile
sed -n '1,280p' docker-compose.prod.yml
sed -n '1,220p' frontend/Dockerfile
sed -n '1,220p' docs/production-vps.md
```

Expected: confirm the current drafts exist and need the corrections listed in the approved design.

## Task 1: Production Environment Template

**Files:**
- Modify: `.gitignore`
- Modify: `.dockerignore`
- Create: `.env.production.example`

- [ ] **Step 1: Update ignored-env allowlists**

In `.gitignore`, replace:

```gitignore
!.env.example
```

with:

```gitignore
!.env.example
!.env.production.example
```

In `.dockerignore`, replace:

```dockerignore
!.env.example
```

with:

```dockerignore
!.env.example
!.env.production.example
```

- [ ] **Step 2: Create `.env.production.example`**

Create `.env.production.example` with exactly:

```bash
# Copy this file to .env.production on the VPS.
# Keep .env.production out of Git.

POSTGRES_DB=linewatch
POSTGRES_USER=linewatch
POSTGRES_PASSWORD=linewatch_production_password_change_me

SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/linewatch
SPRING_DATASOURCE_USERNAME=linewatch
SPRING_DATASOURCE_PASSWORD=linewatch_production_password_change_me
SPRING_DATA_REDIS_HOST=redis
SPRING_DATA_REDIS_PORT=6379

SERVER_PORT=8080

LINEWATCH_AUTH_SECURE_COOKIE=true
LINEWATCH_AUTH_ALLOWED_ORIGINS=https://linewatchto.ca,https://www.linewatchto.ca
LINEWATCH_AUTH_RATE_LIMIT_ENABLED=true
LINEWATCH_AUTH_RATE_LIMIT_WINDOW=PT15M
LINEWATCH_AUTH_RATE_LIMIT_AUTH_MAX_REQUESTS=12
LINEWATCH_AUTH_RATE_LIMIT_PASSWORD_RESET_MAX_REQUESTS=5
LINEWATCH_AUTH_RATE_LIMIT_DEMO_MAX_REQUESTS=20
LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS=false
LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL=https://linewatchto.ca

LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_ENABLED=false
LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_FROM=no-reply@linewatchto.ca
SPRING_MAIL_HOST=
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=
SPRING_MAIL_PASSWORD=
SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=true
SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=true

LINEWATCH_INGESTION_ALERTS_ENABLED=true
LINEWATCH_INGESTION_ALERTS_URL=https://alerts.ttc.ca/api/alerts/live-alerts
LINEWATCH_INGESTION_ALERTS_FIXED_DELAY=PT2M
LINEWATCH_INGESTION_ALERTS_MAX_DASHBOARD_AGE=PT10M

LINEWATCH_ARRIVALS_GTFS_REFRESH_ENABLED=true
LINEWATCH_ARRIVALS_GTFS_REFRESH_PACKAGE_URL=https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=merged-gtfs-ttc-routes-and-schedules
LINEWATCH_ARRIVALS_GTFS_REFRESH_INITIAL_DELAY=PT30S
LINEWATCH_ARRIVALS_GTFS_REFRESH_FIXED_DELAY=PT24H
LINEWATCH_ARRIVALS_GTFS_REFRESH_MIN_SERVICE_DAYS_REMAINING=14

LINEWATCH_PERFORMANCE_TTC_ENABLED=true
LINEWATCH_PERFORMANCE_TTC_URL=https://www.ttc.ca/
LINEWATCH_PERFORMANCE_TTC_CONNECT_TIMEOUT=PT3S
LINEWATCH_PERFORMANCE_TTC_READ_TIMEOUT=PT8S
LINEWATCH_PERFORMANCE_TTC_REFRESH_INTERVAL=PT24H
LINEWATCH_PERFORMANCE_TTC_MAX_AGE=PT48H

LINEWATCH_CACHE_DASHBOARD_ENABLED=true
LINEWATCH_CACHE_DASHBOARD_STATUS_TTL=PT30S
LINEWATCH_CACHE_DASHBOARD_MAP_TTL=PT30S
LINEWATCH_CACHE_DASHBOARD_ALERTS_TTL=PT30S
LINEWATCH_CACHE_DASHBOARD_INGESTION_HEALTH_TTL=PT15S
LINEWATCH_CACHE_DASHBOARD_PERFORMANCE_TTL=PT6H

LINEWATCH_PUSH_ENABLED=false
LINEWATCH_PUSH_VAPID_PUBLIC_KEY=
LINEWATCH_PUSH_VAPID_PRIVATE_KEY=
LINEWATCH_PUSH_VAPID_SUBJECT=mailto:hostmaster@linewatchto.ca
LINEWATCH_PUSH_EVALUATION_DELAY_MS=60000

NEXT_PUBLIC_LINEWATCH_APP_VERSION=0.1.0
NEXT_PUBLIC_LINEWATCH_BUILD_LABEL=prod
```

- [ ] **Step 3: Verify ignore behavior**

Run:

```bash
git check-ignore -v .env.production || true
git check-ignore -v .env.production.example || true
```

Expected: `.env.production` is ignored; `.env.production.example` is not ignored.

- [ ] **Step 4: Commit environment template**

Run:

```bash
git add .gitignore .dockerignore .env.production.example
git diff --cached --name-status
git commit -m "chore: add production env template"
```

Expected: commit contains only `.gitignore`, `.dockerignore`, and `.env.production.example`.

## Task 2: Production Dockerfiles

**Files:**
- Modify: `backend/Dockerfile`
- Modify: `frontend/Dockerfile`

- [ ] **Step 1: Replace `backend/Dockerfile`**

Replace `backend/Dockerfile` with:

```Dockerfile
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY backend/pom.xml backend/pom.xml
COPY backend/src backend/src
RUN mvn -f backend/pom.xml -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system linewatch \
    && useradd --system --gid linewatch --home-dir /app --shell /usr/sbin/nologin linewatch

COPY --from=build --chown=linewatch:linewatch /workspace/backend/target/linewatch-backend-0.0.1-SNAPSHOT.jar /app/app.jar

ENV SERVER_PORT=8080
EXPOSE 8080

USER linewatch
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

- [ ] **Step 2: Replace `frontend/Dockerfile`**

Replace `frontend/Dockerfile` with:

```Dockerfile
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_LINEWATCH_APP_VERSION
ARG NEXT_PUBLIC_LINEWATCH_BUILD_LABEL
ENV NEXT_PUBLIC_LINEWATCH_APP_VERSION=${NEXT_PUBLIC_LINEWATCH_APP_VERSION}
ENV NEXT_PUBLIC_LINEWATCH_BUILD_LABEL=${NEXT_PUBLIC_LINEWATCH_BUILD_LABEL}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1002 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
```

- [ ] **Step 3: Build backend image**

Run:

```bash
docker build -f backend/Dockerfile -t linewatch-backend:prod-check .
```

Expected: image builds successfully. If dependency download fails due sandbox/network limits, rerun with the approved network/escalation path and record the failure if it still cannot run.

- [ ] **Step 4: Build frontend image**

Run:

```bash
docker build -f frontend/Dockerfile -t linewatch-frontend:prod-check frontend
```

Expected: image builds successfully and the build log does not show `NEXT_PUBLIC_LINEWATCH_API_BASE_URL=http://backend:8080`.

- [ ] **Step 5: Commit Dockerfile changes**

Run:

```bash
git add backend/Dockerfile frontend/Dockerfile
git diff --cached --name-status
git commit -m "chore: prepare production Docker images"
```

Expected: commit contains only `backend/Dockerfile` and `frontend/Dockerfile`.

## Task 3: Production Compose And Caddy

**Files:**
- Modify: `docker-compose.prod.yml`
- Modify: `Caddyfile`

- [ ] **Step 1: Replace `docker-compose.prod.yml`**

Replace `docker-compose.prod.yml` with:

```yaml
services:
  postgres:
    image: postgis/postgis:18-3.6
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-linewatch}
      POSTGRES_USER: ${POSTGRES_USER:-linewatch}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env.production}
    volumes:
      - postgres_prod_data:/var/lib/postgresql/data
    networks:
      - linewatch-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \"$$POSTGRES_USER\" -d \"$$POSTGRES_DB\""]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis_prod_data:/data
    networks:
      - linewatch-net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    restart: unless-stopped
    env_file:
      - .env.production
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/${POSTGRES_DB:-linewatch}
      SPRING_DATASOURCE_USERNAME: ${POSTGRES_USER:-linewatch}
      SPRING_DATASOURCE_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env.production}
      SPRING_DATA_REDIS_HOST: redis
      SPRING_DATA_REDIS_PORT: 6379
      SERVER_PORT: 8080
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - linewatch-net
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:8080/api/health >/dev/null"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 45s

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_LINEWATCH_APP_VERSION: ${NEXT_PUBLIC_LINEWATCH_APP_VERSION:-0.1.0}
        NEXT_PUBLIC_LINEWATCH_BUILD_LABEL: ${NEXT_PUBLIC_LINEWATCH_BUILD_LABEL:-prod}
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      BACKEND_URL: http://backend:8080
      LINEWATCH_BACKEND_URL: http://backend:8080
      NEXT_TELEMETRY_DISABLED: 1
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - linewatch-net
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "node -e \"fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""
        ]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 30s

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      frontend:
        condition: service_healthy
      backend:
        condition: service_healthy
    networks:
      - linewatch-net

volumes:
  postgres_prod_data:
  redis_prod_data:
  caddy_data:
  caddy_config:

networks:
  linewatch-net:
    driver: bridge
```

- [ ] **Step 2: Replace `Caddyfile`**

Replace `Caddyfile` with:

```caddyfile
{
    email hostmaster@linewatchto.ca
}

(linewatch_security_headers) {
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }
}

linewatchto.ca, www.linewatchto.ca {
    encode gzip zstd
    import linewatch_security_headers

    handle /api/* {
        reverse_proxy backend:8080
    }

    handle {
        reverse_proxy frontend:3000
    }
}

api.linewatchto.ca {
    encode gzip zstd
    import linewatch_security_headers

    reverse_proxy backend:8080
}
```

- [ ] **Step 3: Validate production Compose config**

Run:

```bash
docker compose --env-file .env.production.example -f docker-compose.prod.yml config >/tmp/linewatch-compose-prod.config.yml
```

Expected: command exits `0`. The rendered config contains no `ports` entries for `frontend`, `backend`, `postgres`, or `redis`.

- [ ] **Step 4: Check rendered config for public ports**

Run:

```bash
rg -n "published:|target:" /tmp/linewatch-compose-prod.config.yml
```

Expected: only Caddy publishes `80` and `443`.

- [ ] **Step 5: Commit Compose and Caddy changes**

Run:

```bash
git add docker-compose.prod.yml Caddyfile
git diff --cached --name-status
git commit -m "chore: add production compose stack"
```

Expected: commit contains only `docker-compose.prod.yml` and `Caddyfile`.

## Task 4: Production Database Backup Script

**Files:**
- Create: `scripts/prod-backup-postgres.sh`

- [ ] **Step 1: Create backup script**

Create `scripts/prod-backup-postgres.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${LINEWATCH_PROD_COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}"
ENV_FILE="${LINEWATCH_PROD_ENV_FILE:-$ROOT_DIR/.env.production}"
BACKUP_DIR="${LINEWATCH_BACKUP_DIR:-$ROOT_DIR/tmp/prod-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT="$BACKUP_DIR/linewatch-postgres-$STAMP.sql.gz"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$OUTPUT"

echo "$OUTPUT"
```

- [ ] **Step 2: Make script executable**

Run:

```bash
chmod +x scripts/prod-backup-postgres.sh
```

Expected: executable bit is set.

- [ ] **Step 3: Validate script syntax**

Run:

```bash
bash -n scripts/prod-backup-postgres.sh
```

Expected: command exits `0`.

- [ ] **Step 4: Commit backup script**

Run:

```bash
git add scripts/prod-backup-postgres.sh
git diff --cached --name-status
git commit -m "chore: add production database backup helper"
```

Expected: commit contains only `scripts/prod-backup-postgres.sh`.

## Task 5: Deployment Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/production-vps.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] **Step 1: Update `README.md` deployment section**

Replace the current `## Deployment` section up to but not including `## Frontend` with:

````markdown
## Deployment

Production is designed for one Oracle Cloud Always Free Ampere VPS running Docker Compose.

Host-managed services:

- Docker Engine and the Docker Compose plugin.
- WireGuard for private administration.
- OCI ingress rules and host firewall rules.

Compose-managed services:

- Caddy, exposed publicly on ports `80` and `443`.
- Next.js frontend on the internal Compose network.
- Spring Boot backend on the internal Compose network.
- PostgreSQL/PostGIS on a persistent Docker volume.
- Redis on a persistent Docker volume.

Recommended production domain shape for `linewatchto.ca`:

```text
linewatchto.ca      Caddy -> Next.js frontend
www.linewatchto.ca  Caddy -> Next.js frontend
linewatchto.ca/api  Caddy -> Spring Boot backend
api.linewatchto.ca  Caddy -> Spring Boot backend
```

Only these ports should be public in OCI ingress:

```text
80/tcp       HTTP for Caddy certificate issuance and redirect
443/tcp      HTTPS for the app and API
51820/udp    WireGuard listener
```

Keep `22/tcp` open only until WireGuard SSH has been verified after reboot. After that, remove public SSH ingress and administer the VPS through the VPN.

Create the production env file on the VPS:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Edit `.env.production` on the VPS and replace the database password and any enabled SMTP or Web Push secrets. Do not commit `.env.production`.

Start the production stack:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Check health:

```bash
curl https://linewatchto.ca/api/health
curl https://api.linewatchto.ca/api/health
curl https://api.linewatchto.ca/api/health/ingestion
curl https://api.linewatchto.ca/api/health/schedule
```

Run deployment smoke checks after DNS and TLS are working:

```bash
LINEWATCH_DEPLOY_FRONTEND_URL=https://linewatchto.ca \
LINEWATCH_DEPLOY_BACKEND_URL=https://api.linewatchto.ca \
node scripts/smoke-deploy.mjs
```

Create a database backup on the VPS:

```bash
scripts/prod-backup-postgres.sh
```

Restore a backup on the VPS by piping the dump into `psql` inside the Postgres container:

```bash
gzip -dc tmp/prod-backups/linewatch-postgres-YYYYMMDDTHHMMSSZ.sql.gz | \
  docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Production backend settings should include:

```bash
LINEWATCH_AUTH_SECURE_COOKIE=true
LINEWATCH_AUTH_ALLOWED_ORIGINS=https://linewatchto.ca,https://www.linewatchto.ca
LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS=false
LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL=https://linewatchto.ca
LINEWATCH_INGESTION_ALERTS_ENABLED=true
LINEWATCH_ARRIVALS_GTFS_REFRESH_ENABLED=true
LINEWATCH_ARRIVALS_GTFS_REFRESH_FIXED_DELAY=PT24H
LINEWATCH_ARRIVALS_GTFS_REFRESH_MIN_SERVICE_DAYS_REMAINING=14
```

The backend includes an in-process GTFS refresh job. When `LINEWATCH_ARRIVALS_GTFS_REFRESH_ENABLED=true`, it checks the active TTC schedule import after startup and then on the configured fixed delay. It downloads the current public merged TTC GTFS zip from the configured CKAN package URL only when there is no active import, the active import is expired, or the active import is within `LINEWATCH_ARRIVALS_GTFS_REFRESH_MIN_SERVICE_DAYS_REMAINING` days of expiry.

Account auth endpoints have a small in-memory rate limiter for login, register, demo login, password-reset request, and password-reset confirmation. Keep it enabled in production, but also use edge/provider rate-limit rules when available because the in-app limiter is per backend instance.

For Resend password-reset email, verify `linewatchto.ca` or a sending subdomain such as `mail.linewatchto.ca` in Resend before enabling SMTP. Publish the DKIM/SPF/DMARC DNS records Resend shows, then configure Spring Mail in `.env.production`:

```bash
LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_ENABLED=true
LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_FROM=no-reply@linewatchto.ca
SPRING_MAIL_HOST=smtp.resend.com
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=resend
SPRING_MAIL_PASSWORD=your-resend-api-key
SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=true
SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=true
```

If you verify `mail.linewatchto.ca` instead of the root domain, use an address under that subdomain, for example `no-reply@mail.linewatchto.ca`. Do not use `calebhabesh.com` for LineWatchTO production reset emails unless you intentionally want reset links and sender reputation tied to your personal domain.
````

- [ ] **Step 2: Replace `docs/production-vps.md`**

Replace `docs/production-vps.md` with:

````markdown
# Production VPS Server Configuration

This file documents the hosting infrastructure configuration for the **LineWatchTO** production server. It is referenced by AI assistants and coding agents during deployment, maintenance, and debugging tasks.

Do not commit actual passwords, database credentials, SMTP credentials, VAPID private keys, or WireGuard private keys. Store production secrets in `.env.production` on the VPS and keep that file out of Git.

## Hardware And System Specs

- **Cloud Provider:** Oracle Cloud Infrastructure Always Free Tier with PAYG account.
- **Instance Shape:** `VM.Standard.A1.Flex`.
- **Compute Resources:** 2 OCPUs, 12 GB RAM.
- **Boot Volume:** 100 GB.
- **Operating System:** Ubuntu 24.04 LTS aarch64.

## Public Network

OCI ingress should allow only:

- TCP `80` for Caddy HTTP and certificate issuance.
- TCP `443` for Caddy HTTPS.
- UDP `51820` for WireGuard.

Public TCP `22` should be removed after WireGuard SSH is verified after reboot.

## WireGuard

The VM acts as the WireGuard hub.

- **Hub IP:** `10.0.0.1`.
- **Address Range:** `10.0.0.0/24`.
- **Config Path:** `/etc/wireguard/wg0.conf`.
- **SSH Command:** `ssh ubuntu@10.0.0.1`.

WireGuard is host-managed, not Compose-managed, because it protects administrative access to Docker and the host.

## Production Compose Stack

The production app stack is managed by:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Compose services:

- `caddy`: public reverse proxy and TLS automation.
- `frontend`: Next.js standalone server on the private Compose network.
- `backend`: Spring Boot API on the private Compose network.
- `postgres`: PostgreSQL/PostGIS database on a persistent Docker volume.
- `redis`: Redis cache on a persistent Docker volume.

Only Caddy publishes host ports.

## Domains

- `linewatchto.ca` routes to the frontend.
- `www.linewatchto.ca` routes to the frontend.
- `linewatchto.ca/api/*` routes to the backend.
- `www.linewatchto.ca/api/*` routes to the backend.
- `api.linewatchto.ca/*` routes to the backend.

## Persistent Volumes

- `postgres_prod_data`
- `redis_prod_data`
- `caddy_data`
- `caddy_config`

## Server-Local Files

- Repo checkout: `/home/ubuntu/ttc-reliability-navigator` unless intentionally changed.
- Production env: `.env.production` in the repo checkout on the VPS.
- Production env template: `.env.production.example` committed in Git.
- Caddy config: `Caddyfile` in the repo checkout and mounted read-only into the Caddy container.

## Common Commands

Start or update the stack:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Check service state:

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
````

- [ ] **Step 3: Update `AGENTS.md` and `GEMINI.md` current reality**

In both `AGENTS.md` and `GEMINI.md`, replace:

```markdown
- `docker-compose.yml` provides PostgreSQL/PostGIS and Redis.
```

with:

```markdown
- `docker-compose.yml` provides local PostgreSQL/PostGIS and Redis; `docker-compose.prod.yml` is the self-hosted production stack for Caddy, frontend, backend, PostgreSQL/PostGIS, and Redis on the Oracle VPS.
```

- [ ] **Step 4: Update `AGENTS.md` and `GEMINI.md` infrastructure commands**

In both `AGENTS.md` and `GEMINI.md`, under `Infrastructure:`, keep the local commands and add:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
scripts/prod-backup-postgres.sh
```

- [ ] **Step 5: Commit documentation**

Run:

```bash
git add README.md docs/production-vps.md AGENTS.md GEMINI.md
git diff --cached --name-status
git commit -m "docs: document production compose deployment"
```

Expected: commit contains only documentation files.

## Task 6: Full Verification

**Files:**
- Read: all changed files

- [ ] **Step 1: Validate production Compose config**

Run:

```bash
docker compose --env-file .env.production.example -f docker-compose.prod.yml config >/tmp/linewatch-compose-prod.config.yml
```

Expected: command exits `0`.

- [ ] **Step 2: Run backend tests**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: tests pass.

- [ ] **Step 3: Run frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: tests pass.

- [ ] **Step 4: Run frontend typecheck**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: command exits `0`.

- [ ] **Step 5: Run frontend lint**

Run:

```bash
npm --prefix frontend run lint
```

Expected: command exits `0`.

- [ ] **Step 6: Run frontend production build**

Run:

```bash
npm --prefix frontend run build
```

Expected: production build succeeds.

- [ ] **Step 7: Build production images**

Run:

```bash
docker compose --env-file .env.production.example -f docker-compose.prod.yml build
```

Expected: all production images build.

- [ ] **Step 8: Check final diff**

Run:

```bash
git status --short --branch
git log --oneline -5
```

Expected: only intentional files are modified or committed. No real `.env.production` file is staged or tracked.

## Task 7: VPS Deployment Checklist

**Files:**
- Read: `README.md`
- Read: `docs/production-vps.md`

- [ ] **Step 1: Prepare server env file**

On the VPS:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Expected: `.env.production` exists on the VPS and is not committed.

- [ ] **Step 2: Edit production secrets**

On the VPS, set a strong database password and make these values match:

```bash
POSTGRES_PASSWORD=<same-random-value>
SPRING_DATASOURCE_PASSWORD=<same-random-value>
```

Expected: Postgres and backend use the same database password.

- [ ] **Step 3: Start production stack**

On the VPS:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Expected: all services are `running` or `healthy`.

- [ ] **Step 4: Run public health checks**

On any machine after DNS is pointed at the VPS:

```bash
curl https://linewatchto.ca/api/health
curl https://api.linewatchto.ca/api/health
```

Expected: both return JSON with `"status":"ok"`.

- [ ] **Step 5: Run deployment smoke checker**

Run:

```bash
LINEWATCH_DEPLOY_FRONTEND_URL=https://linewatchto.ca \
LINEWATCH_DEPLOY_BACKEND_URL=https://api.linewatchto.ca \
node scripts/smoke-deploy.mjs
```

Expected: all smoke checks print `ok - ...`.

- [ ] **Step 6: Verify WireGuard SSH and close public SSH**

From the admin machine:

```bash
ssh ubuntu@10.0.0.1
```

Expected: SSH works over WireGuard. After confirming this still works after a VPS reboot, remove public TCP `22` from OCI ingress.
