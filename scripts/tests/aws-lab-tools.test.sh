#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

source "$ROOT_DIR/scripts/lib/aws-lab.sh"

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

assert_equals() {
  local actual="$1"
  local expected="$2"
  [[ "$actual" == "$expected" ]] || fail "expected '$expected', got '$actual'"
}

assert_output_value_fails() {
  local json="$1"
  local key="$2"
  local expected="$3"
  local output
  local status

  set +e
  output="$(linewatch_aws_lab_output_value "$json" "$key" 2>&1)"
  status=$?
  set -e

  assert_equals "$status" "1"
  assert_contains "$output" "$expected"
}

assert_smoke_artifact_json() {
  local artifact="$1"
  local expected_origin="$2"
  local expected_status="$3"

  LINEWATCH_TEST_ARTIFACT="$artifact" \
  LINEWATCH_TEST_EXPECTED_ORIGIN="$expected_origin" \
  LINEWATCH_TEST_EXPECTED_STATUS="$expected_status" \
    node <<'NODE'
const fs = require("node:fs");
const assert = require("node:assert/strict");

const artifact = JSON.parse(fs.readFileSync(process.env.LINEWATCH_TEST_ARTIFACT, "utf8"));
assert.deepEqual(Object.keys(artifact).sort(), ["createdAt", "environment", "origin", "project", "status"]);
assert.equal(artifact.project, "linewatch");
assert.equal(artifact.environment, "aws-lab");
assert.equal(artifact.origin, process.env.LINEWATCH_TEST_EXPECTED_ORIGIN);
assert.equal(artifact.status, process.env.LINEWATCH_TEST_EXPECTED_STATUS);
assert.match(artifact.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
NODE
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

test_output_value_reads_string_values() {
  local json
  json='{"http_url":{"value":"http://198.51.100.10"},"artifact_bucket":{"value":"linewatch-aws-lab-artifacts-demo"}}'

  assert_equals "$(linewatch_aws_lab_output_value "$json" http_url)" "http://198.51.100.10"
  assert_equals "$(linewatch_aws_lab_output_value "$json" artifact_bucket)" "linewatch-aws-lab-artifacts-demo"
}

test_output_value_fails_for_missing_key() {
  local json
  json='{"http_url":{"value":"http://198.51.100.10"}}'

  assert_output_value_fails "$json" artifact_bucket "missing Terraform output: artifact_bucket"
}

test_output_value_fails_for_non_string_values() {
  local json
  json='{"number_value":{"value":42},"object_value":{"value":{"url":"http://198.51.100.10"}},"array_value":{"value":["http://198.51.100.10"]}}'

  assert_output_value_fails "$json" number_value "Terraform output is not a non-empty string: number_value"
  assert_output_value_fails "$json" object_value "Terraform output is not a non-empty string: object_value"
  assert_output_value_fails "$json" array_value "Terraform output is not a non-empty string: array_value"
}

test_output_value_fails_for_empty_string() {
  local json
  json='{"http_url":{"value":""}}'

  assert_output_value_fails "$json" http_url "Terraform output is not a non-empty string: http_url"
}

test_output_value_fails_for_null() {
  local json
  json='{"http_url":{"value":null}}'

  assert_output_value_fails "$json" http_url "Terraform output is not a non-empty string: http_url"
}

test_artifact_json_contains_status_and_origin() {
  local artifact
  artifact="$TEST_TMP/artifact.json"

  linewatch_aws_lab_write_smoke_artifact "$artifact" "http://198.51.100.10" "passed"

  assert_smoke_artifact_json "$artifact" "http://198.51.100.10" "passed"
}

test_artifact_json_escapes_dynamic_values() {
  local artifact
  local origin
  local status
  artifact="$TEST_TMP/artifact-escaping.json"
  origin=$'https://example.test/"quoted"\\path\nnext'
  status=$'pa"ss\\ed\nok'

  linewatch_aws_lab_write_smoke_artifact "$artifact" "$origin" "$status"

  assert_smoke_artifact_json "$artifact" "$origin" "$status"
}

run_test "output value reads strings" test_output_value_reads_string_values
run_test "output value fails for missing key" test_output_value_fails_for_missing_key
run_test "output value fails for non-string values" test_output_value_fails_for_non_string_values
run_test "output value fails for empty strings" test_output_value_fails_for_empty_string
run_test "output value fails for null" test_output_value_fails_for_null
run_test "artifact json contains status and origin" test_artifact_json_contains_status_and_origin
run_test "artifact json escapes dynamic values" test_artifact_json_escapes_dynamic_values

printf 'Completed %d aws lab tool tests.\n' "$TEST_COUNT"
