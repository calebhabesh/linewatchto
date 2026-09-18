/**
 * Geographic Overlays (Boundary 2)
 *
 * Pure projection of existing normalized dashboard selection, impact, and commute
 * data onto verified geographic catalog features.
 * No MapLibre or DOM dependencies.
 */

import type {
  GeographicCatalog,
  GeographicCoordinate,
  GeographicFeature,
  GeographicLinkFeature,
  GeographicStationFeature,
} from "./geographic-catalog.ts";
import {
  findStationFeature,
  getLinkFeatures,
  getStationFeatures,
} from "./geographic-catalog.ts";
import type {
  ImpactKind,
  ImpactSelection,
  MapImpact,
  NetworkSegment,
  StationNodeImpact,
  TravelDirection,
} from "./linewatch-data.ts";
import type { AccountCommutePathPreview } from "./account-data.ts";
import type { NetworkId } from "./regional-data.ts";
import { REGIONAL_ROUTE_STATIONS } from "./regional-data.ts";
import { STATION_LINE_STATION_IDS } from "./station-data.ts";

export type FeatureCollection<T = GeographicFeature> = {
  type: "FeatureCollection";
  features: T[];
};

export type ProjectedImpactLinkFeature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "LineString";
    coordinates: GeographicCoordinate[];
  };
  properties: {
    segmentId: string;
    lineId: string;
    network: NetworkId;
    impactKind: ImpactKind;
    impactColor: string;
    impactCardId: string;
    impactCount: number;
    allCardIds: string[];
    travelDirection: TravelDirection;
    isDashed: boolean;
    label: string;
  };
};

export type ProjectedImpactStationFeature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "Point";
    coordinates: GeographicCoordinate;
  };
  properties: {
    stationId: string;
    name: string;
    network: NetworkId;
    impactKind: ImpactKind;
    impactColor: string;
    cardId: string;
    title: string;
  };
};

export type ProjectedImpactBadgeFeature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "Point";
    coordinates: GeographicCoordinate;
  };
  properties: {
    targetId: string;
    targetType: "segment" | "station";
    impactKind: ImpactKind;
    impactColor: string;
    cardId: string;
    count: number;
    label: string;
  };
};

/**
 * Returns canonical hex color for a given impact kind and network.
 */
export function getImpactColor(kind: ImpactKind, network: NetworkId = "ttc"): string {
  switch (kind) {
    case "suspension":
      return "#ef4444";
    case "planned-closure":
      return "#3b82f6";
    case "reduced-speed-zone":
      return "#d97706";
    case "delay":
    default:
      return network === "regional" ? "#0ea5e9" : "#f59e0b";
  }
}

/**
 * Priority rank for impacts (higher number = higher visual prominence).
 */
export function getImpactPriority(kind: ImpactKind): number {
  switch (kind) {
    case "suspension":
      return 3;
    case "delay":
      return 2;
    case "planned-closure":
      return 1;
    case "reduced-speed-zone":
    default:
      return 0;
  }
}

/**
 * Splits a catalog into separated GeoJSON FeatureCollections for
 * Link lines and Station points.
 */
export function partitionCatalogFeatures(catalog: GeographicCatalog): {
  links: FeatureCollection<GeographicLinkFeature>;
  stations: FeatureCollection<GeographicStationFeature>;
} {
  return {
    links: {
      type: "FeatureCollection",
      features: getLinkFeatures(catalog),
    },
    stations: {
      type: "FeatureCollection",
      features: getStationFeatures(catalog),
    },
  };
}

/**
 * Retrieves coordinates for a selected station ID, or null if not found.
 */
export function getStationCoordinates(
  catalog: GeographicCatalog,
  stationId: string | null | undefined,
): GeographicCoordinate | null {
  if (!stationId) return null;
  const feature = findStationFeature(catalog, stationId);
  return feature ? feature.geometry.coordinates : null;
}

/**
 * Retrieves coordinates for a selected link segment ID, or null if not found.
 */
export function getLinkCoordinates(
  catalog: GeographicCatalog,
  segmentId: string | null | undefined,
): GeographicCoordinate[] | null {
  if (!segmentId) return null;
  const normalizedTarget = segmentId.replace(/^segment-/, "");
  const links = getLinkFeatures(catalog);
  const match = links.find((link) => {
    const norm = link.properties.segmentId.replace(/^segment-/, "");
    return norm === normalizedTarget;
  });
  return match ? match.geometry.coordinates : null;
}

/**
 * Calculates the midpoint coordinate along a polyline.
 */
