import type { NetworkSegment } from "./linewatch-data.ts";
import {
  type MapBounds,
  type MapPoint,
  svgElementMatrixToRootCoordinates,
  transformBoundsToRootCoordinates,
  transformPoint,
} from "./map-geometry.ts";
import { SVG_NAMESPACE, removeDescendantIds } from "./regional-map-asset.ts";
import {
  estimatedTrainMarkerLanePoint,
  orientedEstimatedTrainMarkerAngle,
  resolveEstimatedTrainMarkerSegmentDirection,
  type EstimatedTrainMarker,
} from "./train-markers.ts";

export type RegionalCoordinateSpace = "station-layer" | "root";

export type RegionalStationVisualAnchor = {
  id: string;
  point: MapPoint;
  radius: number;
};

export type RegionalRouteMetric = {
  path: SVGPathElement;
  length: number;
  pointAt: (distance: number) => MapPoint;
};

export type RegionalTrainMarkerFrame = {
  point: MapPoint;
  angle: number;
};

export type RegionalStationLabelHoverResult = {
  stationId: string;
  polygonPoints: string;
  center: MapPoint;
  bounds: MapBounds;
  cutoutMarkup: string;
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
export const REGIONAL_OVERLAP_INDICATOR_SCALE = 2;
export const REGIONAL_OVERLAP_INDICATOR_EDGE_GAP = 88;
export const REGIONAL_STATION_IMPACT_EFFECT_RADIUS_RATIO = 0.9;
export const REGIONAL_STATION_IMPACT_BADGE_RADIUS_RATIO = 0.72;
export const REGIONAL_TRAIN_MARKER_LANE_OFFSET = 44;

export function squaredPointDistance(a: MapPoint, b: MapPoint): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

export function applySvgTransform(point: MapPoint, transform: string | null): MapPoint {
  if (!transform) return point;
  let next = point;
  for (const match of transform.matchAll(/([a-zA-Z]+)\(([^)]*)\)/g)) {
    const operation = match[1];
    const values = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (operation === "translate") {
      next = { x: next.x + (values[0] ?? 0), y: next.y + (values[1] ?? 0) };
    } else if (operation === "scale") {
      next = { x: next.x * (values[0] ?? 1), y: next.y * (values[1] ?? values[0] ?? 1) };
    } else if (operation === "rotate") {
      const radians = ((values[0] ?? 0) * Math.PI) / 180;
      const centerX = values[1] ?? 0;
      const centerY = values[2] ?? 0;
      const offsetX = next.x - centerX;
      const offsetY = next.y - centerY;
      next = {
        x: centerX + Math.cos(radians) * offsetX - Math.sin(radians) * offsetY,
        y: centerY + Math.sin(radians) * offsetX + Math.cos(radians) * offsetY,
      };
    } else if (operation === "matrix" && values.length >= 6) {
      const [a, b, c, d, e, f] = values;
      next = { x: a * next.x + c * next.y + e, y: b * next.x + d * next.y + f };
    }
  }
  return next;
}

export function pointInRegionalStationsLayer(element: SVGElement, point: MapPoint): MapPoint {
  let next = point;
  let current: SVGElement | null = element;
  while (current && current.id !== "regional-stations-layer") {
    next = applySvgTransform(next, current.getAttribute("transform"));
    current = current.parentElement as SVGElement | null;
  }
  return next;
}

export function pointInSvgRootCoordinates(element: SVGElement, point: MapPoint): MapPoint {
  let next = point;
  let current: SVGElement | null = element;
  while (current && current.tagName.toLowerCase() !== "svg") {
    next = applySvgTransform(next, current.getAttribute("transform"));
    current = current.parentElement as SVGElement | null;
  }
  return next;
}

export function pointFromSvgRootCoordinates(element: SVGElement, point: MapPoint): MapPoint | null {
  const origin = pointInSvgRootCoordinates(element, { x: 0, y: 0 });
  const xBasis = pointInSvgRootCoordinates(element, { x: 1, y: 0 });
  const yBasis = pointInSvgRootCoordinates(element, { x: 0, y: 1 });
  const a = xBasis.x - origin.x;
  const b = xBasis.y - origin.y;
  const c = yBasis.x - origin.x;
  const d = yBasis.y - origin.y;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-9) return null;
  const offsetX = point.x - origin.x;
  const offsetY = point.y - origin.y;
  return {
    x: (d * offsetX - c * offsetY) / determinant,
    y: (-b * offsetX + a * offsetY) / determinant,
  };
}

