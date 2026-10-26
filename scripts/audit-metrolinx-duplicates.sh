#!/usr/bin/env bash
# Runs the active Metrolinx source records in the local database through the alert normalizer and
# reports which notices were consolidated and which surviving events still look like one rider event.
# Raw payloads stay in a private temporary directory that is removed on exit.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATABASE="${LINEWATCH_AUDIT_DATABASE:-linewatch}"
CONTAINER="${LINEWATCH_POSTGRES_CONTAINER:-}"
if [[ -z "$CONTAINER" ]]; then
  CONTAINER="$(cd "$ROOT_DIR" && docker compose ps -q postgres 2>/dev/null || true)"
fi
if [[ -z "$CONTAINER" ]]; then
  # The local database may belong to an older Compose project name; it still publishes port 5434.
  CONTAINER="$(docker ps -q --filter label=com.docker.compose.service=postgres --filter publish=5434 | head -n 1)"
fi
if [[ -z "$CONTAINER" ]]; then
  echo "No local PostgreSQL container found; set LINEWATCH_POSTGRES_CONTAINER." >&2
  exit 2
fi

WORK_DIR="$(mktemp -d)"
chmod 700 "$WORK_DIR"
trap 'rm -rf "$WORK_DIR"' EXIT

docker exec "$CONTAINER" psql -U linewatch -d "$DATABASE" -At -F $'\x1f' \
  -c "SELECT source_system, source_id, payload::text FROM metrolinx_alert_source_records WHERE active" \
  > "$WORK_DIR/records"

status=0
mvn -q -f "$ROOT_DIR/backend/pom.xml" test -Dtest=MetrolinxDuplicateAuditTest \
  -Dsurefire.failIfNoSpecifiedTests=false \
  -Dlinewatch.metrolinxAudit.records="$WORK_DIR/records" \
  -Dlinewatch.metrolinxAudit.report="$WORK_DIR/report" \
  > "$WORK_DIR/maven.log" 2>&1 || status=$?

if [[ -f "$WORK_DIR/report" ]]; then
  cat "$WORK_DIR/report"
else
  cat "$WORK_DIR/maven.log" >&2
fi
exit "$status"
