#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

# Load environment variables if .env.local or .env exists.
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

CLOUDFLARED_CONFIG="${LINEWATCH_CLOUDFLARED_CONFIG:-$HOME/.cloudflared/config.yml}"
VAPID_ENV_FILE="${LINEWATCH_PUSH_VAPID_ENV_FILE:-$REPO_ROOT/tmp/linewatch-vapid.env}"
BACKEND_PORT="${SERVER_PORT:-8080}"
BACKEND_URL="http://localhost:$BACKEND_PORT"

if [ ! -f "$CLOUDFLARED_CONFIG" ]; then
  echo "Cloudflare tunnel config not found at $CLOUDFLARED_CONFIG" >&2
  exit 1
fi

if [ -n "${LINEWATCH_TUNNEL_HOSTNAME:-}" ]; then
  TUNNEL_HOSTNAME="$LINEWATCH_TUNNEL_HOSTNAME"
else
  TUNNEL_HOSTNAME=$(
    awk '
      {
        for (i = 1; i <= NF; i += 1) {
          if ($i == "hostname:") {
            print $(i + 1);
            exit;
          }
          if ($i ~ /^hostname:/) {
            sub(/^hostname:/, "", $i);
            if ($i != "") {
              print $i;
              exit;
            }
          }
        }
      }
    ' "$CLOUDFLARED_CONFIG" | tr -d "\"'"
  )
fi

if [ -z "$TUNNEL_HOSTNAME" ]; then
  echo "Could not find a hostname: entry in $CLOUDFLARED_CONFIG" >&2
  exit 1
fi

PUBLIC_ORIGIN="${LINEWATCH_PUBLIC_ORIGIN:-https://$TUNNEL_HOSTNAME}"

if { [ -z "${LINEWATCH_PUSH_VAPID_PUBLIC_KEY:-}" ] || [ -z "${LINEWATCH_PUSH_VAPID_PRIVATE_KEY:-}" ]; } && [ -f "$VAPID_ENV_FILE" ]; then
  echo "Sourcing local Web Push VAPID keys from $VAPID_ENV_FILE"
  set -a
  . "$VAPID_ENV_FILE"
  set +a
fi

if [ -z "${LINEWATCH_PUSH_VAPID_PUBLIC_KEY:-}" ] || [ -z "${LINEWATCH_PUSH_VAPID_PRIVATE_KEY:-}" ]; then
  echo "Generating local Web Push VAPID keys at $VAPID_ENV_FILE"
  VAPID_ENV_FILE="$VAPID_ENV_FILE" \
  LINEWATCH_PUSH_VAPID_SUBJECT="${LINEWATCH_PUSH_VAPID_SUBJECT:-mailto:linewatch-dev@example.invalid}" \
  node <<'NODE'
const { createECDH } = require("node:crypto");
const { mkdirSync, writeFileSync } = require("node:fs");
const { dirname } = require("node:path");

const envFile = process.env.VAPID_ENV_FILE;
const subject = process.env.LINEWATCH_PUSH_VAPID_SUBJECT || "mailto:linewatch-dev@example.invalid";
const vapid = createECDH("prime256v1");
vapid.generateKeys();

function base64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

const lines = [
  `LINEWATCH_PUSH_VAPID_PUBLIC_KEY=${base64Url(vapid.getPublicKey(null, "uncompressed"))}`,
  `LINEWATCH_PUSH_VAPID_PRIVATE_KEY=${base64Url(vapid.getPrivateKey())}`,
  `LINEWATCH_PUSH_VAPID_SUBJECT=${subject}`,
  "",
];

mkdirSync(dirname(envFile), { recursive: true });
writeFileSync(envFile, lines.join("\n"), { mode: 0o600 });
NODE
  chmod 600 "$VAPID_ENV_FILE"
  set -a
  . "$VAPID_ENV_FILE"
  set +a
fi

: "${LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS:=true}"
: "${LINEWATCH_PUSH_VAPID_SUBJECT:=mailto:linewatch-dev@example.invalid}"

BACKEND_PID=""
FRONTEND_PID=""
TUNNEL_PID=""

cleanup() {
  status=$?
  trap - EXIT INT TERM
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" >/dev/null 2>&1 || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" >/dev/null 2>&1 || true
  [ -n "$TUNNEL_PID" ] && wait "$TUNNEL_PID" >/dev/null 2>&1 || true
  [ -n "$FRONTEND_PID" ] && wait "$FRONTEND_PID" >/dev/null 2>&1 || true
  [ -n "$BACKEND_PID" ] && wait "$BACKEND_PID" >/dev/null 2>&1 || true
  exit "$status"
}

trap cleanup EXIT INT TERM

echo "Starting LineWatch TO tunnel push test environment."
echo "Public origin: $PUBLIC_ORIGIN"
echo "Cloudflare config: $CLOUDFLARED_CONFIG"
echo "Backend URL: $BACKEND_URL"
echo "VAPID public key loaded from $VAPID_ENV_FILE"

LINEWATCH_PUSH_ENABLED=true \
LINEWATCH_PUSH_VAPID_PUBLIC_KEY="$LINEWATCH_PUSH_VAPID_PUBLIC_KEY" \
LINEWATCH_PUSH_VAPID_PRIVATE_KEY="$LINEWATCH_PUSH_VAPID_PRIVATE_KEY" \
LINEWATCH_PUSH_VAPID_SUBJECT="$LINEWATCH_PUSH_VAPID_SUBJECT" \
LINEWATCH_AUTH_SECURE_COOKIE=true \
LINEWATCH_AUTH_ALLOWED_ORIGINS="$PUBLIC_ORIGIN" \
LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL="$PUBLIC_ORIGIN" \
LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS="$LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS" \
mvn -f "$REPO_ROOT/backend/pom.xml" spring-boot:run -Dspring-boot.run.profiles=dev-live &
BACKEND_PID=$!

LINEWATCH_BACKEND_URL="$BACKEND_URL" \
BACKEND_URL="$BACKEND_URL" \
NEXT_PUBLIC_LINEWATCH_API_BASE_URL="" \
NEXT_PUBLIC_LINEWATCH_ENABLE_SW=true \
LINEWATCH_DEV_ALLOWED_ORIGIN="$TUNNEL_HOSTNAME" \
npm --prefix "$REPO_ROOT/frontend" run dev &
FRONTEND_PID=$!

if [ "${LINEWATCH_SKIP_CLOUDFLARED:-false}" = "true" ]; then
  echo "Skipping cloudflared because LINEWATCH_SKIP_CLOUDFLARED=true"
else
  cloudflared tunnel --config "$CLOUDFLARED_CONFIG" run ${LINEWATCH_CLOUDFLARED_PROTOCOL:+--protocol "$LINEWATCH_CLOUDFLARED_PROTOCOL"} &
  TUNNEL_PID=$!
fi

echo "Open and install the PWA from $PUBLIC_ORIGIN"

while :; do
  for pid in "$BACKEND_PID" "$FRONTEND_PID" "$TUNNEL_PID"; do
    [ -z "$pid" ] && continue
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      wait "$pid"
      exit $?
    fi
  done
  sleep 2
done
