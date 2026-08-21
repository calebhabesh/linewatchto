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

export type EstimatedTrainMarkerContinuityState = {
  markers: Map<string, { marker: EstimatedTrainMarker; lastSeenAt: number }>;
};

export type EstimatedTrainMarkerMotionSegment = {
  id: string;
  lineId: string;
  stationAId?: string;
  stationBId?: string;
};

export type EstimatedTrainMarkerMotionSample = {
  from: EstimatedTrainMarker;
  to: EstimatedTrainMarker;
  progress: number;
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
const TTC_TRAIN_MARKER_RETENTION_MS = 30_000;
const REGIONAL_TRAIN_MARKER_RETENTION_MS = 90_000;

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
  const trainIdentity = vehicleId
    ? `vehicle:${vehicleId}`
    : tripId
      ? `trip:${tripId}`
      : `marker:${normalizedMarkerText(marker.id) || "unknown-train"}`;
  const direction = normalizedMarkerText(marker.direction).replace(/\s+/g, "-") || "unknown-direction";

  return `${marker.lineId}:${direction}:${trainIdentity}`;
}

export function createEstimatedTrainMarkerContinuityState(): EstimatedTrainMarkerContinuityState {
  return { markers: new Map() };
}

export function reconcileEstimatedTrainSnapshot(
  state: EstimatedTrainMarkerContinuityState,
  incoming: EstimatedTrainSnapshot,
  network: "ttc" | "regional",
  now = Date.now(),
): EstimatedTrainSnapshot {
  if (incoming.availability === "disabled") {
    state.markers.clear();
    return incoming;
  }

  const retentionMs = network === "regional"
    ? REGIONAL_TRAIN_MARKER_RETENTION_MS
    : TTC_TRAIN_MARKER_RETENTION_MS;
  const currentKeys = new Set<string>();

  for (const marker of incoming.markers) {
    const key = estimatedTrainMarkerRenderKey(marker);
    const previous = state.markers.get(key);
    currentKeys.add(key);
    state.markers.set(key, {
      marker,
      // A non-fresh backend response can already contain a held marker. Do not
      // restart its browser retention window on every poll.
      lastSeenAt: incoming.fresh && markerObservationChanged(previous?.marker, marker)
        ? now
        : previous?.lastSeenAt ?? now,
    });
  }

  for (const [key, retained] of state.markers) {
    if (now - retained.lastSeenAt > retentionMs) {
      state.markers.delete(key);
    }
  }

  const retainedMarkers = [...state.markers.entries()]
    .filter(([key]) => !currentKeys.has(key))
    .map(([, retained]) => retained.marker);
  const markers = incoming.markers.concat(retainedMarkers);
  if (markers.length === incoming.markers.length) {
    return incoming;
  }

  return {
    ...incoming,
    availability: incoming.fresh ? incoming.availability : "stale",
    message: incoming.fresh
      ? `${incoming.message} Briefly holding ${retainedMarkers.length} last-seen marker${retainedMarkers.length === 1 ? "" : "s"} through a feed gap.`
      : `${incoming.message} Last-seen marker positions remain briefly visible while the source recovers.`,
    markers,
  };
}

export function estimatedTrainMarkerMotionWaypoints(
  previous: EstimatedTrainMarker,
  target: EstimatedTrainMarker,
  segments: EstimatedTrainMarkerMotionSegment[],
): EstimatedTrainMarker[] {
  if (previous.lineId !== target.lineId) return [previous, target];
  if (sameMarkerSegment(previous, target)) return [previous, target];

  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const previousSegment = segmentById.get(previous.segmentId);
  const targetSegment = segmentById.get(target.segmentId);
  if (!previousSegment || !targetSegment) return [previous, target];

  const waypoints: EstimatedTrainMarker[] = [previous, { ...previous, progress: 1 }];
  const middle = markerSegmentRoute(
    previous.toStationId,
    target.fromStationId,
    target.lineId,
    segments,
    new Set([previous.segmentId, target.segmentId]),
  );
  if (middle === null) return [previous, target];

  let fromStationId = previous.toStationId;
  for (const segment of middle) {
    const toStationId = segment.stationAId === fromStationId
      ? segment.stationBId
      : segment.stationAId;
    if (!toStationId || !segment.stationAId || !segment.stationBId) return [previous, target];
    const travelDirection = segment.stationAId === fromStationId ? "forward" : "reverse";
    const marker = {
      ...target,
      id: `${target.id}:motion:${segment.id}`,
      segmentId: segment.id,
      fromStationId,
      toStationId,
      nextStationId: toStationId,
      travelDirection,
      progress: 0,
      segmentTravelSeconds: Math.max(previous.segmentTravelSeconds, target.segmentTravelSeconds),
    } satisfies EstimatedTrainMarker;
    waypoints.push(marker, { ...marker, progress: 1 });
    fromStationId = toStationId;
  }
  waypoints.push({ ...target, progress: 0 }, target);
  return deduplicatedMotionWaypoints(waypoints);
}

