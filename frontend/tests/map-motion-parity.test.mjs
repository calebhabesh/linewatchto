import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
// The System Map engine plus the shared overlay layer both maps draw alerts with.
const ttc = ["system-map/SystemMap.tsx", "map-overlays/GlyphLanes.tsx", "map-overlays/LineAlertOverlays.tsx"]
  .map((name) => read(`../src/components/${name}`))
  .join("\n");
const regional = read("../src/app/regional-map-overlays.ts");
const css = ["station-markers", "impact-overlays", "regional-map", "base-map"]
  .map((name) => read(`../src/styles/map/${name}.css`))
  .join("\n");

// Alert overlays never animate, on either map, on any device, at any alert
// count (docs/map-renderer-parity.md). Selection feedback is separate.
describe("alert overlays stay still on both maps", () => {
  it("draws glyph lanes at rest", () => {
    assert.doesNotMatch(ttc, /<animateMotion/);
    assert.doesNotMatch(regional, /animateMotion/);
  });

  it("draws station alerts without a pulse or radar ping", () => {
    for (const source of [ttc, regional]) {
      assert.doesNotMatch(source, /station-impact-dot-red-ping|data-station-impact-idle|stationImpactIdle/);
    }
    assert.doesNotMatch(css, /station-impact-dot-red-ping|@keyframes (?:gold-ring-pulse|station-radar-core|station-radar-ping)\b/);
    assert.doesNotMatch(css, /\.station-impact-(?:ring|dot-red-glow)\s*\{[^}]*animation:(?!\s*none)/s);
  });

  it("draws line alerts without a pulse on either map", () => {
    assert.doesNotMatch(css, /\.asset-alert-path-glow\.(?:suspension|delay|reduced-speed-zone|delay-static)\s*\{[^}]*animation:(?!\s*none)/s);
    assert.doesNotMatch(css, /\.regional-impact-aura\s*\{[^}]*animation:(?!\s*none)/s);
    assert.doesNotMatch(css, /\.regional-station-impact-fill\s*\{[^}]*animation:(?!\s*none)/s);
    assert.doesNotMatch(css, /@keyframes (?:delay-static-shift|regional-station-impact-fill-pulse)\b/);
  });

  it("has no alert motion budget to keep in step", () => {
    for (const source of [ttc, regional]) {
      assert.doesNotMatch(source, /MAX_CONTINUOUSLY_ANIMATED_OVERLAY_LAYERS|OverBudget/);
    }
  });
});
