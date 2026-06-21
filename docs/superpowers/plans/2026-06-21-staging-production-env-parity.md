# Staging Production Env Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make staging use the same functional application environment values as production while preserving staging isolation and keeping secrets out of Git.

**Architecture:** Keep production and staging env files separate, because staging has extra tunnel/build/port identity values, but align behavior-driving keys. Add a small Bash parity checker that compares only approved functional keys and reports mismatched key names without printing secret values.

**Tech Stack:** Bash, Docker Compose env files, Markdown docs.

---

## File Structure

- Create `scripts/check-env-functional-parity.sh`: secret-safe env comparison script for functional staging/prod keys.
- Modify `.env.production.example`: reflect current production-functional defaults without real secrets.
- Modify `.env.staging.example`: mirror production-functional defaults while keeping staging-only identity values.
- Modify `.env.staging`: ignored local staging env; keep staging-owned secrets, align non-secret functional values.
- Modify `docs/staging.md`: document production-functional staging and allowed differences.

## Task 1: Add Functional Env Parity Checker

**Files:**
- Create: `scripts/check-env-functional-parity.sh`

- [ ] **Step 1: Create the checker script**

Create `scripts/check-env-functional-parity.sh` with this content:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_ENV="${1:-$ROOT_DIR/.env.production.example}"
STAGING_ENV="${2:-$ROOT_DIR/.env.staging.example}"

FUNCTIONAL_KEYS=(
  JAVA_TOOL_OPTIONS
  LINEWATCH_AUTH_SECURE_COOKIE
  LINEWATCH_AUTH_RATE_LIMIT_ENABLED
  LINEWATCH_AUTH_RATE_LIMIT_WINDOW
  LINEWATCH_AUTH_RATE_LIMIT_AUTH_MAX_REQUESTS
  LINEWATCH_AUTH_RATE_LIMIT_PASSWORD_RESET_MAX_REQUESTS
  LINEWATCH_AUTH_RATE_LIMIT_DEMO_MAX_REQUESTS
  LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS
  LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_ENABLED
  LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_FROM
  SPRING_MAIL_HOST
  SPRING_MAIL_PORT
  SPRING_MAIL_USERNAME
  SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH
  SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE
  LINEWATCH_INGESTION_ALERTS_ENABLED
  LINEWATCH_INGESTION_ALERTS_URL
  LINEWATCH_INGESTION_ALERTS_FIXED_DELAY
  LINEWATCH_INGESTION_ALERTS_MAX_DASHBOARD_AGE
  LINEWATCH_INGESTION_ALERTS_CONNECT_TIMEOUT
  LINEWATCH_INGESTION_ALERTS_READ_TIMEOUT
  LINEWATCH_ARRIVALS_ENABLED
  LINEWATCH_ARRIVALS_PROVIDER
  LINEWATCH_ARRIVALS_SCHEDULE_HORIZON
  LINEWATCH_ARRIVALS_MAX_ARRIVALS_PER_LINE
  LINEWATCH_ARRIVALS_GTFS_IMPORT_ENABLED
  LINEWATCH_ARRIVALS_GTFS_REFRESH_ENABLED
  LINEWATCH_ARRIVALS_GTFS_REFRESH_PACKAGE_URL
  LINEWATCH_ARRIVALS_GTFS_REFRESH_INITIAL_DELAY
  LINEWATCH_ARRIVALS_GTFS_REFRESH_FIXED_DELAY
  LINEWATCH_ARRIVALS_GTFS_REFRESH_MIN_SERVICE_DAYS_REMAINING
  LINEWATCH_PERFORMANCE_TTC_ENABLED
  LINEWATCH_PERFORMANCE_TTC_URL
  LINEWATCH_PERFORMANCE_TTC_CONNECT_TIMEOUT
  LINEWATCH_PERFORMANCE_TTC_READ_TIMEOUT
  LINEWATCH_PERFORMANCE_TTC_REFRESH_INTERVAL
  LINEWATCH_PERFORMANCE_TTC_MAX_AGE
  LINEWATCH_CACHE_DASHBOARD_ENABLED
  LINEWATCH_CACHE_DASHBOARD_STATUS_TTL
  LINEWATCH_CACHE_DASHBOARD_MAP_TTL
  LINEWATCH_CACHE_DASHBOARD_ALERTS_TTL
  LINEWATCH_CACHE_DASHBOARD_INGESTION_HEALTH_TTL
  LINEWATCH_CACHE_DASHBOARD_PERFORMANCE_TTL
  LINEWATCH_PUSH_ENABLED
  LINEWATCH_PUSH_VAPID_SUBJECT
  LINEWATCH_PUSH_EVALUATION_DELAY_MS
)