export function pointInRegionalStationsCoordinates(
  point: MapPoint,
  source: SVGElement,
  stationsLayer: SVGElement,
): MapPoint | null {
  return pointFromSvgRootCoordinates(
    stationsLayer,
    pointInSvgRootCoordinates(source, point),
  );
}

export function readRegionalStationAnchorPoint(
  documentNode: Document,
  anchorId: string | undefined,
  space: RegionalCoordinateSpace = "station-layer",
): MapPoint | null {
  if (!anchorId) return null;
  const anchor = documentNode.getElementById(anchorId) as SVGElement | null;
  if (!anchor) return null;
  let localCenter: MapPoint | null = null;
  if (anchor.matches("circle, ellipse")) {
    localCenter = {
      x: Number(anchor.getAttribute("cx") ?? 0),
      y: Number(anchor.getAttribute("cy") ?? 0),
    };
  } else if (anchor.tagName.toLowerCase() === "rect") {
    const x = Number(anchor.getAttribute("x") ?? 0);
    const y = Number(anchor.getAttribute("y") ?? 0);
    localCenter = {
      x: x + Number(anchor.getAttribute("width") ?? 0) / 2,
      y: y + Number(anchor.getAttribute("height") ?? 0) / 2,
    };
  }
  if (!localCenter) return null;
  return space === "root"
    ? pointInSvgRootCoordinates(anchor, localCenter)
    : pointInRegionalStationsLayer(anchor, localCenter);
}

export function svgAnchorPoint(
  documentNode: Document,
  anchorId: string | undefined,
): MapPoint | null {
  return readRegionalStationAnchorPoint(documentNode, anchorId, "station-layer");
}

export function svgAnchorPointInRootCoordinates(
  documentNode: Document,
  anchorId: string | undefined,
): MapPoint | null {
  return readRegionalStationAnchorPoint(documentNode, anchorId, "root");
}

export function regionalStationVisualAnchors(
  stationVisual: SVGElement,
  space: RegionalCoordinateSpace = "station-layer",
): RegionalStationVisualAnchor[] {
  const shapes = stationVisual.matches("circle, ellipse, rect")
    ? [stationVisual]
    : [...stationVisual.querySelectorAll<SVGElement>("circle, ellipse, rect")]
        .filter((shape) => shape.getAttribute("inkscape:label") !== "join-rectangle");
  return shapes.flatMap((shape) => {
    if (shape.matches("circle, ellipse")) {
      const center = {
        x: Number(shape.getAttribute("cx") ?? 0),
        y: Number(shape.getAttribute("cy") ?? 0),
      };
      const radiusX = Number(shape.getAttribute("r") ?? shape.getAttribute("rx") ?? 0);
      const radiusY = Number(shape.getAttribute("r") ?? shape.getAttribute("ry") ?? 0);
      const point = space === "root"
        ? pointInSvgRootCoordinates(shape, center)
        : pointInRegionalStationsLayer(shape, center);
      const xEdge = space === "root"
        ? pointInSvgRootCoordinates(shape, { x: center.x + radiusX, y: center.y })
        : pointInRegionalStationsLayer(shape, { x: center.x + radiusX, y: center.y });
      const yEdge = space === "root"
        ? pointInSvgRootCoordinates(shape, { x: center.x, y: center.y + radiusY })
        : pointInRegionalStationsLayer(shape, { x: center.x, y: center.y + radiusY });
      return [{
        id: shape.id || stationVisual.id,
        point,
        radius: Math.min(
          Math.hypot(xEdge.x - point.x, xEdge.y - point.y),
          Math.hypot(yEdge.x - point.x, yEdge.y - point.y),
        ),
      }];
    }
    if (shape.matches("rect")) {
      const x = Number(shape.getAttribute("x") ?? 0);
      const y = Number(shape.getAttribute("y") ?? 0);
      const center = {
        x: x + Number(shape.getAttribute("width") ?? 0) / 2,
        y: y + Number(shape.getAttribute("height") ?? 0) / 2,
      };
      const point = space === "root"
        ? pointInSvgRootCoordinates(shape, center)
        : pointInRegionalStationsLayer(shape, center);
      return [{
        id: shape.id || stationVisual.id,
        point,
        radius: Math.min(
          Number(shape.getAttribute("width") ?? 0),
          Number(shape.getAttribute("height") ?? 0),
        ) / 2,
      }];
    }
    return [];
  });
}

