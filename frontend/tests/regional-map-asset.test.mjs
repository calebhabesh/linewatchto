import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const svg = readFileSync(new URL("../public/assets/linewatch/regional-rail-map.svg", import.meta.url), "utf8");

describe("regional application map asset", () => {
  it("uses padded bounds and hides authored lakes and labels", () => {
    assert.match(svg, /viewBox="-200 -200 14871\.575 10032\.7812"/);
    assert.match(svg, /id="regional-lakes-layer"[\s\S]{0,200}style="[^"]*display:none/);
  });

  it("keeps logical junction groups and route-specific child anchors", () => {
    for (const id of [
      "station-weston", "station-weston-ki", "station-weston-up",
      "station-mount-dennis", "station-mount-dennis-ki", "station-mount-dennis-up",
      "station-bloor", "station-bloor-ki", "station-bloor-up",
    ]) {
      assert.equal((svg.match(new RegExp(`id="${id}"`, "g")) ?? []).length, 1, `${id} should be unique`);
    }
  });

  it("normalizes route paths and uses an unambiguous Stouffville limited-service label", () => {
    assert.match(svg, /id="regional-route-ki-path"/);
    assert.match(svg, /id="regional-route-up-path"/);
    assert.match(svg, /inkscape:label="service-pattern-stouffville-limited"/);
    assert.doesNotMatch(svg, /inkscape:label="service-pattern-st-limited"/);
  });

  it("contains explicit route-specific guide geometry for supported fixture segments", () => {
    assert.match(svg, /id="regional-segment-guides-layer"[^>]*display:none/);
    assert.match(svg, /id="segment-guide-ki-weston-mount-dennis"/);
    assert.match(svg, /id="segment-guide-up-weston-pearson-airport"/);
    assert.match(svg, /id="segment-guide-le-pickering-ajax"/);
  });
});
