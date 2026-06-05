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
  });

  it("styles the control rail for dark and high contrast map content", () => {
    assert.match(globalCss, /\.map-control-rail/);
    assert.match(globalCss, /\.high-contrast \.map-control-rail/);
    assert.match(globalCss, /\.map-control-button/);
  });
});
