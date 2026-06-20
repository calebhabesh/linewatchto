# On-Demand Staging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand, production-like staging environment that can run on the development server for days at a time, be reached through an optional Cloudflare Tunnel hostname, and be safely stopped or reset without touching production.

**Architecture:** Staging gets its own Docker Compose file, env template, helper scripts, Caddy entrypoint, Postgres/Redis volumes, and Compose project name. The stack builds local images from the current checkout instead of using production GHCR release tags, while keeping the runtime path production-like: browser → Cloudflare Tunnel or localhost → Caddy → Next.js/Spring Boot → Postgres/Redis. Cloudflare Access and DNS are configured outside the repo; the repo only provides the tunnel-capable container entrypoint and documentation.

**Tech Stack:** Docker Compose, Caddy 2, Cloudflare Tunnel, Next.js standalone Docker image, Spring Boot Java 21 Docker image, PostgreSQL/PostGIS, Redis 7, Bash, Node smoke checks.

---

## Scope

Build only the staging harness.

In scope:

- On-demand staging Compose stack.
- Safe helper scripts: up, down, reset, smoke, generic compose wrapper.
- Separate committed env example for staging.
- Script-level tests using fake Docker binaries where practical.
- Documentation for first-time setup and routine usage.
- AGENTS.md and GEMINI.md updates together.

Out of scope:

- Production deployment changes.
- Analytics/monitoring dashboards.
- CI/CD automation.
- Copying production data into staging.
- Real Cloudflare Access policy automation through the Cloudflare API.
- Public staging access for Reddit testers. This staging environment is for owner/tester validation before production release.

## Assumptions

- The staging stack runs on the good development server, not on the Oracle VPS.
- The dev server has Docker Engine, Docker Compose, and enough disk for local staging images and volumes.
- Cloudflare is already authoritative for `linewatchto.ca`, or the user can create a staging hostname under a domain they control.
- Recommended staging hostname: `staging.linewatchto.ca`.
- Staging should be disposable by default: stopping preserves volumes, reset deletes volumes.
- Staging uses live public TTC alert and GTFS sources when enabled, but it is still an unofficial personal project.
- Staging secrets live in `.env.staging`, which must never be committed.

## File Map

- Modify: `.gitignore` to allow committing `.env.staging.example` while keeping `.env.staging` ignored.
- Modify: `.dockerignore` to allow committing `.env.staging.example` while keeping real env files excluded from build context.
- Create: `.env.staging.example` as the committed staging configuration template.
- Create: `docker-compose.staging.yml` for the staging service graph.
- Create: `Caddyfile.staging` for same-origin staging routing and no-index headers.
- Create: `scripts/lib/staging-compose.sh` for reusable staging Compose helpers.
- Create: `scripts/staging-compose.sh` as the low-level wrapper.
- Create: `scripts/staging-up.sh` for build/start/wait.
- Create: `scripts/staging-down.sh` for stop without volume deletion.
- Create: `scripts/staging-reset.sh` for explicit destructive volume deletion.
- Create: `scripts/staging-smoke.sh` for local or public staging smoke checks.
- Create: `scripts/tests/staging-tools.test.sh` for helper-script safety tests.
- Modify: `README.md` to add concise staging usage.
- Create: `docs/staging.md` for detailed setup and operations.
- Modify: `AGENTS.md` and `GEMINI.md` together to document the staging stack and commands.

## Task 0: Baseline Review

**Files:**
- Read: `AGENTS.md`
- Read: `GEMINI.md`
- Read: `README.md`
- Read: `docker-compose.prod.yml`
- Read: `Caddyfile`
- Read: `.env.production.example`
- Read: `.gitignore`
- Read: `.dockerignore`
- Read: `scripts/prod-compose.sh`
- Read: `scripts/lib/prod-release.sh`
- Read: `scripts/tests/prod-release-tools.test.sh`
- Read: `scripts/smoke-deploy.mjs`

- [ ] **Step 1: Inspect the worktree**

Run:

```bash
git status --short --branch
```

Expected: review any existing user changes. Do not revert unrelated work.

- [ ] **Step 2: Read the repo guidance**

Run:

```bash
sed -n '1,260p' AGENTS.md
sed -n '1,260p' GEMINI.md
```

Expected: confirm LineWatch TO naming, no official TTC claims, verification policy, and the rule that AGENTS.md and GEMINI.md change together.

- [ ] **Step 3: Read existing production and helper patterns**

Run:

```bash
sed -n '1,260p' docker-compose.prod.yml
sed -n '1,220p' Caddyfile
sed -n '1,260p' .env.production.example
sed -n '1,220p' scripts/lib/prod-release.sh
sed -n '1,160p' scripts/prod-compose.sh
sed -n '1,220p' scripts/smoke-deploy.mjs
```

Expected: production uses registry images selected by `.env.release`; staging must not reuse that release path.

- [ ] **Step 4: Read existing script-test style**

Run:

```bash
sed -n '1,760p' scripts/tests/prod-release-tools.test.sh
```

