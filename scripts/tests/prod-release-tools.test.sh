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
        config 2>&1
  )"

  assert_contains "$output" "ghcr.io/calebhabesh/linewatch-postgres:$TEST_SHA"
  assert_contains "$output" "ghcr.io/calebhabesh/linewatch-backend:$TEST_SHA"
  assert_contains "$output" "ghcr.io/calebhabesh/linewatch-frontend:$TEST_SHA"
  assert_not_contains "$output" "build:"
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

verify_test_harness
run_test "production Compose requires LINEWATCH_IMAGE_TAG" test_requires_release_image_tag
run_test "production Compose renders immutable release images" test_renders_immutable_release_images
run_test "image tags require full lowercase Git SHAs" test_validates_full_lowercase_git_sha
run_test "component image references are deterministic" test_builds_component_image_reference
run_test "release env files round trip normalized values" test_release_file_round_trip
run_test "release env writes resist temp-file collisions" test_release_file_write_resists_temp_collision
run_test "release env writes reject directory output paths" test_rejects_directory_release_output
run_test "release env writes reject empty output paths" test_rejects_empty_release_output
run_test "release builds require a clean Git worktree" test_requires_clean_git_worktree

printf '%s tests passed\n' "$TEST_COUNT"
