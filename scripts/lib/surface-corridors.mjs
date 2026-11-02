/**
 * Streetcar corridors from GTFS trip patterns: one line per street, each piece
 * carrying the routes that run on it (plan 13, S1). Pure calculations; the
 * generator (scripts/generate-surface-catalog.mjs) does the file reading.
 *
 * A pattern is one route's stop sequence on one shape, with its weekday trip
 * count. Pieces are cut between consecutive stops, so routes that serve the
 * same stops share a piece exactly. The opposite direction, a few metres away
 * on the same street, folds into the pieces already drawn (adding its routes);
 * where it leaves them (loops, one-way streets) only the part that leaves is
 * drawn.
 */

import { douglasPeucker, haversine, validateCoordinate } from "./geographic-geometry.mjs";

/** Lines already drawn by the rapid-transit catalog (GTFS route_type 0 there too). */
const RAPID_TRANSIT_SHORT_NAMES = new Set(["5", "6"]);

/**
 * Daytime streetcar routes: GTFS route_type 0, minus Lines 5 and 6 (drawn as
 * rapid transit) and the 300-series night routes, which run over the daytime
 * streets.
 * @param {{ route_type: string, route_short_name: string }} route
 */
export function isDaytimeStreetcarRoute(route) {
  const shortName = route.route_short_name.trim();
  return route.route_type.trim() === "0"
    && !RAPID_TRANSIT_SHORT_NAMES.has(shortName)
    && !/^3\d\d$/.test(shortName);
}

/** The TTC codes bus replacements and short turns as trips of the streetcar route. */
export function tripKind(headsign) {
  if (/replacement bus/i.test(headsign)) return "replacement-bus";
  if (/short turn/i.test(headsign)) return "short-turn";
  return "streetcar";
}

function planar(lat) {
  return { kx: 111320 * Math.cos((lat * Math.PI) / 180), ky: 110540 };
}

/** Distance in metres from `p` to segment a–b, with the projection parameter. */
function pointToSegment(p, a, b) {
  const { kx, ky } = planar(a[1]);
  const ax = a[0] * kx, ay = a[1] * ky;
  const dx = b[0] * kx - ax, dy = b[1] * ky - ay;
  const px = p[0] * kx - ax, py = p[1] * ky - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared)) : 0;
  return Math.hypot(px - t * dx, py - t * dy);
}

/** Point at `distance` along a shape whose points carry shape_dist_traveled. */
export function pointAtDistance(shape, distance) {
  if (distance <= shape[0].dist) return [shape[0].lon, shape[0].lat];
  for (let i = 1; i < shape.length; i++) {
    const a = shape[i - 1], b = shape[i];
    if (distance <= b.dist) {
      const span = b.dist - a.dist;
      const t = span > 0 ? (distance - a.dist) / span : 0;
      return [a.lon + (b.lon - a.lon) * t, a.lat + (b.lat - a.lat) * t];
    }
  }
  const last = shape[shape.length - 1];
  return [last.lon, last.lat];
}

/** The shape between two distances, endpoints interpolated. */
export function sliceByDistance(shape, from, to) {
  const coords = [pointAtDistance(shape, from)];
  for (const point of shape) {
    if (point.dist > from && point.dist < to) coords.push([point.lon, point.lat]);
  }
  coords.push(pointAtDistance(shape, to));
  return coords;
}

/** Points along a polyline no more than `step` metres apart, vertices included. */
function densify(coords, step) {
  const out = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    const n = Math.max(1, Math.ceil(haversine(a, b) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

const MAX_HEADING_DIFFERENCE = 35;

/** Planar bearing of a→b in degrees, 0–180 (a line's two directions are the same heading). */
function bearing(a, b) {
  const { kx, ky } = planar(a[1]);
  const degrees = (Math.atan2((b[1] - a[1]) * ky, (b[0] - a[0]) * kx) * 180) / Math.PI;
  return ((degrees % 180) + 180) % 180;
}

function headingDifference(h1, h2) {
  const d = Math.abs(h1 - h2) % 180;
  return Math.min(d, 180 - d);
}

/** Grid of kept segments for nearest-piece lookups within a tolerance. */
class SegmentGrid {
  constructor(cellDegrees) {
    this.cell = cellDegrees;
    this.cells = new Map();
  }
  key(x, y) {
    return `${x},${y}`;
  }
  add(pieceIndex, coords) {
    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1], b = coords[i];
      const x0 = Math.floor(Math.min(a[0], b[0]) / this.cell), x1 = Math.floor(Math.max(a[0], b[0]) / this.cell);
      const y0 = Math.floor(Math.min(a[1], b[1]) / this.cell), y1 = Math.floor(Math.max(a[1], b[1]) / this.cell);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const k = this.key(x, y);
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push([pieceIndex, a, b]);
        }
      }
    }
  }
  /**
   * Nearest piece within `tolerance` metres running the same way as
   * `heading` (either direction, within MAX_HEADING_DIFFERENCE), or -1. A
   * street crossing at an angle never counts as the same street.
   */
  nearest(p, tolerance, heading) {
    const cx = Math.floor(p[0] / this.cell), cy = Math.floor(p[1] / this.cell);
    let best = -1, bestDistance = tolerance;
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (const [piece, a, b] of this.cells.get(this.key(x, y)) ?? []) {
          if (headingDifference(heading, bearing(a, b)) > MAX_HEADING_DIFFERENCE) continue;
          const d = pointToSegment(p, a, b);
          if (d <= bestDistance) {
            bestDistance = d;
            best = piece;
          }
        }
      }
    }
    return best;
  }
}

