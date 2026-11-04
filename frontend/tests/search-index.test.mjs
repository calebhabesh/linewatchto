import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildRouteStopSequences, visitsInOrder } from "../../scripts/lib/route-stop-sequences.mjs";
import {
  buildGoSearchIndex,
  buildTtcSearchIndex,
  decodeSearchIndexStops,
  stationResolver,
} from "../../scripts/lib/search-index.mjs";

const GEO = new URL("../public/assets/linewatch/geographic/", import.meta.url);
const asset = name => JSON.parse(readFileSync(new URL(name, GEO), "utf8"));

const source = { feedVersion: "S1", feedStartDate: "2026-11-01", feedEndDate: "2026-12-19", servicePattern: "weekday" };
const route = (number, extra = {}) => ({ route: number, name: `Route ${number}`, color: "#ed1c24", textColor: "#FFFFFF", drawn: true, ...extra });
const stop = (stopCode, name, routes, coordinates = [-79.4, 43.65], featureType = "bus-stop") => ({
  type: "Feature",
  geometry: { type: "Point", coordinates },
  properties: { featureType, stopCode, name, routes },
});
const pattern = (stops, extra = {}) => ({ route: "29", direction: 0, headsign: "South - 29 Dufferin", trips: 50, stops, ...extra });

describe("route stop sequences (plan 14, U1)", () => {
  it("folds short turns and stop-skipping variants into the pattern that visits their stops in order", () => {
    const routes = buildRouteStopSequences([
      pattern(["1", "2", "3", "4", "5"], { trips: 40 }),
      pattern(["2", "3", "4"], { trips: 20, headsign: "South - 29 short turn" }),
      pattern(["1", "3", "5"], { trips: 10 }),
    ]);
    assert.deepEqual(routes["29"], [{ direction: 0, headsign: "South - 29 Dufferin", trips: 70, stops: ["1", "2", "3", "4", "5"] }]);
  });

  it("keeps branches apart, by direction, and names each by its most common headsign", () => {
    const routes = buildRouteStopSequences([
      pattern(["1", "2", "3", "7"], { trips: 30, headsign: "South - 29A towards Dufferin Gate" }),
      pattern(["1", "2", "3", "7"], { trips: 5, headsign: "South - 29A towards Exhibition" }),
      pattern(["1", "2", "3", "8"], { trips: 30, headsign: "South - 29C towards Princes' Gates" }),
      pattern(["8", "3", "2", "1"], { direction: 1, trips: 60, headsign: "North - 29 towards Wilson" }),
    ]);
    assert.deepEqual(routes["29"].map(p => [p.direction, p.headsign, p.trips]), [
      [0, "South - 29A towards Dufferin Gate", 35],
      [0, "South - 29C towards Princes' Gates", 30],
      [1, "North - 29 towards Wilson", 60],
    ]);
  });

  it("drops a minor fragment the route's main patterns already list, and keeps one that adds stops", () => {
    const routes = buildRouteStopSequences([
      pattern(["1", "2", "3", "4"], { trips: 100 }),
      pattern(["9", "4"], { trips: 80 }), // under 3 stops, but stop 9 is listed nowhere else: kept
      pattern(["4", "3", "2", "1"], { direction: 1, trips: 100 }),
      pattern(["4", "1"], { direction: 1, trips: 70 }), // folds (visited in order)
      pattern(["3", "2", "5", "6", "7"], { direction: 1, trips: 3 }), // rare but mostly new stops: kept
    ]);
    const kept = routes["29"].map(p => p.stops.join(" "));
    assert.ok(kept.includes("9 4"), "a fragment with stops no other pattern lists stays");
    assert.ok(kept.includes("3 2 5 6 7"));
    assert.equal(kept.length, 4);

    const covered = buildRouteStopSequences([
      pattern(["1", "2", "3", "4"], { trips: 100 }),
      pattern(["4", "3", "2", "1"], { direction: 1, trips: 100 }),
      pattern(["3", "1"], { trips: 80 }), // listed elsewhere, out of order in its direction
      pattern(["2", "1", "9", "3", "4"], { trips: 2 }),
    ]);
    assert.deepEqual(covered["29"].map(p => p.stops.join(" ")), ["1 2 3 4", "4 3 2 1"]);
  });

  it("checks order, not just membership", () => {
    assert.equal(visitsInOrder(["1", "2", "3"], ["1", "3"]), true);
    assert.equal(visitsInOrder(["1", "2", "3"], ["3", "1"]), false);
  });
});

