/**
 * Overlap chooser placement
 *
 * Opens the "Choose Alert" card next to the badge that spawned it, in screen
 * pixels, using the same grid search as badge placement. In priority order:
 * 1. never cover keep-out UI (map controls, sheets, headers);
 * 2. never cover the badge itself;
 * 3. avoid the overlays of the alerts being chosen between, so they stay
 *    visible while highlighted;
 * 4. sit as close to the badge as possible, leaning toward the affected area.
 * Other badges are not obstacles: the card simply opens over them.
 *
 * When the full card cannot meet a rule, it first tries smaller sizes down to
 * a comfortable height (the card scrolls internally) and only then relaxes the
 * lowest-priority rule. Below that height the list is too short to use, so the
 * card would rather cover part of the overlays than shrink further.
 *
 * An open card passes its current spot as `preferred`. While that spot still
 * meets every rule at a comfortable size, it is kept, so settling the camera
 * after a pan or zoom does not move a card that is fine where it is. A card
 * that already had to cover the overlays keeps its spot unless a fresh solve
 * can uncover them.
 */

import type { MapBounds, MapPoint } from "../app/map-geometry.ts";
import { chooserWidthCandidates } from "./map-chooser-layout.ts";
import { placeOverlapBadges, type PlacementObstacle } from "./overlap-badge-placement.ts";

export const CHOOSER_VIEWPORT_MARGIN = 16;
export const CHOOSER_BADGE_GAP = 12;
export const CHOOSER_KEEPOUT_GAP = 8;
// Never shrink below this unless the viewport itself is shorter.
const CHOOSER_MIN_HEIGHT = 142;
// About three rows: the smallest card that still reads as a list.
const CHOOSER_COMFORTABLE_HEIGHT = 220;
const CHOOSER_HEIGHT_STEP = 24;
// Within this distance of the badge, the card reads as attached to it.
const CHOOSER_NEAR_DISTANCE = 64;
const CHOOSER_CELL_SIZE = 8;
const CHOOSER_OBSTACLE_CLEARANCE = 4;
const BADGE_OUTLINE_SPACING = 8;
// How far the tie-break anchor leans from the badge toward the affected area.
const AFFECTED_AREA_LEAN = 0.25;

export type OverlapChooserPlacement = {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Badge centre relative to the card centre, for the card's pointer. */
  anchorOffsetX: number;
  anchorOffsetY: number;
  /** True when no position could keep the highlighted overlays uncovered. */
  coversAffectedArea: boolean;
};

export type OverlapChooserPlacementInput = {
  viewportSize: { width: number; height: number };
  /** The badge's rendered box, in viewport pixels. */
  badgeBox: MapBounds;
  /** The overlays of the alerts in the chooser, in viewport pixels. */
  affectedArea: PlacementObstacle[];
  /** UI the card must never cover, in viewport pixels. */
  keepouts: MapBounds[];
  requestedSize: { width: number; height: number };
  /** The open card's current box, relative to the badge centre. */
  preferred?: OverlapChooserPreferredBox | null;
};

/** A card box as an offset of its top-left corner from the badge centre. */
export type OverlapChooserPreferredBox = {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  /** The card already covers part of the overlays it lists. */
  coversAffectedArea?: boolean;
};

function segmentBoxDistance(start: MapPoint, end: MapPoint, box: MapBounds): number {
  const inside = (point: MapPoint) => point.x >= box.x && point.x <= box.x + box.width
    && point.y >= box.y && point.y <= box.y + box.height;
  if (inside(start) || inside(end)) return 0;
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ];
  const cross = (a: MapPoint, b: MapPoint, c: MapPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let index = 0; index < 4; index += 1) {
    const a = corners[index];
    const b = corners[(index + 1) % 4];
    if (cross(start, end, a) * cross(start, end, b) < 0 && cross(a, b, start) * cross(a, b, end) < 0) return 0;
  }
  const pointSegment = (point: MapPoint, a: MapPoint, b: MapPoint) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared > 0
      ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
      : 0;
    return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
  };
  const clampedDistance = (point: MapPoint) => Math.hypot(
    Math.max(box.x - point.x, 0, point.x - (box.x + box.width)),
    Math.max(box.y - point.y, 0, point.y - (box.y + box.height)),
  );
  return Math.min(
    clampedDistance(start),
    clampedDistance(end),
    ...corners.map((corner) => pointSegment(corner, start, end)),
  );
}

