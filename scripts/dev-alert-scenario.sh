#!/usr/bin/env sh
set -eu

SCENARIO="${1:-all-alert-types}"
PORT="${LINEWATCH_ALERT_SCENARIO_PORT:-8081}"

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

SCENARIO_GTFS_ZIP="${LINEWATCH_SCENARIO_GTFS_ZIP:-}"
if [ -z "$SCENARIO_GTFS_ZIP" ]; then
  if [ -f "$REPO_ROOT/tmp/ttc-merged-gtfs.zip" ]; then
    SCENARIO_GTFS_ZIP="$REPO_ROOT/tmp/ttc-merged-gtfs.zip"
  else
    SCENARIO_GTFS_ZIP="/tmp/ttc-merged-gtfs.zip"
  fi
fi

ARRIVALS_GTFS_IMPORT_ENABLED="${LINEWATCH_ARRIVALS_GTFS_IMPORT_ENABLED:-false}"
ARRIVALS_GTFS_ZIP_PATH="${LINEWATCH_ARRIVALS_GTFS_ZIP_PATH:-}"
if [ -f "$SCENARIO_GTFS_ZIP" ]; then
  ARRIVALS_GTFS_IMPORT_ENABLED="${LINEWATCH_ARRIVALS_GTFS_IMPORT_ENABLED:-true}"
  ARRIVALS_GTFS_ZIP_PATH="${LINEWATCH_ARRIVALS_GTFS_ZIP_PATH:-$SCENARIO_GTFS_ZIP}"
  echo "Scenario scheduled arrivals will import GTFS from $ARRIVALS_GTFS_ZIP_PATH"
else
  echo "No scenario GTFS zip found at $SCENARIO_GTFS_ZIP; station arrivals will use the unavailable scheduled-source state."
  echo "Download one with: node scripts/download-ttc-gtfs.mjs $SCENARIO_GTFS_ZIP"
fi

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
LINEWATCH_PERFORMANCE_TTC_URL="http://127.0.0.1:$PORT/performance-mock" \
SERVER_PORT="${SERVER_PORT:-8082}" \
SPRING_DATASOURCE_URL="${SPRING_DATASOURCE_URL:-jdbc:postgresql://127.0.0.1:5434/linewatch_scenario}" \
SPRING_DATA_REDIS_DATABASE="${SPRING_DATA_REDIS_DATABASE:-1}" \
LINEWATCH_ARRIVALS_GTFS_IMPORT_ENABLED="$ARRIVALS_GTFS_IMPORT_ENABLED" \
LINEWATCH_ARRIVALS_GTFS_ZIP_PATH="$ARRIVALS_GTFS_ZIP_PATH" \
mvn -f "$REPO_ROOT/backend/pom.xml" spring-boot:run -Dspring-boot.run.profiles=dev-live
