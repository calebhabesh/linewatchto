import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  REGIONAL_MAP_LAYER_CONTRACT,
  REGIONAL_MAP_ROUTE_CONTRACT,
  normalizeRegionalMapSvg,
  normalizeUpExpressLogoSvg,
} from "../../scripts/lib/regional-map-normalizer.mjs";

const execFileAsync = promisify(execFile);
const frontendRoot = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

const ALL_78_STATION_LABELS = [
  "station-union",
  "station-stratford",
  "station-milton",
  "station-kipling",
  "station-exhibition",
  "station-kennedy",
  "station-durham-college-oshawa",
  "station-hamilton",
  "station-niagara-falls",
  "station-pearson-airport",
  "station-kitchener",
  "station-guelph-central",
  "station-acton",
  "station-georgetown",
  "station-mount-pleasant",
  "station-brampton-innovation-district",
  "station-bramalea",
  "station-malton",
  "station-etobicoke-north",
  "station-lisgar",
  "station-meadowvale",
  "station-streetsville",
  "station-erindale",
  "station-cooksville",
  "station-dixie",
  "station-mimico",
  "station-danforth",
  "station-scarborough",
  "station-eglinton",
  "station-agincourt",
  "station-milliken",
  "station-unionville",
  "station-centennial",
  "station-markham",
  "station-mount-joy",
  "station-stouffville",
  "station-guildwood",
  "station-rouge-hill",
  "station-pickering",
  "station-long-branch",
  "station-port-credit",
  "station-clarkson",
  "station-oakville",
  "station-bronte",
  "station-appleby",
  "station-burlington",
  "station-aldershot",
  "station-west-harbour",
  "station-confederation",
  "station-st-catharines",
  "station-downsview-park",
  "station-oriole",
  "station-bloomington",
  "station-old-elm",
  "station-allandale-waterfront",
  "station-rutherford",
  "station-old-cummer",
  "station-langstaff",
  "station-richmond-hill",
  "station-gormley",
  "station-aurora",
  "station-east-gwillimbury",
  "station-bradford",
  "station-maple",
  "station-king-city",
  "station-newmarket",
  "station-barrie-south",
  "station-ajax",
  "station-whitby",
  "station-weston",
  "station-weston-ki",
  "station-weston-up",
  "station-bloor",
  "station-bloor-ki",
  "station-bloor-up",
  "station-mount-dennis",
  "station-mount-dennis-ki",
  "station-mount-dennis-up",
];

