#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , inputArgument, outputArgument] = process.argv;

if (!inputArgument || !outputArgument) {
  console.error("Usage: node scripts/prepare-ttc-map-asset.mjs <source.svg> <output.svg>");
  process.exit(1);
}

const inputPath = resolve(inputArgument);
const outputPath = resolve(outputArgument);
let svg = readFileSync(inputPath, "utf8");

if (!/viewBox="0 0 8250 4000"/.test(svg)) {
  throw new Error("The TTC map source must use viewBox 0 0 8250 4000.");
}

const stationIdOverrides = new Map([
  ["greenwood", "greenwoood"],
  ["oconnor", "o_connor"],
]);

function decodedText(markup) {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stationIdForName(name) {
  const normalized = name
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return stationIdOverrides.get(normalized) ?? normalized;
}

function replaceSection(source, startMarker, endMarker, rewrite) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`Unable to locate SVG section ${startMarker}.`);
  }
  return source.slice(0, start) + rewrite(source.slice(start, end)) + source.slice(end);
}

const stationLabelIds = [];
svg = replaceSection(
  svg,
  'inkscape:label="station-text"',
  'inkscape:label="tracks"',
  (section) => section.replace(/<text\b[\s\S]*?<\/text>/g, (textElement) => {
    const stationId = stationIdForName(decodedText(textElement));
    stationLabelIds.push(stationId);
    return textElement.replace(/<text\b[^>]*>/, (openingTag) => {
      const withoutId = openingTag
        .replace(/\s+id="[^"]+"/, "")
        .replace(/\s+data-station-label-for="[^"]+"/, "")
        .replace(/\s+inkscape:label="[^"]+"/, "");
      return withoutId.replace(
        />$/,
        ` id="station-label-${stationId}" data-station-label-for="${stationId}" inkscape:label="station-label-${stationId}">`,
      );
    });
  }),
);

