#!/usr/bin/env bash
# Nightly off-host backup of production PostgreSQL (plan 17 A4).
#
# pg_dump -Fc runs inside the postgres container into its /tmp, is read back in full there, and
# its table list is checked against the live schema. The dump is streamed out through age to the
# owner's public key, so only ciphertext touches the host, then uploaded with rclone. Older
# copies are pruned to 14 daily, 8 weekly and 12 monthly only after the new copy is listed with
# the right size; any failure leaves the bucket as it was. A textfile metric for Alloy records
# the newest verified copy (alert: "Off-host backup stale"). See production-vps.md, Backups.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Table data that stays on the host: re-importable schedule tables and raw provider records.
# Patterns are pg_dump patterns in schema public (* matches any characters, _ is literal).
OFFSITE_EXCLUDED_TABLE_DATA=(
  'gtfs_*'
  'ttc_surface_*'
  'regional_gtfs_*'
  'ttc_alert_source_records'
  'metrolinx_*_source_records'
)
# Tables whose data must be in every copy; every other non-excluded table is checked too.
OFFSITE_REQUIRED_TABLES=(
  accounts
  alerts
  alert_active_periods
  snapshots
  ingestion_runs
  regional_alerts
  regional_alert_snapshots
  regional_train_cancellations
)
OFFSITE_OBJECT_PREFIX='linewatch-postgres-'
OFFSITE_OBJECT_SUFFIX='.dump.age'
OFFSITE_OBJECT_PATTERN='^linewatch-postgres-[0-9]{8}T[0-9]{6}Z\.dump\.age$'
OFFSITE_AGE_HEADER='age-encryption.org/v1'

# Runs inside the postgres container as: sh -c "$OFFSITE_CONTAINER_SCRIPT" offsite <mode> ...
OFFSITE_CONTAINER_SCRIPT="$(cat <<'SH'
set -eu
umask 077
mode="$1"
shift
case "$mode" in
  dump)
    out="$1"
    shift
    rm -f "$out"
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --file="$out" "$@"
    # Reads every data block back, so a truncated or corrupt archive fails here.
    pg_restore --file=/dev/null "$out"
    ;;
  toc)
    pg_restore --list "$1"
    ;;
  tables)
    psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass
                        and d.objid = c.oid and d.deptype = 'e')
      order by 1"
    ;;
  cat)
    cat "$1"
    ;;
  remove)
    rm -f "$1"
    ;;
  *)
    echo "unknown mode: $mode" >&2
    exit 2
    ;;
esac
SH
)"

offsite_log() {
  printf 'prod-backup-offsite: %s\n' "$*" >&2
}

offsite_die() {
  offsite_log "error: $*"
  exit 1
}

# Anchored regex equivalent of OFFSITE_EXCLUDED_TABLE_DATA.
offsite_excluded_regex() {
  local pattern
  local parts=()

  for pattern in "${OFFSITE_EXCLUDED_TABLE_DATA[@]}"; do
    parts+=("${pattern//\*/.*}")
  done
  local IFS='|'
  printf '^(%s)$' "${parts[*]}"
}

offsite_is_excluded_table() {
  local regex
  regex="$(offsite_excluded_regex)"
  [[ "$1" =~ $regex ]]
}

offsite_pg_dump_args() {
  local pattern

  for pattern in "${OFFSITE_EXCLUDED_TABLE_DATA[@]}"; do
    printf '%s\n' "--exclude-table-data=public.$pattern"
  done
}

