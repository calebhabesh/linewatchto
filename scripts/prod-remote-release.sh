#!/usr/bin/env bash
set -euo pipefail

SHA="${1:-}"
ROOT_DIR="${2:-/home/ubuntu/apps/linewatchto}"
FRONTEND_IMAGE="${3:-}"
BACKEND_IMAGE="${4:-}"
POSTGRES_IMAGE="${5:-}"
STATUS=""

[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected a full lowercase Git SHA.' >&2; exit 1; }
[[ -d "$ROOT_DIR" ]] || { echo "Missing deployment checkout: $ROOT_DIR" >&2; exit 1; }
if [[ -n "$FRONTEND_IMAGE" || -n "$BACKEND_IMAGE" || -n "$POSTGRES_IMAGE" ]]; then
  for component in frontend backend postgres; do
    key="${component^^}_IMAGE"
    image="${!key}"
    [[ "$image" =~ ^ghcr\.io/calebhabesh/linewatch-${component}@sha256:[0-9a-f]{64}$ ]] || {
      echo "Invalid pinned $component image." >&2
      exit 1
    }
  done
  export LINEWATCH_FRONTEND_IMAGE="$FRONTEND_IMAGE"
  export LINEWATCH_BACKEND_IMAGE="$BACKEND_IMAGE"
  export LINEWATCH_POSTGRES_IMAGE="$POSTGRES_IMAGE"
fi
cd "$ROOT_DIR"
[[ -f .env.production && -f .env.release ]] || { echo 'Production and release env files are required.' >&2; exit 1; }

mkdir -p tmp
exec 9>tmp/prod-release.lock
flock -n 9 || { echo 'Another production release is running.' >&2; exit 1; }

STATUS="$(git status --porcelain --untracked-files=no)" || { echo 'Could not inspect deployment checkout.' >&2; exit 1; }
[[ -z "$STATUS" ]] || { echo 'Deployment checkout has tracked changes.' >&2; exit 1; }
git fetch --no-tags origin main
git cat-file -e "$SHA^{commit}"
git merge-base --is-ancestor "$SHA" FETCH_HEAD || { echo 'Release is not on main.' >&2; exit 1; }

scripts/prod-backup-postgres.sh
git checkout --detach "$SHA"
scripts/prod-deploy.sh "$SHA"
