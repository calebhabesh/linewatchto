/*
 * GO/UP geometry from the prepared map data (map-geometry-data.ts): station
 * dots, segment corridors along the authored routes, train-marker frames,
 * badge anchors and station-name boxes. Everything is in the root SVG's
 * coordinates, where GO/UP's overlays are drawn, and nothing reads the DOM.
 */
import type { NetworkSegment } from "./linewatch-data.ts";
import {
  pointAlongPolyline,
  pointsToPath,
  polylineLength,
  polylineStretch,
  projectOntoPolyline,
  type MapBounds,
  type MapPoint,
} from "./map-geometry.ts";
import {
  preparedPoints,
  type PreparedMapGeometry,
  type PreparedStation,
} from "./map-geometry-data.ts";
import {
  estimatedTrainMarkerLanePoint,
  orientedEstimatedTrainMarkerAngle,
  resolveEstimatedTrainMarkerSegmentDirection,
  type EstimatedTrainMarker,
} from "./train-markers.ts";

export type RegionalStationVisualAnchor = {
  id: string;
  point: MapPoint;
  radius: number;
};

export type RegionalTrainMarkerFrame = {
  point: MapPoint;
  angle: number;
};

export type RegionalOverlapBadgePlacement = {
  anchor: MapPoint;
  position: MapPoint;
};

export type RegionalBadgeSize = {
  width: number;
  height: number;
};

export type RegionalCollisionBox = MapBounds;

export const REGIONAL_MAP_VIEWBOX: MapBounds = {
  x: -200,
  y: -200,
  width: 17036.959,
  height: 9031.6719,
};

export const REGIONAL_IMPACT_OVERLAY_WIDTH = 196;
/**
 * GO/UP draws the shared overlay design (components/map-overlays) at its alert
 * rail's width; 96 is TTC's rail, the design's unit (MAP_ALERT_RAIL_WIDTH).
 */
export const REGIONAL_OVERLAY_UNIT = REGIONAL_IMPACT_OVERLAY_WIDTH / 96;
export const REGIONAL_OVERLAP_INDICATOR_SCALE = 2;
export const REGIONAL_OVERLAP_INDICATOR_EDGE_GAP = 88;
export const REGIONAL_TRAIN_MARKER_LANE_OFFSET = 44;

export function squaredPointDistance(a: MapPoint, b: MapPoint): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}


/** An SVG `transform` value for a prepared [a, b, c, d, e, f] matrix. */
export function matrixTransform(matrix: readonly number[]): string {
  return `matrix(${matrix.join(" ")})`;
}

type RegionalLookup = {
  stations: Map<string, PreparedStation>;
  shapes: Map<string, { station: PreparedStation; index: number }>;
  routes: Map<string, MapPoint[]>;
  corridors: Map<string, MapPoint[] | null>;
};

const lookups = new WeakMap<PreparedMapGeometry, RegionalLookup>();

function lookup(geometry: PreparedMapGeometry): RegionalLookup {
  let cached = lookups.get(geometry);
  if (!cached) {
    const shapes = new Map<string, { station: PreparedStation; index: number }>();
    for (const station of geometry.stations) {
      station.shapes.forEach((shape, index) => shapes.set(shape.id, { station, index }));
    }
    cached = {
      stations: new Map(geometry.stations.map((station) => [station.id, station])),
      shapes,
      routes: new Map(geometry.lines.map((line) => [line.id, preparedPoints(line.points)])),
      corridors: new Map(),
    };
    lookups.set(geometry, cached);
  }
  return cached;
}

/** The station drawn for `stationId` (`union`, not `station-union`). */
export function regionalStation(geometry: PreparedMapGeometry, stationId: string): PreparedStation | null {
  return lookup(geometry).stations.get(`station-${stationId}`) ?? null;
}

/** A segment endpoint: the centre of its station element. */
export function regionalAnchorPoint(geometry: PreparedMapGeometry, anchorId: string | undefined): MapPoint | null {
  return anchorId ? geometry.anchors[anchorId] ?? null : null;
}

/** A station's dots (not junction bars). */
export function regionalStationVisualAnchors(station: PreparedStation): RegionalStationVisualAnchor[] {
  return station.anchors.map(({ id, x, y, radius }) => ({ id, point: { x, y }, radius }));
}