Expected: tests are plain Bash with fake Docker binaries and local assertions.

## Task 1: Staging Env Template And Ignore Rules

**Files:**
- Modify: `.gitignore`
- Modify: `.dockerignore`
- Create: `.env.staging.example`

- [ ] **Step 1: Update `.gitignore` allowlist**

In `.gitignore`, change the environment section from:

```gitignore
# Environment
.env
.env.*
!.env.example
!.env.production.example
!.env.release.example
```

to:

```gitignore
# Environment
.env
.env.*
!.env.example
!.env.production.example
!.env.release.example
!.env.staging.example
```

- [ ] **Step 2: Update `.dockerignore` allowlist**

In `.dockerignore`, change:

```dockerignore
.env
.env.*
!.env.example
!.env.production.example
!.env.release.example
```

to:

```dockerignore
.env
.env.*
!.env.example
!.env.production.example
!.env.release.example
!.env.staging.example
```

- [ ] **Step 3: Create `.env.staging.example`**

Create `.env.staging.example` with exactly:

```bash
# Copy this file to .env.staging on the development server.
# Keep .env.staging out of Git.
#
# Recommended public hostname:
#   https://staging.linewatchto.ca
#
# Configure Cloudflare Access outside this repo if the hostname should be private.

LINEWATCH_STAGING_HOSTNAME=staging.linewatchto.ca
LINEWATCH_STAGING_PUBLIC_ORIGIN=https://staging.linewatchto.ca
LINEWATCH_STAGING_HTTP_PORT=8090
LINEWATCH_STAGING_PROJECT_NAME=linewatch-staging
LINEWATCH_STAGING_BUILD_LABEL=staging-local
LINEWATCH_CLOUDFLARED_TUNNEL_TOKEN=
LINEWATCH_STAGING_SKIP_TUNNEL=false

POSTGRES_DB=linewatch_staging
POSTGRES_USER=linewatch_staging
POSTGRES_PASSWORD=linewatch_staging_password_change_me

JAVA_TOOL_OPTIONS=-Xmx1g

LINEWATCH_AUTH_SECURE_COOKIE=true
LINEWATCH_AUTH_ALLOWED_ORIGINS=https://staging.linewatchto.ca
LINEWATCH_AUTH_RATE_LIMIT_ENABLED=true
LINEWATCH_AUTH_RATE_LIMIT_WINDOW=PT15M
LINEWATCH_AUTH_RATE_LIMIT_AUTH_MAX_REQUESTS=24
LINEWATCH_AUTH_RATE_LIMIT_PASSWORD_RESET_MAX_REQUESTS=10
LINEWATCH_AUTH_RATE_LIMIT_DEMO_MAX_REQUESTS=40
LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS=true
LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL=https://staging.linewatchto.ca

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
LINEWATCH_INGESTION_ALERTS_CONNECT_TIMEOUT=PT3S
LINEWATCH_INGESTION_ALERTS_READ_TIMEOUT=PT8S

LINEWATCH_ARRIVALS_ENABLED=true
LINEWATCH_ARRIVALS_PROVIDER=scheduled
LINEWATCH_ARRIVALS_SCHEDULE_HORIZON=PT90M
LINEWATCH_ARRIVALS_MAX_ARRIVALS_PER_LINE=4
LINEWATCH_ARRIVALS_GTFS_IMPORT_ENABLED=false
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

# Optional override for smoke checks. Default is http://127.0.0.1:${LINEWATCH_STAGING_HTTP_PORT}.
LINEWATCH_STAGING_SMOKE_ORIGIN=
```

- [ ] **Step 4: Verify ignore behavior**

Run:

```bash
git check-ignore -v .env.staging || true
git check-ignore -v .env.staging.example || true
```

Expected:

- `.env.staging` is ignored.
- `.env.staging.example` is not ignored.

- [ ] **Step 5: Commit env template changes**

Run:

```bash
git add .gitignore .dockerignore .env.staging.example
git diff --cached --name-status
git commit -m "chore: add staging env template"
```

Expected: commit contains only the ignore-rule changes and `.env.staging.example`.

## Task 2: Staging Compose Stack

**Files:**
- Create: `docker-compose.staging.yml`
- Create: `Caddyfile.staging`

- [ ] **Step 1: Create `Caddyfile.staging`**

Create `Caddyfile.staging` with exactly:

```caddyfile
{
	auto_https off
}

(linewatch_staging_security_headers) {
	header {
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
		Referrer-Policy strict-origin-when-cross-origin
		X-Robots-Tag "noindex, nofollow, noarchive"
	}
}

:8080 {
	encode gzip zstd
	import linewatch_staging_security_headers

	handle /api/* {
		reverse_proxy backend:8080
	}

	handle {
		reverse_proxy frontend:3000
	}
}
```

- [ ] **Step 2: Create `docker-compose.staging.yml`**

Create `docker-compose.staging.yml` with exactly:

