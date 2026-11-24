#!/usr/bin/env bash
# Tests for scripts/prod-backup-offsite.sh with stubbed docker, age and rclone.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/scripts/prod-backup-offsite.sh"
TEST_TMP="$(mktemp -d)"
TEST_COUNT=0
PLAINTEXT_MARKER='PGDMP-plaintext-marker-accounts-row'

cleanup() {
  rm -rf "$TEST_TMP"
}
trap cleanup EXIT

# shellcheck source=../prod-backup-offsite.sh
source "$SCRIPT"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  return 1
}

assert_contains() {
  [[ "$1" == *"$2"* ]] || fail "expected output to contain: $2"
}

assert_not_contains() {
  [[ "$1" != *"$2"* ]] || fail "expected output not to contain: $2"
}

assert_equals() {
  [[ "$1" == "$2" ]] || fail "expected '$2', got '$1'"
}

run_test() {
  local name="$1"
  local status
  shift

  set +e
  (
    set -e
    "$@"
  )
  status=$?
  set -e

  if [[ "$status" -eq 0 ]]; then
    TEST_COUNT=$((TEST_COUNT + 1))
    printf 'PASS: %s\n' "$name"
  else
    return 1
  fi
}

# Production's public tables on 2026-11-24 plus the A1/A3 tables (V94, V95).
PROD_TABLES="$(printf '%s\n' \
  accessibility_outage_stations accessibility_outages account_auth_identities accounts \
  alert_active_periods alert_segments alert_stations alerts email_verification_tokens \
  flyway_schema_history gtfs_routes gtfs_schedule_imports gtfs_service_exceptions gtfs_services \
  gtfs_station_stops gtfs_stop_times gtfs_stops gtfs_trips ingestion_runs \
  line_segment_fallback_travel_times line_segments metrolinx_alert_source_records \
  metrolinx_ingestion_source_runs metrolinx_operational_source_records password_reset_tokens \
  push_evaluation_health push_line_event_observations push_line_subscriptions \
  push_notification_client_events push_notification_deliveries push_notification_events \
  push_notification_preferences push_saved_commute_event_observations push_subscription_lifecycle_events \
  push_subscriptions regional_alert_extraction_usage regional_alert_extractions \
  regional_alert_snapshots regional_alerts regional_gtfs_departures regional_gtfs_schedule_imports \
  regional_gtfs_service_exceptions regional_gtfs_services regional_train_cancellation_tracking \
  regional_train_cancellations reliability_observation_windows reliability_schedule_days \
  reliability_service_spans saved_commutes saved_stations snapshots station_access_statuses \
  station_impacts station_lines stations surface_service_notice_routes surface_service_notice_stops \
  surface_service_notices transit_lines ttc_alert_source_records ttc_announcements \
  ttc_station_notice_candidates ttc_station_notice_monitor_runs ttc_station_notices \
  ttc_station_page_observations ttc_surface_routes ttc_surface_station_connections \
  ttc_surface_station_stops ttc_surface_stop_routes ttc_surface_stop_times ttc_surface_stops \
  ttc_surface_trips user_sessions)"

EXPECTED_EXCLUDED="gtfs_routes
gtfs_schedule_imports
gtfs_service_exceptions
gtfs_services
gtfs_station_stops
gtfs_stop_times
gtfs_stops
gtfs_trips
metrolinx_alert_source_records
metrolinx_operational_source_records
regional_gtfs_departures
regional_gtfs_schedule_imports
regional_gtfs_service_exceptions
regional_gtfs_services
ttc_alert_source_records
ttc_surface_routes
ttc_surface_station_connections
ttc_surface_station_stops
ttc_surface_stop_routes
ttc_surface_stop_times
ttc_surface_stops
ttc_surface_trips"

