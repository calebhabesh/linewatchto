#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/prod-release.sh
source "$ROOT_DIR/scripts/lib/prod-release.sh"

MANIFEST="${1:?release manifest path is required}"
SHA="${2:?full release SHA is required}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
REGISTRY="ghcr.io/calebhabesh"
linewatch_validate_image_tag "$SHA"
[[ -f "$MANIFEST" ]] || linewatch_die "missing release manifest: $MANIFEST"
[[ "$(linewatch_read_release_value "$MANIFEST" LINEWATCH_IMAGE_REGISTRY)" == "$REGISTRY" ]] || \
  linewatch_die "unexpected release registry"
[[ "$(linewatch_read_release_value "$MANIFEST" LINEWATCH_IMAGE_TAG)" == "$SHA" ]] || \
  linewatch_die "release manifest SHA does not match $SHA"

components=(frontend backend postgres)
# Plan 16: the schedule-assets image. Required for a release that contains the service, so its
# Compose service never falls back to a mutable tag; absent for releases before it.
if [[ -n "$(linewatch_read_release_value "$MANIFEST" LINEWATCH_SCHEDULE_ASSETS_IMAGE)" ]] || \
  git -C "$ROOT_DIR" cat-file -e "$SHA:services/schedule-assets/Dockerfile" 2>/dev/null; then
  components+=(schedule-assets)
fi
for component in "${components[@]}"; do
  name="${component//-/_}"
  key="LINEWATCH_${name^^}_IMAGE"
  image="$(linewatch_read_release_value "$MANIFEST" "$key")"
  linewatch_validate_pinned_image "$REGISTRY" "$component" "$image"

  manifest_json="$("$DOCKER_BIN" buildx imagetools inspect "$image" --format '{{json .Manifest}}')"
  digest="$(jq -er '.digest | select(test("^sha256:[0-9a-f]{64}$"))' <<< "$manifest_json")"
  [[ "$image" == "$REGISTRY/linewatch-$component@$digest" ]] || \
    linewatch_die "published $component digest changed"

  image_json="$("$DOCKER_BIN" buildx imagetools inspect "$image" --format '{{json .Image}}')"
  jq -e --arg sha "$SHA" '
    [.. | objects | select(.architecture? == "arm64" and .os? == "linux")]
    | any(.[]; .config.Labels["org.opencontainers.image.revision"] == $sha)
  ' <<< "$image_json" >/dev/null || linewatch_die "$component image is not ARM64 for $SHA"

  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    printf '%s_image=%s\n' "$name" "$image" >> "$GITHUB_OUTPUT"
  fi
  printf 'Verified %s\n' "$image"
done
