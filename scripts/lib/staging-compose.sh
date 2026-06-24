#!/usr/bin/env bash

linewatch_staging_die() {
  printf 'Error: %s\n' "$*" >&2
  return 1
}

linewatch_staging_root_dir() {
  local script_dir

  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)" || return 1
  printf '%s\n' "$script_dir"
}

linewatch_staging_env_file() {
  local root_dir="${LINEWATCH_ROOT_DIR:-$(linewatch_staging_root_dir)}"
  printf '%s\n' "${LINEWATCH_STAGING_ENV_FILE:-$root_dir/.env.staging}"
}

linewatch_staging_compose_file() {
  local root_dir="${LINEWATCH_ROOT_DIR:-$(linewatch_staging_root_dir)}"
  printf '%s\n' "${LINEWATCH_STAGING_COMPOSE_FILE:-$root_dir/docker-compose.staging.yml}"
}

linewatch_staging_project_name() {
  printf '%s\n' "${LINEWATCH_STAGING_PROJECT_NAME:-linewatch-staging}"
}

linewatch_staging_read_env_value() {
  local file="${1-}"
  local key="${2-}"

  if [[ ! -f "$file" ]]; then
    return 1
  fi
  if [[ ! "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]]; then
    linewatch_staging_die "invalid env key: $key"
    return 1
  fi

  sed -n "s/^${key}=//p" "$file" | tail -n 1
}

linewatch_staging_require_env() {
  local env_file
  env_file="$(linewatch_staging_env_file)" || return 1

  if [[ ! -f "$env_file" ]]; then
    linewatch_staging_die "missing staging env file: $env_file"
    printf 'Create it with: cp .env.staging.example .env.staging\n' >&2
    return 1
  fi
}

linewatch_staging_local_origin() {
  local env_file
  local port

  env_file="$(linewatch_staging_env_file)" || return 1
  port="$(linewatch_staging_read_env_value "$env_file" LINEWATCH_STAGING_HTTP_PORT || true)"
  printf 'http://127.0.0.1:%s\n' "${port:-8090}"
}

linewatch_staging_public_origin() {
  local env_file
  local origin
  local hostname

  env_file="$(linewatch_staging_env_file)" || return 1
  origin="$(linewatch_staging_read_env_value "$env_file" LINEWATCH_STAGING_PUBLIC_ORIGIN || true)"
  if [[ -n "$origin" ]]; then
    printf '%s\n' "$origin"
    return 0
  fi

  hostname="$(linewatch_staging_read_env_value "$env_file" LINEWATCH_STAGING_HOSTNAME || true)"
  if [[ -n "$hostname" ]]; then
    printf 'https://%s\n' "$hostname"
    return 0
  fi

  linewatch_staging_local_origin
}

linewatch_staging_smoke_origin() {
  local env_file
  local origin

  env_file="$(linewatch_staging_env_file)" || return 1
  origin="${LINEWATCH_STAGING_SMOKE_ORIGIN:-$(linewatch_staging_read_env_value "$env_file" LINEWATCH_STAGING_SMOKE_ORIGIN || true)}"
  if [[ -n "$origin" ]]; then
    printf '%s\n' "$origin"
  else
    linewatch_staging_local_origin
  fi
}

linewatch_staging_tunnel_enabled() {
  local env_file
  local token
  local skip_tunnel

  env_file="$(linewatch_staging_env_file)" || return 1
  skip_tunnel="${LINEWATCH_STAGING_SKIP_TUNNEL:-$(linewatch_staging_read_env_value "$env_file" LINEWATCH_STAGING_SKIP_TUNNEL || true)}"
  token="${LINEWATCH_CLOUDFLARED_TUNNEL_TOKEN:-$(linewatch_staging_read_env_value "$env_file" LINEWATCH_CLOUDFLARED_TUNNEL_TOKEN || true)}"

  [[ "$skip_tunnel" != "true" && -n "$token" ]]
}

linewatch_staging_build_label() {
  local root_dir="${LINEWATCH_ROOT_DIR:-$(linewatch_staging_root_dir)}"
  local explicit_label
  local short_sha

  explicit_label="${LINEWATCH_STAGING_BUILD_LABEL:-}"
  if [[ -n "$explicit_label" ]]; then
    printf '%s\n' "$explicit_label"
    return 0
  fi

  short_sha="$(git -C "$root_dir" rev-parse --short HEAD 2>/dev/null || true)"
  if [[ -n "$short_sha" ]]; then
    printf 'staging-%s\n' "$short_sha"
  else
    date -u '+staging-%Y%m%d%H%M%S'
  fi
}

linewatch_staging_frontend_app_version() {
  local root_dir="${LINEWATCH_ROOT_DIR:-$(linewatch_staging_root_dir)}"
  local package_json="$root_dir/frontend/package.json"
  local app_version

  app_version="$(node -e '
const { readFileSync } = require("node:fs");
const packageJsonPath = process.argv[1];
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const version = typeof packageJson.version === "string" ? packageJson.version.trim() : "";
if (!version) process.exit(1);
process.stdout.write(version);
' "$package_json")" || {
    linewatch_staging_die "could not read frontend package version from $package_json"
    return 1
  }

  printf '%s\n' "$app_version"
}

linewatch_staging_compose() {
  local root_dir="${LINEWATCH_ROOT_DIR:-$(linewatch_staging_root_dir)}"
  local env_file
  local compose_file
  local project_name
  local docker_bin="${DOCKER_BIN:-docker}"
  local frontend_app_version

  env_file="$(linewatch_staging_env_file)" || return 1
  compose_file="$(linewatch_staging_compose_file)" || return 1
  project_name="$(linewatch_staging_project_name)" || return 1
  frontend_app_version="${NEXT_PUBLIC_LINEWATCH_APP_VERSION:-$(linewatch_staging_frontend_app_version)}" || return 1

  LINEWATCH_ROOT_DIR="$root_dir" \
  LINEWATCH_STAGING_ENV_FILE="$env_file" \
  NEXT_PUBLIC_LINEWATCH_APP_VERSION="$frontend_app_version" \
  LINEWATCH_STAGING_BUILD_LABEL="${LINEWATCH_STAGING_BUILD_LABEL:-$(linewatch_staging_build_label)}" \
    "$docker_bin" compose \
      --project-name "$project_name" \
      --env-file "$env_file" \
      -f "$compose_file" \
      "$@"
}
