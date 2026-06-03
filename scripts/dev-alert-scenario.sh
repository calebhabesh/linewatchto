#!/usr/bin/env sh
set -eu

SCENARIO="${1:-all-alert-types}"
PORT="${LINEWATCH_ALERT_SCENARIO_PORT:-8081}"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

# Ensure the database for the scenario exists if PostgreSQL container is running
if docker compose ps postgres --format json 2>/dev/null | grep -q "running" || docker compose ps postgres 2>/dev/null | grep -q "Up"; then
  echo "Ensuring PostgreSQL database 'linewatch_scenario' exists..."
  docker compose exec -T postgres psql -U linewatch -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'linewatch_scenario'" | grep -q 1 || \
  docker compose exec -T postgres psql -U linewatch -d postgres -c "CREATE DATABASE linewatch_scenario;"
fi

node "$REPO_ROOT/scripts/mock-alerts-server.mjs" "$SCENARIO" &
SERVER_PID="$!"

cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

LINEWATCH_INGESTION_ALERTS_URL="http://127.0.0.1:$PORT/live-alerts" \
LINEWATCH_INGESTION_ALERTS_FIXED_DELAY="${LINEWATCH_INGESTION_ALERTS_FIXED_DELAY:-PT10S}" \
LINEWATCH_INGESTION_ALERTS_MAX_DASHBOARD_AGE="${LINEWATCH_INGESTION_ALERTS_MAX_DASHBOARD_AGE:-PT10M}" \
SERVER_PORT="${SERVER_PORT:-8082}" \
SPRING_DATASOURCE_URL="${SPRING_DATASOURCE_URL:-jdbc:postgresql://127.0.0.1:5434/linewatch_scenario}" \
SPRING_DATA_REDIS_DATABASE="${SPRING_DATA_REDIS_DATABASE:-1}" \
mvn -f "$REPO_ROOT/backend/pom.xml" spring-boot:run -Dspring-boot.run.profiles=dev-live
