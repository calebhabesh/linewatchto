#!/usr/bin/env bash
# Tests for scripts/prod-ssh-deploy-gate.sh against a throwaway Git origin.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$ROOT_DIR/scripts/prod-ssh-deploy-gate.sh"
TEST_TMP="$(mktemp -d)"
trap 'rm -rf "$TEST_TMP"' EXIT
FAILURES=0

# The command line the deploy workflow sends, with the release arguments appended.
RUNNER="bash -c 'tmp=\"\$(mktemp)\" && cat > \"\$tmp\" && bash \"\$tmp\" \"\$@\" < /dev/null; res=\$?; rm -f \"\$tmp\"; exit \$res' bash"
IMG_SUFFIX="@sha256:$(printf 'a%.0s' {1..64})"

git_q() { git -c user.name=t -c user.email=t@example.com "$@" > /dev/null 2>&1; }

setup() {
  local origin="$TEST_TMP/origin" work="$TEST_TMP/work"
  rm -rf "$origin" "$work" "$TEST_TMP/checkout"
  git_q init -q -b main "$work"
  mkdir -p "$work/scripts"
  printf '%s\n' '#!/usr/bin/env bash' 'printf "release %s\n" "$*"' > "$work/scripts/prod-remote-release.sh"
  git_q -C "$work" add -A
  git_q -C "$work" commit -qm main
  MAIN_SHA="$(git -C "$work" rev-parse HEAD)"
  git_q -C "$work" checkout -qb side
  git_q -C "$work" commit -qm side --allow-empty
  SIDE_SHA="$(git -C "$work" rev-parse HEAD)"
  git_q clone -q --bare "$work" "$origin"
  git_q clone -q "$origin" "$TEST_TMP/checkout"
}

run_gate() {
  printf 'echo pwned\n' | SSH_ORIGINAL_COMMAND="$1" LINEWATCH_DEPLOY_GATE_ROOT="$TEST_TMP/checkout" \
    bash "$GATE" 2>&1
}

check() {
  local name="$1" expected="$2" output="$3"
  if [[ "$output" == *"$expected"* && "$output" != *pwned* ]]; then
    printf 'ok   %s\n' "$name"
  else
    printf 'FAIL %s\n  expected: %s\n  got: %s\n' "$name" "$expected" "$output"
    FAILURES=$((FAILURES + 1))
  fi
}

setup
images="ghcr.io/calebhabesh/linewatch-frontend$IMG_SUFFIX ghcr.io/calebhabesh/linewatch-backend$IMG_SUFFIX ghcr.io/calebhabesh/linewatch-postgres$IMG_SUFFIX"

check "runs main's release script, not the client's" "release $MAIN_SHA $TEST_TMP/checkout" \
  "$(run_gate "$RUNNER $MAIN_SHA $TEST_TMP/checkout")"
check "passes pinned images through" "release $MAIN_SHA $TEST_TMP/checkout $images" \
  "$(run_gate "$RUNNER $MAIN_SHA $TEST_TMP/checkout $images")"
check "rejects commits not on main" "release is not on main" \
  "$(run_gate "$RUNNER $SIDE_SHA $TEST_TMP/checkout" || true)"
check "rejects other deploy paths" "deploy path must be" \
  "$(run_gate "$RUNNER $MAIN_SHA /tmp" || true)"
check "rejects arbitrary commands" "expected SHA" \
  "$(run_gate "cat /etc/shadow" || true)"
check "rejects shell metacharacters in place of a SHA" "full lowercase Git SHA" \
  "$(run_gate "$RUNNER \$(id) $TEST_TMP/checkout" || true)"
check "rejects unpinned images" "invalid pinned frontend image" \
  "$(run_gate "$RUNNER $MAIN_SHA $TEST_TMP/checkout evil/frontend:latest b c" || true)"

[[ "$FAILURES" -eq 0 ]] || { printf '%s deploy gate test(s) failed\n' "$FAILURES"; exit 1; }
printf 'All deploy gate tests passed\n'
