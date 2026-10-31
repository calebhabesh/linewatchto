/*
 * TTC geometry from the prepared map data (map-geometry-data.ts): segment
 * anchors and guides and station centres, in the root
 * SVG's coordinates. Nothing here reads the DOM.
 */
import { pointsToPath, trackGuideKey, type MapPoint } from "./map-geometry.ts";
import { preparedPoints, type PreparedMapGeometry } from "./map-geometry-data.ts";

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
