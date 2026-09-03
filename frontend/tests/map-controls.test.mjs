import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("map controls", () => {
  it("renders the zoom controls inside a readable control rail", () => {
    assert.match(mapSource, /map-control-rail/);
    assert.match(mapSource, /map-control-button/);
    assert.match(mapSource, /map-control-slider/);
    assert.match(mapSource, /map-utility-cluster/);
    assert.match(mapSource, /map-control-zoom-group/);
    assert.match(globalCss, /\.map-control-zoom-group/);
  });

  it("styles the control rail for dark and high contrast map content", () => {
    assert.match(globalCss, /\.map-control-rail/);
    assert.match(globalCss, /\.high-contrast \.map-control-rail/);
    assert.match(globalCss, /\.map-control-button/);
  });

  it("styles the desktop center icon to match the mobile status peek center icon", () => {
    assert.match(mapSource, /<Locate\s+size=\{22\}\s+className="map-control-recenter-icon"\s*\/>/);
    assert.match(globalCss, /\.map-control-recenter-container \.map-control-button svg,\s*\.map-control-recenter-icon/);
    assert.match(globalCss, /fill:\s*#2563eb;/);
    assert.match(globalCss, /stroke-width:\s*2\.2;/);
    assert.match(globalCss, /drop-shadow\(0 0 6px rgba\(37, 99, 235, 0\.5\)\)/);
  });
});

