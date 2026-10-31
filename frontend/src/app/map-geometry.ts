import type { NetworkSegment, Station } from "./linewatch-data";

export type MapPoint = { x: number; y: number };
export type MapBounds = { x: number; y: number; width: number; height: number };
export type MapPolygon = [MapPoint, MapPoint, MapPoint, MapPoint];
export type PathFrame = { point: MapPoint; tangent: MapPoint; normal: MapPoint };
type MeasurableSvgPath = Pick<SVGPathElement, "getPointAtLength">;
export type MapMatrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

export type ChevronInstance = {
  x: number;
  y: number;
  angle: number;
};

export function visualTravelDirection(segment: NetworkSegment) {
  const direction = segment.travelDirection ?? "bidirectional";
  if (!segment.guidePathReversed || direction === "bidirectional") {
    return direction;
  }
  return direction === "forward" ? "reverse" : "forward";
}

export type SampledPath = {
  points: ChevronInstance[];
  step: number;
};

type CorridorTravelDirection = NonNullable<NetworkSegment["travelDirection"]>;

const GUIDE_PATH_ID_ALIASES = new Map<string, string>([
  ["seg-line-1-spadina-st-george", "seg-line-1-st-george-spadina"],
]);

export type ComposableNetworkSegment = Pick<
  NetworkSegment,
  "id" | "pathD" | "guidePathReversed" | "travelDirection"
>;

export type ComposedNetworkSegmentPath = {
  pathD: string;
  travelDirection: CorridorTravelDirection;
  segmentIds: string[];
};

export function samplePath(pathD: string, spacing: number = 56): SampledPath {
  if (typeof document === "undefined") return { points: [], step: spacing };
  try {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    const length = path.getTotalLength();
    const points: ChevronInstance[] = [];

    if (length <= 0) return { points: [], step: spacing };

    const count = Math.max(1, Math.floor(length / spacing));
    const step = length / count;

    // Glyphs run from end to end and stop there: lanes are not clipped, so
    // nothing past an end may be drawn outside the alert's tube.
    for (let i = 0; i <= count; i++) {
      const dist = i * step;
      const p = path.getPointAtLength(dist);

      const delta = 1;
      const pAhead = path.getPointAtLength(Math.min(length, dist + delta));
      const pBehind = path.getPointAtLength(Math.max(0, dist - delta));

      const dx = pAhead.x - pBehind.x;
      const dy = pAhead.y - pBehind.y;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      points.push({ x: p.x, y: p.y, angle });
    }

    return { points, step };
  } catch (e) {
    console.error("Error sampling SVG path:", e);
    return { points: [], step: spacing };
  }
}

export function extrapolatedPathFrame(
  path: MeasurableSvgPath,
  length: number,
  distance: number,
  tangentSampleDistance = 1,
): PathFrame | null {
  if (length <= 0) return null;

  const resolvedDistance = Math.max(0, Math.min(length, distance));
  const sampleDistance = Math.max(Number.EPSILON, Math.min(length, tangentSampleDistance));
  const beforeDistance = resolvedDistance <= 0
    ? 0
    : Math.max(0, resolvedDistance - sampleDistance);
  const afterDistance = resolvedDistance >= length
    ? length
    : Math.min(length, resolvedDistance + sampleDistance);
  const before = path.getPointAtLength(beforeDistance);
  const after = path.getPointAtLength(afterDistance);
  const magnitude = Math.hypot(after.x - before.x, after.y - before.y);
  if (magnitude <= Number.EPSILON) return null;

  const tangent = {
    x: (after.x - before.x) / magnitude,
    y: (after.y - before.y) / magnitude,
  };
  const anchor = path.getPointAtLength(resolvedDistance);
  const overflowDistance = distance - resolvedDistance;
  const point = {
    x: anchor.x + tangent.x * overflowDistance,
    y: anchor.y + tangent.y * overflowDistance,
  };

  return {
    point,
    tangent,
    normal: { x: -tangent.y, y: tangent.x },
  };
}

