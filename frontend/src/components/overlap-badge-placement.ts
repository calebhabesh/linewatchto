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
 *    proximity than placing the badges one by one. Placed one by one, the
 *    badges compete for the same spots, so several orders are tried and the
 *    cheapest kept, instead of always letting the nearest badge go first.
 * 5. Badges from different groups that still end up side by side get the same
 *    formation check, so neighbours are always aligned when it is cheap.
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
  /**
   * The connector line a badge would get at a spot, given the badges already
   * placed. A spot whose needed line is blocked is passed over for the next
   * clear spot, and each placed line is reserved so later badges keep off it.
   */
  connector?: (request: OverlapBadgeConnectorCheck) => { needed: boolean; line: [MapPoint, MapPoint] | null };
};

export type OverlapBadgeConnectorCheck = {
  id: string;
  position: MapPoint;
  /** Badges placed so far, which the line must go around. */
  placed: { id: string; position: MapPoint; size: OverlapBadgeSize }[];
};

/** How many clear spots to try, cheapest first, looking for one with a clear connector. */
const MAX_CONNECTOR_SPOTS = 240;
/** Largest group for which every badge gets a turn to be placed first. */
const MAX_ORDERED_GROUP = 6;

const DEFAULT_CLEARANCE = 10;

/**
 * How far a badge stays from each kind of map feature, measured from the
 * feature's visible edge, in TTC map units. Both maps derive their obstacle
 * sizes from these (scaled by their unit scale), so badges keep the same
 * spacing relative to their own size on every map.
 */
export const BADGE_FEATURE_GAPS = {
  /**
   * From the outer edge of an alert overlay's hover outline. Leaves room for
   * the connector: its 18-unit end dot plus a short visible line, so a badge
   * at its closest still reads as connected. At rest, with no hover outline,
   * the visible gap to the rail is about 10 units wider.
   */
  alertOverlay: 28,
  /** From the edge of an unalerted transit line. */
  transitLine: 48,
  /** From a label's glyph box. Tight enough for a badge to fit a nook between labels. */
  label: 22,
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
/**
 * Line obstacles with the stretches that alert overlays cover taken out. An
 * alerted stretch is spaced by its overlay's tighter gap, so badges can tuck
 * in beside it; the wider transit-line gap applies only where no alert covers
 * the line. Points within `tolerance` of an overlay count as covered. Other
 * obstacles pass through unchanged.
 */
export function withoutAlertedStretches(
  obstacles: readonly PlacementObstacle[],
  overlays: readonly MapPoint[][],
  tolerance: number,
): PlacementObstacle[] {
  const segments = overlays.flatMap((polyline) => (
    polyline.length === 1
      ? [[polyline[0], polyline[0]] as const]
      : polyline.slice(1).map((end, index) => [polyline[index], end] as const)
  )).map(([start, end]) => ({
    start,
    end,
    x0: Math.min(start.x, end.x) - tolerance,
    x1: Math.max(start.x, end.x) + tolerance,
    y0: Math.min(start.y, end.y) - tolerance,
    y1: Math.max(start.y, end.y) + tolerance,
  }));
  if (segments.length === 0) return [...obstacles];
  const covered = (point: MapPoint) => segments.some((segment) => (
    point.x >= segment.x0 && point.x <= segment.x1 && point.y >= segment.y0 && point.y <= segment.y1
    && segmentDistance(point.x, point.y, segment.start, segment.end) <= tolerance
  ));
  const step = Math.max(1, tolerance);
  return obstacles.flatMap((obstacle): PlacementObstacle[] => {
    if (!("polyline" in obstacle)) return [obstacle];
    const runs: MapPoint[][] = [];
    let run: MapPoint[] = [];
    let cut = false;
    const visit = (point: MapPoint) => {
      if (covered(point)) {
        cut = true;
        if (run.length > 0) runs.push(run);
        run = [];
      } else {
        run.push(point);
      }
    };
    obstacle.polyline.forEach((point, index) => {
      if (index > 0) {
        // Sample between vertices so a long straight stroke can be cut mid-way.
        const previous = obstacle.polyline[index - 1];
        const count = Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / step);
        for (let sample = 1; sample < count; sample += 1) {
          visit({
            x: previous.x + ((point.x - previous.x) * sample) / count,
            y: previous.y + ((point.y - previous.y) * sample) / count,
          });
        }
      }
      visit(point);
    });
    if (!cut) return [obstacle];
    if (run.length > 0) runs.push(run);
    return runs.map((polyline) => ({ polyline, radius: obstacle.radius }));
  });
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
  /**
   * Cell offsets from a badge's centre cell to the cells whose centres lie in
   * its padded box. Obstacles mark every cell they touch, so the padded box
   * can reach at most half a cell into an obstacle's cell, and a badge always
   * keeps at least half its clearance. Rounding the box outward as well would
   * waste up to a cell on each side and hide nooks the badge fits in.
   */
  extent: CellExtent;
  /**
   * The padded box rounded outward, for formations: their members sit at
   * exact sibling offsets off the cell centres, which uses the other half of
   * the clearance.
   */
  formationExtent: CellExtent;
};

