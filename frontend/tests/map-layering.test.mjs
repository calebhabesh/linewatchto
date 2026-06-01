import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const transitMapSource = readFileSync(new URL("../src/app/transit-map.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const interactiveMapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");

describe("asset-backed map layering", () => {
  it("renders a station and label layer above alert overlays", () => {
    assert.match(transitMapSource, /className="asset-label-frame"/);
    assert.match(globalCss, /\.asset-label-frame/);
    assert.match(globalCss, /\.asset-label-frame svg #line-1/);
  });

  it("renders station hit targets above disruption overlays", () => {
    assert.match(interactiveMapSource, /aria-label="Station hit targets"/);
    assert.match(interactiveMapSource, /station-hit-target/);
    assert.match(interactiveMapSource, /onSelectStationId/);
  });

  it("renders animated visual effects for delays, closures, and station impacts", () => {
    assert.match(interactiveMapSource, /<pattern id="suspension-hash"/);
    assert.match(interactiveMapSource, /<pattern id=\{patternId\}/);
    assert.match(interactiveMapSource, /<animateTransform attributeName="transform"/);
    assert.match(interactiveMapSource, /className="asset-alert-path delay-candy pointer-events-none"/);
    assert.match(interactiveMapSource, /style=\{\{\s*stroke:\s*`url\(#\$\{patternId\}\)`\s*\}\}/);
    assert.match(interactiveMapSource, /className="asset-alert-path suspension-candy pointer-events-none"/);
    assert.match(interactiveMapSource, /style=\{\{\s*stroke:\s*"url\(#suspension-hash\)"\s*\}\}/);
    assert.match(globalCss, /@keyframes station-selected-pulse/);
  });
});