export function pathCenter(pathD: string): MapPoint | null {
  const points = pathToPolylinePoints(pathD);
  if (points.length === 0) {
    return null;
  }

  const total = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

export function pathCorridorCollisionBoxes(pathD: string, radius: number = 112): MapBounds[] {
  const points = pathToPolylinePoints(pathD);
  if (points.length === 0) return [];
  if (points.length === 1) return [pointCollisionBox(points[0], radius)];

  return densifyPolylinePoints(points, Math.max(1, radius))
    .map((point) => pointCollisionBox(point, radius));
}

export function pathMidpointFrame(pathD: string): PathFrame | null {
  const points = pathToPolylinePoints(pathD);
  if (points.length < 2) return null;

  const lengths = points.slice(1).map((point, index) => pointDistance(points[index], point));
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  if (totalLength <= 0) return null;

  const targetLength = totalLength / 2;
  let walkedLength = 0;

  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    const segmentLength = lengths[index - 1];
    if (segmentLength <= 0.001) continue;

    if (walkedLength + segmentLength >= targetLength) {
      const t = (targetLength - walkedLength) / segmentLength;
      const tangent = {
        x: (end.x - start.x) / segmentLength,
        y: (end.y - start.y) / segmentLength,
      };
      return {
        point: {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
        },
        tangent,
        normal: { x: -tangent.y, y: tangent.x },
      };
    }

    walkedLength += segmentLength;
  }

  return null;
}

export function composeNetworkSegmentPath(
  segments: ComposableNetworkSegment[],
  travelDirection: CorridorTravelDirection = "bidirectional",
): ComposedNetworkSegmentPath {
  const sampledSegments = segments
    .map((segment) => {
      const points = pathToPolylinePoints(segment.pathD);
      return {
        id: segment.id,
        points: segment.guidePathReversed ? reversePoints(points) : points,
      };
    })
    .filter((segment) => segment.points.length > 0);

  const oriented = orientSequentialPolylines(sampledSegments);
  const points = dedupePoints(oriented.flatMap((segment) => segment.points));

  return {
    pathD: pointsToPath(points),
    travelDirection: oriented[0]?.reversed ? flipTravelDirection(travelDirection) : travelDirection,
    segmentIds: sampledSegments.map((segment) => segment.id),
  };
}

export function pathPolylinePoints(pathD: string): MapPoint[] {
  return pathToPolylinePoints(pathD);
}

function pathToPolylinePoints(pathD: string): MapPoint[] {
  if (!pathD) {
    return [];
  }
  if (isLinearPathData(pathD)) {
    return parsedPathPoints(pathD);
  }
  return measuredPathPoints(pathD) ?? parsedPathPoints(pathD);
}

function isLinearPathData(pathD: string): boolean {
  return !/[acqst]/i.test(pathD);
}

function measuredPathPoints(pathD: string, spacing: number = 32): MapPoint[] | null {
  if (typeof document === "undefined") return null;
  try {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    const length = path.getTotalLength();
    if (length <= 0) return [];

    const points: MapPoint[] = [];
    for (const distance of pathSamplingDistances(length, spacing)) {
      const point = path.getPointAtLength(distance);
      points.push({ x: point.x, y: point.y });
    }
    return points;
  } catch {
    return null;
  }
}

export function pathSamplingDistances(
  length: number,
  spacing: number,
  endpointTangentSample = 1,
): number[] {
  if (length <= 0) return [];

  const count = Math.max(1, Math.ceil(length / Math.max(Number.EPSILON, spacing)));
  const tangentDistance = Math.min(length / 2, Math.max(Number.EPSILON, endpointTangentSample));
  return Array.from(new Set([
    0,
    tangentDistance,
    ...Array.from({ length: count + 1 }, (_unused, index) => length * index / count),
    length - tangentDistance,
    length,
  ])).sort((a, b) => a - b);
}

