#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

: "${LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS:=true}"
export LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS

exec mvn -f "$REPO_ROOT/backend/pom.xml" spring-boot:run -Dspring-boot.run.profiles=dev-live
