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
import {
  pathCorridorCollisionBoxes,
  svgElementMatrixToRootCoordinates,
  transformBoundsToRootPolygon,
  type MapBounds,
  type MapPoint,
} from "./map-geometry.ts";
import {
  REGIONAL_IMPACT_OVERLAY_WIDTH,
  REGIONAL_OVERLAP_INDICATOR_SCALE,
  REGIONAL_OVERLAY_UNIT,
  pointInSvgRootCoordinates,
  regionalStationVisualAnchors,
  resolvedRegionalSegmentPath,
  regionalOverlapBadgeAnchor,
  regionalCollisionBoxForElement,
  expandedRegionalCollisionBox,
  regionalPathRootPoints,
  REGIONAL_MAP_VIEWBOX,
  regionalSvgScope,
  type RegionalCollisionBox,
  type RegionalSvgScope,
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
  placeOverlapBadges,
  withoutAlertedStretches,
  type PlacementObstacle,
} from "../components/overlap-badge-placement.ts";
import {
  placeOverlapChooser,
  type OverlapChooserPreferredBox,
} from "../components/overlap-chooser-placement.ts";
import {
  OVERLAP_BADGE_CONNECTOR_DOT_RADIUS,
  badgeConnectorKeepOut,
  overlapBadgeConnector,
  overlapBadgeConnectorSearch,
  type ConnectorCrossing,
  type ConnectorKeepOut,
  type ConnectorOutline,
  type OverlapBadgeConnector,
  type OverlapBadgeConnectorOptions,
} from "../components/overlap-badge-connector.ts";
import type { MapLineAlert } from "../components/map-overlays/line-alert-model.ts";
import { mapImpactIdentityOf } from "../components/map-overlays/overlay-hover.ts";
import { mapStationAlertAtClientPoint } from "../components/map-overlays/map-hover-controller.ts";
import type { MapStationAlert } from "../components/map-overlays/station-alert-model.ts";
import {
  CONNECTOR_STATION_CLEARANCE,
  OVERLAP_BADGE_CONNECTOR_MIN_LENGTH,
  OVERLAP_BADGE_SIBLING_CLEARANCE,
  STATION_BADGE_TARGET_RADIUS,
  lineAlertBadgeObstacleRadius,
  lineAlertOutlineHalfWidth,
  stationAlertPlacementAnchors,
  stationAlertPlacementObstacles,
  type StationAlertPlacementAnchor,
} from "../components/map-overlays/overlay-obstacles.ts";
import { regionalStationAlertRingRadius } from "./regional-station-alerts.ts";

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
export const REGIONAL_OVERLAP_CHOOSER_GAP = 24;

export const REGIONAL_DYNAMIC_SEGMENT_LAYER_ID = "regional-dynamic-segment-layer";
export const REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID = "regional-dynamic-selected-segment-layer";
export const REGIONAL_DYNAMIC_COMMUTE_LAYER_ID = "regional-dynamic-commute-layer";
export const REGIONAL_DYNAMIC_HOVER_LAYER_ID = "regional-dynamic-hover-layer";
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
  documentNode: RegionalSvgScope,
  segments: NetworkSegment[],
  stationContext?: {
    svg: SVGSVGElement;
    stationNodeImpacts: StationNodeImpact[];
    stations: Pick<Station, "id" | "name">[];
  },
): RegionalOverlapBadge[] {
  const stationsLayer = documentNode.getElementById("regional-stations-layer") as SVGElement | null;
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
    ? regionalStationOverlapBadges(stationContext.svg, stationGroups, stationContext.stations)
    : [];
  const segmentBadges = segmentGroups.filter((group) => !coveredSignatures.has(group.signature)).flatMap((group) => {
    const size = mapOverlapIndicatorSize(group.impacts);
    const anchorSegment = group.segments[Math.floor(group.segments.length / 2)];
    const placement = anchorSegment
      ? regionalOverlapBadgeAnchor(documentNode, anchorSegment, size)
      : null;
    if (!placement || !stationsLayer) return [];
    const rootAnchor = pointInSvgRootCoordinates(stationsLayer, placement.anchor);
    const rootPosition = pointInSvgRootCoordinates(stationsLayer, placement.position);
    // Sample each segment on its own so disjoint segments don't add targets
    // across the gaps between them.
    const placementTargets = group.segments.flatMap((segment) => {
      const pathD = resolvedRegionalSegmentPath(documentNode, segment, "root");
      return pathD
        ? pathCorridorCollisionBoxes(pathD, REGIONAL_BADGE_TARGET_SPACING).map((box) => ({
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
          }))
        : [];
    });
    const firstSegment = group.segments[0];
    const lastSegment = group.segments.at(-1) ?? firstSegment;
    const startLabel = firstSegment.label.split(" to ")[0];
    const endLabel = lastSegment.label.split(" to ").at(-1) ?? lastSegment.label;
    return [{
      markerId: `regional-overlap-${group.signature}`,
      label: `${startLabel} to ${endLabel}`,
      impacts: group.impacts,
      anchor: rootAnchor,
      position: rootPosition,
      placementTargets: placementTargets.length > 0 ? placementTargets : [rootAnchor],
      size,
    }];
  });
  return [...segmentBadges, ...stationBadges];
}

