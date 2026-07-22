import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_SOURCE = "~/Pictures/Assets/LineWatch/Maps/Metrolinx_Custom_Map.svg";
const DEFAULT_TARGET = "frontend/public/assets/linewatch/regional-rail-map.svg";

const sourcePath = path.resolve(process.argv[2] ?? DEFAULT_SOURCE);
const targetPath = path.resolve(process.argv[3] ?? DEFAULT_TARGET);

function replaceElementIdForLabel(svg, label, nextId, tagNames = "g|circle|rect|path") {
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
    /viewBox="0 0 14471\.575 9632\.7812"/,
    'viewBox="-200 -200 14871.575 10032.7812"',
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

  let ttcLineBadgeCount = 0;
  prepared = prepared.replace(/<g(?=[^>]*inkscape:label="line-[125]")[^>]*>/g, (tag) => {
    ttcLineBadgeCount += 1;
    return tag.includes('class="')
      ? tag.replace(/class="([^"]*)"/, 'class="$1 regional-ttc-line-badge"')
      : tag.replace("<g", '<g class="regional-ttc-line-badge"');
  });
  if (ttcLineBadgeCount !== 6) {
    throw new Error(`Expected 6 TTC line-number badges; found ${ttcLineBadgeCount}.`);
  }

  const segmentGuides = `<g id="regional-segment-guides-layer" style="display:none">
    <path id="segment-guide-ki-weston-mount-dennis" d="M 3888.5286,2466.7061 C 4140,2466.7061 4400,2785 4657.3393,2905.7143" />
    <path id="segment-guide-up-weston-pearson-airport" d="M 3793.6614,2607.9456 C 3250,2607.9456 2700,2963.4448 2244.3745,2963.4448" />
    <path id="segment-guide-le-pickering-ajax" d="M 13131.177,2750.0437 H 13392.387" />
  </g>`;
  prepared = prepared.replace(
    /(<g\s+inkscape:groupmode="layer"\s+id="regional-stations-layer"[^>]*>)/,
    `$1${segmentGuides}`,
  );
  if (!prepared.includes('id="segment-guide-ki-weston-mount-dennis"')) {
    throw new Error("Could not inject regional segment guide paths.");
  }

  prepared = prepared.replace(
    /(<g\s+inkscape:groupmode="layer"\s+id="regional-lakes-layer"\s+inkscape:label="Lakes"\s+style=")([^"]*)(")/,
    (_match, start, style, end) => `${start}${style.replace(/display:[^;]+/, "display:none")}${end}`,
  );
  if (!/id="regional-lakes-layer"[\s\S]{0,200}style="[^"]*display:none/.test(prepared)) {
    throw new Error("Could not hide the lakes layer.");
  }

  return prepared;
}

const source = await readFile(sourcePath, "utf8");
const prepared = prepareRegionalMap(source);
await writeFile(targetPath, prepared, "utf8");
console.log(`Prepared regional map: ${targetPath}`);
