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
};

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

export function placeOverlapChooser({
  viewportSize,
  badgeBox,
  affectedArea,
  keepouts,
  requestedSize,
}: OverlapChooserPlacementInput): OverlapChooserPlacement {
  const badgeCenter = { x: badgeBox.x + badgeBox.width / 2, y: badgeBox.y + badgeBox.height / 2 };
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