export function regionalStationImpactAnchors(
  stationVisual: SVGElement,
  lineId: string | null | undefined,
  space: RegionalCoordinateSpace = "station-layer",
): RegionalStationVisualAnchor[] {
  const anchors = regionalStationVisualAnchors(stationVisual, space);
  const routeCode = lineId
    ? lineId.replace("regional-", "").toLowerCase()
    : null;
  if (!routeCode) return anchors;
  const matching = anchors.filter((anchor) => anchor.id.endsWith(`-${routeCode}`));
  return matching.length > 0 ? matching : anchors;
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

export function regionalRouteMetric(
  path: SVGPathElement,
  stationsLayer: SVGGraphicsElement,
): RegionalRouteMetric | null {
  return createRegionalRouteMetric(path, point => pointInRegionalStationsCoordinates(point, path, stationsLayer) ?? point);
}

export function regionalRouteMetricInRoot(
  path: SVGPathElement,
): RegionalRouteMetric | null {
  return createRegionalRouteMetric(path, point => pointInSvgRootCoordinates(path, point));
}

const routeSamples = new WeakMap<SVGPathElement, {
  pathData: string | null;
  length: number;
  points: Map<number, MapPoint>;
}>();

/** Prime immutable route samples in small batches while the diagram is idle. */
export function* primeRegionalRouteSamples(root: ParentNode): Generator<void> {
  for (const path of root.querySelectorAll<SVGPathElement>('#regional-lines-layer path[id^="regional-route-"]')) {
    const metric = regionalRouteMetricInRoot(path);
    if (!metric) continue;
    const count = Math.max(2, Math.ceil(metric.length / 24));
    for (let index = 0; index <= count; index++) {
      metric.pointAt(metric.length * index / count);
      if (index % 20 === 0) yield;
    }
  }
}

function createRegionalRouteMetric(
  path: SVGPathElement,
  project: (point: MapPoint) => MapPoint,
): RegionalRouteMetric | null {
  try {
    const pathData = path.getAttribute("d");
    let samples = routeSamples.get(path);
    if (!samples || samples.pathData !== pathData) {
      samples = { pathData, length: path.getTotalLength(), points: new Map() };
      routeSamples.set(path, samples);
    }
    const { length, points } = samples;
    if (length <= 0) return null;
    // Route scans sample hundreds of points for each station/segment. Resolve
    // the authored affine transform once instead of reparsing its ancestors
    // (and inverting the station transform) for every sample.
    const origin = project({ x: 0, y: 0 });
    const xBasis = project({ x: 1, y: 0 });
    const yBasis = project({ x: 0, y: 1 });
    const a = xBasis.x - origin.x;
    const b = xBasis.y - origin.y;
    const c = yBasis.x - origin.x;
    const d = yBasis.y - origin.y;
    return {
      path,
      length,
      pointAt: (distance) => {
        const clamped = Math.max(0, Math.min(length, distance));
        let localPoint = points.get(clamped);
        if (!localPoint) {
          const point = path.getPointAtLength(clamped);
          localPoint = { x: point.x, y: point.y };
          // Moving train markers also sample routes; keep their changing
          // distances from growing the retained diagram's cache indefinitely.
          if (points.size >= 4096) points.delete(points.keys().next().value!);
          points.set(clamped, localPoint);
        }
        return { x: origin.x + a * localPoint.x + c * localPoint.y,
          y: origin.y + b * localPoint.x + d * localPoint.y };
      },
    };
  } catch {
    return null;
  }
}

export function closestRouteDistance(
  metric: RegionalRouteMetric,
  target: MapPoint,
): { distance: number; distanceSquared: number } {
  const sampleCount = Math.max(2, Math.ceil(metric.length / 24));
  let closestDistance = 0;
  let closestDistanceSquared = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= sampleCount; index += 1) {
    const distance = metric.length * index / sampleCount;
    const distanceSquared = squaredPointDistance(metric.pointAt(distance), target);
    if (distanceSquared < closestDistanceSquared) {
      closestDistance = distance;
      closestDistanceSquared = distanceSquared;
    }
  }

  let step = metric.length / sampleCount;
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const before = Math.max(0, closestDistance - step);
    const after = Math.min(metric.length, closestDistance + step);
    for (const candidate of [before, after]) {
      const distanceSquared = squaredPointDistance(metric.pointAt(candidate), target);
      if (distanceSquared < closestDistanceSquared) {
        closestDistance = candidate;
        closestDistanceSquared = distanceSquared;
      }
    }
    step /= 2;
  }
  return { distance: closestDistance, distanceSquared: closestDistanceSquared };
}

