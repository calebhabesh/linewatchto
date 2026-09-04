import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as geometry from "../src/app/map-geometry.ts";

const {
  composeNetworkSegmentPath,
  extrapolatedPathFrame,
  pathCorridorCollisionBoxes,
  pathMidpointFrame,
  pathSamplingDistances,
  resolveNetworkSegmentPath,
  visualTravelDirection,
  samplePath,
} = geometry;

function polylinePath(points) {
  const lengths = points.slice(1).map((point, index) =>
    Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  return {
    length: totalLength,
    getPointAtLength(distance) {
      const target = Math.max(0, Math.min(totalLength, distance));
      let walked = 0;
      for (let index = 1; index < points.length; index++) {
        const segmentLength = lengths[index - 1];
        if (walked + segmentLength >= target) {
          const progress = segmentLength <= 0 ? 0 : (target - walked) / segmentLength;
          return {
            x: points[index - 1].x + (points[index].x - points[index - 1].x) * progress,
            y: points[index - 1].y + (points[index].y - points[index - 1].y) * progress,
          };
        }
        walked += segmentLength;
      }
      return points.at(-1);
    },
  };
}

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

  it("resolves legacy St George to Spadina guide ids to the current SVG guide path", () => {
    const path = resolveNetworkSegmentPath(
      {
        id: "line-1-spadina-st-george",
        lineId: "line-1",
        label: "Spadina to St George",
        stationAId: "spadina",
        stationBId: "st-george",
        guidePathId: "seg-line-1-spadina-st-george",
        overlay: "delay",
      },
      [
        { id: "spadina", name: "Spadina", x: 3739.5, y: 2524.5 },
        { id: "st-george", name: "St George", x: 4077.6, y: 2603 },
      ],
      new Map(),
      new Map([["seg-line-1-st-george-spadina", "M 4077.6,2603 V 2524.5 H 3739.5"]]),
    );

    assert.equal(path, "M 4077.6,2603 V 2524.5 H 3739.5");
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

  it("continues moving glyph frames through both ends of a nonlinear guide", () => {
    const guide = polylinePath([
      { x: 0, y: 0 },
      { x: 0, y: 80 },
      { x: 60, y: 100 },
    ]);

    const before = extrapolatedPathFrame(guide, guide.length, -12);
    const after = extrapolatedPathFrame(guide, guide.length, guide.length + 12);

    assert.deepEqual(before.point, { x: 0, y: -12 });
    assert.ok(after.point.x > 71 && after.point.x < 72);
    assert.ok(after.point.y > 103 && after.point.y < 104);
    assert.ok(after.tangent.x > 0.94 && after.tangent.y > 0.31);
  });

  it("samples a composed path continuously across a nonlinear guide subset boundary", () => {
    const corridor = polylinePath([
      { x: 0, y: 0 },
      { x: 0, y: 80 },
      { x: 60, y: 100 },
      { x: 120, y: 120 },
    ]);
    const guideBoundary = 80 + Math.hypot(60, 20);

    const frame = extrapolatedPathFrame(corridor, corridor.length, guideBoundary);

    assert.ok(Math.abs(frame.point.x - 60) < 0.001);
    assert.ok(Math.abs(frame.point.y - 100) < 0.001);
    assert.ok(frame.tangent.x > 0.94 && frame.tangent.y > 0.31);
  });

  it("preserves endpoint tangents when flattening whole guides and guide subsets", () => {
    const distances = pathSamplingDistances(237, 32);

    assert.deepEqual(distances.slice(0, 2), [0, 1]);
    assert.deepEqual(distances.slice(-2), [236, 237]);
    assert.ok(distances.some((distance) => distance > 1 && distance < 236));
  });

  it("preserves the exact corner of a linear nonlinear guide", () => {
    const corridor = composeNetworkSegmentPath([
      {
        id: "line-1-st-george-spadina",
        pathD: "m 4075.8197,2622.9729 v -82.4966 h -338.0799",
      },
    ]);

    assert.equal(
      corridor.pathD,
      "M 4075.82 2622.973 L 4075.82 2540.476 L 3737.74 2540.476",
    );
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

  it("normalizes transformed SVG bounds back into root viewBox coordinates", () => {
    assert.equal(typeof geometry.transformBoundsToRootCoordinates, "function");

    const bounds = geometry.transformBoundsToRootCoordinates(
      { x: 100, y: 100, width: 200, height: 80 },
      { a: 0.54544921875, b: 0, c: 0, d: 0.54544921875, e: 545.4711914062501, f: 272.724609375 },
      { a: 0.54544921875, b: 0, c: 0, d: 0.54544921875, e: 0.021972656250087288, f: 0 },
    );

    assert.deepEqual(bounds, { x: 1100, y: 600, width: 200, height: 80 });
  });

  it("preserves rotated SVG bounds as a four-corner interaction polygon", () => {
    assert.equal(typeof geometry.transformBoundsToRootPolygon, "function");

    const polygon = geometry.transformBoundsToRootPolygon(
      { x: 0, y: 0, width: 100, height: 20 },
      { a: 0, b: 1, c: -1, d: 0, e: 200, f: 300 },
    );

    assert.deepEqual(polygon, [
      { x: 200, y: 300 },
      { x: 200, y: 400 },
      { x: 180, y: 400 },
      { x: 180, y: 300 },
    ]);
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
        pathD: "M 300 200 V 150 C 300 122.386 277.614 100 250 100 H 0",
      },
      {
        id: "line-1-st-george-museum",
        pathD: "M 300 200 L 300 300",
      },
    ]);

    assert.match(result.pathD, /^M 0 0 L 0 100 L 250 100/);
    assert.match(result.pathD, /L 300 150 L 300 200 L 300 300$/);
    assert.ok(
      (result.pathD.match(/\bL\b/g) ?? []).length > 6,
      "the composed multi-link corridor should retain sampled guide curvature",
    );
    assert.equal((result.pathD.match(/\bM\b/g) ?? []).length, 1);
  });

  it("exposes SVG station center extraction for visual hit targets", async () => {
    const { readFileSync } = await import("node:fs");
    const mapGeometrySource = readFileSync(new URL("../src/app/map-geometry.ts", import.meta.url), "utf8");
    assert.match(mapGeometrySource, /readSvgStationCenters/);
    assert.match(mapGeometrySource, /station-\$\{stationId\}/);
    assert.match(mapGeometrySource, /getBBox\(\)/);
    assert.match(mapGeometrySource, /getScreenCTM\(\)/);
  });

  it("uses paired screen matrices for browser-independent SVG root coordinates", async () => {
    const { readFileSync } = await import("node:fs");
    const mapGeometrySource = readFileSync(new URL("../src/app/map-geometry.ts", import.meta.url), "utf8");

    assert.match(mapGeometrySource, /function svgElementMatrixToRootCoordinates/);
    assert.match(mapGeometrySource, /element\.getScreenCTM\(\)/);
    assert.match(mapGeometrySource, /root\.getScreenCTM\(\)/);
    assert.match(mapGeometrySource, /multiplyMatrix\(invertMatrix\(rootScreenMatrix\), elementScreenMatrix\)/);
    assert.match(mapGeometrySource, /resolved = transformPoint\(point, relativeMatrix\)/);
    assert.doesNotMatch(mapGeometrySource, /matrixTransform\(relativeMatrix\)/);
    assert.doesNotMatch(mapGeometrySource, /const rootMatrix = root\.getCTM\(\)/);
  });
});
