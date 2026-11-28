import type { NetworkSegment, Station } from "./linewatch-data";

export type MapPoint = { x: number; y: number };
export type MapBounds = { x: number; y: number; width: number; height: number };
export type MapPolygon = [MapPoint, MapPoint, MapPoint, MapPoint];
export type PathFrame = { point: MapPoint; tangent: MapPoint; normal: MapPoint };
export type MapMatrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

export function visualTravelDirection(segment: NetworkSegment) {
  const direction = segment.travelDirection ?? "bidirectional";
  if (!segment.guidePathReversed || direction === "bidirectional") {
    return direction;
  }
  return direction === "forward" ? "reverse" : "forward";
}

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
  const oriented = orientNetworkSegmentPolylines(segments, travelDirection);
  return {
    pathD: pointsToPath(dedupePoints(oriented.polylines.flat())),
    travelDirection: oriented.travelDirection,
    segmentIds: oriented.segmentIds,
  };
}

/**
 * A run of segments' drawn paths as polylines, each oriented to follow on
 * from the one before, and the run's travel direction along them.
 */
export function orientNetworkSegmentPolylines(
  segments: ComposableNetworkSegment[],
  travelDirection: CorridorTravelDirection = "bidirectional",
): { polylines: MapPoint[][]; travelDirection: CorridorTravelDirection; segmentIds: string[] } {
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
  return {
    polylines: oriented.map((segment) => segment.points),
    travelDirection: oriented[0]?.reversed ? flipTravelDirection(travelDirection) : travelDirection,
    segmentIds: sampledSegments.map((segment) => segment.id),
  };
}

/** Closer than this to a drawn stretch, a path runs along it (map units). */
const RETRACE_TOLERANCE = 2;
/**
 * Shorter overlaps are where two paths meet (a corner's first units lie
 * within the tolerance of the stretch it leaves), not where one retraces the other.
 */
const MIN_RETRACE_LENGTH = RETRACE_TOLERANCE * 4;

/**
 * Trails of polylines (each trail's pieces in order, each piece one segment's
 * path) as subpaths that never draw a stretch twice. Where a piece runs back
 * along a stretch already drawn, that stretch is left out of it: a guide that
 * overshoots its station (Line 1's St Andrew and King) no longer folds the
 * path back on itself, and a branch drawn along its trunk (Lakeshore West's
 * Hamilton branch, below Aldershot) starts where it leaves the trunk. What is
 * left of a piece continues its subpath where it starts at the subpath's end,
 * and otherwise starts a new one; every trail starts a new subpath.
 */
export function withoutRetracedStretches(trails: MapPoint[][][]): MapPoint[][] {
  const subpaths: MapPoint[][] = [];
  const drawn: [MapPoint, MapPoint][] = [];
  const draw = (points: MapPoint[]) => {
    for (let index = 1; index < points.length; index++) drawn.push([points[index - 1], points[index]]);
  };

  for (const trail of trails) {
    let current: MapPoint[] = [];
    const finish = () => {
      const points = dedupePoints(current);
      if (points.length > 1) subpaths.push(points);
      current = [];
    };
    for (const piece of trail) {
      for (const { points, fromStart } of untracedStretches(dedupePoints(piece), drawn)) {
        const end = current.at(-1);
        if (!end || fromStart) current.push(...points);
        // Picking up where the subpath ends (past a guide's overshoot): join it there.
        else if (pointDistance(end, points[0]) <= RETRACE_TOLERANCE) current.push(...points.slice(1));
        else {
          finish();
          current.push(...points);
        }
      }
      // A piece may run along the trail's earlier pieces, not along itself.
      draw(piece);
    }
    finish();
  }
  return subpaths;
}

/**
 * A piece's stretches that do not run along any drawn edge for at least
 * `MIN_RETRACE_LENGTH`, and whether each starts at the piece's own start.
 */
