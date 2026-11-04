/**
 * Route stop sequences for the route panel (plan 14, U1 and U5).
 *
 * The catalogs keep corridors and stops but not the order a route visits its
 * stops, so the surface generators, which read GTFS trips, write it here:
 * per route, each distinct stop pattern by direction, with its weekday trip
 * count and most common headsign. A pattern whose stops are one unbroken run
 * visited in order by a longer pattern in the same direction (a short turn,
 * or a variant that skips stops) folds into it: the panel lists stops, and
 * each stop's departures say which trips call there.
 *
 * A minor pattern (under a tenth of its direction's busiest pattern's trips,
 * or fewer than three stops, such as an airport loop the feed splits into
 * its own trip) is left out when the route's other patterns already list
 * at least 80% of its stops.
 */

/**
 * @param {{ route: string, direction: number, headsign: string, trips: number, stops: string[] }[]} patterns
 *   One entry per trip pattern; `stops` are rider stop numbers in visit order.
 * @returns {Record<string, { direction: number, headsign: string, trips: number, stops: string[] }[]>}
 *   Per route, longest first within each direction; directions ascending.
 */
export function buildRouteStopSequences(patterns) {
  /** route|direction|stops -> merged pattern with headsign counts */
  const merged = new Map();
  for (const pattern of patterns) {
    const stops = dropRepeats(pattern.stops);
    if (stops.length < 2) continue;
    const key = `${pattern.route}|${pattern.direction}|${stops.join(" ")}`;
    let entry = merged.get(key);
    if (!entry) {
      entry = { route: pattern.route, direction: pattern.direction, stops, trips: 0, headsigns: new Map() };
      merged.set(key, entry);
    }
    entry.trips += pattern.trips;
    entry.headsigns.set(pattern.headsign, (entry.headsigns.get(pattern.headsign) ?? 0) + pattern.trips);
  }

  const byRouteDirection = new Map();
  for (const entry of merged.values()) {
    const key = `${entry.route}|${entry.direction}`;
    if (!byRouteDirection.has(key)) byRouteDirection.set(key, []);
    byRouteDirection.get(key).push(entry);
  }

  const kept = new Map();
  const routeOrder = (a, b) => a.localeCompare(b, "en", { numeric: true });
  for (const key of [...byRouteDirection.keys()].sort((a, b) => {
    const [ra, da] = a.split("|"), [rb, db] = b.split("|");
    return routeOrder(ra, rb) || Number(da) - Number(db);
  })) {
    // Longest first, so a short turn always meets the pattern that covers it.
    const entries = byRouteDirection.get(key).sort((a, b) =>
      b.stops.length - a.stops.length || b.trips - a.trips || a.stops.join(" ").localeCompare(b.stops.join(" ")));
    const direction = [];
    for (const entry of entries) {
      const parent = direction.find(candidate => visitsInOrder(candidate.stops, entry.stops));
      if (parent) parent.trips += entry.trips;
      else direction.push(entry);
    }
    const route = entries[0].route;
    if (!kept.has(route)) kept.set(route, []);
    kept.get(route).push(direction);
  }

  const out = {};
  for (const [route, directions] of kept) {
    const minor = new Set();
    for (const direction of directions) {
      const top = Math.max(...direction.map(entry => entry.trips));
      for (const entry of direction) {
        if (entry.trips * 10 < top || entry.stops.length < 3) minor.add(entry);
      }
    }
    const all = directions.flat();
    out[route] = [];
    for (const entry of all) {
      if (minor.has(entry)) {
        const listed = new Set(all.filter(other => other !== entry && !minor.has(other)).flatMap(other => other.stops));
        if (entry.stops.filter(stop => listed.has(stop)).length >= 0.8 * entry.stops.length) continue;
      }
      out[route].push({
        direction: entry.direction,
        headsign: mostCommon(entry.headsigns),
        trips: entry.trips,
        stops: entry.stops,
      });
    }
  }
  return out;
}

/** True when `stops` visits every stop of `subset` in the same order. */
export function visitsInOrder(stops, subset) {
  if (subset.length > stops.length) return false;
  let at = 0;
  for (const stop of stops) {
    if (stop === subset[at] && ++at === subset.length) return true;
  }
  return false;
}

/** A loop's first stop can repeat as its last; a stop listed twice in a row is one visit. */
function dropRepeats(stops) {
  return stops.filter((stop, i) => stop && stop !== stops[i - 1]);
}

function mostCommon(counts) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}
