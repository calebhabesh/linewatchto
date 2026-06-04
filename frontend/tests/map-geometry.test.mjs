import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as geometry from "../src/app/map-geometry.ts";

const {
  composeNetworkSegmentPath,
  pathCorridorCollisionBoxes,
  pathMidpointFrame,
  resolveNetworkSegmentPath,
  visualTravelDirection,
  samplePath,
} = geometry;

const stations = [
  { id: "eglinton", name: "Eglinton", x: 4547, y: 1808 },
  { id: "davisville", name: "Davisville", x: 4547, y: 2005 },
];

describe("map overlay geometry", () => {
  it("generates ordinary paths from authored station anchor measurements", () => {
    const path = resolveNetworkSegmentPath(
      {
        id: "line-1-eglinton-davisville",
        lineId: "line-1",
        label: "Eglinton to Davisville",
        stationAId: "eglinton",
        stationBId: "davisville",
        stationAAnchorId: "station-eglinton",
        stationBAnchorId: "station-davisville",
        overlay: "delay",
      },
      stations,
      new Map([
        ["station-eglinton", { x: 4547, y: 1808 }],
        ["station-davisville", { x: 4547, y: 2005 }],
      ]),
      new Map(),
    );

    assert.equal(path, "M 4547 1808 L 4547 2005");
  });

  it("uses authored nonlinear guide paths before straight fallbacks", () => {
    const path = resolveNetworkSegmentPath(
      {
        id: "line-1-king-union",
        lineId: "line-1",
        label: "King to Union",
        stationAId: "king",
        stationBId: "union",
        guidePathId: "seg-line-1-union-king",
        overlay: "delay",
      },
      [],
      new Map(),
      new Map([["seg-line-1-union-king", "m 4547,3363 c 0,0 -7,227 -235,236"]]),
    );

    assert.equal(path, "m 4547,3363 c 0,0 -7,227 -235,236");
  });

  it("centers relative nonlinear guide paths in absolute map coordinates", () => {
    assert.equal(typeof geometry.pathCenter, "function");

    const center = geometry.pathCenter("m 4074.3935,3363.3976 c 0,0 7.734,227.6 235.334,236.4388");

    assert.notEqual(center, null);
    assert.ok(center.x > 4070 && center.x < 4315, `expected x near the Union loop, got ${center.x}`);
    assert.ok(center.y > 3360 && center.y < 3605, `expected y near the Union loop, got ${center.y}`);
  });

  it("falls back to database station coordinates when an svg anchor is missing", () => {
    const path = resolveNetworkSegmentPath(
      {
        id: "line-1-eglinton-davisville",
        lineId: "line-1",
        label: "Eglinton to Davisville",
        stationAId: "eglinton",
        stationBId: "davisville",
        overlay: "delay",
      },
      stations,
      new Map(),
      new Map(),
    );

    assert.equal(path, "M 4547 1808 L 4547 2005");
  });

  it("falls back to station coordinates when an authored guide is missing", () => {
    const path = resolveNetworkSegmentPath(
      {
        id: "line-1-king-union",
        lineId: "line-1",
        label: "King to Union",
        stationAId: "king",
        stationBId: "union",
        guidePathId: "seg-line-1-union-king",
        overlay: "delay",
      },
      [
        { id: "king", name: "King", x: 4547, y: 3362 },
        { id: "union", name: "Union", x: 4311, y: 3597 },
      ],
      new Map(),
      new Map(),
    );

    assert.equal(path, "M 4547 3362 L 4311 3597");
  });

  it("flips visual movement when an authored guide runs opposite topology orientation", () => {
    assert.equal(
      visualTravelDirection({
        id: "line-1-spadina-st-george",
        lineId: "line-1",
        label: "Spadina to St George",
        overlay: "delay",
        travelDirection: "forward",
        guidePathReversed: true,
      }),
      "reverse",
    );
  });

  it("safely returns an empty array for samplePath when document is undefined", () => {
    const result = samplePath("M 0 0 L 100 0");
    assert.deepEqual(result.points, []);
    assert.equal(result.step, 56);
  });

  it("samples collision boxes along each overlay path corridor", () => {
    const boxes = pathCorridorCollisionBoxes("M 10 10 L 10 210 L 210 210", 20);

    assert.ok(boxes.length > 6, `expected multiple sampled boxes, got ${boxes.length}`);
    assert.deepEqual(boxes[0], { x: -10, y: -10, width: 40, height: 40 });
    assert.deepEqual(boxes.at(-1), { x: 190, y: 190, width: 40, height: 40 });
    assert.ok(boxes.every((box) => box.width <= 40 && box.height <= 40));
  });

  it("does not turn a diagonal overlay path into one broad axis-aligned blocker", () => {
    const boxes = pathCorridorCollisionBoxes("M 0 0 L 300 200", 20);

    assert.ok(boxes.length > 4, `expected sampled boxes along the diagonal, got ${boxes.length}`);
    assert.ok(boxes.every((box) => box.width <= 40 && box.height <= 40));
    assert.ok(
      boxes.some((box) => box.x > 100 && box.x < 180 && box.y > 50 && box.y < 130),
      "expected a sampled blocker near the middle of the diagonal",
    );
  });

  it("resolves a midpoint frame with tangent and normal for diagonal badge placement", () => {
    const frame = pathMidpointFrame("M 0 0 L 300 200");

    assert.notEqual(frame, null);
    assert.ok(frame.point.x > 145 && frame.point.x < 155, `expected midpoint x near 150, got ${frame.point.x}`);
    assert.ok(frame.point.y > 95 && frame.point.y < 105, `expected midpoint y near 100, got ${frame.point.y}`);
    assert.ok(frame.tangent.x > 0.8 && frame.tangent.y > 0.5, `unexpected tangent ${JSON.stringify(frame.tangent)}`);
    assert.ok(frame.normal.x < -0.5 && frame.normal.y > 0.5, `unexpected normal ${JSON.stringify(frame.normal)}`);
    assert.ok(Math.abs(frame.tangent.x * frame.normal.x + frame.tangent.y * frame.normal.y) < 0.001);
  });

  it("composes adjacent links into one continuous corridor path", () => {
    const result = composeNetworkSegmentPath([
      {
        id: "line-1-queens-park-st-patrick",
        pathD: "M 10 0 L 10 100",
      },
      {
        id: "line-1-st-patrick-osgoode",
        pathD: "M 10 100 L 10 200",
      },
      {
        id: "line-1-osgoode-st-andrew",
        pathD: "M 10 200 L 10 300",
      },
    ]);

    assert.equal(result.pathD, "M 10 0 L 10 100 L 10 200 L 10 300");
    assert.equal((result.pathD.match(/\bM\b/g) ?? []).length, 1);
  });

  it("orients guide-backed links so they join neighbouring linear links", () => {
    const result = composeNetworkSegmentPath([
      {
        id: "line-1-dupont-spadina",
        pathD: "M 0 0 L 0 100",
      },
      {
        id: "line-1-spadina-st-george",
        guidePathReversed: true,
        pathD: "M 300 100 L 0 100",
      },
      {
        id: "line-1-st-george-museum",
        pathD: "M 300 100 L 300 200",
      },
    ]);

    assert.equal(result.pathD, "M 0 0 L 0 100 L 300 100 L 300 200");
    assert.equal((result.pathD.match(/\bM\b/g) ?? []).length, 1);
  });
});