export function routePointsBetween(
  metric: RegionalRouteMetric,
  start: number,
  end: number,
): MapPoint[] {
  const sampleCount = Math.max(1, Math.ceil(Math.abs(end - start) / 24));
  return Array.from({ length: sampleCount + 1 }, (_unused, index) =>
    metric.pointAt(start + (end - start) * index / sampleCount));
}

export function pathDataForPoints(points: MapPoint[]): string | null {
  if (points.length < 2) return null;
  // Route sampling otherwise turns each straight authored rail into hundreds
  // of SVG vertices, multiplied across its hit targets, masks and highlights.
  // Preserve endpoints/bends within 0.01 SVG units (below a screen pixel even
  // at maximum zoom), while letting the browser paint compact straight rails.
  const keep = new Set([0, points.length - 1]);
  const ranges = [[0, points.length - 1]];
  while (ranges.length) {
    const [start, end] = ranges.pop()!;
    const from = points[start];
    const to = points[end];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    let farthest = -1;
    let maxDistanceSquared = 0.01 ** 2;
    for (let index = start + 1; index < end; index++) {
      const point = points[index];
      const progress = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
        ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
      const distanceSquared = squaredPointDistance(point, { x: from.x + progress * dx, y: from.y + progress * dy });
      if (distanceSquared > maxDistanceSquared) {
        maxDistanceSquared = distanceSquared;
        farthest = index;
      }
    }
    if (farthest >= 0) {
      keep.add(farthest);
      ranges.push([start, farthest], [farthest, end]);
    }
  }
  return [...keep].sort((a, b) => a - b)
    .map((index, position) => `${position === 0 ? "M" : "L"} ${points[index].x},${points[index].y}`).join(" ");
}

export function fallbackSegmentPath(
  documentNode: Document,
  stationAAnchorId: string | undefined,
  stationBAnchorId: string | undefined,
  space: RegionalCoordinateSpace = "station-layer",
): string | null {
  const start = readRegionalStationAnchorPoint(documentNode, stationAAnchorId, space);
  const end = readRegionalStationAnchorPoint(documentNode, stationBAnchorId, space);
  return start && end ? `M ${start.x},${start.y} L ${end.x},${end.y}` : null;
}

export function corridorSegmentPath(
  documentNode: Document,
  segment: NetworkSegment,
  space: RegionalCoordinateSpace = "station-layer",
): string | null {
  const stationsLayer = documentNode.getElementById("regional-stations-layer") as SVGGraphicsElement | null;
  const start = readRegionalStationAnchorPoint(documentNode, segment.stationAAnchorId, space);
  const end = readRegionalStationAnchorPoint(documentNode, segment.stationBAnchorId, space);
  if (!start || !end) return null;
  if (space === "station-layer" && !stationsLayer) return null;

  const rawPaths = regionalRoutePathIds(segment.lineId)
    .map((pathId) => documentNode.getElementById(pathId) as SVGPathElement | null)
    .filter((path): path is SVGPathElement => Boolean(path));

  const metrics = rawPaths
    .map((path) => (space === "root" ? regionalRouteMetricInRoot(path) : stationsLayer ? regionalRouteMetric(path, stationsLayer) : null))
    .filter((metric): metric is RegionalRouteMetric => Boolean(metric));

  if (metrics.length === 0) return null;

  const startProjections = metrics.map((metric) => closestRouteDistance(metric, start));
  const endProjections = metrics.map((metric) => closestRouteDistance(metric, end));
  const startMetricIndex = startProjections.reduce(
    (best, projection, index) =>
      projection.distanceSquared < startProjections[best].distanceSquared ? index : best,
    0,
  );
  const endMetricIndex = endProjections.reduce(
    (best, projection, index) =>
      projection.distanceSquared < endProjections[best].distanceSquared ? index : best,
    0,
  );

  if (startMetricIndex === endMetricIndex) {
    return pathDataForPoints(routePointsBetween(
      metrics[startMetricIndex],
      startProjections[startMetricIndex].distance,
      endProjections[endMetricIndex].distance,
    ));
  }

  // Split corridor artwork (currently Lakeshore West) is treated as one route
  // graph. Join paths only at the authored LW branch junction so all three
  // pairwise-adjacent Aldershot/West Harbour/Hamilton links follow the shared
  // T-shaped rail geometry instead of drawing station-centre chords.
  const startMetric = metrics[startMetricIndex];
  const endMetric = metrics[endMetricIndex];
  const connections = [0, endMetric.length].map((endPathDistance) => {
    const endPathPoint = endMetric.pointAt(endPathDistance);
    const startPathProjection = closestRouteDistance(startMetric, endPathPoint);
    return {
      startPathDistance: startPathProjection.distance,
      endPathDistance,
      gapSquared: squaredPointDistance(
        startMetric.pointAt(startPathProjection.distance),
        endPathPoint,
      ),
    };
  });
  const connection = connections.reduce((best, candidate) =>
    candidate.gapSquared < best.gapSquared ? candidate : best);
  if (connection.gapSquared > 4) return null;

  const firstPoints = routePointsBetween(
    startMetric,
    startProjections[startMetricIndex].distance,
    connection.startPathDistance,
  );
  const secondPoints = routePointsBetween(
    endMetric,
    connection.endPathDistance,
    endProjections[endMetricIndex].distance,
  );
  return pathDataForPoints([...firstPoints, ...secondPoints.slice(1)]);
}

