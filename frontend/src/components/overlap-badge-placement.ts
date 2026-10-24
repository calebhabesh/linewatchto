/**
 * Overlap badge placement
 *
 * Places overlap badges as close as possible to the map overlay each one
 * explains, without covering map artwork (labels, lines, stations) or alert
 * overlays. Badges that land near each other are re-placed together in an
 * aligned formation (row, column, or grid) with even gaps.
 *
 * How it works:
 * 1. Rasterize every obstacle into an occupancy grid with a summed-area table,
 *    so "is this badge box clear?" is an O(1) lookup. Obstacles keep their
 *    real shape: stroked lines are capsules and rotated labels are polygons,
 *    so the empty space beside a diagonal line or slanted label stays usable.
 * 2. For each badge, build a distance field from its own overlay (badge edge to
 *    nearest overlay point) and, when given, from other alerts' overlays. A
 *    badge that sits clearly closer to another alert's overlay than its own is
 *    penalized because it reads as belonging to that alert.
 * 3. Scan every grid cell for the cheapest clear spot. This is a global search
 *    rather than an outward ring search, so a clear nook beside the overlay
 *    always beats an open area far from it.
 * 4. Group badges whose best spots are close together, and try every aligned
 *    formation for the group. Keep the formation unless it costs much more
 *    proximity than placing the badges one by one.
 *
 * The result depends only on its inputs: the same geometry always produces the
 * same layout, so badges stay still across refreshes without stored history.
 */

import type { MapBounds, MapPoint } from "../app/map-geometry.ts";

export type OverlapBadgeSize = { width: number; height: number };

export type OverlapBadgePlacementRequest = {
  id: string;
  size: OverlapBadgeSize;
  /** Sampled points along the overlay (or station) this badge explains. */
  targets: MapPoint[];
  /**
   * Where the badge would ideally sit, such as the station. Defaults to the
   * target nearest the targets' centroid. Only breaks ties between equally
   * close spots, so a badge beside a straight line settles at its middle
   * instead of one end.
   */
  anchor?: MapPoint;
  /** Sampled points of other alerts' overlays the badge should not appear to belong to. */
  foreignTargets?: MapPoint[];
};

/**
 * Something a badge must not cover:
 * - a box, for compact artwork such as station markers;
 * - a polyline with a radius, for stroked lines and alert overlays;
 * - a convex polygon with padding, for rotated labels.
 */
export type PlacementObstacle =
  | MapBounds
  | { polyline: MapPoint[]; radius: number }
  | { polygon: MapPoint[]; padding: number };

export type OverlapBadgePlacement = {
  id: string;
  position: MapPoint;
  /** Badges sharing a group id were laid out together in one aligned formation. */
  groupId: string;
  collisionAvoided: boolean;
};

export type OverlapBadgePlacementOptions = {
  badges: OverlapBadgePlacementRequest[];
  /**
   * Obstacles in layers. Each layer's rasterization is cached by array
   * identity, so pass stable arrays for artwork that rarely changes.
   */
  obstacleLayers: readonly PlacementObstacle[][];
  mapBounds: MapBounds;
  /** Edge gap between badges in one formation. */
  siblingGap: number;
  /** Extra space kept between a badge and any obstacle. */
  clearance?: number;
  /** Grid resolution in map units. */
  cellSize?: number;
  /** How far from its overlay a badge may be placed before falling back. */
  searchRadius?: number;
  /** Badges whose best spots are within this edge gap are laid out together. */
  groupDistance?: number;
  /** Extra overlay distance per badge accepted to keep a group aligned. */
  alignmentTolerance?: number;
  /**
   * Map units per TTC schematic unit. The defaults above are tuned for the TTC
   * map; a map drawn at twice the scale passes 2 so every default distance
   * (clearance, cell size, search radius, margins) scales with it.
   */
  unitScale?: number;
};

const DEFAULT_CLEARANCE = 10;