# A pg_restore --list for a dump of PROD_TABLES with the given tables' data left out.
toc_without() {
  local skip_regex="$1"
  local table
  local id=4000

  printf ';\n; Archive created at 2026-11-24 07:15:02 UTC\n;\n'
  printf '%s; 0 0 ENCODING - ENCODING\n' 3990
  while read -r table; do
    id=$((id + 1))
    printf '%s; 1259 %s TABLE public %s linewatch\n' "$id" "$((16000 + id))" "$table"
  done <<<"$PROD_TABLES"
  while read -r table; do
    id=$((id + 1))
    [[ "$table" =~ $skip_regex ]] && continue
    printf '%s; 0 %s TABLE DATA public %s linewatch\n' "$id" "$((16000 + id))" "$table"
  done <<<"$PROD_TABLES"
}

make_fakes() {
  local dir="$1"

  mkdir -p "$dir/bin" "$dir/container-tmp" "$dir/remote/postgres" "$dir/metrics" "$dir/work" "$dir/config"
  printf 'POSTGRES_PASSWORD=test\n' > "$dir/.env.production"
  printf 'LINEWATCH_IMAGE_REGISTRY=ghcr.io/calebhabesh\nLINEWATCH_IMAGE_TAG=0123456789abcdef0123456789abcdef01234567\n' > "$dir/.env.release"
  printf '# owner offline key, 2026-11-24\nage1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqs3290gq\n' > "$dir/config/recipients"
  printf 'LINEWATCH_OFFSITE_REMOTE=fake:postgres/\nLINEWATCH_OFFSITE_AGE_RECIPIENTS_FILE=%s\n' "$dir/config/recipients" > "$dir/config/offsite.env"
  chmod 600 "$dir/config/offsite.env"
  toc_without "$(offsite_excluded_regex)" > "$dir/toc"
  printf '%s\n' "$PROD_TABLES" > "$dir/tables"

  cat > "$dir/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
args=("$@")
mode=""
for i in "${!args[@]}"; do
  if [[ "${args[$i]}" == "-c" ]]; then
    [[ "${args[$((i + 2))]}" == offsite ]] || { echo "unexpected container call: $*" >&2; exit 64; }
    mode="${args[$((i + 3))]}"
    rest=("${args[@]:$((i + 4))}")
    break
  fi
done
[[ -n "$mode" ]] || { echo "unexpected docker call: $*" >&2; exit 64; }
container_path() { printf '%s/%s' "$FAKE_DIR/container-tmp" "$(basename "$1")"; }
printf 'container %s %s\n' "$mode" "${rest[*]}" >> "$FAKE_DIR/log"
case "$mode" in
  dump)
    printf 'PGDMP %s\n' "$PLAINTEXT_MARKER" > "$(container_path "${rest[0]}")"
    [[ "${FAKE_DUMP_FAIL:-false}" != true ]] || exit 23
    ;;
  toc) cat "$FAKE_DIR/toc" ;;
  tables) cat "$FAKE_DIR/tables" ;;
  cat) cat "$(container_path "${rest[0]}")" ;;
  remove) rm -f "$(container_path "${rest[0]}")" ;;
esac
EOF

  cat > "$dir/bin/age" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
recipients=""
out=""
while (( $# > 0 )); do
  case "$1" in
    --encrypt) shift ;;
    -R) recipients="$2"; shift 2 ;;
    -o) out="$2"; shift 2 ;;
    *) echo "unexpected age argument: $1" >&2; exit 64 ;;
  esac
done
printf 'age encrypt -R %s\n' "$recipients" >> "$FAKE_DIR/log"
{
  printf 'age-encryption.org/v1\n-> X25519 fake\n'
  base64 -w0
} > "$out"
[[ "${FAKE_AGE_FAIL:-false}" != true ]] || exit 1
EOF

  cat > "$dir/bin/rclone" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