# offsite_verify_toc TOC TABLES: the dump has data for exactly the schema's tables minus the
# excluded ones, every exclusion pattern matched a table, and the required tables exist.
offsite_verify_toc() {
  local toc="$1"
  local tables="$2"
  local regex
  local table
  local pattern
  local pattern_regex
  local problems=()
  local matched
  local -A dumped=()
  local -A present=()

  regex="$(offsite_excluded_regex)"
  while read -r table; do
    [[ -n "$table" ]] && dumped["$table"]=1
  done < <(awk '$4 == "TABLE" && $5 == "DATA" && $6 == "public" { print $7 }' <<<"$toc")

  while read -r table; do
    [[ -n "$table" ]] || continue
    present["$table"]=1
    if [[ "$table" =~ $regex ]]; then
      [[ -z "${dumped[$table]-}" ]] || problems+=("excluded table has data in the dump: $table")
    else
      [[ -n "${dumped[$table]-}" ]] || problems+=("table data missing from the dump: $table")
    fi
  done <<<"$tables"

  for table in "${OFFSITE_REQUIRED_TABLES[@]}"; do
    [[ -n "${present[$table]-}" ]] || problems+=("required table not in the schema: $table")
  done

  for pattern in "${OFFSITE_EXCLUDED_TABLE_DATA[@]}"; do
    pattern_regex="^${pattern//\*/.*}$"
    matched=false
    for table in "${!present[@]}"; do
      if [[ "$table" =~ $pattern_regex ]]; then
        matched=true
        break
      fi
    done
    [[ "$matched" == true ]] || problems+=("exclusion pattern matched no table: $pattern")
  done

  if (( ${#problems[@]} > 0 )); then
    printf 'prod-backup-offsite: %s\n' "${problems[@]}" >&2
    return 1
  fi
}

# Reads object names on stdin and prints those outside the retention set. The set is the newest
# copy of each of the newest KEEP_DAILY UTC days, KEEP_WEEKLY ISO weeks and KEEP_MONTHLY months
# that have copies, so missed nights never push older copies out early. Names that do not match
# this script's naming are never printed.
offsite_retention_deletions() {
  local keep_daily="${1:-14}"
  local keep_weekly="${2:-8}"
  local keep_monthly="${3:-12}"
  local name
  local names=()
  local weeks=()
  local i
  local day
  local week
  local month
  local keep
  local last_day=""
  local last_week=""
  local last_month=""
  local days_kept=0
  local weeks_kept=0
  local months_kept=0

  while IFS= read -r name; do
    [[ "$name" =~ $OFFSITE_OBJECT_PATTERN ]] && names+=("$name")
  done
  (( ${#names[@]} > 0 )) || return 0

  mapfile -t names < <(printf '%s\n' "${names[@]}" | LC_ALL=C sort -r -u)
  mapfile -t weeks < <(
    printf '%s\n' "${names[@]}" \
      | cut -c "$(( ${#OFFSITE_OBJECT_PREFIX} + 1 ))-$(( ${#OFFSITE_OBJECT_PREFIX} + 8 ))" \
      | TZ=UTC date -f - +%G-W%V
  )
  (( ${#weeks[@]} == ${#names[@]} )) || { offsite_log "error: could not date backup names"; return 1; }

  for i in "${!names[@]}"; do
    name="${names[$i]}"
    day="${name:${#OFFSITE_OBJECT_PREFIX}:8}"
    month="${day:0:6}"
    week="${weeks[$i]}"
    keep=false
    if [[ "$day" != "$last_day" ]]; then
      last_day="$day"
      if (( days_kept < keep_daily )); then
        days_kept=$((days_kept + 1))
        keep=true
      fi
    fi
    if [[ "$week" != "$last_week" ]]; then
      last_week="$week"
      if (( weeks_kept < keep_weekly )); then
        weeks_kept=$((weeks_kept + 1))
        keep=true
      fi
    fi
    if [[ "$month" != "$last_month" ]]; then
      last_month="$month"
      if (( months_kept < keep_monthly )); then
        months_kept=$((months_kept + 1))
        keep=true
      fi
    fi
    [[ "$keep" == true ]] || printf '%s\n' "$name"
  done
}

offsite_metric_value() {
  local file="$1"
  local metric="$2"

  [[ -f "$file" ]] || return 0
  awk -v metric="$metric" '$1 == metric { print $2; exit }' "$file"
}

# offsite_write_metrics RUN_SUCCESS [LAST_SUCCESS SIZE COPIES]: atomically rewrites the textfile.
# Without LAST_SUCCESS the previous file's newest-copy values are kept, or left out when there
# are none, so the stale rule sees no data until a copy has verified.
offsite_write_metrics() {
  local run_success="$1"
  local last_success="${2-}"
  local size="${3-}"
  local copies="${4-}"
  local dir="$OFFSITE_METRICS_DIR"
  local file="$dir/linewatch_offsite_backup.prom"
  local temp

  if [[ ! -d "$dir" ]]; then
    offsite_log "warning: metrics directory $dir is missing; the staleness alert cannot see this run"
    return 0
  fi
  if [[ -z "$last_success" ]]; then
    last_success="$(offsite_metric_value "$file" linewatch_offsite_backup_last_success_timestamp_seconds)"
    size="$(offsite_metric_value "$file" linewatch_offsite_backup_size_bytes)"
    copies="$(offsite_metric_value "$file" linewatch_offsite_backup_copies)"
  fi

  temp="$(mktemp "$dir/.linewatch_offsite_backup.XXXXXX")" || return 0
  {
    printf '# HELP linewatch_offsite_backup_last_run_timestamp_seconds When the latest off-host backup run ended.\n'
    printf '# TYPE linewatch_offsite_backup_last_run_timestamp_seconds gauge\n'
    printf 'linewatch_offsite_backup_last_run_timestamp_seconds %s\n' "$(date +%s)"
    printf '# HELP linewatch_offsite_backup_last_run_success 1 if the latest run uploaded, verified and pruned.\n'
    printf '# TYPE linewatch_offsite_backup_last_run_success gauge\n'
    printf 'linewatch_offsite_backup_last_run_success %s\n' "$run_success"
    if [[ -n "$last_success" ]]; then
      printf '# HELP linewatch_offsite_backup_last_success_timestamp_seconds Dump start time of the newest verified off-host copy.\n'
      printf '# TYPE linewatch_offsite_backup_last_success_timestamp_seconds gauge\n'
      printf 'linewatch_offsite_backup_last_success_timestamp_seconds %s\n' "$last_success"
    fi
    if [[ -n "$size" ]]; then
      printf '# HELP linewatch_offsite_backup_size_bytes Encrypted size of the newest verified copy.\n'
      printf '# TYPE linewatch_offsite_backup_size_bytes gauge\n'
      printf 'linewatch_offsite_backup_size_bytes %s\n' "$size"
    fi
    if [[ -n "$copies" ]]; then
      printf '# HELP linewatch_offsite_backup_copies Off-host copies kept after the newest verified run.\n'
      printf '# TYPE linewatch_offsite_backup_copies gauge\n'
      printf 'linewatch_offsite_backup_copies %s\n' "$copies"
    fi
  } > "$temp"
  chmod 644 "$temp"
  mv -f -- "$temp" "$file"
}

offsite_container() {
  LINEWATCH_PROD_ENV_FILE="$OFFSITE_PROD_ENV_FILE" \
  LINEWATCH_RELEASE_ENV_FILE="${LINEWATCH_RELEASE_ENV_FILE:-$ROOT_DIR/.env.release}" \
  LINEWATCH_PROD_COMPOSE_FILE="${LINEWATCH_PROD_COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}" \
    "$ROOT_DIR/scripts/prod-compose.sh" exec -T postgres sh -c "$OFFSITE_CONTAINER_SCRIPT" offsite "$@"
}

offsite_load_config() {
  local env_file="${LINEWATCH_OFFSITE_ENV_FILE:-$HOME/.config/linewatch/offsite-backup.env}"
  local mode
  local recipients

  [[ -f "$env_file" ]] || offsite_die "missing settings file: $env_file"
  mode="$(stat -c %a "$env_file")"
  (( (8#$mode & 8#077) == 0 )) || offsite_die "$env_file must not be readable by group or others (chmod 600)"
  if grep -q 'AGE-SECRET-KEY-' "$env_file"; then
    offsite_die "$env_file holds an age private key; the private key must never be on this host"
  fi
  set -a
  # shellcheck source=/dev/null
  source "$env_file"
  set +a

  OFFSITE_REMOTE="${LINEWATCH_OFFSITE_REMOTE:-}"
  [[ "$OFFSITE_REMOTE" == *:* ]] || offsite_die "LINEWATCH_OFFSITE_REMOTE must be an rclone remote path (remote:bucket/prefix)"
  OFFSITE_REMOTE="${OFFSITE_REMOTE%/}"

  recipients="${LINEWATCH_OFFSITE_AGE_RECIPIENTS_FILE:-$HOME/.config/linewatch/offsite-backup.age-recipients}"
  [[ -f "$recipients" ]] || offsite_die "missing age recipients file: $recipients"
  if grep -q 'AGE-SECRET-KEY-' "$recipients"; then
    offsite_die "$recipients holds an age private key; it must list public keys (age1...) only"
  fi
  grep -Eq '^age1[0-9a-z]+$' "$recipients" || offsite_die "$recipients lists no age public key (age1...)"
  OFFSITE_RECIPIENTS="$recipients"

  OFFSITE_PROD_ENV_FILE="${LINEWATCH_PROD_ENV_FILE:-$ROOT_DIR/.env.production}"
  [[ -f "$OFFSITE_PROD_ENV_FILE" ]] || offsite_die "missing env file: $OFFSITE_PROD_ENV_FILE"
  OFFSITE_WORK_ROOT="${LINEWATCH_OFFSITE_WORK_DIR:-$ROOT_DIR/tmp/offsite-backups}"
  OFFSITE_METRICS_DIR="${LINEWATCH_OFFSITE_METRICS_DIR:-/var/lib/linewatch/textfile-metrics}"
  OFFSITE_AGE_BIN="${AGE_BIN:-age}"
  OFFSITE_RCLONE_BIN="${RCLONE_BIN:-rclone}"
  command -v "$OFFSITE_AGE_BIN" >/dev/null || offsite_die "age is not installed"
  command -v "$OFFSITE_RCLONE_BIN" >/dev/null || offsite_die "rclone is not installed"
}

OFFSITE_RUN_DIR=""
OFFSITE_CONTAINER_DUMP=""
OFFSITE_SUCCEEDED=false
OFFSITE_METRICS_READY=false

offsite_finish() {
  local status=$?

  set +e
  if [[ -n "$OFFSITE_CONTAINER_DUMP" ]]; then
    offsite_container remove "$OFFSITE_CONTAINER_DUMP" </dev/null >/dev/null 2>&1 \
      || offsite_log "warning: could not remove $OFFSITE_CONTAINER_DUMP from the postgres container"
  fi
  if [[ -n "$OFFSITE_RUN_DIR" ]]; then
    rm -rf -- "$OFFSITE_RUN_DIR"
  fi
  if [[ "$OFFSITE_SUCCEEDED" != true && "$OFFSITE_METRICS_READY" == true ]]; then
    offsite_write_metrics 0
  fi
  exit "$status"
}

main() {
  local start_epoch
  local stamp
  local name
  local cipher
  local toc
  local tables
  local listing
  local remote_size
  local local_size
  local names
  local deletions
  local deletion
  local prune_failures=0
  local copies
  local dump_args=()

  umask 077
  offsite_load_config
  mkdir -p "$OFFSITE_WORK_ROOT"
  exec 8>"$OFFSITE_WORK_ROOT/.lock"
  flock -n 8 || offsite_die "another off-host backup is running"

  trap offsite_finish EXIT
  OFFSITE_METRICS_READY=true
  start_epoch="$(date +%s)"
  stamp="$(date -u -d "@$start_epoch" +%Y%m%dT%H%M%SZ)"
  name="$OFFSITE_OBJECT_PREFIX$stamp$OFFSITE_OBJECT_SUFFIX"
  OFFSITE_RUN_DIR="$(mktemp -d "$OFFSITE_WORK_ROOT/run.XXXXXX")"
  cipher="$OFFSITE_RUN_DIR/$name"

  mapfile -t dump_args < <(offsite_pg_dump_args)
  OFFSITE_CONTAINER_DUMP="/tmp/linewatch-offsite-$stamp.dump"
  offsite_log "dumping to the postgres container's $OFFSITE_CONTAINER_DUMP"
  offsite_container dump "$OFFSITE_CONTAINER_DUMP" "${dump_args[@]}" </dev/null >&2

  toc="$(offsite_container toc "$OFFSITE_CONTAINER_DUMP" </dev/null)"
  tables="$(offsite_container tables </dev/null)"
  offsite_verify_toc "$toc" "$tables" || offsite_die "the dump's table data does not match the exclusion list"

  offsite_log "encrypting to $(grep -Ec '^age1' "$OFFSITE_RECIPIENTS") age recipient(s)"
  offsite_container cat "$OFFSITE_CONTAINER_DUMP" </dev/null \
    | "$OFFSITE_AGE_BIN" --encrypt -R "$OFFSITE_RECIPIENTS" -o "$cipher.partial"
  [[ "$(head -c ${#OFFSITE_AGE_HEADER} "$cipher.partial")" == "$OFFSITE_AGE_HEADER" ]] \
    || offsite_die "encrypted output has no age header"
  mv -- "$cipher.partial" "$cipher"
  offsite_container remove "$OFFSITE_CONTAINER_DUMP" </dev/null
  OFFSITE_CONTAINER_DUMP=""

  local_size="$(stat -c %s "$cipher")"
  offsite_log "uploading $name ($local_size bytes) to $OFFSITE_REMOTE"
  "$OFFSITE_RCLONE_BIN" copyto "$cipher" "$OFFSITE_REMOTE/$name"

  listing="$("$OFFSITE_RCLONE_BIN" lsf --files-only --format ps --separator '|' "$OFFSITE_REMOTE")"
  remote_size="$(awk -F'|' -v name="$name" '$1 == name { print $2; exit }' <<<"$listing")"
  [[ "$remote_size" == "$local_size" ]] \
    || offsite_die "uploaded copy $name is not listed with $local_size bytes (listed: ${remote_size:-missing}); nothing pruned"

  names="$(cut -d'|' -f1 <<<"$listing")"
  deletions="$(offsite_retention_deletions 14 8 12 <<<"$names")"
  if grep -qxF "$name" <<<"$deletions"; then
    offsite_die "retention would delete the new copy $name; nothing pruned"
  fi
  while IFS= read -r deletion; do
    [[ -n "$deletion" ]] || continue
    if "$OFFSITE_RCLONE_BIN" deletefile "$OFFSITE_REMOTE/$deletion"; then
      offsite_log "pruned $deletion"
    else
      prune_failures=$((prune_failures + 1))
      offsite_log "warning: could not prune $deletion"
    fi
  done <<<"$deletions"

  copies="$(grep -Ec "$OFFSITE_OBJECT_PATTERN" <<<"$names" || true)"
  copies=$(( copies - $(grep -c . <<<"$deletions" || true) + prune_failures ))
  if (( prune_failures > 0 )); then
    offsite_write_metrics 0 "$start_epoch" "$local_size" "$copies"
    OFFSITE_SUCCEEDED=true
    offsite_log "error: $prune_failures older copies could not be pruned; the new copy is stored"
    exit 1
  fi
  offsite_write_metrics 1 "$start_epoch" "$local_size" "$copies"
  OFFSITE_SUCCEEDED=true
  printf '%s\n' "$OFFSITE_REMOTE/$name"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
