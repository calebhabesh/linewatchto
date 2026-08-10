import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_SOURCE = "~/Pictures/Assets/LineWatch/Maps/Metrolinx_Custom_Map.svg";
const DEFAULT_TARGET = "frontend/public/assets/linewatch/regional-rail-map.svg";

const sourcePath = path.resolve(process.argv[2] ?? DEFAULT_SOURCE);
const targetPath = path.resolve(process.argv[3] ?? DEFAULT_TARGET);

function replaceElementIdForLabel(svg, label, nextId, tagNames = "g|circle|ellipse|rect|path") {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const openingTag = new RegExp(`<(${tagNames})(?=[^>]*inkscape:label="${escapedLabel}")[^>]*>`, "g");
  let replacements = 0;
  const prepared = svg.replace(openingTag, (tag) => {
    replacements += 1;
    if (!/\bid="[^"]*"/.test(tag)) {
      throw new Error(`Element labelled ${label} has no id attribute.`);
    }
    return tag.replace(/\bid="[^"]*"/, `id="${nextId}"`);
  });
  if (replacements !== 1) {
    throw new Error(`Expected exactly one element labelled ${label}; found ${replacements}.`);
  }
  return prepared;
}

function prepareRegionalMap(source) {
  let prepared = source.replace(
    /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/,
    (_match, w, h) => `viewBox="-200 -200 ${parseFloat(w) + 400} ${parseFloat(h) + 400}"`,
  );
  if (prepared === source) {
    throw new Error("The expected authoring viewBox was not found.");
  }

  const stationLabels = [...prepared.matchAll(/inkscape:label="(station-[^"]+)"/g)]
    .map((match) => match[1])
    .filter((label) => label !== "station-text");
  const uniqueStationLabels = [...new Set(stationLabels)];
  if (uniqueStationLabels.length !== 78 || stationLabels.length !== 78) {
    throw new Error(`Expected 72 logical stations plus 6 junction anchors; found ${uniqueStationLabels.length} unique station labels.`);
  }
  for (const stationId of uniqueStationLabels) {
    prepared = replaceElementIdForLabel(prepared, stationId, stationId);
  }

  const layers = [
    ["Lakes", "regional-lakes-layer"],
    ["lines", "regional-lines-layer"],
    ["stations", "regional-stations-layer"],
    ["station-text", "regional-station-labels-layer"],
    ["line-labels", "regional-route-labels-layer"],
  ];
  for (const [label, id] of layers) {
    prepared = replaceElementIdForLabel(prepared, label, id);
  }

  for (const routeCode of ["BR", "KI", "UP", "MI", "RH", "ST", "LE"]) {
    prepared = replaceElementIdForLabel(prepared, routeCode, `regional-route-${routeCode.toLowerCase()}-path`, "path");
  }
  prepared = replaceElementIdForLabel(prepared, "LW-1", "regional-route-lw-main-path", "path");
  prepared = replaceElementIdForLabel(prepared, "LW-2", "regional-route-lw-branch-path", "path");
  prepared = replaceElementIdForLabel(prepared, "LW-DIV", "regional-route-lw-div");
  prepared = prepared.replace('inkscape:label="service-pattern-st-limited"', 'inkscape:label="service-pattern-stouffville-limited"');
  prepared = prepared.replace('inkscape:label="up-accent-path"', 'inkscape:label="up-accent-pattern"');

  // Segment overlays are projected from the freshly imported route paths at
  // runtime. Keep the layer marker for the asset contract, but never inject
  // coordinate snapshots from a previous authored map revision.
  const segmentGuides = `<g id="regional-segment-guides-layer" style="display:none" />`;
  prepared = prepared.replace(
    /(<g\s+inkscape:groupmode="layer"\s+id="regional-stations-layer"[^>]*>)/,
    `$1${segmentGuides}`,
  );
  if (!prepared.includes('id="regional-segment-guides-layer"')) {
    throw new Error("Could not inject the regional segment guide layer marker.");
  }

  prepared = prepared.replace(
    /(<g\s+inkscape:groupmode="layer"\s+id="regional-lakes-layer"\s+inkscape:label="Lakes"\s+style=")([^"]*)(")/,
    (_match, start, style, end) => `${start}${style.replace(/display:[^;]+/, "display:none")}${end}`,
  );
  if (!/id="regional-lakes-layer"[\s\S]{0,200}style="[^"]*display:none/.test(prepared)) {
    throw new Error("Could not hide the lakes layer.");
  }

  return prepared.replace(/[ \t]+$/gm, "");
}

const source = await readFile(sourcePath, "utf8");
const prepared = prepareRegionalMap(source);
await writeFile(targetPath, prepared, "utf8");
console.log(`Prepared regional map: ${targetPath}`);
