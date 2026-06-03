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
