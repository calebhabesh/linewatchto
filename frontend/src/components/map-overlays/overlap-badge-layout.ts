import {
  densifyPolylinePoints,
  pathPolylinePoints,
  type MapBounds,
  type MapPoint,
} from "../../app/map-geometry.ts";
import {
  BADGE_FEATURE_GAPS,
  badgeObstacleReach,
  placeOverlapBadges,
  withoutAlertedStretches,
  type PlacementObstacle,
} from "../overlap-badge-placement.ts";
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
} from "../overlap-badge-connector.ts";
import type { MapLineAlert } from "./line-alert-model.ts";
import {
  OVERLAP_BADGE_CONNECTOR_MIN_LENGTH,
  OVERLAP_BADGE_SIBLING_CLEARANCE,
  STATION_BADGE_TARGET_RADIUS,
  lineAlertBadgeObstacleRadius,
  lineAlertOutlineHalfWidth,
  stationAlertPlacementObstacles,
  type StationAlertPlacementAnchor,
} from "./overlay-obstacles.ts";

/*
 * Overlap badge layout for any map: where each badge goes and the line that
 * ties it to its overlay. Each map supplies its badges, its artwork (from the
 * prepared map) and its alerts as drawn; sizes scale by the map's overlay
 * `unit` and the size its badges are drawn at (`badgeScale`), both 1 on TTC.
 */

type OverlapBadgeSize = { width: number; height: number };

/** What a map's artwork asks of badges and their connectors. */
export type MapBadgeArtwork = {
  /** Everything a badge must not cover, apart from transit lines. */
  obstacles: PlacementObstacle[];
  /** Transit-line corridors a badge must not cover where no alert overlays them. */
  transitLines: PlacementObstacle[];
  /** Half the width of the map's transit-line stroke. */
  transitLineHalfWidth: number;
  /** Station names and the like: connectors never pass through them. */
  connectorKeepOut: ConnectorKeepOut[];
  /** Line strokes: connectors avoid crossing them. */
  connectorCrossings: ConnectorCrossing[];
};

/** One line alert's centre line, and points along it as placement targets. */
export type MapBadgeAlertCorridor = { impactKey: string; polyline: MapPoint[]; samples: MapPoint[] };

/** Each drawn line alert's corridor. Built from the overlay model, so badges can be placed before React draws it. */
export function mapBadgeAlertCorridors(alerts: readonly MapLineAlert[], unit: number): MapBadgeAlertCorridor[] {
  const spacing = lineAlertOutlineHalfWidth(unit);
  return alerts.flatMap((alert) => {
    if (alert.exiting) return [];
    const polyline = pathPolylinePoints(alert.pathD);
    if (polyline.length === 0) return [];
    return [{
      impactKey: `${alert.kind}:${alert.impactId}`,
      polyline,
      samples: polyline.length === 1 ? polyline : densifyPolylinePoints(polyline, spacing),
    }];
  });
}

/** Points along a segment's path a badge stays close to. */
export function overlapBadgeTargetsAlong(pathD: string, badgeScale: number): MapPoint[] {
  const polyline = pathPolylinePoints(pathD);
  return polyline.length === 1 ? polyline : densifyPolylinePoints(polyline, 16 * badgeScale);
}

export type MapOverlapBadgeRequest = {
  id: string;
  impacts: readonly { kind: string; cardId: string }[];
  /** Drawn size, in map units. */
  size: OverlapBadgeSize;
  /** Points along the overlays this badge explains. */
  targets: MapPoint[];
  /** A station badge's station, where its alerts meet. */
  stationPoint?: MapPoint;
  /** A station's own large mark (Union's pill): the connector lands on it and placement aims only at `targets`. */
  stationMark?: ConnectorOutline;
};

export type MapOverlapBadgeLayout = {
  position: MapPoint;
  collisionAvoided: boolean;
  connector: OverlapBadgeConnector | null;
  /** The visible overlays of the badge's alerts; its chooser keeps them uncovered. */
  affectedOutlines: ConnectorOutline[];
};

const impactKeyOf = (impact: { kind: string; cardId: string }) => `${impact.kind}:${impact.cardId}`;

const unalertedLineCache = new WeakMap<MapBadgeArtwork, { key: string; lines: PlacementObstacle[] }>();

/**
 * Transit lines minus the stretches alert overlays cover, which keep the
 * overlay's tighter gap instead. Reused while the alerts stay the same, so the
 * placement engine can reuse its rasterization.
 */
function unalertedLines(artwork: MapBadgeArtwork, corridors: readonly MapBadgeAlertCorridor[]): PlacementObstacle[] {
  const key = corridors
    .map(({ polyline }) => polyline.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(" "))
    .join("|");
  const cached = unalertedLineCache.get(artwork);
  if (cached && cached.key === key) return cached.lines;
  const lines = withoutAlertedStretches(
    artwork.transitLines,
    corridors.map(({ polyline }) => polyline),
    artwork.transitLineHalfWidth,
  );
  unalertedLineCache.set(artwork, { key, lines });
  return lines;
}

