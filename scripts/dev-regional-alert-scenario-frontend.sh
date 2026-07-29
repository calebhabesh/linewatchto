#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SCENARIO="${LINEWATCH_REGIONAL_ALERT_SCENARIO:-${1:-all-alert-types}}"
LINEWATCH_BACKEND_URL="${LINEWATCH_BACKEND_URL:-http://localhost:8084}" \
NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL="${NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL:-Dev: regional $SCENARIO}" \
"$SCRIPT_DIR/dev-frontend-scenario.sh" "regional-$SCENARIO"
