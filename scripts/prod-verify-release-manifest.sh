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

for component in frontend backend postgres; do
  key="LINEWATCH_${component^^}_IMAGE"
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
    printf '%s_image=%s\n' "$component" "$image" >> "$GITHUB_OUTPUT"
  fi
  printf 'Verified %s\n' "$image"
done