function untracedStretches(
  piece: MapPoint[],
  drawn: readonly [MapPoint, MapPoint][],
): { points: MapPoint[]; fromStart: boolean }[] {
  const whole = [{ points: piece, fromStart: true }];
  if (piece.length < 2 || drawn.length === 0) return whole;
  const covered: [number, number][] = [];
  let travelled = 0;
  for (let index = 1; index < piece.length; index++) {
    const from = piece[index - 1];
    const to = piece[index];
    const length = pointDistance(from, to);
    for (const edge of drawn) {
      const range = edgeRunAlong(from, to, edge);
      if (range) covered.push([travelled + range[0] * length, travelled + range[1] * length]);
    }
    travelled += length;
  }

  // Merge the covered ranges and keep the long ones: those are retraced.
  covered.sort((a, b) => a[0] - b[0]);
  const retraced: [number, number][] = [];
  let run: [number, number] | null = null;
  for (const range of covered) {
    if (run && range[0] <= run[1] + 0.001) run[1] = Math.max(run[1], range[1]);
    else {
      if (run && run[1] - run[0] >= MIN_RETRACE_LENGTH) retraced.push(run);
      run = [...range];
    }
  }
  if (run && run[1] - run[0] >= MIN_RETRACE_LENGTH) retraced.push(run);
  if (retraced.length === 0) return whole;

  // Paths part at a shared vertex: a cut within the tolerance of one of the
  // piece's vertices (a branch leaving its trunk's corner) moves onto it.
  const vertices: number[] = [0];
  for (let index = 1; index < piece.length; index++) vertices.push(vertices[index - 1] + pointDistance(piece[index - 1], piece[index]));
  const snap = (distance: number) => vertices.find((vertex) => Math.abs(vertex - distance) <= RETRACE_TOLERANCE) ?? distance;

  const stretches: { points: MapPoint[]; fromStart: boolean }[] = [];
  let from = 0;
  for (const [start, end] of [...retraced, [travelled, travelled] as [number, number]]) {
    const to = snap(start);
    // Stubs left between retraced stretches are not drawn on their own.
    if (to - from >= MIN_RETRACE_LENGTH) stretches.push({ points: polylineStretch(piece, from, to), fromStart: from === 0 });
    from = snap(end);
  }
  return stretches;
}

/**
 * The part of edge `from`–`to` (as fractions of it) that runs along `edge`:
 * within the tolerance of its line, beside the edge itself rather than past its ends.
 */
function edgeRunAlong(from: MapPoint, to: MapPoint, [start, end]: [MapPoint, MapPoint]): [number, number] | null {
  const tolerance = RETRACE_TOLERANCE;
  if (
    Math.max(from.x, to.x) < Math.min(start.x, end.x) - tolerance
    || Math.min(from.x, to.x) > Math.max(start.x, end.x) + tolerance
    || Math.max(from.y, to.y) < Math.min(start.y, end.y) - tolerance
    || Math.min(from.y, to.y) > Math.max(start.y, end.y) + tolerance
  ) return null;
  const length = pointDistance(start, end);
  if (length === 0) return null;
  const along = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
  const offset = { x: from.x - start.x, y: from.y - start.y };
  const delta = { x: to.x - from.x, y: to.y - from.y };
  // Distance off the edge's line and position along it are linear in t.
  const across = linearRange(-along.y * offset.x + along.x * offset.y, -along.y * delta.x + along.x * delta.y, -tolerance, tolerance);
  const beside = linearRange(along.x * offset.x + along.y * offset.y, along.x * delta.x + along.y * delta.y, 0, length);
  if (!across || !beside) return null;
  const low = Math.max(across[0], beside[0]);
  const high = Math.min(across[1], beside[1]);
  return high > low ? [low, high] : null;
}

/** The t in [0, 1] where `low <= base + slope * t <= high`. */
function linearRange(base: number, slope: number, low: number, high: number): [number, number] | null {
  if (Math.abs(slope) < 1e-12) return base >= low && base <= high ? [0, 1] : null;
  const a = (low - base) / slope;
  const b = (high - base) / slope;
  const from = Math.max(0, Math.min(a, b));
  const to = Math.min(1, Math.max(a, b));
  return to >= from ? [from, to] : null;
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