function regionalStationOverlapBadges(
  svg: SVGSVGElement,
  groups: StationOverlapBadgeGroup[],
  stations: Pick<Station, "id" | "name">[],
): RegionalOverlapBadge[] {
  const stationNames = new Map(stations.map((station) => [station.id, station.name]));
  return groups.flatMap((group) => {
    const stationVisual = svg.querySelector<SVGElement>(`#station-${CSS.escape(group.stationId)}`);
    const anchors = stationVisual ? regionalStationVisualAnchors(stationVisual, "root") : [];
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
const REGIONAL_BADGE_SIBLING_GAP = OVERLAP_BADGE_SIBLING_CLEARANCE * REGIONAL_BADGE_SCALE;
const REGIONAL_BADGE_TARGET_SPACING = 32;
// Regional route strokes are 175 units wide.
const REGIONAL_TRANSIT_LINE_HALF_WIDTH = 87.5;
// Shared spacing (see BADGE_FEATURE_GAPS) so GO/UP badges sit as far from
// labels, lines, and alerts as TTC badges do, relative to badge size.
const REGIONAL_LABEL_PADDING = badgeObstacleReach(0, BADGE_FEATURE_GAPS.label, REGIONAL_BADGE_SCALE);
const REGIONAL_ARTWORK_PADDING = badgeObstacleReach(0, BADGE_FEATURE_GAPS.artwork, REGIONAL_BADGE_SCALE);
// Station markers (including the Union hub) and route badges/logos.
const REGIONAL_ARTWORK_SELECTOR = [
  "#regional-stations-layer rect",
  "#regional-stations-layer circle",
  "#regional-stations-layer ellipse",
  "#regional-route-labels-layer rect",
  "#regional-route-labels-layer path",
  "#regional-route-labels-layer image",
  "#regional-route-labels-layer use",
].join(", ");
// App-injected pieces that live inside those layers but are not artwork:
// alert overlays and their hover masks, glyph lanes, hit targets, hover and
// selection indicators. Alert overlays are handled as their own obstacles.
const REGIONAL_INJECTED_ARTWORK_SELECTOR = [
  "defs",
  "mask",
  "clipPath",
  ".overlay-segment-group",
  "[class*='-glyph']",
  ".regional-station-hit-target",
  ".station-hover-indicator",
  ".map-selection-attention",
].join(", ");
const REGIONAL_LINE_ALERT_OUTLINE_HALF_WIDTH = lineAlertOutlineHalfWidth(REGIONAL_OVERLAY_UNIT);
const REGIONAL_LINE_ALERT_RADIUS = lineAlertBadgeObstacleRadius(REGIONAL_OVERLAY_UNIT, REGIONAL_BADGE_SCALE);
const REGIONAL_TRANSIT_LINE_RADIUS = badgeObstacleReach(
  REGIONAL_TRANSIT_LINE_HALF_WIDTH,
  BADGE_FEATURE_GAPS.transitLine,
  REGIONAL_BADGE_SCALE,
);
const REGIONAL_CORRIDOR_SAMPLE_SPACING = 48;
const REGIONAL_STATION_BADGE_TARGET_RADIUS = STATION_BADGE_TARGET_RADIUS * REGIONAL_BADGE_SCALE;
const REGIONAL_CONNECTOR_MIN_LENGTH = OVERLAP_BADGE_CONNECTOR_MIN_LENGTH * REGIONAL_BADGE_SCALE;

type RegionalAlertCorridor = { impactKey: string; polyline: MapPoint[] };

/**
 * Map artwork as placement obstacles in root coordinates. Labels keep their
 * rotation and lines become corridors, matching the TTC map.
 */
type RegionalArtwork = {
  /** Everything a badge must not cover, apart from transit lines. */
  obstacles: PlacementObstacle[];
  /** Transit line corridors a badge must not cover where no alert overlays them. */
  transitLines: { polyline: MapPoint[]; radius: number }[];
  /** Station names, connection labels, and line-name badges: connectors never pass through them. */
  connectorKeepOut: ConnectorKeepOut[];
  /** Transit line strokes: connectors avoid crossing them. */
  connectorCrossings: ConnectorCrossing[];
};

const artworkObstacleCache = new WeakMap<SVGSVGElement, { fontKey: string; artwork: RegionalArtwork }>();

/**
 * Artwork only changes when the map asset or its web fonts change, so reuse
 * one measurement per SVG and font state. Returning the same array also lets
 * the placement engine reuse its rasterization.
 */
function cachedRegionalArtwork(svg: SVGSVGElement): RegionalArtwork {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  const fontKey = fonts ? `${fonts.status}:${fonts.size}` : "";
  const cached = artworkObstacleCache.get(svg);
  if (cached && cached.fontKey === fontKey) return cached.artwork;
  const artwork = regionalArtwork(svg);
  artworkObstacleCache.set(svg, { fontKey, artwork });
  return artwork;
}

const unalertedLineCache = new WeakMap<RegionalArtwork, { key: string; lines: PlacementObstacle[] }>();

/**
 * Transit lines minus the stretches alert overlays cover, which keep the
 * overlay's tighter gap instead (as on the TTC map). Reused while the alerts
 * stay the same, so the placement engine can reuse its rasterization.
 */
function cachedUnalertedLineObstacles(artwork: RegionalArtwork, corridors: RegionalAlertCorridor[]): PlacementObstacle[] {
  const key = corridors
    .map(({ polyline }) => polyline.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(" "))
    .join("|");
  const cached = unalertedLineCache.get(artwork);
  if (cached && cached.key === key) return cached.lines;
  const lines = withoutAlertedStretches(
    artwork.transitLines,
    corridors.map(({ polyline }) => polyline),
    REGIONAL_TRANSIT_LINE_HALF_WIDTH,
  );
  unalertedLineCache.set(artwork, { key, lines });
  return lines;
}

function regionalArtwork(svg: SVGSVGElement): RegionalArtwork {
  const labels = [...svg.querySelectorAll<SVGGraphicsElement>("text")].flatMap((element) => {
    try {
      const box = element.getBBox();
      const polygon = transformBoundsToRootPolygon(
        { x: box.x, y: box.y, width: box.width, height: box.height },
        svgElementMatrixToRootCoordinates(element, svg),
      );
      return polygon && box.width > 0 && box.height > 0
        ? [{ polygon, padding: REGIONAL_LABEL_PADDING }]
        : [];
    } catch {
      return [];
    }
  });
  const connectionLabels = [...svg.querySelectorAll<SVGGraphicsElement>(".map-connection-label")].flatMap((element) => {
    try {
      const box = regionalCollisionBoxForElement(svg, element);
      return box ? [expandedRegionalCollisionBox(box, REGIONAL_LABEL_PADDING)] : [];
    } catch {
      return [];
    }
  });
  const transitLines = [...svg.querySelectorAll<SVGPathElement>('#regional-lines-layer path[id^="regional-route-"]')]
    .map((path) => ({
      polyline: regionalPathRootPoints(svg, path, REGIONAL_CORRIDOR_SAMPLE_SPACING),
      radius: REGIONAL_TRANSIT_LINE_RADIUS,
    }))
    .filter((line) => line.polyline.length > 0);
  const lineBadges: MapBounds[] = [];
  const artwork = [...svg.querySelectorAll<SVGGraphicsElement>(REGIONAL_ARTWORK_SELECTOR)].flatMap((element) => {
    if (element.closest(REGIONAL_INJECTED_ARTWORK_SELECTOR)) return [];
    try {
      const box = regionalCollisionBoxForElement(svg, element);
      if (!box || box.width <= 0 || box.height <= 0) return [];
      const expanded = expandedRegionalCollisionBox(box, REGIONAL_ARTWORK_PADDING);
      if (element.closest("#regional-route-labels-layer")) lineBadges.push(expanded);
      return [expanded];
    } catch {
      return [];
    }
  });
  return {
    obstacles: [...labels, ...connectionLabels, ...artwork],
    transitLines,
    // Station dots stay out: station-alert connectors have to land beside them.
    connectorKeepOut: [...labels, ...connectionLabels, ...lineBadges],
    connectorCrossings: transitLines,
  };
}

/**
 * Each line alert's centre line in root coordinates. Built from the overlay
 * model, so badges can be placed before React has drawn the alerts.
 */
export function regionalLineAlertCorridors(svg: SVGSVGElement, alerts: MapLineAlert[]): RegionalAlertCorridor[] {
  const stationsLayer = svg.querySelector<SVGGElement>("#regional-stations-layer");
  if (!stationsLayer) return [];
  const probe = svg.ownerDocument.createElementNS(SVG_NAMESPACE, "path");
  probe.setAttribute("fill", "none");
  probe.setAttribute("visibility", "hidden");
  stationsLayer.append(probe);
  try {
    return alerts.flatMap((alert) => {
      if (alert.exiting) return [];
      probe.setAttribute("d", alert.pathD);
      const polyline = regionalPathRootPoints(svg, probe, REGIONAL_CORRIDOR_SAMPLE_SPACING);
      return polyline.length > 0 ? [{ impactKey: `${alert.kind}:${alert.impactId}`, polyline }] : [];
    });
  } finally {
    probe.remove();
  }
}

/** Station alert drawings in root coordinates, for badge placement and connectors. */
export function regionalStationAlertPlacement(
  svg: SVGSVGElement,
  alerts: readonly MapStationAlert[],
): StationAlertPlacementAnchor[] {
  const stationsLayer = svg.querySelector<SVGElement>("#regional-stations-layer");
  if (!stationsLayer) return [];
  return stationAlertPlacementAnchors(
    alerts,
    REGIONAL_OVERLAY_UNIT,
    REGIONAL_BADGE_SCALE,
    (point) => pointInSvgRootCoordinates(stationsLayer, point),
  );
}

/**
 * Places regional overlap badges with the same engine as the TTC map: as close
 * as possible to their own corridor, clear of artwork and alert overlays, and
 * aligned with neighbouring badges.
 */
export function regionalPlacedOverlapBadges(
  svg: SVGSVGElement,
  badges: RegionalOverlapBadge[],
  corridors: RegionalAlertCorridor[] = [],
  stationAlerts: readonly StationAlertPlacementAnchor[] = [],
): RegionalOverlapBadge[] {
  if (badges.length === 0) return badges;
  const alertObstacles: PlacementObstacle[] = [
    ...corridors.map(({ polyline }) => ({ polyline, radius: REGIONAL_LINE_ALERT_RADIUS })),
    ...stationAlertPlacementObstacles(stationAlerts),
  ];
  const scaledSize = (badge: RegionalOverlapBadge) => ({
    width: badge.size.width * REGIONAL_OVERLAP_INDICATOR_SCALE,
    height: badge.size.height * REGIONAL_OVERLAP_INDICATOR_SCALE,
  });
  const outlines = regionalConnectorOutlines(corridors, stationAlerts);
  const stationDots = regionalStationDotKeepouts(svg);
  const artwork = cachedRegionalArtwork(svg);
  const { connectorKeepOut, connectorCrossings } = artwork;
  const badgeKeepOutPadding = OVERLAP_BADGE_CONNECTOR_DOT_RADIUS * REGIONAL_OVERLAP_INDICATOR_SCALE;
  // One set of connector rules for placement and for drawing, matching the
  // TTC map: a badge's line crosses only open space.
  const connectorOptionsFor = (
    badge: RegionalOverlapBadge,
    position: MapPoint,
    others: { position: MapPoint; size: { width: number; height: number } }[],
  ): OverlapBadgeConnectorOptions => ({
    position,
    size: scaledSize(badge),
    outlines: badge.impacts.flatMap((impact) => outlines.get(`${impact.kind}:${impact.cardId}`) ?? []),
    minimumLength: REGIONAL_CONNECTOR_MIN_LENGTH,
    within: badge.stationPoint
      ? { center: badge.stationPoint, radius: REGIONAL_STATION_BADGE_TARGET_RADIUS }
      : undefined,
    avoid: stationDots,
    endRadius: OVERLAP_BADGE_CONNECTOR_DOT_RADIUS * REGIONAL_OVERLAP_INDICATOR_SCALE,
    keepOut: [
      ...connectorKeepOut,
      ...others.map((other) => badgeConnectorKeepOut(other.position, other.size, badgeKeepOutPadding)),
    ],
    crossings: connectorCrossings,
  });
  const badgeById = new Map(badges.map((badge) => [badge.markerId, badge]));
  const placements = new Map(placeOverlapBadges({
    badges: badges.map((badge) => {
      const ownImpactKeys = new Set(badge.impacts.map((impact) => `${impact.kind}:${impact.cardId}`));
      const { stationPoint } = badge;
      // A station badge aims for the station and its own overlays right beside it.
      const nearbyOverlayTargets = stationPoint
        ? corridors
          .filter((corridor) => ownImpactKeys.has(corridor.impactKey))
          .flatMap((corridor) => corridor.polyline)
          .filter((point) => Math.hypot(point.x - stationPoint.x, point.y - stationPoint.y) <= REGIONAL_STATION_BADGE_TARGET_RADIUS)
        : [];
      return {
        id: badge.markerId,
        size: scaledSize(badge),
        targets: [...badge.placementTargets, ...nearbyOverlayTargets],
        anchor: stationPoint,
        foreignTargets: corridors
          .filter((corridor) => !ownImpactKeys.has(corridor.impactKey))
          .flatMap((corridor) => corridor.polyline),
      };
    }),
    obstacleLayers: [artwork.obstacles, cachedUnalertedLineObstacles(artwork, corridors), alertObstacles],
    mapBounds: REGIONAL_MAP_VIEWBOX,
    siblingGap: REGIONAL_BADGE_SIBLING_GAP,
    unitScale: REGIONAL_BADGE_SCALE,
    // Every badge gets a spot with a clear connector line when one exists.
    connector: ({ id, position, placed }) => {
      const badge = badgeById.get(id);
      if (!badge) return { needed: false, line: null };
      const { needed, connector } = overlapBadgeConnectorSearch(connectorOptionsFor(badge, position, placed));
      return { needed, line: connector ? [connector.from, connector.to] : null };
    },
  }).map((placement) => [placement.id, placement]));

  const positionOf = (badge: RegionalOverlapBadge) => placements.get(badge.markerId)?.position ?? badge.position;
  return badges.map((badge) => {
    const placement = placements.get(badge.markerId);
    const position = positionOf(badge);
    return {
      ...badge,
      position,
      collisionAvoided: placement?.collisionAvoided ?? badge.collisionAvoided,
      connector: overlapBadgeConnector(connectorOptionsFor(
        badge,
        position,
        badges
          .filter((other) => other.markerId !== badge.markerId)
          .map((other) => ({ position: positionOf(other), size: scaledSize(other) })),
      )),
    };
  });
}

/** Station dots a connector should not end on, with room for their rings (as on TTC). */
function regionalStationDotKeepouts(svg: SVGSVGElement): { center: MapPoint; radius: number }[] {
  const stationsLayer = svg.querySelector<SVGElement>("#regional-stations-layer");
  if (!stationsLayer) return [];
  return [...stationsLayer.querySelectorAll<SVGElement>(':scope > [id^="station-"]')].flatMap((station) => (
    regionalStationVisualAnchors(station, "root").map((anchor) => ({
      center: anchor.point,
      radius: regionalStationAlertRingRadius(anchor.radius) + CONNECTOR_STATION_CLEARANCE * REGIONAL_OVERLAY_UNIT,
    }))
  ));
}

/** The visible edge of each alert's overlay, keyed by impact, for badge connectors. */
function regionalConnectorOutlines(
  corridors: RegionalAlertCorridor[],
  stationAlerts: readonly StationAlertPlacementAnchor[],
): Map<string, ConnectorOutline[]> {
  const outlines = new Map<string, ConnectorOutline[]>();
  const add = (key: string, outline: ConnectorOutline) => {
    outlines.set(key, [...(outlines.get(key) ?? []), outline]);
  };
  for (const corridor of corridors) {
    add(corridor.impactKey, { polyline: corridor.polyline, halfWidth: REGIONAL_LINE_ALERT_OUTLINE_HALF_WIDTH });
  }
  for (const { impactKey, center, outlineRadius } of stationAlerts) {
    add(impactKey, { center, radius: outlineRadius });
  }
  return outlines;
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

export function regionalReferencedAlertCollisionBoxes(
  root: ParentNode,
  badge: RegionalOverlapBadge,
  viewportRect: DOMRect,
): RegionalCollisionBox[] {
  const identityKeys = new Set(
    badge.impacts.map((impact) => `${impact.kind}:${impact.cardId}`),
  );
  return [...root.querySelectorAll<SVGPathElement>(
    ".overlay-segment-group[data-map-impact-id] > .asset-alert-path",
  )].flatMap((path) => {
    const group = path.closest<SVGElement>(".overlay-segment-group");
    const kind = group?.dataset.mapImpactKind;
    const id = group?.dataset.mapImpactId;
    if (!kind || !id || !identityKeys.has(`${kind}:${id}`)) return [];
    const screenMatrix = path.getScreenCTM();
    if (!screenMatrix) return [];
    try {
      const length = path.getTotalLength();
      if (length <= 0) return [];
      const localRadius = REGIONAL_IMPACT_OVERLAY_WIDTH / 2 + 28;
      const screenScale = Math.max(
        Math.hypot(screenMatrix.a, screenMatrix.b),
        Math.hypot(screenMatrix.c, screenMatrix.d),
      );
      const radius = localRadius * screenScale;
      const sampleCount = Math.max(2, Math.ceil(length / (localRadius * 0.65)));
      return Array.from({ length: sampleCount + 1 }, (_unused, index) => {
        const point = path.getPointAtLength(length * index / sampleCount)
          .matrixTransform(screenMatrix);
        return {
          x: point.x - viewportRect.left - radius,
          y: point.y - viewportRect.top - radius,
          width: radius * 2,
          height: radius * 2,
        };
      });
    } catch {
      return [];
    }
  });
}

/**
 * GO/UP chooser placement, using the shared placer so both maps behave the
 * same. Inputs are in logical viewport pixels; the referenced alert's corridor
 * samples become circles the card avoids covering.
 */
export function regionalOverlapChooserLayout({
  markerCenter,
  markerSize,
  chooserSize,
  viewportSize,
  alertCollisionBoxes,
  uiKeepoutBoxes,
  preferred = null,
}: {
  markerCenter: { x: number; y: number };
  markerSize: { width: number; height: number };
  chooserSize: { width: number; height: number };
  viewportSize: { width: number; height: number };
  alertCollisionBoxes: RegionalCollisionBox[];
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
    affectedArea: alertCollisionBoxes.map((box) => ({
      polyline: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
      radius: Math.min(box.width, box.height) / 2,
    })),
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
  svg: SVGSVGElement,
  data: {
    networkSegments: NetworkSegment[];
    stationNodeImpacts: StationNodeImpact[];
    stations: Pick<Station, "id" | "name">[];
    lineAlerts: MapLineAlert[];
    stationAlerts: MapStationAlert[];
  },
): RegionalOverlapBadge[] {
  return regionalPlacedOverlapBadges(
    svg,
    regionalOverlapBadges(regionalSvgScope(svg), data.networkSegments, {
      svg,
      stationNodeImpacts: data.stationNodeImpacts,
      stations: data.stations,
    }),
    regionalLineAlertCorridors(svg, data.lineAlerts),
    regionalStationAlertPlacement(svg, data.stationAlerts),
  );
}
