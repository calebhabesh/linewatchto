import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pathPolylinePoints, resolveNetworkSegmentPath, trackGuideKey } from "../src/app/map-geometry.ts";

// An L-shaped track: right 200 units, then down 200. Stations sit on both arms.
const track = "M 0 0 L 200 0 L 200 200";
const guidePaths = new Map([[trackGuideKey("line-1"), track]]);
const segment = (anchors) => ({
  id: "segment",
  lineId: "line-1",
  stationAAnchorId: anchors[0],
  stationBAnchorId: anchors[1],
  pathD: "",
});

describe("TTC alert rails between stations", () => {
  it("follow the line's track around a corner instead of cutting a chord", () => {
    const anchors = new Map([["a", { x: 100, y: 0 }], ["b", { x: 200, y: 100 }]]);
    const points = pathPolylinePoints(resolveNetworkSegmentPath(segment(["a", "b"]), [], anchors, guidePaths));
    assert.deepEqual(points, [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }]);
  });

  it("run from station A to station B, so directional glyphs keep their heading", () => {
    const anchors = new Map([["a", { x: 200, y: 100 }], ["b", { x: 100, y: 0 }]]);
    const points = pathPolylinePoints(resolveNetworkSegmentPath(segment(["a", "b"]), [], anchors, guidePaths));
    assert.deepEqual(points[0], { x: 200, y: 100 });
    assert.deepEqual(points.at(-1), { x: 100, y: 0 });
  });

  it("keep the straight chord when a station is far from its track", () => {
    const anchors = new Map([["a", { x: 100, y: 0 }], ["b", { x: 0, y: 500 }]]);
    assert.equal(resolveNetworkSegmentPath(segment(["a", "b"]), [], anchors, guidePaths), "M 100 0 L 0 500");
  });
});