export function corridorSegmentPathInRootCoordinates(
  documentNode: Document,
  segment: NetworkSegment,
): string | null {
  return corridorSegmentPath(documentNode, segment, "root");
}

export function authoredRegionalCorridorPathData(
  documentNode: Document,
  lineId: string,
  space: RegionalCoordinateSpace = "station-layer",
): string | null {
  const stationsLayer = documentNode.getElementById("regional-stations-layer") as SVGGraphicsElement | null;
  if (space === "station-layer" && !stationsLayer) return null;

  const pathData = regionalRoutePathIds(lineId)
    .map((pathId) => documentNode.getElementById(pathId) as SVGPathElement | null)
    .filter((path): path is SVGPathElement => Boolean(path))
    .map((path) => (space === "root" ? regionalRouteMetricInRoot(path) : stationsLayer ? regionalRouteMetric(path, stationsLayer) : null))
    .filter((metric): metric is RegionalRouteMetric => Boolean(metric))
    .map((metric) => pathDataForPoints(routePointsBetween(metric, 0, metric.length)))
    .filter((pathD): pathD is string => Boolean(pathD));
  return pathData.length > 0 ? pathData.join(" ") : null;
}

export function resolvedRegionalSegmentPath(
  documentNode: Document,
  segment: NetworkSegment,
  space: RegionalCoordinateSpace = "station-layer",
): string | null {
  const guide = documentNode.getElementById(segment.guidePathId ?? "") as SVGPathElement | null;
  return guide?.getAttribute("d")
    ?? corridorSegmentPath(documentNode, segment, space)
    ?? fallbackSegmentPath(documentNode, segment.stationAAnchorId, segment.stationBAnchorId, space);
}

export function continuousRegionalOverlayRunPath(
  documentNode: Document,
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

  return corridorSegmentPath(documentNode, {
    ...run.segments[0],
    stationAId: endpointIds[0],
    stationBId: endpointIds[1],
    stationAAnchorId,
    stationBAnchorId,
    guidePathId: undefined,
  });
}

export function regionalTrainMarkerFrame(
  documentNode: Document,
  segment: NetworkSegment,
  marker: EstimatedTrainMarker,
): RegionalTrainMarkerFrame | null {
  // Train markers must use authored corridor geometry. A straight anchor-to-anchor
  // fallback can visibly leave a bent track, so omit an unresolvable marker instead.
  const pathD = corridorSegmentPathInRootCoordinates(documentNode, segment);
  const direction = resolveEstimatedTrainMarkerSegmentDirection(marker, segment);
  if (!direction) return null;
  const from = svgAnchorPointInRootCoordinates(documentNode, direction.fromAnchorId);
  if (!pathD || !from) return null;

  const markerPath = documentNode.createElementNS(SVG_NAMESPACE, "path");
  markerPath.setAttribute("d", pathD);
  try {
    const length = markerPath.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) return null;
    const pathStart = markerPath.getPointAtLength(0);
    const pathEnd = markerPath.getPointAtLength(length);
    const pathStartsAtFrom = squaredPointDistance(pathStart, from)
      <= squaredPointDistance(pathEnd, from);
    const progress = Math.max(0, Math.min(1, marker.progress));
    const pathProgress = pathStartsAtFrom ? progress : 1 - progress;
    const distance = length * pathProgress;
    const point = markerPath.getPointAtLength(distance);
    const delta = Math.min(24, Math.max(2, length * 0.015));
    const before = markerPath.getPointAtLength(Math.max(0, distance - delta));
    const after = markerPath.getPointAtLength(Math.min(length, distance + delta));
    const tangent = { x: after.x - before.x, y: after.y - before.y };
    const pathAngle = Math.atan2(tangent.y, tangent.x) * 180 / Math.PI;
    const pathTravelDirection = marker.travelDirection === "bidirectional"
      ? "bidirectional"
      : pathStartsAtFrom ? "forward" : "reverse";
    return {
      point: estimatedTrainMarkerLanePoint(
        point,
        tangent,
        pathTravelDirection,
        REGIONAL_TRAIN_MARKER_LANE_OFFSET,
      ),
      angle: orientedEstimatedTrainMarkerAngle(pathAngle, pathStartsAtFrom),
    };
  } catch {
    return null;
  }
}

