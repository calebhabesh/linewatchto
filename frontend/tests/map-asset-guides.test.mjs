import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const svg = readFileSync(
  new URL("../public/assets/linewatch/ttc-subway-map-edited.svg", import.meta.url),
  "utf8",
);

describe("map SVG guide asset", () => {
  it("preserves the hidden nonlinear segment guide paths used by runtime overlays", () => {
    assert.match(svg, /inkscape:label="segment-guides-layer"/);
    assert.match(svg, /inkscape:label="seg-line-1-union-king"/);
    assert.match(svg, /inkscape:label="seg-line-1-st-andrew-union"/);
    assert.match(svg, /inkscape:label="seg-line-1-spadina-st-george"/);
    assert.match(svg, /inkscape:label="seg-line-1-dupont-spadina"/);
  });

  it("preserves station anchors needed for straight fallback and station detail clicks", () => {
    assert.match(svg, /id="station-king"/);
    assert.match(svg, /id="station-union"/);
    assert.match(svg, /id="station-st-andrew"/);
    assert.match(svg, /id="station-st-george"/);
    assert.match(svg, /id="station-spadina-1"/);
    assert.match(svg, /id="station-spadina-2"/);
    assert.match(svg, /id="station-dupont"/);
  });
});
