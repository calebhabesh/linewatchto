export const REGIONAL_MAP_LAYER_CONTRACT = [
  ["Lakes", "regional-lakes-layer"],
  ["lines", "regional-lines-layer"],
  ["stations", "regional-stations-layer"],
  ["station-text", "regional-station-labels-layer"],
  ["line-labels", "regional-route-labels-layer"],
];

export const REGIONAL_MAP_ROUTE_CONTRACT = [
  ["BR", "regional-route-br-path", "path"],
  ["KI", "regional-route-ki-path", "path"],
  ["UP", "regional-route-up-path", "path"],
  ["MI", "regional-route-mi-path", "path"],
  ["RH", "regional-route-rh-path", "path"],
  ["ST", "regional-route-st-path", "path"],
  ["LE", "regional-route-le-path", "path"],
  ["LW-1", "regional-route-lw-main-path", "path"],
  ["LW-2", "regional-route-lw-branch-path", "path"],
  ["LW-DIV", "regional-route-lw-div", "g|circle|ellipse|rect|path"],
];

export const REGIONAL_MAP_EXPECTED_STATION_LABELS_COUNT = 78;

export const REGIONAL_MAP_SEGMENT_GUIDES_MARKER = '<g id="regional-segment-guides-layer" style="display:none" />';

export function normalizeExportWhitespace(source) {
  return `${source.replace(/[ \t]+$/gm, "").trimEnd()}\n`;
}

export function normalizeUpExpressLogoSvg(source) {
  return normalizeExportWhitespace(source.replaceAll("fill:#000000", "fill:#4084cd"));
}

export function replaceElementIdForLabel(svg, label, nextId, tagNames = "g|circle|ellipse|rect|path") {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const openingTag = new RegExp(`<(${tagNames})(?=[^>]*inkscape:label="${escapedLabel}")[^>]*>`, "g");
  let replacements = 0;
  const prepared = svg.replace(openingTag, (tag) => {
    replacements += 1;
    if (/\bid="[^"]*"/.test(tag)) {
      return tag.replace(/\bid="[^"]*"/, `id="${nextId}"`);
    }
    return tag.replace(/^<(\w+)/, `<$1 id="${nextId}"`);
  });
  if (replacements !== 1) {
    throw new Error(`Expected exactly one element labelled "${label}"; found ${replacements}.`);
  }
  return prepared;
}

export function normalizeRegionalMapSvg(source) {
  if (typeof source !== "string" || !source.trim()) {
    throw new Error("Source SVG must be a non-empty string.");
  }

  const viewBoxMatch = source.match(/viewBox="0\s+0\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)"/);
  if (!viewBoxMatch) {
    throw new Error("The expected authoring viewBox (0 0 width height) was not found.");
  }
  const width = parseFloat(viewBoxMatch[1]);
  const height = parseFloat(viewBoxMatch[2]);
  const targetViewBox = `viewBox="-200 -200 ${width + 400} ${height + 400}"`;
  let prepared = source.replace(viewBoxMatch[0], targetViewBox);

  const stationLabels = [...prepared.matchAll(/inkscape:label="(station-[^"]+)"/g)]
    .map((match) => match[1])
    .filter((label) => label !== "station-text");
  const uniqueStationLabels = [...new Set(stationLabels)];
  if (uniqueStationLabels.length !== REGIONAL_MAP_EXPECTED_STATION_LABELS_COUNT || stationLabels.length !== REGIONAL_MAP_EXPECTED_STATION_LABELS_COUNT) {
    throw new Error(
      `Expected 72 logical stations plus 6 junction anchors (${REGIONAL_MAP_EXPECTED_STATION_LABELS_COUNT} total unique station labels); found ${uniqueStationLabels.length} unique labels across ${stationLabels.length} elements.`,
    );
  }
  for (const stationId of uniqueStationLabels) {
    prepared = replaceElementIdForLabel(prepared, stationId, stationId);
  }

  for (const [label, id] of REGIONAL_MAP_LAYER_CONTRACT) {
    prepared = replaceElementIdForLabel(prepared, label, id, "g");
  }

  for (const [label, id, tagNames] of REGIONAL_MAP_ROUTE_CONTRACT) {
    prepared = replaceElementIdForLabel(prepared, label, id, tagNames);
  }

  prepared = prepared.replace('inkscape:label="service-pattern-st-limited"', 'inkscape:label="service-pattern-stouffville-limited"');
  prepared = prepared.replace('inkscape:label="up-accent-path"', 'inkscape:label="up-accent-pattern"');

  prepared = prepared.replace(
    /(<g\b[^>]*id="regional-stations-layer"[^>]*>)/,
    `$1${REGIONAL_MAP_SEGMENT_GUIDES_MARKER}`,
  );
  if (!prepared.includes('id="regional-segment-guides-layer"')) {
    throw new Error("Could not inject the regional segment guide layer marker into regional-stations-layer.");
  }

  prepared = prepared.replace(
    /(<g\b(?=[^>]*id="regional-lakes-layer")[^>]*style=")([^"]*)(")/,
    (_match, start, style, end) => {
      const updatedStyle = /display:[^;]+/.test(style)
        ? style.replace(/display:[^;]+/, "display:none")
        : `display:none;${style}`;
      return `${start}${updatedStyle}${end}`;
    },
  );
  if (!/id="regional-lakes-layer"[\s\S]{0,300}style="[^"]*display:none/.test(prepared)) {
    throw new Error("Could not hide the lakes layer.");
  }

  const ids = [...prepared.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) {
    throw new Error(`The prepared SVG contains duplicate ids: ${[...new Set(duplicateIds)].join(", ")}.`);
  }

  return normalizeExportWhitespace(prepared);
}
