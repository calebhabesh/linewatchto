import type { MapPoint } from "../../app/map-geometry.ts";
import {
  BADGE_FEATURE_GAPS,
  badgeObstacleReach,
  type PlacementObstacle,
} from "../overlap-badge-placement.ts";
import { MAP_HOVER_OUTLINE_WIDTHS } from "./overlay-plane.ts";
import {
  STATION_ALERT_RING_STROKE_HALF_WIDTH,
  stationAlertAnchorReach,
  type MapStationAlert,
  type MapStationAlertAnchor,
} from "./station-alert-model.ts";

/*
 * How overlap badges and their connectors keep clear of alert overlays, from
 * the shared overlay sizes. Both maps use these: `unit` is the map's overlay
 * unit (MapOverlayPlane.unit) and `badgeScale` the size its badges are drawn
 * at, both 1 on TTC. Badge spacing below is in TTC badge units.
 */

/** Space between neighbouring badges in an aligned row. */
export const OVERLAP_BADGE_SIBLING_CLEARANCE = 36;
/** A station badge aims for spots within this distance of its station. */
export const STATION_BADGE_TARGET_RADIUS = 320;
/** Below this gap a badge visibly touches its overlay and needs no line. */
export const OVERLAP_BADGE_CONNECTOR_MIN_LENGTH = 12;
/** Room a connector leaves around a station's would-be alert ring. */
export const CONNECTOR_STATION_CLEARANCE = 12;

/**
 * Half the width of a line alert's hover outline. Connectors only show while
 * their badge is hovered, when its alerts wear that outline, so they end on
 * its outer edge.
 */
export function lineAlertOutlineHalfWidth(unit: number): number {
  return MAP_HOVER_OUTLINE_WIDTHS.outer * unit / 2;
}

/** A line alert's corridor radius as a badge placement obstacle. */
export function lineAlertBadgeObstacleRadius(unit: number, badgeScale: number): number {
  return badgeObstacleReach(lineAlertOutlineHalfWidth(unit), BADGE_FEATURE_GAPS.alertOverlay, badgeScale);
}

/** Where a connector meets a station alert: its hovered ring, or a pill's outline. */
export function stationAlertOutlineRadius(anchor: MapStationAlertAnchor, unit: number): number {
  return anchor.pill
    ? stationAlertAnchorReach(anchor, unit)
    : anchor.ringRadius + STATION_ALERT_RING_STROKE_HALF_WIDTH * unit;
}

/** A station alert's whole drawing (beacon, ring or pill) as a placement obstacle. */
export function stationAlertBadgeObstacleRadius(
  anchor: MapStationAlertAnchor,
  unit: number,
  badgeScale: number,
): number {
  return badgeObstacleReach(stationAlertAnchorReach(anchor, unit), BADGE_FEATURE_GAPS.alertOverlay, badgeScale);
}

/** One station alert anchor in the badge placer's coordinates. */
export type StationAlertPlacementAnchor = {
  impactKey: string;
  center: MapPoint;
  /** Badges keep this far from the centre. */
  obstacleRadius: number;
  /** Connectors end on this circle. */
  outlineRadius: number;
};

/**
 * Every station alert anchor, sized for badge placement and connectors.
 * `toPlacement` maps overlay coordinates to the placer's, where they differ.
 */
export function stationAlertPlacementAnchors(
  alerts: readonly MapStationAlert[],
  unit: number,
  badgeScale: number,
  toPlacement: (point: MapPoint) => MapPoint = (point) => point,
): StationAlertPlacementAnchor[] {
  return alerts.flatMap((alert) => (alert.exiting ? [] : alert.anchors.map((anchor) => ({
    impactKey: `${alert.kind}:${alert.impactId}`,
    center: toPlacement(anchor.center),
    obstacleRadius: stationAlertBadgeObstacleRadius(anchor, unit, badgeScale),
    outlineRadius: stationAlertOutlineRadius(anchor, unit),
  }))));
}

export function stationAlertPlacementObstacles(anchors: readonly StationAlertPlacementAnchor[]): PlacementObstacle[] {
  return anchors.map(({ center, obstacleRadius }) => ({ polyline: [center], radius: obstacleRadius }));
}