local_path() { printf '%s/%s' "$FAKE_DIR/remote" "${1#fake:}"; }
printf 'rclone %s\n' "$*" >> "$FAKE_DIR/log"
case "$1" in
  copyto)
    if [[ "$(head -c 21 "$2")" != "age-encryption.org/v1" ]] || grep -q "$PLAINTEXT_MARKER" "$2"; then
      echo "plaintext upload: $2" >> "$FAKE_DIR/log"
      exit 65
    fi
    [[ "${FAKE_UPLOAD_FAIL:-false}" != true ]] || exit 1
    cp "$2" "$(local_path "$3")"
    basename "$3" > "$FAKE_DIR/uploaded"
    ;;
  lsf)
    remote="${*: -1}"
    for file in "$(local_path "$remote")"/*; do
      [[ -f "$file" ]] || continue
      name="$(basename "$file")"
      if [[ "${FAKE_LIST_HIDE_UPLOADED:-false}" == true && "$name" == "$(cat "$FAKE_DIR/uploaded" 2>/dev/null)" ]]; then
        continue
      fi
      printf '%s|%s\n' "$name" "$(stat -c %s "$file")"
    done
    ;;
  deletefile)
    [[ "${FAKE_DELETE_FAIL:-false}" != true ]] || exit 1
    rm "$(local_path "$2")"
    ;;
  *) echo "unexpected rclone call: $*" >&2; exit 64 ;;
esac
EOF
  chmod +x "$dir/bin/docker" "$dir/bin/age" "$dir/bin/rclone"
}

run_backup() {
  local dir="$1"
  shift

  env FAKE_DIR="$dir" PLAINTEXT_MARKER="$PLAINTEXT_MARKER" \
    DOCKER_BIN="$dir/bin/docker" AGE_BIN="$dir/bin/age" RCLONE_BIN="$dir/bin/rclone" \
    LINEWATCH_OFFSITE_ENV_FILE="$dir/config/offsite.env" \
    LINEWATCH_PROD_ENV_FILE="$dir/.env.production" \
    LINEWATCH_RELEASE_ENV_FILE="$dir/.env.release" \
    LINEWATCH_OFFSITE_WORK_DIR="$dir/work" \
    LINEWATCH_OFFSITE_METRICS_DIR="$dir/metrics" \
    "$@" bash "$SCRIPT"
}

remote_listing() {
  ls -1 "$1/remote/postgres"
}

seed_remote() {
  local dir="$1"
  shift
  local stamp

  for stamp in "$@"; do
    printf 'age-encryption.org/v1\nold copy %s\n' "$stamp" > "$dir/remote/postgres/linewatch-postgres-$stamp.dump.age"
  done
}

seed_previous_metrics() {
  printf 'linewatch_offsite_backup_last_run_success 1\nlinewatch_offsite_backup_last_success_timestamp_seconds 1795000000\nlinewatch_offsite_backup_size_bytes 41000000\nlinewatch_offsite_backup_copies 2\n' \
    > "$1/metrics/linewatch_offsite_backup.prom"
}

assert_no_plaintext_left() {
  local dir="$1"
  local found

  found="$(grep -rl "$PLAINTEXT_MARKER" "$dir/work" "$dir/remote" "$dir/container-tmp" 2>/dev/null || true)"
  assert_equals "$found" ""
  assert_equals "$(ls -A "$dir/container-tmp")" ""
  assert_equals "$(find "$dir/work" -mindepth 1 -maxdepth 1 -name 'run.*' | wc -l)" "0"
}

# Every failure path: the bucket is unchanged, nothing was deleted, no plaintext is left, and
# the metrics keep the previous newest copy with last_run_success 0.
assert_failed_run_kept_previous_copies() {
  local dir="$1"
  local before="$2"
  local metrics

  assert_equals "$(remote_listing "$dir")" "$before"
  assert_not_contains "$(cat "$dir/log")" "rclone deletefile"
  assert_no_plaintext_left "$dir"
  metrics="$(cat "$dir/metrics/linewatch_offsite_backup.prom")"
  assert_contains "$metrics" "linewatch_offsite_backup_last_run_success 0"
  assert_contains "$metrics" "linewatch_offsite_backup_last_success_timestamp_seconds 1795000000"
  assert_contains "$metrics" "linewatch_offsite_backup_copies 2"
}

test_exclusions_resolve_to_the_expected_tables() {
  local excluded=()
  local table

  while read -r table; do
    if offsite_is_excluded_table "$table"; then
      excluded+=("$table")
    fi
  done <<<"$PROD_TABLES"
  assert_equals "$(printf '%s\n' "${excluded[@]}")" "$EXPECTED_EXCLUDED"

  for table in alerts snapshots alert_active_periods regional_alert_snapshots regional_alerts \
    regional_train_cancellations regional_train_cancellation_tracking ingestion_runs \
    metrolinx_ingestion_source_runs reliability_schedule_days reliability_service_spans \
    reliability_observation_windows accounts push_subscriptions stations transit_lines; do
    if offsite_is_excluded_table "$table"; then
      fail "kept table matched an exclusion: $table"
    fi
  done
  # pg_dump patterns are anchored; similar names outside the families stay in the dump.
  for table in gtfs ttc_alert_source_records_archive metrolinx_source_records x_gtfs_trips; do
    if offsite_is_excluded_table "$table"; then
      fail "pattern over-matched: $table"
    fi
  done
}

test_dump_passes_exactly_the_exclusion_flags() {
  local dir="$TEST_TMP/flags"
  local dump_line

  make_fakes "$dir"
  run_backup "$dir" >/dev/null 2>&1
  dump_line="$(grep '^container dump ' "$dir/log")"
  assert_equals "$dump_line" "container dump /tmp/linewatch-offsite-$(sed -E 's/.*linewatch-postgres-(.*)\.dump\.age/\1/' <<<"$(remote_listing "$dir")").dump --exclude-table-data=public.gtfs_* --exclude-table-data=public.ttc_surface_* --exclude-table-data=public.regional_gtfs_* --exclude-table-data=public.ttc_alert_source_records --exclude-table-data=public.metrolinx_*_source_records"
}

test_toc_check_rejects_wrong_table_data() {
  local regex
  local output

  regex="$(offsite_excluded_regex)"
  offsite_verify_toc "$(toc_without "$regex")" "$PROD_TABLES"

  output="$(offsite_verify_toc "$(toc_without '^(gtfs_.*|ttc_surface_.*|regional_gtfs_.*|metrolinx_.*_source_records)$')" "$PROD_TABLES" 2>&1)" \
    && fail "a dump holding raw TTC source records passed"
  assert_contains "$output" "excluded table has data in the dump: ttc_alert_source_records"

  output="$(offsite_verify_toc "$(toc_without "^(alerts|${regex:2:-2})$")" "$PROD_TABLES" 2>&1)" \
    && fail "a dump missing alerts passed"
  assert_contains "$output" "table data missing from the dump: alerts"

  output="$(offsite_verify_toc "$(toc_without "$regex")" "$(grep -v '^ttc_surface_' <<<"$PROD_TABLES")" 2>&1)" \
    && fail "a pattern that matches nothing passed"
  assert_contains "$output" "exclusion pattern matched no table: ttc_surface_*"

  output="$(offsite_verify_toc "$(toc_without "$regex")" "$(grep -v '^accounts$' <<<"$PROD_TABLES")" 2>&1)" \
    && fail "a schema without accounts passed"
  assert_contains "$output" "required table not in the schema: accounts"
}

test_encrypts_before_upload_and_leaves_no_plaintext() {
  local dir="$TEST_TMP/encrypt"
  local output
  local object
  local log

  make_fakes "$dir"
  output="$(run_backup "$dir" 2>/dev/null)"
  object="$(remote_listing "$dir")"
  [[ "$object" =~ $OFFSITE_OBJECT_PATTERN ]] || fail "unexpected object name: $object"
  assert_equals "$output" "fake:postgres/$object"
  assert_equals "$(head -c 21 "$dir/remote/postgres/$object")" "age-encryption.org/v1"
  assert_equals "$(tail -n +3 "$dir/remote/postgres/$object" | base64 -d)" "PGDMP $PLAINTEXT_MARKER"

  log="$(cat "$dir/log")"
  assert_not_contains "$log" "plaintext upload"
  assert_contains "$log" "age encrypt -R $dir/config/recipients"
  # dump, verify, stream through age (the two ends of the pipe log in either order), remove
  # the container copy, and only then upload.
  assert_equals "$(grep -oE '^(container [a-z]+|age encrypt|rclone [a-z]+)' <<<"$log" | grep -v '^container cat$' | paste -sd,)" \
    "container dump,container toc,container tables,age encrypt,container remove,rclone copyto,rclone lsf"
  assert_equals "$(grep -oE '^container (cat|remove)' <<<"$log" | paste -sd,)" "container cat,container remove"
  assert_no_plaintext_left "$dir"
  assert_contains "$(cat "$dir/metrics/linewatch_offsite_backup.prom")" "linewatch_offsite_backup_last_run_success 1"
}

test_retention_selection_across_boundaries() {
  local names
  local deletions

  # ISO week 2026-W53 runs Mon Dec 28 to Sun Jan 3, so a week and a month disagree at New Year:
  # the week keeps Jan 3, December keeps Dec 31, and a second run on Jan 4 replaces the first.
  names="$(printf 'linewatch-postgres-%s.dump.age\n' \
    20261230T071500Z 20261231T071500Z 20270103T071500Z 20270104T010000Z 20270104T071500Z)"
  deletions="$(offsite_retention_deletions 1 2 2 <<<"$names")"
  assert_equals "$deletions" "$(printf 'linewatch-postgres-%s.dump.age\n' 20270104T010000Z 20261230T071500Z)"

  # A copy every night from 2025-10-01 to 2026-11-24 (a Tuesday) keeps 30: Nov 11-24 daily, the
  # Sundays ending the 8 newest ISO weeks, and the last day of each of the 12 newest months.
  names="$(
    day=2025-10-01
    while [[ "$day" != 2026-11-25 ]]; do
      printf 'linewatch-postgres-%sT071500Z.dump.age\n' "${day//-/}"
      day="$(date -u -d "$day + 1 day" +%F)"
    done
  )"
  deletions="$(offsite_retention_deletions <<<"$names")"
  assert_equals "$(grep -c . <<<"$names")" "420"
  assert_equals "$(comm -23 <(sort <<<"$names") <(sort <<<"$deletions") | sed -E 's/linewatch-postgres-([0-9]{8}).*/\1/' | paste -sd' ')" \
    "20251231 20260131 20260228 20260331 20260430 20260531 20260630 20260731 20260831 20260930 20261011 20261018 20261025 20261031 20261101 20261108 20261111 20261112 20261113 20261114 20261115 20261116 20261117 20261118 20261119 20261120 20261121 20261122 20261123 20261124"

  # Missed nights do not push copies out early: buckets count only days that have copies.
  names="$(printf 'linewatch-postgres-%s.dump.age\n' 20260101T071500Z 20260301T071500Z 20261124T071500Z)"
  assert_equals "$(offsite_retention_deletions <<<"$names")" ""

  # Other objects in the prefix are never selected.
  assert_equals "$(printf 'README\nlinewatch-postgres-20260101.dump.age\nlinewatch-postgres-20260101T071500Z.sql.gz\n' | offsite_retention_deletions 1 1 1)" ""
}

