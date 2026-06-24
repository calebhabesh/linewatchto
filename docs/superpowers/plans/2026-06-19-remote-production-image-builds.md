# Remote Production Image Builds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build LineWatchTO production images on the development server, publish immutable ARM64 images to public GHCR packages, and deploy those images to the Oracle VPS without building there.

**Architecture:** A shared Bash helper owns release-tag validation, image-reference generation, release-file reads/writes, and Compose invocation. A development-server script uses Docker Buildx to publish the frontend, backend, and PostGIS images under one full Git SHA. The production Compose file consumes those images, while VPS scripts load server-local runtime and release env files, pull the full candidate image set, start it with `--no-build`, and promote the release tag only after health checks pass.

**Tech Stack:** Bash, Docker Buildx, Docker Compose, GitHub Container Registry, OCI image metadata, existing Caddy/Next.js/Spring Boot/PostgreSQL/PostGIS/Redis stack.

---

## File Map

- Modify: `.gitignore` to allow a committed `.env.release.example` while continuing to ignore `.env.release`.
- Modify: `.dockerignore` to allow the release example without sending real env files into Docker build contexts.
- Modify: `.env.production.example` to remove frontend build-time values from VPS runtime configuration.
- Create: `.env.release.example` as the non-secret production image-selection template.
- Create: `scripts/lib/prod-release.sh` for shared validation, image naming, release file, and Compose functions.
- Create: `scripts/tests/prod-release-tools.test.sh` as the dependency-free shell test suite.
- Create: `scripts/prod-build-push.sh` for clean-worktree ARM64 Buildx builds and GHCR pushes.
- Create: `scripts/prod-compose.sh` as the standard production Compose wrapper.
- Create: `scripts/prod-deploy.sh` for candidate pull, health-gated startup, and release-file promotion.
- Modify: `scripts/prod-backup-postgres.sh` to use the production Compose wrapper.
- Modify: `docker-compose.prod.yml` to consume immutable GHCR images and contain no application `build:` definitions.
- Modify: `README.md` with the manual release workflow, registry bootstrap, rollback, and verification.
- Modify: `docs/production-vps.md` with development-server and VPS responsibilities.
- Modify: `AGENTS.md` and `GEMINI.md` together with the new infrastructure commands and deployment reality.

## Task 1: Lock The Production Image Contract With Failing Tests

**Files:**
- Create: `scripts/tests/prod-release-tools.test.sh`
- Modify: `.gitignore`
- Modify: `.dockerignore`
- Create: `.env.release.example`
- Modify: `.env.production.example`
- Modify: `docker-compose.prod.yml`

- [ ] **Step 1: Create the initial Compose contract tests**

Create `scripts/tests/prod-release-tools.test.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.prod.yml"
PROD_ENV="$ROOT_DIR/.env.production.example"
TEST_SHA="0123456789abcdef0123456789abcdef01234567"
PASS_COUNT=0
TEST_TMP="$(mktemp -d)"
trap 'rm -rf "$TEST_TMP"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
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

run_test() {
  local name="$1"
  shift
  "$@"
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "PASS: $name"
}

test_compose_requires_release_tag() {
  local output
  if output="$(
    LINEWATCH_PROD_ENV_FILE="$PROD_ENV" \
      docker compose --env-file "$PROD_ENV" -f "$COMPOSE_FILE" config 2>&1
  )"; then
    fail "Compose config unexpectedly succeeded without LINEWATCH_IMAGE_TAG"
  fi
  assert_contains "$output" "LINEWATCH_IMAGE_TAG"
}

test_compose_uses_registry_images_without_builds() {
  local release_env rendered
  release_env="$(mktemp "$TEST_TMP/release.XXXXXX")"

  cat >"$release_env" <<EOF
LINEWATCH_IMAGE_REGISTRY=ghcr.io/calebhabesh
LINEWATCH_IMAGE_TAG=$TEST_SHA
EOF

  rendered="$(
    LINEWATCH_PROD_ENV_FILE="$PROD_ENV" \
      docker compose \
        --env-file "$PROD_ENV" \
        --env-file "$release_env" \
        -f "$COMPOSE_FILE" \
        config
  )"

  assert_contains "$rendered" "ghcr.io/calebhabesh/linewatch-postgres:$TEST_SHA"
  assert_contains "$rendered" "ghcr.io/calebhabesh/linewatch-backend:$TEST_SHA"
  assert_contains "$rendered" "ghcr.io/calebhabesh/linewatch-frontend:$TEST_SHA"
  assert_not_contains "$rendered" "build:"
}

run_test "Compose requires a release tag" test_compose_requires_release_tag
run_test "Compose uses immutable registry images" test_compose_uses_registry_images_without_builds

echo "$PASS_COUNT tests passed"
```

