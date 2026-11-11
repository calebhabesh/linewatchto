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

/** A station dot an alert's track may end inside: centre and outer edge radius. */
export type MapOverlayDot = { x: number; y: number; radius: number };

/**
 * Where one map draws its overlays: in its root SVG's coordinates, at its
 * own scale. Both maps draw the same overlay design.
 */
export type MapOverlayPlane = {
  /** Prefix for SVG ids, unique per map: its map id. */
  idPrefix: string;
  /** Map units per TTC overlay unit: 1 on TTC; GO/UP's rail width over TTC's. */
  unit: number;
  /** The drawing's extent in overlay coordinates, for map-wide masks. */
  maskBounds: MapBounds;
  /** Station shapes the hover outline stops at instead of crossing. */
  outlineCutouts: MapOverlayCutout[];
  /**
   * Station dots, for outline ends: a track that stops short of its
   * terminal's centre (Vaughan, Finch, Mount Dennis) is outlined on to the
   * centre, so the outline's round end lies on the dot's border.
   */
  outlineDots: MapOverlayDot[];
};

/** Sets the overlay unit that overlay CSS sizes multiply by. */
export function mapOverlayUnitStyle(plane: Pick<MapOverlayPlane, "unit">): CSSProperties {
  return { "--map-overlay-unit": String(plane.unit) } as CSSProperties;
}

/** An SVG id built from overlay identity parts, valid in `url(#…)`. */
export function mapOverlayId(plane: Pick<MapOverlayPlane, "idPrefix">, ...parts: string[]): string {
  return [plane.idPrefix, ...parts].join("-").replace(/[^a-zA-Z0-9_-]/g, "-");
}

const PATH_NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

/**
 * Short connectors from each path end that lies inside a station dot, short
 * of its centre, to that centre. Outlined with the paths, they carry the
 * outline's round end to the dot's centre, where it sits on the dot's border
 * as it does wherever a track ends at a station's centre.
 */
export function mapOutlineEndConnectors(paths: readonly string[], dots: readonly MapOverlayDot[]): string[] {
  if (dots.length === 0) return [];
  const connectors = new Set<string>();
  for (const d of paths) {
    for (const subpath of d.split(/(?=[Mm])/)) {
      const numbers = subpath.match(PATH_NUMBER)?.map(Number) ?? [];
      if (numbers.length < 4) continue;
      const ends: Array<[number, number]> = [
        [numbers[0], numbers[1]],
        [numbers[numbers.length - 2], numbers[numbers.length - 1]],
      ];
      for (const [x, y] of ends) {
        let nearest: MapOverlayDot | null = null;
        let nearestDistance = Infinity;
        for (const dot of dots) {
          const distance = Math.hypot(dot.x - x, dot.y - y);
          if (distance <= dot.radius && distance < nearestDistance) {
            nearest = dot;
            nearestDistance = distance;
          }
        }
        if (nearest && nearestDistance > 1) connectors.add(`M ${x} ${y} L ${nearest.x} ${nearest.y}`);
      }
    }
  }
  return [...connectors];
}
