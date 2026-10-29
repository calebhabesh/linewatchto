/**
 * Overlap badge connector
 *
 * A short line from an overlap badge to the edge of the alert overlay it
 * explains. Its end dot sits just outside the overlay's outline (the edge of
 * the highlighted stroke, or the ring of a station-only alert), touching it,
 * so it never lands inside the overlay or on a station dot.
 *
 * The line stays straight: a bent line would read as another route. It only
 * passes through open space: its landing point moves along the overlay so the
 * line misses station names, other badges, station dots, and other transit
 * lines. When no nearby landing point gives a clear line, no line is drawn;
 * hovering the badge still outlines its alerts.
 */

import type { MapBounds, MapPoint } from "../app/map-geometry.ts";

/** An alert overlay's visible shape, in the same coordinates as the badge. */
export type ConnectorOutline =
  | { polyline: MapPoint[]; halfWidth: number }
  | { center: MapPoint; radius: number };

export type OverlapBadgeConnector = { from: MapPoint; to: MapPoint };

/** Map text the line must never pass through: a (possibly rotated) label outline or a box. */
export type ConnectorKeepOut = { polygon: MapPoint[]; padding: number } | MapBounds;

/** A drawn line the connector must not cross, such as a transit line's stroke. */
export type ConnectorCrossing = { polyline: MapPoint[]; radius: number };

const OUTLINE_SAMPLE_SPACING = 8;
/** Rounding slack when checking that the end dot sits outside an outline. */
const OUTLINE_TOLERANCE = 0.5;

/** End dot radius in badge units; multiply by the badge's visual scale for map units. */
export const OVERLAP_BADGE_CONNECTOR_DOT_RADIUS = 9;
/**
 * How much longer than the shortest line a clear line may be, so it can step
 * around a name without swinging to the far end of a long overlay: this ratio
 * of the shortest, or the shortest plus this many badge heights, whichever is
 * longer (a very short shortest line would otherwise leave no room at all).
 */
export const CONNECTOR_DETOUR_RATIO = 1.75;
const CONNECTOR_DETOUR_BADGE_HEIGHTS = 3;

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