/**
 * How far a badge stays from each kind of map feature, measured from the
 * feature's visible edge, in TTC map units. Both maps derive their obstacle
 * sizes from these (scaled by their unit scale), so badges keep the same
 * spacing relative to their own size on every map.
 */
export const BADGE_FEATURE_GAPS = {
  /** From the outer edge of an alert overlay's hover outline. */
  alertOverlay: 5,
  /** From the edge of an unalerted transit line. */
  transitLine: 48,
  /** From a label's glyph box. */
  label: 28,
  /** From other artwork: station dots, interchange hubs, route badges, logos. */
  artwork: 28,
} as const;

/**
 * Obstacle radius (or padding, with a zero half-width) that leaves `gap`
 * between a feature's visible edge and a badge, after the engine's own
 * clearance is added.
 */
export function badgeObstacleReach(visibleHalfWidth: number, gap: number, unitScale = 1): number {
  return visibleHalfWidth + (gap - DEFAULT_CLEARANCE) * unitScale;
}
const DEFAULT_CELL_SIZE = 10;
const DEFAULT_SEARCH_RADIUS = 1000;
const DEFAULT_ALIGNMENT_TOLERANCE = 110;
// A badge that sits clearly closer to another alert's overlay than to its own
// reads as belonging to that alert. Small differences are normal in dense
// areas, so only the excess beyond a margin is penalized.
const FOREIGN_PROXIMITY_MARGIN = 120;
const FOREIGN_PROXIMITY_WEIGHT = 0.5;
const ANCHOR_TIE_BREAK_WEIGHT = 0.05;
const FORMATION_SEARCH_MARGIN = 600;
const FAR = 1e20;

type Window = { c0: number; r0: number; cols: number; rows: number };

type Tuning = {
  foreignMargin: number;
  formationMargin: number;
};

type BadgeState = {
  request: OverlapBadgePlacementRequest;
  window: Window;
  /** Placement cost per window cell; Infinity where the overlay is out of reach. */
  cost: Float64Array;
  /** Cell offsets from a badge's centre cell to the edges of its padded box. */
  extent: { left: number; right: number; top: number; bottom: number };
};

type Candidate = { positions: MapPoint[]; cost: number; collisionAvoided: boolean };

const rasterCache = new WeakMap<readonly PlacementObstacle[], { key: string; occupied: Uint8Array }>();

class OccupancyGrid {
  readonly bounds: MapBounds;
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  private readonly occupied: Uint8Array;
  private readonly table: Int32Array;

