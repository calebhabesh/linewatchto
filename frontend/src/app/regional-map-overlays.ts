import type {
  ActiveAlert,
  DelayAlert,
  ImpactKind,
  MapImpact,
  NetworkSegment,
  PlannedClosure,
  ReducedSpeedZone,
  Station,
  StationNodeImpact,
} from "./linewatch-data.ts";
import type { AccountCommutePathPreview } from "./commute-data.ts";
import type { MapBounds } from "./map-geometry.ts";
import { preparedPoints, type PreparedMapGeometry } from "./map-geometry-data.ts";
import {
  REGIONAL_OVERLAP_INDICATOR_SCALE,
  REGIONAL_OVERLAY_UNIT,
  regionalStation,
  regionalStationDots,
  regionalStationVisualAnchors,
  resolvedRegionalSegmentPath,
  regionalOverlapBadgeAnchor,
  expandedRegionalCollisionBox,
  REGIONAL_MAP_VIEWBOX,
} from "./regional-map-geometry.ts";
import {
  buildStationOverlapBadgeGroups,
  coveredSegmentOverlapBadgeSignatures,
  hasOverlappingImpacts,
  mapOverlapIndicatorSize,
  type StationOverlapBadgeGroup,
  overlapBadgeSignature,
} from "../components/map-overlap-badges.ts";
import {
  BADGE_FEATURE_GAPS,
  badgeObstacleReach,
} from "../components/overlap-badge-placement.ts";
import type { MapLineAlert } from "../components/map-overlays/line-alert-model.ts";
import {
  overlapBadgeTargetsAlong,
  type MapBadgeArtwork,
} from "../components/map-overlays/overlap-badge-layout.ts";
import type { MapStationAlert } from "../components/map-overlays/station-alert-model.ts";
import { CONNECTOR_STATION_CLEARANCE } from "../components/map-overlays/overlay-obstacles.ts";
import {
  placeMapOverlapBadges,
  type MapBadgePlacement,
  type MapOverlapBadgeInput,
  type MapPlacedOverlapBadge,
} from "./map-content.ts";
import { regionalStationAlertRingRadius } from "./regional-station-alerts.ts";

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export const REGIONAL_DYNAMIC_SEGMENT_LAYER_ID = "regional-dynamic-segment-layer";
export const REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID = "regional-dynamic-selected-segment-layer";
export const REGIONAL_DYNAMIC_COMMUTE_LAYER_ID = "regional-dynamic-commute-layer";
export const REGIONAL_DYNAMIC_HOVER_LAYER_ID = "regional-dynamic-hover-layer";
/** Line alert pointer and keyboard targets, under station targets. */
export const REGIONAL_DYNAMIC_TARGET_LAYER_ID = "regional-dynamic-target-layer";
export const REGIONAL_TOP_HOVER_LAYER_ID = "regional-top-hover-layer";
export const REGIONAL_TOP_STATION_IMPACT_LAYER_ID = "regional-top-station-impact-layer";
export const REGIONAL_TRAIN_MARKER_LAYER_ID = "regional-train-marker-layer";

/** A GO/UP overlap badge before placement; its layout id is its marker id. */
export type RegionalOverlapBadge = Omit<MapOverlapBadgeInput, "layoutId"> & { layoutId?: string };

export type RegionalOverlayPiece = {
  segment: NetworkSegment;
  impact: MapImpact;
  impactIndex: number;
  pathD: string;
};

export type RegionalOverlayRun = {
  impact: MapImpact;
  impactIndex: number;
  lineId: string;
  segments: NetworkSegment[];
  pathD: string;
};


export function regionalImpactPriority(kind: ImpactKind) {
  switch (kind) {
    case "planned-closure":
      return 0;
    case "reduced-speed-zone":
      return 1;
    case "delay":
      return 2;
    case "suspension":
      return 3;
    default:
      return -1;
  }
}

export function regionalSegmentsAreAdjacent(a: NetworkSegment, b: NetworkSegment) {
  return a.stationAId === b.stationAId
    || a.stationAId === b.stationBId
    || a.stationBId === b.stationAId
    || a.stationBId === b.stationBId;
}