type CellExtent = { left: number; right: number; top: number; bottom: number };

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
      left: -Math.floor(halfWidth / grid.cell),
      right: Math.floor(halfWidth / grid.cell),
      top: -Math.floor(halfHeight / grid.cell),
      bottom: Math.floor(halfHeight / grid.cell),
    },
    formationExtent: {
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

function blockedAt(grid: OccupancyGrid, state: BadgeState, column: number, row: number, inFormation = false): number {
  const extent = inFormation ? state.formationExtent : state.extent;
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

/**
 * The cheapest clear spot, after the cheapest, whose connector line is clear.
 * Stops at spots costing `budget` or more, returning an infinite-cost
 * candidate, since the caller has a cheaper option already.
 */
function nextSpotWithClearConnector(
  grid: OccupancyGrid,
  state: BadgeState,
  acceptsConnector: (position: MapPoint) => boolean,
  budget = Infinity,
): Candidate | null {
  const { window, cost } = state;
  const clear: { cost: number; column: number; row: number }[] = [];
  for (let row = 0; row < window.rows; row += 1) {
    for (let column = 0; column < window.cols; column += 1) {
      const value = cost[row * window.cols + column];
      if (value === Infinity) continue;
      if (blockedAt(grid, state, window.c0 + column, window.r0 + row) !== 0) continue;
      clear.push({ cost: value, column: window.c0 + column, row: window.r0 + row });
    }
  }
  clear.sort((first, second) => first.cost - second.cost);
  // Neighbouring cells give nearly the same line, so try spots a few cells apart.
  const spacing = Math.max(1, Math.round(Math.min(state.request.size.width, state.request.size.height) / 4 / grid.cell));
  const tried: { column: number; row: number }[] = [];
  for (const spot of clear) {
    if (tried.length >= MAX_CONNECTOR_SPOTS) break;
    if (spot.cost >= budget) return { positions: [grid.cellCenter(spot.column, spot.row)], cost: Infinity, collisionAvoided: true };
    if (tried.some((other) => Math.abs(other.column - spot.column) < spacing && Math.abs(other.row - spot.row) < spacing)) continue;
    tried.push(spot);
    const position = grid.cellCenter(spot.column, spot.row);
    if (acceptsConnector(position)) return { positions: [position], cost: spot.cost, collisionAvoided: true };
  }
  return null;
}

/**
 * Cheapest clear spot for one badge whose connector line is clear too, else
 * the cheapest clear spot, else the least-covered spot when none is clear.
 */
function bestSinglePlacement(
  grid: OccupancyGrid,
  state: BadgeState,
  acceptsConnector?: (position: MapPoint) => boolean,
  budget = Infinity,
): Candidate | null {
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
  if (best && acceptsConnector && !acceptsConnector(grid.cellCenter(best.column, best.row))) {
    const alternative = nextSpotWithClearConnector(grid, state, acceptsConnector, budget);
    if (alternative) return alternative;
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
        clear = blockedAt(grid, members[index], column + cellOffsets[index].columns, row + cellOffsets[index].rows, true) === 0;
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

/**
 * Orders to try when a group's badges are placed one by one. Nearest-first
 * alone lets a badge with other good spots take the only good spot of a
 * harder one, so the hardest first and each badge first are tried too.
 */
function separateOrders(nearestFirst: BadgeState[]): BadgeState[][] {
  if (nearestFirst.length < 2) return [nearestFirst];
  const orders = [nearestFirst, [...nearestFirst].reverse()];
  if (nearestFirst.length <= MAX_ORDERED_GROUP) {
    nearestFirst.forEach((member, index) => {
      if (index > 0) orders.push([member, ...nearestFirst.filter((other) => other !== member)]);
    });
  }
  const seen = new Set<string>();
  return orders.filter((order) => {
    const key = order.map((member) => member.request.id).join("\n");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupsByProximity(
  states: BadgeState[],
  positions: Map<string, MapPoint>,
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
  const boxes = states.map((state) => paddedBox(positions.get(state.request.id)!, state.request.size, 0));
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
  connector,
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
  const results: OverlapBadgePlacement[] = [];
  const sizeById = new Map(requests.map((request) => [request.id, request.size]));
  const placedBadges = () => results.map((result) => ({
    id: result.id,
    position: result.position,
    size: sizeById.get(result.id)!,
  }));
  const connectorAt = (id: string, position: MapPoint, extra: OverlapBadgeConnectorCheck["placed"] = []) => (
    connector
      ? connector({ id, position, placed: [...placedBadges(), ...extra].filter((other) => other.id !== id) })
      : { needed: false, line: null }
  );
  const hasClearConnector = (id: string, position: MapPoint, extra?: OverlapBadgeConnectorCheck["placed"]) => {
    const check = connectorAt(id, position, extra);
    return !check.needed || check.line !== null;
  };
  const placeAlone = (state: BadgeState, withConnector = false, budget = Infinity): Candidate => (
    bestSinglePlacement(
      grid,
      state,
      withConnector && connector ? (position) => hasClearConnector(state.request.id, position) : undefined,
      budget,
    ) ?? fallbackCandidate(state)
  );
  // Keep at least a sibling gap between neighbouring groups as well, and keep
  // later badges off each placed badge's connector line.
  const reserve = (members: BadgeState[], positions: MapPoint[]) => {
    const lines = connector
      ? members.flatMap((member, index) => {
        const line = connectorAt(member.request.id, positions[index]).line;
        return line ? [{ polyline: line, radius: clearance }] : [];
      })
      : [];
    grid.add([
      ...members.map((member, index) => paddedBox(positions[index], member.request.size, siblingGap - clearance)),
      ...lines,
    ]);
  };

  const emptyGrid = grid.snapshot();
  const stateById = new Map(states.map((state) => [state.request.id, state]));
  // The cheapest clear formation of a group around `near` in which every
  // member keeps a clear connector line.
  const bestFormation = (group: BadgeState[], near: MapPoint[]): Candidate | null => {
    const area = searchWindow(grid, near, tuning.formationMargin);
    const candidates = groupFormations(group, siblingGap)
      .map((offsets) => bestFormationPlacement(grid, group, offsets, area))
      .filter((candidate): candidate is Candidate => candidate !== null)
      .sort((first, second) => first.cost - second.cost);
    return candidates.find((candidate) => !connector || group.every((member, index) => (
      hasClearConnector(
        member.request.id,
        candidate.positions[index],
        group
          .map((other, otherIndex) => ({ id: other.request.id, position: candidate.positions[otherIndex], size: other.request.size }))
          .filter((other) => other.id !== member.request.id),
      )
    ))) ?? null;
  };
  const pushFormation = (group: BadgeState[], formation: Candidate) => {
    const groupId = group.map((member) => member.request.id).join("+");
    group.forEach((member, index) => {
      results.push({ id: member.request.id, position: formation.positions[index], groupId, collisionAvoided: true });
    });
    reserve(group, formation.positions);
  };

  // Ideal spot for each badge on its own, used to decide which badges share a
  // neighbourhood and should be aligned with each other.
  const ideal = new Map(states.map((state) => [state.request.id, placeAlone(state)]));
  const groups = groupsByProximity(
    states,
    new Map([...ideal].map(([id, candidate]) => [id, candidate.positions[0]])),
    groupDistance,
  ).sort((first, second) => (
    second.length - first.length
    || first[0].request.id.localeCompare(second[0].request.id)
  ));

  for (const group of groups) {
    if (group.length === 1) {
      const placement = placeAlone(group[0], true);
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
    const formation = bestFormation(group, group.map((member) => ideal.get(member.request.id)!.positions[0]));

    // Compare with placing each badge on its own. Badges that want the same
    // spot compete for it, so try a few orders and keep the cheapest.
    const nearestFirst = [...group].sort((first, second) => (
      ideal.get(first.request.id)!.cost - ideal.get(second.request.id)!.cost
      || first.request.id.localeCompare(second.request.id)
    ));
    const beforeGroup = grid.snapshot();
    const resultsBeforeGroup = results.length;
    // Gives up as soon as the order costs more than `limit`; costs only add up.
    const placeInOrder = (order: BadgeState[], limit = Infinity) => {
      let cost = 0;
      for (const member of order) {
        const placement = placeAlone(member, true, limit - cost);
        cost += placement.cost;
        if (cost >= limit) break;
        reserve([member], placement.positions);
        // Later members route their lines around this one.
        results.push({ id: member.request.id, position: placement.positions[0], groupId: member.request.id, collisionAvoided: placement.collisionAvoided });
      }
      const attempt = cost < limit
        ? { results: results.splice(resultsBeforeGroup), grid: grid.snapshot(), cost }
        : null;
      results.length = resultsBeforeGroup;
      grid.restore(beforeGroup);
      return attempt;
    };
    let separate = placeInOrder(nearestFirst)!;
    for (const order of separateOrders(nearestFirst).slice(1)) {
      separate = placeInOrder(order, separate.cost) ?? separate;
    }

    // Alignment wins unless it pushes badges noticeably farther from their overlays.
    if (formation && formation.cost <= separate.cost + alignmentTolerance * group.length) {
      pushFormation(group, formation);
    } else {
      results.push(...separate.results);
      grid.restore(separate.grid);
    }
  }

  // Badges placed apart can still land side by side, such as two badges both
  // pushed out of a crowded area into the same open space. Align those too.
  const finalPositions = new Map(results.map((result) => [result.id, result.position]));
  const groupIdOf = new Map(results.map((result) => [result.id, result.groupId]));
  const neighbours = groupsByProximity(states, finalPositions, groupDistance)
    .filter((group) => new Set(group.map((member) => groupIdOf.get(member.request.id))).size > 1)
    .sort((first, second) => (
      second.length - first.length
      || first[0].request.id.localeCompare(second[0].request.id)
    ));
  for (const group of neighbours) {
    const ids = new Set(group.map((member) => member.request.id));
    const kept = results.filter((result) => !ids.has(result.id));
    const current = results.filter((result) => ids.has(result.id));
    const currentCost = group.reduce((sum, member) => {
      const position = current.find((result) => result.id === member.request.id)!.position;
      return sum + costAt(
        member,
        Math.floor((position.x - grid.bounds.x) / grid.cell),
        Math.floor((position.y - grid.bounds.y) / grid.cell),
      );
    }, 0);
    // Free the group's space, keeping every other badge and its line reserved.
    results.length = 0;
    grid.restore(emptyGrid);
    for (const result of kept) {
      reserve([stateById.get(result.id)!], [result.position]);
      results.push(result);
    }
    const formation = bestFormation(group, group.map((member) => finalPositions.get(member.request.id)!));
    if (formation && formation.cost <= currentCost + alignmentTolerance * group.length) {
      pushFormation(group, formation);
    } else {
      results.push(...current);
      reserve(
        current.map((result) => stateById.get(result.id)!),
        current.map((result) => result.position),
      );
    }
  }

  return results.sort((first, second) => first.id.localeCompare(second.id));
}
