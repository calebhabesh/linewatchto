import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { MAP_MANIFESTS } from "../../frontend/src/app/map-manifests.ts";
import { parseSvg, querySelector, textContent } from "../lib/svg-scan.mjs";
import { expectedRasterFiles, validateMapAsset } from "../validate-map-asset.mjs";

const frontend = fileURLToPath(new URL("../../frontend/", import.meta.url));
const rasterDirectory = join(frontend, "public/assets/linewatch/raster-maps");

/** A minimal map that meets a small test manifest. */
const manifest = {
  id: "test",
  viewBox: { x: 0, y: 0, width: 100, height: 50 },
  rasterPlanes: ["background"],
  layers: { stations: "#stations", stationLabels: "#labels", lines: "#lines" },
  stationLabelLink: { kind: "name" },
  stationPartSuffixes: ["-up"],
  lineIds: ["line-a"],
};
const svg = ({
  viewBox = "0 0 100 50",
  stations = '<circle id="station-union"/><circle id="station-union-up"/><circle id="station-bloor"/>',
  labels = "<text>Union</text><text><tspan>Bloor</tspan></text>",
  lines = '<path id="line-a" d="M0 0"/>',
} = {}) => `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="${viewBox}">
  <!-- authored in Inkscape -->
  <g id="lines">${lines}</g>
  <g id="stations">${stations}</g>
  <g id="labels">${labels}</g>
</svg>`;

describe("map asset validator", () => {
  for (const map of Object.values(MAP_MANIFESTS)) {
    it(`passes the served ${map.id} map, its labels and its raster planes`, () => {
      const result = validateMapAsset(
        map,
        readFileSync(join(frontend, map.svg), "utf8"),
        (file) => existsSync(join(rasterDirectory, file)),
      );
      assert.deepEqual(result, { errors: [], warnings: [] });
    });
  }

  it("passes the drop-in fixture map, which ships no raster planes", async () => {
    const { default: fixture } = await import("../../frontend/tests/fixtures/drop-in-map/drop-in-map-manifest.ts");
    const result = validateMapAsset(fixture, readFileSync(join(frontend, fixture.svg), "utf8"), () => false);
    assert.deepEqual(result, { errors: [], warnings: [] });
  });

  it("rejects a name that a use cutout would lift without its layer's font", () => {
    const lifted = { ...manifest, stationLabelLink: { kind: "name" }, stationLabels: { cutout: { kind: "use" } } };
    const styled = '<text style="font-size:80px;font-family:Heros">Union</text><text font-size="80" font-family="Heros"><tspan>Bloor</tspan></text>';
    assert.deepEqual(validateMapAsset(lifted, svg({ labels: styled })).errors, []);
    const { errors } = validateMapAsset(lifted, svg());
    assert.match(errors[0], /Station name "Union" does not set its own font-size and font-family/);
  });

  it("passes a map that meets its manifest", () => {
    assert.deepEqual(validateMapAsset(manifest, svg()), { errors: [], warnings: [] });
  });

  it("rejects a different coordinate space", () => {
    const { errors } = validateMapAsset(manifest, svg({ viewBox: "0 0 200 50" }));
    assert.match(errors[0], /view box is "0 0 200 50"/);
  });

  it("rejects a missing layer and a missing line path", () => {
    const missingLayer = validateMapAsset(manifest, svg().replace('id="labels"', 'id="names"'));
    assert.ok(missingLayer.errors.some((error) => /stationLabels layer \(#labels\) is missing/.test(error)));
    const missingLine = validateMapAsset(manifest, svg({ lines: '<path id="line-b" d="M0 0"/>' }));
    assert.deepEqual(missingLine.errors, ["Line path line-a is missing from the lines layer."]);
  });

  it("rejects duplicate station ids and names that match no station", () => {
    const duplicate = validateMapAsset(manifest, svg({ stations: '<circle id="station-union"/><circle id="station-union"/><circle id="station-bloor"/>' }));
    assert.ok(duplicate.errors.includes("Station id station-union is used twice."));
    const stray = validateMapAsset(manifest, svg({ labels: "<text>Union</text><text>Bloor</text><text>Dundas</text>" }));
    assert.deepEqual(stray.errors, ['Station name "Dundas" matches no station id.']);
  });

  it("counts a station's parts as that station, and warns about unnamed stations", () => {
    const { errors, warnings } = validateMapAsset(manifest, svg({ labels: "<text>Union</text>" }));
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, ["Stations without a drawn name: station-bloor."]);
  });

  it("links names by attribute when the manifest says so", () => {
    const byAttribute = { ...manifest, stationLabelLink: { kind: "attribute", attribute: "data-station-label-for" } };
    const linked = svg({ labels: '<text data-station-label-for="union">Union</text><text data-station-label-for="bloor">Bloor</text>' });
    assert.deepEqual(validateMapAsset(byAttribute, linked).errors, []);
    const unlinked = validateMapAsset(byAttribute, svg());
    assert.ok(unlinked.errors.includes('Station name "Union" has no data-station-label-for.'));
  });

  it("lists every raster plane by theme and density, and reports missing files", () => {
    const files = expectedRasterFiles(manifest);
    assert.equal(files.length, 9);
    for (const theme of ["dark", "light", "high-contrast"]) {
      for (const density of ["balanced", "desktop", "mobile"]) {
        assert.ok(files.includes(`test-background-${theme}-${density}.png`), `${theme} ${density}`);
      }
    }
    const { errors } = validateMapAsset(manifest, svg(), (file) => !file.includes("mobile"));
    assert.match(errors[0], /Raster planes are missing .*test-background-dark-mobile\.png/);
  });

  it("reports an SVG that does not parse", () => {
    assert.match(validateMapAsset(manifest, "<svg><g></svg>").errors[0], /does not parse/);
  });
});

describe("svg scanner", () => {
  it("reads attributes, namespaced selectors, entities and nested text", () => {
    const document = parseSvg('<svg><g inkscape:label="tracks"><text>St &amp; <tspan>Clair</tspan></text></g></svg>');
    const layer = querySelector(document, "[inkscape\\:label='tracks']");
    assert.equal(layer.tag, "g");
    assert.equal(textContent(layer), "St & Clair");
  });
});
