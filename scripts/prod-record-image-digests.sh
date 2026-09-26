#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/prod-release.sh
source "$ROOT_DIR/scripts/lib/prod-release.sh"

SHA="${1:?full release SHA is required}"
MANIFEST="${2:?release manifest path is required}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
REGISTRY="$(linewatch_normalize_registry "${LINEWATCH_IMAGE_REGISTRY:-ghcr.io/calebhabesh}")"
linewatch_validate_image_tag "$SHA"

resolve_image() {
  local component="${1:?component is required}"
  local tag_ref
  local manifest_json
  local digest
  local pinned_ref

  tag_ref="$(linewatch_image_ref "$REGISTRY" "$component" "$SHA")"
  manifest_json="$("$DOCKER_BIN" buildx imagetools inspect "$tag_ref" --format '{{json .Manifest}}')"
  digest="$(jq -er '.digest | select(test("^sha256:[0-9a-f]{64}$"))' <<< "$manifest_json")"
  pinned_ref="$REGISTRY/linewatch-$component@$digest"
  linewatch_validate_pinned_image "$REGISTRY" "$component" "$pinned_ref"
  printf '%s\n' "$pinned_ref"
}

FRONTEND_IMAGE="$(resolve_image frontend)"
BACKEND_IMAGE="$(resolve_image backend)"
POSTGRES_IMAGE="$(resolve_image postgres)"
mkdir -p "$(dirname "$MANIFEST")"
linewatch_write_release_env "$MANIFEST" "$REGISTRY" "$SHA" \
  "$FRONTEND_IMAGE" "$BACKEND_IMAGE" "$POSTGRES_IMAGE"
"$ROOT_DIR/scripts/prod-verify-release-manifest.sh" "$MANIFEST" "$SHA"
printf 'Recorded image digests for %s in %s\n' "$SHA" "$MANIFEST"
