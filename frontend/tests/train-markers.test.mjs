import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_ESTIMATED_TRAIN_SNAPSHOT,
  estimatedTrainMarkerRenderKey,
  estimatedTrainMarkerRefreshMs,
  getEstimatedTrainMarkers,
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

  it("uses a bounded refresh interval", () => {
    assert.equal(estimatedTrainMarkerRefreshMs("9000"), 9000);
    assert.equal(estimatedTrainMarkerRefreshMs("500"), 1000);
    assert.equal(estimatedTrainMarkerRefreshMs("bad"), 1000);
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
});
