import assert from "node:assert/strict";
import test from "node:test";
import {
  REGIONAL_MAP_EXPECTED_STATION_LABELS_COUNT,
  REGIONAL_MAP_LAYER_CONTRACT,
  REGIONAL_MAP_ROUTE_CONTRACT,
  normalizeExportWhitespace,
  normalizeRegionalMapSvg,
  normalizeUpExpressLogoSvg,
  replaceElementIdForLabel,
} from "../lib/regional-map-normalizer.mjs";

test("normalizeExportWhitespace trims trailing spaces and appends single newline", () => {
  const result = normalizeExportWhitespace("<svg>   \n  <g>  \n</svg>   ");
  assert.equal(result, "<svg>\n  <g>\n</svg>\n");
});

test("replaceElementIdForLabel replaces existing element id or injects if absent", () => {
  const svgWithId = '<rect id="old-id" inkscape:label="my-label" />';
  assert.equal(
    replaceElementIdForLabel(svgWithId, "my-label", "new-id", "rect"),
    '<rect id="new-id" inkscape:label="my-label" />',
  );

  const svgWithoutId = '<circle inkscape:label="my-label" cx="10" />';
  assert.equal(
    replaceElementIdForLabel(svgWithoutId, "my-label", "new-id", "circle"),
    '<circle id="new-id" inkscape:label="my-label" cx="10" />',
  );
});

test("replaceElementIdForLabel throws on missing or duplicate elements", () => {
  assert.throws(
    () => replaceElementIdForLabel("<svg></svg>", "not-found", "id"),
    /Expected exactly one element labelled "not-found"; found 0\./,
  );

  const duplicate = '<g inkscape:label="dup"></g><g inkscape:label="dup"></g>';
  assert.throws(
    () => replaceElementIdForLabel(duplicate, "dup", "id", "g"),
    /Expected exactly one element labelled "dup"; found 2\./,
  );
});

test("normalizeUpExpressLogoSvg replaces black fill with UP Express blue", () => {
  const raw = '<svg fill:#000000></svg>   ';
  assert.equal(normalizeUpExpressLogoSvg(raw), '<svg fill:#4084cd></svg>\n');
});
