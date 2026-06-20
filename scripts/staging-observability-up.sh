#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Run validation checks
"$ROOT_DIR/scripts/observability-check-env.sh" staging

# Start Alloy using docker compose
echo "Starting Grafana Alloy service in staging..."
COMPOSE_PROFILES=observability "$ROOT_DIR/scripts/staging-compose.sh" up -d --wait alloy

# Show Alloy status
"$ROOT_DIR/scripts/staging-compose.sh" ps alloy