- [ ] **Step 2: Run the tests and verify the expected failure**

Run:

```bash
bash scripts/tests/prod-release-tools.test.sh
```

Expected: FAIL because the current Compose file neither requires
`LINEWATCH_IMAGE_TAG` nor renders GHCR image references.

- [ ] **Step 3: Add the release env template and ignore exceptions**

Add this exception after `!.env.production.example` in both `.gitignore` and
`.dockerignore`:

```gitignore
!.env.release.example
```

Create `.env.release.example`:

```dotenv
# Copy this file to .env.release on the VPS.
# This selects one immutable production image set and contains no secrets.

LINEWATCH_IMAGE_REGISTRY=ghcr.io/calebhabesh
LINEWATCH_IMAGE_TAG=0123456789abcdef0123456789abcdef01234567
```

Remove these build-time values from `.env.production.example`:

```dotenv
NEXT_PUBLIC_LINEWATCH_APP_VERSION=0.1.0
NEXT_PUBLIC_LINEWATCH_BUILD_LABEL=prod
```

- [ ] **Step 4: Replace production builds with immutable image references**

In `docker-compose.prod.yml`, replace the `postgres` build block with:

```yaml
    image: ${LINEWATCH_IMAGE_REGISTRY:-ghcr.io/calebhabesh}/linewatch-postgres:${LINEWATCH_IMAGE_TAG:?Set LINEWATCH_IMAGE_TAG in .env.release}
```

Replace the `backend` build block with:

```yaml
    image: ${LINEWATCH_IMAGE_REGISTRY:-ghcr.io/calebhabesh}/linewatch-backend:${LINEWATCH_IMAGE_TAG:?Set LINEWATCH_IMAGE_TAG in .env.release}
```

Replace the `frontend` build block, including its build args, with:

```yaml
    image: ${LINEWATCH_IMAGE_REGISTRY:-ghcr.io/calebhabesh}/linewatch-frontend:${LINEWATCH_IMAGE_TAG:?Set LINEWATCH_IMAGE_TAG in .env.release}
```

Do not change Caddy, Redis, networks, volumes, health checks, or runtime
environment wiring.

- [ ] **Step 5: Run the contract tests**

Run:

```bash
bash scripts/tests/prod-release-tools.test.sh
```

Expected:

```text
PASS: Compose requires a release tag
PASS: Compose uses immutable registry images
2 tests passed
```

- [ ] **Step 6: Commit the production image contract**

Run:

```bash
git add .gitignore .dockerignore .env.production.example .env.release.example \
  docker-compose.prod.yml scripts/tests/prod-release-tools.test.sh
git diff --cached --check
git commit -m "chore: consume immutable production images"
```

## Task 2: Add Tested Release Helpers

**Files:**
- Create: `scripts/lib/prod-release.sh`
- Modify: `scripts/tests/prod-release-tools.test.sh`

- [ ] **Step 1: Add failing helper tests**

Append setup near the top of `scripts/tests/prod-release-tools.test.sh`:

```bash
# shellcheck source=../lib/prod-release.sh
source "$ROOT_DIR/scripts/lib/prod-release.sh"
```

Add these tests before the `run_test` calls:

```bash
test_full_sha_validation() {
  linewatch_validate_image_tag "$TEST_SHA"

  if linewatch_validate_image_tag "0123456"; then
    fail "short SHA unexpectedly passed validation"
  fi

  if linewatch_validate_image_tag "zzzz456789abcdef0123456789abcdef01234567"; then
    fail "non-hex SHA unexpectedly passed validation"
  fi
}

test_image_reference_generation() {
  local actual
  actual="$(
    linewatch_image_ref \
      "ghcr.io/calebhabesh/" \
      "frontend" \
      "$TEST_SHA"
  )"
  [[ "$actual" == "ghcr.io/calebhabesh/linewatch-frontend:$TEST_SHA" ]] \
    || fail "unexpected image reference: $actual"
}

test_release_file_round_trip() {
  local release_env actual
  release_env="$(mktemp "$TEST_TMP/release.XXXXXX")"

  linewatch_write_release_env \
    "$release_env" \
    "ghcr.io/calebhabesh/" \
    "$TEST_SHA"

  actual="$(linewatch_read_release_value "$release_env" LINEWATCH_IMAGE_TAG)"
  [[ "$actual" == "$TEST_SHA" ]] || fail "release tag did not round trip"

  actual="$(linewatch_read_release_value "$release_env" LINEWATCH_IMAGE_REGISTRY)"
  [[ "$actual" == "ghcr.io/calebhabesh" ]] || fail "registry was not normalized"
}

test_clean_worktree_guard() {
  local repo
  repo="$(mktemp -d "$TEST_TMP/repo.XXXXXX")"

  git -C "$repo" init -q
  git -C "$repo" config user.name "LineWatch Test"
  git -C "$repo" config user.email "linewatch-test@example.invalid"
  printf 'clean\n' >"$repo/tracked.txt"
  git -C "$repo" add tracked.txt
  git -C "$repo" commit -qm "test fixture"

  linewatch_require_clean_worktree "$repo"

  printf 'dirty\n' >>"$repo/tracked.txt"
  if linewatch_require_clean_worktree "$repo"; then
    fail "dirty worktree unexpectedly passed validation"
  fi
}
```