test_run_prunes_to_retention_and_keeps_other_objects() {
  local dir="$TEST_TMP/prune"
  local listing
  local day

  make_fakes "$dir"
  printf 'keep me\n' > "$dir/remote/postgres/README"
  # Jan 1-2, 2024 share ISO week 2024-W01 and a month; Mar 1-15, 2024 are 15 nights. With
  # today's copy, the 14 daily copies reach back to Mar 3 (W09's Sunday), so Mar 1 and 2 are
  # neither their week's nor their month's newest. Jan 2 stays as its week's and month's copy.
  seed_remote "$dir" 20240101T071500Z 20240102T071500Z
  for day in $(seq -w 1 15); do
    seed_remote "$dir" "202403${day}T071500Z"
  done
  run_backup "$dir" >/dev/null 2>&1
  listing="$(remote_listing "$dir")"
  assert_contains "$listing" "README"
  assert_contains "$listing" "linewatch-postgres-20240102T071500Z.dump.age"
  assert_contains "$listing" "linewatch-postgres-20240303T071500Z.dump.age"
  assert_equals "$(grep 'rclone deletefile' "$dir/log" | sed -E 's/.*linewatch-postgres-([0-9]{8}).*/\1/' | sort | paste -sd' ')" \
    "20240101 20240301 20240302"
  assert_equals "$(awk '$1 == "linewatch_offsite_backup_copies" { print $2 }' "$dir/metrics/linewatch_offsite_backup.prom")" "15"
}