```yaml
x-logging: &default-logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"

services:
  postgres:
    build:
      context: .
      dockerfile: infra/postgres/Dockerfile
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-linewatch_staging}
      POSTGRES_USER: ${POSTGRES_USER:-linewatch_staging}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env.staging}
    volumes:
      - postgres_staging_data:/var/lib/postgresql/data
    networks:
      - linewatch-staging-net
    logging: *default-logging
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
      - redis_staging_data:/data
    networks:
      - linewatch-staging-net
    logging: *default-logging
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
      - ${LINEWATCH_STAGING_ENV_FILE:-.env.staging}
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/${POSTGRES_DB:-linewatch_staging}
      SPRING_DATASOURCE_USERNAME: ${POSTGRES_USER:-linewatch_staging}
      SPRING_DATASOURCE_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env.staging}
      SPRING_DATA_REDIS_HOST: redis
      SPRING_DATA_REDIS_PORT: 6379
      SERVER_PORT: 8080
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - linewatch-staging-net
    logging: *default-logging
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:8080/api/health >/dev/null"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 60s

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_LINEWATCH_APP_VERSION: ${NEXT_PUBLIC_LINEWATCH_APP_VERSION:-0.1.0}
        NEXT_PUBLIC_LINEWATCH_BUILD_LABEL: ${LINEWATCH_STAGING_BUILD_LABEL:-staging-local}
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
      - linewatch-staging-net
    logging: *default-logging
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "node -e \"fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""
        ]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 45s

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "127.0.0.1:${LINEWATCH_STAGING_HTTP_PORT:-8090}:8080"
    volumes:
      - ./Caddyfile.staging:/etc/caddy/Caddyfile:ro
      - caddy_staging_data:/data
      - caddy_staging_config:/config
    depends_on:
      frontend:
        condition: service_healthy
      backend:
        condition: service_healthy
    networks:
      - linewatch-staging-net
    logging: *default-logging
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8080/api/health >/dev/null"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 15s

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    profiles:
      - tunnel
    command:
      [
        "tunnel",
        "--no-autoupdate",
        "run",
        "--token",
        "${LINEWATCH_CLOUDFLARED_TUNNEL_TOKEN:-}"
      ]
    depends_on:
      caddy:
        condition: service_healthy
    networks:
      - linewatch-staging-net
    logging: *default-logging

volumes:
  postgres_staging_data:
  redis_staging_data:
  caddy_staging_data:
  caddy_staging_config:

networks:
  linewatch-staging-net:
    driver: bridge
```

- [ ] **Step 3: Validate Compose rendering with the example env**

Run:

```bash
docker compose \
  --env-file .env.staging.example \
  --project-name linewatch-staging-plan-check \
  -f docker-compose.staging.yml \
  config >/tmp/linewatch-staging-compose.yml
```

Expected: command exits 0 and writes rendered config.

- [ ] **Step 4: Confirm staging does not publish public 80/443**

Run:

```bash
rg -n '"80:80"|"443:443"|0\.0\.0\.0 docker-compose.staging.yml Caddyfile.staging || true
```

Expected: no matches. Staging Caddy binds only `127.0.0.1:${LINEWATCH_STAGING_HTTP_PORT}` on the host.

- [ ] **Step 5: Commit staging Compose files**

Run:

```bash
git add docker-compose.staging.yml Caddyfile.staging
git diff --cached --name-status
git commit -m "feat: add on-demand staging compose stack"
```

Expected: commit contains only `docker-compose.staging.yml` and `Caddyfile.staging`.

## Task 3: Staging Helper Scripts

**Files:**
- Create: `scripts/lib/staging-compose.sh`
- Create: `scripts/staging-compose.sh`
- Create: `scripts/staging-up.sh`
- Create: `scripts/staging-down.sh`
- Create: `scripts/staging-reset.sh`
- Create: `scripts/staging-smoke.sh`

- [ ] **Step 1: Create `scripts/lib/staging-compose.sh`**

Create `scripts/lib/staging-compose.sh` with exactly:

