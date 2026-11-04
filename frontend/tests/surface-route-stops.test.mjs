import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  isRouteStopsFile,
  ROUTE_STOPS_URLS,
  routeDirections,
  surfaceNoticesForRoute,
} from "../src/app/surface-route-stops.ts";
import { surfaceRouteLayer, surfaceRouteSelection } from "../src/app/surface-map-selection.ts";
import { prepareSurfaceSearchIndex } from "../src/app/surface-search.ts";

const asset = (url) => JSON.parse(readFileSync(new URL(`../public${url}`, import.meta.url), "utf8"));
const files = Object.fromEntries(Object.entries(ROUTE_STOPS_URLS).map(([layer, url]) => [layer, asset(url)]));
const indexes = {
  ttc: prepareSurfaceSearchIndex(asset("/assets/linewatch/geographic/search-index-ttc.json")),
  regional: prepareSurfaceSearchIndex(asset("/assets/linewatch/geographic/search-index-go.json")),
};

describe("routeDirections", () => {
  it("orders directions by id and branches busiest first, with compass labels", () => {
    const directions = routeDirections([
      { direction: 1, headsign: "North - 29 Dufferin towards Wilson Station", trips: 70, stops: ["1", "2", "3"] },
      { direction: 0, headsign: "South - 29C Dufferin towards Exhibition (Princes' Gates)", trips: 20, stops: ["3", "2", "9"] },
      { direction: 0, headsign: "South - 29A Dufferin towards Exhibition (Dufferin Gate)", trips: 60, stops: ["3", "2", "1"] },
    ]);
    assert.deepEqual(directions.map((direction) => direction.label), ["Southbound", "Northbound"]);
    assert.deepEqual(directions[0].branches.map((branch) => branch.label), [
      "29A towards Exhibition (Dufferin Gate)",
      "29C towards Exhibition (Princes' Gates)",
    ]);
    // Stops keep the file's visit order.
    assert.deepEqual(directions[0].branches[0].stops, ["3", "2", "1"]);
    assert.deepEqual(directions[1].branches.map((branch) => branch.label), ["29 towards Wilson Station"]);
  });

  it("reads upper-case compass words and spaced headsigns (80B)", () => {
    const [direction] = routeDirections([{ direction: 0, headsign: "EAST - 80B Queensway  towards Mimico GO", trips: 5, stops: ["1", "2"] }]);
    assert.equal(direction.label, "Eastbound");
    assert.equal(direction.branches[0].label, "80B towards Mimico GO");
  });

  it("names a GO direction by where its busiest branch goes", () => {
    const directions = routeDirections([
      { direction: 0, headsign: "41A - Pickering GO", trips: 27, stops: ["1", "2", "3"] },
      { direction: 0, headsign: "41 - Pickering GO", trips: 38, stops: ["1", "2", "3", "4"] },
      { direction: 1, headsign: "41 - Hamilton GO", trips: 65, stops: ["4", "3"] },
    ]);
    assert.deepEqual(directions.map((direction) => direction.label), ["To Pickering GO", "To Hamilton GO"]);
    assert.deepEqual(directions[0].branches.map((branch) => branch.label), ["41 to Pickering GO", "41A to Pickering GO"]);
  });

  it("tells repeated headsigns apart by first stop, then a stop only one visits", () => {
    const names = { 3: "Dufferin St at Bloor St West", 10: "Dufferin Gate Loop", 20: "Princes' Gates Loop" };
    const directions = routeDirections([
      { direction: 1, headsign: "North - 29 Dufferin towards Wilson Station", trips: 74, stops: ["20", "2", "3"] },
      { direction: 1, headsign: "North - 29 Dufferin towards Wilson Station", trips: 72, stops: ["10", "2"] },
      { direction: 1, headsign: "North - 29 Dufferin towards Wilson Station", trips: 4, stops: ["10", "2", "3"] },
    ], (code) => names[code] ?? null);
    assert.deepEqual(directions[0].branches.map((branch) => branch.label), [
      "29 towards Wilson Station, from Princes' Gates Loop",
      "29 towards Wilson Station, from Dufferin Gate Loop",
      "29 towards Wilson Station, from Dufferin Gate Loop, via Dufferin St at Bloor St West",
    ]);
    // Same start and length, one stop apart (the 329 night route).
    const night = routeDirections([
      { direction: 0, headsign: "South - 329 Dufferin towards Exhibition", trips: 2, stops: ["1", "2", "4"] },
      { direction: 0, headsign: "South - 329 Dufferin towards Exhibition", trips: 1, stops: ["1", "3", "4"] },
    ]);
    assert.deepEqual(night[0].branches.map((branch) => branch.label), [
      "329 towards Exhibition, via stop 2",
      "329 towards Exhibition, via stop 3",
    ]);
  });

  it("returns nothing for a route without a stop list", () => {
    assert.deepEqual(routeDirections(undefined), []);
    assert.deepEqual(routeDirections([]), []);
  });

  it("gives every drawn route in the shipped indexes a stop list with unique branch labels", () => {
    for (const [network, index] of Object.entries(indexes)) {
      const stopName = (code) => {
        const at = index.stopByCode.get(code);
        return at === undefined ? null : index.stops[at].name;
      };
      for (const route of index.routes) {
        const directions = routeDirections(files[surfaceRouteLayer(route.kind)].routes[route.route], stopName);
        if (!route.drawn) {
          assert.equal(directions.length, 0, `${network} ${route.route} is undrawn`);
          continue;
        }
        assert.ok(directions.length >= 1, `${network} ${route.route} has stops`);
        for (const direction of directions) {
          const labels = direction.branches.map((branch) => branch.label);
          assert.equal(new Set(labels).size, labels.length, `${network} ${route.route} ${direction.label}: ${labels}`);
          for (const branch of direction.branches) {
            for (const code of branch.stops) assert.ok(stopName(code), `${network} ${route.route} stop ${code} is named`);
          }
        }
      }
    }
  });

  it("lists the 504 King both ways and the 503 not at all", () => {
    const king = routeDirections(files.streetcar.routes["504"]);
    assert.deepEqual(king.map((direction) => direction.label), ["Eastbound", "Westbound"]);
    assert.equal(files.streetcar.routes["503"], undefined);
    assert.equal(surfaceRouteSelection({ kind: "streetcar", route: "503", drawn: false }), null);
  });
});

