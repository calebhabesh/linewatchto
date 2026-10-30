/*
 * TTC geometry from the prepared map data (map-geometry-data.ts): segment
 * anchors and guides, station centres and station-name boxes, in the root
 * SVG's coordinates. Nothing here reads the DOM.
 */
import { pointsToPath, trackGuideKey, type MapPoint, type MapPolygon } from "./map-geometry.ts";
import {
  preparedPoints,
  stationLabelPolygon,
  type PreparedMapGeometry,
} from "./map-geometry-data.ts";

/** Room around a TTC station name for its hover lift and target. */
const TTC_STATION_LABEL_PADDING = { leading: 0, trailing: 68, y: 8 };

/** Every station element's centre, by element id: segment endpoints. */
export function ttcAnchorPoints(geometry: PreparedMapGeometry): Map<string, MapPoint> {
  return new Map(Object.entries(geometry.anchors));
}

/**
 * Non-linear segment guides by label, and each line's authored track under
 * `trackGuideKey(lineId)`, as root-coordinate paths.
 */
export function ttcGuidePaths(geometry: PreparedMapGeometry): Map<string, string> {
  const guides = new Map<string, string>();
  for (const [label, points] of Object.entries(geometry.guides ?? {})) {
    guides.set(label, pointsToPath(preparedPoints(points)));
  }
  for (const line of geometry.lines) {
    guides.set(trackGuideKey(line.id), pointsToPath(preparedPoints(line.points)));
  }
  return guides;
}

/** Each station dot's centre (`station-{id}`), for the ids asked for. */
export function ttcStationCenters(geometry: PreparedMapGeometry, stationIds: readonly string[]): Map<string, MapPoint> {
  return new Map(stationIds.flatMap((stationId) => {
    const point = geometry.anchors[`station-${stationId}`];
    return point ? [[stationId, point] as const] : [];
  }));
}

/** Each station name's hover and target box, for the stations asked for. */
export function ttcStationLabelPolygons(
  geometry: PreparedMapGeometry,
  stationIds: readonly string[],
): Map<string, MapPolygon> {
  return new Map(stationIds.flatMap((stationId) => {
    const polygon = stationLabelPolygon(geometry.labels, stationId, TTC_STATION_LABEL_PADDING);
    return polygon ? [[stationId, polygon as MapPolygon] as const] : [];
  }));
}
