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
  ActiveAlert,
  ImpactKind,
  ImpactSelection,
  MapImpact,
  NetworkSegment,
  PlannedClosure,
  StationNodeImpact,
  TravelDirection,
} from "./linewatch-data.ts";
import type { AccountCommutePathPreview } from "./account-data.ts";
import type { NetworkId } from "./regional-data.ts";
import { REGIONAL_ROUTE_STATIONS } from "./regional-data.ts";
import { STATION_LINE_STATION_IDS } from "./station-data.ts";
import {
  countUniqueImpactsByKind,
  getEligiblePlannedClosures,
  getImpactPriority,
  normalizeActiveClosureMapImpact,
  resolveTravelDirectionFromDisplay,
} from "./map-alert-selector.ts";
import { ALL_LINE_COLORS } from "./geographic-config.ts";
import type { EstimatedTrainMarker } from "./train-markers.ts";
import { getOverlapBadgeKey } from "../components/map-overlap-svg.ts";

export { getImpactPriority };

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
    allImpactKinds?: ImpactKind[];
    rawImpacts?: MapImpact[];
    travelDirection: TravelDirection;
    directionCertainty?: "explicit" | "unspecified";
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
    allCardIds?: string[];
    title: string;
    rawImpacts?: MapImpact[];
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
    allCardIds?: string[];
    count: number;
    label: string;
    isOverlap?: boolean;
    isSelected?: boolean;
    visualItemCount?: number;
    pillImage?: string;
    kinds?: ImpactKind[];
    kindCounts?: Array<{ kind: ImpactKind; count: number }>;
    badgeImageKey?: string;
    rawImpacts?: Array<{
      kind: ImpactKind;
      cardId: string;
      travelDirection?: TravelDirection;
      sourceAlertIds?: string[];
    }>;
    slot0_kind?: string;
    slot0_count?: number;
    slot0_label?: string;
    slot0_color?: string;
    slot0_offsetX?: number;
    slot1_kind?: string;
    slot1_count?: number;
    slot1_label?: string;
    slot1_color?: string;
    slot1_offsetX?: number;
    slot2_kind?: string;
    slot2_count?: number;
    slot2_label?: string;
    slot2_color?: string;
    slot2_offsetX?: number;
    slot3_kind?: string;
    slot3_count?: number;
    slot3_label?: string;
    slot3_color?: string;
    slot3_offsetX?: number;
  };
};

export type ProjectedImpactArrowFeature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "Point";
    coordinates: GeographicCoordinate;
  };
  properties: {
    targetId: string;
    lineId: string;
    impactKind: ImpactKind;
    impactColor: string;
    casingColor?: string;
    coreColor?: string;
    iconImage?: string;
    fraction?: number;
    cardId: string;
    allCardIds: string[];
    bearing: number;
    travelDirection: TravelDirection;
    directionCertainty: "explicit" | "unspecified";
    isSelected: boolean;
  };
};