```bash
#!/usr/bin/env bash

linewatch_staging_die() {
  printf 'Error: %s\n' "$*" >&2
  return 1
}

linewatch_staging_root_dir() {
  local script_dir

  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)" || return 1
  printf '%s\n' "$script_dir"
}

linewatch_staging_env_file() {
  local root_dir="${LINEWATCH_ROOT_DIR:-$(linewatch_staging_root_dir)}"
  printf '%s\n' "${LINEWATCH_STAGING_ENV_FILE:-$root_dir/.env.staging}"
}

linewatch_staging_compose_file() {
  local root_dir="${LINEWATCH_ROOT_DIR:-$(linewatch_staging_root_dir)}"
  printf '%s\n' "${LINEWATCH_STAGING_COMPOSE_FILE:-$root_dir/docker-compose.staging.yml}"
}

linewatch_staging_project_name() {
  printf '%s\n' "${LINEWATCH_STAGING_PROJECT_NAME:-linewatch-staging}"
}

linewatch_staging_read_env_value() {
  local file="${1-}"
  local key="${2-}"

  if [[ ! -f "$file" ]]; then
    return 1
  fi
  if [[ ! "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]]; then
    linewatch_staging_die "invalid env key: $key"
    return 1
  fi

  sed -n "s/^${key}=//p" "$file" | tail -n 1
}

linewatch_staging_require_env() {
  local env_file
  env_file="$(linewatch_staging_env_file)" || return 1

  if [[ ! -f "$env_file" ]]; then
    linewatch_staging_die "missing staging env file: $env_file"
    printf 'Create it with: cp .env.staging.example .env.staging\n' >&2
    return 1
  fi
}

linewatch_staging_local_origin() {
  local env_file
  local port

  env_file="$(linewatch_staging_env_file)" || return 1
  port="$(linewatch_staging_read_env_value "$env_file" LINEWATCH_STAGING_HTTP_PORT || true)"
  printf 'http://127.0.0.1:%s\n' "${port:-8090}"
}

linewatch_staging_public_origin() {
  local env_file
  local origin
  local hostname

  env_file="$(linewatch_staging_env_file)" || return 1
  origin="$(linewatch_staging_read_env_value "$env_file" LINEWATCH_STAGING_PUBLIC_ORIGIN || true)"
  if [[ -n "$origin" ]]; then
    printf '%s\n' "$origin"
    return 0
  fi

  hostname="$(linewatch_staging_read_env_value "$env_file" LINEWATCH_STAGING_HOSTNAME || true)"
  if [[ -n "$hostname" ]]; then
    printf 'https://%s\n' "$hostname"
    return 0
  fi

  linewatch_staging_local_origin
}

linewatch_staging_smoke_origin() {
  local env_file
  local origin

  env_file="$(linewatch_staging_env_file)" || return 1
  origin="${LINEWATCH_STAGING_SMOKE_ORIGIN:-$(linewatch_staging_read_env_value "$env_file" LINEWATCH_STAGING_SMOKE_ORIGIN || true)}"
  if [[ -n "$origin" ]]; then
    printf '%s\n' "$origin"
  else
    linewatch_staging_local_origin
  fi
}

linewatch_staging_tunnel_enabled() {
  local env_file
  local token
  local skip_tunnel

  env_file="$(linewatch_staging_env_file)" || return 1
  skip_tunnel="${LINEWATCH_STAGING_SKIP_TUNNEL:-$(linewatch_staging_read_env_value "$env_file" LINEWATCH_STAGING_SKIP_TUNNEL || true)}"
  token="${LINEWATCH_CLOUDFLARED_TUNNEL_TOKEN:-$(linewatch_staging_read_env_value "$env_file" LINEWATCH_CLOUDFLARED_TUNNEL_TOKEN || true)}"

  [[ "$skip_tunnel" != "true" && -n "$token" ]]
}

linewatch_staging_build_label() {
  local root_dir="${LINEWATCH_ROOT_DIR:-$(linewatch_staging_root_dir)}"
  local explicit_label
  local short_sha

  explicit_label="${LINEWATCH_STAGING_BUILD_LABEL:-}"
  if [[ -n "$explicit_label" ]]; then
    printf '%s\n' "$explicit_label"
    return 0
  fi

  short_sha="$(git -C "$root_dir" rev-parse --short HEAD 2>/dev/null || true)"
  if [[ -n "$short_sha" ]]; then
    printf 'staging-%s\n' "$short_sha"
  else
    date -u '+staging-%Y%m%d%H%M%S'
  fi
}

linewatch_staging_compose() {
  local root_dir="${LINEWATCH_ROOT_DIR:-$(linewatch_staging_root_dir)}"
  local env_file
  local compose_file
  local project_name
  local docker_bin="${DOCKER_BIN:-docker}"

  env_file="$(linewatch_staging_env_file)" || return 1
  compose_file="$(linewatch_staging_compose_file)" || return 1
  project_name="$(linewatch_staging_project_name)" || return 1

  LINEWATCH_ROOT_DIR="$root_dir" \
  LINEWATCH_STAGING_ENV_FILE="$env_file" \
  LINEWATCH_STAGING_BUILD_LABEL="${LINEWATCH_STAGING_BUILD_LABEL:-$(linewatch_staging_build_label)}" \
    "$docker_bin" compose \
      --project-name "$project_name" \
      --env-file "$env_file" \
      -f "$compose_file" \
      "$@"
}
```

- [ ] **Step 2: Create `scripts/staging-compose.sh`**

Create `scripts/staging-compose.sh` with exactly:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/staging-compose.sh
source "$ROOT_DIR/scripts/lib/staging-compose.sh"