export function regionalOverlayRuns(pieces: RegionalOverlayPiece[]): RegionalOverlayRun[] {
  const grouped = new Map<string, RegionalOverlayPiece[]>();
  for (const piece of pieces) {
    const key = [
      piece.segment.lineId,
      piece.impact.kind,
      piece.impact.cardId,
      piece.impact.travelDirection,
    ].join(":");
    grouped.set(key, [...(grouped.get(key) ?? []), piece]);
  }

  const runs: RegionalOverlayRun[] = [];
  for (const groupPieces of grouped.values()) {
    const remaining = new Set(groupPieces);
    while (remaining.size > 0) {
      const firstPiece = remaining.values().next().value as RegionalOverlayPiece;
      const componentPieces: RegionalOverlayPiece[] = [];
      const pending = [firstPiece];
      remaining.delete(firstPiece);
      while (pending.length > 0) {
        const current = pending.shift()!;
        componentPieces.push(current);
        for (const candidate of remaining) {
          if (!regionalSegmentsAreAdjacent(current.segment, candidate.segment)) continue;
          remaining.delete(candidate);
          pending.push(candidate);
        }
      }
      runs.push({
        impact: firstPiece.impact,
        impactIndex: Math.min(...componentPieces.map((piece) => piece.impactIndex)),
        lineId: firstPiece.segment.lineId,
        segments: componentPieces.map((piece) => piece.segment),
        // Keep one subpath per graph edge. This preserves a single interactive
        // overlay group even when the connected component branches or cycles.
        pathD: componentPieces.map((piece) => piece.pathD.trim()).join(" "),
      });
    }
  }
  return runs;
}

export function regionalOverlapBadgeGroups(segments: NetworkSegment[]) {
  const groups = new Map<string, { segments: NetworkSegment[]; impacts: MapImpact[] }>();
  for (const segment of segments) {
    const impacts = [...new Map(
      (segment.impacts ?? []).map((impact) => [`${impact.kind}:${impact.cardId}`, impact]),
    ).values()];
    if (!hasOverlappingImpacts(impacts)) continue;
    const signature = overlapBadgeSignature(impacts);
    const group = groups.get(signature);
    if (group) {
      group.segments.push(segment);
    } else {
      groups.set(signature, { segments: [segment], impacts });
    }
  }
  return [...groups.entries()]
    .map(([signature, group]) => ({ signature, ...group }))
    .sort((a, b) => {
      const aSegmentId = a.segments[0]?.id ?? "";
      const bSegmentId = b.segments[0]?.id ?? "";
      return aSegmentId.localeCompare(bSegmentId) || a.signature.localeCompare(b.signature);
    });
}

export function regionalOverlapBadges(
  geometry: PreparedMapGeometry,
  segments: NetworkSegment[],
  stationContext?: {
    stationNodeImpacts: StationNodeImpact[];
    stations: Pick<Station, "id" | "name">[];
  },
): MapOverlapBadgeInput[] {
  const segmentGroups = regionalOverlapBadgeGroups(segments);
  // Same rules as the TTC map: alerts that only meet at a station get a station
  // badge, and a segment badge fully explained by a station badge is dropped.
  const stationGroups = stationContext
    ? buildStationOverlapBadgeGroups({
        segments,
        plannedClosures: [],
        stationNodeImpacts: stationContext.stationNodeImpacts,
        suppressedSignatures: new Set(segmentGroups.map((group) => group.signature)),
      })
    : [];
  const coveredSignatures = coveredSegmentOverlapBadgeSignatures(segmentGroups, stationGroups);
  const stationBadges = stationContext
    ? regionalStationOverlapBadges(geometry, stationGroups, stationContext.stations)
    : [];
  const segmentBadges = segmentGroups.filter((group) => !coveredSignatures.has(group.signature)).flatMap((group) => {
    const size = mapOverlapIndicatorSize(group.impacts);
    const anchorSegment = group.segments[Math.floor(group.segments.length / 2)];
    const placement = anchorSegment
      ? regionalOverlapBadgeAnchor(geometry, anchorSegment, size)
      : null;
    if (!placement) return [];
    // Sample each segment on its own so disjoint segments don't add targets
    // across the gaps between them.
    const placementTargets = group.segments.flatMap((segment) => {
      const pathD = resolvedRegionalSegmentPath(geometry, segment);
      return pathD ? overlapBadgeTargetsAlong(pathD, REGIONAL_BADGE_SCALE) : [];
    });
    const firstSegment = group.segments[0];
    const lastSegment = group.segments.at(-1) ?? firstSegment;
    const startLabel = firstSegment.label.split(" to ")[0];
    const endLabel = lastSegment.label.split(" to ").at(-1) ?? lastSegment.label;
    const markerId = `regional-overlap-${group.signature}`;
    return [{
      markerId,
      layoutId: markerId,
      label: `${startLabel} to ${endLabel}`,
      impacts: group.impacts,
      anchor: placement.anchor,
      position: placement.position,
      placementTargets: placementTargets.length > 0 ? placementTargets : [placement.anchor],
      size,
    }];
  });
  return [...segmentBadges, ...stationBadges];
}

