#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

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

run_test() {
  local name="$1"
  shift

  if "$@"; then
    TEST_COUNT=$((TEST_COUNT + 1))
    printf 'PASS: %s\n' "$name"
  else
    return 1
  fi
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

run_test "production Compose requires LINEWATCH_IMAGE_TAG" test_requires_release_image_tag
run_test "production Compose renders immutable release images" test_renders_immutable_release_images

printf '%s tests passed\n' "$TEST_COUNT"