test_failed_dump_keeps_previous_copies() {
  local dir="$TEST_TMP/dump-fails"
  local before
  local status

  make_fakes "$dir"
  seed_remote "$dir" 20261122T071500Z 20261123T071500Z
  seed_previous_metrics "$dir"
  before="$(remote_listing "$dir")"
  set +e
  run_backup "$dir" FAKE_DUMP_FAIL=true >/dev/null 2>&1
  status=$?
  set -e
  assert_equals "$status" "23"
  assert_not_contains "$(cat "$dir/log")" "rclone"
  assert_contains "$(cat "$dir/log")" "container remove /tmp/linewatch-offsite-"
  assert_failed_run_kept_previous_copies "$dir" "$before"
}

test_unexpected_table_data_stops_before_encryption() {
  local dir="$TEST_TMP/toc-fails"
  local before
  local output

  make_fakes "$dir"
  seed_remote "$dir" 20261122T071500Z 20261123T071500Z
  seed_previous_metrics "$dir"
  toc_without '^(gtfs_.*|ttc_surface_.*|regional_gtfs_.*|ttc_alert_source_records)$' > "$dir/toc"
  before="$(remote_listing "$dir")"
  output="$(run_backup "$dir" 2>&1)" && fail "a dump holding Metrolinx source records was uploaded"
  assert_contains "$output" "excluded table has data in the dump: metrolinx_alert_source_records"
  assert_not_contains "$(cat "$dir/log")" "container cat"
  assert_not_contains "$(cat "$dir/log")" "rclone"
  assert_failed_run_kept_previous_copies "$dir" "$before"
}

