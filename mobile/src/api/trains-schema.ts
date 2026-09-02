import { z } from "zod";

export const travelDirectionSchema = z.enum(["forward", "reverse", "bidirectional"]);
export type TravelDirection = z.infer<typeof travelDirectionSchema>;

export const estimatedTrainMarkerSchema = z.object({
  id: z.string(),
  lineId: z.string(),
  direction: z.string(),
  travelDirection: travelDirectionSchema,
  segmentId: z.string(),
  fromStationId: z.string(),
  toStationId: z.string(),
  nextStationId: z.string(),
  progress: z.number(),
  segmentTravelSeconds: z.number().optional().default(120),
  predictedAt: z.string(),
  vehicleId: z.string().nullable().optional(),
  tripId: z.string().nullable().optional(),
  feedCreatedAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});
export type EstimatedTrainMarker = z.infer<typeof estimatedTrainMarkerSchema>;

export const estimatedTrainSnapshotSchema = z.object({
  fresh: z.boolean(),
  availability: z.enum(["available", "disabled", "stale", "partial-source", "unavailable"]).optional(),
  source: z.string(),
  message: z.string(),
  disclaimer: z.string(),
  feedCreatedAt: z.string().nullable().optional(),
  generatedAt: z.string().nullable().optional(),
  markers: z.array(estimatedTrainMarkerSchema),
});
export type EstimatedTrainSnapshot = z.infer<typeof estimatedTrainSnapshotSchema>;

export const EMPTY_ESTIMATED_TRAIN_SNAPSHOT: EstimatedTrainSnapshot = {
  fresh: false,
  source: "TTC GTFS-RT subway trip updates",
  message: "Estimated train markers are unavailable.",
  disclaimer:
    "Estimated train markers are schematic placements inferred from TTC GTFS-RT trip updates and LineWatchTO topology. They are not physical train positions.",
  feedCreatedAt: null,
  generatedAt: null,
  markers: [],
};

export const EMPTY_REGIONAL_TRAIN_SNAPSHOT: EstimatedTrainSnapshot = {
  fresh: false,
  availability: "unavailable",
  source: "Metrolinx GTFS-RT vehicle positions",
  message: "Regional estimated train markers are unavailable.",
  disclaimer:
    "Estimated regional train markers are schematic placements derived from Metrolinx GTFS-RT vehicle positions and LineWatchTO topology. Markers are not exact physical train locations.",
  feedCreatedAt: null,
  generatedAt: null,
  markers: [],
};