read_env_value() {
  local file="${1-}"
  local key="${2-}"

  if [[ ! "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]]; then
    printf 'invalid env key: %s\n' "$key" >&2
    return 2
  fi

  sed -n "s/^${key}=//p" "$file" | tail -n 1
}

require_file() {
  local file="${1-}"

  if [[ ! -f "$file" ]]; then
    printf 'missing env file: %s\n' "$file" >&2
    return 1
  fi
}

require_file "$PROD_ENV"
require_file "$STAGING_ENV"

mismatches=()
for key in "${FUNCTIONAL_KEYS[@]}"; do
  prod_value="$(read_env_value "$PROD_ENV" "$key")"
  staging_value="$(read_env_value "$STAGING_ENV" "$key")"

  if [[ -z "$prod_value" && -z "$staging_value" ]]; then
    mismatches+=("$key is missing or blank in both env files")
  elif [[ -z "$prod_value" ]]; then
    mismatches+=("$key is missing or blank in production env")
  elif [[ -z "$staging_value" ]]; then
    mismatches+=("$key is missing or blank in staging env")
  elif [[ "$prod_value" != "$staging_value" ]]; then
    mismatches+=("$key differs")
  fi
done

if (( ${#mismatches[@]} > 0 )); then
  printf 'Functional env parity check failed:\n' >&2
  printf '  production: %s\n' "$PROD_ENV" >&2
  printf '  staging:    %s\n' "$STAGING_ENV" >&2
  for mismatch in "${mismatches[@]}"; do
    printf '  - %s\n' "$mismatch" >&2
  done
  exit 1
fi

printf 'Functional env parity OK: %s and %s\n' "$PROD_ENV" "$STAGING_ENV"
```

- [ ] **Step 2: Make the script executable**

Run:

```bash
chmod +x scripts/check-env-functional-parity.sh
```

Expected: no output.

- [ ] **Step 3: Run the checker before env changes**

Run:

```bash
scripts/check-env-functional-parity.sh
```

Expected: FAIL with mismatches for current known drift, including `JAVA_TOOL_OPTIONS`, auth caps, password-reset email, ingestion polling/freshness, cache TTLs, and push settings. The output must not print secret values.

- [ ] **Step 4: Commit the checker**

Run:

```bash
git add scripts/check-env-functional-parity.sh
git commit -m "chore: add env parity checker"
```

## Task 2: Align Env Examples and Local Staging Env

**Files:**
- Modify: `.env.production.example`
- Modify: `.env.staging.example`
- Modify: `.env.staging`

- [ ] **Step 1: Update `.env.production.example` non-secret functional values**

Apply these exact production-functional values in `.env.production.example`:

```bash
JAVA_TOOL_OPTIONS=-Xmx4g

LINEWATCH_AUTH_RATE_LIMIT_AUTH_MAX_REQUESTS=12
LINEWATCH_AUTH_RATE_LIMIT_PASSWORD_RESET_MAX_REQUESTS=5
LINEWATCH_AUTH_RATE_LIMIT_DEMO_MAX_REQUESTS=20
LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS=false

LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_ENABLED=true
LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_FROM=no-reply@linewatchto.ca
SPRING_MAIL_HOST=smtp.resend.com
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=resend
SPRING_MAIL_PASSWORD=replace_with_resend_api_key
SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=true
SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=true

LINEWATCH_INGESTION_ALERTS_ENABLED=true
LINEWATCH_INGESTION_ALERTS_URL=https://alerts.ttc.ca/api/alerts/live-alerts
LINEWATCH_INGESTION_ALERTS_FIXED_DELAY=PT30S
LINEWATCH_INGESTION_ALERTS_MAX_DASHBOARD_AGE=PT6M
LINEWATCH_INGESTION_ALERTS_CONNECT_TIMEOUT=PT3S
LINEWATCH_INGESTION_ALERTS_READ_TIMEOUT=PT8S

LINEWATCH_PERFORMANCE_TTC_REFRESH_INTERVAL=PT24H
LINEWATCH_PERFORMANCE_TTC_MAX_AGE=PT48H

LINEWATCH_CACHE_DASHBOARD_STATUS_TTL=PT30S
LINEWATCH_CACHE_DASHBOARD_MAP_TTL=PT30S
LINEWATCH_CACHE_DASHBOARD_ALERTS_TTL=PT15S
LINEWATCH_CACHE_DASHBOARD_INGESTION_HEALTH_TTL=PT15S
LINEWATCH_CACHE_DASHBOARD_PERFORMANCE_TTL=PT6H

LINEWATCH_PUSH_ENABLED=true
LINEWATCH_PUSH_VAPID_PUBLIC_KEY=replace_with_vapid_public_key
LINEWATCH_PUSH_VAPID_PRIVATE_KEY=replace_with_vapid_private_key
LINEWATCH_PUSH_VAPID_SUBJECT=mailto:hostmaster@linewatchto.ca
LINEWATCH_PUSH_EVALUATION_DELAY_MS=30000
```

Keep production-only identity values as production values:

```bash
POSTGRES_DB=linewatch
POSTGRES_USER=linewatch
LINEWATCH_AUTH_ALLOWED_ORIGINS=https://linewatchto.ca,https://www.linewatchto.ca
LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL=https://linewatchto.ca
LINEWATCH_ENVIRONMENT=production
LINEWATCH_OBSERVABILITY_HOST=oracle-vps-1
```

- [ ] **Step 2: Update `.env.staging.example` to match functional values**

Apply the same functional values from Step 1 in `.env.staging.example`, with staging identity values preserved:

```bash
POSTGRES_DB=linewatch_staging
POSTGRES_USER=linewatch_staging
LINEWATCH_AUTH_ALLOWED_ORIGINS=https://staging.linewatchto.ca
LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL=https://staging.linewatchto.ca
LINEWATCH_ENVIRONMENT=staging
LINEWATCH_OBSERVABILITY_HOST=dev-server-staging
LINEWATCH_OBSERVABILITY_COMPOSE_PROJECT=linewatch-staging
```

Use staging-scoped fake secret labels in the example:

```bash
POSTGRES_PASSWORD=linewatch_staging_password_change_me
SPRING_MAIL_PASSWORD=replace_with_staging_resend_api_key
LINEWATCH_PUSH_VAPID_PUBLIC_KEY=replace_with_staging_vapid_public_key
LINEWATCH_PUSH_VAPID_PRIVATE_KEY=replace_with_staging_vapid_private_key
```

- [ ] **Step 3: Update ignored local `.env.staging`**

Apply the same non-secret functional values from Step 1 to `.env.staging`. Preserve existing staging-owned secret values for these keys:

```bash
POSTGRES_PASSWORD
LINEWATCH_CLOUDFLARED_TUNNEL_TOKEN
SPRING_MAIL_PASSWORD
LINEWATCH_PUSH_VAPID_PUBLIC_KEY
LINEWATCH_PUSH_VAPID_PRIVATE_KEY
```

Set local staging identity values to staging:

```bash
LINEWATCH_AUTH_ALLOWED_ORIGINS=https://staging.linewatchto.ca
LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL=https://staging.linewatchto.ca
LINEWATCH_ENVIRONMENT=staging
LINEWATCH_OBSERVABILITY_HOST=dev-server-staging
LINEWATCH_OBSERVABILITY_COMPOSE_PROJECT=linewatch-staging
NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN=
```

- [ ] **Step 4: Run parity checker on examples**

Run:

```bash
scripts/check-env-functional-parity.sh
```

Expected: PASS with `Functional env parity OK`.

- [ ] **Step 5: Run parity checker on production example vs local staging**

Run:

```bash
scripts/check-env-functional-parity.sh .env.production.example .env.staging
```

Expected: PASS with `Functional env parity OK`. The script should ignore staging-specific identity values and not print secret values.

- [ ] **Step 6: Commit env example changes**

Run:

```bash
git add .env.production.example .env.staging.example
git commit -m "chore: align staging env with production behavior"
```

Do not add `.env.staging`; it is intentionally ignored.

## Task 3: Update Staging Documentation

**Files:**
- Modify: `docs/staging.md`

- [ ] **Step 1: Replace the opening description**

Replace:

```markdown
Staging is production-like enough for week-long feature validation, but it is not production:
```

with:

```markdown
Staging is intended to be production-functional for owner testing, while remaining isolated from production:
```

- [ ] **Step 2: Replace first-time setup guidance**

Replace the current setup bullet list under `Edit .env.staging` with:

```markdown
- Replace `POSTGRES_PASSWORD`.
- Set `LINEWATCH_STAGING_HOSTNAME` to the staging hostname.
- Set `LINEWATCH_STAGING_PUBLIC_ORIGIN` to `https://<staging-hostname>`.
- Update `LINEWATCH_AUTH_ALLOWED_ORIGINS` to the same public origin.
- Update `LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL` to the same public origin.
- Configure staging-owned SMTP credentials if password-reset email should be exercised.
- Configure staging-owned VAPID keys if Web Push should be exercised.
- Leave Grafana and Cloudflare Web Analytics values blank unless observability or analytics are under test.
```

- [ ] **Step 3: Add parity boundary section**

Add this section after the setup bullets:

````markdown
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
````

- [ ] **Step 4: Update validation checklist wording**

Replace:

```markdown
- Password reset dev link flow works when email is disabled.
```

with:

```markdown
- Password reset email flow works when staging SMTP credentials are configured.
```

Replace:

```markdown
- Web Push works only if separate staging VAPID keys are configured and browser permission is granted.
```

with:

```markdown
- Web Push works when staging VAPID keys are configured, browser permission is granted, and fresh dashboard-visible impacts exist.
```

- [ ] **Step 5: Commit documentation**

Run:

```bash
git add docs/staging.md
git commit -m "docs: clarify staging env parity"
```

## Task 4: Verification

**Files:**
- Verify: `scripts/check-env-functional-parity.sh`
- Verify: `docker-compose.staging.yml`
- Verify: `.env.production.example`
- Verify: `.env.staging.example`
- Verify: `.env.staging`

- [ ] **Step 1: Shell syntax check**

Run:

```bash
bash -n scripts/check-env-functional-parity.sh
```

Expected: no output and exit code 0.

- [ ] **Step 2: Run parity checks**

Run:

```bash
scripts/check-env-functional-parity.sh
scripts/check-env-functional-parity.sh .env.production.example .env.staging
```

Expected: both commands print `Functional env parity OK`.

- [ ] **Step 3: Validate staging Compose config**

Run:

```bash
scripts/staging-compose.sh config >/tmp/linewatch-staging-compose.yml
```

Expected: exit code 0. If Docker is unavailable, report the exact failure.

- [ ] **Step 4: Inspect Git status**

Run:

```bash
git status --short
```

Expected: tracked changes are committed. `.env.staging` may be modified locally but remains ignored and absent from Git status.