Add these invocations before the final count:

```bash
run_test "Full SHA validation" test_full_sha_validation
run_test "Image reference generation" test_image_reference_generation
run_test "Release file round trip" test_release_file_round_trip
run_test "Clean worktree guard" test_clean_worktree_guard
```

- [ ] **Step 2: Run the tests and verify the expected failure**

Run:

```bash
bash scripts/tests/prod-release-tools.test.sh
```

Expected: FAIL because `scripts/lib/prod-release.sh` does not exist.

- [ ] **Step 3: Implement the shared release helper**

Create `scripts/lib/prod-release.sh`:

```bash
#!/usr/bin/env bash

linewatch_die() {
  echo "Error: $*" >&2
  return 1
}

linewatch_validate_image_tag() {
  local tag="${1:-}"
  [[ "$tag" =~ ^[0-9a-f]{40}$ ]] || {
    linewatch_die "image tag must be a full 40-character lowercase Git SHA"
    return 1
  }
}

linewatch_normalize_registry() {
  local registry="${1:-}"
  registry="${registry%/}"
  [[ -n "$registry" ]] || {
    linewatch_die "image registry cannot be empty"
    return 1
  }
  printf '%s\n' "$registry"
}

linewatch_image_ref() {
  local registry component tag
  registry="$(linewatch_normalize_registry "${1:-}")" || return 1
  component="${2:-}"
  tag="${3:-}"

  [[ "$component" =~ ^(frontend|backend|postgres)$ ]] || {
    linewatch_die "unsupported image component: $component"
    return 1
  }
  linewatch_validate_image_tag "$tag" || return 1

  printf '%s/linewatch-%s:%s\n' "$registry" "$component" "$tag"
}

linewatch_require_clean_worktree() {
  local repo="${1:-}"
  local status
  status="$(git -C "$repo" status --porcelain)" || return 1
  [[ -z "$status" ]] || {
    echo "$status" >&2
    linewatch_die "release builds require a clean Git worktree"
    return 1
  }
}

linewatch_write_release_env() {
  local output="${1:-}"
  local registry tag temp
  registry="$(linewatch_normalize_registry "${2:-}")" || return 1
  tag="${3:-}"
  linewatch_validate_image_tag "$tag" || return 1

  umask 077
  temp="${output}.tmp.$$"
  {
    printf 'LINEWATCH_IMAGE_REGISTRY=%s\n' "$registry"
    printf 'LINEWATCH_IMAGE_TAG=%s\n' "$tag"
  } >"$temp"
  mv "$temp" "$output"
}

linewatch_read_release_value() {
  local file="${1:-}"
  local key="${2:-}"
  [[ -f "$file" ]] || return 1
  sed -n "s/^${key}=//p" "$file" | tail -n 1
}

linewatch_compose() {
  local root_dir="${LINEWATCH_ROOT_DIR:?Set LINEWATCH_ROOT_DIR}"
  local prod_env="${LINEWATCH_PROD_ENV_FILE:-$root_dir/.env.production}"
  local release_env="${LINEWATCH_RELEASE_ENV_FILE:-$root_dir/.env.release}"
  local compose_file="${LINEWATCH_PROD_COMPOSE_FILE:-$root_dir/docker-compose.prod.yml}"
  local docker_bin="${DOCKER_BIN:-docker}"

  [[ -f "$prod_env" ]] || {
    linewatch_die "missing production env file: $prod_env"
    return 1
  }
  [[ -f "$release_env" ]] || {
    linewatch_die "missing release env file: $release_env"
    return 1
  }

  LINEWATCH_PROD_ENV_FILE="$prod_env" \
    "$docker_bin" compose \
      --env-file "$prod_env" \
      --env-file "$release_env" \
      -f "$compose_file" \
      "$@"
}
```

- [ ] **Step 4: Run the helper tests**

Run:

```bash
bash scripts/tests/prod-release-tools.test.sh
```

Expected: all six tests pass.

- [ ] **Step 5: Check shell syntax**

Run:

```bash
bash -n scripts/lib/prod-release.sh scripts/tests/prod-release-tools.test.sh
```

Expected: exit code `0`.

- [ ] **Step 6: Commit the shared release helper**

Run:

```bash
git add scripts/lib/prod-release.sh scripts/tests/prod-release-tools.test.sh
git diff --cached --check
git commit -m "chore: add production release helpers"
```

## Task 3: Build And Push ARM64 Images From The Development Server

**Files:**
- Create: `scripts/prod-build-push.sh`
- Modify: `scripts/tests/prod-release-tools.test.sh`

- [ ] **Step 1: Add a failing build command test**

Add this test before the `run_test` calls:

```bash
test_build_script_targets_arm64_registry_images() {
  local temp_dir fake_docker log output
  temp_dir="$(mktemp -d "$TEST_TMP/build.XXXXXX")"
  log="$temp_dir/docker.log"
  fake_docker="$temp_dir/docker"

  cat >"$fake_docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"${FAKE_DOCKER_LOG:?}"
if [[ "$*" == "buildx inspect linewatch-prod-builder" ]]; then
  exit 1
fi
EOF
  chmod +x "$fake_docker"

  output="$(
    FAKE_DOCKER_LOG="$log" \
    DOCKER_BIN="$fake_docker" \
    LINEWATCH_SKIP_CLEAN_CHECK=true \
    LINEWATCH_RELEASE_SHA="$TEST_SHA" \
      "$ROOT_DIR/scripts/prod-build-push.sh"
  )"

  assert_contains "$(cat "$log")" "buildx create --name linewatch-prod-builder"
  assert_contains "$(cat "$log")" "--platform linux/arm64"
  assert_contains "$(cat "$log")" "linewatch-frontend:$TEST_SHA"
  assert_contains "$(cat "$log")" "linewatch-backend:$TEST_SHA"
  assert_contains "$(cat "$log")" "linewatch-postgres:$TEST_SHA"
  assert_contains "$output" "scripts/prod-deploy.sh $TEST_SHA"
}
```

Add:

```bash
run_test "Build script targets ARM64 registry images" test_build_script_targets_arm64_registry_images
```

`LINEWATCH_SKIP_CLEAN_CHECK` is test-only and must accept only the literal value
`true`.

- [ ] **Step 2: Run the tests and verify the expected failure**

Run:

```bash
bash scripts/tests/prod-release-tools.test.sh
```

Expected: FAIL because `scripts/prod-build-push.sh` does not exist.

- [ ] **Step 3: Implement the development-server build script**

Create `scripts/prod-build-push.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/prod-release.sh
source "$ROOT_DIR/scripts/lib/prod-release.sh"

DOCKER_BIN="${DOCKER_BIN:-docker}"
REGISTRY="$(linewatch_normalize_registry "${LINEWATCH_IMAGE_REGISTRY:-ghcr.io/calebhabesh}")"
PLATFORM="${LINEWATCH_IMAGE_PLATFORM:-linux/arm64}"
BUILDER="${LINEWATCH_BUILDX_BUILDER:-linewatch-prod-builder}"
SOURCE_URL="https://github.com/calebhabesh/ttc-reliability-navigator"

if [[ "${LINEWATCH_SKIP_CLEAN_CHECK:-false}" != "true" ]]; then
  linewatch_require_clean_worktree "$ROOT_DIR"
fi

SHA="${LINEWATCH_RELEASE_SHA:-$(git -C "$ROOT_DIR" rev-parse HEAD)}"
linewatch_validate_image_tag "$SHA"
SHORT_SHA="${SHA:0:12}"

"$DOCKER_BIN" info >/dev/null
"$DOCKER_BIN" buildx version >/dev/null

if ! "$DOCKER_BIN" buildx inspect "$BUILDER" >/dev/null 2>&1; then
  "$DOCKER_BIN" buildx create \
    --name "$BUILDER" \
    --driver docker-container \
    --use
else
  "$DOCKER_BIN" buildx use "$BUILDER"
fi
"$DOCKER_BIN" buildx inspect "$BUILDER" --bootstrap >/dev/null

build_and_push() {
  local component dockerfile context
  component="$1"
  dockerfile="$2"
  context="$3"
  shift 3

  "$DOCKER_BIN" buildx build \
    --builder "$BUILDER" \
    --platform "$PLATFORM" \
    --file "$dockerfile" \
    --label "org.opencontainers.image.source=$SOURCE_URL" \
    --label "org.opencontainers.image.revision=$SHA" \
    --tag "$(linewatch_image_ref "$REGISTRY" "$component" "$SHA")" \
    --push \
    "$@" \
    "$context"
}

build_and_push backend "$ROOT_DIR/backend/Dockerfile" "$ROOT_DIR"
build_and_push postgres "$ROOT_DIR/infra/postgres/Dockerfile" "$ROOT_DIR"
build_and_push frontend "$ROOT_DIR/frontend/Dockerfile" "$ROOT_DIR/frontend" \
  --build-arg "NEXT_PUBLIC_LINEWATCH_APP_VERSION=0.1.0" \
  --build-arg "NEXT_PUBLIC_LINEWATCH_BUILD_LABEL=prod-$SHORT_SHA"

cat <<EOF
Published LineWatchTO release:
  $REGISTRY/linewatch-frontend:$SHA
  $REGISTRY/linewatch-backend:$SHA
  $REGISTRY/linewatch-postgres:$SHA

Deploy on the VPS:
  scripts/prod-deploy.sh $SHA
EOF
```