export LINEWATCH_ROOT_DIR="$ROOT_DIR"
linewatch_staging_require_env
linewatch_staging_compose "$@"
```

- [ ] **Step 3: Create `scripts/staging-up.sh`**

Create `scripts/staging-up.sh` with exactly:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/staging-compose.sh
source "$ROOT_DIR/scripts/lib/staging-compose.sh"

export LINEWATCH_ROOT_DIR="$ROOT_DIR"
linewatch_staging_require_env

COMPOSE_ARGS=()
if linewatch_staging_tunnel_enabled; then
  COMPOSE_ARGS+=(--profile tunnel)
fi

export LINEWATCH_STAGING_BUILD_LABEL="${LINEWATCH_STAGING_BUILD_LABEL:-$(linewatch_staging_build_label)}"

linewatch_staging_compose "${COMPOSE_ARGS[@]}" config >/dev/null
linewatch_staging_compose "${COMPOSE_ARGS[@]}" up \
  -d \
  --build \
  --remove-orphans \
  --wait \
  --wait-timeout "${LINEWATCH_STAGING_WAIT_SECONDS:-420}"

linewatch_staging_compose "${COMPOSE_ARGS[@]}" ps

cat <<EOF
LineWatch TO staging is running.

Local URL:
  $(linewatch_staging_local_origin)

Public URL:
  $(linewatch_staging_public_origin)

Smoke check:
  scripts/staging-smoke.sh

Stop without deleting data:
  scripts/staging-down.sh

Reset with volume deletion:
  LINEWATCH_STAGING_RESET_CONFIRM=reset-staging scripts/staging-reset.sh
EOF
```

- [ ] **Step 4: Create `scripts/staging-down.sh`**

Create `scripts/staging-down.sh` with exactly:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/staging-compose.sh
source "$ROOT_DIR/scripts/lib/staging-compose.sh"

export LINEWATCH_ROOT_DIR="$ROOT_DIR"
linewatch_staging_require_env
linewatch_staging_compose down --remove-orphans
```

- [ ] **Step 5: Create `scripts/staging-reset.sh`**

Create `scripts/staging-reset.sh` with exactly:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/staging-compose.sh
source "$ROOT_DIR/scripts/lib/staging-compose.sh"

export LINEWATCH_ROOT_DIR="$ROOT_DIR"
linewatch_staging_require_env

if [[ "${LINEWATCH_STAGING_RESET_CONFIRM:-}" != "reset-staging" ]]; then
  cat >&2 <<'EOF'
Refusing to delete staging volumes.

This removes the staging Postgres, Redis, and Caddy volumes for the staging
Compose project only. Production is not targeted by this script.

Run:
  LINEWATCH_STAGING_RESET_CONFIRM=reset-staging scripts/staging-reset.sh
EOF
  exit 1
fi

linewatch_staging_compose down --remove-orphans --volumes
```

- [ ] **Step 6: Create `scripts/staging-smoke.sh`**

Create `scripts/staging-smoke.sh` with exactly:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/staging-compose.sh
source "$ROOT_DIR/scripts/lib/staging-compose.sh"

export LINEWATCH_ROOT_DIR="$ROOT_DIR"
linewatch_staging_require_env

ORIGIN="$(linewatch_staging_smoke_origin)"

LINEWATCH_DEPLOY_FRONTEND_URL="$ORIGIN" \
LINEWATCH_DEPLOY_BACKEND_URL="$ORIGIN" \
  node "$ROOT_DIR/scripts/smoke-deploy.mjs"
```

- [ ] **Step 7: Make scripts executable**

Run:

```bash
chmod +x \
  scripts/staging-compose.sh \
  scripts/staging-up.sh \
  scripts/staging-down.sh \
  scripts/staging-reset.sh \
  scripts/staging-smoke.sh
