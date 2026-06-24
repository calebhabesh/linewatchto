#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

PORT="${PORT:-3000}"
LINEWATCH_BACKEND_URL="${LINEWATCH_BACKEND_URL:-http://localhost:8080}"

echo "Starting LineWatchTO live dev frontend on port $PORT pointing to backend at $LINEWATCH_BACKEND_URL..."
PORT="$PORT" \
  LINEWATCH_BACKEND_URL="$LINEWATCH_BACKEND_URL" \
  BACKEND_URL="$LINEWATCH_BACKEND_URL" \
  NEXT_PUBLIC_LINEWATCH_API_BASE_URL="$LINEWATCH_BACKEND_URL" \
  NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL="${NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL:-Dev}" \
  npm --prefix "$REPO_ROOT/frontend" run dev