- [ ] **Step 4: Run the build-script test**

Run:

```bash
bash scripts/tests/prod-release-tools.test.sh
```

Expected: all seven tests pass.

- [ ] **Step 5: Check shell syntax**

Run:

```bash
bash -n scripts/prod-build-push.sh scripts/tests/prod-release-tools.test.sh
```

Expected: exit code `0`.

- [ ] **Step 6: Commit the build script**

Run:

```bash
git add scripts/prod-build-push.sh scripts/tests/prod-release-tools.test.sh
git diff --cached --check
git commit -m "chore: build production images on dev server"
```

## Task 4: Add The Production Compose Wrapper

**Files:**
- Create: `scripts/prod-compose.sh`
- Modify: `scripts/prod-backup-postgres.sh`
- Modify: `scripts/tests/prod-release-tools.test.sh`

- [ ] **Step 1: Add a failing wrapper test**

Add:

```bash
test_compose_wrapper_loads_runtime_and_release_env() {
  local temp_dir fake_docker log prod_env release_env
  temp_dir="$(mktemp -d "$TEST_TMP/compose.XXXXXX")"
  log="$temp_dir/docker.log"
  prod_env="$temp_dir/.env.production"
  release_env="$temp_dir/.env.release"
  printf 'POSTGRES_PASSWORD=test\n' >"$prod_env"
  linewatch_write_release_env "$release_env" "ghcr.io/calebhabesh" "$TEST_SHA"

  fake_docker="$temp_dir/docker"
  cat >"$fake_docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >"${FAKE_DOCKER_LOG:?}"
EOF
  chmod +x "$fake_docker"

  FAKE_DOCKER_LOG="$log" \
  DOCKER_BIN="$fake_docker" \
  LINEWATCH_PROD_ENV_FILE="$prod_env" \
  LINEWATCH_RELEASE_ENV_FILE="$release_env" \
    "$ROOT_DIR/scripts/prod-compose.sh" ps

  assert_contains "$(cat "$log")" "--env-file $prod_env"
  assert_contains "$(cat "$log")" "--env-file $release_env"
  assert_contains "$(cat "$log")" "docker-compose.prod.yml ps"
}
```

Add:

```bash
run_test "Compose wrapper loads both env files" test_compose_wrapper_loads_runtime_and_release_env
```

- [ ] **Step 2: Run the tests and verify the expected failure**

Run:

```bash
bash scripts/tests/prod-release-tools.test.sh
```

Expected: FAIL because `scripts/prod-compose.sh` does not exist.

- [ ] **Step 3: Implement the Compose wrapper**

Create `scripts/prod-compose.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/prod-release.sh
source "$ROOT_DIR/scripts/lib/prod-release.sh"

export LINEWATCH_ROOT_DIR="$ROOT_DIR"
linewatch_compose "$@"
```

Do not source env files as shell code. Compose parses them.

- [ ] **Step 4: Route backups through the wrapper**

Replace the Compose invocation in `scripts/prod-backup-postgres.sh` with:

```bash
LINEWATCH_PROD_ENV_FILE="$ENV_FILE" \
LINEWATCH_RELEASE_ENV_FILE="${LINEWATCH_RELEASE_ENV_FILE:-$ROOT_DIR/.env.release}" \
LINEWATCH_PROD_COMPOSE_FILE="$COMPOSE_FILE" \
  "$ROOT_DIR/scripts/prod-compose.sh" exec -T postgres \
    sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip >"$OUTPUT"
```

This keeps backups compatible with the required image tag.

- [ ] **Step 5: Run tests and syntax checks**

Run:

```bash
bash scripts/tests/prod-release-tools.test.sh
bash -n scripts/prod-compose.sh scripts/prod-backup-postgres.sh
```

Expected: all eight tests pass; syntax checks return `0`.

- [ ] **Step 6: Commit the wrapper and backup integration**

Run:

```bash
git add scripts/prod-compose.sh scripts/prod-backup-postgres.sh \
  scripts/tests/prod-release-tools.test.sh
git diff --cached --check
git commit -m "chore: add production compose wrapper"
```

## Task 5: Add Health-Gated VPS Deployment

