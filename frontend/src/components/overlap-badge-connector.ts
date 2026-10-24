/**
 * Overlap badge connector
 *
 * A short line from an overlap badge to the edge of the alert overlay it
 * explains. Its end dot sits just outside the overlay's outline (the edge of
 * the highlighted stroke, or the ring of a station-only alert), touching it,
 * so it never lands inside the overlay or on a station dot.
 */

import type { MapPoint } from "../app/map-geometry.ts";

/** An alert overlay's visible shape, in the same coordinates as the badge. */
export type ConnectorOutline =
  | { polyline: MapPoint[]; halfWidth: number }
  | { center: MapPoint; radius: number };

export type OverlapBadgeConnector = { from: MapPoint; to: MapPoint };

const OUTLINE_SAMPLE_SPACING = 8;

/** End dot radius in badge units; multiply by the badge's visual scale for map units. */
export const OVERLAP_BADGE_CONNECTOR_DOT_RADIUS = 9;

function nearestPointOnSegment(point: MapPoint, start: MapPoint, end: MapPoint): MapPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
    : 0;
  return { x: start.x + dx * t, y: start.y + dy * t };
}

function stepToward(from: MapPoint, toward: MapPoint, distance: number): MapPoint {
  const length = Math.hypot(toward.x - from.x, toward.y - from.y);
  if (length < 1e-6) return from;
  return {
    x: from.x + ((toward.x - from.x) / length) * distance,
    y: from.y + ((toward.y - from.y) / length) * distance,
  };
}

/** Badges are circles or pills: a straight spine with round ends. */
function badgeSpine(position: MapPoint, size: { width: number; height: number }): [MapPoint, MapPoint] {
  const halfSpine = Math.max(0, (size.width - size.height) / 2);
  return [
    { x: position.x - halfSpine, y: position.y },
    { x: position.x + halfSpine, y: position.y },
  ];
}

/**
 * Connector from the badge's outline to the nearest point on any outline, or
 * null when the badge already touches its overlay closely enough that a line
 * would add nothing.
 */
export function overlapBadgeConnector({
  position,
  size,
  outlines,
  minimumLength,
  within,
  avoid = [],
  endRadius = 0,
}: {
  position: MapPoint;
  /** Rendered badge size in the same units as the outlines. */
  size: { width: number; height: number };
  outlines: ConnectorOutline[];
  minimumLength: number;
  /** Only connect to overlay points this close to a point, such as a station. */
  within?: { center: MapPoint; radius: number };
  /**
   * Circles the endpoint must stay out of, such as station dots, so the line
   * lands on the open part of the overlay rather than reading as a station.
   */
  avoid?: { center: MapPoint; radius: number }[];
  /** Radius of the end dot; the dot sits outside the outline, touching it. */
  endRadius?: number;
}): OverlapBadgeConnector | null {
  const [spineStart, spineEnd] = badgeSpine(position, size);
  const badgeRadius = size.height / 2;
  let best: { gap: number; from: MapPoint; to: MapPoint } | null = null;

  const consider = (center: MapPoint, outlineRadius: number) => {
    if (within && Math.hypot(center.x - within.center.x, center.y - within.center.y) > within.radius) return;
    const spinePoint = nearestPointOnSegment(center, spineStart, spineEnd);
    const centerDistance = Math.hypot(center.x - spinePoint.x, center.y - spinePoint.y);
    const gap = centerDistance - badgeRadius - outlineRadius - endRadius;
    if (best && gap >= best.gap) return;
    const to = stepToward(center, spinePoint, outlineRadius + endRadius);
    if (avoid.some((circle) => Math.hypot(to.x - circle.center.x, to.y - circle.center.y) < circle.radius)) return;
    best = { gap, from: stepToward(spinePoint, center, badgeRadius), to };
  };

  for (const outline of outlines) {
    if ("center" in outline) {
      consider(outline.center, outline.radius);
      continue;
    }
    const { polyline, halfWidth } = outline;
    if (polyline.length === 1) consider(polyline[0], halfWidth);
    // Sample along the overlay; with `within`, this also finds the closest
    // allowed point on a long segment that only partly lies near the station.
    for (let index = 1; index < polyline.length; index += 1) {
      const start = polyline[index - 1];
      const end = polyline[index];
      const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / OUTLINE_SAMPLE_SPACING));
      for (let step = 0; step <= steps; step += 1) {
        consider({
          x: start.x + ((end.x - start.x) * step) / steps,
          y: start.y + ((end.y - start.y) * step) / steps,
        }, halfWidth);
      }
    }
  }

  const found = best as { gap: number; from: MapPoint; to: MapPoint } | null;
  return found && found.gap >= minimumLength ? { from: found.from, to: found.to } : null;
}
