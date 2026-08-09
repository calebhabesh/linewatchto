#!/usr/bin/env node

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourceRoot = process.argv[2]
  ? resolve(process.argv[2])
  : "~/Pictures/Assets/LineWatch/Maps";
const airportSource = process.argv[3]
  ? resolve(process.argv[3])
  : "~/Pictures/Assets/LineWatch/airport.svg";
const assetRoot = resolve(repositoryRoot, "frontend/public/assets/linewatch");
const connectionsRoot = resolve(assetRoot, "connections");

const TTC_SOURCE = resolve(sourceRoot, "TTC_Subway_Map_Edited.svg");
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

const REGIONAL_SEGMENT_GUIDES = `<g id="regional-segment-guides-layer" style="display:none">
    <path id="segment-guide-ki-bloor-mount-dennis" d="M 4531.3117,3677.5021 L 4529.7746,2913.8344 L 4131.9047,2682.7025" />
    <path id="segment-guide-ki-weston-etobicoke-north" d="M 3428.5664,2278.2556 L 2987.0609,2023.1482 H 2845.6543" />
    <path id="segment-guide-up-bloor-mount-dennis" d="M 4261.9824,3678.6078 L 4263.2112,3122.3055 L 3962.0964,2953.3683" />
    <path id="segment-guide-up-weston-pearson-airport" d="M 3263.5664,2559.7402 L 2850.3846,2326.7284 H 2606.1017 L 1672.8678,2913.9392" />
  </g>`;

function replaceElementId(tag, id) {
  if (/\bid="[^"]+"/.test(tag)) return tag.replace(/\bid="[^"]+"/, `id="${id}"`);
  return tag.replace(/^<(\w+)/, `<$1 id="${id}"`);
}

function normalizeExportWhitespace(source) {
  return `${source.replace(/[ \t]+$/gm, "").trimEnd()}\n`;
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

function normalizeTtcMap(source) {
  const wrapperAt = source.indexOf('inkscape:label="go-up-logo-mount-dennis"');
  const upGroupAt = source.indexOf('id="g3"', wrapperAt);
  if (wrapperAt < 0 || upGroupAt < 0) {
    throw new Error("Mount Dennis UP artwork is unavailable in the TTC map");
  }
  return normalizeExportWhitespace(
    `${source.slice(0, upGroupAt)}id="g3" inkscape:label="mount-dennis-up"${source.slice(upGroupAt + 'id="g3"'.length)}`,
  );
}

mkdirSync(connectionsRoot, { recursive: true });
writeFileSync(
  resolve(assetRoot, "ttc-subway-map-edited.svg"),
  normalizeTtcMap(readFileSync(TTC_SOURCE, "utf8")),
);
writeFileSync(
  resolve(assetRoot, "regional-rail-map.svg"),
  normalizeRegionalMap(readFileSync(REGIONAL_SOURCE, "utf8")),
);
copyFileSync(resolve(sourceRoot, "via-rail-logo.svg"), resolve(connectionsRoot, "via-rail-logo.svg"));
copyFileSync(resolve(sourceRoot, "go-logo.svg"), resolve(connectionsRoot, "go-logo.svg"));
copyFileSync(resolve(sourceRoot, "up-express-logo.svg"), resolve(connectionsRoot, "up-express-logo.svg"));
copyFileSync(airportSource, resolve(connectionsRoot, "airport.svg"));

console.log(`Imported and normalized LineWatchTO maps from ${sourceRoot}`);
