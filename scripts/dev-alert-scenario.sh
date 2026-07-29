#!/usr/bin/env sh
set -eu

SCENARIO="${1:-all-alert-types}"
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

REQUESTED_PORT="${LINEWATCH_ALERT_SCENARIO_PORT:-8081}"
PORT=$(find_free_port "$REQUESTED_PORT")
if [ "$PORT" != "$REQUESTED_PORT" ]; then
  echo "Notice: Mock alert server port $REQUESTED_PORT is currently in use. Automatically switching to next free port $PORT."
fi

# .env.local contains live-dev defaults; capture explicit shell overrides before sourcing it.
ORIGINAL_SERVER_PORT="${SERVER_PORT:-}"
ORIGINAL_SPRING_DATASOURCE_URL="${SPRING_DATASOURCE_URL:-}"
ORIGINAL_SPRING_DATA_REDIS_DATABASE="${SPRING_DATA_REDIS_DATABASE:-}"

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

REQUESTED_SCENARIO_SERVER_PORT="${LINEWATCH_ALERT_SCENARIO_BACKEND_PORT:-${ORIGINAL_SERVER_PORT:-8082}}"
SCENARIO_SERVER_PORT=$(find_free_port "$REQUESTED_SCENARIO_SERVER_PORT")
if [ "$SCENARIO_SERVER_PORT" != "$REQUESTED_SCENARIO_SERVER_PORT" ]; then
  echo "Notice: Scenario backend server port $REQUESTED_SCENARIO_SERVER_PORT is currently in use. Automatically switching to next free port $SCENARIO_SERVER_PORT."
fi

SCENARIO_SPRING_DATASOURCE_URL="${LINEWATCH_ALERT_SCENARIO_DATASOURCE_URL:-${ORIGINAL_SPRING_DATASOURCE_URL:-jdbc:postgresql://127.0.0.1:5434/linewatch_scenario}}"
SCENARIO_SPRING_DATA_REDIS_DATABASE="${LINEWATCH_ALERT_SCENARIO_REDIS_DATABASE:-${ORIGINAL_SPRING_DATA_REDIS_DATABASE:-1}}"
: "${LINEWATCH_AUTH_DEV_ACCOUNT_ENABLED:=true}"
export LINEWATCH_AUTH_DEV_ACCOUNT_ENABLED

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

if [ "$SCENARIO" = "all-alert-types" ]; then
  REGIONAL_SCENARIO_ENABLED=true
  REGIONAL_SCENARIO_BASE_URL="http://127.0.0.1:$PORT/OpenDataAPI/"
  REGIONAL_SCENARIO_API_KEY="local-synthetic-scenario-key"
  echo "GO/UP all-alert-types will use the local Metrolinx-shaped scenario feed."
else
  REGIONAL_SCENARIO_ENABLED=false
  REGIONAL_SCENARIO_BASE_URL="http://127.0.0.1:$PORT/OpenDataAPI/"
  REGIONAL_SCENARIO_API_KEY=""
  echo "GO/UP ingestion is disabled for this TTC-focused scenario."
fi

LINEWATCH_INGESTION_ALERTS_URL="http://127.0.0.1:$PORT/live-alerts" \
LINEWATCH_INGESTION_ALERTS_FIXED_DELAY="${LINEWATCH_INGESTION_ALERTS_FIXED_DELAY:-PT10S}" \
LINEWATCH_INGESTION_ALERTS_MAX_DASHBOARD_AGE="${LINEWATCH_INGESTION_ALERTS_MAX_DASHBOARD_AGE:-PT10M}" \
LINEWATCH_INGESTION_METROLINX_ENABLED="$REGIONAL_SCENARIO_ENABLED" \
LINEWATCH_INGESTION_METROLINX_BASE_URL="$REGIONAL_SCENARIO_BASE_URL" \
LINEWATCH_INGESTION_METROLINX_API_KEY="$REGIONAL_SCENARIO_API_KEY" \
LINEWATCH_INGESTION_METROLINX_INITIAL_DELAY=PT1S \
LINEWATCH_INGESTION_METROLINX_FIXED_DELAY="${LINEWATCH_INGESTION_METROLINX_FIXED_DELAY:-PT10S}" \
LINEWATCH_INGESTION_METROLINX_MAX_DASHBOARD_AGE="${LINEWATCH_INGESTION_METROLINX_MAX_DASHBOARD_AGE:-PT10M}" \
LINEWATCH_PERFORMANCE_TTC_URL="http://127.0.0.1:$PORT/performance-mock" \
SERVER_PORT="$SCENARIO_SERVER_PORT" \
SPRING_DATASOURCE_URL="$SCENARIO_SPRING_DATASOURCE_URL" \
SPRING_DATA_REDIS_DATABASE="$SCENARIO_SPRING_DATA_REDIS_DATABASE" \
LINEWATCH_ARRIVALS_GTFS_IMPORT_ENABLED="$ARRIVALS_GTFS_IMPORT_ENABLED" \
LINEWATCH_ARRIVALS_GTFS_ZIP_PATH="$ARRIVALS_GTFS_ZIP_PATH" \
mvn -f "$REPO_ROOT/backend/pom.xml" spring-boot:run -Dspring-boot.run.profiles=dev-live