export function getSegmentMidpoint(coordinates: GeographicCoordinate[]): GeographicCoordinate {
  if (!coordinates || coordinates.length === 0) return [0, 0];
  if (coordinates.length === 1) return coordinates[0];

  let totalDistance = 0;
  const segmentLengths: number[] = [];
  for (let i = 0; i < coordinates.length - 1; i++) {
    const [x1, y1] = coordinates[i];
    const [x2, y2] = coordinates[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    segmentLengths.push(len);
    totalDistance += len;
  }

  if (totalDistance === 0) return coordinates[0];

  const halfDistance = totalDistance / 2;
  let accumulated = 0;

  for (let i = 0; i < segmentLengths.length; i++) {
    const len = segmentLengths[i];
    if (accumulated + len >= halfDistance) {
      const remaining = halfDistance - accumulated;
      const ratio = len > 0 ? remaining / len : 0;
      const [x1, y1] = coordinates[i];
      const [x2, y2] = coordinates[i + 1];
      return [x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio];
    }
    accumulated += len;
  }

  return coordinates[Math.floor(coordinates.length / 2)];
}

/**
 * Returns station sequence for a given route/line.
 */
export function getLineStationIds(network: NetworkId, lineId: string): readonly string[] {
  if (network === "regional") {
    const raw = lineId.replace("regional-", "").toUpperCase();
    const code = raw as keyof typeof REGIONAL_ROUTE_STATIONS;
    return REGIONAL_ROUTE_STATIONS[code] ?? [];
  }
  return STATION_LINE_STATION_IDS[lineId] ?? [];
}

/**
 * Determines whether a link connecting stationAId and stationBId is within
 * a multi-station span from spanStationA to spanStationB on the given line.
 */
export function isLinkInStationSpan(
  linkStationA: string,
  linkStationB: string,
  spanStationA: string,
  spanStationB: string,
  lineStations: readonly string[],
): boolean {
  const spanIdxA = lineStations.indexOf(spanStationA);
  const spanIdxB = lineStations.indexOf(spanStationB);
  if (spanIdxA === -1 || spanIdxB === -1) return false;

  const minSpan = Math.min(spanIdxA, spanIdxB);
  const maxSpan = Math.max(spanIdxA, spanIdxB);

  const linkIdxA = lineStations.indexOf(linkStationA);
  const linkIdxB = lineStations.indexOf(linkStationB);
  if (linkIdxA === -1 || linkIdxB === -1) return false;

  const minLink = Math.min(linkIdxA, linkIdxB);
  const maxLink = Math.max(linkIdxA, linkIdxB);

  return minLink >= minSpan && maxLink <= maxSpan && maxLink - minLink === 1;
}

/**
 * Checks if an impact matches a segment or link.
 */
function impactMatchesCatalogLink(
  link: GeographicLinkFeature,
  segment: NetworkSegment,
  network: NetworkId,
): boolean {
  const normLinkSeg = link.properties.segmentId.replace(/^segment-/, "");
  const normSegmentId = segment.id.replace(/^segment-/, "");

  // Direct segment ID match
  if (normLinkSeg === normSegmentId) return true;

  // Direct endpoint match
  if (
    segment.stationAId &&
    segment.stationBId &&
    ((segment.stationAId === link.properties.stationAId && segment.stationBId === link.properties.stationBId) ||
      (segment.stationAId === link.properties.stationBId && segment.stationBId === link.properties.stationAId))
  ) {
    return true;
  }

  // Span match for multi-station segments (e.g. "line-1-finch-eglinton")
  const lineStations = getLineStationIds(network, segment.lineId || link.properties.lineId);
  if (segment.stationAId && segment.stationBId && lineStations.length > 0) {
    if (
      isLinkInStationSpan(
        link.properties.stationAId,
        link.properties.stationBId,
        segment.stationAId,
        segment.stationBId,
        lineStations,
      )
    ) {
      return true;
    }
  }

  // Span match derived from segment ID formatted as "<lineId>-<stationA>-<stationB>"
  const parts = segment.id.split("-");
  if (parts.length >= 4 && lineStations.length > 0) {
    for (let i = 2; i < parts.length - 1; i++) {
      const candA = parts.slice(1, i + 1).join("-");
      const candB = parts.slice(i + 1).join("-");
      if (lineStations.includes(candA) && lineStations.includes(candB)) {
        if (
          isLinkInStationSpan(
            link.properties.stationAId,
            link.properties.stationBId,
            candA,
            candB,
            lineStations,
          )
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Projects active disruptions from networkSegments onto verified catalog links.
 */
export function projectImpactedLinks(
  catalog: GeographicCatalog,
  networkSegments: NetworkSegment[],
  network: NetworkId = "ttc",
): FeatureCollection<ProjectedImpactLinkFeature> {
  const links = getLinkFeatures(catalog);
  const impactedFeatures: ProjectedImpactLinkFeature[] = [];

  // Filter segments that have active impacts
  const activeImpactSegments = networkSegments.filter(
    (seg) =>
      (seg.impacts && seg.impacts.length > 0) ||
      (seg.overlay && seg.overlay !== "clear"),
  );

  if (activeImpactSegments.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  for (const link of links) {
    const matchingSegments = activeImpactSegments.filter((seg) =>
      impactMatchesCatalogLink(link, seg, network),
    );
    if (matchingSegments.length === 0) continue;

    const allImpacts: MapImpact[] = [];
    for (const seg of matchingSegments) {
      if (seg.impacts && seg.impacts.length > 0) {
        allImpacts.push(...seg.impacts);
      } else if (seg.overlay && seg.overlay !== "clear") {
        allImpacts.push({
          kind: seg.overlay,
          cardId: seg.alertId || seg.id,
          travelDirection: seg.travelDirection || "bidirectional",
          sourceAlertIds: seg.sourceAlertIds || [],
        });
      }
    }

    if (allImpacts.length === 0) continue;

    // Pick highest-priority impact
    let primary = allImpacts[0];
    for (let i = 1; i < allImpacts.length; i++) {
      if (getImpactPriority(allImpacts[i].kind) > getImpactPriority(primary.kind)) {
        primary = allImpacts[i];
      }
    }

    const impactColor = getImpactColor(primary.kind, network);
    const allCardIds = [...new Set(allImpacts.map((imp) => imp.cardId))];

    impactedFeatures.push({
      type: "Feature",
      id: `impact-${link.id}`,
      geometry: {
        type: "LineString",
        coordinates: link.geometry.coordinates,
      },
      properties: {
        segmentId: link.properties.segmentId,
        lineId: link.properties.lineId,
        network,
        impactKind: primary.kind,
        impactColor,
        impactCardId: primary.cardId,
        impactCount: allImpacts.length,
        allCardIds,
        travelDirection: primary.travelDirection,
        isDashed: primary.kind === "planned-closure",
        label: matchingSegments[0]?.label || link.properties.segmentId,
      },
    });
  }

  return {
    type: "FeatureCollection",
    features: impactedFeatures,
  };
}

/**
 * Projects active station impacts onto verified catalog stations.
 */
export function projectImpactedStations(
  catalog: GeographicCatalog,
  stationNodeImpacts: StationNodeImpact[],
  network: NetworkId = "ttc",
): FeatureCollection<ProjectedImpactStationFeature> {
  const features: ProjectedImpactStationFeature[] = [];

  for (const impact of stationNodeImpacts) {
    const station = findStationFeature(catalog, impact.stationId);
    if (!station) continue;

    features.push({
      type: "Feature",
      id: `station-impact-${station.properties.stationId}-${impact.cardId}`,
      geometry: {
        type: "Point",
        coordinates: station.geometry.coordinates,
      },
      properties: {
        stationId: station.properties.stationId,
        name: station.properties.name,
        network,
        impactKind: impact.kind,
        impactColor: getImpactColor(impact.kind, network),
        cardId: impact.cardId,
        title: impact.title,
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

/**
 * Projects disruption badges at segment midpoints and impacted stations.
 */
export function projectImpactBadges(
  catalog: GeographicCatalog,
  impactedLinks: ProjectedImpactLinkFeature[],
  impactedStations: ProjectedImpactStationFeature[],
  network: NetworkId = "ttc",
): FeatureCollection<ProjectedImpactBadgeFeature> {
  void catalog;
  void network;
  const badges: ProjectedImpactBadgeFeature[] = [];
  const placedLocations = new Set<string>();

  // Badges for impacted links (at midpoint)
  for (const link of impactedLinks) {
    const midpoint = getSegmentMidpoint(link.geometry.coordinates);
    const locKey = `${midpoint[0].toFixed(4)},${midpoint[1].toFixed(4)}`;
    if (placedLocations.has(locKey)) continue;
    placedLocations.add(locKey);

    const count = link.properties.impactCount;
    let label = String(count);
    if (count <= 1) {
      switch (link.properties.impactKind) {
        case "suspension":
          label = "!";
          break;
        case "delay":
          label = "D";
          break;
        case "reduced-speed-zone":
          label = "RSZ";
          break;
        case "planned-closure":
          label = "C";
          break;
      }
    }

    badges.push({
      type: "Feature",
      id: `badge-seg-${link.properties.segmentId}`,
      geometry: {
        type: "Point",
        coordinates: midpoint,
      },
      properties: {
        targetId: link.properties.segmentId,
        targetType: "segment",
        impactKind: link.properties.impactKind,
        impactColor: link.properties.impactColor,
        cardId: link.properties.impactCardId,
        count,
        label,
      },
    });
  }

  // Badges for impacted stations
  for (const station of impactedStations) {
    const locKey = `${station.geometry.coordinates[0].toFixed(4)},${station.geometry.coordinates[1].toFixed(4)}`;
    if (placedLocations.has(locKey)) continue;
    placedLocations.add(locKey);

    badges.push({
      type: "Feature",
      id: `badge-sta-${station.properties.stationId}`,
      geometry: {
        type: "Point",
        coordinates: station.geometry.coordinates,
      },
      properties: {
        targetId: station.properties.stationId,
        targetType: "station",
        impactKind: station.properties.impactKind,
        impactColor: station.properties.impactColor,
        cardId: station.properties.cardId,
        count: 1,
        label: station.properties.impactKind === "suspension" ? "!" : "D",
      },
    });
  }

  return {
    type: "FeatureCollection",
    features: badges,
  };
}

/**
 * Projects a commute path preview onto catalog links and origin/destination stations.
 */
export function projectCommutePreview(
  catalog: GeographicCatalog,
  commutePreview: AccountCommutePathPreview | null | undefined,
): {
  links: FeatureCollection<GeographicLinkFeature & { properties: Record<string, unknown> }>;
  stations: FeatureCollection<GeographicStationFeature & { properties: Record<string, unknown> }>;
} {
  if (!commutePreview || (!commutePreview.segmentIds?.length && !commutePreview.stationIds?.length)) {
    return {
      links: { type: "FeatureCollection", features: [] },
      stations: { type: "FeatureCollection", features: [] },
    };
  }

  const catalogLinks = getLinkFeatures(catalog);
  const previewSegmentIds = new Set(commutePreview.segmentIds.map((s) => s.replace(/^segment-/, "")));

  const matchedLinks = catalogLinks.filter((link) => {
    const norm = link.properties.segmentId.replace(/^segment-/, "");
    return previewSegmentIds.has(norm);
  });

  const matchedStations: GeographicStationFeature[] = [];
  for (const stationId of commutePreview.stationIds) {
    const feat = findStationFeature(catalog, stationId);
    if (feat) matchedStations.push(feat);
  }

  return {
    links: {
      type: "FeatureCollection",
      features: matchedLinks.map((l) => ({
        ...l,
        properties: {
          ...l.properties,
          isCommute: true,
          routeLabel: commutePreview.routeLabel,
        },
      })),
    },
    stations: {
      type: "FeatureCollection",
      features: matchedStations.map((s, idx) => ({
        ...s,
        properties: {
          ...s.properties,
          isOrigin: idx === 0,
          isDestination: idx === matchedStations.length - 1,
          routeLabel: commutePreview.routeLabel,
        },
      })),
    },
  };
}

/**
 * Calculates geographic bounding box for an active selection so the camera
 * can focus smoothly on the selected impact.
 */
export function getSelectionBounds(
  catalog: GeographicCatalog,
  selection: ImpactSelection,
  networkSegments: NetworkSegment[],
  stationNodeImpacts: StationNodeImpact[],
): [[number, number], [number, number]] | null {
  if (!selection) return null;

  const coords: GeographicCoordinate[] = [];

  // Match station impacts
  const matchedStationImpacts = stationNodeImpacts.filter(
    (imp) => imp.cardId === selection.id,
  );
  for (const imp of matchedStationImpacts) {
    const stationCoords = getStationCoordinates(catalog, imp.stationId);
    if (stationCoords) coords.push(stationCoords);
  }

  // Match segment impacts
  const matchedSegments = networkSegments.filter((seg) => {
    if (seg.impacts?.some((imp) => imp.cardId === selection.id)) return true;
    if (seg.alertId === selection.id) return true;
    return false;
  });

  for (const seg of matchedSegments) {
    const links = getLinkFeatures(catalog).filter((link) =>
      impactMatchesCatalogLink(link, seg, catalog.network),
    );
    for (const link of links) {
      coords.push(...link.geometry.coordinates);
    }
  }

  if (coords.length === 0) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  // If a single point or negligible area, expand slightly for valid bounds
  if (Math.abs(maxLng - minLng) < 0.002 && Math.abs(maxLat - minLat) < 0.002) {
    return [
      [minLng - 0.008, minLat - 0.006],
      [maxLng + 0.008, maxLat + 0.006],
    ];
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}
