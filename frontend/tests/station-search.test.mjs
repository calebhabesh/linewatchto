import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildStationLineGroups,
  normalizeStationQuery,
  searchStations,
} from "../src/app/station-search.ts";
import { fallbackStationSummaries } from "../src/app/station-data.ts";

describe("station search helpers", () => {
  const stations = fallbackStationSummaries.stations;

  it("normalizes TTC station names and user input consistently", () => {
    assert.equal(normalizeStationQuery(" St. George  "), "saint george");
    assert.equal(normalizeStationQuery("Bloor-Yonge"), "bloor yonge");
    assert.equal(normalizeStationQuery("VMC"), "vmc");
  });

  it("groups stations by authored line order", () => {
    const groups = buildStationLineGroups(stations);
    const line1 = groups.find((group) => group.line.id === "line-1");
    const line2 = groups.find((group) => group.line.id === "line-2");

    assert.ok(line1);
    assert.ok(line2);
    assert.equal(line1.stations[0].id, "vaughan-metropolitan-centre");
    assert.equal(line2.stations[0].id, "kipling");
    assert.ok(line1.stations.some((station) => station.id === "spadina"));
    assert.ok(line2.stations.some((station) => station.id === "spadina"));
  });

  it("keeps each line browse group in logical end-to-end visual order", () => {
    const stationsByLineId = Object.fromEntries(
      buildStationLineGroups(stations).map((group) => [
        group.line.id,
        group.stations.map((station) => station.id),
      ])
    );

    assert.deepEqual(stationsByLineId["line-1"], [
      "vaughan-metropolitan-centre", "highway-407", "pioneer-village",
      "york-university", "finch-west", "downsview-park", "sheppard-west",
      "wilson", "yorkdale", "lawrence-west", "glencairn", "cedarvale",
      "st-clair-west", "dupont", "spadina", "st-george", "museum",
      "queens-park", "st-patrick", "osgoode", "st-andrew", "union", "king",
      "queen", "tmu", "college", "wellesley", "bloor-yonge", "rosedale",
      "summerhill", "st-clair", "davisville", "eglinton", "lawrence",
      "york-mills", "sheppard-yonge", "north-york-centre", "finch",
    ]);
    assert.deepEqual(stationsByLineId["line-2"], [
      "kipling", "islington", "royal-york", "old-mill", "jane", "runnymede",
      "high-park", "keele", "dundas-west", "lansdowne", "dufferin",
      "ossington", "christie", "bathurst", "spadina", "st-george", "bay",
      "bloor-yonge", "sherbourne", "castle-frank", "broadview", "chester",
      "pape", "donlands", "greenwoood", "coxwell", "woodbine", "main-street",
      "victoria-park", "warden", "kennedy",
    ]);
    assert.deepEqual(stationsByLineId["line-4"], [
      "sheppard-yonge", "bayview", "bessarion", "leslie", "don-mills",
    ]);
    assert.deepEqual(stationsByLineId["line-5"], [
      "mount-dennis", "keelesdale", "caledonia", "fairbank", "oakwood",
      "cedarvale", "forest-hill", "chaplin", "avenue", "eglinton",
      "mount-pleasant", "leaside", "laird", "sunnybrook-park", "don-valley",
      "aga-khan-park-and-museum", "wynford", "sloane", "o_connor", "pharmacy",
      "hakimi-lebovic", "golden-mile", "birchmount", "ionview", "kennedy",
    ]);
    assert.deepEqual(stationsByLineId["line-6"], [
      "humber-college", "westmore", "martin-grove", "albion", "stevenson",
      "mount-olive", "rowntree-mills", "pearldale", "duncanwoods",
      "milvan-rumike", "emery", "signet-arrow", "norfinch-oakdale",
      "jane-and-finch", "driftwood", "tobermory", "sentinel", "finch-west",
    ]);
  });

  it("appends backend-only stations to the matching line group alphabetically", () => {
    const groups = buildStationLineGroups([
      ...stations,
      {
        id: "backend-only-a",
        name: "Backend Alpha",
        mapX: 10,
        mapY: 10,
        interchange: false,
        lineIds: ["line-1"],
        hasActiveImpact: false,
        accessStatus: "normal",
      },
      {
        id: "backend-only-z",
        name: "Backend Zeta",
        mapX: 20,
        mapY: 20,
        interchange: false,
        lineIds: ["line-1"],
        hasActiveImpact: false,
        accessStatus: "normal",
      },
    ]);

    const line1 = groups.find((group) => group.line.id === "line-1");
    assert.ok(line1);
    assert.deepEqual(
      line1.stations.slice(-2).map((station) => station.id),
      ["backend-only-a", "backend-only-z"]
    );
  });

  it("builds regional corridor groups without leaking TTC lines", () => {
    const groups = buildStationLineGroups([
      {
        id: "union",
        name: "Union",
        mapX: 0,
        mapY: 0,
        interchange: true,
        lineIds: ["regional-ki", "regional-up"],
        hasActiveImpact: false,
        accessStatus: "normal",
      },
      {
        id: "pearson-airport",
        name: "Pearson Airport",
        mapX: 0,
        mapY: 0,
        interchange: false,
        lineIds: ["regional-up"],
        hasActiveImpact: false,
        accessStatus: "normal",
      },
    ]);

    assert.deepEqual(groups.map((group) => group.line.number), ["KI", "UP"]);
    assert.deepEqual(
      groups.find((group) => group.line.id === "regional-up")?.stations.map((station) => station.id),
      ["pearson-airport", "union"],
    );
  });

  it("ranks exact, acronym, token-prefix, and subsequence fuzzy matches", () => {
    assert.equal(searchStations(stations, "Union")[0].station.id, "union");
    assert.equal(searchStations(stations, "vmc")[0].station.id, "vaughan-metropolitan-centre");
    assert.equal(searchStations(stations, "blo yo")[0].station.id, "bloor-yonge");
    assert.equal(searchStations(stations, "egltn")[0].station.id, "eglinton");
  });

  it("returns no results for an empty query", () => {
    assert.deepEqual(searchStations(stations, ""), []);
    assert.deepEqual(searchStations(stations, "   "), []);
  });
});