export function regionalHoverMaskBounds(
  source: SVGElement,
  viewBox: MapBounds = REGIONAL_MAP_VIEWBOX,
): MapBounds {
  // Hover foregrounds live inside the translated stations layer. Mask bounds
  // are therefore expressed in that layer's local coordinates, not in the
  // root SVG viewBox coordinates. Using the root values directly clipped the
  // west side of Lakeshore West's T-shaped corridor near West Harbour.
  const rootCorners = [
    { x: viewBox.x, y: viewBox.y },
    { x: viewBox.x + viewBox.width, y: viewBox.y },
    { x: viewBox.x, y: viewBox.y + viewBox.height },
    {
      x: viewBox.x + viewBox.width,
      y: viewBox.y + viewBox.height,
    },
  ];
  const localCorners = rootCorners
    .map((point) => pointFromSvgRootCoordinates(source, point))
    .filter((point): point is MapPoint => Boolean(point));
  if (localCorners.length !== rootCorners.length) {
    return {
      x: viewBox.x - viewBox.width,
      y: viewBox.y - viewBox.height,
      width: viewBox.width * 3,
      height: viewBox.height * 3,
    };
  }
  const xValues = localCorners.map((point) => point.x);
  const yValues = localCorners.map((point) => point.y);
  const x = Math.min(...xValues);
  const y = Math.min(...yValues);
  return {
    x,
    y,
    width: Math.max(...xValues) - x,
    height: Math.max(...yValues) - y,
  };
}

export function regionalStationLabelHover(
  root: ParentNode,
  stationId: string | null,
): RegionalStationLabelHoverResult | null {
  if (!stationId) return null;
  const label = root.querySelector<SVGGraphicsElement>(
    `#regional-station-labels-layer [data-regional-station-label-for="${CSS.escape(stationId)}"]`,
  );
  const svg = label?.ownerSVGElement;
  const cutoutSource = root.querySelector<SVGGraphicsElement>(
    `#regional-station-label-cutout-source-${CSS.escape(stationId)}`,
  );
  if (!label || !svg || !cutoutSource) return null;
  const elementScreenMatrix = label.getScreenCTM();
  const rootScreenMatrix = svg.getScreenCTM();
  if (!elementScreenMatrix || !rootScreenMatrix) return null;
  const relativeMatrix = rootScreenMatrix.inverse().multiply(elementScreenMatrix);
  const localBox = label.getBBox();
  const defaultTrailing = 80;
  let allowedTrailing = defaultTrailing;
  const otherLabels = root.querySelectorAll<SVGGraphicsElement>(
    "#regional-station-labels-layer [data-regional-station-label-for]",
  );
  for (const other of otherLabels) {
    if (other === label) continue;
    const otherMatrix = other.getScreenCTM();
    if (!otherMatrix) continue;
    try {
      const toLabelMatrix = elementScreenMatrix.inverse().multiply(otherMatrix);
      const otherBox = other.getBBox();
      const otherCorners = [
        new DOMPoint(otherBox.x, otherBox.y),
        new DOMPoint(otherBox.x + otherBox.width, otherBox.y),
        new DOMPoint(otherBox.x + otherBox.width, otherBox.y + otherBox.height),
        new DOMPoint(otherBox.x, otherBox.y + otherBox.height),
      ].map((p) => p.matrixTransform(toLabelMatrix));

      const minXInLabel = Math.min(...otherCorners.map((p) => p.x));
      const minYInLabel = Math.min(...otherCorners.map((p) => p.y));
      const maxYInLabel = Math.max(...otherCorners.map((p) => p.y));

      const deltaX = minXInLabel - (localBox.x + localBox.width);
      const verticalOverlap = Math.max(
        0,
        Math.min(localBox.y + localBox.height, maxYInLabel) - Math.max(localBox.y, minYInLabel),
      );
      const verticalDist = Math.abs((localBox.y + localBox.height / 2) - ((minYInLabel + maxYInLabel) / 2));

      if (deltaX >= -5 && deltaX < defaultTrailing + 30 && (verticalOverlap > 0 || verticalDist < 40)) {
        const safeGap = Math.max(0, deltaX - 2);
        allowedTrailing = Math.min(allowedTrailing, safeGap);
      }
    } catch {
      // ignore
    }
  }

  const padLeading = 0;
  const padY = 12;
  const localBounds = {
    x: localBox.x - padLeading,
    y: localBox.y - padY,
    width: localBox.width + padLeading + allowedTrailing,
    height: localBox.height + padY * 2,
  };
  const corners = [
    new DOMPoint(localBounds.x, localBounds.y),
    new DOMPoint(localBounds.x + localBounds.width, localBounds.y),
    new DOMPoint(localBounds.x + localBounds.width, localBounds.y + localBounds.height),
    new DOMPoint(localBounds.x, localBounds.y + localBounds.height),
  ].map((p) => p.matrixTransform(relativeMatrix));
  const polygonPoints = corners.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

  const centerPoint = new DOMPoint(
    localBox.x + localBox.width / 2,
    localBox.y + localBox.height / 2,
  ).matrixTransform(relativeMatrix);

  const isolatedCutoutSource = cutoutSource.cloneNode(true) as SVGGraphicsElement;
  removeDescendantIds(isolatedCutoutSource);
  return {
    stationId,
    polygonPoints,
    cutoutMarkup: isolatedCutoutSource.outerHTML,
    bounds: {
      x: Math.min(...corners.map((point) => point.x)) - 20,
      y: Math.min(...corners.map((point) => point.y)) - 20,
      width: Math.max(...corners.map((point) => point.x))
        - Math.min(...corners.map((point) => point.x)) + 40,
      height: Math.max(...corners.map((point) => point.y))
        - Math.min(...corners.map((point) => point.y)) + 40,
    },
    center: {
      x: centerPoint.x,
      y: centerPoint.y,
    },
  };
}

