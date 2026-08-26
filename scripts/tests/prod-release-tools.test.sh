#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

source "$ROOT_DIR/scripts/lib/prod-release.sh"

PROD_ENV=.env.production.example
TEST_SHA=0123456789abcdef0123456789abcdef01234567
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

test_harness_failure_fixture() {
  assert_contains "actual" "missing"
  assert_contains "actual" "actual"
}

verify_test_harness() {
  local output
  local status

  set +e
  output="$(run_test "harness failure fixture" test_harness_failure_fixture 2>&1)"
  status=$?
  set -e

  if [[ "$status" -eq 0 ]]; then
    fail "test harness masked an early assertion failure"
    return 1
  fi

  assert_contains "$output" "FAIL: expected output to contain: missing"
  assert_not_contains "$output" "PASS: harness failure fixture"
}

test_requires_release_image_tag() {
  local output
  local status

  set +e
  output="$(
    env -u LINEWATCH_IMAGE_TAG \
      LINEWATCH_PROD_ENV_FILE="$PROD_ENV" \
      docker compose --env-file "$PROD_ENV" -f docker-compose.prod.yml config 2>&1
  )"
  status=$?
  set -e

  if [[ "$status" -eq 0 ]]; then
    fail "Compose rendering succeeded without LINEWATCH_IMAGE_TAG"
    return 1
  fi

  assert_contains "$output" "LINEWATCH_IMAGE_TAG"
}

test_renders_immutable_release_images() {
  local release_env="$TEST_TMP/.env.release"
  local output

  printf '%s\n' \
    'LINEWATCH_IMAGE_REGISTRY=ghcr.io/calebhabesh' \
    "LINEWATCH_IMAGE_TAG=$TEST_SHA" > "$release_env"

  output="$(
    env -u LINEWATCH_IMAGE_REGISTRY -u LINEWATCH_IMAGE_TAG \
      LINEWATCH_PROD_ENV_FILE="$PROD_ENV" \
      docker compose \
        --env-file "$PROD_ENV" \
        --env-file "$release_env" \
        -f docker-compose.prod.yml \
        --profile observability \
        config 2>&1
  )"

  assert_contains "$output" "ghcr.io/calebhabesh/linewatch-postgres:$TEST_SHA"
  assert_contains "$output" "ghcr.io/calebhabesh/linewatch-backend:$TEST_SHA"
  assert_contains "$output" "ghcr.io/calebhabesh/linewatch-frontend:$TEST_SHA"
  assert_contains "$output" "name: linewatchto_postgres_prod_data"
  assert_contains "$output" "name: linewatchto_redis_prod_data"
  assert_contains "$output" "name: linewatchto_caddy_data"
  assert_contains "$output" "name: linewatchto_caddy_config"
  assert_contains "$output" "name: linewatchto_alloy_prod_data"
  assert_contains "$output" "external: true"
  assert_not_contains "$output" "build:"
}

test_initializes_only_missing_external_volumes() {
  local temp_dir
  local fake_docker
  local log
  local output

  temp_dir="$(mktemp -d "$TEST_TMP/volumes.XXXXXX")"
  fake_docker="$temp_dir/docker"
  log="$temp_dir/docker.log"

  cat > "$fake_docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${FAKE_DOCKER_LOG:?}"
if [[ "$*" == "volume inspect linewatchto_postgres_prod_data" ]]; then
  exit 0
fi
if [[ "$*" == volume\ inspect\ * ]]; then
  exit 1
fi
EOF
  chmod +x "$fake_docker"

  output="$(
    FAKE_DOCKER_LOG="$log" \
    DOCKER_BIN="$fake_docker" \
      "$ROOT_DIR/scripts/prod-init-volumes.sh"
  )"

  assert_contains "$output" "Existing production volume: linewatchto_postgres_prod_data"
  assert_not_contains "$(cat "$log")" "volume create --label ca.linewatchto.persistence=production linewatchto_postgres_prod_data"
  assert_contains "$(cat "$log")" "volume create --label ca.linewatchto.persistence=production linewatchto_redis_prod_data"
  assert_contains "$(cat "$log")" "volume create --label ca.linewatchto.persistence=production linewatchto_caddy_data"
  assert_contains "$(cat "$log")" "volume create --label ca.linewatchto.persistence=production linewatchto_caddy_config"
  assert_contains "$(cat "$log")" "volume create --label ca.linewatchto.persistence=production linewatchto_alloy_prod_data"
}