function parsedPathPoints(pathD: string): MapPoint[] {
  const tokens = pathD.match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) ?? [];
  const points: MapPoint[] = [];
  let index = 0;
  let command = "";
  let current: MapPoint = { x: 0, y: 0 };
  let start: MapPoint = { x: 0, y: 0 };

  const hasNumber = () => index < tokens.length && !isSvgPathCommand(tokens[index]);
  const readNumber = () => Number(tokens[index++]);
  const readPoint = (relative: boolean): MapPoint => {
    const x = readNumber();
    const y = readNumber();
    return relative ? { x: current.x + x, y: current.y + y } : { x, y };
  };
  const addPoint = (point: MapPoint) => {
    current = point;
    const last = points.at(-1);
    if (!last || pointDistance(last, point) > 0.001) {
      points.push(point);
    }
  };

  while (index < tokens.length) {
    if (isSvgPathCommand(tokens[index])) {
      command = tokens[index++] ?? "";
    }
    if (!command) break;

    const relative = command === command.toLowerCase();
    switch (command.toLowerCase()) {
      case "m": {
        let first = true;
        while (hasNumber()) {
          const point = readPoint(relative);
          addPoint(point);
          if (first) {
            start = point;
            first = false;
          }
        }
        command = relative ? "l" : "L";
        break;
      }
      case "l": {
        while (hasNumber()) {
          addPoint(readPoint(relative));
        }
        break;
      }
      case "h": {
        while (hasNumber()) {
          const x = readNumber();
          addPoint({ x: relative ? current.x + x : x, y: current.y });
        }
        break;
      }
      case "v": {
        while (hasNumber()) {
          const y = readNumber();
          addPoint({ x: current.x, y: relative ? current.y + y : y });
        }
        break;
      }
      case "c": {
        while (hasNumber()) {
          const startPoint = current;
          const control1 = readPoint(relative);
          const control2 = readPoint(relative);
          const end = readPoint(relative);
          for (let step = 1; step <= 8; step++) {
            addPoint(cubicPoint(startPoint, control1, control2, end, step / 8));
          }
        }
        break;
      }
      case "q": {
        while (hasNumber()) {
          const startPoint = current;
          const control = readPoint(relative);
          const end = readPoint(relative);
          for (let step = 1; step <= 8; step++) {
            addPoint(quadraticPoint(startPoint, control, end, step / 8));
          }
        }
        break;
      }
      case "z": {
        addPoint(start);
        break;
      }
      default:
        while (hasNumber()) {
          readNumber();
        }
        break;
    }
  }

  return dedupePoints(points);
}

function isSvgPathCommand(token: string | undefined): boolean {
  return Boolean(token && /^[AaCcHhLlMmQqSsTtVvZz]$/.test(token));
}

function cubicPoint(start: MapPoint, control1: MapPoint, control2: MapPoint, end: MapPoint, t: number): MapPoint {
  const oneMinusT = 1 - t;
  return {
    x:
      oneMinusT ** 3 * start.x +
      3 * oneMinusT ** 2 * t * control1.x +
      3 * oneMinusT * t ** 2 * control2.x +
      t ** 3 * end.x,
    y:
      oneMinusT ** 3 * start.y +
      3 * oneMinusT ** 2 * t * control1.y +
      3 * oneMinusT * t ** 2 * control2.y +
      t ** 3 * end.y,
  };
}

function quadraticPoint(start: MapPoint, control: MapPoint, end: MapPoint, t: number): MapPoint {
  const oneMinusT = 1 - t;
  return {
    x: oneMinusT ** 2 * start.x + 2 * oneMinusT * t * control.x + t ** 2 * end.x,
    y: oneMinusT ** 2 * start.y + 2 * oneMinusT * t * control.y + t ** 2 * end.y,
  };
}