/** The dots an alert on `lineId` sits on: that line's platform where a station has one per line. */
export function regionalStationImpactAnchors(
  station: PreparedStation,
  lineId: string | null | undefined,
): RegionalStationVisualAnchor[] {
  const anchors = regionalStationVisualAnchors(station);
  const routeCode = lineId
    ? lineId.replace("regional-", "").toLowerCase()
    : null;
  if (!routeCode) return anchors;
  const matching = anchors.filter((anchor) => anchor.id.endsWith(`-${routeCode}`));
  return matching.length > 0 ? matching : anchors;
}

/** The dot a segment anchor names (Bloor's KI dot), or a junction group's first dot. */
export function regionalAnchorDot(geometry: PreparedMapGeometry, anchorId: string): RegionalStationVisualAnchor | null {
  const { shapes, stations } = lookup(geometry);
  const owner = shapes.get(anchorId)?.station;
  const dot = owner?.anchors.find((anchor) => anchor.id === anchorId) ?? stations.get(anchorId)?.anchors[0];
  return dot ? { id: dot.id, point: { x: dot.x, y: dot.y }, radius: dot.radius } : null;
}

/** Every station dot on the map. */
export function regionalStationDots(geometry: PreparedMapGeometry): RegionalStationVisualAnchor[] {
  return geometry.stations.flatMap(regionalStationVisualAnchors);
}

/**
 * A pill-shaped dot (Union) with its authored outline, or undefined for round
 * dots.
 */
export function regionalStationPillShape(geometry: PreparedMapGeometry, anchorId: string) {
  const found = lookup(geometry).shapes.get(anchorId);
  const shape = found?.station.shapes[found.index];
  if (!found || shape?.tag !== "rect" || shape.join || shape.transform) return undefined;
  return { shape, matrix: found.station.transform };
}

export function regionalRoutePathIds(lineId: string): string[] {
  const routeCode = lineId.replace(/^regional-|^line-/, "").toLowerCase();
  if (routeCode === "lw") {
    return ["regional-route-lw-main-path", "regional-route-lw-branch-path"];
  }
  if (routeCode === "up") {
    return ["regional-route-up-path", "regional-route-up-airport-path"];
  }
  return [`regional-route-${routeCode}-path`];
}

function routePolylines(geometry: PreparedMapGeometry, lineId: string): MapPoint[][] {
  const { routes } = lookup(geometry);
  return regionalRoutePathIds(lineId)
    .map((pathId) => routes.get(pathId))
    .filter((points): points is MapPoint[] => Boolean(points && points.length > 1));
}

function segmentCorridorPoints(geometry: PreparedMapGeometry, segment: NetworkSegment): MapPoint[] | null {
  const start = regionalAnchorPoint(geometry, segment.stationAAnchorId);
  const end = regionalAnchorPoint(geometry, segment.stationBAnchorId);
  if (!start || !end) return null;
  const routes = routePolylines(geometry, segment.lineId);
  if (routes.length === 0) return null;

  const startProjections = routes.map((route) => projectOntoPolyline(route, start));
  const endProjections = routes.map((route) => projectOntoPolyline(route, end));
  const nearest = (projections: { gap: number }[]) => projections.reduce(
    (best, projection, index) => (projection.gap < projections[best].gap ? index : best),
    0,
  );
  const startIndex = nearest(startProjections);
  const endIndex = nearest(endProjections);

  if (startIndex === endIndex) {
    return polylineStretch(routes[startIndex], startProjections[startIndex].along, endProjections[endIndex].along);
  }

  // Split corridor artwork (currently Lakeshore West) is treated as one route
  // graph. Join paths only at the authored LW branch junction so all three
  // pairwise-adjacent Aldershot/West Harbour/Hamilton links follow the shared
  // T-shaped rail geometry instead of drawing station-centre chords.
  const startRoute = routes[startIndex];
  const endRoute = routes[endIndex];
  const connection = [0, polylineLength(endRoute)]
    .map((endAlong) => {
      const endPoint = pointAlongPolyline(endRoute, endAlong);
      const projection = projectOntoPolyline(startRoute, endPoint);
      return { startAlong: projection.along, endAlong, gap: projection.gap };
    })
    .reduce((best, candidate) => (candidate.gap < best.gap ? candidate : best));
  if (connection.gap > 2) return null;
  const first = polylineStretch(startRoute, startProjections[startIndex].along, connection.startAlong);
  const second = polylineStretch(endRoute, connection.endAlong, endProjections[endIndex].along);
  return [...first, ...second.slice(1)];
}

function cachedSegmentCorridorPoints(geometry: PreparedMapGeometry, segment: NetworkSegment): MapPoint[] | null {
  const { corridors } = lookup(geometry);
  const key = [segment.lineId, segment.stationAAnchorId, segment.stationBAnchorId].join("|");
  if (!corridors.has(key)) corridors.set(key, segmentCorridorPoints(geometry, segment));
  return corridors.get(key) ?? null;
}