test_validates_full_lowercase_git_sha() {
  local output
  local status

  linewatch_validate_image_tag "$TEST_SHA"

  set +e
  output="$(linewatch_validate_image_tag "0123456" 2>&1)"
  status=$?
  set -e
  assert_equals "$status" "1"
  assert_equals "$output" "Error: image tag must be a full 40-character lowercase Git SHA"

  set +e
  output="$(linewatch_validate_image_tag "zzzz456789abcdef0123456789abcdef01234567" 2>&1)"
  status=$?
  set -e
  assert_equals "$status" "1"
  assert_equals "$output" "Error: image tag must be a full 40-character lowercase Git SHA"
}

test_builds_component_image_reference() {
  local output

  output="$(linewatch_image_ref "ghcr.io/calebhabesh/" frontend "$TEST_SHA")"

  assert_equals "$output" "ghcr.io/calebhabesh/linewatch-frontend:$TEST_SHA"
}

test_release_file_round_trip() {
  local release_env="$TEST_TMP/release-round-trip.env"

  linewatch_write_release_env "$release_env" "ghcr.io/calebhabesh///" "$TEST_SHA"

  assert_equals "$(linewatch_read_release_value "$release_env" LINEWATCH_IMAGE_TAG)" "$TEST_SHA"
  assert_equals \
    "$(linewatch_read_release_value "$release_env" LINEWATCH_IMAGE_REGISTRY)" \
    "ghcr.io/calebhabesh"
}

test_release_file_write_resists_temp_collision() {
  local release_env="$TEST_TMP/secure-release.env"
  local collision="${release_env}.tmp.$$"
  local caller_umask

  printf 'untrusted\n' > "$collision"
  chmod 0644 "$collision"
  umask 0027
  caller_umask="$(umask)"

  linewatch_write_release_env "$release_env" "ghcr.io/calebhabesh" "$TEST_SHA"

  assert_equals "$(stat -c '%a' "$release_env")" "600"
  assert_equals "$(cat "$collision")" "untrusted"
  assert_equals "$(stat -c '%a' "$collision")" "644"
  assert_equals "$(umask)" "$caller_umask"
}

