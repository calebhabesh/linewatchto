#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

# Load environment variables if .env.local or .env exists
if [ -f "$REPO_ROOT/.env.local" ]; then
  echo "Sourcing environment variables from .env.local"
  set -a
  . "$REPO_ROOT/.env.local"
  set +a
elif [ -f "$REPO_ROOT/.env" ]; then
  echo "Sourcing environment variables from .env"
  set -a
  . "$REPO_ROOT/.env"
  set +a
fi

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

REQUESTED_SERVER_PORT="${SERVER_PORT:-${LINEWATCH_BACKEND_PORT:-8080}}"
AVAILABLE_SERVER_PORT=$(find_free_port "$REQUESTED_SERVER_PORT")
if [ "$AVAILABLE_SERVER_PORT" != "$REQUESTED_SERVER_PORT" ]; then
  echo "Error: Backend server port $REQUESTED_SERVER_PORT is already in use. Refusing to start on $AVAILABLE_SERVER_PORT because the live frontend would continue calling $REQUESTED_SERVER_PORT." >&2
  echo "Stop the existing backend, or set SERVER_PORT and LINEWATCH_BACKEND_URL to the same explicit port." >&2
  exit 1
fi
SERVER_PORT="$REQUESTED_SERVER_PORT"
export SERVER_PORT

: "${LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS:=true}"
export LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS
: "${LINEWATCH_AUTH_DEV_ACCOUNT_ENABLED:=true}"
export LINEWATCH_AUTH_DEV_ACCOUNT_ENABLED

exec mvn -f "$REPO_ROOT/backend/pom.xml" spring-boot:run -Dspring-boot.run.profiles=dev-live
