#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/prod-release.sh
source "$ROOT_DIR/scripts/lib/prod-release.sh"
SHA="$(git -C "$ROOT_DIR" rev-parse HEAD)"
MANIFEST="${LINEWATCH_RELEASE_MANIFEST_FILE:-$ROOT_DIR/tmp/release-images.env}"
linewatch_validate_image_tag "$SHA"
[[ "${LINEWATCH_RELEASE_SHA:-$SHA}" == "$SHA" ]] || linewatch_die "release SHA must match the checked-out commit"

"$ROOT_DIR/scripts/prod-build-push.sh"
"$ROOT_DIR/scripts/prod-record-image-digests.sh" "$SHA" "$MANIFEST"