test_rejects_directory_release_output() {
  local output_dir="$TEST_TMP/release-output-directory"
  local output
  local status
  local parent
  local basename
  local artifacts

  mkdir "$output_dir"

  set +e
  output="$(linewatch_write_release_env "$output_dir" "ghcr.io/calebhabesh" "$TEST_SHA" 2>&1)"
  status=$?
  set -e

  assert_equals "$status" "1"

  parent="${output_dir%/*}"
  basename="${output_dir##*/}"
  shopt -s nullglob
  artifacts=(
    "$output_dir"/*
    "${output_dir}.tmp."*
    "$parent/.${basename}.tmp."*
  )
  shopt -u nullglob

  assert_equals "${#artifacts[@]}" "0"
}

test_rejects_empty_release_output() {
  local output
  local status

  set +e
  output="$(linewatch_write_release_env "" "ghcr.io/calebhabesh" "$TEST_SHA" 2>&1)"
  status=$?
  set -e

  assert_equals "$status" "1"
}

test_requires_clean_git_worktree() {
  local repo="$TEST_TMP/clean-worktree"
  local output
  local status

  git init -q "$repo"
  git -C "$repo" config user.email "release-test@example.com"
  git -C "$repo" config user.name "Release Test"
  printf 'clean\n' > "$repo/tracked.txt"
  git -C "$repo" add tracked.txt
  git -C "$repo" commit -qm "test fixture"

  linewatch_require_clean_worktree "$repo"

  printf 'dirty\n' >> "$repo/tracked.txt"
  set +e
  output="$(linewatch_require_clean_worktree "$repo" 2>&1)"
  status=$?
  set -e

  assert_equals "$status" "1"
  assert_contains "$output" " M tracked.txt"
  assert_contains "$output" "Error: release builds require a clean Git worktree"
}

test_build_script_targets_arm64_registry_images() {
  local temp_dir="$TEST_TMP/build-script"
  local fake_docker
  local log
  local output

  mkdir "$temp_dir"
  fake_docker="$temp_dir/docker"
  log="$temp_dir/docker.log"

  cat > "$fake_docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${FAKE_DOCKER_LOG:?}"
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
    NEXT_PUBLIC_LINEWATCH_GOOGLE_SITE_VERIFICATION=google-test-code \
    NEXT_PUBLIC_LINEWATCH_BING_SITE_VERIFICATION=bing-test-code \
      "$ROOT_DIR/scripts/prod-build-push.sh"
  )"

  assert_contains "$(cat "$log")" "buildx create --name linewatch-prod-builder"
  assert_contains "$(cat "$log")" "--platform linux/arm64"
  assert_contains "$(cat "$log")" "--build-arg NEXT_PUBLIC_LINEWATCH_SUPPORT_URL=https://ko-fi.com/linewatchto"
  assert_contains "$(cat "$log")" "--build-arg NEXT_PUBLIC_LINEWATCH_TRAIN_MARKER_REFRESH_MS=4000"
  assert_contains "$(cat "$log")" "--build-arg NEXT_PUBLIC_LINEWATCH_GOOGLE_SITE_VERIFICATION=google-test-code"
  assert_contains "$(cat "$log")" "--build-arg NEXT_PUBLIC_LINEWATCH_BING_SITE_VERIFICATION=bing-test-code"
  assert_contains "$(cat "$log")" "linewatch-frontend:$TEST_SHA"
  assert_contains "$(cat "$log")" "linewatch-backend:$TEST_SHA"
  assert_contains "$(cat "$log")" "linewatch-postgres:$TEST_SHA"
  assert_contains "$output" "scripts/prod-deploy.sh $TEST_SHA"
}

test_compose_wrapper_loads_runtime_and_release_env() {
  local temp_dir
  local fake_docker
  local log
  local prod_env
  local release_env

  temp_dir="$(mktemp -d "$TEST_TMP/compose.XXXXXX")"
  fake_docker="$temp_dir/docker"
  log="$temp_dir/docker.log"
  prod_env="$temp_dir/.env.production"
  release_env="$temp_dir/.env.release"

  printf 'POSTGRES_PASSWORD=test\n' > "$prod_env"
  linewatch_write_release_env "$release_env" "ghcr.io/calebhabesh" "$TEST_SHA"

  cat > "$fake_docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" > "${FAKE_DOCKER_LOG:?}"
EOF
  chmod +x "$fake_docker"

  FAKE_DOCKER_LOG="$log" \
  DOCKER_BIN="$fake_docker" \
  LINEWATCH_PROD_ENV_FILE="$prod_env" \
  LINEWATCH_RELEASE_ENV_FILE="$release_env" \
    "$ROOT_DIR/scripts/prod-compose.sh" ps

  assert_contains "$(cat "$log")" "--env-file $prod_env"
  assert_contains "$(cat "$log")" "--env-file $release_env"
  assert_contains "$(cat "$log")" "--project-name linewatchto"
  assert_contains "$(cat "$log")" "docker-compose.prod.yml ps"

  FAKE_DOCKER_LOG="$log" \
  DOCKER_BIN="$fake_docker" \
  LINEWATCH_PROD_ENV_FILE="$prod_env" \
  LINEWATCH_RELEASE_ENV_FILE="$release_env" \
  LINEWATCH_PROD_COMPOSE_PROJECT=linewatch-override \
    "$ROOT_DIR/scripts/prod-compose.sh" ps

  assert_contains "$(cat "$log")" "--project-name linewatch-override"
}

make_fake_backup_docker() {
  local path="$1"

  cat > "$path" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${FAKE_BACKUP_FAIL:-false}" == "true" ]]; then
  printf 'incomplete dump\n'
  exit 23
fi
printf '%s\n' '-- PostgreSQL database dump complete'
EOF
  chmod +x "$path"
}

test_backup_keeps_only_latest_verified_dump() {
  local temp_dir
  local backup_dir
  local prod_env
  local release_env
  local fake_docker
  local old_backup
  local output
  local backups

  temp_dir="$(mktemp -d "$TEST_TMP/backup-success.XXXXXX")"
  backup_dir="$temp_dir/backups"
  prod_env="$temp_dir/.env.production"
  release_env="$temp_dir/.env.release"
  fake_docker="$temp_dir/docker"
  old_backup="$backup_dir/linewatch-postgres-20000101T000000Z.sql.gz"

  mkdir "$backup_dir"
  printf 'POSTGRES_PASSWORD=test\n' > "$prod_env"
  linewatch_write_release_env "$release_env" "ghcr.io/calebhabesh" "$TEST_SHA"
  make_fake_backup_docker "$fake_docker"
  printf 'old dump\n' | gzip > "$old_backup"

  output="$(
    DOCKER_BIN="$fake_docker" \
    LINEWATCH_BACKUP_DIR="$backup_dir" \
    LINEWATCH_PROD_ENV_FILE="$prod_env" \
    LINEWATCH_RELEASE_ENV_FILE="$release_env" \
      "$ROOT_DIR/scripts/prod-backup-postgres.sh"
  )"

  gzip -t "$output"
  assert_contains "$(gzip -dc "$output")" "PostgreSQL database dump complete"
  [[ ! -e "$old_backup" ]] || fail "expected the older backup to be removed"

  shopt -s nullglob
  backups=("$backup_dir"/linewatch-postgres-*.sql.gz)
  shopt -u nullglob
  assert_equals "${#backups[@]}" "1"
}

test_failed_backup_preserves_previous_dump() {
  local temp_dir
  local backup_dir
  local prod_env
  local release_env
  local fake_docker
  local old_backup
  local output
  local status
  local backups
  local temporary_files

  temp_dir="$(mktemp -d "$TEST_TMP/backup-failure.XXXXXX")"
  backup_dir="$temp_dir/backups"
  prod_env="$temp_dir/.env.production"
  release_env="$temp_dir/.env.release"
  fake_docker="$temp_dir/docker"
  old_backup="$backup_dir/linewatch-postgres-20000101T000000Z.sql.gz"

  mkdir "$backup_dir"
  printf 'POSTGRES_PASSWORD=test\n' > "$prod_env"
  linewatch_write_release_env "$release_env" "ghcr.io/calebhabesh" "$TEST_SHA"
  make_fake_backup_docker "$fake_docker"
  printf 'old dump\n' | gzip > "$old_backup"

  set +e
  output="$(
    FAKE_BACKUP_FAIL=true \
    DOCKER_BIN="$fake_docker" \
    LINEWATCH_BACKUP_DIR="$backup_dir" \
    LINEWATCH_PROD_ENV_FILE="$prod_env" \
    LINEWATCH_RELEASE_ENV_FILE="$release_env" \
      "$ROOT_DIR/scripts/prod-backup-postgres.sh" 2>&1
  )"
  status=$?
  set -e

  assert_equals "$status" "23"
  gzip -t "$old_backup"

  shopt -s nullglob
  backups=("$backup_dir"/linewatch-postgres-*.sql.gz)
  temporary_files=("$backup_dir"/.linewatch-postgres-*.tmp.*)
  shopt -u nullglob
  assert_equals "${#backups[@]}" "1"
  assert_equals "${backups[0]}" "$old_backup"
  assert_equals "${#temporary_files[@]}" "0"
}

make_fake_deploy_docker() {
  local path="$1"

  cat > "$path" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${FAKE_DOCKER_LOG:?}"
if [[ " $* " == *" up "* ]] && [[ "${FAKE_DOCKER_UP_FAIL:-false}" == "true" ]]; then
  exit 23
fi
if [[ "$*" == *"up -d --no-deps --force-recreate --wait"* ]] && [[ "$*" == *" caddy" ]] && [[ "${FAKE_CADDY_RECREATE_FAIL:-false}" == "true" ]]; then
  exit 25
fi
if [[ "$*" == "image prune -a --force" ]] && [[ "${FAKE_DOCKER_PRUNE_FAIL:-false}" == "true" ]]; then
  exit 24
fi
EOF
  chmod +x "$path"
}

test_deploy_promotes_release_after_healthy_start() {
  local temp_dir
  local prod_env
  local release_env
  local fake_docker
  local log
  local output
  local new_sha="abcdef0123456789abcdef0123456789abcdef01"

  temp_dir="$(mktemp -d "$TEST_TMP/deploy-success.XXXXXX")"
  prod_env="$temp_dir/.env.production"
  release_env="$temp_dir/.env.release"
  fake_docker="$temp_dir/docker"
  log="$temp_dir/docker.log"

  printf 'POSTGRES_PASSWORD=test\n' > "$prod_env"
  linewatch_write_release_env "$release_env" "ghcr.io/calebhabesh" "$TEST_SHA"
  make_fake_deploy_docker "$fake_docker"

  output="$(
    FAKE_DOCKER_LOG="$log" \
    DOCKER_BIN="$fake_docker" \
    LINEWATCH_PROD_ENV_FILE="$prod_env" \
    LINEWATCH_RELEASE_ENV_FILE="$release_env" \
    LINEWATCH_DEPLOY_SKIP_CONFIG_CHECK=true \
      "$ROOT_DIR/scripts/prod-deploy.sh" "$new_sha"
  )"

  assert_equals "$(linewatch_read_release_value "$release_env" LINEWATCH_IMAGE_TAG)" "$new_sha"
  assert_contains "$(cat "$log")" "pull postgres backend frontend"
  assert_contains "$(cat "$log")" "up -d --no-build --remove-orphans --wait"
  assert_contains "$(cat "$log")" "run --rm --no-deps --entrypoint caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile"
  assert_contains "$(cat "$log")" "up -d --no-deps --force-recreate --wait"
  assert_contains "$(cat "$log")" "image prune -a --force"
  assert_contains "$output" "Deployed LineWatchTO release $new_sha."
}

test_deploy_keeps_previous_release_when_caddy_recreate_fails() {
  local temp_dir
  local prod_env
  local release_env
  local fake_docker
  local log
  local output
  local status
  local new_sha="abcdef0123456789abcdef0123456789abcdef01"

  temp_dir="$(mktemp -d "$TEST_TMP/deploy-caddy-failure.XXXXXX")"
  prod_env="$temp_dir/.env.production"
  release_env="$temp_dir/.env.release"
  fake_docker="$temp_dir/docker"
  log="$temp_dir/docker.log"

  printf 'POSTGRES_PASSWORD=test\n' > "$prod_env"
  linewatch_write_release_env "$release_env" "ghcr.io/calebhabesh" "$TEST_SHA"
  make_fake_deploy_docker "$fake_docker"

  set +e
  output="$(
    FAKE_DOCKER_LOG="$log" \
    FAKE_CADDY_RECREATE_FAIL=true \
    DOCKER_BIN="$fake_docker" \
    LINEWATCH_PROD_ENV_FILE="$prod_env" \
    LINEWATCH_RELEASE_ENV_FILE="$release_env" \
    LINEWATCH_DEPLOY_SKIP_CONFIG_CHECK=true \
      "$ROOT_DIR/scripts/prod-deploy.sh" "$new_sha" 2>&1
  )"
  status=$?
  set -e

  assert_equals "$status" "1"
  assert_equals "$(linewatch_read_release_value "$release_env" LINEWATCH_IMAGE_TAG)" "$TEST_SHA"
  assert_contains "$output" "Caddy could not restart"
  assert_not_contains "$(cat "$log")" "image prune"
}

test_deploy_keeps_previous_release_after_failed_start() {
  local temp_dir
  local prod_env
  local release_env
  local fake_docker
  local log
  local output
  local status
  local new_sha="abcdef0123456789abcdef0123456789abcdef01"

  temp_dir="$(mktemp -d "$TEST_TMP/deploy-failure.XXXXXX")"
  prod_env="$temp_dir/.env.production"
  release_env="$temp_dir/.env.release"
  fake_docker="$temp_dir/docker"
  log="$temp_dir/docker.log"

  printf 'POSTGRES_PASSWORD=test\n' > "$prod_env"
  linewatch_write_release_env "$release_env" "ghcr.io/calebhabesh" "$TEST_SHA"
  make_fake_deploy_docker "$fake_docker"

  set +e
  output="$(
    FAKE_DOCKER_LOG="$log" \
    FAKE_DOCKER_UP_FAIL=true \
    DOCKER_BIN="$fake_docker" \
    LINEWATCH_PROD_ENV_FILE="$prod_env" \
    LINEWATCH_RELEASE_ENV_FILE="$release_env" \
    LINEWATCH_DEPLOY_SKIP_CONFIG_CHECK=true \
      "$ROOT_DIR/scripts/prod-deploy.sh" "$new_sha" 2>&1
  )"
  status=$?
  set -e

  assert_equals "$status" "1"
  assert_equals "$(linewatch_read_release_value "$release_env" LINEWATCH_IMAGE_TAG)" "$TEST_SHA"
  assert_contains "$output" "Deployment failed for release $new_sha."
  assert_not_contains "$(cat "$log")" "image prune"
}

test_deploy_keeps_success_when_image_prune_fails() {
  local temp_dir
  local prod_env
  local release_env
  local fake_docker
  local log
  local output
  local new_sha="abcdef0123456789abcdef0123456789abcdef01"

  temp_dir="$(mktemp -d "$TEST_TMP/deploy-prune-failure.XXXXXX")"
  prod_env="$temp_dir/.env.production"
  release_env="$temp_dir/.env.release"
  fake_docker="$temp_dir/docker"
  log="$temp_dir/docker.log"

  printf 'POSTGRES_PASSWORD=test\n' > "$prod_env"
  linewatch_write_release_env "$release_env" "ghcr.io/calebhabesh" "$TEST_SHA"
  make_fake_deploy_docker "$fake_docker"

  output="$(
    FAKE_DOCKER_LOG="$log" \
    FAKE_DOCKER_PRUNE_FAIL=true \
    DOCKER_BIN="$fake_docker" \
    LINEWATCH_PROD_ENV_FILE="$prod_env" \
    LINEWATCH_RELEASE_ENV_FILE="$release_env" \
    LINEWATCH_DEPLOY_SKIP_CONFIG_CHECK=true \
      "$ROOT_DIR/scripts/prod-deploy.sh" "$new_sha" 2>&1
  )"

  assert_equals "$(linewatch_read_release_value "$release_env" LINEWATCH_IMAGE_TAG)" "$new_sha"
  assert_contains "$(cat "$log")" "image prune -a --force"
  assert_contains "$output" "Warning: deployment succeeded, but unused Docker image cleanup failed."
  assert_contains "$output" "Deployed LineWatchTO release $new_sha."
}

verify_test_harness
run_test "production Compose requires LINEWATCH_IMAGE_TAG" test_requires_release_image_tag
run_test "production Compose renders immutable release images" test_renders_immutable_release_images
run_test "production volume initialization preserves existing volumes" test_initializes_only_missing_external_volumes
run_test "image tags require full lowercase Git SHAs" test_validates_full_lowercase_git_sha
run_test "component image references are deterministic" test_builds_component_image_reference
run_test "release env files round trip normalized values" test_release_file_round_trip
run_test "release env writes resist temp-file collisions" test_release_file_write_resists_temp_collision
run_test "release env writes reject directory output paths" test_rejects_directory_release_output
run_test "release env writes reject empty output paths" test_rejects_empty_release_output
run_test "release builds require a clean Git worktree" test_requires_clean_git_worktree
run_test "build script targets ARM64 registry images" test_build_script_targets_arm64_registry_images
run_test "Compose wrapper loads both env files" test_compose_wrapper_loads_runtime_and_release_env
run_test "backup retains only the latest verified dump" test_backup_keeps_only_latest_verified_dump
run_test "failed backup preserves the previous dump" test_failed_backup_preserves_previous_dump
run_test "deploy promotes a healthy candidate" test_deploy_promotes_release_after_healthy_start
run_test "deploy retains the previous tag on failure" test_deploy_keeps_previous_release_after_failed_start
run_test "deploy retains the previous tag when Caddy recreation fails" test_deploy_keeps_previous_release_when_caddy_recreate_fails
run_test "deploy remains successful when image cleanup fails" test_deploy_keeps_success_when_image_prune_fails

printf '%s tests passed\n' "$TEST_COUNT"
