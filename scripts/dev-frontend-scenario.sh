#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

SCENARIO="${LINEWATCH_ALERT_SCENARIO:-${1:-all-alert-types}}"

find_free_port() {
  node -e '
    const net = require("net");
    function check(port) {
      return new Promise((resolve) => {
        const s = net.createServer();
        s.once("error", () => resolve(false));
        s.once("listening", () => { s.close(() => resolve(true)); });
        s.listen(port, "127.0.0.1");
      });
    }
    (async () => {
      let p = parseInt(process.argv[1], 10);
      while (!(await check(p))) { p++; }
      process.stdout.write(String(p));
    })();
  ' "$1"
}

REQUESTED_PORT="${PORT:-3001}"
PORT=$(find_free_port "$REQUESTED_PORT")
if [ "$PORT" != "$REQUESTED_PORT" ]; then
  echo "Notice: Port $REQUESTED_PORT is currently in use. Automatically switching to next free port $PORT."
fi

LINEWATCH_BACKEND_URL="${LINEWATCH_BACKEND_URL:-http://localhost:8082}"
NEXT_DIST_DIR="${NEXT_DIST_DIR:-.next-scenario}"

# Wipe stale production build artifacts so Turbopack does not enter a runaway HMR loop.
if [ -f "$REPO_ROOT/frontend/$NEXT_DIST_DIR/BUILD_ID" ] || [ -d "$REPO_ROOT/frontend/$NEXT_DIST_DIR/standalone" ]; then
  echo "Cleaning stale production build artifacts in $NEXT_DIST_DIR before starting dev server..."
  rm -rf "$REPO_ROOT/frontend/$NEXT_DIST_DIR"
fi

echo "Starting LineWatchTO alert scenario frontend ($SCENARIO) on port $PORT pointing to backend at $LINEWATCH_BACKEND_URL using build dir $NEXT_DIST_DIR..."
PORT="$PORT" \
  LINEWATCH_BACKEND_URL="$LINEWATCH_BACKEND_URL" \
  BACKEND_URL="$LINEWATCH_BACKEND_URL" \
  NEXT_PUBLIC_LINEWATCH_API_BASE_URL="$LINEWATCH_BACKEND_URL" \
  NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL="${NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL:-Dev: $SCENARIO}" \
  NEXT_PUBLIC_LINEWATCH_DEV_ACCOUNT_AUTO_LOGIN="${NEXT_PUBLIC_LINEWATCH_DEV_ACCOUNT_AUTO_LOGIN:-true}" \
  NEXT_DIST_DIR="$NEXT_DIST_DIR" \
  npm --prefix "$REPO_ROOT/frontend" run dev -- -p "$PORT"
