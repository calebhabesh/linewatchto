#!/usr/bin/env sh
set -eu

SCENARIO="${1:-all-alert-types}"
PORT="${LINEWATCH_ALERT_SCENARIO_PORT:-8081}"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

node "$REPO_ROOT/scripts/mock-alerts-server.mjs" "$SCENARIO" &
SERVER_PID="$!"

cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

LINEWATCH_INGESTION_ALERTS_URL="http://127.0.0.1:$PORT/live-alerts" \
LINEWATCH_INGESTION_ALERTS_FIXED_DELAY="${LINEWATCH_INGESTION_ALERTS_FIXED_DELAY:-PT10S}" \
LINEWATCH_INGESTION_ALERTS_MAX_DASHBOARD_AGE="${LINEWATCH_INGESTION_ALERTS_MAX_DASHBOARD_AGE:-PT10M}" \
mvn -f "$REPO_ROOT/backend/pom.xml" spring-boot:run -Dspring-boot.run.profiles=dev-live
