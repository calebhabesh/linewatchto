#!/usr/bin/env node

/**
 * Search index for surface routes and stops (plan 14, U1).
 *
 * Reads the generated Map View catalogs in
 * frontend/public/assets/linewatch/geographic/ (never GTFS) and writes
 * search-index-ttc.json and search-index-go.json beside them. The surface and
 * GO bus generators run it after they write, so a new schedule period
 * rebuilds the index. Output is deterministic for given catalogs.
 *
 * Usage:
 *   node scripts/generate-search-index.mjs [--network ttc|go|all] [--dir <geographic dir>]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { buildGoSearchIndex, buildTtcSearchIndex } from "./lib/search-index.mjs";

const args = process.argv.slice(2);
const arg = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
};
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const dir = resolve(arg("--dir", resolve(repoRoot, "frontend/public/assets/linewatch/geographic")));
const network = arg("--network", "all");
if (!["ttc", "go", "all"].includes(network)) throw new Error(`--network must be ttc, go or all, not ${network}`);

const read = name => JSON.parse(readFileSync(resolve(dir, name), "utf8"));
const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`;

function write(name, index) {
  const json = JSON.stringify(index) + "\n";
  writeFileSync(resolve(dir, name), json, "utf8");
  console.log(`[Search index] ${name}: ${index.routes.route.length} routes, ${index.stops.name.length} stops`);
  console.log(`  Raw: ${kb(Buffer.byteLength(json))} | Gzipped: ${kb(gzipSync(Buffer.from(json)).length)}`);
}

if (network !== "go") {
  write("search-index-ttc.json", buildTtcSearchIndex({
    streetcar: read("ttc-surface-streetcar.json"),
    bus: read("ttc-surface-bus.json"),
    busStops: read("ttc-surface-bus-stops.json"),
    night: read("ttc-surface-night.json"),
    nightStops: read("ttc-surface-night-stops.json"),
    nightRouteStops: read("ttc-surface-night-route-stops.json"),
    stationBays: read("ttc-station-bays.json"),
    stationCatalog: read("ttc-catalog.json"),
  }));
}
if (network !== "ttc") {
  write("search-index-go.json", buildGoSearchIndex({
    goBus: read("go-surface-bus.json"),
    goBusStops: read("go-surface-bus-stops.json"),
  }));
}