/** A segment's path along its authored route, from station A to station B. */
export function corridorSegmentPath(geometry: PreparedMapGeometry, segment: NetworkSegment): string | null {
  const points = cachedSegmentCorridorPoints(geometry, segment);
  return points && points.length > 1 ? pointsToPath(points) : null;
}

function segmentPoints(geometry: PreparedMapGeometry, segment: NetworkSegment): MapPoint[] | null {
  const guide = segment.guidePathId ? geometry.guides?.[segment.guidePathId] : undefined;
  if (guide) return preparedPoints(guide);
  const corridor = cachedSegmentCorridorPoints(geometry, segment);
  if (corridor && corridor.length > 1) return corridor;
  const start = regionalAnchorPoint(geometry, segment.stationAAnchorId);
  const end = regionalAnchorPoint(geometry, segment.stationBAnchorId);
  return start && end ? [start, end] : null;
}

/** A segment's path: its authored guide, else its route corridor, else the chord between its stations. */
export function resolvedRegionalSegmentPath(geometry: PreparedMapGeometry, segment: NetworkSegment): string | null {
  const points = segmentPoints(geometry, segment);
  return points ? pointsToPath(points) : null;
}

/** A line's whole authored route, one subpath per route path. */
export function authoredRegionalCorridorPathData(geometry: PreparedMapGeometry, lineId: string): string | null {
  const paths = routePolylines(geometry, lineId).map(pointsToPath);
  return paths.length > 0 ? paths.join(" ") : null;
}

export function continuousRegionalOverlayRunPath(
  geometry: PreparedMapGeometry,
  run: { segments: NetworkSegment[]; pathD: string },
): string | null {
  if (run.segments.length === 1) return run.pathD;

  const stationDegree = new Map<string, number>();
  for (const segment of run.segments) {
    if (!segment.stationAId || !segment.stationBId) return null;
    stationDegree.set(segment.stationAId, (stationDegree.get(segment.stationAId) ?? 0) + 1);
    stationDegree.set(segment.stationBId, (stationDegree.get(segment.stationBId) ?? 0) + 1);
  }
  // A linear run has exactly two endpoints. Branches and cycles retain their
  // reviewed edge subpaths because no single SVG path can represent them
  // without retracing or inventing geometry.
  const endpointIds = [...stationDegree.entries()]
    .filter(([, degree]) => degree === 1)
    .map(([stationId]) => stationId);
  if (endpointIds.length !== 2 || [...stationDegree.values()].some((degree) => degree > 2)) {
    return null;
  }

  const endpointAnchor = (stationId: string) => {
    const segment = run.segments.find((candidate) => (
      candidate.stationAId === stationId || candidate.stationBId === stationId
    ));
    if (!segment) return null;
    return segment.stationAId === stationId
      ? segment.stationAAnchorId ?? null
      : segment.stationBAnchorId ?? null;
  };
  const stationAAnchorId = endpointAnchor(endpointIds[0]);
  const stationBAnchorId = endpointAnchor(endpointIds[1]);
  if (!stationAAnchorId || !stationBAnchorId) return null;

  return corridorSegmentPath(geometry, {
    ...run.segments[0],
    stationAId: endpointIds[0],
    stationBId: endpointIds[1],
    stationAAnchorId,
    stationBAnchorId,
    guidePathId: undefined,
  });
}

export function regionalTrainMarkerFrame(
  geometry: PreparedMapGeometry,
  segment: NetworkSegment,
  marker: EstimatedTrainMarker,
): RegionalTrainMarkerFrame | null {
  // Train markers must use authored corridor geometry. A straight anchor-to-anchor
  // fallback can visibly leave a bent track, so omit an unresolvable marker instead.
  const points = cachedSegmentCorridorPoints(geometry, segment);
  const direction = resolveEstimatedTrainMarkerSegmentDirection(marker, segment);
  if (!direction || !points || points.length < 2) return null;
  const from = regionalAnchorPoint(geometry, direction.fromAnchorId);
  const length = polylineLength(points);
  if (!from || !(length > 0)) return null;

  const pathStartsAtFrom = squaredPointDistance(points[0], from)
    <= squaredPointDistance(points[points.length - 1], from);
  const progress = Math.max(0, Math.min(1, marker.progress));
  const distance = length * (pathStartsAtFrom ? progress : 1 - progress);
  const point = pointAlongPolyline(points, distance);
  const delta = Math.min(24, Math.max(2, length * 0.015));
  const before = pointAlongPolyline(points, Math.max(0, distance - delta));
  const after = pointAlongPolyline(points, Math.min(length, distance + delta));
  const tangent = { x: after.x - before.x, y: after.y - before.y };
  const pathAngle = Math.atan2(tangent.y, tangent.x) * 180 / Math.PI;
  const pathTravelDirection = marker.travelDirection === "bidirectional"
    ? "bidirectional"
    : pathStartsAtFrom ? "forward" : "reverse";
  return {
    point: estimatedTrainMarkerLanePoint(point, tangent, pathTravelDirection, REGIONAL_TRAIN_MARKER_LANE_OFFSET),
    angle: orientedEstimatedTrainMarkerAngle(pathAngle, pathStartsAtFrom),
  };
}