```

Expected: command exits 0.

- [ ] **Step 8: Commit helper scripts**

Run:

```bash
git add scripts/lib/staging-compose.sh scripts/staging-compose.sh scripts/staging-up.sh scripts/staging-down.sh scripts/staging-reset.sh scripts/staging-smoke.sh
git diff --cached --name-status
git commit -m "feat: add staging lifecycle scripts"
```

Expected: commit contains only staging helper scripts.

## Task 4: Script Tests For Staging Safety

**Files:**
- Create: `scripts/tests/staging-tools.test.sh`

- [ ] **Step 1: Create `scripts/tests/staging-tools.test.sh`**

Create `scripts/tests/staging-tools.test.sh` with exactly:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

source "$ROOT_DIR/scripts/lib/staging-compose.sh"

TEST_TMP="$(mktemp -d)"
TEST_COUNT=0

cleanup() {
  rm -rf "$TEST_TMP"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  return 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"

  [[ "$haystack" == *"$needle"* ]] || fail "expected output to contain: $needle"
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"

  [[ "$haystack" != *"$needle"* ]] || fail "expected output not to contain: $needle"
}

assert_equals() {
  local actual="$1"
  local expected="$2"

  [[ "$actual" == "$expected" ]] || fail "expected '$expected', got '$actual'"
}

run_test() {
  local name="$1"
  local status
  shift

  set +e
  (
    set -e
    "$@"
  )
  status=$?
  set -e

  if [[ "$status" -eq 0 ]]; then
    TEST_COUNT=$((TEST_COUNT + 1))
    printf 'PASS: %s\n' "$name"
  else
    return 1
  fi
}

write_env_file() {
  local env_file="$1"
  cat > "$env_file" <<'EOF'
LINEWATCH_STAGING_HOSTNAME=staging.linewatchto.ca
LINEWATCH_STAGING_PUBLIC_ORIGIN=https://staging.linewatchto.ca
LINEWATCH_STAGING_HTTP_PORT=8090
LINEWATCH_STAGING_PROJECT_NAME=linewatch-staging
LINEWATCH_STAGING_BUILD_LABEL=staging-test
LINEWATCH_CLOUDFLARED_TUNNEL_TOKEN=
LINEWATCH_STAGING_SKIP_TUNNEL=false
POSTGRES_DB=linewatch_staging
POSTGRES_USER=linewatch_staging
POSTGRES_PASSWORD=test
EOF
}

make_fake_docker() {
  local path="$1"

  cat > "$path" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${FAKE_DOCKER_LOG:?}"
EOF
  chmod +x "$path"
}

test_compose_wrapper_uses_staging_project_env_and_file() {
  local temp_dir="$TEST_TMP/compose-wrapper"
  local fake_docker
  local log
  local env_file

  mkdir "$temp_dir"
  fake_docker="$temp_dir/docker"
  log="$temp_dir/docker.log"
  env_file="$temp_dir/.env.staging"
  write_env_file "$env_file"
  make_fake_docker "$fake_docker"

  FAKE_DOCKER_LOG="$log" \
  DOCKER_BIN="$fake_docker" \
  LINEWATCH_STAGING_ENV_FILE="$env_file" \
    "$ROOT_DIR/scripts/staging-compose.sh" ps

  assert_contains "$(cat "$log")" "compose --project-name linewatch-staging --env-file $env_file"
  assert_contains "$(cat "$log")" "-f $ROOT_DIR/docker-compose.staging.yml ps"
}

test_up_enables_tunnel_profile_when_token_exists() {
  local temp_dir="$TEST_TMP/up-tunnel"
  local fake_docker
  local log
  local env_file

  mkdir "$temp_dir"
  fake_docker="$temp_dir/docker"
  log="$temp_dir/docker.log"
  env_file="$temp_dir/.env.staging"
  write_env_file "$env_file"
  printf '%s\n' 'LINEWATCH_CLOUDFLARED_TUNNEL_TOKEN=test-token' >> "$env_file"
  make_fake_docker "$fake_docker"

  FAKE_DOCKER_LOG="$log" \
  DOCKER_BIN="$fake_docker" \
  LINEWATCH_STAGING_ENV_FILE="$env_file" \
    "$ROOT_DIR/scripts/staging-up.sh" >/dev/null

  assert_contains "$(cat "$log")" "--profile tunnel config"
  assert_contains "$(cat "$log")" "--profile tunnel up -d --build --remove-orphans --wait"
}

test_up_omits_tunnel_profile_when_skipped() {
  local temp_dir="$TEST_TMP/up-no-tunnel"
  local fake_docker
  local log
  local env_file

  mkdir "$temp_dir"
  fake_docker="$temp_dir/docker"
  log="$temp_dir/docker.log"
  env_file="$temp_dir/.env.staging"
  write_env_file "$env_file"
  printf '%s\n' 'LINEWATCH_CLOUDFLARED_TUNNEL_TOKEN=test-token' >> "$env_file"
  make_fake_docker "$fake_docker"

  FAKE_DOCKER_LOG="$log" \
  DOCKER_BIN="$fake_docker" \
  LINEWATCH_STAGING_ENV_FILE="$env_file" \
  LINEWATCH_STAGING_SKIP_TUNNEL=true \
    "$ROOT_DIR/scripts/staging-up.sh" >/dev/null

  assert_not_contains "$(cat "$log")" "--profile tunnel"
  assert_contains "$(cat "$log")" "up -d --build --remove-orphans --wait"
}

test_reset_refuses_without_confirmation() {
  local temp_dir="$TEST_TMP/reset-refuse"
  local fake_docker
  local log
  local env_file
  local output
  local status

  mkdir "$temp_dir"
  fake_docker="$temp_dir/docker"
  log="$temp_dir/docker.log"
  env_file="$temp_dir/.env.staging"
  write_env_file "$env_file"
  make_fake_docker "$fake_docker"

  set +e
  output="$(
    FAKE_DOCKER_LOG="$log" \
    DOCKER_BIN="$fake_docker" \
    LINEWATCH_STAGING_ENV_FILE="$env_file" \
      "$ROOT_DIR/scripts/staging-reset.sh" 2>&1
  )"
  status=$?
  set -e

  assert_equals "$status" "1"
  assert_contains "$output" "Refusing to delete staging volumes."
  if [[ -f "$log" ]]; then
    fail "reset without confirmation should not call docker"
    return 1
  fi
}

test_reset_deletes_only_after_confirmation() {
  local temp_dir="$TEST_TMP/reset-confirmed"
  local fake_docker
  local log
  local env_file

  mkdir "$temp_dir"
  fake_docker="$temp_dir/docker"
  log="$temp_dir/docker.log"
  env_file="$temp_dir/.env.staging"
  write_env_file "$env_file"
  make_fake_docker "$fake_docker"

  FAKE_DOCKER_LOG="$log" \
  DOCKER_BIN="$fake_docker" \
  LINEWATCH_STAGING_ENV_FILE="$env_file" \
  LINEWATCH_STAGING_RESET_CONFIRM=reset-staging \
    "$ROOT_DIR/scripts/staging-reset.sh"

  assert_contains "$(cat "$log")" "down --remove-orphans --volumes"
}

test_smoke_defaults_to_local_origin() {
  local temp_dir="$TEST_TMP/smoke-local"
  local env_file
  local fake_node
  local log

  mkdir "$temp_dir"
  env_file="$temp_dir/.env.staging"
  fake_node="$temp_dir/node"
  log="$temp_dir/node.log"
  write_env_file "$env_file"

  cat > "$fake_node" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'frontend=%s\nbackend=%s\nscript=%s\n' \
  "${LINEWATCH_DEPLOY_FRONTEND_URL:-}" \
  "${LINEWATCH_DEPLOY_BACKEND_URL:-}" \
  "$1" > "${FAKE_NODE_LOG:?}"
EOF
  chmod +x "$fake_node"

  PATH="$temp_dir:$PATH" \
  FAKE_NODE_LOG="$log" \
  LINEWATCH_STAGING_ENV_FILE="$env_file" \
    "$ROOT_DIR/scripts/staging-smoke.sh"

  assert_contains "$(cat "$log")" "frontend=http://127.0.0.1:8090"
  assert_contains "$(cat "$log")" "backend=http://127.0.0.1:8090"
  assert_contains "$(cat "$log")" "scripts/smoke-deploy.mjs"
}

run_test "staging Compose wrapper uses isolated project and env" test_compose_wrapper_uses_staging_project_env_and_file
run_test "staging up enables tunnel profile when token exists" test_up_enables_tunnel_profile_when_token_exists
run_test "staging up omits tunnel profile when skipped" test_up_omits_tunnel_profile_when_skipped
run_test "staging reset refuses without confirmation" test_reset_refuses_without_confirmation
run_test "staging reset deletes volumes only after confirmation" test_reset_deletes_only_after_confirmation
run_test "staging smoke defaults to local origin" test_smoke_defaults_to_local_origin

printf '%s tests passed\n' "$TEST_COUNT"
```

