#!/usr/bin/env bash

linewatch_aws_lab_die() {
  printf 'Error: %s\n' "$*" >&2
  return 1
}

linewatch_aws_lab_root_dir() {
  local source_dir
  source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  printf '%s\n' "$source_dir"
}

linewatch_aws_lab_terraform_dir() {
  local root_dir
  root_dir="${LINEWATCH_ROOT_DIR:-$(linewatch_aws_lab_root_dir)}"
  printf '%s\n' "$root_dir/infra/aws-lab"
}

linewatch_aws_lab_output_json() {
  local terraform_dir
  terraform_dir="${LINEWATCH_AWS_LAB_TERRAFORM_DIR:-$(linewatch_aws_lab_terraform_dir)}"
  terraform -chdir="$terraform_dir" output -json
}

linewatch_aws_lab_output_value() {
  local json="${1:?json is required}"
  local key="${2:?key is required}"

  LINEWATCH_AWS_LAB_OUTPUT_JSON="$json" LINEWATCH_AWS_LAB_OUTPUT_KEY="$key" \
    node -e '
const data = JSON.parse(process.env.LINEWATCH_AWS_LAB_OUTPUT_JSON || "{}");
const key = process.env.LINEWATCH_AWS_LAB_OUTPUT_KEY;
if (!Object.prototype.hasOwnProperty.call(data, key)) {
  console.error(`missing Terraform output: ${key}`);
  process.exit(1);
}
const value = data[key] && data[key].value;
if (typeof value !== "string" || value.length === 0) {
  console.error(`Terraform output is not a non-empty string: ${key}`);
  process.exit(1);
}
process.stdout.write(value);
'
}

linewatch_aws_lab_write_smoke_artifact() {
  local artifact_path="${1:?artifact path is required}"
  local origin="${2:?origin is required}"
  local status="${3:?status is required}"
  local created_at

  created_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  mkdir -p "$(dirname "$artifact_path")"
  LINEWATCH_AWS_LAB_ARTIFACT_PATH="$artifact_path" \
  LINEWATCH_AWS_LAB_ARTIFACT_ORIGIN="$origin" \
  LINEWATCH_AWS_LAB_ARTIFACT_STATUS="$status" \
  LINEWATCH_AWS_LAB_ARTIFACT_CREATED_AT="$created_at" \
    node <<'NODE'
const fs = require("node:fs");

const artifact = {
  project: "linewatch",
  environment: "aws-lab",
  origin: process.env.LINEWATCH_AWS_LAB_ARTIFACT_ORIGIN,
  status: process.env.LINEWATCH_AWS_LAB_ARTIFACT_STATUS,
  createdAt: process.env.LINEWATCH_AWS_LAB_ARTIFACT_CREATED_AT,
};

fs.writeFileSync(
  process.env.LINEWATCH_AWS_LAB_ARTIFACT_PATH,
  `${JSON.stringify(artifact, null, 2)}\n`,
  "utf8",
);
NODE
}