test_failed_encryption_uploads_nothing() {
  local dir="$TEST_TMP/age-fails"
  local before

  make_fakes "$dir"
  seed_remote "$dir" 20261122T071500Z 20261123T071500Z
  seed_previous_metrics "$dir"
  before="$(remote_listing "$dir")"
  run_backup "$dir" FAKE_AGE_FAIL=true >/dev/null 2>&1 && fail "a failed encryption succeeded"
  assert_not_contains "$(cat "$dir/log")" "rclone"
  assert_failed_run_kept_previous_copies "$dir" "$before"
}

test_failed_upload_keeps_previous_copies() {
  local dir="$TEST_TMP/upload-fails"
  local before

  make_fakes "$dir"
  seed_remote "$dir" 20261122T071500Z 20261123T071500Z
  seed_previous_metrics "$dir"
  before="$(remote_listing "$dir")"
  run_backup "$dir" FAKE_UPLOAD_FAIL=true >/dev/null 2>&1 && fail "a failed upload succeeded"
  assert_failed_run_kept_previous_copies "$dir" "$before"
}

test_unverified_upload_prunes_nothing() {
  local dir="$TEST_TMP/unlisted"
  local output

  make_fakes "$dir"
  seed_remote "$dir" 20240101T071500Z 20240102T071500Z
  seed_previous_metrics "$dir"
  # The listing omits the new copy, as after an upload that did not land.
  output="$(run_backup "$dir" FAKE_LIST_HIDE_UPLOADED=true 2>&1)" && fail "an unlisted upload succeeded"
  assert_contains "$output" "is not listed with"
  assert_not_contains "$(cat "$dir/log")" "rclone deletefile"
  assert_contains "$(remote_listing "$dir")" "linewatch-postgres-20240101T071500Z.dump.age"
  assert_contains "$(cat "$dir/metrics/linewatch_offsite_backup.prom")" "linewatch_offsite_backup_last_run_success 0"
  assert_contains "$(cat "$dir/metrics/linewatch_offsite_backup.prom")" "linewatch_offsite_backup_last_success_timestamp_seconds 1795000000"
}

