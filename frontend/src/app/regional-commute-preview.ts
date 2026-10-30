import type { NetworkSegment } from "./linewatch-data.ts";
import type { AccountCommutePathPreview } from "./commute-data.ts";
import type { PreparedMapGeometry } from "./map-geometry-data.ts";
import { regionalAnchorDot, resolvedRegionalSegmentPath } from "./regional-map-geometry.ts";
import { regionalStationPill } from "./regional-station-alerts.ts";
import {
  COMMUTE_ENDPOINT_DOT_RATIO,
  COMMUTE_ENDPOINT_FLASH_RATIO,
  type MapCommuteEndpoint,
  type MapCommutePreview,
} from "../components/map-overlays/commute-preview-model.ts";

/**
 * A GO/UP commute preview in the shared overlay model: one path through the route's segments, and the dot of
 * each end where the route meets it. Endpoints take TTC's sizes relative to
 * each dot.
 */
export function regionalCommutePreview(
  geometry: PreparedMapGeometry,
  preview: AccountCommutePathPreview | null,
  networkSegments: NetworkSegment[],
): MapCommutePreview | null {
  if (!preview || preview.stationIds.length === 0) return null;
  const segments = preview.segmentIds
    .map((segmentId) => networkSegments.find((segment) => segment.id === segmentId))
    .filter((segment): segment is NetworkSegment => Boolean(segment));
  const pathD = segments
    .map((segment) => resolvedRegionalSegmentPath(geometry, segment))
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
    const anchor = anchorId ? regionalAnchorDot(geometry, anchorId) : null;
    if (!anchorId || !anchor) return [];
    return [{
      key: `${role}:${stationId}:${anchor.id}`,
      stationId,
      role,
      center: anchor.point,
      dotRadius: anchor.radius * COMMUTE_ENDPOINT_DOT_RATIO,
      flashRadius: anchor.radius * COMMUTE_ENDPOINT_FLASH_RATIO,
      pill: regionalStationPill(geometry, anchorId),
    }];
  });
  return { id: preview.id, label: preview.routeLabel, pathD, endpoints };
}
