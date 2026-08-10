import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const svg = readFileSync(
  new URL("../public/assets/linewatch/ttc-subway-map-custom.svg", import.meta.url),
  "utf8",
);
const ttcImportSource = readFileSync(
  new URL("../../scripts/prepare-ttc-map-asset.mjs", import.meta.url),
  "utf8",
);

function pathElementForLabel(label) {
  const paths = svg.match(/<path\b[\s\S]*?\/>/g) ?? [];
  return paths.find((path) => path.includes(`inkscape:label="${label}"`)) ?? "";
}

describe("map SVG guide asset", () => {
  it("preserves the hidden nonlinear segment guide paths used by runtime overlays", () => {
    assert.match(svg, /inkscape:label="non-linear-guides-layer"/);
    assert.match(svg, /id="non-linear-guides-layer"[\s\S]*?style="[^"]*display:none/);
    assert.match(svg, /inkscape:label="seg-line-1-union-king"/);
    assert.match(svg, /inkscape:label="seg-line-1-st-andrew-union"/);
    assert.match(svg, /inkscape:label="seg-line-1-st-george-spadina"/);
    assert.doesNotMatch(svg, /inkscape:label="seg-line-1-dupont-spadina"/);
    assert.match(svg, /inkscape:label="seg-line-6-humber-college-westmore"/);
  });

  it("preserves newly authored TTC guide coordinates during future map imports", () => {
    assert.match(ttcImportSource, /const guideLabels = new Map/);
    assert.doesNotMatch(ttcImportSource, /guideDefinitions|\bd:\s*"M 4074/);
  });

  it("keeps St George to Spadina as an open stroked centerline guide", () => {
    const guidePath = pathElementForLabel("seg-line-1-st-george-spadina");
    const pathD = guidePath.match(/\sd="([^"]+)"/)?.[1] ?? "";

    assert.notEqual(guidePath, "");
    assert.match(guidePath, /fill:none/);
    assert.match(guidePath, /stroke:/);
    assert.doesNotMatch(pathD, /(^|[\s,])[zZ]($|[\s,])/);
    assert.equal(
      pathD,
      "m 4075.8197,2622.9729 v -82.4966 h -338.0799",
      "the runtime guide should preserve the latest authored station-aligned coordinates without displacement",
    );
  });

  it("preserves station anchors needed for straight fallback and station detail clicks", () => {
    assert.match(svg, /inkscape:label="stations-layer"[\s\S]*?style="[^"]*display:inline/);
    assert.match(svg, /id="station-king"/);
    assert.match(svg, /id="station-union"/);
    assert.match(svg, /id="station-st-andrew"/);
    assert.match(svg, /id="station-st-george"/);
    assert.match(svg, /id="station-spadina-1"/);
    assert.match(svg, /id="station-spadina-2"/);
    assert.match(svg, /id="station-dupont"/);
  });

  it("maps every station name to one semantic text target and every station to its visual anchor", () => {
    const labelIds = [...svg.matchAll(/<text\b[^>]*data-station-label-for="([^"]+)"/g)].map((match) => match[1]);
    const anchorIds = [...svg.matchAll(/<circle\b[^>]*data-station-anchor-id="([^"]+)"/g)].map((match) => match[1]);
    const expectedAnchorIds = labelIds.flatMap((stationId) =>
      stationId === "spadina" ? ["spadina-1", "spadina-2"] : [stationId],
    );

    assert.equal(labelIds.length, 109);
    assert.equal(new Set(labelIds).size, labelIds.length);
    assert.equal(anchorIds.length, 110);
    assert.equal(new Set(anchorIds).size, anchorIds.length);
    assert.deepEqual([...anchorIds].sort(), [...expectedAnchorIds].sort());
    assert.match(svg, /id="station-humber-college"/);
    assert.match(svg, /id="station-greenwoood"/);
    assert.match(svg, /id="station-o_connor"/);
  });

  it("uses named custom-map layers rather than generated Inkscape layer ids", () => {
    assert.match(svg, /id="ttc-map-root"/);
    assert.match(svg, /id="ttc-tracks-layer"/);
    assert.match(svg, /id="ttc-station-labels-layer"/);
    assert.match(svg, /id="ttc-stations-layer"/);
    assert.match(svg, /id="ttc-line-badges-layer"/);
    assert.match(svg, /id="ttc-connection-labels-layer"/);
    assert.doesNotMatch(svg, /id="layer[1-6]"/);
  });
});
