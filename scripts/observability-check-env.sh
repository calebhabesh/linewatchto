#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Usage: scripts/observability-check-env.sh [production|staging]
ENV_TYPE="${1:-production}"

if [[ "$ENV_TYPE" == "production" ]]; then
  ENV_FILE="$ROOT_DIR/.env.production"
elif [[ "$ENV_TYPE" == "staging" ]]; then
  ENV_FILE="$ROOT_DIR/.env.staging"
else
  echo "Error: Unknown environment type '$ENV_TYPE'. Use 'production' or 'staging'." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: Environment file '$ENV_FILE' not found." >&2
  exit 1
fi

# Load variables from env file, exporting them
# Note: we filter out comments and empty lines
while IFS= read -r line || [[ -n "$line" ]]; do
  # Ignore comments and empty lines
  if [[ "$line" =~ ^[[:space:]]*# ]] || [[ -z "${line//[[:space:]]/}" ]]; then
    continue
  fi
  # Export the variable
  if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
    key="${BASH_REMATCH[1]}"
    val="${BASH_REMATCH[2]}"
    # Strip optional quotes
    val="${val#\"}"
    val="${val%\"}"
    val="${val#\'}"
    val="${val%\'}"
    export "$key"="$val"
  fi
done < "$ENV_FILE"

# Required variables list
REQUIRED_VARS=(
  GRAFANA_CLOUD_PROMETHEUS_REMOTE_WRITE_URL
  GRAFANA_CLOUD_PROMETHEUS_USERNAME
  GRAFANA_CLOUD_LOKI_URL
  GRAFANA_CLOUD_LOKI_USERNAME
  GRAFANA_CLOUD_API_TOKEN
)

# In production we also require LINEWATCH_OBSERVABILITY_COMPOSE_PROJECT
if [[ "$ENV_TYPE" == "production" ]]; then
  REQUIRED_VARS+=(LINEWATCH_OBSERVABILITY_COMPOSE_PROJECT)
fi

MISSING=0
for var in "${REQUIRED_VARS[@]}"; do
  val="${!var:-}"
  if [[ -z "$val" ]]; then
    echo "Error: Required observability environment variable '$var' is missing or empty in $ENV_FILE" >&2
    MISSING=1
  fi
done

if [[ "$MISSING" -eq 1 ]]; then
  if [[ "$ENV_TYPE" == "production" ]]; then
    echo "" >&2
    echo "To discover the production Compose project name, run:" >&2
    echo "  docker inspect \"\$(scripts/prod-compose.sh ps -q backend)\" --format '{{ index .Config.Labels \"com.docker.compose.project\" }}'" >&2
  fi
  exit 1
fi

echo "Observability environment validation succeeded for '$ENV_TYPE'."