function orientSequentialPolylines(
  segments: { id: string; points: MapPoint[] }[],
): { id: string; points: MapPoint[]; reversed: boolean }[] {
  if (segments.length === 0) return [];
  if (segments.length === 1) {
    return [{ ...segments[0], reversed: false }];
  }

  const first = segments[0];
  const second = segments[1];
  const firstNormalDistance = Math.min(
    endpointDistance(first.points, second.points, false, false),
    endpointDistance(first.points, second.points, false, true),
  );
  const firstReversedDistance = Math.min(
    endpointDistance(first.points, second.points, true, false),
    endpointDistance(first.points, second.points, true, true),
  );
  const oriented: { id: string; points: MapPoint[]; reversed: boolean }[] = [
    {
      id: first.id,
      points: firstReversedDistance < firstNormalDistance ? reversePoints(first.points) : first.points,
      reversed: firstReversedDistance < firstNormalDistance,
    },
  ];

  for (const segment of segments.slice(1)) {
    const previousEnd = oriented.at(-1)?.points.at(-1);
    if (!previousEnd) continue;

    const normalDistance = pointDistance(previousEnd, segment.points[0]);
    const reversedDistance = pointDistance(previousEnd, segment.points.at(-1) ?? segment.points[0]);
    const reversed = reversedDistance < normalDistance;
    oriented.push({
      id: segment.id,
      points: reversed ? reversePoints(segment.points) : segment.points,
      reversed,
    });
  }

  return oriented;
}

function endpointDistance(
  first: MapPoint[],
  second: MapPoint[],
  firstReversed: boolean,
  secondReversed: boolean,
): number {
  const firstEnd = firstReversed ? first[0] : first.at(-1);
  const secondStart = secondReversed ? second.at(-1) : second[0];
  if (!firstEnd || !secondStart) return Number.POSITIVE_INFINITY;
  return pointDistance(firstEnd, secondStart);
}

function dedupePoints(points: MapPoint[]): MapPoint[] {
  return points.filter((point, index) => index === 0 || pointDistance(point, points[index - 1]) > 0.001);
}

function pointCollisionBox(point: MapPoint, radius: number): MapBounds {
  return {
    x: point.x - radius,
    y: point.y - radius,
    width: radius * 2,
    height: radius * 2,
  };
}

/** Points along a polyline no more than `spacing` apart, keeping its vertices. */
export function densifyPolylinePoints(points: MapPoint[], spacing: number): MapPoint[] {
  const sampled: MapPoint[] = [];

  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    const distance = pointDistance(start, end);
    if (distance <= 0.001) continue;

    const stepCount = Math.max(1, Math.ceil(distance / spacing));
    for (let step = 0; step <= stepCount; step++) {
      const t = step / stepCount;
      sampled.push({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      });
    }
  }

  return dedupePoints(sampled);
}

function reversePoints(points: MapPoint[]): MapPoint[] {
  return [...points].reverse();
}

export function pointsToPath(points: MapPoint[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return [`M ${formatPathNumber(first.x)} ${formatPathNumber(first.y)}`]
    .concat(rest.map((point) => `L ${formatPathNumber(point.x)} ${formatPathNumber(point.y)}`))
    .join(" ");
}

function pointDistance(a: MapPoint, b: MapPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}


export function invertMatrix(matrix: MapMatrix): MapMatrix | null {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (Math.abs(determinant) <= Number.EPSILON) return null;

  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  };
}

export function multiplyMatrix(a: MapMatrix | null, b: MapMatrix): MapMatrix | null {
  if (!a) return null;

  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    e: a.a * b.e + a.c * b.f + a.e,
    f: a.b * b.e + a.d * b.f + a.f,
  };
}

export function transformPoint(point: MapPoint, matrix: MapMatrix): MapPoint {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}


function formatPathNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (Object.is(rounded, -0)) return "0";
  return rounded.toFixed(3).replace(/\.?0+$/, "");
}

function flipTravelDirection(direction: CorridorTravelDirection): CorridorTravelDirection {
  if (direction === "forward") return "reverse";
  if (direction === "reverse") return "forward";
  return "bidirectional";
}

