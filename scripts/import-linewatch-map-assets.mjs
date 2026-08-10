#!/usr/bin/env node

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourceRoot = process.argv[2]
  ? resolve(process.argv[2])
  : "~/Pictures/Assets/LineWatch/Maps";
const airportSource = process.argv[3]
  ? resolve(process.argv[3])
  : "~/Pictures/Assets/LineWatch/airport.svg";
const assetRoot = resolve(repositoryRoot, "frontend/public/assets/linewatch");
const connectionsRoot = resolve(assetRoot, "connections");

const TTC_SOURCE = resolve(sourceRoot, "TTC_Subway_Map_Custom_Edited.svg");
const REGIONAL_SOURCE = resolve(sourceRoot, "Metrolinx_Custom_Map.svg");

const LAYER_IDS = new Map([
  ["Lakes", "regional-lakes-layer"],
  ["lines", "regional-lines-layer"],
  ["stations", "regional-stations-layer"],
  ["station-text", "regional-station-labels-layer"],
  ["line-labels", "regional-route-labels-layer"],
]);

const ROUTE_IDS = new Map([
  ["BR", "regional-route-br-path"],
  ["KI", "regional-route-ki-path"],
  ["UP", "regional-route-up-path"],
  ["MI", "regional-route-mi-path"],
  ["LW-1", "regional-route-lw-main-path"],
  ["LW-2", "regional-route-lw-branch-path"],
  ["RH", "regional-route-rh-path"],
  ["ST", "regional-route-st-path"],
  ["LE", "regional-route-le-path"],
  ["LW-DIV", "regional-route-lw-div"],
]);

const JUNCTION_IDS = new Set(["station-weston", "station-mount-dennis", "station-bloor"]);

// Runtime projection reads the freshly imported route paths. An empty marker
// preserves the SVG contract without freezing geometry from an older export.
const REGIONAL_SEGMENT_GUIDES = `<g id="regional-segment-guides-layer" style="display:none" />`;

function replaceElementId(tag, id) {
  if (/\bid="[^"]+"/.test(tag)) return tag.replace(/\bid="[^"]+"/, `id="${id}"`);
  return tag.replace(/^<(\w+)/, `<$1 id="${id}"`);
}

function normalizeExportWhitespace(source) {
  return `${source.replace(/[ \t]+$/gm, "").trimEnd()}\n`;
}

function normalizeUpExpressLogo(source) {
  return normalizeExportWhitespace(source.replaceAll("fill:#000000", "fill:#4084cd"));
}

function normalizeRegionalMap(source) {
  let normalized = source
    .replace(/viewBox="0 0 16636\.959 8631\.6719"/, 'viewBox="-200 -200 17036.959 9031.6719"')
    .replace(/inkscape:label="service-pattern-st-limited"/, 'inkscape:label="service-pattern-stouffville-limited"')
    .replace(/inkscape:label="up-accent-path"/, 'inkscape:label="up-accent-pattern"');

  normalized = normalized.replace(/<(g|path|circle|ellipse|rect)\b[^>]*>/g, (tag, elementName) => {
    const label = tag.match(/inkscape:label="([^"]+)"/)?.[1];
    if (!label) return tag;

    const normalizedId = LAYER_IDS.get(label)
      ?? (elementName === "path" ? ROUTE_IDS.get(label) : undefined)
      ?? (elementName === "g" && JUNCTION_IDS.has(label) ? label : undefined)
      ?? (["circle", "ellipse", "rect"].includes(elementName) && label.startsWith("station-") ? label : undefined);
    return normalizedId ? replaceElementId(tag, normalizedId) : tag;
  });

  normalized = normalized.replace(
    /(<g\b(?=[^>]*id="regional-lakes-layer")[^>]*style=")([^"]*)(")/,
    (_match, before, style, after) => `${before}${style.replace(/display:inline/, "display:none")}${after}`,
  );
  normalized = normalized.replace(
    /(<g\b[^>]*id="regional-stations-layer"[^>]*>)/,
    `$1${REGIONAL_SEGMENT_GUIDES}`,
  );

  const requiredIds = [
    ...LAYER_IDS.values(),
    ...ROUTE_IDS.values(),
    "station-union",
    "station-weston",
    "station-weston-ki",
    "station-weston-up",
    "station-mount-dennis",
    "station-mount-dennis-ki",
    "station-mount-dennis-up",
    "station-bloor",
    "station-bloor-ki",
    "station-bloor-up",
    "regional-segment-guides-layer",
  ];
  for (const id of requiredIds) {
    const count = normalized.match(new RegExp(`id="${id}"`, "g"))?.length ?? 0;
    if (count !== 1) throw new Error(`Expected one ${id} in normalized regional map; found ${count}`);
  }
  return normalizeExportWhitespace(normalized);
}

mkdirSync(connectionsRoot, { recursive: true });
execFileSync(process.execPath, [
  resolve(repositoryRoot, "scripts/prepare-ttc-map-asset.mjs"),
  TTC_SOURCE,
  resolve(assetRoot, "ttc-subway-map-custom.svg"),
], { stdio: "inherit" });
writeFileSync(
  resolve(assetRoot, "regional-rail-map.svg"),
  normalizeRegionalMap(readFileSync(REGIONAL_SOURCE, "utf8")),
);
copyFileSync(resolve(sourceRoot, "via-rail-logo.svg"), resolve(connectionsRoot, "via-rail-logo.svg"));
copyFileSync(resolve(sourceRoot, "go-logo.svg"), resolve(connectionsRoot, "go-logo.svg"));
writeFileSync(
  resolve(connectionsRoot, "up-express-logo.svg"),
  normalizeUpExpressLogo(readFileSync(resolve(sourceRoot, "up-express-logo.svg"), "utf8")),
);
copyFileSync(airportSource, resolve(connectionsRoot, "airport.svg"));

console.log(`Imported and normalized LineWatchTO maps from ${sourceRoot}`);
