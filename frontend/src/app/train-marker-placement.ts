/*
 * Where every System Map draws an estimated train marker: one pure placement
 * over the segment's drawn path, with the map's data (its overlay unit, its
 * marker size, how it draws a segment) and the network's line labels.
 * Markers are schematic placements, never live positions; nothing here reads
 * the DOM.
 */
import type { NetworkSegment } from "./linewatch-data.ts";
import { pointAlongPolyline, polylineLength, type MapPoint } from "./map-geometry.ts";
import {
  estimatedTrainMarkerLanePoint,
  resolveEstimatedTrainMarkerSegmentDirection,
  type EstimatedTrainMarker,
} from "./train-markers.ts";
import type { MapTrainMarkerFrame, MapTrainMarkerPlacement } from "../components/map-overlays/TrainMarkerLayer.tsx";

/** How far a marker sits beside its line, toward its side of travel, in overlay units (TTC units). */
export const TRAIN_MARKER_LANE_OFFSET = 20;

/** Which way a marker moves along its segment's drawn path (A to B), for its lane and heading. */
export function trainMarkerPathDirection(
  marker: EstimatedTrainMarker,
  segment: NetworkSegment,
): EstimatedTrainMarker["travelDirection"] {
  // The stations it travels between decide; a marker that doesn't name its
  // segment's ends goes by its travel direction (forward is A to B).
  const resolved = resolveEstimatedTrainMarkerSegmentDirection(marker, segment);
  const fromA = resolved ? resolved.fromStationId === segment.stationAId : marker.travelDirection !== "reverse";
  if (marker.travelDirection === "bidirectional") return "bidirectional";
  return fromA ? "forward" : "reverse";
}

/**
 * A marker on its segment's drawn path (`points`, from station A to B): its
 * progress from the station it left, `TRAIN_MARKER_LANE_OFFSET` overlay
 * units beside the line on its side of travel, heading its way. Null when
 * the path has no length.
 */
export function trainMarkerFrame(
  points: MapPoint[],
  segment: NetworkSegment,
  marker: EstimatedTrainMarker,
  unit: number,
): MapTrainMarkerFrame | null {
  const length = points.length > 1 ? polylineLength(points) : 0;
  if (!(length > 0)) return null;
  const resolved = resolveEstimatedTrainMarkerSegmentDirection(marker, segment);
  const fromA = resolved ? resolved.fromStationId === segment.stationAId : marker.travelDirection !== "reverse";
  const progress = Math.max(0, Math.min(1, marker.progress));
  const distance = length * (fromA ? progress : 1 - progress);
  const point = pointAlongPolyline(points, distance);
  const delta = Math.min(12 * unit, Math.max(unit, length * 0.015));
  const before = pointAlongPolyline(points, Math.max(0, distance - delta));
  const after = pointAlongPolyline(points, Math.min(length, distance + delta));
  const tangent = { x: after.x - before.x, y: after.y - before.y };
  const angle = Math.atan2(tangent.y, tangent.x) * 180 / Math.PI;
  return {
    point: estimatedTrainMarkerLanePoint(point, tangent, trainMarkerPathDirection(marker, segment), TRAIN_MARKER_LANE_OFFSET * unit),
    angle: fromA ? angle : angle + 180,
  };
}

/** A marker's accessible title: its line, direction and next station, and that it is an estimate. */
export function trainMarkerLabel(marker: EstimatedTrainMarker, lineLabel: string, stationName?: string): string {
  return `${lineLabel} ${marker.direction} train near ${stationName ?? marker.nextStationId}; schematic estimated position`;
}

/** A map's train-marker placement from its data and its network's line labels. */
export function mapTrainMarkerPlacement(data: {
  /** The map's overlay unit (manifest `overlayUnit`). */
  unit: number;
  /** How much larger than TTC's the map draws its markers. */
  scale: number;
  /** A segment's drawn path as points, from station A to B; null when the map can't draw it. */
  path: (segment: NetworkSegment) => MapPoint[] | null;
  /** The network's short name for a line ("Line 1", "LW"). */
  lineLabel: (lineId: string) => string;
}): MapTrainMarkerPlacement {
  return {
    frame(marker, segmentById) {
      const segment = segmentById.get(marker.segmentId);
      const points = segment ? data.path(segment) : null;
      return segment && points ? trainMarkerFrame(points, segment, marker, data.unit) : null;
    },
    travelDirection(marker, segmentById) {
      const segment = segmentById.get(marker.segmentId);
      return segment ? trainMarkerPathDirection(marker, segment) : marker.travelDirection;
    },
    label: (marker, stationName) => trainMarkerLabel(marker, data.lineLabel(marker.lineId), stationName(marker.nextStationId)),
    scale: data.scale,
  };
}
