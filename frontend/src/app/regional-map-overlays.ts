import type {
  ActiveAlert,
  DelayAlert,
  ImpactKind,
  ImpactSelection,
  MapImpact,
  NetworkSegment,
  PlannedClosure,
  ReducedSpeedZone,
  Station,
  StationNodeImpact,
} from "./linewatch-data.ts";
import type { AccountCommutePathPreview } from "./commute-data.ts";
import type { MapBounds, MapPoint } from "./map-geometry.ts";
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
  type RegionalCollisionBox,
} from "./regional-map-geometry.ts";
import {
  buildStationOverlapBadgeGroups,
  coveredSegmentOverlapBadgeSignatures,
  hasOverlappingImpacts,
  mapOverlapIndicatorSize,
  type StationOverlapBadgeGroup,
  overlapBadgeSignature,
  type MapOverlapChooserLayout,
  type MapOverlapIndicatorSize,
} from "../components/map-overlap-badges.ts";
import {
  BADGE_FEATURE_GAPS,
  badgeObstacleReach,
  type PlacementObstacle,
} from "../components/overlap-badge-placement.ts";
import {
  placeOverlapChooser,
  type OverlapChooserPreferredBox,
} from "../components/overlap-chooser-placement.ts";
import type { ConnectorOutline, OverlapBadgeConnector } from "../components/overlap-badge-connector.ts";
import type { MapLineAlert } from "../components/map-overlays/line-alert-model.ts";
import {
  layoutMapOverlapBadges,
  mapBadgeAlertCorridors,
  overlapBadgeTargetsAlong,
  type MapBadgeAlertCorridor,
  type MapBadgeArtwork,
} from "../components/map-overlays/overlap-badge-layout.ts";
import { mapImpactIdentityOf } from "../components/map-overlays/overlay-hover.ts";
import { mapStationAlertAtClientPoint } from "../components/map-overlays/map-hover-controller.ts";
import type { MapStationAlert } from "../components/map-overlays/station-alert-model.ts";
import {
  CONNECTOR_STATION_CLEARANCE,
  stationAlertPlacementAnchors,
  type StationAlertPlacementAnchor,
} from "../components/map-overlays/overlay-obstacles.ts";
import { regionalStationAlertRingRadius } from "./regional-station-alerts.ts";

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
export const REGIONAL_OVERLAP_CHOOSER_GAP = 24;

export const REGIONAL_DYNAMIC_SEGMENT_LAYER_ID = "regional-dynamic-segment-layer";
export const REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID = "regional-dynamic-selected-segment-layer";
export const REGIONAL_DYNAMIC_COMMUTE_LAYER_ID = "regional-dynamic-commute-layer";
export const REGIONAL_DYNAMIC_HOVER_LAYER_ID = "regional-dynamic-hover-layer";
/** Line alert pointer and keyboard targets, under station targets. */
export const REGIONAL_DYNAMIC_TARGET_LAYER_ID = "regional-dynamic-target-layer";
export const REGIONAL_TOP_HOVER_LAYER_ID = "regional-top-hover-layer";
export const REGIONAL_TOP_STATION_IMPACT_LAYER_ID = "regional-top-station-impact-layer";
export const REGIONAL_TRAIN_MARKER_LAYER_ID = "regional-train-marker-layer";

export type RegionalOverlapBadge = {
  markerId: string;
  label: string;
  impacts: MapImpact[];
  anchor: MapPoint;
  position: MapPoint;
  /** Points along the overlapping corridor, in root SVG coordinates. */
  placementTargets: MapPoint[];
  /** Set for station-boundary badges: where the alerts meet, in root coordinates. */
  stationPoint?: MapPoint;
  /** Line to the overlay this badge explains, in root coordinates. */
  connector?: OverlapBadgeConnector | null;
  /** The visible overlays of the badge's alerts; its chooser keeps them uncovered. */
  affectedOutlines?: ConnectorOutline[];
  size: MapOverlapIndicatorSize;
  collisionAvoided?: boolean;
};

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

/**
 * The alert a pointer press selects: the one the hover outline shows (the
 * topmost alert under the pointer, preferring any alert other than the
 * selected one, which is drawn on top). Pressing where only the selected
 * alert is changes nothing (NetworkMap ignores the repeat).
 */
