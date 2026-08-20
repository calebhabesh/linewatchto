#!/usr/bin/env bash

linewatch_die() {
  printf 'Error: %s\n' "$*" >&2
  return 1
}

linewatch_validate_image_tag() {
  local tag="${1-}"

  if [[ ! "$tag" =~ ^[0-9a-f]{40}$ ]]; then
    linewatch_die "image tag must be a full 40-character lowercase Git SHA"
    return 1
  fi
}

linewatch_normalize_registry() {
  local registry="${1-}"

  while [[ "$registry" == */ ]]; do
    registry="${registry%/}"
  done

  if [[ -z "$registry" ]]; then
    linewatch_die "image registry cannot be empty"
    return 1
  fi

  printf '%s\n' "$registry"
}

linewatch_image_ref() {
  local registry
  local component="${2-}"
  local tag="${3-}"

  registry="$(linewatch_normalize_registry "${1-}")" || return 1

  case "$component" in
    frontend|backend|postgres) ;;
    *)
      linewatch_die "unsupported image component: $component"
      return 1
      ;;
  esac

  linewatch_validate_image_tag "$tag" || return 1
  printf '%s/linewatch-%s:%s\n' "$registry" "$component" "$tag"
}

linewatch_require_clean_worktree() {
  local repo="${1-}"
  local status

  status="$(git -C "$repo" status --porcelain)" || return 1
  if [[ -n "$status" ]]; then
    printf '%s\n' "$status" >&2
    linewatch_die "release builds require a clean Git worktree"
    return 1
  fi
}

linewatch_write_release_env() {
  local output="${1-}"
  local registry
  local tag="${3-}"
  local parent
  local basename
  local temp
  local old_umask

  registry="$(linewatch_normalize_registry "${2-}")" || return 1
  linewatch_validate_image_tag "$tag" || return 1

  if [[ -z "$output" ]]; then
    linewatch_die "release env output path cannot be empty"
    return 1
  fi

  basename="${output##*/}"
  if [[ -z "$basename" ]]; then
    linewatch_die "release env output basename cannot be empty"
    return 1
  fi

  if [[ -d "$output" ]]; then
    linewatch_die "release env output path cannot be a directory: $output"
    return 1
  fi

  if [[ "$output" == */* ]]; then
    parent="${output%/*}"
    if [[ -z "$parent" ]]; then
      parent="/"
    fi
  else
    parent="."
  fi

  old_umask="$(umask)"
  umask 077

  if ! temp="$(mktemp "$parent/.${basename}.tmp.XXXXXX")"; then
    umask "$old_umask"
    return 1
  fi

  if ! chmod 0600 "$temp"; then
    umask "$old_umask"
    rm -f -- "$temp" || true
    return 1
  fi

  if ! printf \
    'LINEWATCH_IMAGE_REGISTRY=%s\nLINEWATCH_IMAGE_TAG=%s\n' \
    "$registry" \
    "$tag" > "$temp"; then
    umask "$old_umask"
    rm -f -- "$temp" || true
    return 1
  fi

  if ! mv -T -- "$temp" "$output"; then
    umask "$old_umask"
    rm -f -- "$temp" || true
    return 1
  fi

  umask "$old_umask"
}

linewatch_read_release_value() {
  local file="${1-}"
  local key="${2-}"

  if [[ ! -f "$file" ]]; then
    return 1
  fi
  if [[ ! "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]]; then
    linewatch_die "invalid release env key: $key"
    return 1
  fi

  sed -n "s/^${key}=//p" "$file" | tail -n 1
}

linewatch_compose() {
  local root_dir="${LINEWATCH_ROOT_DIR-}"
  local prod_env
  local release_env
  local compose_file
  local compose_project="${LINEWATCH_PROD_COMPOSE_PROJECT:-linewatch-to}"
  local docker_bin="${DOCKER_BIN:-docker}"

  if [[ -z "$root_dir" ]]; then
    linewatch_die "LINEWATCH_ROOT_DIR is required"
    return 1
  fi

  prod_env="${LINEWATCH_PROD_ENV_FILE:-$root_dir/.env.production}"
  release_env="${LINEWATCH_RELEASE_ENV_FILE:-$root_dir/.env.release}"
  compose_file="${LINEWATCH_PROD_COMPOSE_FILE:-$root_dir/docker-compose.prod.yml}"

  if [[ ! -f "$prod_env" ]]; then
    linewatch_die "missing production env file: $prod_env"
    return 1
  fi
  if [[ ! -f "$release_env" ]]; then
    linewatch_die "missing release env file: $release_env"
    return 1
  fi

  LINEWATCH_PROD_ENV_FILE="$prod_env" \
    "$docker_bin" compose \
      --project-name "$compose_project" \
      --env-file "$prod_env" \
      --env-file "$release_env" \
      -f "$compose_file" \
      "$@"
}
