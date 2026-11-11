import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { mapOutlineEndConnectors } from "../src/components/map-overlays/overlay-plane.ts";

const ttc = JSON.parse(readFileSync(new URL("../src/app/map-geometry/ttc.json", import.meta.url), "utf8"));
const ttcDots = ttc.stations.flatMap((station) => station.anchors.map(({ x, y, radius, outline }) => ({ x, y, radius: radius + outline / 2 })));
const anchor = (id) => ttc.stations.find((station) => station.id === id).anchors[0];

describe("hover outline ends at terminal dots", () => {
  it("carries a track that stops short of Vaughan's centre on to it", () => {
    // Line 1's track ends 54 units below Vaughan Metropolitan Centre's dot centre.
    const vaughan = anchor("station-vaughan-metropolitan-centre");
    const [connector, ...rest] = mapOutlineEndConnectors(["M 1870.52 264.04 L 1870.52 468.22 L 2501.479 844.494"], ttcDots);
    assert.equal(rest.length, 0);
    assert.equal(connector, `M 1870.52 264.04 L ${vaughan.x} ${vaughan.y}`);
  });

  it("adds nothing where a track ends at a station's centre or between stations", () => {
    const finchWest = anchor("station-finch-west");
    assert.deepEqual(mapOutlineEndConnectors([`M 2068 594.8 L ${finchWest.x} ${finchWest.y}`], ttcDots), []);
    assert.deepEqual(mapOutlineEndConnectors(["M 3000 3000 L 3100 3000"], ttcDots), []);
  });

  it("reads each subpath's ends", () => {
    const vaughan = anchor("station-vaughan-metropolitan-centre");
    const connectors = mapOutlineEndConnectors(["M 3000 3000 L 3100 3000 M 1870.52 264.04 L 1870.52 468.22"], ttcDots);
    assert.deepEqual(connectors, [`M 1870.52 264.04 L ${vaughan.x} ${vaughan.y}`]);
  });
});
