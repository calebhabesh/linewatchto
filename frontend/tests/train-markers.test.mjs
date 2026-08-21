import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_ESTIMATED_TRAIN_SNAPSHOT,
  EMPTY_REGIONAL_TRAIN_SNAPSHOT,
  createEstimatedTrainMarkerContinuityState,
  estimatedTrainMarkerLanePoint,
  estimatedTrainMarkerMotionDurationMs,
  estimatedTrainMarkerMotionWaypoints,
  estimatedTrainMarkerObservationKey,
  estimatedTrainMarkerRenderKey,
  estimatedTrainMarkerRefreshMs,
  getEstimatedTrainMarkers,
  reconcileEstimatedTrainSnapshot,
  sampleEstimatedTrainMarkerMotion,
} from "../src/app/train-markers.ts";

describe("estimated train marker directional lanes", () => {
  it("places opposing trains on opposite sides of horizontal and vertical paths", () => {
    assert.deepEqual(
      estimatedTrainMarkerLanePoint({ x: 100, y: 200 }, { x: 10, y: 0 }, "forward", 20),
      { x: 100, y: 220 },
    );
    assert.deepEqual(
      estimatedTrainMarkerLanePoint({ x: 100, y: 200 }, { x: 10, y: 0 }, "reverse", 20),
      { x: 100, y: 180 },
    );
    assert.deepEqual(
      estimatedTrainMarkerLanePoint({ x: 100, y: 200 }, { x: 0, y: 10 }, "forward", 20),
      { x: 80, y: 200 },
    );
    assert.deepEqual(
      estimatedTrainMarkerLanePoint({ x: 100, y: 200 }, { x: 0, y: 10 }, "reverse", 20),
      { x: 120, y: 200 },
    );
  });

  it("keeps bidirectional markers centered and curved-path lanes perpendicular", () => {
    const center = { x: 100, y: 200 };
    assert.equal(
      estimatedTrainMarkerLanePoint(center, { x: 3, y: 4 }, "bidirectional", 20),
      center,
    );

    const lanePoint = estimatedTrainMarkerLanePoint(center, { x: 3, y: 4 }, "forward", 20);
    assert.equal(Math.hypot(lanePoint.x - center.x, lanePoint.y - center.y), 20);
    assert.equal((lanePoint.x - center.x) * 3 + (lanePoint.y - center.y) * 4, 0);
  });
});

