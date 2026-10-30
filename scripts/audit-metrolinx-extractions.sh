#!/usr/bin/env bash
# Lists recent model readings of Metrolinx notices from the local database: request usage, outcome
# counts, and every reading that disagrees with the deterministic classifier, to review where the model
# and the fallback classifier differ.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATABASE="${LINEWATCH_AUDIT_DATABASE:-linewatch}"
DAYS="${1:-7}"
if ! [[ "$DAYS" =~ ^[0-9]+$ ]]; then
  echo "Usage: $0 [days, default 7]" >&2
  exit 2
fi
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

psql_run() {
  docker exec "$CONTAINER" psql -U linewatch -d "$DATABASE" -v ON_ERROR_STOP=1 -P pager=off "$@"
}

echo "== Requests per Pacific-time day (last $DAYS days)"
psql_run -c "
  select usage_date, model, requests
  from regional_alert_extraction_usage
  where usage_date >= current_date - $DAYS
  order by usage_date desc, model"

echo "== Outcomes for notices seen in the last $DAYS days"
psql_run -c "
  select model, prompt_version, status,
         count(*) as notices,
         count(*) filter (where jsonb_array_length(coalesce(differences, '[]'::jsonb)) > 0) as disagreements,
         string_agg(distinct last_error, ', ') as errors
  from regional_alert_extractions
  where last_seen_at >= now() - interval '$DAYS days'
  group by model, prompt_version, status
  order by model, prompt_version, status"

echo "== Disagreements (most recent first)"
psql_run -c "
  select canonical_event_id as event,
         result->>'confidence' as confidence,
         differences,
         left(input->>'title', 70) as title,
         to_char(last_seen_at at time zone 'America/Toronto', 'YYYY-MM-DD HH24:MI') as last_seen
  from regional_alert_extractions
  where status = 'succeeded'
    and jsonb_array_length(coalesce(differences, '[]'::jsonb)) > 0
    and last_seen_at >= now() - interval '$DAYS days'
  order by last_seen_at desc"