export function resolveNetworkSegmentPath(
  segment: NetworkSegment,
  stations: Station[],
  anchorPoints: Map<string, MapPoint>,
  guidePaths: Map<string, string>,
): string {
  if (segment.guidePathId) {
    const guide =
      guidePaths.get(segment.guidePathId) ??
      guidePaths.get(GUIDE_PATH_ID_ALIASES.get(segment.guidePathId) ?? "");
    if (guide) return guide;
  }

  const stationById = new Map(stations.map((station) => [station.id, station]));
  const stationA = segment.stationAId ? stationById.get(segment.stationAId) : undefined;
  const stationB = segment.stationBId ? stationById.get(segment.stationBId) : undefined;
  const pointA =
    (segment.stationAAnchorId && anchorPoints.get(segment.stationAAnchorId)) ??
    (stationA ? { x: stationA.x, y: stationA.y } : undefined);
  const pointB =
    (segment.stationBAnchorId && anchorPoints.get(segment.stationBAnchorId)) ??
    (stationB ? { x: stationB.x, y: stationB.y } : undefined);

  if (pointA && pointB) {
    const track = guidePaths.get(trackGuideKey(segment.lineId));
    const along = track ? trackPathBetween(trackPoints(track), pointA, pointB) : "";
    return along || `M ${pointA.x} ${pointA.y} L ${pointB.x} ${pointB.y}`;
  }
  return segment.pathD;
}

/** Where a line's authored track (a root-coordinate polyline) is kept in `guidePaths`. */
export function trackGuideKey(lineId: string): string {
  return `track:${lineId}`;
}

/** Farther than this from the track, a station anchor keeps the straight chord. */
const TRACK_SNAP_DISTANCE = 60;

const trackPointCache = new Map<string, MapPoint[]>();
function trackPoints(pathD: string): MapPoint[] {
  let points = trackPointCache.get(pathD);
  if (!points) {
    points = parsedPathPoints(pathD);
    trackPointCache.set(pathD, points);
  }
  return points;
}

/** The nearest point of a polyline: its distance along the line and how far off it is. */
export function projectOntoPolyline(points: MapPoint[], target: MapPoint) {
  let best = { along: 0, gap: Infinity };
  let travelled = 0;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const length = pointDistance(from, to);
    const t = length === 0 ? 0 : Math.max(0, Math.min(1,
      ((target.x - from.x) * (to.x - from.x) + (target.y - from.y) * (to.y - from.y)) / (length * length)));
    const gap = pointDistance({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, target);
    if (gap < best.gap) best = { along: travelled + length * t, gap };
    travelled += length;
  }
  return best;
}

/** A polyline's length. */
export function polylineLength(points: MapPoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index++) length += pointDistance(points[index - 1], points[index]);
  return length;
}

/** The point a given distance along a polyline. */
export function pointAlongPolyline(points: MapPoint[], along: number): MapPoint {
  let travelled = 0;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const length = pointDistance(from, to);
    if (travelled + length >= along) {
      const t = length === 0 ? 0 : (along - travelled) / length;
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    }
    travelled += length;
  }
  return points[points.length - 1];
}

/**
 * The stretch of a line's authored track between two station anchors, from a
 * to b. A straight chord between station centres cuts the track's corners,
 * and an alert rail as wide as the line then shows the line beside it;
 * following the track keeps the rail on the line.
 */
export function trackPathBetween(track: MapPoint[], a: MapPoint, b: MapPoint): string {
  if (track.length < 2) return "";
  const start = projectOntoPolyline(track, a);
  const end = projectOntoPolyline(track, b);
  if (start.gap > TRACK_SNAP_DISTANCE || end.gap > TRACK_SNAP_DISTANCE) return "";
  if (Math.abs(end.along - start.along) < 1) return "";
  return pointsToPath(polylineStretch(track, start.along, end.along));
}

/**
 * The part of a polyline between two distances along it, keeping its
 * vertices, ordered from `from` to `to`.
 */
export function polylineStretch(points: MapPoint[], from: number, to: number): MapPoint[] {
  const forward = from <= to;
  const [low, high] = forward ? [from, to] : [to, from];
  const inner: MapPoint[] = [];
  let travelled = 0;
  for (let index = 1; index < points.length; index++) {
    travelled += pointDistance(points[index - 1], points[index]);
    if (index < points.length - 1 && travelled > low && travelled < high) inner.push(points[index]);
  }
  const stretch = [pointAlongPolyline(points, low), ...inner, pointAlongPolyline(points, high)];
  return forward ? stretch : stretch.reverse();
}
