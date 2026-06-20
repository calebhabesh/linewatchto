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