function boundsOf(points: MapPoint[], pad = 0): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function boundsOverlap(a: Bounds, b: Bounds) {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

function cross(o: MapPoint, a: MapPoint, b: MapPoint) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function segmentsIntersect(a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint) {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function pointSegmentDistance(point: MapPoint, start: MapPoint, end: MapPoint) {
  const nearest = nearestPointOnSegment(point, start, end);
  return Math.hypot(point.x - nearest.x, point.y - nearest.y);
}

function segmentSegmentDistance(a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

function pointInPolygon(point: MapPoint, polygon: MapPoint[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

type PreparedKeepOut = { polygon: MapPoint[]; padding: number; bounds: Bounds };
type PreparedCrossing = { polyline: MapPoint[]; radius: number; bounds: Bounds };

// Map artwork is passed as the same objects on every call, so prepare it once.
const preparedKeepOutCache = new WeakMap<ConnectorKeepOut, PreparedKeepOut>();
const preparedCrossingCache = new WeakMap<ConnectorCrossing, PreparedCrossing[]>();
/** Points per prepared piece of a long line, so far-off pieces are skipped by their bounds. */
const CROSSING_PIECE_POINTS = 8;

function cachedKeepOut(keepOut: ConnectorKeepOut): PreparedKeepOut {
  let prepared = preparedKeepOutCache.get(keepOut);
  if (!prepared) {
    prepared = prepareKeepOut(keepOut);
    preparedKeepOutCache.set(keepOut, prepared);
  }
  return prepared;
}

function cachedCrossingPieces(crossing: ConnectorCrossing): PreparedCrossing[] {
  let pieces = preparedCrossingCache.get(crossing);
  if (!pieces) {
    pieces = [];
    const { polyline, radius } = crossing;
    for (let start = 0; start < polyline.length - 1; start += CROSSING_PIECE_POINTS - 1) {
      const points = polyline.slice(start, start + CROSSING_PIECE_POINTS);
      if (points.length > 1) pieces.push({ polyline: points, radius, bounds: boundsOf(points, radius) });
    }
    preparedCrossingCache.set(crossing, pieces);
  }
  return pieces;
}

function prepareKeepOut(keepOut: ConnectorKeepOut): PreparedKeepOut {
  const polygon = "polygon" in keepOut
    ? keepOut.polygon
    : [
      { x: keepOut.x, y: keepOut.y },
      { x: keepOut.x + keepOut.width, y: keepOut.y },
      { x: keepOut.x + keepOut.width, y: keepOut.y + keepOut.height },
      { x: keepOut.x, y: keepOut.y + keepOut.height },
    ];
  const padding = "polygon" in keepOut ? keepOut.padding : 0;
  return { polygon, padding, bounds: boundsOf(polygon, padding) };
}

function lineEntersKeepOut(from: MapPoint, to: MapPoint, lineBounds: Bounds, keepOut: PreparedKeepOut) {
  if (!boundsOverlap(lineBounds, keepOut.bounds)) return false;
  if (pointInPolygon(from, keepOut.polygon) || pointInPolygon(to, keepOut.polygon)) return true;
  const { polygon, padding } = keepOut;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (segmentSegmentDistance(from, to, start, end) < padding || segmentsIntersect(from, to, start, end)) return true;
  }
  return false;
}

function crossesLine(from: MapPoint, to: MapPoint, lineBounds: Bounds, crossing: PreparedCrossing) {
  if (!boundsOverlap(lineBounds, crossing.bounds)) return false;
  const { polyline, radius } = crossing;
  for (let index = 1; index < polyline.length; index += 1) {
    if (segmentSegmentDistance(from, to, polyline[index - 1], polyline[index]) < radius) return true;
  }
  return false;
}

function pointNearPiece(point: MapPoint, piece: PreparedCrossing) {
  if (point.x < piece.bounds.minX || point.x > piece.bounds.maxX || point.y < piece.bounds.minY || point.y > piece.bounds.maxY) {
    return false;
  }
  for (let index = 1; index < piece.polyline.length; index += 1) {
    if (pointSegmentDistance(point, piece.polyline[index - 1], piece.polyline[index]) < piece.radius) return true;
  }
  return false;
}

function entersCircle(from: MapPoint, to: MapPoint, circle: { center: MapPoint; radius: number }) {
  return pointSegmentDistance(circle.center, from, to) < circle.radius;
}

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

/** Another badge's footprint as an area the line must not pass through. */
export function badgeConnectorKeepOut(
  position: MapPoint,
  size: { width: number; height: number },
  padding: number,
): ConnectorKeepOut {
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  return {
    polygon: [
      { x: position.x - halfWidth, y: position.y - halfHeight },
      { x: position.x + halfWidth, y: position.y - halfHeight },
      { x: position.x + halfWidth, y: position.y + halfHeight },
      { x: position.x - halfWidth, y: position.y + halfHeight },
    ],
    padding,
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

export type OverlapBadgeConnectorOptions = {
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
  /** Station names, other badges, and similar artwork the line must not pass through. */
  keepOut?: ConnectorKeepOut[];
  /** Transit lines the line must not cross. */
  crossings?: ConnectorCrossing[];
};

/**
 * Connector from the badge's outline to the nearest point on any outline, or
 * null when the badge already touches its overlay closely enough that a line
 * would add nothing, or when no clear line exists.
 */
export function overlapBadgeConnector(options: OverlapBadgeConnectorOptions): OverlapBadgeConnector | null {
  return overlapBadgeConnectorSearch(options).connector;
}

/**
 * Like {@link overlapBadgeConnector}, but says whether a line is needed at
 * all: `needed` is false when the badge already touches its overlay. A needed
 * line that comes back null means the badge's spot has no clear line, so
 * badge placement can try another spot.
 */
export function overlapBadgeConnectorSearch({
  position,
  size,
  outlines,
  minimumLength,
  within,
  avoid = [],
  endRadius = 0,
  keepOut = [],
  crossings = [],
}: OverlapBadgeConnectorOptions): { needed: boolean; connector: OverlapBadgeConnector | null } {
  const [spineStart, spineEnd] = badgeSpine(position, size);
  const badgeRadius = size.height / 2;
  // Gaps are cheap; the end-dot and clear-line checks run only for landing
  // points still in range, nearest first.
  const samples: {
    gap: number;
    center: MapPoint;
    spinePoint: MapPoint;
    outlineRadius: number;
    /** The overlay segment the sample lies on; null for a ring or a single point. */
    segment: [MapPoint, MapPoint] | null;
  }[] = [];

  const consider = (center: MapPoint, outlineRadius: number, segment: [MapPoint, MapPoint] | null) => {
    if (within && Math.hypot(center.x - within.center.x, center.y - within.center.y) > within.radius) return;
    const spinePoint = nearestPointOnSegment(center, spineStart, spineEnd);
    const centerDistance = Math.hypot(center.x - spinePoint.x, center.y - spinePoint.y);
    samples.push({ gap: centerDistance - badgeRadius - outlineRadius - endRadius, center, spinePoint, outlineRadius, segment });
  };

  for (const outline of outlines) {
    if ("center" in outline) {
      consider(outline.center, outline.radius, null);
      continue;
    }
    const { polyline, halfWidth } = outline;
    if (polyline.length === 1) consider(polyline[0], halfWidth, null);
    // Sample along the overlay; with `within`, this also finds the closest
    // allowed point on a long segment that only partly lies near the station.
    for (let index = 1; index < polyline.length; index += 1) {
      const start = polyline[index - 1];
      const end = polyline[index];
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      const segment: [MapPoint, MapPoint] | null = length > 1e-6 ? [start, end] : null;
      const steps = Math.max(1, Math.ceil(length / OUTLINE_SAMPLE_SPACING));
      for (let step = 0; step <= steps; step += 1) {
        consider({
          x: start.x + ((end.x - start.x) * step) / steps,
          y: start.y + ((end.y - start.y) * step) / steps,
        }, halfWidth, segment);
      }
    }
  }

  // Nothing in reach to point at: there is no line to draw, wherever the badge sits.
  if (samples.length === 0) return { needed: false, connector: null };
  samples.sort((a, b) => a.gap - b.gap);
  const landing = (sample: (typeof samples)[number], dots = avoid) => {
    // The end dot sits where the line leaves the outline. A line meeting the
    // overlay at a slant travels farther inside it than its half-width: by the
    // half-width over the sine of the crossing angle. Near a segment's end the
    // rounded outline lets it out sooner; distance from a segment only grows
    // along the way out, so halving the range finds that point.
    const reach = sample.outlineRadius + endRadius;
    const toBadge = Math.hypot(sample.spinePoint.x - sample.center.x, sample.spinePoint.y - sample.center.y);
    let distance = reach;
    if (sample.segment && toBadge > 1e-6) {
      const [start, end] = sample.segment;
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      const sine = Math.abs(
        ((end.x - start.x) * (sample.spinePoint.y - sample.center.y) - (end.y - start.y) * (sample.spinePoint.x - sample.center.x))
          / (length * toBadge),
      );
      const clearance = (along: number) => pointSegmentDistance(stepToward(sample.center, sample.spinePoint, along), start, end);
      let outside = sine > 1e-6 ? Math.min(reach / sine, toBadge) : toBadge;
      if (clearance(outside) < reach - OUTLINE_TOLERANCE) return null;
      const exit = stepToward(sample.center, sample.spinePoint, outside);
      const projection = ((exit.x - start.x) * (end.x - start.x) + (exit.y - start.y) * (end.y - start.y)) / (length * length);
      if (projection < 0 || projection > 1) {
        let inside = 0;
        for (let step = 0; step < 24 && outside - inside > 0.01; step += 1) {
          const middle = (inside + outside) / 2;
          if (clearance(middle) < reach) inside = middle;
          else outside = middle;
        }
      }
      distance = Math.max(reach, outside);
    }
    // The dot must also stay clear of the badge.
    if (distance > toBadge - badgeRadius - endRadius) return null;
    const to = stepToward(sample.center, sample.spinePoint, distance);
    if (dots.some((circle) => Math.hypot(to.x - circle.center.x, to.y - circle.center.y) < circle.radius)) return null;
    return { gap: sample.gap, from: stepToward(sample.spinePoint, sample.center, badgeRadius), to };
  };
  // The dot also stays outside every other outline of the badge's alerts,
  // such as a neighbouring segment at a bend.
  const outsideOutlines = (point: MapPoint) => outlines.every((outline) => {
    if ("center" in outline) {
      return Math.hypot(point.x - outline.center.x, point.y - outline.center.y) >= outline.radius + endRadius - OUTLINE_TOLERANCE;
    }
    const { polyline, halfWidth } = outline;
    const limit = halfWidth + endRadius - OUTLINE_TOLERANCE;
    if (polyline.length === 1) return Math.hypot(point.x - polyline[0].x, point.y - polyline[0].y) >= limit;
    for (let index = 1; index < polyline.length; index += 1) {
      if (pointSegmentDistance(point, polyline[index - 1], polyline[index]) < limit) return false;
    }
    return true;
  });
  let firstIndex = 0;
  let shortestLanding: ReturnType<typeof landing> = null;
  for (; firstIndex < samples.length && !shortestLanding; firstIndex += 1) shortestLanding = landing(samples[firstIndex]);
  if (!shortestLanding) return { needed: true, connector: null };
  const shortest = shortestLanding;
  // A badge already touching its overlay needs no line.
  if (shortest.gap < minimumLength) return { needed: false, connector: null };

  const budget = Math.max(
    shortest.gap * CONNECTOR_DETOUR_RATIO,
    shortest.gap + size.height * CONNECTOR_DETOUR_BADGE_HEIGHTS,
  );
  let lastIndex = firstIndex;
  while (lastIndex < samples.length && samples[lastIndex].gap <= budget) lastIndex += 1;
  const inRange = samples.slice(firstIndex, lastIndex);
  const landingReach = Math.max(0, ...inRange.map((sample) => sample.outlineRadius)) + endRadius;
  const sampleBounds = boundsOf(inRange.map((sample) => sample.center), landingReach);
  const landingDots = avoid.filter((circle) => boundsOverlap(sampleBounds, boundsOf([circle.center], circle.radius)));
  const candidates = [shortest];
  for (const sample of inRange) {
    const candidate = landing(sample, landingDots);
    if (candidate) candidates.push(candidate);
  }
  // Only artwork within reach of every line still in the running matters.
  const reachBounds = boundsOf(candidates.flatMap((candidate) => [candidate.from, candidate.to]));
  const preparedKeepOuts = keepOut.map(cachedKeepOut).filter((area) => boundsOverlap(reachBounds, area.bounds));
  const preparedCrossings = crossings
    .filter((crossing) => crossing.polyline.length > 1)
    .flatMap(cachedCrossingPieces)
    .filter((piece) => boundsOverlap(reachBounds, piece.bounds));
  const nearbyDots = avoid.filter((circle) => boundsOverlap(reachBounds, boundsOf([circle.center], circle.radius)));
  // The line meets its own overlay, which sits on its own line beside its
  // station, so lines and station dots right at the end dot don't count.
  const endExemption = Math.max(endRadius * 3, OUTLINE_SAMPLE_SPACING);

  for (const candidate of candidates) {
    if (candidate.gap > budget) break;
    const { from, to } = candidate;
    if (!outsideOutlines(to)) continue;
    const lineBounds = boundsOf([from, to]);
    if (preparedKeepOuts.some((area) => lineEntersKeepOut(from, to, lineBounds, area))) continue;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length > endExemption) {
      const openEnd = stepToward(to, from, endExemption);
      const openBounds = boundsOf([from, openEnd]);
      // A line running through the landing point is the overlay's own line.
      const foreignLines = preparedCrossings.filter((piece) => !pointNearPiece(to, piece));
      if (foreignLines.some((crossing) => crossesLine(from, openEnd, openBounds, crossing))) continue;
      if (nearbyDots.some((circle) => entersCircle(from, openEnd, circle))) continue;
    }
    return { needed: true, connector: { from, to } };
  }
  return { needed: true, connector: null };
}

