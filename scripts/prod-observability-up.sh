#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Run validation checks
"$ROOT_DIR/scripts/observability-check-env.sh" production

# Start Alloy using docker compose
echo "Starting Grafana Alloy service in production..."
COMPOSE_PROFILES=observability "$ROOT_DIR/scripts/prod-compose.sh" up -d --no-build --wait alloy

# Show Alloy status
"$ROOT_DIR/scripts/prod-compose.sh" ps alloy