**Files:**
- Create: `scripts/prod-deploy.sh`
- Modify: `scripts/tests/prod-release-tools.test.sh`

- [ ] **Step 1: Add failing deployment promotion tests**

Add a helper and two tests:

```bash
make_fake_deploy_docker() {
  local path="$1"
  cat >"$path" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"${FAKE_DOCKER_LOG:?}"
if [[ "$*" == *"compose "*" up "* ]] && [[ "${FAKE_DOCKER_UP_FAIL:-false}" == "true" ]]; then
  exit 23
fi
EOF
  chmod +x "$path"
}

test_deploy_promotes_release_after_healthy_start() {
  local temp_dir prod_env release_env fake_docker log new_sha
  temp_dir="$(mktemp -d "$TEST_TMP/deploy-success.XXXXXX")"
  prod_env="$temp_dir/.env.production"
  release_env="$temp_dir/.env.release"
  log="$temp_dir/docker.log"
  fake_docker="$temp_dir/docker"
  new_sha="abcdef0123456789abcdef0123456789abcdef01"

  printf 'POSTGRES_PASSWORD=test\n' >"$prod_env"
  linewatch_write_release_env "$release_env" "ghcr.io/calebhabesh" "$TEST_SHA"
  make_fake_deploy_docker "$fake_docker"

  FAKE_DOCKER_LOG="$log" \
  DOCKER_BIN="$fake_docker" \
  LINEWATCH_PROD_ENV_FILE="$prod_env" \
  LINEWATCH_RELEASE_ENV_FILE="$release_env" \
  LINEWATCH_DEPLOY_SKIP_CONFIG_CHECK=true \
    "$ROOT_DIR/scripts/prod-deploy.sh" "$new_sha"

  [[ "$(linewatch_read_release_value "$release_env" LINEWATCH_IMAGE_TAG)" == "$new_sha" ]] \
    || fail "successful deploy did not promote the candidate release"
  assert_contains "$(cat "$log")" "pull postgres backend frontend"
  assert_contains "$(cat "$log")" "up -d --no-build --remove-orphans --wait"
}

test_deploy_keeps_previous_release_after_failed_start() {
  local temp_dir prod_env release_env fake_docker log new_sha
  temp_dir="$(mktemp -d "$TEST_TMP/deploy-failure.XXXXXX")"
  prod_env="$temp_dir/.env.production"
  release_env="$temp_dir/.env.release"
  log="$temp_dir/docker.log"
  fake_docker="$temp_dir/docker"
  new_sha="abcdef0123456789abcdef0123456789abcdef01"

  printf 'POSTGRES_PASSWORD=test\n' >"$prod_env"
  linewatch_write_release_env "$release_env" "ghcr.io/calebhabesh" "$TEST_SHA"
  make_fake_deploy_docker "$fake_docker"

  if FAKE_DOCKER_LOG="$log" \
    FAKE_DOCKER_UP_FAIL=true \
    DOCKER_BIN="$fake_docker" \
    LINEWATCH_PROD_ENV_FILE="$prod_env" \
    LINEWATCH_RELEASE_ENV_FILE="$release_env" \
    LINEWATCH_DEPLOY_SKIP_CONFIG_CHECK=true \
      "$ROOT_DIR/scripts/prod-deploy.sh" "$new_sha"; then
    fail "failed Compose startup unexpectedly reported success"
  fi

  [[ "$(linewatch_read_release_value "$release_env" LINEWATCH_IMAGE_TAG)" == "$TEST_SHA" ]] \
    || fail "failed deploy replaced the previous release tag"
}
```

Add:

```bash
run_test "Deploy promotes a healthy candidate" test_deploy_promotes_release_after_healthy_start
run_test "Deploy retains the previous tag on failure" test_deploy_keeps_previous_release_after_failed_start
```

`LINEWATCH_DEPLOY_SKIP_CONFIG_CHECK` is test-only and accepts only `true`.

- [ ] **Step 2: Run the tests and verify the expected failure**

Run:

```bash
bash scripts/tests/prod-release-tools.test.sh
```

Expected: FAIL because `scripts/prod-deploy.sh` does not exist.

- [ ] **Step 3: Implement the deployment script**