  constructor(bounds: MapBounds, cell: number) {
    this.bounds = bounds;
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil(bounds.width / cell));
    this.rows = Math.max(1, Math.ceil(bounds.height / cell));
    this.occupied = new Uint8Array(this.cols * this.rows);
    this.table = new Int32Array((this.cols + 1) * (this.rows + 1));
  }

  /** Adds a layer, reusing its rasterization when the same array was seen before. */
  addLayer(layer: readonly PlacementObstacle[]) {
    const key = `${this.bounds.x}:${this.bounds.y}:${this.bounds.width}:${this.bounds.height}:${this.cell}`;
    let raster = rasterCache.get(layer);
    if (!raster || raster.key !== key) {
      const layerGrid = new OccupancyGrid(this.bounds, this.cell);
      for (const obstacle of layer) layerGrid.mark(obstacle);
      raster = { key, occupied: layerGrid.occupied };
      rasterCache.set(layer, raster);
    }
    for (let index = 0; index < this.occupied.length; index += 1) {
      this.occupied[index] |= raster.occupied[index];
    }
  }

  add(obstacles: PlacementObstacle[]) {
    for (const obstacle of obstacles) this.mark(obstacle);
    this.rebuildTable();
  }

  snapshot(): Uint8Array {
    return this.occupied.slice();
  }

  restore(snapshot: Uint8Array) {
    this.occupied.set(snapshot);
    this.rebuildTable();
  }

  rebuildTable() {
    const stride = this.cols + 1;
    for (let row = 0; row < this.rows; row += 1) {
      let rowSum = 0;
      for (let column = 0; column < this.cols; column += 1) {
        rowSum += this.occupied[row * this.cols + column];
        this.table[(row + 1) * stride + column + 1] = this.table[row * stride + column + 1] + rowSum;
      }
    }
  }

  /** Occupied cells in an inclusive cell range, or -1 when it leaves the map. */
  blockedCells(c0: number, r0: number, c1: number, r1: number): number {
    if (c0 < 0 || r0 < 0 || c1 >= this.cols || r1 >= this.rows) return -1;
    const stride = this.cols + 1;
    return this.table[(r1 + 1) * stride + c1 + 1]
      - this.table[r0 * stride + c1 + 1]
      - this.table[(r1 + 1) * stride + c0]
      + this.table[r0 * stride + c0];
  }

  cellCenter(column: number, row: number): MapPoint {
    return {
      x: this.bounds.x + (column + 0.5) * this.cell,
      y: this.bounds.y + (row + 0.5) * this.cell,
    };
  }

  private mark(obstacle: PlacementObstacle) {
    if ("polyline" in obstacle) this.markPolyline(obstacle.polyline, obstacle.radius);
    else if ("polygon" in obstacle) this.markPolygon(obstacle.polygon, obstacle.padding);
    else this.markBox(obstacle);
  }

  private cellRange(box: MapBounds) {
    const c0 = Math.max(0, Math.floor((box.x - this.bounds.x) / this.cell));
    const r0 = Math.max(0, Math.floor((box.y - this.bounds.y) / this.cell));
    const c1 = Math.min(this.cols - 1, Math.ceil((box.x + box.width - this.bounds.x) / this.cell) - 1);
    const r1 = Math.min(this.rows - 1, Math.ceil((box.y + box.height - this.bounds.y) / this.cell) - 1);
    return c1 < c0 || r1 < r0 ? null : { c0, r0, c1, r1 };
  }

  private markBox(box: MapBounds) {
    const range = this.cellRange(box);
    if (!range) return;
    for (let row = range.r0; row <= range.r1; row += 1) {
      this.occupied.fill(1, row * this.cols + range.c0, row * this.cols + range.c1 + 1);
    }
  }

  /** Marks every cell that touches the shape, given its distance from a cell centre. */
  private markWithin(bounds: MapBounds, reach: number, distance: (x: number, y: number) => number) {
    const range = this.cellRange(bounds);
    if (!range) return;
    // A cell touches the shape when its centre is within half a cell diagonal.
    const limit = reach + this.cell * Math.SQRT1_2;
    for (let row = range.r0; row <= range.r1; row += 1) {
      const y = this.bounds.y + (row + 0.5) * this.cell;
      for (let column = range.c0; column <= range.c1; column += 1) {
        const index = row * this.cols + column;
        if (this.occupied[index]) continue;
        if (distance(this.bounds.x + (column + 0.5) * this.cell, y) <= limit) this.occupied[index] = 1;
      }
    }
  }

  private markPolyline(points: MapPoint[], radius: number) {
    if (points.length === 1) {
      const [point] = points;
      this.markWithin(pointBounds(points, radius), radius, (x, y) => Math.hypot(x - point.x, y - point.y));
      return;
    }
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1];
      const end = points[index];
      this.markWithin(pointBounds([start, end], radius), radius, (x, y) => segmentDistance(x, y, start, end));
    }
  }

  private markPolygon(points: MapPoint[], padding: number) {
    if (points.length < 3) {
      this.markPolyline(points, padding);
      return;
    }
    this.markWithin(pointBounds(points, padding), padding, (x, y) => {
      if (pointInPolygon(x, y, points)) return 0;
      let nearest = Infinity;
      for (let index = 0; index < points.length; index += 1) {
        nearest = Math.min(nearest, segmentDistance(x, y, points[index], points[(index + 1) % points.length]));
      }
      return nearest;
    });
  }
}

