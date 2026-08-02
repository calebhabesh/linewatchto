import { apiUrl } from "./api-client.ts";

export type EstimatedTrainMarker = {
  id: string;
  lineId: string;
  direction: string;
  travelDirection: "forward" | "reverse" | "bidirectional";
  segmentId: string;
  fromStationId: string;
  toStationId: string;
  nextStationId: string;
  progress: number;
  segmentTravelSeconds: number;
  predictedAt: string;
  vehicleId?: string | null;
  tripId?: string | null;
  feedCreatedAt?: string | null;
  updatedAt?: string | null;
};

export type EstimatedTrainSnapshot = {
  fresh: boolean;
  availability?: "available" | "disabled" | "stale" | "partial-source" | "unavailable";
  source: string;
  message: string;
  disclaimer: string;
  feedCreatedAt?: string | null;
  generatedAt?: string | null;
  markers: EstimatedTrainMarker[];
};

export type EstimatedTrainDataResult = {
  source: "backend" | "fallback";
  data: EstimatedTrainSnapshot;
};

export type EstimatedTrainFetchOptions = {
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
  network?: "ttc" | "regional";
};

export type EstimatedTrainMarkerSegment = {
  stationAId?: string;
  stationBId?: string;
  stationAAnchorId?: string;
  stationBAnchorId?: string;
};

export type EstimatedTrainMarkerSegmentDirection = {
  fromStationId: string;
  toStationId: string;
  fromAnchorId: string;
  toAnchorId: string;
};

export const TRAIN_MARKER_BODY_PATH =
  "M -21 -15 H 14 L 36 0 L 14 15 H -21 A 15 15 0 0 1 -36 0 A 15 15 0 0 1 -21 -15 Z";
export const TRAIN_MARKER_ARROW_PATH = "M 13 -8 L 27 0 L 13 8 Z";
export const TRAIN_MARKER_WINDOWS = [
  { x: -27, y: -6, width: 8, height: 12, rx: 1.5 },
  { x: -15, y: -6, width: 8, height: 12, rx: 1.5 },
  { x: -3, y: -6, width: 8, height: 12, rx: 1.5 },
] as const;

export const EMPTY_ESTIMATED_TRAIN_SNAPSHOT: EstimatedTrainSnapshot = {
  fresh: false,
  source: "TTC GTFS-RT subway trip updates",
  message: "Estimated train markers are unavailable.",
  disclaimer: "Estimated train markers are schematic placements inferred from TTC GTFS-RT trip updates and LineWatchTO topology. They are not physical train positions.",
  feedCreatedAt: null,
  generatedAt: null,
  markers: [],
};

export const EMPTY_REGIONAL_TRAIN_SNAPSHOT: EstimatedTrainSnapshot = {
  fresh: false,
  availability: "unavailable",
  source: "Metrolinx GTFS-RT vehicle positions",
  message: "Regional estimated train markers are unavailable.",
  disclaimer: "Estimated regional train markers are schematic placements derived from Metrolinx GTFS-RT vehicle positions and LineWatchTO topology. UP Express direction and station timing are reconciled with the matching TripUpdates trip. Markers are not exact physical train locations.",
  feedCreatedAt: null,
  generatedAt: null,
  markers: [],
};

const TTC_TRAIN_MARKER_REFRESH_MS = 1_000;
const REGIONAL_TRAIN_MARKER_REFRESH_MS = 15_000;

export function estimatedTrainMarkerRefreshMs(
  network: "ttc" | "regional" = "ttc",
  configured = process.env.NEXT_PUBLIC_LINEWATCH_TRAIN_MARKER_REFRESH_MS,
) {
  const minimum = network === "regional"
    ? REGIONAL_TRAIN_MARKER_REFRESH_MS
    : TTC_TRAIN_MARKER_REFRESH_MS;
  const parsed = Number(configured);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return minimum;
  }
  return Math.max(minimum, parsed);
}

export function estimatedTrainMarkerRenderKey(marker: EstimatedTrainMarker) {
  const tripId = normalizedMarkerText(marker.tripId);
  const vehicleId = normalizedMarkerText(marker.vehicleId);
  const trainIdentity = tripId && vehicleId
    ? `${tripId}:${vehicleId}`
    : tripId || vehicleId || normalizedMarkerText(marker.id) || "unknown-train";
  const direction = normalizedMarkerText(marker.direction).replace(/\s+/g, "-") || "unknown-direction";

  return `${marker.lineId}:${direction}:${trainIdentity}`;
}

export function resolveEstimatedTrainMarkerSegmentDirection(
  marker: Pick<EstimatedTrainMarker, "fromStationId" | "toStationId" | "nextStationId">,
  segment: EstimatedTrainMarkerSegment,
): EstimatedTrainMarkerSegmentDirection | null {
  if (!segment.stationAId || !segment.stationBId
    || !segment.stationAAnchorId || !segment.stationBAnchorId) return null;
  if (marker.toStationId !== marker.nextStationId) return null;
  if (marker.fromStationId === segment.stationAId && marker.nextStationId === segment.stationBId) {
    return {
      fromStationId: segment.stationAId,
      toStationId: segment.stationBId,
      fromAnchorId: segment.stationAAnchorId,
      toAnchorId: segment.stationBAnchorId,
    };
  }
  if (marker.fromStationId === segment.stationBId && marker.nextStationId === segment.stationAId) {
    return {
      fromStationId: segment.stationBId,
      toStationId: segment.stationAId,
      fromAnchorId: segment.stationBAnchorId,
      toAnchorId: segment.stationAAnchorId,
    };
  }
  return null;
}

export function orientedEstimatedTrainMarkerAngle(pathAngle: number, pathStartsAtFrom: boolean) {
  return pathStartsAtFrom ? pathAngle : pathAngle + 180;
}

function normalizedMarkerText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export async function getEstimatedTrainMarkers(
  options: EstimatedTrainFetchOptions = {},
): Promise<EstimatedTrainDataResult> {
  const fetcher = options.fetcher ?? fetch;

  try {
    const path = options.network === "regional" ? "/api/regional/trains" : "/api/trains";
    const response = await fetcher(apiUrl(path, options.apiBaseUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) {
      throw new Error(`Estimated train markers request failed with ${response.status}`);
    }
    return { source: "backend", data: (await response.json()) as EstimatedTrainSnapshot };
  } catch {
    return {
      source: "fallback",
      data: options.network === "regional" ? EMPTY_REGIONAL_TRAIN_SNAPSHOT : EMPTY_ESTIMATED_TRAIN_SNAPSHOT,
    };
  }
}