export function regionalPointerImpactSelection(
  root: HTMLElement,
  impact: SVGElement,
  clientX: number,
  clientY: number,
): NonNullable<ImpactSelection> | null {
  const hit = mapStationAlertAtClientPoint(root, clientX, clientY) ?? mapImpactIdentityOf(impact);
  return hit ? { kind: hit.kind, id: hit.id } : null;
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
): RegionalOverlapBadge[] {
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
    return [{
      markerId: `regional-overlap-${group.signature}`,
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
): RegionalOverlapBadge[] {
  const stationNames = new Map(stations.map((station) => [station.id, station.name]));
  return groups.flatMap((group) => {
    const station = regionalStation(geometry, group.stationId);
    const anchors = station ? regionalStationVisualAnchors(station) : [];
    if (anchors.length === 0) return [];
    const point = {
      x: anchors.reduce((sum, anchor) => sum + anchor.point.x, 0) / anchors.length,
      y: anchors.reduce((sum, anchor) => sum + anchor.point.y, 0) / anchors.length,
    };
    return [{
      markerId: `regional-overlap-station-${group.stationId}-${group.signature}`,
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

/** Each line alert's corridor, for badge placement. */
export function regionalLineAlertCorridors(alerts: MapLineAlert[]): MapBadgeAlertCorridor[] {
  return mapBadgeAlertCorridors(alerts, REGIONAL_OVERLAY_UNIT);
}

/** Station alert drawings, for badge placement and connectors. */
export function regionalStationAlertPlacement(alerts: readonly MapStationAlert[]): StationAlertPlacementAnchor[] {
  return stationAlertPlacementAnchors(alerts, REGIONAL_OVERLAY_UNIT, REGIONAL_BADGE_SCALE);
}

/** GO/UP's overlap badges placed by the shared layout (map-overlays/overlap-badge-layout.ts), as on TTC. */
export function regionalPlacedOverlapBadges(
  geometry: PreparedMapGeometry,
  badges: RegionalOverlapBadge[],
  corridors: MapBadgeAlertCorridor[] = [],
  stationAlerts: readonly StationAlertPlacementAnchor[] = [],
): RegionalOverlapBadge[] {
  const layouts = layoutMapOverlapBadges({
    badges: badges.map((badge) => ({
      id: badge.markerId,
      impacts: badge.impacts,
      size: {
        width: badge.size.width * REGIONAL_BADGE_SCALE,
        height: badge.size.height * REGIONAL_BADGE_SCALE,
      },
      targets: badge.placementTargets,
      stationPoint: badge.stationPoint,
    })),
    artwork: regionalBadgeArtwork(geometry),
    corridors,
    stationAlerts,
    stationDots: regionalStationDots(geometry).map((anchor) => ({
      center: anchor.point,
      radius: regionalStationAlertRingRadius(anchor.radius) + CONNECTOR_STATION_CLEARANCE * REGIONAL_OVERLAY_UNIT,
    })),
    mapBounds: REGIONAL_MAP_VIEWBOX,
    unit: REGIONAL_OVERLAY_UNIT,
    badgeScale: REGIONAL_BADGE_SCALE,
  });
  return badges.map((badge) => {
    const layout = layouts.get(badge.markerId);
    return layout
      ? {
          ...badge,
          position: layout.position,
          collisionAvoided: layout.collisionAvoided,
          connector: layout.connector,
          affectedOutlines: layout.affectedOutlines,
        }
      : badge;
  });
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
 * The marker's screen box at rest. Opening the chooser shrinks the marker with
 * a CSS scale transition, so its live client rect changes for 120 ms; placing
 * the chooser from it made the chooser jump between frames. The marker's own
 * box mapped through its positioned parent ignores that scale.
 */
export function regionalOverlapMarkerRestingRect(
  marker: SVGGElement,
): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
  const parent = marker.parentElement as SVGGraphicsElement | null;
  const matrix = typeof parent?.getScreenCTM === "function" ? parent.getScreenCTM() : null;
  if (!matrix) return marker.getBoundingClientRect();
  const box = marker.getBBox();
  const corners = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ].map(([x, y]) => ({
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  }));
  const left = Math.min(...corners.map((point) => point.x));
  const right = Math.max(...corners.map((point) => point.x));
  const top = Math.min(...corners.map((point) => point.y));
  const bottom = Math.max(...corners.map((point) => point.y));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/**
 * GO/UP chooser placement, using the shared placer so both maps behave the
 * same. Inputs are in logical viewport pixels; `affectedArea` is the badge's
 * alerts as drawn (affectedOutlinesOnScreen), which the card avoids covering.
 */
export function regionalOverlapChooserLayout({
  markerCenter,
  markerSize,
  chooserSize,
  viewportSize,
  affectedArea,
  uiKeepoutBoxes,
  preferred = null,
}: {
  markerCenter: { x: number; y: number };
  markerSize: { width: number; height: number };
  chooserSize: { width: number; height: number };
  viewportSize: { width: number; height: number };
  affectedArea: PlacementObstacle[];
  uiKeepoutBoxes: RegionalCollisionBox[];
  preferred?: OverlapChooserPreferredBox | null;
}): { layout: MapOverlapChooserLayout; size: { width: number; height: number }; coversAffectedArea: boolean } {
  const placement = placeOverlapChooser({
    viewportSize,
    badgeBox: {
      x: markerCenter.x - markerSize.width / 2,
      y: markerCenter.y - markerSize.height / 2,
      width: markerSize.width,
      height: markerSize.height,
    },
    affectedArea,
    keepouts: uiKeepoutBoxes,
    requestedSize: chooserSize,
    preferred,
  });
  return {
    coversAffectedArea: placement.coversAffectedArea,
    layout: {
      left: placement.left,
      top: placement.top,
      anchorOffsetX: placement.anchorOffsetX,
      anchorOffsetY: placement.anchorOffsetY,
    },
    size: { width: placement.width, height: placement.height },
  };
}

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

/**
 * GO/UP's overlap badges, placed: the same grouping and placement rules as
 * TTC, around the line and station alerts the shared overlay layer draws.
 */
export function regionalOverlapBadgeLayout(
  geometry: PreparedMapGeometry,
  data: {
    networkSegments: NetworkSegment[];
    stationNodeImpacts: StationNodeImpact[];
    stations: Pick<Station, "id" | "name">[];
    lineAlerts: MapLineAlert[];
    stationAlerts: MapStationAlert[];
  },
): RegionalOverlapBadge[] {
  return regionalPlacedOverlapBadges(
    geometry,
    regionalOverlapBadges(geometry, data.networkSegments, {
      stationNodeImpacts: data.stationNodeImpacts,
      stations: data.stations,
    }),
    regionalLineAlertCorridors(data.lineAlerts),
    regionalStationAlertPlacement(data.stationAlerts),
  );
}
