#!/usr/bin/env bash
# Chooses the commit an automatic production deploy should ship, or none.
#
# Usage: prod-select-auto-release.sh CI_RUNS_JSON LIVE_BUILD_LABEL MAIN_SHA
#
# CI_RUNS_JSON is GitHub's workflow-runs response for CI. The choice is the newest commit on main
# that is newer than production and whose latest push CI run passed. It does not depend on which
# CI run triggered the deploy: CI runs finish out of order, and GitHub replaces a queued deploy
# with a later one.
#
# Prints sha=<full SHA, or empty to skip> and reason=<text>. An unreadable live version is an
# error, never a deploy, because the check against going backwards needs it.
set -euo pipefail

RUNS_FILE="${1:?CI runs JSON is required}"
LIVE_LABEL="${2:-}"
MAIN_SHA="${3:?main SHA is required}"

# Files that never reach an image or the VPS runtime.
NOT_SHIPPED=(
  ':(exclude)docs'
  ':(exclude).github'
  ':(exclude)backend/src/test'
  ':(exclude)frontend/tests'
  ':(exclude)scripts/tests'
  ':(exclude,glob)**/*.md'
)

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

result() {
  printf 'sha=%s\nreason=%s\n' "$1" "$2"
  exit 0
}

[[ "$MAIN_SHA" =~ ^[0-9a-f]{40}$ ]] || die 'main SHA must be a full lowercase Git SHA.'
[[ "$LIVE_LABEL" =~ ^prod-([0-9a-f]{12})$ ]] || die "could not read the live release (build label '$LIVE_LABEL')."
live="$(git rev-parse --verify --quiet "${BASH_REMATCH[1]}^{commit}")" || die "live release $LIVE_LABEL is not in this repository."

green="$(jq -r '
  [.workflow_runs[] | select(.event == "push" and .head_branch == "main")]
  | group_by(.head_sha)[] | max_by(.run_number)
  | select(.conclusion == "success") | .head_sha
' "$RUNS_FILE")"

newer="$(git rev-list --topo-order "$live..$MAIN_SHA")"
candidate=""
while read -r sha; do
  if [[ -n "$sha" ]] && grep -qxF -- "$sha" <<< "$green"; then
    candidate="$sha"
    break
  fi
done <<< "$newer"

[[ -n "$candidate" ]] || result '' "no commit newer than the live release ${live:0:12} has passed CI"
git merge-base --is-ancestor "$live" "$candidate" || die "live release ${live:0:12} is not an ancestor of $candidate."

status=0
git diff --quiet "$live" "$candidate" -- . "${NOT_SHIPPED[@]}" || status=$?
case "$status" in
  0) result '' "only docs, tests or workflows changed between the live release ${live:0:12} and ${candidate:0:12}" ;;
  1) result "$candidate" "newest commit on main that passed CI; the live release is ${live:0:12}" ;;
  *) die 'could not compare the live release with the candidate.' ;;
esac
