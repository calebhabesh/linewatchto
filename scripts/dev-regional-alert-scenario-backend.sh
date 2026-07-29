#!/usr/bin/env sh
set -eu

SCENARIO="${LINEWATCH_REGIONAL_ALERT_SCENARIO:-${1:-all-alert-types}}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
SOURCE_PORT="${LINEWATCH_REGIONAL_ALERT_SCENARIO_PORT:-8083}"
BACKEND_PORT="${LINEWATCH_REGIONAL_ALERT_SCENARIO_BACKEND_PORT:-8084}"

if docker compose ps postgres --format json 2>/dev/null | grep -q "running" \
  || docker compose ps postgres 2>/dev/null | grep -q "Up"; then
  echo "Ensuring PostgreSQL database 'linewatch_regional_scenario' exists."
  docker compose exec -T postgres psql -U linewatch -d postgres \
    -tc "SELECT 1 FROM pg_database WHERE datname = 'linewatch_regional_scenario'" | grep -q 1 \
    || docker compose exec -T postgres psql -U linewatch -d postgres \
      -c "CREATE DATABASE linewatch_regional_scenario;"
fi

node "$REPO_ROOT/scripts/mock-regional-alerts-server.mjs" "$SCENARIO" &
SOURCE_PID="$!"
cleanup() {
  kill "$SOURCE_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "Starting LineWatchTO regional alert scenario backend ($SCENARIO) on port $BACKEND_PORT."
LINEWATCH_INGESTION_ALERTS_ENABLED=false \
LINEWATCH_INGESTION_METROLINX_ENABLED=true \
LINEWATCH_INGESTION_METROLINX_BASE_URL="http://127.0.0.1:$SOURCE_PORT/OpenDataAPI/" \
LINEWATCH_INGESTION_METROLINX_API_KEY="local-synthetic-scenario-key" \
LINEWATCH_INGESTION_METROLINX_INITIAL_DELAY=PT1S \
LINEWATCH_INGESTION_METROLINX_FIXED_DELAY=PT10S \
LINEWATCH_INGESTION_METROLINX_MAX_DASHBOARD_AGE=PT10M \
SERVER_PORT="$BACKEND_PORT" \
SPRING_DATASOURCE_URL="${LINEWATCH_REGIONAL_ALERT_SCENARIO_DATASOURCE_URL:-jdbc:postgresql://127.0.0.1:5434/linewatch_regional_scenario}" \
SPRING_DATA_REDIS_DATABASE="${LINEWATCH_REGIONAL_ALERT_SCENARIO_REDIS_DATABASE:-2}" \
mvn -f "$REPO_ROOT/backend/pom.xml" spring-boot:run -Dspring-boot.run.profiles=dev-live
