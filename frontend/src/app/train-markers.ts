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
};

export const EMPTY_ESTIMATED_TRAIN_SNAPSHOT: EstimatedTrainSnapshot = {
  fresh: false,
  source: "TTC GTFS-RT subway trip updates",
  message: "Estimated train markers are unavailable.",
  disclaimer: "Estimated train markers are schematic placements inferred from TTC GTFS-RT trip updates and LineWatchTO topology. They are not physical train positions.",
  feedCreatedAt: null,
  generatedAt: null,
  markers: [],
};

const DEFAULT_TRAIN_MARKER_REFRESH_MS = 1_000;
const MIN_TRAIN_MARKER_REFRESH_MS = 1_000;

export function estimatedTrainMarkerRefreshMs(configured = process.env.NEXT_PUBLIC_LINEWATCH_TRAIN_MARKER_REFRESH_MS) {
  const parsed = Number(configured);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TRAIN_MARKER_REFRESH_MS;
  }
  return Math.max(MIN_TRAIN_MARKER_REFRESH_MS, parsed);
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

function normalizedMarkerText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export async function getEstimatedTrainMarkers(
  options: EstimatedTrainFetchOptions = {},
): Promise<EstimatedTrainDataResult> {
  const fetcher = options.fetcher ?? fetch;

  try {
    const response = await fetcher(apiUrl("/api/trains", options.apiBaseUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) {
      throw new Error(`Estimated train markers request failed with ${response.status}`);
    }
    return { source: "backend", data: (await response.json()) as EstimatedTrainSnapshot };
  } catch {
    return { source: "fallback", data: EMPTY_ESTIMATED_TRAIN_SNAPSHOT };
  }
}
