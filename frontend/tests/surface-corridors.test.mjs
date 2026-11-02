import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStreetcarCorridors,
  isDaytimeStreetcarRoute,
  tripKind,
} from "../../scripts/lib/surface-corridors.mjs";
import { haversine } from "../../scripts/lib/geographic-geometry.mjs";

// Synthetic streets near downtown: metres to degrees at latitude 43.65.
const LAT = 43.65, LON = -79.4;
const M_LAT = 1 / 110540, M_LON = 1 / (111320 * Math.cos((LAT * Math.PI) / 180));
const at = (eastMeters, northMeters) => [LON + eastMeters * M_LON, LAT + northMeters * M_LAT];

/** A shape through `path` points ([east, north] metres), every 20 m, with distances. */
function shapeAlong(path) {
  const points = [];
  let dist = 0;
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1], [x1, y1] = path[i];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 20));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
      if (points.length) {
        const [px, py] = points[points.length - 1].m;
        dist += Math.hypot(x - px, y - py);
      }
      const [lon, lat] = at(x, y);
      points.push({ lon, lat, dist, m: [x, y] });
    }
  }
  return points;
}

/** A pattern stopping at each shape point whose east (or north) metre is a multiple of `every`. */
function pattern(routeShortName, shapeId, trips, path, stopPrefix, every = 250) {
  const shape = shapeAlong(path);
  const stops = shape
    .filter((point, i) => i === 0 || i === shape.length - 1
      || Math.round(point.m[0]) % every === 0 && Math.round(point.m[1]) % every === 0)
    .map(point => ({ stopId: `${stopPrefix}${Math.round(point.m[0])}_${Math.round(point.m[1])}`, dist: point.dist }));
  return { routeShortName, shapeId, trips, stops, shape: shape.map(({ lon, lat, dist }) => ({ lon, lat, dist })) };
}

const lengthOf = coords => coords.slice(1).reduce((sum, c, i) => sum + haversine(coords[i], c), 0);

describe("streetcar route selection", () => {
  it("keeps daytime streetcars and leaves out rapid transit, night routes and buses", () => {
    const route = (shortName, type = "0") => ({ route_short_name: shortName, route_type: type });
    assert.equal(isDaytimeStreetcarRoute(route("504")), true);
    assert.equal(isDaytimeStreetcarRoute(route("5")), false, "Line 5 is drawn as rapid transit");
    assert.equal(isDaytimeStreetcarRoute(route("6")), false, "Line 6 is drawn as rapid transit");
    assert.equal(isDaytimeStreetcarRoute(route("301")), false, "night routes run over daytime streets");
    assert.equal(isDaytimeStreetcarRoute(route("97", "3")), false);
  });

  it("tells streetcar trips from bus replacements and short turns by headsign", () => {
    assert.equal(tripKind("East - 504 King towards Broadview Station"), "streetcar");
    assert.equal(tripKind("East - 504C King Replacement Bus towards Distillery"), "replacement-bus");
    assert.equal(tripKind("West - 501 Queen Short Turn towards Roncesvalles"), "short-turn");
  });
});

describe("streetcar corridors", () => {
  const king = [[0, 0], [2000, 0]];

  it("draws routes that serve the same stops as one line carrying both", () => {
    const { corridors, stopRoutes } = buildStreetcarCorridors([
      pattern("504", "s504", 120, king, "k"),
      pattern("508", "s508", 20, king, "k"),
    ]);
    assert.equal(corridors.length, 1);
    assert.deepEqual(corridors[0].routes, ["504", "508"]);
    assert.ok(Math.abs(lengthOf(corridors[0].coordinates) - 2000) < 10);
    assert.deepEqual(stopRoutes.get("k1000_0"), ["504", "508"]);
  });

  it("folds the opposite direction on the same street into the line it runs beside", () => {
    const { corridors } = buildStreetcarCorridors([
      pattern("504", "east", 120, king, "e"),
      pattern("504", "west", 118, [[2000, 8], [0, 8]], "w"),
    ]);
    assert.equal(corridors.length, 1, "8 m apart is one street");
  });

  it("draws only the part of a direction that leaves the street", () => {
    // Westbound runs one block north between 750 m and 1250 m (a one-way pair).
    const { corridors } = buildStreetcarCorridors([
      pattern("505", "east", 200, king, "e"),
      pattern("505", "west", 200, [[2000, 8], [1250, 8], [1250, 150], [750, 150], [750, 8], [0, 8]], "w"),
    ]);
    const total = corridors.reduce((sum, c) => sum + lengthOf(c.coordinates), 0);
    assert.ok(total > 2000 + 500 && total < 2000 + 500 + 2 * 150 + 120, `drawn ${Math.round(total)} m`);
    const detour = corridors.filter(c => c.coordinates.some(([, lat]) => lat > at(0, 100)[1]));
    assert.ok(detour.length >= 1, "the one-way block is drawn");
  });

  it("does not give a street the routes of a street crossing it", () => {
    const { corridors } = buildStreetcarCorridors([
      pattern("504", "king", 120, king, "k"),
      // Stops at -750, -250, 250 and 750 m: the crossing falls between two stops.
      pattern("511", "bathurst", 100, [[1000, -1130], [1000, 870]], "b"),
    ]);
    const routeSets = corridors.map(c => c.routes.join(","));
    assert.ok(!routeSets.includes("504,511"), `route sets: ${routeSets.join(" | ")}`);
    assert.ok(routeSets.includes("504") && routeSets.includes("511"));
  });

  it("leaves out stop gaps with too few weekday trips", () => {
    const { corridors, stopRoutes } = buildStreetcarCorridors([
      pattern("504", "king", 120, king, "k"),
      pattern("504", "yard", 2, [[2000, 0], [2000, 600]], "y"),
    ], { minPairTrips: 6 });
    assert.equal(corridors.length, 1);
    assert.equal(stopRoutes.has("y2000_600"), false);
  });
});