describe("estimated train marker data adapter", () => {
  it("returns backend marker snapshots", async () => {
    const result = await getEstimatedTrainMarkers({
      fetcher: async () => new Response(JSON.stringify({
        fresh: true,
        source: "TTC GTFS-RT subway trip updates",
        message: "Fresh TTC GTFS-RT subway trip updates are available.",
        disclaimer: "Estimated train markers are schematic placements inferred from TTC GTFS-RT trip updates and LineWatchTO topology. They are not physical train positions.",
        feedCreatedAt: "2026-07-02T09:59:50Z",
        generatedAt: "2026-07-02T10:00:00Z",
        markers: [{
          id: "line-2:126789:232:bay",
          lineId: "line-2",
          direction: "Eastbound",
          travelDirection: "forward",
          segmentId: "line-2-st-george-bay",
          fromStationId: "st-george",
          toStationId: "bay",
          nextStationId: "bay",
          progress: 0.333,
          segmentTravelSeconds: 120,
          predictedAt: "2026-07-02T10:01:20Z",
          vehicleId: "232",
          tripId: "126789",
          feedCreatedAt: "2026-07-02T09:59:50Z",
          updatedAt: "2026-07-02T10:00:00Z",
        }],
      }), { status: 200 }),
    });

    assert.equal(result.source, "backend");
    assert.equal(result.data.fresh, true);
    assert.equal(result.data.markers[0].segmentId, "line-2-st-george-bay");
  });

  it("falls back to an empty snapshot when the endpoint is unavailable", async () => {
    const result = await getEstimatedTrainMarkers({
      fetcher: async () => new Response("nope", { status: 503 }),
    });

    assert.equal(result.source, "fallback");
    assert.deepEqual(result.data, EMPTY_ESTIMATED_TRAIN_SNAPSHOT);
  });

  it("uses the regional endpoint and regional fallback state", async () => {
    let requestedUrl = "";
    const result = await getEstimatedTrainMarkers({
      network: "regional",
      apiBaseUrl: "http://backend.test",
      fetcher: async (input) => {
        requestedUrl = String(input);
        return new Response("nope", { status: 503 });
      },
    });

    assert.equal(requestedUrl, "http://backend.test/api/regional/trains");
    assert.equal(result.source, "fallback");
    assert.deepEqual(result.data, EMPTY_REGIONAL_TRAIN_SNAPSHOT);
  });

  it("uses a bounded refresh interval", () => {
    assert.equal(estimatedTrainMarkerRefreshMs("ttc", "9000"), 9000);
    assert.equal(estimatedTrainMarkerRefreshMs("ttc", "500"), 1000);
    assert.equal(estimatedTrainMarkerRefreshMs("ttc", "bad"), 1000);
    assert.equal(estimatedTrainMarkerRefreshMs("regional", "30000"), 30000);
    assert.equal(estimatedTrainMarkerRefreshMs("regional", "5000"), 15000);
    assert.equal(estimatedTrainMarkerRefreshMs("regional", "bad"), 15000);
  });

  it("uses stable render keys while the same train advances to the next station", () => {
    const baseMarker = {
      id: "line-2:126789:232:eastbound:bay",
      lineId: "line-2",
      direction: "Eastbound",
      travelDirection: "forward",
      segmentId: "line-2-st-george-bay",
      fromStationId: "st-george",
      toStationId: "bay",
      nextStationId: "bay",
      progress: 0.333,
      segmentTravelSeconds: 120,
      predictedAt: "2026-07-02T10:01:20Z",
      vehicleId: "232",
      tripId: "126789",
      feedCreatedAt: "2026-07-02T09:59:50Z",
      updatedAt: "2026-07-02T10:00:00Z",
    };

    assert.equal(
      estimatedTrainMarkerRenderKey(baseMarker),
      estimatedTrainMarkerRenderKey({
        ...baseMarker,
        id: "line-2:126789:232:eastbound:sherbourne",
        segmentId: "line-2-bay-sherbourne",
        fromStationId: "bay",
        toStationId: "sherbourne",
        nextStationId: "sherbourne",
        progress: 0.08,
      }),
    );
  });

  it("keeps a vehicle stable when the feed changes its trip id", () => {
    const marker = markerFixture();
    assert.equal(
      estimatedTrainMarkerRenderKey(marker),
      estimatedTrainMarkerRenderKey({ ...marker, id: "replacement-id", tripId: "replacement-trip" }),
    );
  });

  it("holds last-seen markers through a short browser polling outage, then expires them", () => {
    const state = createEstimatedTrainMarkerContinuityState();
    const marker = markerFixture();
    const fresh = reconcileEstimatedTrainSnapshot(state, {
      ...EMPTY_ESTIMATED_TRAIN_SNAPSHOT,
      fresh: true,
      markers: [marker],
    }, "ttc", 1_000);
    const held = reconcileEstimatedTrainSnapshot(state, {
      ...EMPTY_ESTIMATED_TRAIN_SNAPSHOT,
      message: "Request failed.",
    }, "ttc", 20_000);
    const expired = reconcileEstimatedTrainSnapshot(state, EMPTY_ESTIMATED_TRAIN_SNAPSHOT, "ttc", 31_001);

    assert.equal(fresh.markers.length, 1);
    assert.equal(held.fresh, false);
    assert.equal(held.availability, "stale");
    assert.equal(held.markers[0].vehicleId, "232");
    assert.match(held.message, /remain briefly visible/);
    assert.equal(expired.markers.length, 0);
  });

  it("clamps noisy same-segment corrections so a marker never moves backward", () => {
    const state = createEstimatedTrainMarkerContinuityState();
    const marker = markerFixture();
    reconcileEstimatedTrainSnapshot(state, {
      ...EMPTY_ESTIMATED_TRAIN_SNAPSHOT,
      fresh: true,
      markers: [{ ...marker, progress: 0.62 }],
    }, "ttc", 1_000);

    const corrected = reconcileEstimatedTrainSnapshot(state, {
      ...EMPTY_ESTIMATED_TRAIN_SNAPSHOT,
      fresh: true,
      markers: [{ ...marker, progress: 0.41, updatedAt: "2026-07-02T10:00:01Z" }],
    }, "ttc", 2_000);

    assert.equal(corrected.markers[0].progress, 0.62);
  });

  it("deduplicates direction changes for the same physical vehicle", () => {
    const state = createEstimatedTrainMarkerContinuityState();
    const marker = markerFixture();
    const result = reconcileEstimatedTrainSnapshot(state, {
      ...EMPTY_ESTIMATED_TRAIN_SNAPSHOT,
      fresh: true,
      markers: [marker, { ...marker, direction: "Westbound", progress: 0.7 }],
    }, "ttc", 1_000);

    assert.equal(result.markers.length, 1);
    assert.equal(
      estimatedTrainMarkerRenderKey(marker),
      estimatedTrainMarkerRenderKey({ ...marker, direction: "Westbound" }),
    );
  });

  it("preserves marker identity through an identical poll so motion is not restarted", () => {
    const state = createEstimatedTrainMarkerContinuityState();
    const marker = markerFixture();
    const first = reconcileEstimatedTrainSnapshot(state, {
      ...EMPTY_ESTIMATED_TRAIN_SNAPSHOT,
      fresh: true,
      markers: [marker],
    }, "ttc", 1_000);
    const duplicate = reconcileEstimatedTrainSnapshot(state, {
      ...EMPTY_ESTIMATED_TRAIN_SNAPSHOT,
      fresh: true,
      markers: [{ ...marker }],
    }, "ttc", 2_000);

    assert.equal(duplicate.markers[0], first.markers[0]);
    assert.equal(
      estimatedTrainMarkerObservationKey(duplicate.markers[0]),
      estimatedTrainMarkerObservationKey(marker),
    );
    assert.doesNotMatch(duplicate.message, /holding 0/i);
  });

  it("spreads movement across a bounded source cadence instead of stopping early", () => {
    const previous = markerFixture();
    const target = {
      ...previous,
      progress: 0.58,
      updatedAt: "2026-07-02T10:00:30Z",
    };

    assert.equal(estimatedTrainMarkerMotionDurationMs([previous, target]), 31_500);
    assert.equal(
      estimatedTrainMarkerMotionDurationMs([
        previous,
        { ...target, updatedAt: "2026-07-02T10:02:00Z" },
      ]),
      45_000,
    );
  });

  it("builds a track-following motion plan across adjacent and skipped segments", () => {
    const previous = markerFixture();
    const target = {
      ...previous,
      id: "line-2:126789:232:eastbound:castle-frank",
      segmentId: "line-2-sherbourne-castle-frank",
      fromStationId: "sherbourne",
      toStationId: "castle-frank",
      nextStationId: "castle-frank",
      progress: 0.25,
    };
    const waypoints = estimatedTrainMarkerMotionWaypoints(previous, target, [
      { id: previous.segmentId, lineId: "line-2", stationAId: "st-george", stationBId: "bay" },
      { id: "line-2-bay-sherbourne", lineId: "line-2", stationAId: "bay", stationBId: "sherbourne" },
      { id: target.segmentId, lineId: "line-2", stationAId: "sherbourne", stationBId: "castle-frank" },
    ]);

    assert.deepEqual(
      waypoints.map((waypoint) => [waypoint.segmentId, waypoint.progress]),
      [
        [previous.segmentId, previous.progress],
        [previous.segmentId, 1],
        ["line-2-bay-sherbourne", 0],
        ["line-2-bay-sherbourne", 1],
        [target.segmentId, 0],
        [target.segmentId, target.progress],
      ],
    );
    assert.ok(estimatedTrainMarkerMotionDurationMs(waypoints) <= 14_000);
    const midway = sampleEstimatedTrainMarkerMotion(waypoints, 0.5);
    assert.equal(midway.from.segmentId, "line-2-bay-sherbourne");
    for (let step = 0; step <= 20; step += 1) {
      const sample = sampleEstimatedTrainMarkerMotion(waypoints, step / 20);
      assert.equal(sample.from.segmentId, sample.to.segmentId);
    }
  });

  it("rejects backward and implausibly large segment jumps", () => {
    const previous = {
      ...markerFixture(),
      segmentId: "line-2-bay-sherbourne",
      fromStationId: "bay",
      toStationId: "sherbourne",
      nextStationId: "sherbourne",
      progress: 0.6,
    };
    const backward = markerFixture();
    const segments = [
      { id: backward.segmentId, lineId: "line-2", stationAId: "st-george", stationBId: "bay" },
      { id: previous.segmentId, lineId: "line-2", stationAId: "bay", stationBId: "sherbourne" },
    ];

    assert.deepEqual(estimatedTrainMarkerMotionWaypoints(previous, backward, segments), [previous]);

    const longSegments = Array.from({ length: 7 }, (_, index) => ({
      id: `segment-${index}`,
      lineId: "line-2",
      stationAId: `station-${index}`,
      stationBId: `station-${index + 1}`,
    }));
    const farPrevious = {
      ...previous,
      segmentId: "segment-0",
      fromStationId: "station-0",
      toStationId: "station-1",
    };
    const farTarget = {
      ...previous,
      segmentId: "segment-6",
      fromStationId: "station-6",
      toStationId: "station-7",
      nextStationId: "station-7",
    };
    assert.deepEqual(
      estimatedTrainMarkerMotionWaypoints(farPrevious, farTarget, longSegments),
      [farPrevious],
    );
  });

  it("rejects a non-adjacent correction that loops through the station just departed", () => {
    const previous = {
      ...markerFixture(),
      segmentId: "segment-a-b",
      fromStationId: "station-a",
      toStationId: "station-b",
      nextStationId: "station-b",
      progress: 0.7,
    };
    const backwardTarget = {
      ...previous,
      segmentId: "segment-d-e",
      fromStationId: "station-d",
      toStationId: "station-e",
      nextStationId: "station-e",
      progress: 0.2,
    };
    const segments = [
      { id: previous.segmentId, lineId: "line-2", stationAId: "station-a", stationBId: "station-b" },
      { id: "segment-b-c", lineId: "line-2", stationAId: "station-b", stationBId: "station-c" },
      { id: "segment-c-a", lineId: "line-2", stationAId: "station-c", stationBId: "station-a" },
      { id: "segment-a-d", lineId: "line-2", stationAId: "station-a", stationBId: "station-d" },
      { id: backwardTarget.segmentId, lineId: "line-2", stationAId: "station-d", stationBId: "station-e" },
    ];

    assert.deepEqual(
      estimatedTrainMarkerMotionWaypoints(previous, backwardTarget, segments),
      [previous],
    );
  });

  it("follows the authored Union loop through the adjacent branch without reversing", () => {
    const previous = {
      ...markerFixture(),
      lineId: "line-1",
      direction: "Northbound",
      segmentId: "line-1-st-andrew-union",
      fromStationId: "st-andrew",
      toStationId: "union",
      nextStationId: "union",
      progress: 0.85,
    };
    const target = {
      ...previous,
      segmentId: "line-1-king-queen",
      fromStationId: "king",
      toStationId: "queen",
      nextStationId: "queen",
      travelDirection: "reverse",
      progress: 0.2,
    };
    const waypoints = estimatedTrainMarkerMotionWaypoints(previous, target, [
      { id: previous.segmentId, lineId: "line-1", stationAId: "st-andrew", stationBId: "union" },
      { id: "line-1-king-union", lineId: "line-1", stationAId: "king", stationBId: "union" },
      { id: target.segmentId, lineId: "line-1", stationAId: "queen", stationBId: "king" },
    ]);

    assert.deepEqual(
      waypoints.map((waypoint) => [waypoint.segmentId, waypoint.fromStationId, waypoint.toStationId]),
      [
        [previous.segmentId, "st-andrew", "union"],
        [previous.segmentId, "st-andrew", "union"],
        ["line-1-king-union", "union", "king"],
        ["line-1-king-union", "union", "king"],
        [target.segmentId, "king", "queen"],
        [target.segmentId, "king", "queen"],
      ],
    );
  });
});

function markerFixture() {
  return {
    id: "line-2:126789:232:eastbound:bay",
    lineId: "line-2",
    direction: "Eastbound",
    travelDirection: "forward",
    segmentId: "line-2-st-george-bay",
    fromStationId: "st-george",
    toStationId: "bay",
    nextStationId: "bay",
    progress: 0.333,
    segmentTravelSeconds: 120,
    predictedAt: "2026-07-02T10:01:20Z",
    vehicleId: "232",
    tripId: "126789",
    feedCreatedAt: "2026-07-02T09:59:50Z",
    updatedAt: "2026-07-02T10:00:00Z",
  };
}