export function regionalOverlapBadgeAnchor(
  documentNode: Document,
  segment: NetworkSegment,
  size: RegionalBadgeSize,
): RegionalOverlapBadgePlacement | null {
  const stationsLayer = documentNode.getElementById("regional-stations-layer") as SVGElement | null;
  const mapCenter = {
    x: REGIONAL_MAP_VIEWBOX.x + REGIONAL_MAP_VIEWBOX.width / 2,
    y: REGIONAL_MAP_VIEWBOX.y + REGIONAL_MAP_VIEWBOX.height / 2,
  };
  const pathD = resolvedRegionalSegmentPath(documentNode, segment);
  if (pathD && stationsLayer) {
    const path = documentNode.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", pathD);
    try {
      const length = path.getTotalLength();
      const midpoint = path.getPointAtLength(length / 2);
      const before = path.getPointAtLength(Math.max(0, length / 2 - 5));
      const after = path.getPointAtLength(Math.min(length, length / 2 + 5));
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
      const candidates = [1, -1].map((direction) => ({
        x: midpoint.x + normal.x * offset * direction,
        y: midpoint.y + normal.y * offset * direction,
      }));
      const position = candidates.sort((left, right) => {
        const leftRoot = pointInSvgRootCoordinates(stationsLayer, left);
        const rightRoot = pointInSvgRootCoordinates(stationsLayer, right);
        return squaredPointDistance(leftRoot, mapCenter) - squaredPointDistance(rightRoot, mapCenter);
      })[0];
      return { anchor: midpoint, position };
    } catch {
      // Fall through to the authored station anchors.
    }
  }

  const start = svgAnchorPoint(documentNode, segment.stationAAnchorId);
  const end = svgAnchorPoint(documentNode, segment.stationBAnchorId);
  if (!start || !end) return null;
  const midpoint = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
  if (!stationsLayer) return { anchor: midpoint, position: midpoint };
  const rootMidpoint = pointInSvgRootCoordinates(stationsLayer, midpoint);
  const distanceToCenter = Math.hypot(
    mapCenter.x - rootMidpoint.x,
    mapCenter.y - rootMidpoint.y,
  ) || 1;
  const position = pointFromSvgRootCoordinates(stationsLayer, {
    x: rootMidpoint.x
      + (mapCenter.x - rootMidpoint.x) / distanceToCenter * (
        REGIONAL_IMPACT_OVERLAY_WIDTH / 2
        + Math.max(size.width, size.height) * REGIONAL_OVERLAP_INDICATOR_SCALE / 2
        + REGIONAL_OVERLAP_INDICATOR_EDGE_GAP
      ),
    y: rootMidpoint.y
      + (mapCenter.y - rootMidpoint.y) / distanceToCenter * (
        REGIONAL_IMPACT_OVERLAY_WIDTH / 2
        + Math.max(size.width, size.height) * REGIONAL_OVERLAP_INDICATOR_SCALE / 2
        + REGIONAL_OVERLAP_INDICATOR_EDGE_GAP
      ),
  });
  return position ? { anchor: midpoint, position } : null;
}