function pointInPolygon(point: MapPoint, polygon: MapPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** True when `box` comes within `clearance` of the obstacle. */
export function boxTouchesObstacle(box: MapBounds, obstacle: PlacementObstacle, clearance: number): boolean {
  if ("polyline" in obstacle) {
    const reach = obstacle.radius + clearance;
    const points = obstacle.polyline;
    if (points.length === 1) return segmentBoxDistance(points[0], points[0], box) < reach;
    for (let index = 1; index < points.length; index += 1) {
      if (segmentBoxDistance(points[index - 1], points[index], box) < reach) return true;
    }
    return false;
  }
  if ("polygon" in obstacle) {
    const reach = obstacle.padding + clearance;
    const points = obstacle.polygon;
    if (points.length === 0) return false;
    if (pointInPolygon({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, points)) return true;
    for (let index = 0; index < points.length; index += 1) {
      const next = points[(index + 1) % points.length];
      if (segmentBoxDistance(points[index], next, box) < reach) return true;
    }
    return false;
  }
  return edgeGap(box, obstacle) < clearance
    || (box.x < obstacle.x + obstacle.width && obstacle.x < box.x + box.width
      && box.y < obstacle.y + obstacle.height && obstacle.y < box.y + box.height);
}

function expand(box: MapBounds, padding: number): MapBounds {
  return { x: box.x - padding, y: box.y - padding, width: box.width + padding * 2, height: box.height + padding * 2 };
}

function boxOutline(box: MapBounds): MapPoint[] {
  const points: MapPoint[] = [];
  const columns = Math.max(1, Math.ceil(box.width / BADGE_OUTLINE_SPACING));
  const rows = Math.max(1, Math.ceil(box.height / BADGE_OUTLINE_SPACING));
  for (let column = 0; column <= columns; column += 1) {
    const x = box.x + (box.width * column) / columns;
    points.push({ x, y: box.y }, { x, y: box.y + box.height });
  }
  for (let row = 1; row < rows; row += 1) {
    const y = box.y + (box.height * row) / rows;
    points.push({ x: box.x, y }, { x: box.x + box.width, y });
  }
  return points;
}

function edgeGap(first: MapBounds, second: MapBounds): number {
  const horizontal = Math.max(first.x - (second.x + second.width), second.x - (first.x + first.width), 0);
  const vertical = Math.max(first.y - (second.y + second.height), second.y - (first.y + first.height), 0);
  return Math.hypot(horizontal, vertical);
}

/** Nearest sampled point of the affected area, used only to break ties. */
function nearestAffectedPoint(affectedArea: PlacementObstacle[], from: MapPoint): MapPoint | null {
  let best: { point: MapPoint; distance: number } | null = null;
  for (const obstacle of affectedArea) {
    const points = "polyline" in obstacle
      ? obstacle.polyline
      : "polygon" in obstacle
        ? obstacle.polygon
        : [{ x: obstacle.x + obstacle.width / 2, y: obstacle.y + obstacle.height / 2 }];
    for (const point of points) {
      const distance = Math.hypot(point.x - from.x, point.y - from.y);
      if (!best || distance < best.distance) best = { point, distance };
    }
  }
  return best?.point ?? null;
}

function sizeCandidates(requested: { width: number; height: number }, viewport: { width: number; height: number }) {
  const minimumHeight = Math.min(
    requested.height,
    Math.max(80, Math.min(CHOOSER_MIN_HEIGHT, viewport.height - CHOOSER_VIEWPORT_MARGIN * 2)),
  );
  const heights: number[] = [];
  for (let height = requested.height; height > minimumHeight; height -= CHOOSER_HEIGHT_STEP) heights.push(height);
  heights.push(minimumHeight);
  return chooserWidthCandidates(requested.width, viewport.width)
    .flatMap((width) => heights.map((height) => ({ width, height })));
}

/**
 * The preferred box, when it still meets the placement rules. With
 * `allowCover`, it may overlap the affected area and use any size a fresh
 * solve could fall back to.
 */
function keptPreferredBox({
  viewportSize,
  badgeBox,
  affectedArea,
  keepouts,
  requestedSize,
  preferred,
}: OverlapChooserPlacementInput & { preferred: OverlapChooserPreferredBox }, allowCover: boolean): MapBounds | null {
  // Keep any size a fresh solve could also pick under the same rules.
  const widths = chooserWidthCandidates(requestedSize.width, viewportSize.width);
  const sizes = sizeCandidates(requestedSize, viewportSize);
  const minimumHeight = allowCover
    ? sizes[sizes.length - 1].height
    : Math.min(requestedSize.height, CHOOSER_COMFORTABLE_HEIGHT);
  if (
    preferred.width > widths[0] + 0.5
    || preferred.width < widths[widths.length - 1] - 0.5
    || preferred.height > requestedSize.height + 0.5
    || preferred.height < minimumHeight - 0.5
  ) return null;
  const badgeCenter = { x: badgeBox.x + badgeBox.width / 2, y: badgeBox.y + badgeBox.height / 2 };
  const box = {
    x: badgeCenter.x + preferred.offsetX,
    y: badgeCenter.y + preferred.offsetY,
    width: preferred.width,
    height: preferred.height,
  };
  const withinViewport = box.x >= CHOOSER_VIEWPORT_MARGIN - 0.5
    && box.y >= CHOOSER_VIEWPORT_MARGIN - 0.5
    && box.x + box.width <= viewportSize.width - CHOOSER_VIEWPORT_MARGIN + 0.5
    && box.y + box.height <= viewportSize.height - CHOOSER_VIEWPORT_MARGIN + 0.5;
  if (!withinViewport) return null;
  // The grid search resolves gaps to one cell, so a spot it chose can sit up to
  // a cell inside a gap. Check kept spots with the same slack, or a valid card
  // would be re-placed a few pixels away after every pan.
  const slack = CHOOSER_CELL_SIZE;
  if (keepouts.some((keepout) => boxTouchesObstacle(box, keepout, Math.max(0, CHOOSER_KEEPOUT_GAP - slack)))) return null;
  if (boxTouchesObstacle(box, badgeBox, Math.max(0, CHOOSER_BADGE_GAP - slack))) return null;
  if (!allowCover && affectedArea.some((obstacle) => boxTouchesObstacle(box, obstacle, 0))) return null;
  return box;
}

export function placeOverlapChooser({
  viewportSize,
  badgeBox,
  affectedArea,
  keepouts,
  requestedSize,
  preferred,
}: OverlapChooserPlacementInput): OverlapChooserPlacement {
  const badgeCenter = { x: badgeBox.x + badgeBox.width / 2, y: badgeBox.y + badgeBox.height / 2 };
  const keptPlacement = (box: MapBounds, coversAffectedArea: boolean): OverlapChooserPlacement => ({
    left: box.x,
    top: box.y,
    width: box.width,
    height: box.height,
    anchorOffsetX: badgeCenter.x - (box.x + box.width / 2),
    anchorOffsetY: badgeCenter.y - (box.y + box.height / 2),
    coversAffectedArea,
  });
  const preferredInput = preferred
    ? { viewportSize, badgeBox, affectedArea, keepouts, requestedSize, preferred }
    : null;
  const kept = preferredInput ? keptPreferredBox(preferredInput, false) : null;
  if (kept) return keptPlacement(kept, false);
  const affectedPoint = nearestAffectedPoint(affectedArea, badgeCenter);
  const anchor = affectedPoint
    ? {
        x: badgeCenter.x + (affectedPoint.x - badgeCenter.x) * AFFECTED_AREA_LEAN,
        y: badgeCenter.y + (affectedPoint.y - badgeCenter.y) * AFFECTED_AREA_LEAN,
      }
    : badgeCenter;
  const bounds = {
    x: CHOOSER_VIEWPORT_MARGIN,
    y: CHOOSER_VIEWPORT_MARGIN,
    width: Math.max(1, viewportSize.width - CHOOSER_VIEWPORT_MARGIN * 2),
    height: Math.max(1, viewportSize.height - CHOOSER_VIEWPORT_MARGIN * 2),
  };
  // Stable arrays let the engine reuse each layer's rasterization across sizes.
  const keepoutLayer: PlacementObstacle[] = keepouts.map((box) => expand(box, CHOOSER_KEEPOUT_GAP));
  const badgeLayer: PlacementObstacle[] = [expand(badgeBox, CHOOSER_BADGE_GAP)];
  const targets = boxOutline(badgeBox);
  const sizes = sizeCandidates(requestedSize, viewportSize);
  const comfortableHeight = Math.min(requestedSize.height, CHOOSER_COMFORTABLE_HEIGHT);
  const comfortableSizes = sizes.filter((size) => size.height >= comfortableHeight);

  const attempt = (size: { width: number; height: number }, layers: PlacementObstacle[][]) => {
    const [placement] = placeOverlapBadges({
      badges: [{ id: "chooser", size, targets, anchor }],
      obstacleLayers: layers,
      mapBounds: bounds,
      siblingGap: 0,
      clearance: CHOOSER_OBSTACLE_CLEARANCE,
      cellSize: CHOOSER_CELL_SIZE,
      searchRadius: Math.hypot(viewportSize.width, viewportSize.height),
    });
    if (!placement) return null;
    const box = {
      x: placement.position.x - size.width / 2,
      y: placement.position.y - size.height / 2,
      width: size.width,
      height: size.height,
    };
    return { size, box, clear: placement.collisionAvoided, distance: edgeGap(box, badgeBox) };
  };

  type Attempt = NonNullable<ReturnType<typeof attempt>>;
  const firstFit = (
    layers: PlacementObstacle[][],
    near: boolean,
    candidates = comfortableSizes,
  ): Attempt | null => {
    for (const size of candidates) {
      const result = attempt(size, layers);
      if (result?.clear && (!near || result.distance <= CHOOSER_NEAR_DISTANCE)) return result;
    }
    return null;
  };

  const strict = [keepoutLayer, badgeLayer, affectedArea];
  const relaxed = [keepoutLayer, badgeLayer];
  const tiers: Array<{ find: () => Attempt | null; coversAffectedArea: boolean }> = [
    // Beside the badge without covering the overlays, shrinking if needed.
    { find: () => firstFit(strict, true), coversAffectedArea: false },
    // Farther away, still without covering them.
    { find: () => firstFit(strict, false), coversAffectedArea: false },
    // Over the overlays, but never over the badge or keep-outs.
    { find: () => firstFit(relaxed, true), coversAffectedArea: true },
    { find: () => firstFit(relaxed, false, sizes), coversAffectedArea: true },
    { find: () => firstFit([keepoutLayer], false, sizes), coversAffectedArea: true },
  ];
  let chosen: Attempt | null = null;
  let coversAffectedArea = true;
  for (const tier of tiers) {
    chosen = tier.find();
    if (chosen) {
      coversAffectedArea = tier.coversAffectedArea;
      break;
    }
  }
  // Nothing is clear (a tiny viewport): take the least-covered spot at the smallest size.
  chosen ??= attempt(sizes[sizes.length - 1], [keepoutLayer]) ?? {
    size: sizes[sizes.length - 1],
    box: { x: bounds.x, y: bounds.y, ...sizes[sizes.length - 1] },
    clear: false,
    distance: Infinity,
  };

  if (coversAffectedArea && preferredInput?.preferred.coversAffectedArea) {
    // No spot uncovers the overlays, and the card already covers them.
    const keptCovering = keptPreferredBox(preferredInput, true);
    if (keptCovering) return keptPlacement(keptCovering, true);
  }

  const center = { x: chosen.box.x + chosen.box.width / 2, y: chosen.box.y + chosen.box.height / 2 };
  return {
    left: chosen.box.x,
    top: chosen.box.y,
    width: chosen.size.width,
    height: chosen.size.height,
    anchorOffsetX: badgeCenter.x - center.x,
    anchorOffsetY: badgeCenter.y - center.y,
    coversAffectedArea,
  };
}