function pointBounds(points: MapPoint[], padding: number): MapBounds {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs) - padding;
  const y = Math.min(...ys) - padding;
  return { x, y, width: Math.max(...xs) + padding - x, height: Math.max(...ys) + padding - y };
}

function segmentDistance(x: number, y: number, start: MapPoint, end: MapPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / lengthSquared))
    : 0;
  return Math.hypot(x - (start.x + dx * t), y - (start.y + dy * t));
}

function pointInPolygon(x: number, y: number, polygon: MapPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** One-dimensional squared distance transform (Felzenszwalb & Huttenlocher). */
function distanceTransform1d(
  input: Float64Array,
  length: number,
  output: Float64Array,
  parabolas: Int32Array,
  boundaries: Float64Array,
) {
  const intersection = (q: number, vertex: number) => (
    ((input[q] + q * q) - (input[vertex] + vertex * vertex)) / (2 * q - 2 * vertex)
  );
  let k = 0;
  parabolas[0] = 0;
  boundaries[0] = -Infinity;
  boundaries[1] = Infinity;
  for (let q = 1; q < length; q += 1) {
    let s = intersection(q, parabolas[k]);
    while (s <= boundaries[k]) {
      k -= 1;
      s = intersection(q, parabolas[k]);
    }
    k += 1;
    parabolas[k] = q;
    boundaries[k] = s;
    boundaries[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < length; q += 1) {
    while (boundaries[k + 1] < q) k += 1;
    const vertex = parabolas[k];
    output[q] = (q - vertex) * (q - vertex) + input[vertex];
  }
}

/**
 * Distance from a badge box centred on each window cell to the nearest target.
 * Dilating each target by the badge's half-size turns box-to-point distance
 * into a plain point distance, which an exact Euclidean transform solves.
 */
function badgeDistanceField(
  grid: OccupancyGrid,
  window: Window,
  targets: MapPoint[],
  size: OverlapBadgeSize,
): Float64Array {
  const { c0, r0, cols, rows } = window;
  const squared = new Float64Array(cols * rows).fill(FAR);
  const cell = grid.cell;
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  for (const target of targets) {
    const minColumn = Math.max(c0, Math.ceil((target.x - halfWidth - grid.bounds.x) / cell - 0.5));
    const maxColumn = Math.min(c0 + cols - 1, Math.floor((target.x + halfWidth - grid.bounds.x) / cell - 0.5));
    const minRow = Math.max(r0, Math.ceil((target.y - halfHeight - grid.bounds.y) / cell - 0.5));
    const maxRow = Math.min(r0 + rows - 1, Math.floor((target.y + halfHeight - grid.bounds.y) / cell - 0.5));
    if (minColumn > maxColumn) continue;
    for (let row = minRow; row <= maxRow; row += 1) {
      squared.fill(0, (row - r0) * cols + (minColumn - c0), (row - r0) * cols + (maxColumn - c0) + 1);
    }
  }

  const longest = Math.max(cols, rows);
  const input = new Float64Array(longest);
  const output = new Float64Array(longest);
  const parabolas = new Int32Array(longest);
  const boundaries = new Float64Array(longest + 1);
  for (let column = 0; column < cols; column += 1) {
    for (let row = 0; row < rows; row += 1) input[row] = squared[row * cols + column];
    distanceTransform1d(input, rows, output, parabolas, boundaries);
    for (let row = 0; row < rows; row += 1) squared[row * cols + column] = output[row];
  }
  for (let row = 0; row < rows; row += 1) {
    const offset = row * cols;
    for (let column = 0; column < cols; column += 1) input[column] = squared[offset + column];
    distanceTransform1d(input, cols, output, parabolas, boundaries);
    for (let column = 0; column < cols; column += 1) {
      const value = output[column];
      squared[offset + column] = value >= FAR / 2 ? Infinity : Math.sqrt(value) * cell;
    }
  }
  return squared;
}

function searchWindow(grid: OccupancyGrid, targets: MapPoint[], reach: number): Window {
  const xs = targets.map((point) => point.x);
  const ys = targets.map((point) => point.y);
  const c0 = Math.max(0, Math.floor((Math.min(...xs) - reach - grid.bounds.x) / grid.cell));
  const r0 = Math.max(0, Math.floor((Math.min(...ys) - reach - grid.bounds.y) / grid.cell));
  const c1 = Math.min(grid.cols - 1, Math.ceil((Math.max(...xs) + reach - grid.bounds.x) / grid.cell));
  const r1 = Math.min(grid.rows - 1, Math.ceil((Math.max(...ys) + reach - grid.bounds.y) / grid.cell));
  return { c0, r0, cols: Math.max(1, c1 - c0 + 1), rows: Math.max(1, r1 - r0 + 1) };
}

function badgeState(
  grid: OccupancyGrid,
  request: OverlapBadgePlacementRequest,
  searchRadius: number,
  clearance: number,
  tuning: Tuning,
): BadgeState {
  const reach = searchRadius + Math.max(request.size.width, request.size.height);
  const window = searchWindow(grid, request.targets, reach);
  const cost = badgeDistanceField(grid, window, request.targets, request.size);
  const foreign = request.foreignTargets?.length
    ? badgeDistanceField(grid, window, request.foreignTargets, request.size)
    : null;
  const anchor = request.anchor ?? centralTarget(request.targets);
  for (let row = 0; row < window.rows; row += 1) {
    const dy = grid.bounds.y + (window.r0 + row + 0.5) * grid.cell - anchor.y;
    for (let column = 0; column < window.cols; column += 1) {
      const index = row * window.cols + column;
      const own = cost[index];
      if (own === Infinity) continue;
      const dx = grid.bounds.x + (window.c0 + column + 0.5) * grid.cell - anchor.x;
      let total = own + Math.sqrt(dx * dx + dy * dy) * ANCHOR_TIE_BREAK_WEIGHT;
      if (foreign) total += Math.max(0, own - foreign[index] - tuning.foreignMargin) * FOREIGN_PROXIMITY_WEIGHT;
      cost[index] = total;
    }
  }
  const halfWidth = request.size.width / 2 + clearance;
  const halfHeight = request.size.height / 2 + clearance;
  return {
    request,
    window,
    cost,
    extent: {
      left: Math.floor(0.5 - halfWidth / grid.cell),
      right: Math.ceil(0.5 + halfWidth / grid.cell) - 1,
      top: Math.floor(0.5 - halfHeight / grid.cell),
      bottom: Math.ceil(0.5 + halfHeight / grid.cell) - 1,
    },
  };
}

function costAt(state: BadgeState, column: number, row: number): number {
  const localColumn = column - state.window.c0;
  const localRow = row - state.window.r0;
  if (localColumn < 0 || localRow < 0 || localColumn >= state.window.cols || localRow >= state.window.rows) {
    return Infinity;
  }
  return state.cost[localRow * state.window.cols + localColumn];
}

function blockedAt(grid: OccupancyGrid, state: BadgeState, column: number, row: number): number {
  const { extent } = state;
  return grid.blockedCells(column + extent.left, row + extent.top, column + extent.right, row + extent.bottom);
}

function centralTarget(targets: MapPoint[]): MapPoint {
  const centerX = targets.reduce((sum, point) => sum + point.x, 0) / targets.length;
  const centerY = targets.reduce((sum, point) => sum + point.y, 0) / targets.length;
  return targets.reduce((best, point) => (
    Math.hypot(point.x - centerX, point.y - centerY) < Math.hypot(best.x - centerX, best.y - centerY) ? point : best
  ));
}

function paddedBox(position: MapPoint, size: OverlapBadgeSize, padding: number): MapBounds {
  return {
    x: position.x - size.width / 2 - padding,
    y: position.y - size.height / 2 - padding,
    width: size.width + padding * 2,
    height: size.height + padding * 2,
  };
}

function edgeGap(first: MapBounds, second: MapBounds): number {
  const horizontal = Math.max(first.x - (second.x + second.width), second.x - (first.x + first.width), 0);
  const vertical = Math.max(first.y - (second.y + second.height), second.y - (first.y + first.height), 0);
  return Math.hypot(horizontal, vertical);
}

/** Cheapest clear spot for one badge, or the least-covered spot when none is clear. */
function bestSinglePlacement(grid: OccupancyGrid, state: BadgeState): Candidate | null {
  const { window, cost } = state;
  let best: { cost: number; column: number; row: number } | null = null;
  for (let row = 0; row < window.rows; row += 1) {
    for (let column = 0; column < window.cols; column += 1) {
      const value = cost[row * window.cols + column];
      if (!(value < (best?.cost ?? Infinity))) continue;
      if (blockedAt(grid, state, window.c0 + column, window.r0 + row) !== 0) continue;
      best = { cost: value, column: window.c0 + column, row: window.r0 + row };
    }
  }
  if (best) {
    return { positions: [grid.cellCenter(best.column, best.row)], cost: best.cost, collisionAvoided: true };
  }

  let fallback: { blocked: number; cost: number; column: number; row: number } | null = null;
  for (let row = 0; row < window.rows; row += 1) {
    for (let column = 0; column < window.cols; column += 1) {
      const value = cost[row * window.cols + column];
      if (value === Infinity) continue;
      const blocked = blockedAt(grid, state, window.c0 + column, window.r0 + row);
      if (blocked < 0) continue;
      if (!fallback || blocked < fallback.blocked || (blocked === fallback.blocked && value < fallback.cost)) {
        fallback = { blocked, cost: value, column: window.c0 + column, row: window.r0 + row };
      }
    }
  }
  return fallback
    ? { positions: [grid.cellCenter(fallback.column, fallback.row)], cost: fallback.cost, collisionAvoided: false }
    : null;
}

/**
 * Cheapest clear placement of a rigid formation whose centre sweeps over
 * `area`. Offsets are relative to the formation centre.
 */
function bestFormationPlacement(
  grid: OccupancyGrid,
  members: BadgeState[],
  offsets: MapPoint[],
  area: Window,
): Candidate | null {
  const cellOffsets = offsets.map((offset) => ({
    columns: Math.round(offset.x / grid.cell),
    rows: Math.round(offset.y / grid.cell),
  }));
  let best: { cost: number; column: number; row: number } | null = null;
  for (let row = area.r0; row < area.r0 + area.rows; row += 1) {
    for (let column = area.c0; column < area.c0 + area.cols; column += 1) {
      let cost = 0;
      for (let index = 0; index < members.length && cost < (best?.cost ?? Infinity); index += 1) {
        cost += costAt(members[index], column + cellOffsets[index].columns, row + cellOffsets[index].rows);
      }
      if (!(cost < (best?.cost ?? Infinity))) continue;
      let clear = true;
      for (let index = 0; index < members.length && clear; index += 1) {
        clear = blockedAt(grid, members[index], column + cellOffsets[index].columns, row + cellOffsets[index].rows) === 0;
      }
      if (clear) best = { cost, column, row };
    }
  }
  if (!best) return null;
  // Exact offsets keep sibling gaps even; the clearance covers the sub-cell
  // difference from the rounded offsets used while searching.
  const center = grid.cellCenter(best.column, best.row);
  return {
    positions: offsets.map((offset) => ({ x: center.x + offset.x, y: center.y + offset.y })),
    cost: best.cost,
    collisionAvoided: true,
  };
}

function centered(points: MapPoint[]): MapPoint[] {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  return points.map((point) => ({ x: point.x - centerX, y: point.y - centerY }));
}

/** Rows of badges, centre-aligned per row, with an even edge gap. */
function rowsFormation(sizes: OverlapBadgeSize[], rowLengths: number[], gap: number): MapPoint[] {
  const points: MapPoint[] = [];
  let index = 0;
  let top = 0;
  for (const length of rowLengths) {
    const rowSizes = sizes.slice(index, index + length);
    const rowHeight = Math.max(...rowSizes.map((size) => size.height));
    const rowWidth = rowSizes.reduce((sum, size) => sum + size.width, 0) + gap * (rowSizes.length - 1);
    let left = -rowWidth / 2;
    for (const size of rowSizes) {
      points.push({ x: left + size.width / 2, y: top + rowHeight / 2 });
      left += size.width + gap;
    }
    top += rowHeight + gap;
    index += length;
  }
  return centered(points);
}

function columnsFormation(sizes: OverlapBadgeSize[], columnLengths: number[], gap: number): MapPoint[] {
  const swapped = sizes.map((size) => ({ width: size.height, height: size.width }));
  return rowsFormation(swapped, columnLengths, gap).map((point) => ({ x: point.y, y: point.x }));
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) => (
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest])
  ));
}