type LayoutRequest = Parameters<typeof computeMapOverlapBadgeLayout>[0];

const roundedPoints = (points: readonly MapPoint[]) => points.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(" ");

/** Everything the layout reads, as text: equal requests place badges identically. */
function layoutRequestSignature(request: LayoutRequest): string {
  return JSON.stringify([
    request.badges.map((badge) => [
      badge.id,
      badge.impacts.map(impactKeyOf),
      badge.size.width,
      badge.size.height,
      roundedPoints(badge.targets),
      badge.stationPoint ? roundedPoints([badge.stationPoint]) : null,
      badge.stationMark ?? null,
    ]),
    request.corridors.map((corridor) => [corridor.impactKey, roundedPoints(corridor.polyline)]),
    request.stationAlerts.map((alert) => [alert.impactKey, roundedPoints([alert.center]), alert.obstacleRadius, alert.outlineRadius]),
    request.stationDots.map((dot) => [roundedPoints([dot.center]), dot.radius]),
    request.mapBounds,
    request.unit,
    request.badgeScale,
  ]);
}

const layoutCache = new WeakMap<MapBadgeArtwork, { signature: string; layout: Map<string, MapOverlapBadgeLayout> }>();

/**
 * Places a map's overlap badges as close as possible to the overlays they
 * explain, clear of artwork, alerts and each other, aligned with their
 * neighbours, each with a connector line through open space when it needs one.
 *
 * A map re-renders with fresh arrays of the same badges and alerts on every
 * poll and layout pass; an equal request returns the previous layout instead
 * of searching again.
 */
export function layoutMapOverlapBadges(request: LayoutRequest): Map<string, MapOverlapBadgeLayout> {
  if (request.badges.length === 0) return new Map();
  const signature = layoutRequestSignature(request);
  const cached = layoutCache.get(request.artwork);
  if (cached?.signature === signature) return cached.layout;
  const layout = computeMapOverlapBadgeLayout(request);
  layoutCache.set(request.artwork, { signature, layout });
  return layout;
}

