import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  STATION_IMPACT_BEACON_SCALE,
  stationImpactBeaconSize,
} from "../src/components/station-impact-beacon.ts";

const CORE = 26;
const GAP = 4;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Spadina: two platform dots 74.4 units apart, each 36 units across with its outline.
const upper = { id: "spadina-1", center: { x: 0, y: 0 }, radius: 36 };
const lower = { id: "spadina-2", center: { x: 0, y: 74.4 }, radius: 36 };

describe("station impact beacon", () => {
  it("is full size when no station dot is nearby", () => {
    const far = { id: "far", center: { x: 1000, y: 0 }, radius: 36 };
    const size = stationImpactBeaconSize(upper.center, CORE, [upper, far], new Set(["spadina-1"]), GAP);
    assert.equal(size.radius, CORE * STATION_IMPACT_BEACON_SCALE);
  });

  it("shrinks to stop short of an unalerted neighbour's dot", () => {
    const size = stationImpactBeaconSize(upper.center, CORE, [upper, lower], new Set(["spadina-1"]), GAP);
    assert.ok(size.radius + lower.radius + GAP <= distance(upper.center, lower.center) + 1e-9);
    assert.ok(size.radius > CORE);
  });

  it("gives two alerted dots close together smaller full circles that do not overlap", () => {
    const alerted = new Set(["spadina-1", "spadina-2"]);
    const top = stationImpactBeaconSize(upper.center, CORE, [upper, lower], alerted, GAP);
    const bottom = stationImpactBeaconSize(lower.center, CORE, [upper, lower], alerted, GAP);
    assert.ok(top.radius + bottom.radius + GAP <= distance(upper.center, lower.center) + 1e-9);
    assert.ok(top.radius > CORE && bottom.radius > CORE);
  });
});

describe("station impact beacon parity", () => {
  const ttc = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
  const regional = readFileSync(new URL("../src/app/regional-map-overlays.ts", import.meta.url), "utf8");
  const baseCss = readFileSync(new URL("../src/styles/map/base-map.css", import.meta.url), "utf8");
  const markersCss = readFileSync(new URL("../src/styles/map/station-markers.css", import.meta.url), "utf8");

  it("draws the same sized beacon on both maps", () => {
    assert.match(ttc, /stationImpactBeaconSize\(/);
    assert.match(regional, /stationImpactBeaconSize\(/);
    assert.match(regional, /classList\.add\("station-impact-dot-red-beacon"/);
  });

  it("shows the beacon on every form factor and keeps it while the map moves", () => {
    assert.doesNotMatch(markersCss, /\.station-impact-dot-red-beacon\s*\{[^}]*display:\s*none/s);
    const hiddenDuringGestures = baseCss.split("}").find((block) => (
      block.includes("data-map-gesture-active") && block.includes("opacity: 0 !important;") && block.includes(".commute-path-preview-glow")
    )) ?? "";
    assert.ok(hiddenDuringGestures.includes(".regional-impact-aura"));
    assert.ok(!hiddenDuringGestures.includes("station-impact-dot-red-beacon"));
    assert.ok(!hiddenDuringGestures.includes("regional-station-impact-beacon-group"));
  });

  it("draws TTC's idle gold ring on GO/UP too", () => {
    assert.match(regional, /"station-impact-ring", "regional-station-impact-visual-ring"/);
  });
});
