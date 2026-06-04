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
