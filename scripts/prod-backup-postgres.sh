#!/usr/bin/env bash
set -euo pipefail

umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${LINEWATCH_PROD_COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}"
ENV_FILE="${LINEWATCH_PROD_ENV_FILE:-$ROOT_DIR/.env.production}"
BACKUP_DIR="${LINEWATCH_BACKUP_DIR:-$ROOT_DIR/tmp/prod-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT="$BACKUP_DIR/linewatch-postgres-$STAMP.sql.gz"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

LINEWATCH_PROD_ENV_FILE="$ENV_FILE" \
LINEWATCH_RELEASE_ENV_FILE="${LINEWATCH_RELEASE_ENV_FILE:-$ROOT_DIR/.env.release}" \
LINEWATCH_PROD_COMPOSE_FILE="$COMPOSE_FILE" \
  "$ROOT_DIR/scripts/prod-compose.sh" exec -T postgres \
    sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$OUTPUT"

echo "$OUTPUT"
