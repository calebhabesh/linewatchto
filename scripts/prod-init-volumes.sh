#!/usr/bin/env bash
set -euo pipefail

DOCKER_BIN="${DOCKER_BIN:-docker}"
VOLUMES=(
  linewatchto_postgres_prod_data
  linewatchto_redis_prod_data
  linewatchto_caddy_data
  linewatchto_caddy_config
  linewatchto_alloy_prod_data
)

for volume_name in "${VOLUMES[@]}"; do
  if "$DOCKER_BIN" volume inspect "$volume_name" > /dev/null 2>&1; then
    printf 'Existing production volume: %s\n' "$volume_name"
    continue
  fi

  "$DOCKER_BIN" volume create \
    --label ca.linewatchto.persistence=production \
    "$volume_name" > /dev/null
  printf 'Created production volume: %s\n' "$volume_name"
done
