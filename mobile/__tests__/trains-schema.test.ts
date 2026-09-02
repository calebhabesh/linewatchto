import { describe, expect, it } from "@jest/globals";

import {
  EMPTY_ESTIMATED_TRAIN_SNAPSHOT,
  EMPTY_REGIONAL_TRAIN_SNAPSHOT,
  estimatedTrainMarkerSchema,
  estimatedTrainSnapshotSchema,
} from "@/api/trains-schema";

describe("Estimated Train Marker Runtime Schema Validation", () => {
  it("validates a standard TTC subway estimated train marker", () => {
    const marker = {
      id: "train-line-1-nb-101",
      lineId: "line-1",
      direction: "Northbound",
      travelDirection: "forward",
      segmentId: "yonge:bloor-yonge-rosedale",
      fromStationId: "bloor-yonge",
      toStationId: "rosedale",
      nextStationId: "rosedale",
      progress: 0.45,
      segmentTravelSeconds: 95,
      predictedAt: "2026-09-02T01:15:00Z",
      vehicleId: "5921",
      tripId: "ttc-trip-90210",
      feedCreatedAt: "2026-09-02T01:14:40Z",
      updatedAt: "2026-09-02T01:14:50Z",
    };

    const parsed = estimatedTrainMarkerSchema.parse(marker);
    expect(parsed.id).toBe("train-line-1-nb-101");
    expect(parsed.progress).toBe(0.45);
    expect(parsed.travelDirection).toBe("forward");
  });

  it("validates an estimated train snapshot payload", () => {
    const snapshot = {
      fresh: true,
      availability: "available",
      source: "TTC GTFS-RT subway trip updates",
      message: "Showing active subway train estimates.",
      disclaimer: "Estimated markers are schematic placements, not GPS positions.",
      feedCreatedAt: "2026-09-02T01:14:40Z",
      generatedAt: "2026-09-02T01:14:50Z",
      markers: [
        {
          id: "m-1",
          lineId: "line-2",
          direction: "Eastbound",
          travelDirection: "forward",
          segmentId: "bloor:st-george-bay",
          fromStationId: "st-george",
          toStationId: "bay",
          nextStationId: "bay",
          progress: 0.8,
          predictedAt: "2026-09-02T01:15:00Z",
        },
      ],
    };

    const parsed = estimatedTrainSnapshotSchema.parse(snapshot);
    expect(parsed.fresh).toBe(true);
    expect(parsed.markers).toHaveLength(1);
    expect(parsed.markers[0]?.segmentTravelSeconds).toBe(120); // default
  });

  it("provides valid empty snapshot defaults for TTC and Regional", () => {
    expect(EMPTY_ESTIMATED_TRAIN_SNAPSHOT.fresh).toBe(false);
    expect(EMPTY_ESTIMATED_TRAIN_SNAPSHOT.markers).toHaveLength(0);
    expect(EMPTY_REGIONAL_TRAIN_SNAPSHOT.fresh).toBe(false);
    expect(EMPTY_REGIONAL_TRAIN_SNAPSHOT.availability).toBe("unavailable");
  });

  it("rejects invalid travel direction enum values", () => {
    const invalid = {
      id: "m-bad",
      lineId: "line-1",
      direction: "Northbound",
      travelDirection: "sideways", // invalid
      segmentId: "s-1",
      fromStationId: "a",
      toStationId: "b",
      nextStationId: "b",
      progress: 0.5,
      predictedAt: "2026-09-02T01:15:00Z",
    };

    expect(() => estimatedTrainMarkerSchema.parse(invalid)).toThrow();
  });
});
