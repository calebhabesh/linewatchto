import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  composeNetworkSegmentPath,
  resolveNetworkSegmentPath,
  visualTravelDirection,
  samplePath,
} from "../src/app/map-geometry.ts";

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
