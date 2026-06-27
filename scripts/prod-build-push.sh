#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/prod-release.sh
source "$ROOT_DIR/scripts/lib/prod-release.sh"

DOCKER_BIN="${DOCKER_BIN:-docker}"
REGISTRY="$(linewatch_normalize_registry "${LINEWATCH_IMAGE_REGISTRY:-ghcr.io/calebhabesh}")"
PLATFORM="${LINEWATCH_IMAGE_PLATFORM:-linux/arm64}"
BUILDER="${LINEWATCH_BUILDX_BUILDER:-linewatch-prod-builder}"
SOURCE_URL="https://github.com/calebhabesh/ttc-reliability-navigator"
DEFAULT_SUPPORT_URL="https://ko-fi.com/linewatchto"

if [[ "${LINEWATCH_SKIP_CLEAN_CHECK:-false}" != "true" ]]; then
  linewatch_require_clean_worktree "$ROOT_DIR"
fi

SHA="${LINEWATCH_RELEASE_SHA:-$(git -C "$ROOT_DIR" rev-parse HEAD)}"
linewatch_validate_image_tag "$SHA"
SHORT_SHA="${SHA:0:12}"
FRONTEND_APP_VERSION="${LINEWATCH_APP_VERSION:-$(node -e 'const { readFileSync } = require("node:fs"); const packageJsonPath = process.argv[1]; process.stdout.write(JSON.parse(readFileSync(packageJsonPath, "utf8")).version || "1.0.0");' "$ROOT_DIR/frontend/package.json")}"

"$DOCKER_BIN" info > /dev/null
"$DOCKER_BIN" buildx version > /dev/null

if ! "$DOCKER_BIN" buildx inspect "$BUILDER" > /dev/null 2>&1; then
  "$DOCKER_BIN" buildx create \
    --name "$BUILDER" \
    --driver docker-container \
    --use
else
  "$DOCKER_BIN" buildx use "$BUILDER"
fi
"$DOCKER_BIN" buildx inspect "$BUILDER" --bootstrap > /dev/null

build_and_push() {
  local component="${1:?component is required}"
  local dockerfile="${2:?dockerfile is required}"
  local context="${3:?context is required}"
  shift 3

  "$DOCKER_BIN" buildx build \
    --builder "$BUILDER" \
    --platform "$PLATFORM" \
    --file "$dockerfile" \
    --label "org.opencontainers.image.source=$SOURCE_URL" \
    --label "org.opencontainers.image.revision=$SHA" \
    --tag "$(linewatch_image_ref "$REGISTRY" "$component" "$SHA")" \
    --push \
    "$@" \
    "$context"
}

build_and_push backend "$ROOT_DIR/backend/Dockerfile" "$ROOT_DIR"
build_and_push postgres "$ROOT_DIR/infra/postgres/Dockerfile" "$ROOT_DIR"
build_and_push frontend "$ROOT_DIR/frontend/Dockerfile" "$ROOT_DIR/frontend" \
  --build-arg "NEXT_PUBLIC_LINEWATCH_APP_VERSION=$FRONTEND_APP_VERSION" \
  --build-arg "NEXT_PUBLIC_LINEWATCH_BUILD_LABEL=prod-$SHORT_SHA" \
  --build-arg "NEXT_PUBLIC_LINEWATCH_SUPPORT_URL=${NEXT_PUBLIC_LINEWATCH_SUPPORT_URL:-$DEFAULT_SUPPORT_URL}" \
  --build-arg "NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS=${NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS:-30000}"

cat <<EOF
Published LineWatchTO release:
  $REGISTRY/linewatch-frontend:$SHA
  $REGISTRY/linewatch-backend:$SHA
  $REGISTRY/linewatch-postgres:$SHA

Deploy on the VPS:
  scripts/prod-deploy.sh $SHA
EOF