- [ ] **Step 2: Make the test executable**

Run:

```bash
chmod +x scripts/tests/staging-tools.test.sh
```

Expected: command exits 0.

- [ ] **Step 3: Run the staging script tests**

Run:

```bash
scripts/tests/staging-tools.test.sh
```

Expected:

```text
PASS: staging Compose wrapper uses isolated project and env
PASS: staging up enables tunnel profile when token exists
PASS: staging up omits tunnel profile when skipped
PASS: staging reset refuses without confirmation
PASS: staging reset deletes volumes only after confirmation
PASS: staging smoke defaults to local origin
6 tests passed
```

- [ ] **Step 4: Run existing production helper tests**

Run:

```bash
scripts/tests/prod-release-tools.test.sh
```

Expected: all existing tests pass. This guards against accidental production helper regressions.

- [ ] **Step 5: Commit staging tests**

Run:

```bash
git add scripts/tests/staging-tools.test.sh
git diff --cached --name-status
git commit -m "test: cover staging helper scripts"
```

Expected: commit contains only `scripts/tests/staging-tools.test.sh`.

## Task 5: Documentation

**Files:**
- Create: `docs/staging.md`
- Modify: `README.md`

- [ ] **Step 1: Create `docs/staging.md`**

Create `docs/staging.md` with exactly:

```markdown
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
```

- [ ] **Step 2: Add a concise README staging section**

In `README.md`, after the production deployment smoke-check section, add:

```markdown
## On-Demand Staging

For week-long feature validation on the development server, use the staging Compose stack. It builds local images from the current checkout and uses isolated staging volumes, env files, and project names.

```bash
cp .env.staging.example .env.staging
chmod 600 .env.staging
scripts/staging-up.sh
scripts/staging-smoke.sh
scripts/staging-down.sh
```

Use `scripts/staging-reset.sh` only when you intentionally want to delete staging volumes:

```bash
LINEWATCH_STAGING_RESET_CONFIRM=reset-staging scripts/staging-reset.sh
```

See `docs/staging.md` for Cloudflare Tunnel and Cloudflare Access setup notes.
```

- [ ] **Step 3: Commit staging documentation**

Run:

```bash
git add docs/staging.md README.md
git diff --cached --name-status
git commit -m "docs: document on-demand staging"
```

Expected: commit contains only `docs/staging.md` and `README.md`.

## Task 6: Agent Guidance Updates

**Files:**
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] **Step 1: Add staging reality to both guidance files**