Create `scripts/prod-deploy.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/prod-release.sh
source "$ROOT_DIR/scripts/lib/prod-release.sh"

export LINEWATCH_ROOT_DIR="$ROOT_DIR"
PROD_ENV="${LINEWATCH_PROD_ENV_FILE:-$ROOT_DIR/.env.production}"
RELEASE_ENV="${LINEWATCH_RELEASE_ENV_FILE:-$ROOT_DIR/.env.release}"
REGISTRY="$(linewatch_normalize_registry "${LINEWATCH_IMAGE_REGISTRY:-ghcr.io/calebhabesh}")"
TAG="${1:-}"
PREVIOUS_TAG=""
CANDIDATE=""

linewatch_validate_image_tag "$TAG"
[[ -f "$PROD_ENV" ]] || linewatch_die "missing production env file: $PROD_ENV"

if [[ -f "$RELEASE_ENV" ]]; then
  PREVIOUS_TAG="$(linewatch_read_release_value "$RELEASE_ENV" LINEWATCH_IMAGE_TAG || true)"
fi

mkdir -p "$(dirname "$RELEASE_ENV")"
CANDIDATE="$(mktemp "${RELEASE_ENV}.candidate.XXXXXX")"
trap 'rm -f "$CANDIDATE"' EXIT
linewatch_write_release_env "$CANDIDATE" "$REGISTRY" "$TAG"

export LINEWATCH_PROD_ENV_FILE="$PROD_ENV"
export LINEWATCH_RELEASE_ENV_FILE="$CANDIDATE"

if [[ "${LINEWATCH_DEPLOY_SKIP_CONFIG_CHECK:-false}" != "true" ]]; then
  linewatch_compose config >/dev/null
fi

linewatch_compose pull postgres backend frontend

if ! linewatch_compose up \
  -d \
  --no-build \
  --remove-orphans \
  --wait \
  --wait-timeout "${LINEWATCH_DEPLOY_WAIT_SECONDS:-240}"; then
  echo "Deployment failed for release $TAG." >&2
  linewatch_compose ps >&2 || true
  linewatch_compose logs --tail 150 postgres redis backend frontend caddy >&2 || true
  if [[ -n "$PREVIOUS_TAG" ]]; then
    echo "Previous release remains recorded as $PREVIOUS_TAG." >&2
    echo "Rollback command: scripts/prod-deploy.sh $PREVIOUS_TAG" >&2
  fi
  exit 1
fi

mv "$CANDIDATE" "$RELEASE_ENV"
trap - EXIT
export LINEWATCH_RELEASE_ENV_FILE="$RELEASE_ENV"

linewatch_compose ps

cat <<EOF
Deployed LineWatchTO release $TAG.

Public verification:
  LINEWATCH_DEPLOY_FRONTEND_URL=https://linewatchto.ca \\
  LINEWATCH_DEPLOY_BACKEND_URL=https://api.linewatchto.ca \\
  node scripts/smoke-deploy.mjs
EOF
```

- [ ] **Step 4: Run deployment tests and syntax checks**

Run:

```bash
bash scripts/tests/prod-release-tools.test.sh
bash -n scripts/prod-deploy.sh scripts/lib/prod-release.sh
```

Expected: all ten tests pass; syntax checks return `0`.

- [ ] **Step 5: Verify invalid tags fail before Docker runs**

Run:

```bash
scripts/prod-deploy.sh latest
```

Expected: non-zero exit with:

```text
Error: image tag must be a full 40-character lowercase Git SHA
```

- [ ] **Step 6: Commit the deployment script**

Run:

```bash
git add scripts/prod-deploy.sh scripts/tests/prod-release-tools.test.sh
git diff --cached --check
git commit -m "chore: deploy immutable production releases"
```

## Task 6: Document Registry Bootstrap, Release, And Rollback

**Files:**
- Modify: `README.md`
- Modify: `docs/production-vps.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] **Step 1: Update `README.md` deployment instructions**

Replace all production `up -d --build` commands with the manual release flow:

```bash
# One-time development-server registry login
export CR_PAT=your_write_packages_token
printf '%s' "$CR_PAT" | docker login ghcr.io -u calebhabesh --password-stdin
unset CR_PAT

# Build and publish from a clean development-server checkout
scripts/prod-build-push.sh

# Deploy the printed full Git SHA on the VPS
git pull --ff-only
scripts/prod-backup-postgres.sh
scripts/prod-deploy.sh <full-git-sha>
```

Document that the first command-line push creates private GHCR packages. Explain
that all three packages must be linked to the repository, changed to public, and
tested with an anonymous pull before the VPS can deploy without credentials.

Add routine commands:

```bash
scripts/prod-compose.sh config
scripts/prod-compose.sh ps
scripts/prod-compose.sh logs -f caddy frontend backend
```

Add rollback:

```bash
scripts/prod-deploy.sh <previous-full-git-sha>
```

State that Flyway migrations are not automatically reversed and that rollback
across schema changes requires compatibility review or database restore.

- [ ] **Step 2: Update `docs/production-vps.md`**

Document:

- Development server owns Buildx, GHCR write authentication, and image builds.
- VPS owns only Docker Compose runtime, `.env.production`, `.env.release`,
  volumes, Caddy data, and WireGuard access.
- Required VPS files and permissions:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

- First deployment does not run a database backup; later deployments do.
- Standard deploy, health, logs, rollback, and anonymous-pull verification.
- The VPS never runs `docker compose build` or `up --build`.

- [ ] **Step 3: Synchronize `AGENTS.md` and `GEMINI.md`**

Replace:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

with:

```bash
scripts/prod-build-push.sh
scripts/prod-deploy.sh <full-git-sha>
scripts/prod-compose.sh ps
scripts/prod-backup-postgres.sh
```

Add current-reality guidance that production application images are built as
ARM64 artifacts on the development server, published to public GHCR packages,
and selected on the VPS through `.env.release`.

- [ ] **Step 4: Verify synchronized agent guidance**

Run:

```bash
diff -u AGENTS.md GEMINI.md
```

Expected: no output.

- [ ] **Step 5: Search for obsolete production build commands**

Run:

```bash
rg -n "docker compose.*prod.*--build|up -d --build" \
  README.md docs/production-vps.md AGENTS.md GEMINI.md