const stationAnchorIds = [];
svg = replaceSection(
  svg,
  'inkscape:label="stations"',
  'inkscape:label="transit-line-badges"',
  (section) => section.replace(/<circle\b[\s\S]*?\/>/g, (circleElement) => {
    const originalId = circleElement.match(/\sid="([^"]+)"/)?.[1];
    const authoredLabel = circleElement.match(/inkscape:label="([^"]+)"/)?.[1];
    if (!originalId || !authoredLabel) {
      throw new Error("Every station circle must have an id and an Inkscape label.");
    }

    const normalizedLabel = authoredLabel
      .replace(/^station-/, "")
      .replace(/^spadina-line-/, "spadina-");
    const stationId = stationIdOverrides.get(normalizedLabel.replace(/[’']/g, "").replace(/[^a-z0-9]+/g, ""))
      ?? normalizedLabel;
    stationAnchorIds.push(stationId);

    return circleElement
      .replace(/\sid="[^"]+"/, ` id="station-${stationId}"`)
      .replace(/\sinkscape:label="[^"]+"/, ` inkscape:label="station-${stationId}"`)
      .replace(/\sdata-station-anchor-id="[^"]+"/, "")
      .replace(/\s*\/>$/, ` data-station-anchor-id="${stationId}" />`);
  }),
);

const expectedAnchorIds = stationLabelIds.flatMap((stationId) =>
  stationId === "spadina" ? ["spadina-1", "spadina-2"] : [stationId],
);
const missingAnchors = expectedAnchorIds.filter((stationId) => !stationAnchorIds.includes(stationId));
const unexpectedAnchors = stationAnchorIds.filter((stationId) => !expectedAnchorIds.includes(stationId));
if (stationLabelIds.length !== 109 || stationAnchorIds.length !== 110 || missingAnchors.length || unexpectedAnchors.length) {
  throw new Error([
    `Expected 109 station labels and 110 visual anchors; found ${stationLabelIds.length} and ${stationAnchorIds.length}.`,
    missingAnchors.length ? `Missing anchors: ${missingAnchors.join(", ")}.` : "",
    unexpectedAnchors.length ? `Unexpected anchors: ${unexpectedAnchors.join(", ")}.` : "",
  ].filter(Boolean).join(" "));
}

const duplicateLabels = stationLabelIds.filter((stationId, index) => stationLabelIds.indexOf(stationId) !== index);
const duplicateAnchors = stationAnchorIds.filter((stationId, index) => stationAnchorIds.indexOf(stationId) !== index);
if (duplicateLabels.length || duplicateAnchors.length) {
  throw new Error(`Duplicate station semantics: ${[...new Set([...duplicateLabels, ...duplicateAnchors])].join(", ")}.`);
}

const layerIds = new Map([
  ["Layer_x0020_1", "ttc-map-root"],
  ["layer3", "ttc-station-labels-layer"],
  ["layer2", "ttc-tracks-layer"],
  ["layer1", "ttc-stations-layer"],
  ["layer4", "ttc-line-badges-layer"],
  ["layer5", "ttc-connection-labels-layer"],
]);
for (const [authoredId, contractId] of layerIds) {
  svg = svg.replace(`id="${authoredId}"`, `id="${contractId}"`);
}
svg = svg.replace('id="ttc-stations-layer"\n   inkscape:label="stations"', 'id="ttc-stations-layer"\n   inkscape:label="stations-layer"');

const guideDefinitions = new Map([
  ["seg-line-1-union-st-andrew", {
    label: "seg-line-1-st-andrew-union",
    d: "M 4074.3926 3342.5529 V 3357.8967 C 4074.3928 3489.9253 4181.6663 3596.9555 4313.995 3596.9555",
  }],
  ["seg-line-1-union-king", {
    label: "seg-line-1-union-king",
    d: "M 4313.995 3596.9555 C 4445.6017 3596.5301 4551.9451 3489.4971 4551.5197 3357.8911 V 3342.5467",
  }],
  ["seg-line-1-spadina-st-george", {
    label: "seg-line-1-st-george-spadina",
    d: "M 4074.3926 2620.5984 V 2538.1018 H 3736.3127",
  }],
  ["seg-line-6-humber-college-westmore", {
    label: "seg-line-6-humber-college-westmore",
    d: "M 153.61046 1238.3356 V 1066.297 C 153.61046 1034.1845 179.6428 1008.1522 211.7553 1008.1522 H 299.97406",
  }],
]);

svg = replaceSection(svg, 'id="non-linear-guides-layer"', "</g></g>\n</svg>", (section) => {
  let rewritten = section.replace(/\s+transform="translate\(-102\.46067,-8\.4910944e-5\)"/, "");
  rewritten = rewritten.replace(/<path\b[\s\S]*?\/>/g, (pathElement) => {
    const authoredLabel = pathElement.match(/inkscape:label="([^"]+)"/)?.[1];
    const guide = authoredLabel ? guideDefinitions.get(authoredLabel) : undefined;
    if (!guide) return pathElement;
    return pathElement
      .replace(/\sd="[^"]+"/, ` d="${guide.d}"`)
      .replace(/\sinkscape:label="[^"]+"/, ` inkscape:label="${guide.label}"`)
      .replace(/\s+transform="[^"]+"/, "")
      .replace(/\s+sodipodi:nodetypes="[^"]+"/, "");
  });
  return rewritten;
});

// Preserve the UP Express blue and the semantic Mount Dennis selector that the
// dark/high-contrast map theme uses. The first custom export retained black
// placeholder fills and dropped the nested group's label.
svg = svg.replace(
  /id="g3-05"(?![^>]*\sinkscape:label=)([^>]*)>/,
  'id="g3-05" inkscape:label="mount-dennis-up"$1>',
);
for (const upPathId of ["path40-9-51", "path42-7", "path40-9-5", "path42-0", "path40-9", "path42"]) {
  svg = svg.replace(
    new RegExp(`(id="${upPathId}"\\s+style=")fill:#000000`),
    "$1fill:#4084cd",
  );
}

const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) {
  throw new Error(`The prepared SVG contains duplicate ids: ${[...new Set(duplicateIds)].join(", ")}.`);
}

writeFileSync(outputPath, svg);
console.log(`Prepared ${outputPath} with ${stationLabelIds.length} station labels and ${stationAnchorIds.length} station anchors.`);
