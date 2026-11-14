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

// Alert overlays never move, on either map, on any device, at any alert
// count (docs/map-renderer-parity.md). Selection feedback, the glyph ripple
// and the desktop beacon ping are paint only.
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

  it("pings station beacons with paint only, behind the desktop motion gates", () => {
    const shared = read("../src/components/map-overlays/StationAlertOverlays.tsx");
    const beacon = read("../src/components/station-impact-beacon.ts");
    const pulseSync = read("../src/components/map-overlays/pulse-sync.ts");
    // One shared component draws it, so both maps ping alike.
    assert.match(shared, /className=\{pingClass\}/);
    assert.match(beacon, /kind !== "planned-closure"/);
    assert.match(pulseSync, /"station-alert-beacon-ping"/);

    const base = css.match(/\.station-alert-beacon-ping\s*\{([^}]*)\}/s)?.[1] ?? "";
    assert.match(base, /display:\s*none/);
    assert.doesNotMatch(base, /animation/);
    const gated = css.match(/@media \(hover: hover\) and \(pointer: fine\) and \(min-width: 768px\) and \(prefers-reduced-motion: no-preference\) \{\s*\.linewatch-shell:not\(\.mobile-performance-mode\):not\(\.motion-paused\) \.station-alert-beacon-ping \{([^}]*)\}/s)?.[1];
    assert.ok(gated, "the ping runs only behind the ripple's gates");
    assert.match(gated, /animation: station-alert-beacon-ping/);
    assert.match(gated, /animation-delay: var\(--map-pulse-offset\)/);

    const keyframes = css.match(/@keyframes station-alert-beacon-ping \{(.*?)\n\}/s)?.[1] ?? "";
    assert.ok(keyframes);
    const properties = [...keyframes.matchAll(/([a-z-]+):/g)].map((match) => match[1]);
    assert.deepEqual([...new Set(properties)].sort(), ["animation-timing-function", "opacity", "scale"]);
    assert.match(css, /\.station-alert-beacon-ping\.selected\s*\{\s*visibility: hidden;/);
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
