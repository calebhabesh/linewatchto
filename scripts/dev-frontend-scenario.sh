#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

PORT="${PORT:-3001}"
LINEWATCH_BACKEND_URL="${LINEWATCH_BACKEND_URL:-http://localhost:8082}"
NEXT_DIST_DIR="${NEXT_DIST_DIR:-.next-scenario}"

echo "Starting scenario frontend on port $PORT pointing to backend at $LINEWATCH_BACKEND_URL using build dir $NEXT_DIST_DIR..."
PORT="$PORT" \
  LINEWATCH_BACKEND_URL="$LINEWATCH_BACKEND_URL" \
  BACKEND_URL="$LINEWATCH_BACKEND_URL" \
  NEXT_PUBLIC_LINEWATCH_API_BASE_URL="$LINEWATCH_BACKEND_URL" \
  NEXT_DIST_DIR="$NEXT_DIST_DIR" \
  npm --prefix "$REPO_ROOT/frontend" run dev