```

Expected: no matches.

- [ ] **Step 6: Commit documentation**

Run:

```bash
git add README.md docs/production-vps.md AGENTS.md GEMINI.md
git diff --cached --check
git commit -m "docs: document registry based production releases"
```

## Task 7: Full Verification

**Files:**
- Verify all modified production infrastructure and documentation files.

- [ ] **Step 1: Run release-tool tests and shell syntax checks**

Run:

```bash
bash scripts/tests/prod-release-tools.test.sh
bash -n \
  scripts/lib/prod-release.sh \
  scripts/prod-build-push.sh \
  scripts/prod-compose.sh \
  scripts/prod-deploy.sh \
  scripts/prod-backup-postgres.sh \
  scripts/tests/prod-release-tools.test.sh
```

Expected: ten tests pass and all syntax checks return `0`.

- [ ] **Step 2: Render and inspect production Compose**

Run:

```bash
LINEWATCH_PROD_ENV_FILE=.env.production.example \
  docker compose \
    --env-file .env.production.example \
    --env-file .env.release.example \
    -f docker-compose.prod.yml \
    config > /tmp/linewatch-prod-compose.yml

rg -n "image: ghcr.io/calebhabesh/linewatch-(frontend|backend|postgres)" \
  /tmp/linewatch-prod-compose.yml
rg -n "build:" /tmp/linewatch-prod-compose.yml
```

Expected: all three GHCR images appear with the example full SHA; `build:` has
no matches.

- [ ] **Step 3: Run backend verification**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: all backend tests pass.

- [ ] **Step 4: Run frontend verification**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: fixture tests, typecheck, lint, and production build pass.

- [ ] **Step 5: Check formatting and repository state**

Run:

```bash
git diff --check
git status --short --branch
```

Expected: no whitespace errors and only intentional changes before the final
commit.

- [ ] **Step 6: Verify the development-server prerequisites**

Run:

```bash
docker info
docker buildx version
docker buildx inspect linewatch-prod-builder --bootstrap
```

Expected: Docker daemon is reachable and Buildx supports `linux/arm64`. If the
development server lacks the Buildx plugin or Docker daemon permission, report
that exact prerequisite instead of claiming an image publish succeeded.

- [ ] **Step 7: Perform the credentialed publish and registry checks**

On the development server:

```bash
export CR_PAT=your_write_packages_token
printf '%s' "$CR_PAT" | docker login ghcr.io -u calebhabesh --password-stdin
unset CR_PAT
scripts/prod-build-push.sh
```

After making all three GHCR packages public:

```bash
docker logout ghcr.io
docker buildx imagetools inspect \
  ghcr.io/calebhabesh/linewatch-frontend:<full-git-sha>
docker buildx imagetools inspect \
  ghcr.io/calebhabesh/linewatch-backend:<full-git-sha>
docker buildx imagetools inspect \
  ghcr.io/calebhabesh/linewatch-postgres:<full-git-sha>
```

Expected: each image is anonymously readable and its manifest reports
`linux/arm64`.

- [ ] **Step 8: Perform the VPS smoke deployment**

On the VPS:

```bash
git pull --ff-only
scripts/prod-deploy.sh <full-git-sha>

LINEWATCH_DEPLOY_FRONTEND_URL=https://linewatchto.ca \
LINEWATCH_DEPLOY_BACKEND_URL=https://api.linewatchto.ca \
node scripts/smoke-deploy.mjs
```

Expected: all Compose services become healthy and the public smoke checker
passes. Do not claim this step ran unless VPS access, DNS, TLS, and the published
images were actually available.

- [ ] **Step 9: Commit any final verification-only corrections**

If verification required corrections:

```bash
git add <corrected-files>
git diff --cached --check
git commit -m "fix: finalize production release tooling"
```

Otherwise, do not create an empty commit.