export function regionalCollisionBoxForElement(
  svg: SVGSVGElement,
  element: SVGGraphicsElement,
): RegionalCollisionBox | null {
  const relativeMatrix = svgElementMatrixToRootCoordinates(element, svg);
  if (!relativeMatrix) return null;
  const bounds = element.getBBox();
  return transformBoundsToRootCoordinates(bounds, relativeMatrix);
}

export function regionalPointInSvgRoot(
  svg: SVGSVGElement,
  element: SVGGraphicsElement,
  point: MapPoint,
): MapPoint | null {
  const relativeMatrix = svgElementMatrixToRootCoordinates(element, svg);
  if (!relativeMatrix) return null;
  return transformPoint(point, relativeMatrix);
}

export function regionalPathCorridorCollisionBoxes(
  svg: SVGSVGElement,
  path: SVGPathElement,
  radius: number,
): RegionalCollisionBox[] {
  try {
    const length = path.getTotalLength();
    if (length <= 0) return [];
    const relativeMatrix = svgElementMatrixToRootCoordinates(path, svg);
    if (!relativeMatrix) return [];
    const sampleCount = Math.max(2, Math.ceil(length / Math.max(32, radius * 0.65)));
    return Array.from({ length: sampleCount + 1 }, (_unused, index) => {
      const localPoint = path.getPointAtLength(length * index / sampleCount);
      const point = transformPoint(localPoint, relativeMatrix);
      return {
        x: point.x - radius,
        y: point.y - radius,
        width: radius * 2,
        height: radius * 2,
      };
    });
  } catch {
    return [];
  }
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

export function regionalBadgeCollisionBox(
  position: MapPoint,
  size: RegionalBadgeSize,
): RegionalCollisionBox {
  const width = size.width * REGIONAL_OVERLAP_INDICATOR_SCALE;
  const height = size.height * REGIONAL_OVERLAP_INDICATOR_SCALE;
  return {
    x: position.x - width / 2,
    y: position.y - height / 2,
    width,
    height,
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

export function clampRegionalOverlapBadgePosition(
  position: MapPoint,
  size: RegionalBadgeSize,
): MapPoint {
  const halfWidth = size.width * REGIONAL_OVERLAP_INDICATOR_SCALE / 2;
  const halfHeight = size.height * REGIONAL_OVERLAP_INDICATOR_SCALE / 2;
  return {
    x: Math.min(
      REGIONAL_MAP_VIEWBOX.x + REGIONAL_MAP_VIEWBOX.width - halfWidth,
      Math.max(REGIONAL_MAP_VIEWBOX.x + halfWidth, position.x),
    ),
    y: Math.min(
      REGIONAL_MAP_VIEWBOX.y + REGIONAL_MAP_VIEWBOX.height - halfHeight,
      Math.max(REGIONAL_MAP_VIEWBOX.y + halfHeight, position.y),
    ),
  };
}

export function regionalOverlapBadgePositionCandidates(
  badge: { anchor: MapPoint; preferredVector: MapPoint },
): MapPoint[] {
  const preferredDistance = Math.hypot(badge.preferredVector.x, badge.preferredVector.y) || 1;
  const preferredAngle = Math.atan2(badge.preferredVector.y, badge.preferredVector.x);
  const angleOffsets = Array.from({ length: 24 }, (_unused, index) => {
    const step = Math.ceil(index / 2) * Math.PI / 12;
    return index === 0 ? 0 : index % 2 === 1 ? step : -step;
  });
  const distanceScales = [1, 1.2, 1.45, 1.75, 2.1, 2.5];
  return distanceScales.flatMap((distanceScale) => angleOffsets.map((angleOffset) => ({
    x: badge.anchor.x + Math.cos(preferredAngle + angleOffset) * preferredDistance * distanceScale,
    y: badge.anchor.y + Math.sin(preferredAngle + angleOffset) * preferredDistance * distanceScale,
  })));
}
