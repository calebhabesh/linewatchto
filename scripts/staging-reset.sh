#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/staging-compose.sh
source "$ROOT_DIR/scripts/lib/staging-compose.sh"

export LINEWATCH_ROOT_DIR="$ROOT_DIR"
linewatch_staging_require_env

if [[ "${LINEWATCH_STAGING_RESET_CONFIRM:-}" != "reset-staging" ]]; then
  cat >&2 <<'EOF'
Refusing to delete staging volumes.

This removes the staging Postgres, Redis, and Caddy volumes for the staging
Compose project only. Production is not targeted by this script.

Run:
  LINEWATCH_STAGING_RESET_CONFIRM=reset-staging scripts/staging-reset.sh
EOF
  exit 1
fi

linewatch_staging_compose down --remove-orphans --volumes
