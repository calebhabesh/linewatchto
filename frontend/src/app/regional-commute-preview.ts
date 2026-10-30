import type { NetworkSegment } from "./linewatch-data.ts";
import type { AccountCommutePathPreview } from "./commute-data.ts";
import {
  regionalStationVisualAnchors,
  regionalSvgScope,
  resolvedRegionalSegmentPath,
} from "./regional-map-geometry.ts";
import { regionalStationPill } from "./regional-station-alerts.ts";
import {
  COMMUTE_ENDPOINT_DOT_RATIO,
  COMMUTE_ENDPOINT_FLASH_RATIO,
  type MapCommuteEndpoint,
  type MapCommutePreview,
} from "../components/map-overlays/commute-preview-model.ts";

/**
 * A GO/UP commute preview in the shared overlay model, in the stations
 * layer's coordinates: one path through the route's segments, and the dot of
 * each end where the route meets it. Endpoints take TTC's sizes relative to
 * each dot.
 */
export function regionalCommutePreview(
  svg: SVGSVGElement,
  preview: AccountCommutePathPreview | null,
  networkSegments: NetworkSegment[],
): MapCommutePreview | null {
  if (!preview || preview.stationIds.length === 0) return null;
  const documentNode = regionalSvgScope(svg);
  const segments = preview.segmentIds
    .map((segmentId) => networkSegments.find((segment) => segment.id === segmentId))
    .filter((segment): segment is NetworkSegment => Boolean(segment));
  const pathD = segments
    .map((segment) => resolvedRegionalSegmentPath(documentNode, segment))
    .filter((path): path is string => Boolean(path))
    .join(" ");

  const ends = [
    { stationId: preview.stationIds[0], role: "origin" as const },
    { stationId: preview.stationIds.at(-1), role: "destination" as const },
  ];
  const endpoints = ends.flatMap(({ stationId, role }): MapCommuteEndpoint[] => {
    if (!stationId) return [];
    const segment = segments.find((item) => item.stationAId === stationId || item.stationBId === stationId);
    const anchorId = segment?.stationAId === stationId ? segment.stationAAnchorId : segment?.stationBAnchorId;
    const anchorElement = anchorId ? documentNode.getElementById(anchorId) as SVGElement | null : null;
    const anchor = anchorElement ? regionalStationVisualAnchors(anchorElement)[0] : null;
    if (!anchorElement || !anchor) return [];
    return [{
      key: `${role}:${stationId}:${anchor.id}`,
      stationId,
      role,
      center: anchor.point,
      dotRadius: anchor.radius * COMMUTE_ENDPOINT_DOT_RATIO,
      flashRadius: anchor.radius * COMMUTE_ENDPOINT_FLASH_RATIO,
      pill: regionalStationPill(anchorElement),
    }];
  });
  return { id: preview.id, label: preview.routeLabel, pathD, endpoints };
}
