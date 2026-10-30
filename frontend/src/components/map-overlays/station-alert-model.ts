import type { ImpactSelection, MapImpactKind, StationNodeImpact } from "../../app/linewatch-data.ts";
import type { MapPoint } from "../../app/map-geometry.ts";
import {
  stationImpactDirectionForStationImpacts,
  type StationImpactArrowDirection,
  type StationImpactDirectionData,
} from "../station-impact-direction.ts";

/**
 * A rounded-rectangle station marker (GO/UP's Union hub). Its filled outline
 * marks the alert, so it draws no ring or beacon. Geometry is in the marker's
 * own coordinates; `transform` maps them to overlay coordinates.
 */
export type MapStationPill = {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  ry: number;
  /** Marker coordinates to overlay coordinates. */
  transform: string;
  /** Overlay units per marker unit. */
  scale: number;
  /** The marker's authored outline, kept on the filled copy. */
  stroke: string;
  strokeWidth: string;
};

/** One place a station alert is drawn: a station dot, or one platform of it. */
export type MapStationAlertAnchor = {
  id: string;
  center: MapPoint;
  /** The still core over the dot. */
  coreRadius: number;
  /** The idle ring, which is also the alert's pointer target. */
  ringRadius: number;
  /** The shaded beacon, from `stationImpactBeaconSize`. */
  beaconRadius: number;
  pill?: MapStationPill;
};

/** One station alert as both maps draw it. */
export type MapStationAlert = {
  /** Stable while the alert's drawing is unchanged; React keys on it. */
  key: string;
  kind: MapImpactKind;
  impactId: string;
  stationId: string;
  /** Accessible name of the alert's map target. */
  label: string;
  anchors: MapStationAlertAnchor[];
  /** Still drawn while it fades out after leaving the data. */
  exiting?: boolean;
};

/** The arrow over a station dot for every one-way alert on it. */
export type MapStationDirectionGlyph = {
  key: string;
  anchorId: string;
  center: MapPoint;
  radius: number;
  direction: StationImpactArrowDirection;
  exiting?: boolean;
};

/**
 * Ring and core colour by kind. Undefined keeps the stylesheet's defaults:
 * the red core and the gold ring of a suspension.
 */
export function stationAlertColor(kind: MapImpactKind): string | undefined {
  if (kind === "delay") return "#f59e0b";
  if (kind === "planned-closure") return "var(--planned-preview-ink)";
  return undefined;
}

export function isSelectedStationAlert(alert: Pick<MapStationAlert, "kind" | "impactId">, selection: ImpactSelection) {
  return selection?.kind === alert.kind && selection.id === alert.impactId;
}

/** TTC's idle ring sits 12 units outside its 26-unit core; a pill keeps that gap. */
export const STATION_ALERT_PILL_RING_GAP = 12;
/** The hover priority ring sits this far outside the idle ring. */
export const STATION_ALERT_HOVER_RING_GAP = 5;
/** Width of a pill's (invisible) pointer target band, in overlay units. */
export const STATION_ALERT_PILL_TARGET_WIDTH = 24;

/** A pill grown by `distance` overlay units on every side. */
export function outsetStationPill(pill: MapStationPill, distance: number): MapStationPill {
  const local = distance / (pill.scale || 1);
  return {
    ...pill,
    x: pill.x - local,
    y: pill.y - local,
    width: pill.width + 2 * local,
    height: pill.height + 2 * local,
    rx: pill.rx + local,
    ry: pill.ry + local,
  };
}

/**
 * One arrow per alerted anchor, combining every one-way alert on it (two
 * opposite alerts draw a two-headed arrow).
 */
export function stationDirectionGlyphs<I extends Pick<StationNodeImpact, "stationId" | "kind" | "cardId">>(
  placements: Array<{ impact: I; anchor: { id: string; center: MapPoint; badgeRadius: number } }>,
  directionData: StationImpactDirectionData,
): MapStationDirectionGlyph[] {
  const byAnchor = new Map<string, { anchorId: string; center: MapPoint; radius: number; impacts: I[] }>();
  for (const { impact, anchor } of placements) {
    const key = `${impact.stationId}:${anchor.id}`;
    const existing = byAnchor.get(key);
    if (existing) existing.impacts.push(impact);
    else byAnchor.set(key, { anchorId: anchor.id, center: anchor.center, radius: anchor.badgeRadius, impacts: [impact] });
  }
  return [...byAnchor].flatMap(([key, { anchorId, center, radius, impacts }]) => {
    const direction = stationImpactDirectionForStationImpacts(impacts, directionData);
    return direction ? [{ key, anchorId, center, radius, direction: direction.arrow.direction }] : [];
  });
}

/** Half the idle ring's hovered stroke (8), in overlay units on TTC. */
export const STATION_ALERT_RING_STROKE_HALF_WIDTH = 4;

/** How far an anchor's drawing (ring, beacon or pill) reaches from its centre. */
export function stationAlertAnchorReach(anchor: MapStationAlertAnchor, unit: number): number {
  if (anchor.pill) {
    const { width, height, scale } = anchor.pill;
    return Math.max(width, height) * scale / 2 + STATION_ALERT_PILL_RING_GAP * unit;
  }
  return Math.max(anchor.beaconRadius, anchor.ringRadius + STATION_ALERT_RING_STROKE_HALF_WIDTH * unit);
}
