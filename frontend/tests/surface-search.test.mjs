import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  intersectionKey,
  intersectionLabel,
  prepareSurfaceSearchIndex,
  routeNumberFromQuery,
  searchSurfaceRoutes,
  searchSurfaceStops,
  stopNameTokens,
} from "../src/app/surface-search.ts";
import { capSearchGroup, orderSearchGroups } from "../src/app/unified-search.ts";

const GEO = new URL("../public/assets/linewatch/geographic/", import.meta.url);
const load = (name) => prepareSurfaceSearchIndex(JSON.parse(readFileSync(new URL(name, GEO), "utf8")));
const ttc = load("search-index-ttc.json");
const go = load("search-index-go.json");
const both = [ttc, go];
const codes = (group) => group.stops.map((stop) => stop.code);

describe("surface stop names (plan 14, U2)", () => {
  it("normalizes street words both ways and drops joiners", () => {
    assert.deepEqual(stopNameTokens("Queen Street West & Dufferin"), ["queen", "st", "w", "dufferin"]);
    assert.deepEqual(stopNameTokens("Yonge St. @ Sheppard Ave. E."), ["yonge", "st", "sheppard", "ave", "e"]);
    assert.deepEqual(stopNameTokens("St Clair Avenue at Bathurst"), ["st", "clair", "ave", "bathurst"]);
  });

  it("keys an intersection by its streets in either order, without direction or side", () => {
    assert.equal(intersectionKey("Dufferin St at Steeles Ave West South Side"), intersectionKey("Steeles Ave West at Dufferin St"));
    assert.notEqual(intersectionKey("Dufferin St at Steeles Ave West"), intersectionKey("Dufferin St at Finch Ave West"));
    assert.equal(intersectionLabel("Dufferin St at Steeles Ave West South Side"), "Dufferin St at Steeles Ave West");
  });
});

describe("surface stop search (plan 14, U2)", () => {
  it("puts an exact stop number first, then numbers that start with it from 3 digits", () => {
    const exact = searchSurfaceStops(both, "7658", "ttc");
    assert.equal(exact.exactNumber, true);
    assert.deepEqual(codes(exact.groups[0]), ["7658"]);
    assert.match(exact.groups[0].label, /Dufferin St at Steeles Ave West/);

    const prefix = searchSurfaceStops(both, "765", "ttc", 50);
    assert.equal(prefix.groups[0].match, "exact-number");
    assert.equal(prefix.groups[0].stops[0].code, "765");
    assert.ok(prefix.groups.slice(1).every((group) => group.match === "number-prefix" && group.stops[0].code.startsWith("765")));
    assert.equal(searchSurfaceStops(both, "76", "ttc").groups.length, 0, "no prefix below 3 digits");
    assert.deepEqual(codes(searchSurfaceStops(both, "stop 7658", "ttc").groups[0]), ["7658"]);
  });

  it("finds a GO stop from the TTC tab, by its number with or without leading zeros", () => {
    for (const query of ["00005", "5"]) {
      const result = searchSurfaceStops(both, query, "ttc");
      const goGroup = result.groups.find((group) => group.network === "regional");
      assert.ok(goGroup, `${query} finds the GO stop`);
      assert.deepEqual(codes(goGroup), ["00005"]);
    }
  });

  it("matches an intersection with the streets in either order and groups its corners", () => {
    for (const query of ["dufferin steeles", "steeles dufferin", "steeles & dufferin", "Dufferin Street and Steeles Avenue"]) {
      const [top] = searchSurfaceStops(both, query, "ttc").groups;
      assert.ok(top, query);
      assert.equal(top.network, "ttc");
      assert.match(top.label, /Dufferin St|Steeles Ave West/, query);
      assert.ok(codes(top).includes("7658") && codes(top).includes("8268"), `${query}: both streets' poles in one row`);
      assert.ok(top.routes.includes("60") && top.routes.includes("105"), "routes of every corner");
    }
  });

  it("keeps same-named intersections far apart as separate rows", () => {
    const result = searchSurfaceStops(both, "dundas", "ttc", 200);
    for (const group of result.groups) {
      const [first] = group.stops;
      for (const stop of group.stops) {
        const metres = Math.hypot((stop.lon - first.lon) * 80_000, (stop.lat - first.lat) * 111_000);
        assert.ok(metres < 600, `${group.label} spans ${Math.round(metres)} m`);
      }
    }
  });

  it("ranks the current network first and still lists the other", () => {
    const fromTtc = searchSurfaceStops(both, "union station", "ttc", 20).groups;
    const fromGo = searchSurfaceStops(both, "union station", "regional", 20).groups;
    assert.equal(fromTtc[0].network, "ttc");
    assert.ok(fromTtc.some((group) => group.network === "regional"));
    assert.equal(fromGo[0].network, "regional");
    assert.equal(fromGo[0].label, "Union Station Bus Terminal");
  });

  it("caps the groups it builds and counts the rest for Show All", () => {
    const capped = searchSurfaceStops(both, "dufferin", "ttc", 5);
    const all = searchSurfaceStops(both, "dufferin", "ttc", 1000);
    assert.equal(capped.groups.length, 5);
    assert.deepEqual(capped.groups.map((group) => group.key), all.groups.slice(0, 5).map((group) => group.key));
    assert.ok(capped.total >= all.groups.length - 2 && capped.total <= all.groups.length, "count is the place count");
  });

  it("does not answer one letter or a lone street word with stops", () => {
    for (const query of ["d", "st", "ave", "west", "St.", ""]) {
      assert.equal(searchSurfaceStops(both, query, "ttc").groups.length, 0, query);
    }
    assert.ok(searchSurfaceStops(both, "st clair", "ttc").groups.length > 0);
  });
});

