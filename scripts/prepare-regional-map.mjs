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

  const segmentGuides = `<g id="regional-segment-guides-layer" style="display:none">
    <path id="segment-guide-ki-bloor-mount-dennis" d="M 4531.3117,3677.5021 L 4529.7746,2913.8344 L 4131.9047,2682.7025" />
    <path id="segment-guide-ki-weston-etobicoke-north" d="M 3428.5664,2278.2556 L 2987.0609,2023.1482 H 2845.6543" />
    <path id="segment-guide-up-bloor-mount-dennis" d="M 4261.9824,3678.6078 L 4263.2112,3122.3055 L 3962.0964,2953.3683" />
    <path id="segment-guide-up-weston-pearson-airport" d="M 3263.5664,2559.7402 L 2850.3846,2326.7284 H 2606.1017 L 1672.8678,2913.9392" />
  </g>`;
  prepared = prepared.replace(
    /(<g\s+inkscape:groupmode="layer"\s+id="regional-stations-layer"[^>]*>)/,
    `$1${segmentGuides}`,
  );
  if (!prepared.includes('id="segment-guide-ki-bloor-mount-dennis"')) {
    throw new Error("Could not inject regional segment guide paths.");
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
