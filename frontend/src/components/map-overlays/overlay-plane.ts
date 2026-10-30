import type { CSSProperties } from "react";
import type { MapBounds } from "../../app/map-geometry.ts";

/**
 * TTC's alert rail width. Every overlay size is designed against it, and each
 * map draws it at its own scale (`MapOverlayPlane.unit`).
 */
export const MAP_ALERT_RAIL_WIDTH = 96;

/**
 * The hover keyline around an alert rail, in overlay units: outer edge,
 * light/dark divider, and inner edge (the rail). map-selection.css matches.
 */
export const MAP_HOVER_OUTLINE_WIDTHS = {
  outer: 117.2,
  divider: 108.2,
  inner: MAP_ALERT_RAIL_WIDTH,
} as const;

/** A rounded rectangle the hover outline must not cross (GO/UP's Union pill). */
export type MapOverlayCutout = {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  ry: number;
  /** Also covers the shape's border, so the outline ends behind it. */
  strokeWidth: number;
};

/**
 * Where one map draws its overlays. Both maps draw the same overlay design;
 * this says how large it is and how the map's planes relate.
 */
export type MapOverlayPlane = {
  /** Prefix for SVG ids, unique per map. */
  idPrefix: "ttc" | "regional";
  /** Map units per TTC overlay unit: 1 on TTC; GO/UP's rail width over TTC's. */
  unit: number;
  /** The drawing's extent in overlay coordinates, for map-wide masks. */
  maskBounds: MapBounds;
  /**
   * Overlay coordinates to the top SVG plane's coordinates, when they differ.
   * GO/UP draws overlays inside its translated stations layer.
   */
  topPlaneTransform?: string;
  /** Station shapes the hover outline stops at instead of crossing. */
  outlineCutouts: MapOverlayCutout[];
};

/** Sets the overlay unit that overlay CSS sizes multiply by. */
export function mapOverlayUnitStyle(plane: Pick<MapOverlayPlane, "unit">): CSSProperties {
  return { "--map-overlay-unit": String(plane.unit) } as CSSProperties;
}

/** An SVG id built from overlay identity parts, valid in `url(#…)`. */
export function mapOverlayId(plane: Pick<MapOverlayPlane, "idPrefix">, ...parts: string[]): string {
  return [plane.idPrefix, ...parts].join("-").replace(/[^a-zA-Z0-9_-]/g, "-");
}