describe("route-stop files", () => {
  it("validates each shipped file for its own layer only", () => {
    for (const [layer, file] of Object.entries(files)) {
      assert.ok(isRouteStopsFile(file, layer), layer);
      for (const other of Object.keys(files)) {
        if (other !== layer) assert.equal(isRouteStopsFile(file, other), false, `${layer} as ${other}`);
      }
    }
  });

  it("maps every route kind to its layer's file", () => {
    assert.equal(surfaceRouteLayer("streetcar"), "streetcar");
    assert.equal(surfaceRouteLayer("bus"), "bus");
    assert.equal(surfaceRouteLayer("express"), "bus");
    assert.equal(surfaceRouteLayer("night-bus"), "night");
    assert.equal(surfaceRouteLayer("night-streetcar"), "night");
    assert.equal(surfaceRouteLayer("go-bus"), "go-bus");
  });
});

describe("surfaceNoticesForRoute", () => {
  const now = Date.parse("2026-11-04T15:00:00Z");
  const notice = (id, fields) => ({
    id,
    category: "detour",
    routeType: "Bus",
    routeIds: [],
    title: id,
    description: "",
    stopIds: [],
    updatedAt: "2026-11-01T00:00:00Z",
    source: "TTC",
    ...fields,
  });

  it("matches branch ids to their route number and never a longer number", () => {
    const notices = [
      notice("29C", { routeIds: ["29C"] }),
      notice("129", { routeIds: ["129"] }),
      notice("329", { routeIds: ["329"] }),
      notice("929", { routeIds: ["929"] }),
      notice("shared", { routeIds: ["20", "29", "300"], updatedAt: "2026-11-03T00:00:00Z" }),
    ];
    assert.deepEqual(surfaceNoticesForRoute(notices, { network: "ttc", route: "29" }, now).map((n) => n.id), ["shared", "29C"]);
    assert.deepEqual(surfaceNoticesForRoute(notices, { network: "ttc", route: "329" }, now).map((n) => n.id), ["329"]);
    assert.deepEqual(surfaceNoticesForRoute(notices, { network: "ttc", route: "300" }, now).map((n) => n.id), ["shared"]);
  });

  it("keeps only notices in effect now, and no timetable announcements", () => {
    const notices = [
      notice("now", { routeIds: ["38"], startAt: "2026-11-01T00:00:00Z", endAt: "2026-12-01T00:00:00Z" }),
      notice("later", { routeIds: ["38"], startAt: "2026-11-09T11:00:00Z" }),
      notice("over", { routeIds: ["38"], endAt: "2026-11-04T14:59:00Z" }),
      notice("announcement", { routeIds: ["38"], scheduleAnnouncement: true }),
      notice("open-ended", { routeIds: ["38"] }),
    ];
    assert.deepEqual(surfaceNoticesForRoute(notices, { network: "ttc", route: "38" }, now).map((n) => n.id).sort(), ["now", "open-ended"]);
  });

  it("counts only GO bus notices for a GO route, and none for a TTC route", () => {
    const notices = [
      notice("go-bus", { routeType: "GO Bus", routeIds: ["31", "33", "37"], source: "Metrolinx" }),
      notice("go-train", { routeType: "GO / UP", routeIds: ["31"], source: "Metrolinx" }),
    ];
    assert.deepEqual(surfaceNoticesForRoute(notices, { network: "regional", route: "31" }, now).map((n) => n.id), ["go-bus"]);
    assert.deepEqual(surfaceNoticesForRoute(notices, { network: "ttc", route: "31" }, now), []);
  });
});