In both `AGENTS.md` and `GEMINI.md`, in the current reality section near the production Compose bullet, add this bullet:

```markdown
- `docker-compose.staging.yml` provides an on-demand staging stack for the development server. It builds local images from the current checkout, uses isolated staging volumes and `.env.staging`, routes through `Caddyfile.staging`, and can optionally expose the stack through Cloudflare Tunnel with Cloudflare Access configured outside the repo.
```

- [ ] **Step 2: Add staging commands to both guidance files**

In both `AGENTS.md` and `GEMINI.md`, in the infrastructure command block, add:

```bash
scripts/staging-up.sh
scripts/staging-smoke.sh
scripts/staging-compose.sh ps
scripts/staging-down.sh
LINEWATCH_STAGING_RESET_CONFIRM=reset-staging scripts/staging-reset.sh
```

- [ ] **Step 3: Add a staging guardrail to both guidance files**

In both `AGENTS.md` and `GEMINI.md`, near the production/deployment guidance, add:

```markdown
Staging is separate from production. Do not point staging scripts at `.env.production`, `.env.release`, production volumes, or production image tags. Do not copy production secrets into `.env.staging`.
```

- [ ] **Step 4: Verify AGENTS and GEMINI stay in sync for staging references**

Run:

```bash
rg -n "staging|docker-compose.staging|staging-up|staging-smoke|staging-reset" AGENTS.md GEMINI.md
```

Expected: both files contain matching staging guidance.

- [ ] **Step 5: Commit agent guidance changes**

Run:

```bash
git add AGENTS.md GEMINI.md
git diff --cached --name-status
git commit -m "docs: add staging guidance for agents"
```

Expected: commit contains only `AGENTS.md` and `GEMINI.md`.

## Task 7: Full Verification

**Files:**
- Read: all files changed in Tasks 1-6.

- [ ] **Step 1: Run script tests**

Run:

```bash
scripts/tests/staging-tools.test.sh
scripts/tests/prod-release-tools.test.sh
```

Expected: both test scripts pass.

- [ ] **Step 2: Render staging Compose config**

Run:

```bash
docker compose \
  --env-file .env.staging.example \
  --project-name linewatch-staging-plan-check \
  -f docker-compose.staging.yml \
  config >/tmp/linewatch-staging-compose.yml
```

Expected: command exits 0.

- [ ] **Step 3: Render production Compose config**

Run:

```bash
LINEWATCH_IMAGE_TAG=0123456789abcdef0123456789abcdef01234567 \
docker compose \
  --env-file .env.production.example \
  -f docker-compose.prod.yml \
  config >/tmp/linewatch-prod-compose.yml
```

Expected: command exits 0. This guards against accidental production Compose breakage.

- [ ] **Step 4: Run backend tests**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: backend tests pass.

- [ ] **Step 5: Run frontend fixture/type/lint checks**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: all three checks pass.

- [ ] **Step 6: Optional real staging boot check**

Run only when Docker is available and the developer is ready to build local images:

```bash
cp .env.staging.example .env.staging
chmod 600 .env.staging
LINEWATCH_STAGING_SKIP_TUNNEL=true scripts/staging-up.sh
scripts/staging-smoke.sh
scripts/staging-down.sh
```

Expected:

- staging starts locally at `http://127.0.0.1:8090`;
- smoke checks pass;
- `scripts/staging-down.sh` stops containers without deleting volumes.

Do not commit `.env.staging`.

- [ ] **Step 7: Inspect changed files**

Run:

```bash
git status --short
git log --oneline -6
```

Expected: either clean worktree after commits, or only intentionally uncommitted files such as local `.env.staging` ignored by Git.

## Operational Notes For Gemini

- Preserve user changes. If `git status --short` shows unrelated edits, do not revert them.
- Do not put secrets in `.env.staging.example`, docs, commits, or test fixtures.
- Keep staging local-first. Public access goes through Cloudflare Tunnel and should be protected by Cloudflare Access.
- Do not bind staging to public `0.0.0.0:80` or `0.0.0.0:443`.
- Do not modify production scripts except for read-only verification unless a test reveals a direct incompatibility.
- If Docker build pulls fail because of network restrictions, report the exact failing command and continue with non-network script/config verification.
- If Cloudflare Access blocks public smoke checks, use the default local smoke check.
- If `.env.staging` is created during manual validation, verify it is ignored before final handoff:

```bash
git check-ignore -v .env.staging
```

## Self-Review Checklist

- Every staging file has a clear owner and purpose.
- Staging uses separate project name, env file, Compose file, volumes, and Caddyfile.
- Staging does not reuse `.env.production`, `.env.release`, or production image tags.
- Staging can run local-only without Cloudflare Tunnel.
- Staging can run with Cloudflare Tunnel when a token exists.
- Reset is destructive only with explicit confirmation.
- Smoke checks default to localhost to work with Cloudflare Access.
- AGENTS.md and GEMINI.md are updated together.
- Verification includes staging tests, production helper tests, Compose rendering, backend tests, and frontend checks.
