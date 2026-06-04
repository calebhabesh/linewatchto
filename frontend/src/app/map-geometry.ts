import type { NetworkSegment, Station } from "./linewatch-data";

export type MapPoint = { x: number; y: number };

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

    // 1. Add extra point before start (at -step)
    {
      const pStart = path.getPointAtLength(0);
      const pAhead = path.getPointAtLength(Math.min(length, 1));
      const dx = pAhead.x - pStart.x;
      const dy = pAhead.y - pStart.y;
      const rad = Math.atan2(dy, dx);
      points.push({
        x: pStart.x - step * Math.cos(rad),
        y: pStart.y - step * Math.sin(rad),
        angle: rad * (180 / Math.PI),
      });
    }

    // 2. Add standard points from 0 to length
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

    // 3. Add extra point after end (at length + step)
    {
      const pEnd = path.getPointAtLength(length);
      const pBehind = path.getPointAtLength(Math.max(0, length - 1));
      const dx = pEnd.x - pBehind.x;
      const dy = pEnd.y - pBehind.y;
      const rad = Math.atan2(dy, dx);
      points.push({
        x: pEnd.x + step * Math.cos(rad),
        y: pEnd.y + step * Math.sin(rad),
        angle: rad * (180 / Math.PI),
      });
    }

    return { points, step };
  } catch (e) {
    console.error("Error sampling SVG path:", e);
    return { points: [], step: spacing };
  }
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

function pathToPolylinePoints(pathD: string): MapPoint[] {
  if (!pathD) {
    return [];
  }
  return measuredPathPoints(pathD) ?? parsedPathPoints(pathD);
}

function measuredPathPoints(pathD: string, spacing: number = 32): MapPoint[] | null {
  if (typeof document === "undefined") return null;
  try {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    const length = path.getTotalLength();
    if (length <= 0) return [];

    const count = Math.max(1, Math.ceil(length / spacing));
    const points: MapPoint[] = [];
    for (let i = 0; i <= count; i++) {
      const point = path.getPointAtLength((length * i) / count);
      points.push({ x: point.x, y: point.y });
    }
    return points;
  } catch {
    return null;
  }
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

function reversePoints(points: MapPoint[]): MapPoint[] {
  return [...points].reverse();
}

function pointsToPath(points: MapPoint[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return [`M ${formatPathNumber(first.x)} ${formatPathNumber(first.y)}`]
    .concat(rest.map((point) => `L ${formatPathNumber(point.x)} ${formatPathNumber(point.y)}`))
    .join(" ");
}

function pointDistance(a: MapPoint, b: MapPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
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
    const guide = guidePaths.get(segment.guidePathId);
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
    return `M ${pointA.x} ${pointA.y} L ${pointB.x} ${pointB.y}`;
  }
  return segment.pathD;
}

export function readSvgGeometry(
  root: SVGSVGElement,
  segments: NetworkSegment[],
): {
  anchorPoints: Map<string, MapPoint>;
  guidePaths: Map<string, string>;
} {
  const anchorIds = new Set(
    segments.flatMap((segment) =>
      [segment.stationAAnchorId, segment.stationBAnchorId].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );
  const anchorPoints = new Map<string, MapPoint>();
  for (const anchorId of anchorIds) {
    const element = root.querySelector<SVGGraphicsElement>(`#${CSS.escape(anchorId)}`);
    if (!element) continue;
    const box = element.getBBox();
    const point = root.createSVGPoint();
    point.x = box.x + box.width / 2;
    point.y = box.y + box.height / 2;
    const elementMatrix = element.getScreenCTM();
    const rootMatrix = root.getScreenCTM();
    let resolved = point;
    if (elementMatrix && rootMatrix) {
      const relativeMatrix = rootMatrix.inverse().multiply(elementMatrix);
      resolved = point.matrixTransform(relativeMatrix);
    } else if (elementMatrix) {
      resolved = point.matrixTransform(elementMatrix);
    }
    anchorPoints.set(anchorId, { x: resolved.x, y: resolved.y });
  }

  const guidePaths = new Map<string, string>();
  const guideLayer = Array.from(root.querySelectorAll<SVGGElement>("g")).find(
    (element) => element.getAttribute("inkscape:label") === "non-linear-guides-layer",
  );
  for (const path of guideLayer?.querySelectorAll<SVGPathElement>("path") ?? []) {
    const label = path.getAttribute("inkscape:label");
    const pathD = path.getAttribute("d");
    if (label && pathD) guidePaths.set(label, pathD);
  }
  return { anchorPoints, guidePaths };
}
