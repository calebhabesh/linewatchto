import type { NetworkSegment, Station } from "./linewatch-data";

export type MapPoint = { x: number; y: number };

export function visualTravelDirection(segment: NetworkSegment) {
  const direction = segment.travelDirection ?? "bidirectional";
  if (!segment.guidePathReversed || direction === "bidirectional") {
    return direction;
  }
  return direction === "forward" ? "reverse" : "forward";
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
    (element) => element.getAttribute("inkscape:label") === "segment-guides-layer",
  );
  for (const path of guideLayer?.querySelectorAll<SVGPathElement>("path") ?? []) {
    const label = path.getAttribute("inkscape:label");
    const pathD = path.getAttribute("d");
    if (label && pathD) guidePaths.set(label, pathD);
  }
  return { anchorPoints, guidePaths };
}
