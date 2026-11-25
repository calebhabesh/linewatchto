#!/usr/bin/env bash
# Tests for scripts/prod-select-auto-release.sh against a throwaway Git repository.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SELECT="$ROOT_DIR/scripts/prod-select-auto-release.sh"
TEST_TMP="$(mktemp -d)"
trap 'rm -rf "$TEST_TMP"' EXIT
REPO="$TEST_TMP/repo"
FAILURES=0
RUN_NUMBER=0

git_q() { git -C "$REPO" -c user.name=t -c user.email=t@example.com "$@" > /dev/null 2>&1; }

# commit FILE: changes the file, commits it and prints the SHA.
commit() {
  mkdir -p "$REPO/$(dirname "$1")"
  printf 'x\n' >> "$REPO/$1"
  git_q add -A
  git_q commit -qm "$1"
  git -C "$REPO" rev-parse HEAD
}

# run SHA CONCLUSION [EVENT] [BRANCH]: one CI run; later calls get higher run numbers.
run() {
  RUN_NUMBER=$((RUN_NUMBER + 1))
  jq -n --arg sha "$1" --arg conclusion "$2" --arg event "${3:-push}" --arg branch "${4:-main}" \
    --argjson number "$RUN_NUMBER" \
    '{head_sha: $sha, conclusion: $conclusion, event: $event, head_branch: $branch, run_number: $number}' \
    >> "$TEST_TMP/runs.jsonl"
}

select_release() {
  jq -s '{workflow_runs: .}' "$TEST_TMP/runs.jsonl" > "$TEST_TMP/runs.json"
  (cd "$REPO" && bash "$SELECT" "$TEST_TMP/runs.json" "$1" "${2:-$(git rev-parse HEAD)}" 2>&1) || true
}

reset_runs() { : > "$TEST_TMP/runs.jsonl"; }
label() { printf 'prod-%s' "${1:0:12}"; }

check() {
  local name="$1" expected="$2" output="$3"
  if [[ "$output" == *"$expected"* ]]; then
    printf 'ok   %s\n' "$name"
  else
    printf 'FAIL %s\n  expected: %s\n  got: %s\n' "$name" "$expected" "$output"
    FAILURES=$((FAILURES + 1))
  fi
}

mkdir -p "$REPO"
git_q init -q -b main
A="$(commit backend/src/main/A.java)"
B="$(commit frontend/src/b.ts)"
C="$(commit Caddyfile)"
D="$(commit docs/plan.md)"
E="$(commit frontend/tests/e.test.mjs)"

reset_runs; run "$B" success
check "ships a newer green commit" "sha=$B" "$(select_release "$(label "$A")")"

reset_runs; run "$C" success; run "$B" success
check "ships the newest green commit when older CI finishes last" "sha=$C" "$(select_release "$(label "$A")")"
check "skips an older commit once a newer one is live" $'sha=\nreason=no commit newer' "$(select_release "$(label "$C")")"
check "skips when production is newer than this run's main" $'sha=\nreason=no commit newer' "$(select_release "$(label "$C")" "$B")"

reset_runs; run "$B" success; run "$C" failure
check "passes over a newer red commit" "sha=$B" "$(select_release "$(label "$A")")"

reset_runs; run "$B" success; run "$B" failure
check "uses a commit's latest CI run" $'sha=\nreason=no commit newer' "$(select_release "$(label "$A")")"

reset_runs; run "$B" success pull_request; run "$C" success push feature; run "$C" success workflow_dispatch
check "ignores pull request, branch and manual CI runs" $'sha=\nreason=no commit newer' "$(select_release "$(label "$A")")"

reset_runs; run "$C" success; run "$D" success; run "$E" success
check "skips docs and test changes alone" $'sha=\nreason=only docs' "$(select_release "$(label "$C")")"

reset_runs; run "$C" failure; run "$D" success
check "ships code that reaches green under a docs commit" "sha=$D" "$(select_release "$(label "$B")")"

reset_runs; run "$E" success
check "refuses an unreadable live version" "could not read the live release" "$(select_release "")"
check "refuses a local build label" "could not read the live release" "$(select_release local)"
check "refuses an unknown live release" "is not in this repository" "$(select_release prod-000000000000)"

git_q checkout -qb side "$A"
SIDE="$(commit backend/src/main/Side.java)"
git_q checkout -q main
check "refuses when production is off main" "is not an ancestor" "$(select_release "$(label "$SIDE")")"

[[ "$FAILURES" -eq 0 ]] || { printf '%s auto release selection test(s) failed\n' "$FAILURES"; exit 1; }
printf 'All auto release selection tests passed\n'
