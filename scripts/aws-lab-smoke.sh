#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/aws-lab.sh
source "$ROOT_DIR/scripts/lib/aws-lab.sh"

export LINEWATCH_ROOT_DIR="$ROOT_DIR"

OUTPUT_JSON="$(linewatch_aws_lab_output_json)"
ORIGIN="$(linewatch_aws_lab_output_value "$OUTPUT_JSON" http_url)"
ARTIFACT_BUCKET="$(linewatch_aws_lab_output_value "$OUTPUT_JSON" artifact_bucket)"
ARTIFACT_DIR="$ROOT_DIR/tmp/aws-lab-smoke"
ARTIFACT_PATH="$ARTIFACT_DIR/smoke-$(date -u '+%Y%m%dT%H%M%SZ').json"

LINEWATCH_DEPLOY_FRONTEND_URL="$ORIGIN" \
LINEWATCH_DEPLOY_BACKEND_URL="$ORIGIN" \
  node "$ROOT_DIR/scripts/smoke-deploy.mjs"

linewatch_aws_lab_write_smoke_artifact "$ARTIFACT_PATH" "$ORIGIN" "passed"

if command -v aws >/dev/null 2>&1; then
  aws s3 cp "$ARTIFACT_PATH" "s3://$ARTIFACT_BUCKET/smoke/$(basename "$ARTIFACT_PATH")" >/dev/null
  printf 'Smoke artifact uploaded to s3://%s/smoke/%s\n' "$ARTIFACT_BUCKET" "$(basename "$ARTIFACT_PATH")"
else
  printf 'AWS CLI not found; smoke artifact kept at %s\n' "$ARTIFACT_PATH"
fi