function computeMapOverlapBadgeLayout({
  badges,
  artwork,
  corridors,
  stationAlerts,
  stationDots,
  mapBounds,
  unit,
  badgeScale,
}: {
  badges: readonly MapOverlapBadgeRequest[];
  artwork: MapBadgeArtwork;
  corridors: readonly MapBadgeAlertCorridor[];
  stationAlerts: readonly StationAlertPlacementAnchor[];
  /** Station dots a connector should not end on, with room for their rings. */
  stationDots: readonly { center: MapPoint; radius: number }[];
  mapBounds: MapBounds;
  unit: number;
  badgeScale: number;
}): Map<string, MapOverlapBadgeLayout> {
  if (badges.length === 0) return new Map();
  const outlines = new Map<string, ConnectorOutline[]>();
  const samples = new Map<string, MapPoint[]>();
  const add = <T,>(map: Map<string, T[]>, key: string, ...items: T[]) => map.set(key, [...(map.get(key) ?? []), ...items]);
  for (const corridor of corridors) {
    add(outlines, corridor.impactKey, { polyline: corridor.polyline, halfWidth: lineAlertOutlineHalfWidth(unit) });
    add(samples, corridor.impactKey, ...corridor.samples);
  }
  for (const { impactKey, center, outlineRadius } of stationAlerts) {
    add(outlines, impactKey, { center, radius: outlineRadius });
    add(samples, impactKey, center);
  }
  const alertObstacles: PlacementObstacle[] = [
    ...corridors.map(({ polyline }) => ({ polyline, radius: lineAlertBadgeObstacleRadius(unit, badgeScale) })),
    ...stationAlertPlacementObstacles(stationAlerts),
  ];
  // A station's large mark keeps badges an alert overlay's gap away, so a
  // badge beside it (Union's) has room for the connector that meets it.
  const stationMarkObstacles: PlacementObstacle[] = badges.flatMap(({ stationMark }) => {
    if (!stationMark) return [];
    const [polyline, halfWidth] = "center" in stationMark
      ? [[stationMark.center], stationMark.radius]
      : [stationMark.polyline, stationMark.halfWidth];
    return [{ polyline, radius: badgeObstacleReach(halfWidth, BADGE_FEATURE_GAPS.alertOverlay, badgeScale) }];
  });
  const stationTargetRadius = STATION_BADGE_TARGET_RADIUS * badgeScale;
  const dotRadius = OVERLAP_BADGE_CONNECTOR_DOT_RADIUS * badgeScale;

  // One set of connector rules for placement and for drawing: a badge's line
  // crosses only open space.
  const affectedOutlinesOf = (badge: MapOverlapBadgeRequest) => (
    badge.impacts.flatMap((impact) => outlines.get(impactKeyOf(impact)) ?? [])
  );
  const connectorOptionsFor = (
    badge: MapOverlapBadgeRequest,
    position: MapPoint,
    others: { position: MapPoint; size: OverlapBadgeSize }[],
  ): OverlapBadgeConnectorOptions => ({
    position,
    size: badge.size,
    // A badge for a station drawn as one large mark points at the mark itself;
    // any other station badge points at its overlays right beside the station.
    outlines: badge.stationMark ? [badge.stationMark] : affectedOutlinesOf(badge),
    minimumLength: OVERLAP_BADGE_CONNECTOR_MIN_LENGTH * badgeScale,
    within: badge.stationPoint && !badge.stationMark
      ? { center: badge.stationPoint, radius: stationTargetRadius }
      : undefined,
    // The mark's own dot is the landing, not something to keep clear of.
    avoid: badge.stationMark
      ? stationDots.filter((dot) => !insideOutline(dot.center, badge.stationMark!))
      : [...stationDots],
    endRadius: dotRadius,
    keepOut: [
      ...artwork.connectorKeepOut,
      ...others.map((other) => badgeConnectorKeepOut(other.position, other.size, dotRadius)),
    ],
    crossings: artwork.connectorCrossings,
  });

  const badgeById = new Map(badges.map((badge) => [badge.id, badge]));
  const placements = new Map(placeOverlapBadges({
    badges: badges.map((badge) => {
      const ownKeys = new Set(badge.impacts.map(impactKeyOf));
      const { stationPoint, stationMark } = badge;
      // A station badge aims for the station and its own overlays right beside
      // it; one for a large mark aims only where its adapter says (Union's gap).
      const nearby = stationPoint && !stationMark
        ? [...ownKeys].flatMap((key) => samples.get(key) ?? [])
          .filter((point) => Math.hypot(point.x - stationPoint.x, point.y - stationPoint.y) <= stationTargetRadius)
        : [];
      return {
        id: badge.id,
        size: badge.size,
        targets: [...badge.targets, ...nearby],
        anchor: stationMark ? undefined : stationPoint,
        foreignTargets: [...samples.entries()].filter(([key]) => !ownKeys.has(key)).flatMap(([, points]) => points),
      };
    }),
    obstacleLayers: [artwork.obstacles, unalertedLines(artwork, corridors), alertObstacles, stationMarkObstacles],
    mapBounds,
    siblingGap: OVERLAP_BADGE_SIBLING_CLEARANCE * badgeScale,
    unitScale: badgeScale,
    // Every badge gets a spot with a clear connector line when one exists.
    connector: ({ id, position, placed }) => {
      const badge = badgeById.get(id);
      if (!badge) return { needed: false, line: null };
      const { needed, connector } = overlapBadgeConnectorSearch(connectorOptionsFor(badge, position, placed));
      return { needed, line: connector ? [connector.from, connector.to] : null };
    },
  }).map((placement) => [placement.id, placement]));

  const positionOf = (badge: MapOverlapBadgeRequest) => placements.get(badge.id)?.position ?? badge.targets[0];
  return new Map(badges.map((badge) => {
    const position = positionOf(badge);
    const options = connectorOptionsFor(
      badge,
      position,
      badges.filter((other) => other.id !== badge.id).map((other) => ({ position: positionOf(other), size: other.size })),
    );
    return [badge.id, {
      position,
      collisionAvoided: placements.get(badge.id)?.collisionAvoided ?? false,
      connector: overlapBadgeConnector(options),
      affectedOutlines: affectedOutlinesOf(badge),
    }];
  }));
}

function insideOutline(point: MapPoint, outline: ConnectorOutline): boolean {
  if ("center" in outline) return Math.hypot(point.x - outline.center.x, point.y - outline.center.y) < outline.radius;
  const { polyline, halfWidth } = outline;
  if (polyline.length === 1) return Math.hypot(point.x - polyline[0].x, point.y - polyline[0].y) < halfWidth;
  for (let index = 1; index < polyline.length; index += 1) {
    const start = polyline[index - 1];
    const end = polyline[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
    if (Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t)) < halfWidth) return true;
  }
  return false;
}

/**
 * A badge's affected outlines on screen, as the obstacles its chooser keeps
 * uncovered: `toScreen` maps a map point, `scale` is screen pixels per map unit.
 */
export function affectedOutlinesOnScreen(
  outlines: readonly ConnectorOutline[],
  toScreen: (point: MapPoint) => MapPoint,
  scale: number,
): PlacementObstacle[] {
  return outlines.map((outline) => (
    "center" in outline
      ? { polyline: [toScreen(outline.center)], radius: outline.radius * scale }
      : { polyline: outline.polyline.map(toScreen), radius: outline.halfWidth * scale }
  ));
}