function regionalStationOverlapBadges(
  geometry: PreparedMapGeometry,
  groups: StationOverlapBadgeGroup[],
  stations: Pick<Station, "id" | "name">[],
): MapOverlapBadgeInput[] {
  const stationNames = new Map(stations.map((station) => [station.id, station.name]));
  return groups.flatMap((group) => {
    const station = regionalStation(geometry, group.stationId);
    const anchors = station ? regionalStationVisualAnchors(station) : [];
    if (anchors.length === 0) return [];
    const point = {
      x: anchors.reduce((sum, anchor) => sum + anchor.point.x, 0) / anchors.length,
      y: anchors.reduce((sum, anchor) => sum + anchor.point.y, 0) / anchors.length,
    };
    const markerId = `regional-overlap-station-${group.stationId}-${group.signature}`;
    return [{
      markerId,
      layoutId: markerId,
      label: stationNames.get(group.stationId) ?? group.stationId,
      impacts: group.impacts,
      anchor: point,
      position: point,
      placementTargets: [point],
      stationPoint: point,
      size: mapOverlapIndicatorSize(group.impacts),
    }];
  });
}

// GO/UP draws overlap badges at twice TTC's size, so badge spacing doubles
// too. Overlay sizes come from the shared metrics at GO/UP's overlay unit
// (map-overlays/overlay-obstacles.ts), as on TTC.
const REGIONAL_BADGE_SCALE = REGIONAL_OVERLAP_INDICATOR_SCALE;
// Regional route strokes are 175 units wide.
const REGIONAL_TRANSIT_LINE_HALF_WIDTH = 87.5;
// Shared spacing (see BADGE_FEATURE_GAPS) so GO/UP badges sit as far from
// labels, lines, and alerts as TTC badges do, relative to badge size.
const REGIONAL_LABEL_PADDING = badgeObstacleReach(0, BADGE_FEATURE_GAPS.label, REGIONAL_BADGE_SCALE);
const REGIONAL_ARTWORK_PADDING = badgeObstacleReach(0, BADGE_FEATURE_GAPS.artwork, REGIONAL_BADGE_SCALE);
const REGIONAL_TRANSIT_LINE_RADIUS = badgeObstacleReach(
  REGIONAL_TRANSIT_LINE_HALF_WIDTH,
  BADGE_FEATURE_GAPS.transitLine,
  REGIONAL_BADGE_SCALE,
);

const artworkCache = new WeakMap<PreparedMapGeometry, MapBadgeArtwork>();

/**
 * GO/UP's artwork as badge obstacles, once per map: station names and
 * connection marks, station dots and line badges, and the routes as
 * corridors. Returning the same arrays also lets the placement engine reuse
 * its rasterization.
 */
function regionalBadgeArtwork(geometry: PreparedMapGeometry): MapBadgeArtwork {
  const cached = artworkCache.get(geometry);
  if (cached) return cached;
  const labels = geometry.artwork.labels.map((corners) => ({
    polygon: preparedPoints(corners),
    padding: REGIONAL_LABEL_PADDING,
  }));
  const connectionLabels: MapBounds[] = [];
  const lineBadges: MapBounds[] = [];
  const artwork: MapBounds[] = [];
  for (const { kind, ...box } of geometry.artwork.boxes) {
    if (kind === "connection-label") connectionLabels.push(expandedRegionalCollisionBox(box, REGIONAL_LABEL_PADDING));
    else {
      const expanded = expandedRegionalCollisionBox(box, REGIONAL_ARTWORK_PADDING);
      artwork.push(expanded);
      if (kind === "line-badge") lineBadges.push(expanded);
    }
  }
  const transitLines = geometry.lines.map((line) => ({
    polyline: preparedPoints(line.points),
    radius: REGIONAL_TRANSIT_LINE_RADIUS,
  }));
  const badgeArtwork: MapBadgeArtwork = {
    obstacles: [...labels, ...connectionLabels, ...artwork],
    transitLines,
    transitLineHalfWidth: REGIONAL_TRANSIT_LINE_HALF_WIDTH,
    // Station dots stay out: station-alert connectors have to land beside them.
    connectorKeepOut: [...labels, ...connectionLabels, ...lineBadges],
    connectorCrossings: transitLines,
  };
  artworkCache.set(geometry, badgeArtwork);
  return badgeArtwork;
}

