#!/usr/bin/env bash
# Rebuild the committed schedule-derived Map View and search assets from the current published GTFS.
#
# Riders get new schedules from the schedule-assets service at runtime (plan 16); these committed
# copies are its bootstrap generation on an empty volume and the client's fallback without a
# manifest. Refresh them by hand now and then, so a fresh volume does not start far behind.
#
# Downloads the current TTC GTFS (the zip resource Open Data Toronto's CKAN package lists, the
# same lookup the backend's daily schedule refresh makes) and the current GO GTFS (Metrolinx
# Open Data), then runs the surface, night, GO bus and search index generators:
#   frontend/public/assets/linewatch/geographic/ttc-surface-{streetcar,bus,night}*.json,
#   go-surface-bus*.json, search-index-{ttc,go}.json and
#   backend/src/main/resources/regional/go-bus-stops.csv.
# Output is deterministic per archive, so an unchanged feed leaves the tree unchanged.
# The subway/rail catalogs and station plans are audited separately and not rebuilt here.
#
# Usage: scripts/refresh-schedule-assets.sh [download dir]   (default: a temporary directory)
# Prints the feed periods it used. Needs curl, jq, unzip and node.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_dir="${1:-$(mktemp -d)}"
mkdir -p "$work_dir"

ttc_package_url="https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=merged-gtfs-ttc-routes-and-schedules"
go_gtfs_url="https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/GO-GTFS.zip"
user_agent="LineWatchTO schedule asset refresh"

ttc_zip_url="$(curl -fsSL -A "$user_agent" "$ttc_package_url" \
  | jq -r '[.result.resources[] | select((.url | ascii_downcase | endswith(".zip")) or (.format | ascii_downcase | contains("zip"))) | .url][0] // empty')"
if [ -z "$ttc_zip_url" ]; then
  echo "TTC CKAN package lists no zip resource" >&2
  exit 1
fi

curl -fsSL --retry 3 -A "$user_agent" -o "$work_dir/completegtfs.zip" "$ttc_zip_url"
curl -fsSL --retry 3 -A "$user_agent" -o "$work_dir/GO-GTFS.zip" "$go_gtfs_url"
unzip -tq "$work_dir/completegtfs.zip" >/dev/null
unzip -tq "$work_dir/GO-GTFS.zip" >/dev/null

# "<label> feed: <version>, <start> to <end>" from feed_info.txt (the GO file starts with a BOM).
feed_period() {
  unzip -p "$2" feed_info.txt | tr -d '\r' | sed '1s/^\xEF\xBB\xBF//' | awk -F, -v label="$1" '
    NR == 1 { for (i = 1; i <= NF; i++) column[$i] = i; next }
    NR == 2 { printf "%s feed: %s, %s to %s\n", label, $column["feed_version"], $column["feed_start_date"], $column["feed_end_date"] }'
}
feed_period TTC "$work_dir/completegtfs.zip"
feed_period GO "$work_dir/GO-GTFS.zip"

cd "$repo_root"
for mode in streetcar bus night; do
  node scripts/generate-surface-catalog.mjs --mode "$mode" --ttc-gtfs "$work_dir/completegtfs.zip"
done
node scripts/generate-go-bus-catalog.mjs --go-gtfs "$work_dir/GO-GTFS.zip"

# Open Data Toronto re-zips an unchanged feed, so the archive hash can move while the data does not.
# Keep the committed file when the archive hash is its only difference.
geographic_dir="frontend/public/assets/linewatch/geographic"
for path in $(git diff --name-only -- "$geographic_dir"); do
  before="$(git show "HEAD:$path" | jq -S 'del(.. | .archiveSha256?)')"
  after="$(jq -S 'del(.. | .archiveSha256?)' "$path")"
  if [ "$before" = "$after" ]; then
    git checkout --quiet -- "$path"
  fi
done
# The search indexes carry no archive hash; they are rebuilt from the kept or changed catalogs.
node scripts/generate-search-index.mjs --network all >/dev/null

git status --short -- "$geographic_dir" backend/src/main/resources/regional/go-bus-stops.csv