/**
 * Every aligned arrangement worth trying for a group, as offsets per member:
 * a single row or column, and for three or more badges, balanced two-row or
 * two-column stacks (a centred triangle for three) and a square-ish grid.
 */
function groupFormations(members: BadgeState[], gap: number): MapPoint[][] {
  const count = members.length;
  const indexes = members.map((_member, index) => index);
  const orders = count <= 4 ? permutations(indexes) : [indexes, [...indexes].reverse()];
  const shapes: number[][] = [[count]];
  if (count >= 3) {
    for (let firstRow = 1; firstRow < count; firstRow += 1) {
      if (Math.abs(firstRow - (count - firstRow)) <= 1) shapes.push([firstRow, count - firstRow]);
    }
  }
  if (count >= 5) {
    const columns = Math.ceil(Math.sqrt(count));
    const lengths: number[] = [];
    for (let remaining = count; remaining > 0; remaining -= columns) lengths.push(Math.min(columns, remaining));
    shapes.push(lengths);
  }

  const formations: MapPoint[][] = [];
  const seen = new Set<string>();
  for (const order of orders) {
    const sizes = order.map((index) => members[index].request.size);
    for (const shape of shapes) {
      for (const offsets of [rowsFormation(sizes, shape, gap), columnsFormation(sizes, shape, gap)]) {
        const byMember: MapPoint[] = [];
        order.forEach((memberIndex, slot) => {
          byMember[memberIndex] = offsets[slot];
        });
        const key = byMember.map((point) => `${point.x.toFixed(1)}:${point.y.toFixed(1)}`).join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        formations.push(byMember);
      }
    }
  }
  return formations;
}

