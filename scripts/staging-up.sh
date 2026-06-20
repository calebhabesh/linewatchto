#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/staging-compose.sh
source "$ROOT_DIR/scripts/lib/staging-compose.sh"

export LINEWATCH_ROOT_DIR="$ROOT_DIR"
linewatch_staging_require_env

COMPOSE_ARGS=()
if linewatch_staging_tunnel_enabled; then
  COMPOSE_ARGS+=(--profile tunnel)
fi

export LINEWATCH_STAGING_BUILD_LABEL="${LINEWATCH_STAGING_BUILD_LABEL:-$(linewatch_staging_build_label)}"

linewatch_staging_compose "${COMPOSE_ARGS[@]}" config >/dev/null
linewatch_staging_compose "${COMPOSE_ARGS[@]}" up \
  -d \
  --build \
  --remove-orphans \
  --wait \
  --wait-timeout "${LINEWATCH_STAGING_WAIT_SECONDS:-420}"

linewatch_staging_compose "${COMPOSE_ARGS[@]}" ps

cat <<EOF
LineWatch TO staging is running.

Local URL:
  $(linewatch_staging_local_origin)

Public URL:
  $(linewatch_staging_public_origin)

Smoke check:
  scripts/staging-smoke.sh

Stop without deleting data:
  scripts/staging-down.sh

Reset with volume deletion:
  LINEWATCH_STAGING_RESET_CONFIRM=reset-staging scripts/staging-reset.sh
EOF
