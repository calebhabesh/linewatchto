#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

PORT="${PORT:-3001}"
LINEWATCH_BACKEND_URL="${LINEWATCH_BACKEND_URL:-http://localhost:8082}"

echo "Starting scenario frontend on port $PORT pointing to backend at $LINEWATCH_BACKEND_URL..."
PORT="$PORT" LINEWATCH_BACKEND_URL="$LINEWATCH_BACKEND_URL" npm --prefix "$REPO_ROOT/frontend" run dev