describe("surface route search (plan 14, U2)", () => {
  it("reads route numbers as riders type them", () => {
    assert.deepEqual(routeNumberFromQuery("504"), { number: "504", go: false });
    assert.deepEqual(routeNumberFromQuery("52A"), { number: "52", go: false });
    assert.deepEqual(routeNumberFromQuery("GO 40"), { number: "40", go: true });
    assert.deepEqual(routeNumberFromQuery("route 29"), { number: "29", go: false });
    assert.equal(routeNumberFromQuery("dufferin"), null);
  });

  it("matches an exact number, GO only when named", () => {
    const king = searchSurfaceRoutes(both, "504", "ttc");
    assert.equal(king[0].route.name, "King");
    assert.equal(king[0].match, "exact-number");
    const go40 = searchSurfaceRoutes(both, "GO 40", "ttc");
    assert.deepEqual(go40.map((r) => [r.route.network, r.route.route]), [["regional", "40"]]);
    const both52 = searchSurfaceRoutes(both, "52", "regional");
    assert.equal(both52[0].route.network, "regional", "current network first");
    assert.ok(both52.some((r) => r.route.network === "ttc"));
  });

  it("matches names by word, day routes before night and express namesakes", () => {
    const dufferin = searchSurfaceRoutes(both, "dufferin", "ttc").map((r) => r.route.route);
    assert.equal(dufferin[0], "29");
    assert.ok(dufferin.indexOf("329") > dufferin.indexOf("29"));
    assert.ok(dufferin.indexOf("929") > dufferin.indexOf("29"));
    assert.equal(searchSurfaceRoutes(both, "king", "ttc")[0].route.route, "504");
    assert.ok(searchSurfaceRoutes(both, "go richmond hill", "ttc").some((r) => r.route.network === "regional" && r.route.route === "40"));
  });

  it("carries each route's kind, drawn flag and schedule period", () => {
    const queen = ttc.routes.find((route) => route.route === "501");
    assert.equal(queen.kind, "streetcar");
    assert.equal(queen.drawn, true);
    assert.equal(queen.period.servicePattern, "weekday");
    assert.match(queen.period.feedStartDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(ttc.routes.find((route) => route.route === "503").drawn, false, "503 is all buses this period");
    assert.equal(ttc.routes.find((route) => route.route === "939").kind, "express");
    assert.equal(go.routes.find((route) => route.route === "40").kind, "go-bus");
  });
});

describe("search group ranking (plan 14, U2)", () => {
  it("orders groups: route number, stop number, station, route name, stop name, line, notice", () => {
    const groups = [
      { id: "notices", tier: "notice" },
      { id: "lines", tier: "line" },
      { id: "stops", tier: "stop-name" },
      { id: "routes", tier: "route-name" },
      { id: "stations", tier: "station" },
    ];
    assert.deepEqual(orderSearchGroups(groups).map((g) => g.id), ["stations", "routes", "stops", "lines", "notices"]);
    assert.deepEqual(
      orderSearchGroups([{ id: "routes", tier: "route-number" }, { id: "stations", tier: "station" }, { id: "stops", tier: "stop-number" }]).map((g) => g.id),
      ["routes", "stops", "stations"],
      "an exact route number leads: 504 is the King car before stop 504",
    );
  });

  it("shows five rows and how many Show All adds", () => {
    assert.deepEqual(capSearchGroup([1, 2, 3, 4, 5, 6, 7], false), { visible: [1, 2, 3, 4, 5], hiddenCount: 2 });
    assert.deepEqual(capSearchGroup([1, 2, 3, 4, 5, 6, 7], true), { visible: [1, 2, 3, 4, 5, 6, 7], hiddenCount: 0 });
  });
});

describe("search index loading (plan 14, U3)", () => {
  const file = JSON.parse(readFileSync(new URL("search-index-ttc.json", GEO), "utf8"));

  it("builds the same index in slices, giving the page turns", async () => {
    const { prepareSurfaceSearchIndexInSlices } = await import("../src/app/surface-search.ts");
    let turns = 0;
    const sliced = await prepareSurfaceSearchIndexInSlices(file, { budgetMs: 0, yieldToPage: async () => { turns++; } });
    assert.ok(turns >= Math.floor(file.stops.name.length / 500), `yielded ${turns} times`);
    assert.deepEqual(sliced.vocabulary, ttc.vocabulary);
    assert.deepEqual(
      searchSurfaceStops([sliced], "dufferin steeles", "ttc").groups.map((group) => group.key),
      searchSurfaceStops([ttc], "dufferin steeles", "ttc").groups.map((group) => group.key),
    );
  });

  it("accepts only the index file for its own network", async () => {
    const { isSurfaceSearchIndexFile, SURFACE_SEARCH_INDEX_URLS } = await import("../src/app/surface-search-index.ts");
    assert.equal(isSurfaceSearchIndexFile(file, "ttc"), true);
    assert.equal(isSurfaceSearchIndexFile(file, "regional"), false);
    assert.equal(isSurfaceSearchIndexFile({ ...file, schemaVersion: "2.0.0" }, "ttc"), false);
    assert.equal(isSurfaceSearchIndexFile(null, "ttc"), false);
    assert.match(SURFACE_SEARCH_INDEX_URLS.regional, /search-index-go\.json$/);
  });
});