describe("search index builder (plan 14, U1)", () => {
  const streetcar = {
    source,
    routes: [route("501", { name: "Queen" }), route("503", { drawn: false })],
    features: [
      { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: { featureType: "streetcar-corridor", routes: ["501"] } },
      stop("10935", "Union Station Streetcar Platform", ["509", "510"], [-79.3806, 43.6453], "streetcar-stop"),
      stop("200", "Queen St West at Dufferin St", ["501"], [-79.4301234, 43.6431234], "streetcar-stop"),
    ],
  };
  const bus = { source, routes: [route("29", { name: "Dufferin" }), route("939", { name: "Finch Express" })], features: [] };
  const busStops = { source, features: [stop("200", "Queen St West at Dufferin St", ["29"], [-79.43012, 43.64312]), stop("14799", "Wilson Station at Bus Bay 1A", ["29"])] };
  const night = { source: { ...source, servicePattern: "weekday-night" }, routes: [route("301", { kind: "streetcar" }), route("329", { kind: "bus" })], features: [] };
  const nightStops = { features: [stop("99999", "Bloor St West at Night Only", ["300"], [-79.4, 43.66], "night-stop")] };
  const nightRouteStops = { routes: { 329: [{ direction: 0, headsign: "South", trips: 5, stops: ["200", "99999"] }] } };
  const stationBays = { stations: { wilson: [{ bay: "1A", stopCode: "14799" }] } };
  const stationCatalog = { features: [{ properties: { featureType: "station", stationId: "union", name: "Union" } }] };
  const index = buildTtcSearchIndex({ streetcar, bus, busStops, night, nightStops, nightRouteStops, stationBays, stationCatalog });

  it("lists every route with its kind, drawn flag and schedule period", () => {
    const rows = index.routes.route.map((number, i) => [number, index.routes.kind[i], index.routes.drawn[i], index.sources[index.routes.source[i]].servicePattern]);
    assert.deepEqual(rows, [
      ["29", "bus", 1, "weekday"],
      ["301", "night-streetcar", 1, "weekday-night"],
      ["329", "night-bus", 1, "weekday-night"],
      ["501", "streetcar", 1, "weekday"],
      ["503", "streetcar", 0, "weekday"],
      ["939", "express", 1, "weekday"],
    ]);
    assert.deepEqual(index.colors, ["#ED1C24", "#FFFFFF"], "colours are a shared palette");
  });

  it("merges a pole in both catalogs, adds night routes, resolves stations, and round-trips positions to 1e-5", () => {
    const stops = decodeSearchIndexStops(index);
    assert.deepEqual(stops.map(s => s.code), ["200", "10935", "14799", "99999"], "numeric stop order, night-only poles included");
    const queen = stops[0];
    assert.deepEqual(queen.routes, ["29", "329", "501"], "night route at a daytime pole");
    assert.deepEqual(stops[3].routes, ["300", "329"], "night-only pole");
    assert.equal(queen.lon, -79.43012);
    assert.equal(queen.lat, 43.64312);
    assert.equal(stops[1].station, "union", "named platform inside a station");
    assert.equal(stops[2].station, "wilson", "bus bay from the station plans");
    assert.equal(queen.station, "");
    assert.ok(index.stops.codeDelta, "TTC numbers are delta-coded");
  });

  it("keeps GO stop numbers as strings, leading zeros included", () => {
    const go = buildGoSearchIndex({
      goBus: { source, routes: [route("40", { color: "#98002e" })] },
      goBusStops: { features: [stop("00005", "Yonge St. @ Baif Blvd.", ["61"], [-79.43, 43.84], "go-bus-stop")] },
    });
    assert.deepEqual(go.stops.code, ["00005"]);
    assert.equal(go.stations, undefined);
    assert.equal(decodeSearchIndexStops(go)[0].code, "00005");
    assert.deepEqual(go.routes.kind, ["go-bus"]);
  });

  it("does not guess a station from a name that only contains one", () => {
    const stationOf = stationResolver({ stations: {} }, { features: [{ properties: { featureType: "station", stationId: "bay", name: "Bay" } }] });
    assert.equal(stationOf("1", "Bay Station"), "bay");
    assert.equal(stationOf("2", "Bay St at Station Rd"), "");
  });
});

describe("shipped search index matches the Map View catalogs (plan 14, U1)", () => {
  const networks = [
    {
      index: "search-index-ttc.json",
      routeCatalogs: ["ttc-surface-streetcar.json", "ttc-surface-bus.json", "ttc-surface-night.json"],
      stopFeatures: () => [
        ...asset("ttc-surface-streetcar.json").features.filter(f => f.properties.featureType === "streetcar-stop"),
        ...asset("ttc-surface-bus-stops.json").features,
        ...asset("ttc-surface-night-stops.json").features,
      ],
      sequences: ["ttc-surface-streetcar-route-stops.json", "ttc-surface-bus-route-stops.json", "ttc-surface-night-route-stops.json"],
    },
    {
      index: "search-index-go.json",
      routeCatalogs: ["go-surface-bus.json"],
      stopFeatures: () => asset("go-surface-bus-stops.json").features,
      sequences: ["go-surface-bus-route-stops.json"],
    },
  ];

  for (const network of networks) {
    it(`${network.index} has every catalog route, stop and route-panel stop`, () => {
      const index = asset(network.index);
      const indexed = new Map(decodeSearchIndexStops(index).map(s => [s.code, s]));
      const routes = new Set(index.routes.route);
      for (const name of network.routeCatalogs) {
        const catalog = asset(name);
        assert.ok(index.sources.some(s => s.feedVersion === catalog.source.feedVersion), `${name} feed is the index's`);
        for (const summary of catalog.routes) assert.ok(routes.has(summary.route), `${name} route ${summary.route} is indexed`);
      }
      for (const feature of network.stopFeatures()) {
        const entry = indexed.get(feature.properties.stopCode);
        assert.ok(entry, `stop ${feature.properties.stopCode} is indexed`);
        assert.equal(entry.name, feature.properties.name);
        for (const r of feature.properties.routes) assert.ok(entry.routes.includes(r), `stop ${entry.code} lists route ${r}`);
        const [lon, lat] = feature.geometry.coordinates;
        assert.ok(Math.abs(entry.lon - lon) < 1e-5 && Math.abs(entry.lat - lat) < 1e-5, `stop ${entry.code} position`);
      }
      for (const name of network.sequences) {
        for (const [number, sequences] of Object.entries(asset(name).routes)) {
          assert.ok(routes.has(number), `${name} route ${number} is indexed`);
          for (const sequence of sequences) {
            for (const code of sequence.stops) assert.ok(indexed.has(code), `${name} ${number} stop ${code} is indexed`);
          }
        }
      }
    });
  }
});