export type ProjectedTrainMarkerFeature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "Point";
    coordinates: GeographicCoordinate;
  };
  properties: {
    markerId: string;
    lineId: string;
    lineColor: string;
    direction: string;
    travelDirection: TravelDirection;
    nextStationId: string;
    fromStationId: string;
    toStationId: string;
    progress: number;
    bearing: number;
    vehicleId?: string;
    tripId?: string;
    label: string;
    isSelected: boolean;
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

export interface ImpactArrowColors {
  casingColor: string;
  coreColor: string;
}

/**
 * Returns light/core and dark/casing arrow color pair derived from the governing impact kind.
 * When highContrast is enabled, falls back to high-contrast casing/core (#0f172a / #ffffff).
 */
export function getImpactArrowColors(
  kind: ImpactKind,
  network: NetworkId = "ttc",
  highContrast: boolean = false,
): ImpactArrowColors {
  if (highContrast) {
    return {
      casingColor: "#0f172a",
      coreColor: "#ffffff",
    };
  }

  switch (kind) {
    case "suspension":
      return { casingColor: "#991b1b", coreColor: "#fecaca" };
    case "planned-closure":
      return { casingColor: "#1e40af", coreColor: "#bfdbfe" };
    case "reduced-speed-zone":
      return { casingColor: "#78350f", coreColor: "#fde68a" };
    case "delay":
    default:
      if (network === "regional") {
        return { casingColor: "#075985", coreColor: "#bae6fd" };
      }
      return { casingColor: "#92400e", coreColor: "#fde68a" };
  }
}

/**
 * Returns canonical single-impact glyph label for an impact kind.
 */
export function getDefaultImpactBadgeLabel(kind: ImpactKind): string {
  switch (kind) {
    case "suspension":
      return "!";
    case "delay":
      return "D";
    case "reduced-speed-zone":
      return "RSZ";
    case "planned-closure":
      return "C";
    default:
      return "!";
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
 * Calculates a coordinate at a fractional distance along a polyline.
 */
export function getPointAlongPolyline(
  coordinates: GeographicCoordinate[],
  fraction: number = 0.5,
): GeographicCoordinate {
  if (!coordinates || coordinates.length === 0) return [0, 0];
  if (coordinates.length === 1) return coordinates[0];

  const clampedFraction = Math.max(0, Math.min(1, fraction));

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

  const targetDistance = totalDistance * clampedFraction;
  let accumulated = 0;

  for (let i = 0; i < segmentLengths.length; i++) {
    const len = segmentLengths[i];
    if (accumulated + len >= targetDistance) {
      const remaining = targetDistance - accumulated;
      const ratio = len > 0 ? remaining / len : 0;
      const [x1, y1] = coordinates[i];
      const [x2, y2] = coordinates[i + 1];
      return [x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio];
    }
    accumulated += len;
  }

  return coordinates[coordinates.length - 1];
}

/**
 * Calculates the midpoint coordinate along a polyline.
 */
export function getSegmentMidpoint(coordinates: GeographicCoordinate[]): GeographicCoordinate {
  return getPointAlongPolyline(coordinates, 0.5);
}

/**
 * Haversine distance in meters between two geographic coordinates [lon, lat].
 */
export function getCoordinateDistanceMeters(
  coord1: GeographicCoordinate,
  coord2: GeographicCoordinate,
): number {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export type PolylineDistanceTable = {
  segmentLengths: number[];
  cumulativeDistances: number[];
  totalDistance: number;
};

const linkDistanceTableCache = new Map<string, PolylineDistanceTable>();

export function getCachedPolylineDistances(
  linkId: string,
  coordinates: GeographicCoordinate[],
  catalogRevision: string = "default",
): PolylineDistanceTable {
  const cacheKey = `${catalogRevision}:${linkId}:${coordinates.length}`;
  const existing = linkDistanceTableCache.get(cacheKey);
  if (existing) return existing;

  const segmentLengths: number[] = [];
  const cumulativeDistances: number[] = [0];
  let totalDistance = 0;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const d = getCoordinateDistanceMeters(coordinates[i], coordinates[i + 1]);
    segmentLengths.push(d);
    totalDistance += d;
    cumulativeDistances.push(totalDistance);
  }

  const table: PolylineDistanceTable = {
    segmentLengths,
    cumulativeDistances,
    totalDistance,
  };
  linkDistanceTableCache.set(cacheKey, table);
  return table;
}

/**
 * Calculates a coordinate and its tangent bearing along a polyline at a fractional distance.
 * Returns bearing in degrees (0 - 360 clockwise from North).
 */
export function getPointAndBearingAlongPolyline(
  coordinates: GeographicCoordinate[],
  fraction: number = 0.5,
): { coordinates: GeographicCoordinate; bearing: number } {
  if (!coordinates || coordinates.length === 0) {
    return { coordinates: [0, 0], bearing: 0 };
  }
  if (coordinates.length === 1) {
    return { coordinates: coordinates[0], bearing: 0 };
  }

  const clampedFraction = Math.max(0, Math.min(1, fraction));
  const table = getCachedPolylineDistances("temp", coordinates);
  const targetDistance = table.totalDistance * clampedFraction;

  if (table.totalDistance === 0) {
    return { coordinates: coordinates[0], bearing: 0 };
  }

  for (let i = 0; i < table.segmentLengths.length; i++) {
    const segLen = table.segmentLengths[i];
    const segStartDist = table.cumulativeDistances[i];
    const segEndDist = table.cumulativeDistances[i + 1];

    if (targetDistance <= segEndDist || i === table.segmentLengths.length - 1) {
      const remaining = targetDistance - segStartDist;
      const ratio = segLen > 0 ? Math.max(0, Math.min(1, remaining / segLen)) : 0;
      const [x1, y1] = coordinates[i];
      const [x2, y2] = coordinates[i + 1];
      const pt: GeographicCoordinate = [x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio];

      const dx = x2 - x1;
      const dy = y2 - y1;
      const bearing = (Math.atan2(dx, dy) * (180 / Math.PI) + 360) % 360;

      return { coordinates: pt, bearing };
    }
  }

  const lastIdx = coordinates.length - 1;
  const dx = coordinates[lastIdx][0] - coordinates[lastIdx - 1][0];
  const dy = coordinates[lastIdx][1] - coordinates[lastIdx - 1][1];
  const bearing = (Math.atan2(dx, dy) * (180 / Math.PI) + 360) % 360;
  return { coordinates: coordinates[lastIdx], bearing };
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
 * Determines whether link coordinates run in the forward topology direction
 * (increasing station index along the line).
 */
export function isLinkPolylineForward(
  catalog: GeographicCatalog,
  link: GeographicLinkFeature,
): boolean {
  const lineStations = getLineStationIds(catalog.network, link.properties.lineId);
  const idxA = lineStations.indexOf(link.properties.stationAId);
  const idxB = lineStations.indexOf(link.properties.stationBId);

  // If station sequence is known, determine topological order from A to B
  const isAtoBForward = idxA !== -1 && idxB !== -1 ? idxA < idxB : true;

  // Determine whether coordinates[0] is closer to stationA or stationB
  const coords = link.geometry.coordinates;
  if (!coords || coords.length === 0) return true;
  const firstCoord = coords[0];

  const featA = findStationFeature(catalog, link.properties.stationAId);
  const featB = findStationFeature(catalog, link.properties.stationBId);

  if (featA && featB) {
    const distA = getCoordinateDistanceMeters(firstCoord, featA.geometry.coordinates);
    const distB = getCoordinateDistanceMeters(firstCoord, featB.geometry.coordinates);
    const coordsStartAtA = distA <= distB;
    return coordsStartAtA ? isAtoBForward : !isAtoBForward;
  }

  return link.properties.direction !== "reverse" ? isAtoBForward : !isAtoBForward;
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
  // Never match across unrelated routes if lineId is specified on both
  if (segment.lineId && link.properties.lineId && segment.lineId !== link.properties.lineId) {
    return false;
  }

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
 * Projects active disruptions from networkSegments and planned-closure previews
 * onto verified catalog links.
 */
export function projectImpactedLinks(
  catalog: GeographicCatalog,
  networkSegments: NetworkSegment[],
  network: NetworkId = "ttc",
  options?: {
    plannedClosures?: PlannedClosure[];
    activeAlerts?: ActiveAlert[];
    selection?: ImpactSelection;
  },
): FeatureCollection<ProjectedImpactLinkFeature> {
  const links = getLinkFeatures(catalog);
  const impactedFeatures: ProjectedImpactLinkFeature[] = [];

  const { eligiblePlannedClosures, activeClosureImpactCardIds } = getEligiblePlannedClosures(
    options?.plannedClosures ?? [],
    options?.activeAlerts ?? [],
    options?.selection,
  );

  // Normalize segments and attach planned-closure preview impacts
  const augmentedSegments = networkSegments.map((seg) => {
    const impacts: MapImpact[] = [];
    if (seg.impacts && seg.impacts.length > 0) {
      for (const raw of seg.impacts) {
        const norm = normalizeActiveClosureMapImpact(raw, activeClosureImpactCardIds);
        const activeAlert = options?.activeAlerts?.find(
          (a) => a.id === norm.cardId || norm.sourceAlertIds?.includes(a.id),
        );
        const resolved = resolveTravelDirectionFromDisplay(
          activeAlert?.displayDirection ?? norm.travelDirection,
          seg.lineId,
          seg.stationAId,
          seg.stationBId,
          network,
        );
        impacts.push({
          ...norm,
          travelDirection: resolved.travelDirection,
          directionCertainty: resolved.directionCertainty,
        });
      }
    } else if (seg.overlay && seg.overlay !== "clear") {
      const activeAlert = options?.activeAlerts?.find((a) => a.id === seg.alertId);
      const resolved = resolveTravelDirectionFromDisplay(
        activeAlert?.displayDirection ?? seg.travelDirection,
        seg.lineId,
        seg.stationAId,
        seg.stationBId,
        network,
      );
      impacts.push(
        normalizeActiveClosureMapImpact(
          {
            kind: seg.overlay,
            cardId: seg.alertId || seg.id,
            travelDirection: resolved.travelDirection,
            directionCertainty: resolved.directionCertainty,
            sourceAlertIds: seg.sourceAlertIds || [],
          },
          activeClosureImpactCardIds,
        ),
      );
    }

    // Attach any eligible planned preview closures that cover this segment
    for (const closure of eligiblePlannedClosures) {
      if (closure.previewSegmentIds?.includes(seg.id)) {
        if (!impacts.some((imp) => imp.kind === "planned-closure" && imp.cardId === closure.id)) {
          const resolved = closure.travelDirection
            ? { travelDirection: closure.travelDirection, directionCertainty: "explicit" as const }
            : resolveTravelDirectionFromDisplay(
                closure.displayDirection,
                closure.lineId,
                seg.stationAId,
                seg.stationBId,
                network,
              );
          impacts.push({
            kind: "planned-closure",
            cardId: closure.id,
            travelDirection: resolved.travelDirection,
            directionCertainty: resolved.directionCertainty,
            sourceAlertIds: [closure.id],
          });
        }
      }
    }

    return { ...seg, impacts };
  });

  const activeImpactSegments = augmentedSegments.filter(
    (seg) => (seg.impacts && seg.impacts.length > 0) || (seg.overlay && seg.overlay !== "clear"),
  );

  for (const link of links) {
    const matchingSegments = activeImpactSegments.filter((seg) =>
      impactMatchesCatalogLink(link, seg, network),
    );

    const allImpacts: MapImpact[] = [];
    for (const seg of matchingSegments) {
      if (seg.impacts && seg.impacts.length > 0) {
        allImpacts.push(...seg.impacts);
      }
    }

    // Also match planned preview closures that directly identify this catalog link
    for (const closure of eligiblePlannedClosures) {
      const normLinkSeg = link.properties.segmentId.replace(/^segment-/, "");
      const matchesClosure = closure.previewSegmentIds?.some(
        (s) => s === link.properties.segmentId || s.replace(/^segment-/, "") === normLinkSeg,
      );
      if (matchesClosure) {
        if (!allImpacts.some((imp) => imp.kind === "planned-closure" && imp.cardId === closure.id)) {
          const resolved = closure.travelDirection
            ? { travelDirection: closure.travelDirection, directionCertainty: "explicit" as const }
            : resolveTravelDirectionFromDisplay(
                closure.displayDirection,
                closure.lineId,
                link.properties.stationAId,
                link.properties.stationBId,
                network,
              );
          allImpacts.push({
            kind: "planned-closure",
            cardId: closure.id,
            travelDirection: resolved.travelDirection,
            directionCertainty: resolved.directionCertainty,
            sourceAlertIds: [closure.id],
          });
        }
      }
    }

    if (allImpacts.length === 0) continue;

    // Deduplicate impacts by (kind, cardId)
    const uniqueImpacts: MapImpact[] = [];
    const seenImpactKeys = new Set<string>();
    for (const imp of allImpacts) {
      const key = `${imp.kind}:${imp.cardId}`;
      if (!seenImpactKeys.has(key)) {
        seenImpactKeys.add(key);
        uniqueImpacts.push(imp);
      }
    }

    // Pick highest-priority impact: suspension > delay > planned-closure > reduced-speed-zone
    let primary = uniqueImpacts[0];
    for (let i = 1; i < uniqueImpacts.length; i++) {
      if (getImpactPriority(uniqueImpacts[i].kind) > getImpactPriority(primary.kind)) {
        primary = uniqueImpacts[i];
      }
    }

    const impactColor = getImpactColor(primary.kind, network);

    // Collect all card IDs across all overlapping impacts for secondary selection
    const cardIdSet = new Set<string>();
    for (const imp of uniqueImpacts) {
      cardIdSet.add(imp.cardId);
      for (const srcId of imp.sourceAlertIds ?? []) {
        cardIdSet.add(srcId);
      }
      const activeChildId = activeClosureImpactCardIds.get(imp.cardId);
      if (activeChildId) cardIdSet.add(activeChildId);
    }
    const allCardIds = Array.from(cardIdSet);

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
        impactCount: uniqueImpacts.length,
        allCardIds,
        allImpactKinds: [...new Set(uniqueImpacts.map((imp) => imp.kind))],
        rawImpacts: uniqueImpacts,
        travelDirection: primary.travelDirection,
        directionCertainty: primary.directionCertainty ?? "unspecified",
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

  // Group impacts by station
  const stationImpactsMap = new Map<string, StationNodeImpact[]>();
  for (const impact of stationNodeImpacts) {
    const list = stationImpactsMap.get(impact.stationId) ?? [];
    list.push(impact);
    stationImpactsMap.set(impact.stationId, list);
  }

  for (const [stationId, impacts] of stationImpactsMap) {
    const station = findStationFeature(catalog, stationId);
    if (!station) continue;

    // Deduplicate impacts by (kind, cardId)
    const uniqueMap = new Map<string, StationNodeImpact>();
    for (const imp of impacts) {
      uniqueMap.set(`${imp.kind}:${imp.cardId}`, imp);
    }
    const uniqueImpacts = Array.from(uniqueMap.values());

    // Pick highest priority impact for station ring
    let primary = uniqueImpacts[0];
    for (let i = 1; i < uniqueImpacts.length; i++) {
      if (getImpactPriority(uniqueImpacts[i].kind) > getImpactPriority(primary.kind)) {
        primary = uniqueImpacts[i];
      }
    }

    const allCardIds = [...new Set(uniqueImpacts.map((imp) => imp.cardId))];
    const rawImpacts: MapImpact[] = uniqueImpacts.map((imp) => ({
      kind: imp.kind,
      cardId: imp.cardId,
      travelDirection: "bidirectional",
      sourceAlertIds: [imp.cardId],
    }));

    features.push({
      type: "Feature",
      id: `station-impact-${station.properties.stationId}`,
      geometry: {
        type: "Point",
        coordinates: station.geometry.coordinates,
      },
      properties: {
        stationId: station.properties.stationId,
        name: station.properties.name,
        network,
        impactKind: primary.kind,
        impactColor: getImpactColor(primary.kind, network),
        cardId: primary.cardId,
        allCardIds,
        title: primary.title,
        rawImpacts,
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
 * Renders stable overlap pills for multi-impact groups and compact single badges
 * for lone impacts, with per-kind icons and deduplicated count bubbles.
 */
export function projectImpactBadges(
  catalog: GeographicCatalog,
  impactedLinks: ProjectedImpactLinkFeature[],
  impactedStations: ProjectedImpactStationFeature[],
  network: NetworkId = "ttc",
  selection?: ImpactSelection,
): FeatureCollection<ProjectedImpactBadgeFeature> {
  const badges: ProjectedImpactBadgeFeature[] = [];

  const catalogLinksById = new Map(
    getLinkFeatures(catalog).map((link) => [
      link.properties.segmentId.replace(/^segment-/, ""),
      link,
    ]),
  );

  // Deterministically sort impacted links by segmentId so grouping & anchors are stable
  const sortedImpactedLinks = [...impactedLinks].sort((a, b) =>
    a.properties.segmentId.localeCompare(b.properties.segmentId),
  );
  const pendingLinks = new Set(sortedImpactedLinks);
  const linkGroups: ProjectedImpactLinkFeature[][] = [];

  while (pendingLinks.size > 0) {
    const first = pendingLinks.values().next().value as ProjectedImpactLinkFeature;
    pendingLinks.delete(first);
    const rawFirst = first.properties.rawImpacts ?? [];
    const signature = rawFirst
      .map((impact) => `${impact.kind}:${impact.cardId}`)
      .sort()
      .join("|");
    const component = [first];
    const stationIds = new Set<string>();
    const addEndpoints = (link: ProjectedImpactLinkFeature) => {
      const catalogLink = catalogLinksById.get(link.properties.segmentId.replace(/^segment-/, ""));
      if (catalogLink?.properties.stationAId) stationIds.add(catalogLink.properties.stationAId);
      if (catalogLink?.properties.stationBId) stationIds.add(catalogLink.properties.stationBId);
    };
    addEndpoints(first);

    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const candidate of [...pendingLinks]) {
        if (candidate.properties.lineId !== first.properties.lineId) continue;
        const candidateSignature = (candidate.properties.rawImpacts ?? [])
          .map((impact) => `${impact.kind}:${impact.cardId}`)
          .sort()
          .join("|");
        if (candidateSignature !== signature) continue;
        const catalogLink = catalogLinksById.get(candidate.properties.segmentId.replace(/^segment-/, ""));
        if (!catalogLink || !(
          stationIds.has(catalogLink.properties.stationAId)
          || stationIds.has(catalogLink.properties.stationBId)
        )) continue;
        pendingLinks.delete(candidate);
        component.push(candidate);
        addEndpoints(candidate);
        expanded = true;
      }
    }
    component.sort((a, b) => a.properties.segmentId.localeCompare(b.properties.segmentId));
    linkGroups.push(component);
  }

  // Helper to compute slot properties for overlap pills
  const populateSlotProperties = (
    props: Record<string, unknown>,
    kindCounts: Array<{ kind: ImpactKind; count: number }>,
    visualItemCount: number,
  ) => {
    const visibleKinds = kindCounts.slice(0, 3);
    const hiddenCount = Math.max(0, kindCounts.length - 3);

    visibleKinds.forEach(({ kind, count }, index) => {
      const offsetX = Math.round((index - (visualItemCount - 1) / 2) * 28);
      props[`slot${index}_kind`] = kind;
      props[`slot${index}_count`] = count;
      props[`slot${index}_label`] = getDefaultImpactBadgeLabel(kind);
      props[`slot${index}_color`] = getImpactColor(kind, network);
      props[`slot${index}_offsetX`] = offsetX;
    });

    if (hiddenCount > 0) {
      const overflowIndex = visibleKinds.length;
      const offsetX = Math.round((overflowIndex - (visualItemCount - 1) / 2) * 28);
      props[`slot${overflowIndex}_kind`] = "more";
      props[`slot${overflowIndex}_count`] = 1;
      props[`slot${overflowIndex}_label`] = `+${hiddenCount}`;
      props[`slot${overflowIndex}_color`] = "#334155";
      props[`slot${overflowIndex}_offsetX`] = offsetX;
    }
  };

  // Process link groups: exactly one stable marker per contiguous corridor
  for (const group of linkGroups) {
    const link = group[0];
    const allRawImpacts: Array<{
      kind: ImpactKind;
      cardId: string;
      travelDirection?: TravelDirection;
      sourceAlertIds?: string[];
    }> = [];

    for (const item of group) {
      const raw = item.properties.rawImpacts ?? [
        {
          kind: item.properties.impactKind,
          cardId: item.properties.impactCardId,
          travelDirection: item.properties.travelDirection,
          sourceAlertIds: item.properties.allCardIds,
        },
      ];
      for (const imp of raw) {
        if (!allRawImpacts.some((existing) => existing.kind === imp.kind && existing.cardId === imp.cardId)) {
          allRawImpacts.push(imp);
        }
      }
    }

    const kindCounts = countUniqueImpactsByKind(allRawImpacts);
    const isOverlap = allRawImpacts.length > 1;
    const visibleKinds = kindCounts.slice(0, 3);
    const hiddenCount = Math.max(0, kindCounts.length - 3);
    const visualItemCount = isOverlap
      ? visibleKinds.length + (hiddenCount > 0 ? 1 : 0)
      : 1;

    // Deterministic corridor anchor at 0.5 fraction, displaced 16m off track
    const distanceTables = group.map((item) => getCachedPolylineDistances(
      item.id,
      item.geometry.coordinates,
      catalog.coverage?.status ?? "default",
    ));
    const totalDistance = distanceTables.reduce((sum, table) => sum + table.totalDistance, 0);
    const targetDistance = totalDistance * 0.5;
    let traversed = 0;
    let sample = getPointAndBearingAlongPolyline(group[0].geometry.coordinates, 0.5);
    for (let i = 0; i < group.length; i++) {
      const segDist = distanceTables[i].totalDistance;
      if (targetDistance <= traversed + segDist || i === group.length - 1) {
        const localFraction = segDist > 0 ? Math.max(0, Math.min(1, (targetDistance - traversed) / segDist)) : 0.5;
        sample = getPointAndBearingAlongPolyline(group[i].geometry.coordinates, localFraction);
        break;
      }
      traversed += segDist;
    }

    const perpRad = ((sample.bearing + 90) % 360) * (Math.PI / 180);
    const offsetMeters = 16;
    const metersPerLat = 111139;
    const metersPerLng = 111139 * Math.cos(sample.coordinates[1] * (Math.PI / 180));
    const dLat = (offsetMeters * Math.cos(perpRad)) / metersPerLat;
    const dLng = (offsetMeters * Math.sin(perpRad)) / metersPerLng;
    const anchorCoords: GeographicCoordinate = [
      Number((sample.coordinates[0] + dLng).toFixed(6)),
      Number((sample.coordinates[1] + dLat).toFixed(6)),
    ];

    const governingKind = kindCounts[0]?.kind ?? "delay";
    const governingColor = getImpactColor(governingKind, network);
    const primaryCardId = allRawImpacts[0]?.cardId ?? link.properties.impactCardId;
    const allCardIds = [...new Set(allRawImpacts.map((imp) => imp.cardId))];

    const isSelected = Boolean(
      selection?.id && (allCardIds.includes(selection.id) || link.properties.allCardIds.includes(selection.id))
    );

    const properties: ProjectedImpactBadgeFeature["properties"] = {
      targetId: link.properties.segmentId,
      targetType: "segment",
      impactKind: governingKind,
      impactColor: governingColor,
      cardId: primaryCardId,
      allCardIds,
      count: kindCounts[0]?.count ?? 1,
      label: getDefaultImpactBadgeLabel(governingKind),
      isOverlap,
      isSelected,
      visualItemCount,
      pillImage: isOverlap ? `pill-bg-${visualItemCount}` : "pill-bg-1",
      kinds: kindCounts.map((kc) => kc.kind),
      kindCounts,
      badgeImageKey: getOverlapBadgeKey({ kindCounts, isSelected }),
      rawImpacts: allRawImpacts,
    };

    if (isOverlap) {
      populateSlotProperties(properties as unknown as Record<string, unknown>, kindCounts, visualItemCount);
    }

    badges.push({
      type: "Feature",
      id: `badge-seg-${group.map((item) => item.properties.segmentId).join("+")}`,
      geometry: {
        type: "Point",
        coordinates: anchorCoords,
      },
      properties,
    });
  }

  // Process impacted stations: exactly one stable marker per station
  for (const station of impactedStations) {
    const raw = station.properties.rawImpacts ?? [
      {
        kind: station.properties.impactKind,
        cardId: station.properties.cardId,
        travelDirection: "bidirectional" as TravelDirection,
        sourceAlertIds: station.properties.allCardIds ?? [station.properties.cardId],
      },
    ];

    const allRawImpacts: Array<{
      kind: ImpactKind;
      cardId: string;
      travelDirection?: TravelDirection;
      sourceAlertIds?: string[];
    }> = [];

    for (const imp of raw) {
      if (!allRawImpacts.some((existing) => existing.kind === imp.kind && existing.cardId === imp.cardId)) {
        allRawImpacts.push(imp);
      }
    }

    const kindCounts = countUniqueImpactsByKind(allRawImpacts);
    const isOverlap = allRawImpacts.length > 1;
    const visibleKinds = kindCounts.slice(0, 3);
    const hiddenCount = Math.max(0, kindCounts.length - 3);
    const visualItemCount = isOverlap
      ? visibleKinds.length + (hiddenCount > 0 ? 1 : 0)
      : 1;

    // Anchor displaced ~35m North (lat) off the station ring
    const anchorCoords: GeographicCoordinate = [
      station.geometry.coordinates[0],
      Number((station.geometry.coordinates[1] + 0.00035).toFixed(6)),
    ];

    const governingKind = kindCounts[0]?.kind ?? "delay";
    const governingColor = getImpactColor(governingKind, network);
    const primaryCardId = allRawImpacts[0]?.cardId ?? station.properties.cardId;
    const allCardIds = [...new Set(allRawImpacts.map((imp) => imp.cardId))];

    const isSelected = Boolean(
      selection?.id && (allCardIds.includes(selection.id) || station.properties.allCardIds?.includes(selection.id))
    );

    const properties: ProjectedImpactBadgeFeature["properties"] = {
      targetId: station.properties.stationId,
      targetType: "station",
      impactKind: governingKind,
      impactColor: governingColor,
      cardId: primaryCardId,
      allCardIds,
      count: kindCounts[0]?.count ?? 1,
      label: getDefaultImpactBadgeLabel(governingKind),
      isOverlap,
      isSelected,
      visualItemCount,
      pillImage: isOverlap ? `pill-bg-${visualItemCount}` : "pill-bg-1",
      kinds: kindCounts.map((kc) => kc.kind),
      kindCounts,
      badgeImageKey: getOverlapBadgeKey({ kindCounts, isSelected }),
      rawImpacts: allRawImpacts,
    };

    if (isOverlap) {
      populateSlotProperties(properties as unknown as Record<string, unknown>, kindCounts, visualItemCount);
    }

    badges.push({
      type: "Feature",
      id: `badge-sta-${station.properties.stationId}`,
      geometry: {
        type: "Point",
        coordinates: anchorCoords,
      },
      properties,
    });
  }

  return {
    type: "FeatureCollection",
    features: badges,
  };
}

export const DEFAULT_ARROW_SPACING_METERS = 320;
export const ARROW_SPACING_METERS = DEFAULT_ARROW_SPACING_METERS;
export const MAX_ARROWS_PER_LINK = 6;

/**
 * Projects spaced, static directional indicators along affected catalog links.
 * Forward, reverse, and bidirectional indicators are strictly resolved against
 * line topology endpoints and coordinate tangents, never geographic north alone.
 * Keeps at least one indicator on short links, repeats them at bounded intervals,
 * and avoids inferring arrows for unknown directions.
 */
export function projectImpactArrows(
  catalog: GeographicCatalog,
  impactedLinks: ProjectedImpactLinkFeature[],
  selection?: ImpactSelection,
): FeatureCollection<ProjectedImpactArrowFeature> {
  const features: ProjectedImpactArrowFeature[] = [];
  const links = getLinkFeatures(catalog);
  const linkById = new Map(links.map((l) => [l.properties.segmentId.replace(/^segment-/, ""), l]));

  for (const impactLink of impactedLinks) {
    const normSeg = impactLink.properties.segmentId.replace(/^segment-/, "");
    const catalogLink = linkById.get(normSeg);
    const coords = impactLink.geometry.coordinates;

    if (!coords || coords.length < 2) continue;

    const table = getCachedPolylineDistances(
      impactLink.id,
      coords,
      catalog.coverage?.status ?? "default",
    );
    // Determine which impact governs direction on this link:
    // If user selected a secondary impact that exists on this link, that selection governs.
    const rawImpacts = impactLink.properties.rawImpacts ?? [];
    const selectedSecondary = selection
      ? rawImpacts.find((imp) => imp.cardId === selection.id || imp.sourceAlertIds?.includes(selection.id))
      : undefined;

    const governingImpact = selectedSecondary ?? {
      kind: impactLink.properties.impactKind,
      cardId: impactLink.properties.impactCardId,
      travelDirection: impactLink.properties.travelDirection,
      directionCertainty: impactLink.properties.directionCertainty ?? "unspecified",
      sourceAlertIds: impactLink.properties.allCardIds,
    };

    // Unknown direction gets no inferred arrow
    if (governingImpact.directionCertainty === "unspecified") {
      continue;
    }

    const travelDirection = governingImpact.travelDirection;
    if (!travelDirection) continue;

    // Check if polyline coordinates run forward along route topology
    const isForward = catalogLink ? isLinkPolylineForward(catalog, catalogLink) : true;
    const isSelected = Boolean(selectedSecondary);
    const impactColor = getImpactColor(governingImpact.kind, impactLink.properties.network);
    const arrowColors = getImpactArrowColors(governingImpact.kind, impactLink.properties.network);

    const count = Math.max(1, Math.min(
      MAX_ARROWS_PER_LINK,
      Math.round(table.totalDistance / DEFAULT_ARROW_SPACING_METERS),
    ));

    for (let index = 0; index < count; index += 1) {
      const fraction = (index + 1) / (count + 1);
      const sample = getPointAndBearingAlongPolyline(coords, fraction);

      if (travelDirection === "bidirectional") {
        features.push({
          type: "Feature",
          id: `arrow-${impactLink.id}-${index}`,
          geometry: {
            type: "Point",
            coordinates: sample.coordinates,
          },
          properties: {
            targetId: impactLink.properties.segmentId,
            lineId: impactLink.properties.lineId,
            impactKind: governingImpact.kind,
            impactColor,
            casingColor: arrowColors.casingColor,
            coreColor: arrowColors.coreColor,
            cardId: governingImpact.cardId,
            allCardIds: impactLink.properties.allCardIds,
            bearing: Math.round(sample.bearing),
            travelDirection: "bidirectional",
            directionCertainty: "explicit",
            isSelected,
            iconImage: "direction-arrow-bidirectional",
            fraction,
          },
        });
      } else {
        const topologyForward = travelDirection === "forward";
        const bearing = isForward === topologyForward
          ? sample.bearing
          : (sample.bearing + 180) % 360;

        features.push({
          type: "Feature",
          id: `arrow-${impactLink.id}-${index}`,
          geometry: {
            type: "Point",
            coordinates: sample.coordinates,
          },
          properties: {
            targetId: impactLink.properties.segmentId,
            lineId: impactLink.properties.lineId,
            impactKind: governingImpact.kind,
            impactColor,
            casingColor: arrowColors.casingColor,
            coreColor: arrowColors.coreColor,
            cardId: governingImpact.cardId,
            allCardIds: impactLink.properties.allCardIds,
            bearing: Math.round(bearing),
            travelDirection,
            directionCertainty: "explicit",
            isSelected,
            iconImage: "direction-arrow",
            fraction,
          },
        });
      }
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

export function getTrainMarkerLabel(marker: EstimatedTrainMarker): string {
  switch (marker.direction?.trim().toLowerCase()) {
    case "n":
    case "nb":
    case "northbound":
      return "Northbound";
    case "s":
    case "sb":
    case "southbound":
      return "Southbound";
    case "e":
    case "eb":
    case "eastbound":
      return "Eastbound";
    case "w":
    case "wb":
    case "westbound":
      return "Westbound";
    default:
      return "";
  }
}

/**
 * Pure link projection and progress distance interpolation for estimated train markers.
 * Validates estimates against catalog links, rejects malformed/out-of-range estimates,
 * and caches cumulative polyline distance tables.
 */
export function projectEstimatedTrainMarkers(
  catalog: GeographicCatalog,
  markers: EstimatedTrainMarker[] = [],
  options?: {
    enabled?: boolean;
    isOnline?: boolean;
    closedHours?: boolean;
    selectedTrainId?: string;
    catalogRevision?: string;
  },
): FeatureCollection<ProjectedTrainMarkerFeature> {
  if (
    options?.enabled === false ||
    options?.isOnline === false ||
    options?.closedHours === true ||
    !markers ||
    markers.length === 0
  ) {
    return { type: "FeatureCollection", features: [] };
  }

  const links = getLinkFeatures(catalog);
  const projectedFeatures: ProjectedTrainMarkerFeature[] = [];

  for (const marker of markers) {
    // 1. Validation: marker IDs
    if (
      !marker.id ||
      !marker.lineId ||
      !marker.fromStationId ||
      !marker.toStationId
    ) {
      continue;
    }

    // 2. Validation: progress range [0.0, 1.0]
    if (
      typeof marker.progress !== "number" ||
      !Number.isFinite(marker.progress) ||
      marker.progress < 0 ||
      marker.progress > 1
    ) {
      continue;
    }

    // 3. Link lookup: matching lineId and station endpoints
    const lineLinks = links.filter((l) => l.properties.lineId === marker.lineId);
    if (lineLinks.length === 0) continue;

    const matchedLinks = lineLinks.filter(
      (l) =>
        (l.properties.stationAId === marker.fromStationId &&
          l.properties.stationBId === marker.toStationId) ||
        (l.properties.stationAId === marker.toStationId &&
          l.properties.stationBId === marker.fromStationId),
    );

    let chosenLink: GeographicLinkFeature | null = null;
    if (matchedLinks.length === 1) {
      chosenLink = matchedLinks[0];
    } else if (matchedLinks.length > 1) {
      // Check if one matches segmentId uniquely
      const normMarkerSeg = (marker.segmentId ?? "").replace(/^segment-/, "");
      const exactSeg = matchedLinks.filter(
        (l) =>
          l.properties.segmentId === marker.segmentId ||
          l.properties.segmentId.replace(/^segment-/, "") === normMarkerSeg,
      );
      if (exactSeg.length === 1) {
        chosenLink = exactSeg[0];
      } else {
        // Line ambiguity: reject
        continue;
      }
    } else {
      // Fallback: lookup by segmentId
      const normMarkerSeg = (marker.segmentId ?? "").replace(/^segment-/, "");
      const segMatched = lineLinks.filter(
        (l) =>
          l.properties.segmentId === marker.segmentId ||
          l.properties.segmentId.replace(/^segment-/, "") === normMarkerSeg,
      );
      if (segMatched.length === 1) {
        chosenLink = segMatched[0];
      } else {
        // Absent link or ambiguous
        continue;
      }
    }

    if (!chosenLink || !chosenLink.geometry.coordinates?.length) continue;

    const rawCoords = chosenLink.geometry.coordinates;

    // 4. Zero-length link handling
    if (rawCoords.length === 1) {
      projectedFeatures.push({
        type: "Feature",
        id: `train-${marker.id}`,
        geometry: {
          type: "Point",
          coordinates: rawCoords[0],
        },
        properties: {
          markerId: marker.id,
          lineId: marker.lineId,
          lineColor: ALL_LINE_COLORS[marker.lineId] ?? "#888888",
          direction: marker.direction,
          travelDirection: marker.travelDirection ?? "forward",
          nextStationId: marker.nextStationId,
          fromStationId: marker.fromStationId,
          toStationId: marker.toStationId,
          progress: marker.progress,
          bearing: 0,
          vehicleId: marker.vehicleId ?? undefined,
          tripId: marker.tripId ?? undefined,
          label: getTrainMarkerLabel(marker),
          isSelected: Boolean(
            options?.selectedTrainId &&
              (marker.id === options.selectedTrainId ||
                marker.vehicleId === options.selectedTrainId),
          ),
        },
      });
      continue;
    }

    // 5. Orient coordinates from fromStationId to toStationId
    let orientedCoords = rawCoords;
    const stationFrom = findStationFeature(catalog, marker.fromStationId);
    const stationTo = findStationFeature(catalog, marker.toStationId);

    if (stationFrom && stationTo) {
      const dStartFrom = getCoordinateDistanceMeters(rawCoords[0], stationFrom.geometry.coordinates);
      const dStartTo = getCoordinateDistanceMeters(rawCoords[0], stationTo.geometry.coordinates);
      if (dStartTo < dStartFrom) {
        // Starts at toStation; reverse to make it from -> to
        orientedCoords = [...rawCoords].reverse();
      }
    } else if (chosenLink.properties.stationAId === marker.toStationId) {
      orientedCoords = [...rawCoords].reverse();
    }

    // 6. Cumulative distance table & progress interpolation
    const table = getCachedPolylineDistances(
      `${chosenLink.id}-oriented`,
      orientedCoords,
      options?.catalogRevision ?? "default",
    );

    let position: GeographicCoordinate;
    let bearing = 0;

    if (table.totalDistance === 0) {
      position = orientedCoords[0];
      bearing = 0;
    } else if (marker.progress === 0) {
      position = orientedCoords[0];
      const dx = orientedCoords[1][0] - orientedCoords[0][0];
      const dy = orientedCoords[1][1] - orientedCoords[0][1];
      bearing = (Math.atan2(dx, dy) * (180 / Math.PI) + 360) % 360;
    } else if (marker.progress === 1) {
      const lastIdx = orientedCoords.length - 1;
      position = orientedCoords[lastIdx];
      const dx = orientedCoords[lastIdx][0] - orientedCoords[lastIdx - 1][0];
      const dy = orientedCoords[lastIdx][1] - orientedCoords[lastIdx - 1][1];
      bearing = (Math.atan2(dx, dy) * (180 / Math.PI) + 360) % 360;
    } else {
      const targetDist = table.totalDistance * marker.progress;
      let placed = false;

      for (let i = 0; i < table.segmentLengths.length; i++) {
        const segLen = table.segmentLengths[i];
        const segStart = table.cumulativeDistances[i];
        const segEnd = table.cumulativeDistances[i + 1];

        if (targetDist <= segEnd || i === table.segmentLengths.length - 1) {
          const rem = targetDist - segStart;
          const ratio = segLen > 0 ? Math.max(0, Math.min(1, rem / segLen)) : 0;
          const [x1, y1] = orientedCoords[i];
          const [x2, y2] = orientedCoords[i + 1];
          position = [x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio];

          const dx = x2 - x1;
          const dy = y2 - y1;
          bearing = (Math.atan2(dx, dy) * (180 / Math.PI) + 360) % 360;
          placed = true;
          break;
        }
      }

      if (!placed) {
        position = orientedCoords[orientedCoords.length - 1];
      }
    }

    projectedFeatures.push({
      type: "Feature",
      id: `train-${marker.id}`,
      geometry: {
        type: "Point",
        coordinates: position!,
      },
      properties: {
        markerId: marker.id,
        lineId: marker.lineId,
        lineColor: ALL_LINE_COLORS[marker.lineId] ?? "#888888",
        direction: marker.direction,
        travelDirection: marker.travelDirection ?? "forward",
        nextStationId: marker.nextStationId,
        fromStationId: marker.fromStationId,
        toStationId: marker.toStationId,
        progress: marker.progress,
        bearing: Math.round(bearing),
        vehicleId: marker.vehicleId ?? undefined,
        tripId: marker.tripId ?? undefined,
        label: getTrainMarkerLabel(marker),
        isSelected: Boolean(
          options?.selectedTrainId &&
            (marker.id === options.selectedTrainId ||
              marker.vehicleId === options.selectedTrainId),
        ),
      },
    });
  }

  return {
    type: "FeatureCollection",
    features: projectedFeatures,
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

function boundsForCoordinates(
  coords: GeographicCoordinate[],
): [[number, number], [number, number]] | null {
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

  if (Math.abs(maxLng - minLng) < 0.002 && Math.abs(maxLat - minLat) < 0.002) {
    return [
      [minLng - 0.008, minLat - 0.006],
      [maxLng + 0.008, maxLat + 0.006],
    ];
  }

  return [[minLng, minLat], [maxLng, maxLat]];
}

/** Uses the same projected identity graph as the rendered geographic overlays. */
export function getProjectedSelectionBounds(
  selection: ImpactSelection,
  impactedLinks: ProjectedImpactLinkFeature[],
  impactedStations: ProjectedImpactStationFeature[],
): [[number, number], [number, number]] | null {
  if (!selection) return null;
  const coords: GeographicCoordinate[] = [];

  for (const link of impactedLinks) {
    if (link.properties.allCardIds.includes(selection.id)) {
      coords.push(...link.geometry.coordinates);
    }
  }
  for (const station of impactedStations) {
    if ((station.properties.allCardIds ?? [station.properties.cardId]).includes(selection.id)) {
      coords.push(station.geometry.coordinates);
    }
  }

  return boundsForCoordinates(coords);
}

export type ProjectedImpactGroup = {
  targetId: string;
  targetType: "segment" | "station";
  label: string;
  coordinate: GeographicCoordinate;
  impacts: MapImpact[];
};

/** Resolves a complete overlap group for the one geographic chooser overlay. */
export function getProjectedImpactGroup(
  targetType: "segment" | "station",
  targetId: string,
  impactedLinks: ProjectedImpactLinkFeature[],
  impactedStations: ProjectedImpactStationFeature[],
): ProjectedImpactGroup | null {
  const link = targetType === "segment"
    ? impactedLinks.find((feature) => feature.properties.segmentId === targetId)
    : undefined;
  const station = targetType === "station"
    ? impactedStations.find((feature) => feature.properties.stationId === targetId)
    : undefined;
  if (!link && !station) return null;

  const fallback: MapImpact = link
    ? {
        kind: link.properties.impactKind,
        cardId: link.properties.impactCardId,
        travelDirection: link.properties.travelDirection,
        sourceAlertIds: link.properties.allCardIds,
      }
    : {
        kind: station!.properties.impactKind,
        cardId: station!.properties.cardId,
        travelDirection: "bidirectional",
        sourceAlertIds: station!.properties.allCardIds ?? [station!.properties.cardId],
      };
  const seen = new Set<string>();
  const impacts = (link?.properties.rawImpacts ?? station?.properties.rawImpacts ?? [fallback])
    .filter((impact) => {
      const key = `${impact.kind}:${impact.cardId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    targetId,
    targetType,
    label: link?.properties.label ?? station!.properties.name,
    coordinate: link
      ? getPointAlongPolyline(link.geometry.coordinates, 0.5)
      : station!.geometry.coordinates,
    impacts,
  };
}

/**
 * Legacy raw-data bounds helper retained for callers outside the geographic
 * renderer. New geographic camera focus should use getProjectedSelectionBounds.
 */
export function getSelectionBounds(
  catalog: GeographicCatalog,
  selection: ImpactSelection,
  networkSegments: NetworkSegment[],
  stationNodeImpacts: StationNodeImpact[],
  plannedClosures?: PlannedClosure[],
): [[number, number], [number, number]] | null {
  if (!selection) return null;

  const coords: GeographicCoordinate[] = [];

  // Match station impacts
  const matchedStationImpacts = stationNodeImpacts.filter(
    (imp) => imp.cardId === selection.id || imp.stationId === selection.id,
  );
  for (const imp of matchedStationImpacts) {
    const stationCoords = getStationCoordinates(catalog, imp.stationId);
    if (stationCoords) coords.push(stationCoords);
  }

  // Match planned closure preview selection
  if (selection.kind === "planned-closure" && plannedClosures) {
    const closure = plannedClosures.find((c) => c.id === selection.id);
    if (closure && closure.previewSegmentIds) {
      const catalogLinks = getLinkFeatures(catalog);
      for (const segId of closure.previewSegmentIds) {
        const norm = segId.replace(/^segment-/, "");
        const matched = catalogLinks.filter(
          (l) => l.properties.segmentId === segId || l.properties.segmentId.replace(/^segment-/, "") === norm,
        );
        for (const l of matched) {
          coords.push(...l.geometry.coordinates);
        }
      }
    }
  }

  // Match segment impacts
  const matchedSegments = networkSegments.filter((seg) => {
    if (
      seg.impacts?.some(
        (imp) => imp.cardId === selection.id || imp.sourceAlertIds?.includes(selection.id),
      )
    ) {
      return true;
    }
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

  // Fallback: check if selection matches catalog link directly
  if (coords.length === 0) {
    const normSelId = selection.id.replace(/^segment-/, "");
    const directLinks = getLinkFeatures(catalog).filter(
      (link) =>
        link.properties.segmentId === selection.id ||
        link.properties.segmentId.replace(/^segment-/, "") === normSelId,
    );
    for (const link of directLinks) {
      coords.push(...link.geometry.coordinates);
    }
  }

  return boundsForCoordinates(coords);
}
