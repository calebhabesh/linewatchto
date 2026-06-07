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

: "${LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS:=true}"
export LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS

exec mvn -f "$REPO_ROOT/backend/pom.xml" spring-boot:run -Dspring-boot.run.profiles=dev-live