const MAP_CENTER = {
  x: REGIONAL_MAP_VIEWBOX.x + REGIONAL_MAP_VIEWBOX.width / 2,
  y: REGIONAL_MAP_VIEWBOX.y + REGIONAL_MAP_VIEWBOX.height / 2,
};

/**
 * Where a segment's overlap badge starts: beside the middle of the segment,
 * on the side toward the map's centre.
 */
export function regionalOverlapBadgeAnchor(
  geometry: PreparedMapGeometry,
  segment: NetworkSegment,
  size: RegionalBadgeSize,
): RegionalOverlapBadgePlacement | null {
  const points = segmentPoints(geometry, segment);
  if (!points) return null;
  const length = polylineLength(points);
  if (length > 0) {
    const midpoint = pointAlongPolyline(points, length / 2);
    const before = pointAlongPolyline(points, Math.max(0, length / 2 - 5));
    const after = pointAlongPolyline(points, Math.min(length, length / 2 + 5));
    const tangentLength = Math.hypot(after.x - before.x, after.y - before.y) || 1;
    const normal = {
      x: -(after.y - before.y) / tangentLength,
      y: (after.x - before.x) / tangentLength,
    };
    const renderedBadgeHalfExtent = (
      Math.abs(normal.x) * size.width / 2
      + Math.abs(normal.y) * size.height / 2
    ) * REGIONAL_OVERLAP_INDICATOR_SCALE;
    const offset = REGIONAL_IMPACT_OVERLAY_WIDTH / 2
      + renderedBadgeHalfExtent
      + REGIONAL_OVERLAP_INDICATOR_EDGE_GAP;
    const position = [1, -1]
      .map((direction) => ({
        x: midpoint.x + normal.x * offset * direction,
        y: midpoint.y + normal.y * offset * direction,
      }))
      .sort((left, right) => squaredPointDistance(left, MAP_CENTER) - squaredPointDistance(right, MAP_CENTER))[0];
    return { anchor: midpoint, position };
  }
  const midpoint = points[0];
  const distanceToCenter = Math.hypot(MAP_CENTER.x - midpoint.x, MAP_CENTER.y - midpoint.y) || 1;
  const offset = REGIONAL_IMPACT_OVERLAY_WIDTH / 2
    + Math.max(size.width, size.height) * REGIONAL_OVERLAP_INDICATOR_SCALE / 2
    + REGIONAL_OVERLAP_INDICATOR_EDGE_GAP;
  return {
    anchor: midpoint,
    position: {
      x: midpoint.x + (MAP_CENTER.x - midpoint.x) / distanceToCenter * offset,
      y: midpoint.y + (MAP_CENTER.y - midpoint.y) / distanceToCenter * offset,
    },
  };
}

export function expandedRegionalCollisionBox(
  box: RegionalCollisionBox,
  padding: number | { leading?: number; trailing?: number; top?: number; bottom?: number; x?: number; y?: number },
): RegionalCollisionBox {
  const padLeading = typeof padding === "number" ? padding : (padding.leading ?? padding.x ?? 0);
  const padTrailing = typeof padding === "number" ? padding : (padding.trailing ?? padding.x ?? 0);
  const padTop = typeof padding === "number" ? padding : (padding.top ?? padding.y ?? 0);
  const padBottom = typeof padding === "number" ? padding : (padding.bottom ?? padding.y ?? 0);
  return {
    x: box.x - padLeading,
    y: box.y - padTop,
    width: box.width + padLeading + padTrailing,
    height: box.height + padTop + padBottom,
  };
}

export function regionalCollisionIntersectionArea(
  left: RegionalCollisionBox,
  right: RegionalCollisionBox,
): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  );
  return width * height;
}
