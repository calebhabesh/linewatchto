import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_ESTIMATED_TRAIN_SNAPSHOT,
  EMPTY_REGIONAL_TRAIN_SNAPSHOT,
  createEstimatedTrainMarkerContinuityState,
  estimatedTrainMarkerMotionDurationMs,
  estimatedTrainMarkerMotionWaypoints,
  estimatedTrainMarkerRenderKey,
  estimatedTrainMarkerRefreshMs,
  getEstimatedTrainMarkers,
  reconcileEstimatedTrainSnapshot,
  sampleEstimatedTrainMarkerMotion,
} from "../src/app/train-markers.ts";

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
