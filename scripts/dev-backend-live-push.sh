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

VAPID_ENV_FILE="${LINEWATCH_PUSH_VAPID_ENV_FILE:-$REPO_ROOT/tmp/linewatch-vapid.env}"

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

LINEWATCH_PUSH_ENABLED=true
: "${LINEWATCH_PUSH_VAPID_SUBJECT:=mailto:linewatch-dev@example.invalid}"
: "${LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS:=true}"
# Recovery dev links require loopback-only origins; preserve explicit overrides.
: "${LINEWATCH_AUTH_ALLOWED_ORIGINS:=http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002,http://localhost:3003,http://127.0.0.1:3003,http://127.0.0.1:4173,http://127.0.0.1:4175}"
: "${SERVER_ADDRESS:=127.0.0.1}"

export LINEWATCH_PUSH_ENABLED
export LINEWATCH_PUSH_VAPID_PUBLIC_KEY
export LINEWATCH_PUSH_VAPID_PRIVATE_KEY
export LINEWATCH_PUSH_VAPID_SUBJECT
export LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS
export LINEWATCH_AUTH_ALLOWED_ORIGINS
export SERVER_ADDRESS

echo "Web Push test mode enabled."
echo "VAPID public key loaded from $VAPID_ENV_FILE"

exec mvn -f "$REPO_ROOT/backend/pom.xml" spring-boot:run -Dspring-boot.run.profiles=dev-live
