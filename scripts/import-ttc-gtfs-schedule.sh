#!/usr/bin/env bash
set -euo pipefail

ZIP_PATH="${1:-/tmp/ttc-merged-gtfs.zip}"

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "GTFS zip not found: $ZIP_PATH" >&2
  echo "Run: node scripts/download-ttc-gtfs.mjs $ZIP_PATH" >&2
  exit 1
fi

mvn -f backend/pom.xml spring-boot:run \
  -Dspring-boot.run.arguments="--linewatch.arrivals.gtfs-import-enabled=true --linewatch.arrivals.gtfs-zip-path=$ZIP_PATH"