test_failed_prune_reports_but_keeps_the_new_copy() {
  local dir="$TEST_TMP/prune-fails"
  local metrics

  make_fakes "$dir"
  # Two runs on one day: the earlier is outside retention.
  seed_remote "$dir" 20240101T010000Z 20240101T071500Z
  run_backup "$dir" FAKE_DELETE_FAIL=true >/dev/null 2>&1 && fail "a failed prune exited 0"
  assert_equals "$(remote_listing "$dir" | grep -c .)" "3"
  metrics="$(cat "$dir/metrics/linewatch_offsite_backup.prom")"
  # The new copy is stored and verified, so the stale rule must see it; the run still failed.
  assert_contains "$metrics" "linewatch_offsite_backup_last_run_success 0"
  assert_contains "$metrics" "linewatch_offsite_backup_last_success_timestamp_seconds"
  assert_not_contains "$metrics" "linewatch_offsite_backup_last_success_timestamp_seconds 1795000000"
  assert_contains "$metrics" "linewatch_offsite_backup_copies 3"
}

test_first_failed_run_reports_no_newest_copy() {
  local dir="$TEST_TMP/first-fails"

  make_fakes "$dir"
  run_backup "$dir" FAKE_DUMP_FAIL=true >/dev/null 2>&1 && fail "a failed dump succeeded"
  assert_not_contains "$(cat "$dir/metrics/linewatch_offsite_backup.prom")" "last_success_timestamp_seconds"
}

test_refuses_private_keys_and_open_settings() {
  local dir="$TEST_TMP/settings"
  local output

  make_fakes "$dir"
  chmod 640 "$dir/config/offsite.env"
  output="$(run_backup "$dir" 2>&1)" && fail "a group-readable settings file was accepted"
  assert_contains "$output" "must not be readable by group or others"

  chmod 600 "$dir/config/offsite.env"
  printf 'AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ\n' >> "$dir/config/recipients"
  output="$(run_backup "$dir" 2>&1)" && fail "a private key on the host was accepted"
  assert_contains "$output" "holds an age private key"

  printf '# no keys\n' > "$dir/config/recipients"
  output="$(run_backup "$dir" 2>&1)" && fail "an empty recipients file was accepted"
  assert_contains "$output" "lists no age public key"
  [[ ! -e "$dir/log" ]] || fail "docker, age or rclone ran despite bad settings"
}

run_test "exclusion patterns resolve to the 22 schedule and raw-record tables" test_exclusions_resolve_to_the_expected_tables
run_test "pg_dump receives exactly the exclusion flags" test_dump_passes_exactly_the_exclusion_flags
run_test "the dump's table data must match the schema minus exclusions" test_toc_check_rejects_wrong_table_data
run_test "encryption happens before upload and no plaintext is left" test_encrypts_before_upload_and_leaves_no_plaintext
run_test "retention keeps 14 daily, 8 weekly and 12 monthly across boundaries" test_retention_selection_across_boundaries
run_test "a run prunes to retention and leaves other objects alone" test_run_prunes_to_retention_and_keeps_other_objects
run_test "a failed dump keeps the previous copies" test_failed_dump_keeps_previous_copies
run_test "unexpected table data stops before encryption" test_unexpected_table_data_stops_before_encryption
run_test "a failed encryption uploads nothing" test_failed_encryption_uploads_nothing
run_test "a failed upload keeps the previous copies" test_failed_upload_keeps_previous_copies
run_test "an upload missing from the listing prunes nothing" test_unverified_upload_prunes_nothing
run_test "a failed prune keeps the new copy and fails the run" test_failed_prune_reports_but_keeps_the_new_copy
run_test "a first failed run reports no newest copy" test_first_failed_run_reports_no_newest_copy
run_test "private keys and group-readable settings are refused" test_refuses_private_keys_and_open_settings

printf '%s off-host backup tests passed\n' "$TEST_COUNT"
