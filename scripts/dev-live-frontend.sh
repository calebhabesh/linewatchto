#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

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

REQUESTED_PORT="${PORT:-3000}"
PORT=$(find_free_port "$REQUESTED_PORT")
if [ "$PORT" != "$REQUESTED_PORT" ]; then
  echo "Notice: Port $REQUESTED_PORT is currently in use. Automatically switching to next free port $PORT."
fi

LINEWATCH_BACKEND_URL="${LINEWATCH_BACKEND_URL:-http://localhost:8080}"

echo "Starting LineWatchTO live dev frontend on port $PORT pointing to backend at $LINEWATCH_BACKEND_URL..."
PORT="$PORT" \
  LINEWATCH_BACKEND_URL="$LINEWATCH_BACKEND_URL" \
  BACKEND_URL="$LINEWATCH_BACKEND_URL" \
  NEXT_PUBLIC_LINEWATCH_API_BASE_URL="$LINEWATCH_BACKEND_URL" \
  NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL="${NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL:-Dev}" \
  NEXT_PUBLIC_LINEWATCH_DEV_ACCOUNT_AUTO_LOGIN="${NEXT_PUBLIC_LINEWATCH_DEV_ACCOUNT_AUTO_LOGIN:-true}" \
  npm --prefix "$REPO_ROOT/frontend" run dev -- -p "$PORT"

