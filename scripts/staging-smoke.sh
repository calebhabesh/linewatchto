#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/staging-compose.sh
source "$ROOT_DIR/scripts/lib/staging-compose.sh"

export LINEWATCH_ROOT_DIR="$ROOT_DIR"
linewatch_staging_require_env

ORIGIN="$(linewatch_staging_smoke_origin)"

LINEWATCH_DEPLOY_FRONTEND_URL="$ORIGIN" \
LINEWATCH_DEPLOY_BACKEND_URL="$ORIGIN" \
  node "$ROOT_DIR/scripts/smoke-deploy.mjs"