function lengthMeters(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i - 1], coords[i]);
  return total;
}

const sortedRoutes = routes => [...routes].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

/**
 * Joins pieces end to end where exactly two meet and they carry the same
 * routes, so a street reads as one feature, not one per stop gap.
 */
function chainPieces(pieces) {
  const nodeKey = c => `${c[0].toFixed(7)},${c[1].toFixed(7)}`;
  const routeKey = piece => sortedRoutes(piece.routes).join("|");
  const alive = pieces.map(piece => ({ coords: piece.coords.slice(), routes: new Set(piece.routes) }));
  let merged = true;
  while (merged) {
    merged = false;
    const incident = new Map();
    alive.forEach((piece, index) => {
      if (!piece) return;
      for (const end of [0, 1]) {
        const k = nodeKey(end ? piece.coords[piece.coords.length - 1] : piece.coords[0]);
        if (!incident.has(k)) incident.set(k, []);
        incident.get(k).push([index, end]);
      }
    });
    for (const ends of incident.values()) {
      if (ends.length !== 2) continue;
      const [[i, endI], [j, endJ]] = ends;
      if (i === j || !alive[i] || !alive[j] || routeKey(alive[i]) !== routeKey(alive[j])) continue;
      const a = endI === 1 ? alive[i].coords : alive[i].coords.slice().reverse();
      const b = endJ === 0 ? alive[j].coords : alive[j].coords.slice().reverse();
      alive[i] = { coords: a.concat(b.slice(1)), routes: alive[i].routes };
      alive[j] = null;
      merged = true;
      break;
    }
  }
  return alive.filter(Boolean);
}

/**
 * @typedef {{ lon: number, lat: number, dist: number }} ShapePoint
 * @typedef {{
 *   routeShortName: string,
 *   shapeId: string,
 *   trips: number,
 *   stops: { stopId: string, dist: number }[],
 *   shape: ShapePoint[],
 * }} TripPattern
 */

/**
 * @param {TripPattern[]} patterns
 * @param {object} [options]
 * @param {number} [options.minPairTrips=6] Weekday trips a stop gap needs to be drawn
 * @param {number} [options.mergeToleranceMeters=25] How far apart two runs on one street may be
 * @param {number} [options.simplifyMeters=2] Douglas-Peucker tolerance
 * @param {number} [options.minRunMeters=30] Shortest separate run worth drawing
 * @returns {{
 *   corridors: { routes: string[], coordinates: [number, number][] }[],
 *   stopRoutes: Map<string, string[]>,
 * }}
 */