function groupsByProximity(
  states: BadgeState[],
  ideal: Map<string, Candidate>,
  groupDistance: number,
): BadgeState[][] {
  const parent = states.map((_state, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const boxes = states.map((state) => paddedBox(ideal.get(state.request.id)!.positions[0], state.request.size, 0));
  for (let first = 0; first < states.length; first += 1) {
    for (let second = first + 1; second < states.length; second += 1) {
      if (edgeGap(boxes[first], boxes[second]) <= groupDistance) parent[find(second)] = find(first);
    }
  }
  const groups = new Map<number, BadgeState[]>();
  states.forEach((state, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), state]);
  });
  return [...groups.values()];
}


export function placeOverlapBadges({
  badges,
  obstacleLayers,
  mapBounds,
  siblingGap,
  unitScale = 1,
  clearance = DEFAULT_CLEARANCE * unitScale,
  cellSize = DEFAULT_CELL_SIZE * unitScale,
  searchRadius = DEFAULT_SEARCH_RADIUS * unitScale,
  groupDistance = siblingGap * 2,
  alignmentTolerance = DEFAULT_ALIGNMENT_TOLERANCE * unitScale,
}: OverlapBadgePlacementOptions): OverlapBadgePlacement[] {
  const tuning: Tuning = {
    foreignMargin: FOREIGN_PROXIMITY_MARGIN * unitScale,
    formationMargin: FORMATION_SEARCH_MARGIN * unitScale,
  };
  const requests = [...badges]
    .filter((badge) => badge.targets.length > 0)
    .sort((first, second) => first.id.localeCompare(second.id));
  if (requests.length === 0) return [];

  const grid = new OccupancyGrid(mapBounds, cellSize);
  for (const layer of obstacleLayers) grid.addLayer(layer);
  grid.rebuildTable();
  const states = requests.map((request) => badgeState(grid, request, searchRadius, clearance, tuning));

  const fallbackCandidate = (state: BadgeState): Candidate => ({
    positions: [{
      x: Math.min(mapBounds.x + mapBounds.width, Math.max(mapBounds.x, state.request.targets[0].x)),
      y: Math.min(mapBounds.y + mapBounds.height, Math.max(mapBounds.y, state.request.targets[0].y)),
    }],
    cost: Infinity,
    collisionAvoided: false,
  });
  const placeAlone = (state: BadgeState): Candidate => bestSinglePlacement(grid, state) ?? fallbackCandidate(state);
  // Keep at least a sibling gap between neighbouring groups as well.
  const reserve = (members: BadgeState[], positions: MapPoint[]) => {
    grid.add(members.map((member, index) => paddedBox(positions[index], member.request.size, siblingGap - clearance)));
  };

  // Ideal spot for each badge on its own, used to decide which badges share a
  // neighbourhood and should be aligned with each other.
  const ideal = new Map(states.map((state) => [state.request.id, placeAlone(state)]));
  const groups = groupsByProximity(states, ideal, groupDistance)
    .sort((first, second) => (
      second.length - first.length
      || first[0].request.id.localeCompare(second[0].request.id)
    ));

  const results: OverlapBadgePlacement[] = [];
  for (const group of groups) {
    if (group.length === 1) {
      const placement = placeAlone(group[0]);
      results.push({
        id: group[0].request.id,
        position: placement.positions[0],
        groupId: group[0].request.id,
        collisionAvoided: placement.collisionAvoided,
      });
      reserve(group, placement.positions);
      continue;
    }

    // A formation only needs to be searched around where its members want to be.
    const area = searchWindow(grid, group.map((member) => ideal.get(member.request.id)!.positions[0]), tuning.formationMargin);
    let formation: Candidate | null = null;
    for (const offsets of groupFormations(group, siblingGap)) {
      const candidate = bestFormationPlacement(grid, group, offsets, area);
      if (candidate && (!formation || candidate.cost < formation.cost)) formation = candidate;
    }

    // Compare with placing each badge on its own, nearest-first. Alignment
    // wins unless it pushes badges noticeably farther from their overlays.
    const ordered = [...group].sort((first, second) => (
      ideal.get(first.request.id)!.cost - ideal.get(second.request.id)!.cost
      || first.request.id.localeCompare(second.request.id)
    ));
    const beforeGroup = grid.snapshot();
    const separate = ordered.map((member) => {
      const placement = placeAlone(member);
      reserve([member], placement.positions);
      return placement;
    });
    const separateCost = separate.reduce((sum, placement) => sum + placement.cost, 0);

    if (formation && formation.cost <= separateCost + alignmentTolerance * group.length) {
      // The separate placements were reserved while comparing; swap in the formation.
      grid.restore(beforeGroup);
      const groupId = group.map((member) => member.request.id).join("+");
      group.forEach((member, index) => {
        results.push({ id: member.request.id, position: formation.positions[index], groupId, collisionAvoided: true });
      });
      reserve(group, formation.positions);
    } else {
      ordered.forEach((member, index) => {
        results.push({
          id: member.request.id,
          position: separate[index].positions[0],
          groupId: member.request.id,
          collisionAvoided: separate[index].collisionAvoided,
        });
      });
    }
  }

  return results.sort((first, second) => first.id.localeCompare(second.id));
}