function buildMockAuthoringSvg(overrides = {}) {
  const viewBox = overrides.viewBox ?? 'viewBox="0 0 16636.959 8631.6719"';
  const stationLabels = overrides.stationLabels ?? ALL_78_STATION_LABELS;

  const stationElements = stationLabels.map((label, idx) => {
    if (label === "station-weston" || label === "station-bloor" || label === "station-mount-dennis") {
      return `<g id="group-${idx}" inkscape:label="${label}"><rect id="rect-${idx}" /></g>`;
    }
    return `<circle id="raw-station-id-${idx}" inkscape:label="${label}" cx="100" cy="100" r="10" />`;
  }).join("\n");

  const layers = overrides.layers ?? `
    <g id="raw-lakes" inkscape:label="Lakes" style="display:inline;fill:blue"></g>
    <g id="raw-lines" inkscape:label="lines"></g>
    <g id="raw-stations" inkscape:label="stations">${stationElements}</g>
    <g id="raw-station-text" inkscape:label="station-text"></g>
    <g id="raw-line-labels" inkscape:label="line-labels"></g>
  `;

  const routes = overrides.routes ?? `
    <path id="raw-br" inkscape:label="BR" d="M0 0" />
    <path id="raw-ki" inkscape:label="KI" d="M0 0" />
    <path id="raw-up" inkscape:label="UP" d="M0 0" />
    <path id="raw-mi" inkscape:label="MI" d="M0 0" />
    <path id="raw-rh" inkscape:label="RH" d="M0 0" />
    <path id="raw-st" inkscape:label="ST" d="M0 0" />
    <path id="raw-le" inkscape:label="LE" d="M0 0" />
    <path id="raw-lw1" inkscape:label="LW-1" d="M0 0" />
    <path id="raw-lw2" inkscape:label="LW-2" d="M0 0" />
    <path id="raw-lwdiv" inkscape:label="LW-DIV" d="M0 0" />
  `;

  const patterns = overrides.patterns ?? `
    <path id="raw-pattern-1" inkscape:label="service-pattern-st-limited" d="M0 0" />
    <path id="raw-pattern-2" inkscape:label="up-accent-path" d="M0 0" />
  `;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="16636.957" height="8631.6719" ${viewBox}>
  ${layers}
  ${routes}
  ${patterns}
</svg>`;
}

describe("pure regional map normalizer", () => {
  it("normalizes a valid authoring SVG with canonical contract IDs, guides, and viewBox", () => {
    const raw = buildMockAuthoringSvg();
    const normalized = normalizeRegionalMapSvg(raw);

    assert.match(normalized, /viewBox="-200 -200 17036\.959 9031\.6719"/);
    assert.match(normalized, /id="regional-lakes-layer"[\s\S]*?style="[^"]*display:none/);
    assert.match(normalized, /id="regional-lines-layer"/);
    assert.match(normalized, /id="regional-stations-layer"/);
    assert.match(normalized, /id="regional-station-labels-layer"/);
    assert.match(normalized, /id="regional-route-labels-layer"/);
    assert.match(normalized, /<g id="regional-segment-guides-layer" style="display:none" \/>/);

    for (const [routeCode, contractId] of REGIONAL_MAP_ROUTE_CONTRACT) {
      assert.match(normalized, new RegExp(`id="${contractId}"`), `must normalize route ${routeCode} to ${contractId}`);
    }

    assert.match(normalized, /inkscape:label="service-pattern-stouffville-limited"/);
    assert.match(normalized, /inkscape:label="up-accent-pattern"/);

    for (const stationId of ALL_78_STATION_LABELS) {
      assert.match(normalized, new RegExp(`id="${stationId}"`), `must assign id="${stationId}"`);
    }

    assert.ok(normalized.endsWith("\n"), "must have a single trailing newline");
  });

  it("rejects missing or malformed authoring viewBox", () => {
    const invalidViewBox = buildMockAuthoringSvg({ viewBox: 'viewBox="100 100 500 500"' });
    assert.throws(
      () => normalizeRegionalMapSvg(invalidViewBox),
      /The expected authoring viewBox \(0 0 width height\) was not found\./,
    );

    assert.throws(
      () => normalizeRegionalMapSvg(""),
      /Source SVG must be a non-empty string\./,
    );
  });

  it("rejects an invalid station count or duplicate stations", () => {
    const missingStation = buildMockAuthoringSvg({
      stationLabels: ALL_78_STATION_LABELS.slice(0, 77),
    });
    assert.throws(
      () => normalizeRegionalMapSvg(missingStation),
      /Expected 72 logical stations plus 6 junction anchors \(78 total unique station labels\); found 77/,
    );

    const duplicateStation = buildMockAuthoringSvg({
      stationLabels: [...ALL_78_STATION_LABELS.slice(0, 77), ALL_78_STATION_LABELS[0]],
    });
    assert.throws(
      () => normalizeRegionalMapSvg(duplicateStation),
      /Expected 72 logical stations plus 6 junction anchors \(78 total unique station labels\); found 77/,
    );
  });

  it("rejects missing layers or missing routes", () => {
    const stationElements = ALL_78_STATION_LABELS.map((label, idx) => {
      if (label === "station-weston" || label === "station-bloor" || label === "station-mount-dennis") {
        return `<g id="group-${idx}" inkscape:label="${label}"><rect id="rect-${idx}" /></g>`;
      }
      return `<circle id="raw-station-id-${idx}" inkscape:label="${label}" cx="100" cy="100" r="10" />`;
    }).join("\n");

    const missingLakes = buildMockAuthoringSvg({
      layers: `
        <g id="raw-lines" inkscape:label="lines"></g>
        <g id="raw-stations" inkscape:label="stations">${stationElements}</g>
        <g id="raw-station-text" inkscape:label="station-text"></g>
        <g id="raw-line-labels" inkscape:label="line-labels"></g>
      `,
    });
    assert.throws(
      () => normalizeRegionalMapSvg(missingLakes),
      /Expected exactly one element labelled "Lakes"; found 0\./,
    );

    const missingUp = buildMockAuthoringSvg({
      routes: `
        <path id="raw-br" inkscape:label="BR" d="M0 0" />
      `,
    });
    assert.throws(
      () => normalizeRegionalMapSvg(missingUp),
      /Expected exactly one element labelled "KI"; found 0\./,
    );
  });

  it("normalizes Up Express logo colors and whitespace", () => {
    const raw = '<svg><path style="fill:#000000" /></svg>  ';
    const normalized = normalizeUpExpressLogoSvg(raw);
    assert.equal(normalized, '<svg><path style="fill:#4084cd" /></svg>\n');
  });

  it("ensures CLI entry points require source arguments and reject missing input with clear usage", async () => {
    await assert.rejects(
      () => execFileAsync(process.execPath, [`${repositoryRoot}/scripts/prepare-regional-map.mjs`], { env: {} }),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /Usage: node scripts\/prepare-regional-map\.mjs/);
        assert.match(err.stderr, /LINEWATCH_MAP_SOURCE_DIR/);
        return true;
      },
    );

    await assert.rejects(
      () => execFileAsync(process.execPath, [`${repositoryRoot}/scripts/import-linewatch-map-assets.mjs`], { env: {} }),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /Usage: node scripts\/import-linewatch-map-assets\.mjs/);
        assert.match(err.stderr, /LINEWATCH_MAP_SOURCE_DIR/);
        return true;
      },
    );
  });

  it("verifies the checked-in regional rail SVG satisfies all contract invariants", async () => {
    const svgPath = `${frontendRoot}/public/assets/linewatch/regional-rail-map.svg`;
    const svg = await readFile(svgPath, "utf8");

    assert.match(svg, /viewBox="-200 -200 17036\.959 9031\.6719"/);
    assert.match(svg, /id="regional-lakes-layer"[\s\S]*?style="[^"]*display:none/);
    assert.match(svg, /id="regional-lines-layer"/);
    assert.match(svg, /id="regional-stations-layer"/);
    assert.match(svg, /id="regional-station-labels-layer"/);
    assert.match(svg, /id="regional-route-labels-layer"/);
    assert.match(svg, /<g id="regional-segment-guides-layer" style="display:none" \/>/);

    for (const [, contractId] of REGIONAL_MAP_LAYER_CONTRACT) {
      const occurrences = (svg.match(new RegExp(`id="${contractId}"`, "g")) ?? []).length;
      assert.equal(occurrences, 1, `layer ${contractId} must exist exactly once`);
    }

    for (const [, contractId] of REGIONAL_MAP_ROUTE_CONTRACT) {
      const occurrences = (svg.match(new RegExp(`id="${contractId}"`, "g")) ?? []).length;
      assert.equal(occurrences, 1, `route ${contractId} must exist exactly once`);
    }

    for (const stationId of ALL_78_STATION_LABELS) {
      const occurrences = (svg.match(new RegExp(`id="${stationId}"`, "g")) ?? []).length;
      assert.equal(occurrences, 1, `station ${stationId} must exist exactly once`);
    }

    const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const duplicates = ids.filter((id, idx) => ids.indexOf(id) !== idx);
    assert.deepEqual(duplicates, [], "checked-in SVG must have zero duplicate IDs");
  });
});