const badgePlacementCache = new WeakMap<PreparedMapGeometry, MapBadgePlacement>();

/** What GO/UP's overlap badges keep clear of: its artwork and station dots, at twice TTC's badge size. */
export function regionalBadgePlacement(geometry: PreparedMapGeometry): MapBadgePlacement {
  let placement = badgePlacementCache.get(geometry);
  if (!placement) {
    placement = {
      artwork: regionalBadgeArtwork(geometry),
      stationDots: regionalStationDots(geometry).map((anchor) => ({
        center: anchor.point,
        radius: regionalStationAlertRingRadius(anchor.radius) + CONNECTOR_STATION_CLEARANCE * REGIONAL_OVERLAY_UNIT,
      })),
      badgeScale: REGIONAL_BADGE_SCALE,
    };
    badgePlacementCache.set(geometry, placement);
  }
  return placement;
}

/** GO/UP's overlap badges placed around its alerts by the shared layout, as on TTC. */
export function regionalPlacedOverlapBadges(
  geometry: PreparedMapGeometry,
  badges: RegionalOverlapBadge[],
  lineAlerts: MapLineAlert[] = [],
  stationAlerts: MapStationAlert[] = [],
): MapPlacedOverlapBadge[] {
  return placeMapOverlapBadges({
    lineAlerts,
    stationAlerts,
    overlapBadges: badges.map((badge) => ({ ...badge, layoutId: badge.layoutId ?? badge.markerId })),
    badgePlacement: regionalBadgePlacement(geometry),
  }, { unit: REGIONAL_OVERLAY_UNIT, mapBounds: REGIONAL_MAP_VIEWBOX });
}

export function regionalOverlapMarker(
  root: ParentNode,
  markerId: string,
): SVGGElement | null {
  const markerGroup = Array.from(
    root.querySelectorAll<SVGGElement>("[data-overlap-segment-id]"),
  ).find((candidate) => candidate.dataset.overlapSegmentId === markerId);
  return markerGroup?.querySelector<SVGGElement>(".overlap-indicator") ?? null;
}


/**
 * GO/UP chooser placement, using the shared placer so both maps behave the
 * same. Inputs are in logical viewport pixels; `affectedArea` is the badge's
 * alerts as drawn (affectedOutlinesOnScreen), which the card avoids covering.
 */

/** What GO/UP's overlays draw, for `regionalOverlayContentSignature`. */
export type RegionalOverlayContent = {
  activeAlerts: ActiveAlert[];
  delays: DelayAlert[];
  reducedSpeedZones: ReducedSpeedZone[];
  plannedClosures: PlannedClosure[];
  networkSegments: NetworkSegment[];
  stationNodeImpacts: StationNodeImpact[];
  stations: Station[];
  commutePathPreview?: AccountCommutePathPreview | null;
};

// Each poll parses fresh arrays even when the feed is unchanged, and every
// ingestion run restamps `updatedAt`. Rebuilding the overlay layers restarts
// their animations, so compare what the overlays draw rather than identity.
// TTC gets the same stability from React keeping unchanged nodes mounted.
export function regionalOverlayContentSignature(
  data: RegionalOverlayContent,
): string {
  return JSON.stringify([
    data.activeAlerts,
    data.delays,
    data.reducedSpeedZones,
    data.plannedClosures,
    data.networkSegments,
    data.stationNodeImpacts,
    data.stations,
    data.commutePathPreview ?? null,
  ], (key, value) => (key === "updatedAt" ? undefined : value));
}
