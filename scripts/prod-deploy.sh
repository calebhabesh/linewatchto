#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/prod-release.sh
source "$ROOT_DIR/scripts/lib/prod-release.sh"

export LINEWATCH_ROOT_DIR="$ROOT_DIR"

PROD_ENV="${LINEWATCH_PROD_ENV_FILE:-$ROOT_DIR/.env.production}"
RELEASE_ENV="${LINEWATCH_RELEASE_ENV_FILE:-$ROOT_DIR/.env.release}"
TAG="${1:-}"
PREVIOUS_TAG=""
CANDIDATE=""

linewatch_validate_image_tag "$TAG"
[[ -f "$PROD_ENV" ]] || linewatch_die "missing production env file: $PROD_ENV"

if [[ -f "$RELEASE_ENV" ]]; then
  PREVIOUS_TAG="$(linewatch_read_release_value "$RELEASE_ENV" LINEWATCH_IMAGE_TAG || true)"
fi

REGISTRY="${LINEWATCH_IMAGE_REGISTRY:-}"
if [[ -z "$REGISTRY" && -f "$RELEASE_ENV" ]]; then
  REGISTRY="$(linewatch_read_release_value "$RELEASE_ENV" LINEWATCH_IMAGE_REGISTRY || true)"
fi
REGISTRY="$(linewatch_normalize_registry "${REGISTRY:-ghcr.io/calebhabesh}")"

mkdir -p "$(dirname "$RELEASE_ENV")"
CANDIDATE="$(mktemp "${RELEASE_ENV}.candidate.XXXXXX")"
trap 'rm -f -- "$CANDIDATE"' EXIT
linewatch_write_release_env "$CANDIDATE" "$REGISTRY" "$TAG" \
  "${LINEWATCH_FRONTEND_IMAGE:-}" "${LINEWATCH_BACKEND_IMAGE:-}" "${LINEWATCH_POSTGRES_IMAGE:-}"

export LINEWATCH_PROD_ENV_FILE="$PROD_ENV"
export LINEWATCH_RELEASE_ENV_FILE="$CANDIDATE"

if [[ "${LINEWATCH_DEPLOY_SKIP_CONFIG_CHECK:-false}" != "true" ]]; then
  linewatch_compose config > /dev/null
fi

linewatch_compose pull postgres backend frontend

if ! linewatch_compose up \
  -d \
  --no-build \
  --remove-orphans \
  --wait \
  --wait-timeout "${LINEWATCH_DEPLOY_WAIT_SECONDS:-240}"; then
  printf 'Deployment failed for release %s.\n' "$TAG" >&2
  linewatch_compose ps >&2 || true
  linewatch_compose logs --tail 150 postgres redis backend frontend caddy >&2 || true
  if [[ -n "$PREVIOUS_TAG" ]]; then
    printf 'Previous release remains recorded as %s.\n' "$PREVIOUS_TAG" >&2
    printf 'Rollback command: scripts/prod-deploy.sh %s\n' "$PREVIOUS_TAG" >&2
  fi
  exit 1
fi

if ! linewatch_compose run --rm --no-deps --entrypoint caddy caddy \
  validate --config /etc/caddy/Caddyfile --adapter caddyfile < /dev/null; then
  printf 'Deployment failed: the mounted production Caddyfile is invalid.\n' >&2
  printf 'The previous release tag remains recorded as %s.\n' "${PREVIOUS_TAG:-none}" >&2
  exit 1
fi

if ! linewatch_compose up \
  -d \
  --no-deps \
  --force-recreate \
  --wait \
  --wait-timeout "${LINEWATCH_DEPLOY_WAIT_SECONDS:-240}" \
  caddy; then
  printf 'Deployment failed: Caddy could not restart with the mounted production configuration.\n' >&2
  printf 'The previous release tag remains recorded as %s.\n' "${PREVIOUS_TAG:-none}" >&2
  exit 1
fi

mv -T -- "$CANDIDATE" "$RELEASE_ENV"
trap - EXIT
export LINEWATCH_RELEASE_ENV_FILE="$RELEASE_ENV"

linewatch_compose ps

if [[ "${LINEWATCH_DEPLOY_PRUNE_IMAGES:-true}" == "true" ]]; then
  if ! "${DOCKER_BIN:-docker}" image prune -a --force; then
    printf 'Warning: deployment succeeded, but unused Docker image cleanup failed.\n' >&2
  fi
fi

cat <<EOF
Deployed LineWatchTO release $TAG.

Public verification:
  LINEWATCH_DEPLOY_FRONTEND_URL=https://linewatchto.ca \\
  LINEWATCH_DEPLOY_BACKEND_URL=https://api.linewatchto.ca \\
  node scripts/smoke-deploy.mjs
EOF