export function estimatedTrainMarkerMotionDurationMs(waypoints: EstimatedTrainMarker[]) {
  const weightedSeconds = motionLegs(waypoints)
    .reduce((total, leg) => total + leg.weight, 0);
  const first = waypoints[0];
  const last = waypoints.at(-1);
  const sourceCadence = first && last
    ? Math.max(0, markerTimestamp(last) - markerTimestamp(first)) * 0.9
    : 0;
  return Math.max(650, Math.min(14_000, Math.max(weightedSeconds * 80, sourceCadence)));
}

export function sampleEstimatedTrainMarkerMotion(
  waypoints: EstimatedTrainMarker[],
  progress: number,
): EstimatedTrainMarkerMotionSample {
  const legs = motionLegs(waypoints);
  if (legs.length === 0) {
    const marker = waypoints.at(-1) ?? EMPTY_MARKER_FOR_MOTION;
    return { from: marker, to: marker, progress: 1 };
  }
  const totalWeight = legs.reduce((total, leg) => total + leg.weight, 0);
  let remaining = Math.max(0, Math.min(1, progress)) * totalWeight;
  for (const leg of legs) {
    if (remaining <= leg.weight) {
      return { from: leg.from, to: leg.to, progress: leg.weight === 0 ? 1 : remaining / leg.weight };
    }
    remaining -= leg.weight;
  }
  const last = legs.at(-1)!;
  return { from: last.from, to: last.to, progress: 1 };
}

export function interpolatedEstimatedTrainMarkerAngle(from: number, to: number, progress: number) {
  const delta = ((to - from + 540) % 360) - 180;
  return from + delta * Math.max(0, Math.min(1, progress));
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

function markerTimestamp(marker: EstimatedTrainMarker) {
  const parsed = Date.parse(marker.updatedAt ?? marker.feedCreatedAt ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function markerObservationChanged(
  previous: EstimatedTrainMarker | undefined,
  current: EstimatedTrainMarker,
) {
  return !previous
    || previous.updatedAt !== current.updatedAt
    || previous.feedCreatedAt !== current.feedCreatedAt
    || previous.segmentId !== current.segmentId
    || previous.progress !== current.progress
    || previous.predictedAt !== current.predictedAt;
}

function sameMarkerSegment(left: EstimatedTrainMarker, right: EstimatedTrainMarker) {
  return left.segmentId === right.segmentId
    && left.fromStationId === right.fromStationId
    && left.toStationId === right.toStationId;
}

function markerSegmentRoute(
  startStationId: string,
  endStationId: string,
  lineId: string,
  segments: EstimatedTrainMarkerMotionSegment[],
  excludedSegmentIds: Set<string>,
): EstimatedTrainMarkerMotionSegment[] | null {
  if (startStationId === endStationId) return [];
  const candidates = segments.filter((segment) => segment.lineId === lineId
    && segment.stationAId && segment.stationBId && !excludedSegmentIds.has(segment.id));
  const queue: Array<{ stationId: string; route: EstimatedTrainMarkerMotionSegment[] }> = [
    { stationId: startStationId, route: [] },
  ];
  const visited = new Set([startStationId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const segment of candidates) {
      const nextStationId = segment.stationAId === current.stationId
        ? segment.stationBId
        : segment.stationBId === current.stationId
          ? segment.stationAId
          : undefined;
      if (!nextStationId || visited.has(nextStationId)) continue;
      const route = current.route.concat(segment);
      if (nextStationId === endStationId) return route;
      visited.add(nextStationId);
      queue.push({ stationId: nextStationId, route });
    }
  }
  return null;
}

function deduplicatedMotionWaypoints(waypoints: EstimatedTrainMarker[]) {
  return waypoints.filter((marker, index) => {
    const previous = waypoints[index - 1];
    return !previous || previous.segmentId !== marker.segmentId || previous.progress !== marker.progress;
  });
}

function motionLegs(waypoints: EstimatedTrainMarker[]) {
  return waypoints.slice(1).map((to, index) => {
    const from = waypoints[index];
    const sameSegment = sameMarkerSegment(from, to);
    const segmentSeconds = Math.max(1, to.segmentTravelSeconds || from.segmentTravelSeconds || 1);
    return {
      from,
      to,
      weight: sameSegment
        ? Math.max(0.25, Math.abs(to.progress - from.progress) * segmentSeconds)
        : Math.max(1, Math.min(8, segmentSeconds * 0.03)),
    };
  });
}

const EMPTY_MARKER_FOR_MOTION: EstimatedTrainMarker = {
  id: "empty",
  lineId: "unknown",
  direction: "",
  travelDirection: "bidirectional",
  segmentId: "",
  fromStationId: "",
  toStationId: "",
  nextStationId: "",
  progress: 0,
  segmentTravelSeconds: 1,
  predictedAt: "",
};

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
