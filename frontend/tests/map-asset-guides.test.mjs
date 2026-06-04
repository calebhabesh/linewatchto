import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const svg = readFileSync(
  new URL("../public/assets/linewatch/ttc-subway-map-edited.svg", import.meta.url),
  "utf8",
);

function pathElementForLabel(label) {
  const paths = svg.match(/<path\b[\s\S]*?\/>/g) ?? [];
  return paths.find((path) => path.includes(`inkscape:label="${label}"`)) ?? "";
}

describe("map SVG guide asset", () => {
  it("preserves the hidden nonlinear segment guide paths used by runtime overlays", () => {
    assert.match(svg, /inkscape:label="non-linear-guides-layer"/);
    assert.match(svg, /inkscape:label="seg-line-1-union-king"/);
    assert.match(svg, /inkscape:label="seg-line-1-st-andrew-union"/);
    assert.match(svg, /inkscape:label="seg-line-1-st-george-spadina"/);
    assert.doesNotMatch(svg, /inkscape:label="seg-line-1-dupont-spadina"/);
    assert.match(svg, /inkscape:label="seg-line-6-humber-college-westmore"/);
  });

  it("keeps St George to Spadina as an open stroked centerline guide", () => {
    const guidePath = pathElementForLabel("seg-line-1-st-george-spadina");
    const pathD = guidePath.match(/\sd="([^"]+)"/)?.[1] ?? "";

    assert.notEqual(guidePath, "");
    assert.match(guidePath, /fill:none/);
    assert.match(guidePath, /stroke:/);
    assert.doesNotMatch(pathD, /(^|[\s,])[zZ]($|[\s,])/);
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
});