export function buildStreetcarCorridors(patterns, options = {}) {
  const minPairTrips = options.minPairTrips ?? 6;
  const tolerance = options.mergeToleranceMeters ?? 25;
  const simplifyMeters = options.simplifyMeters ?? 2;
  const minRunMeters = options.minRunMeters ?? 30;
  const step = Math.max(2, tolerance / 2.5);

  const ordered = patterns.slice().sort((a, b) =>
    b.trips - a.trips
    || a.routeShortName.localeCompare(b.routeShortName, "en", { numeric: true })
    || a.shapeId.localeCompare(b.shapeId));

  // Each stop cuts every line through it at one point: where the busiest pattern cuts it.
  const stopPoints = new Map();
  /** @type {Map<string, { from: string, to: string, trips: number, routes: Set<string>, coords: [number, number][] }>} */
  const pairs = new Map();
  for (const pattern of ordered) {
    for (const stop of pattern.stops) {
      if (!stopPoints.has(stop.stopId)) stopPoints.set(stop.stopId, pointAtDistance(pattern.shape, stop.dist));
    }
    for (let i = 1; i < pattern.stops.length; i++) {
      const a = pattern.stops[i - 1], b = pattern.stops[i];
      if (!(b.dist > a.dist) || a.stopId === b.stopId) continue;
      const key = `${a.stopId}>${b.stopId}`;
      let pair = pairs.get(key);
      if (!pair) {
        const coords = sliceByDistance(pattern.shape, a.dist, b.dist);
        coords[0] = stopPoints.get(a.stopId);
        coords[coords.length - 1] = stopPoints.get(b.stopId);
        pair = { from: a.stopId, to: b.stopId, trips: 0, routes: new Set(), coords };
        pairs.set(key, pair);
      }
      pair.trips += pattern.trips;
      pair.routes.add(pattern.routeShortName);
    }
  }

  // Busiest pattern first, each in stop order: a street is drawn from one
  // continuous run, so its pieces meet end to end. (Sorting gaps by trips
  // would interleave the two directions' stops and leave every piece apart.)
  const drawn = [...pairs.values()].filter(pair => pair.trips >= minPairTrips);

  const stopRoutes = new Map();
  for (const pair of drawn) {
    for (const stopId of [pair.from, pair.to]) {
      if (!stopRoutes.has(stopId)) stopRoutes.set(stopId, new Set());
      for (const route of pair.routes) stopRoutes.get(stopId).add(route);
    }
  }

  /** @type {{ coords: [number, number][], routes: Set<string> }[]} */
  const pieces = [];
  const grid = new SegmentGrid(0.0005);
  const keep = (coords, routes) => {
    pieces.push({ coords, routes: new Set(routes) });
    grid.add(pieces.length - 1, coords);
  };

  for (const pair of drawn) {
    const points = densify(pair.coords, step);
    // Near its own stops a gap touches the gaps before and after it and any
    // street crossing there; only coverage between them counts.
    const first = points[0], last = points[points.length - 1];
    const interior = points.map(p => haversine(p, first) >= tolerance && haversine(p, last) >= tolerance);
    if (!interior.includes(true)) interior[Math.floor(points.length / 2)] = true;
    const headingAt = i => bearing(points[Math.max(0, i - 1)], points[Math.min(points.length - 1, i + 1)]);
    const near = points.map((p, i) => (interior[i] ? grid.nearest(p, tolerance, headingAt(i)) : null));
    // End points take the status of the closest interior point.
    const firstInterior = interior.indexOf(true), lastInterior = interior.lastIndexOf(true);
    for (let i = 0; i < firstInterior; i++) near[i] = near[firstInterior];
    for (let i = points.length - 1; i > lastInterior; i--) near[i] = near[lastInterior];
    for (let i = firstInterior + 1; i < lastInterior; i++) if (near[i] === null) near[i] = near[i - 1];
    const covered = near.filter(index => index >= 0);
    if (covered.length === 0) {
      keep(pair.coords, pair.routes);
      continue;
    }
    // The covered part rides on pieces already drawn: those pieces gain its routes.
    const counts = new Map();
    for (const index of covered) counts.set(index, (counts.get(index) ?? 0) + 1);
    for (const [index, count] of counts) {
      if (count >= Math.max(2, covered.length * 0.4)) {
        for (const route of pair.routes) pieces[index].routes.add(route);
      }
    }
    // Draw only the runs that leave them, reaching one point back in to join.
    let start = -1;
    for (let i = 0; i <= points.length; i++) {
      const free = i < points.length && near[i] < 0;
      if (free && start < 0) start = i;
      if (!free && start >= 0) {
        const run = points.slice(Math.max(0, start - 1), Math.min(points.length, i + 1));
        if (run.length >= 2 && lengthMeters(run) >= minRunMeters) keep(run, pair.routes);
        start = -1;
      }
    }
  }

  const corridors = chainPieces(pieces).map(piece => {
    const coordinates = douglasPeucker(piece.coords, simplifyMeters).map(([lon, lat]) => {
      const rounded = [Number(lon.toFixed(5)), Number(lat.toFixed(5))];
      validateCoordinate(rounded);
      return rounded;
    });
    return { routes: sortedRoutes(piece.routes), coordinates };
  }).filter(corridor => corridor.coordinates.length >= 2);

  corridors.sort((a, b) =>
    a.routes.join(",").localeCompare(b.routes.join(","), "en", { numeric: true })
    || a.coordinates[0][0] - b.coordinates[0][0]
    || a.coordinates[0][1] - b.coordinates[0][1]);

  return {
    corridors,
    stopRoutes: new Map([...stopRoutes].map(([stopId, routes]) => [stopId, sortedRoutes(routes)])),
  };
}
