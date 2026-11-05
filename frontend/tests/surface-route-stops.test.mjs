import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  isRouteStopsFile,
  ROUTE_STOPS_URLS,
  busiestVariantFor,
  expressCounterpart,
  routeBranchCodes,
  routeDirections,
  routeVariants,
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

describe("routeVariants", () => {
  // Along Lawrence, west to east: a stop every 1 km, with the eastbound pole across the street.
  const westEnd = (at) => ({ lat: 43.7, lon: -79.6 + at * 0.0125 });
  const points = Object.fromEntries([
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((at) => [`e${at}`, westEnd(at)]),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((at) => [`w${at}`, { ...westEnd(at), lat: 43.7002 }]),
  ]);
  const stopPoint = (code) => points[code] ?? null;
  const east = (from) => [0, 1, 2, 3, 4, 5, 6, 7].filter((at) => at >= from).map((at) => `e${at}`);
  const west = (from) => east(from).map((code) => code.replace("e", "w")).reverse();
  const fiftyTwo = [
    { direction: 0, headsign: "East - 52 Lawrence West towards Lawrence Station", trips: 53, stops: east(0) },
    { direction: 0, headsign: "East - 52 Lawrence West towards Lawrence Station", trips: 75, stops: east(4) },
    { direction: 0, headsign: "East - 52F Lawrence West towards Sunnybrook Hospital via Lawrence Station", trips: 67, stops: east(2) },
    { direction: 1, headsign: "West - 52A Lawrence West towards Pearson Airport via Dixon Rd", trips: 77, stops: west(0) },
    { direction: 1, headsign: "West - 52B Lawrence West towards Westwood", trips: 70, stops: west(4) },
    { direction: 1, headsign: "West - 52F Lawrence West towards Royal York", trips: 64, stops: west(2) },
  ];
  const variants = () => routeVariants(fiftyTwo, "52", () => null, stopPoint);

  it("pairs plain return trips with the lettered branch they run back along, so each way has one list", () => {
    assert.deepEqual(variants().map((variant) => variant.code), ["52A", "52B", "52F"]);
    for (const variant of variants()) {
      assert.deepEqual(variant.directions.map((direction) => direction.branches.length), [1, 1], variant.code);
    }
    const [a, b] = variants();
    assert.deepEqual(a.directions[0].branches[0].stops, east(0));
    assert.deepEqual(b.directions[0].branches[0].stops, east(4));
  });

  it("names a branch by where it goes each way, with its via", () => {
    const [a, , f] = variants();
    assert.equal(a.name, "Lawrence Station ↔ Pearson Airport via Dixon Rd");
    assert.equal(f.name, "Sunnybrook Hospital via Lawrence Station ↔ Royal York");
  });

  it("the stop list still carries the sign as published", () => {
    const [a] = variants();
    assert.match(a.directions[0].branches[0].label, /^52 towards Lawrence Station/);
    assert.equal(a.directions[0].label, "Eastbound");
    assert.equal(a.directions[1].label, "Westbound");
  });

  it("does not pair lists on different streets: each stays a one-way branch", () => {
    const far = { lat: 43.8, lon: -79.2 };
    const list = routeVariants([
      { direction: 0, headsign: "East - 86A Scarborough towards Zoo", trips: 10, stops: ["e0", "e1"] },
      { direction: 0, headsign: "East - 86 Scarborough towards Zoo", trips: 10, stops: ["e2", "e3"] },
      { direction: 1, headsign: "West - 86C Scarborough towards Kennedy", trips: 9, stops: ["x"] },
    ], "86", () => null, (code) => (code === "x" ? far : stopPoint(code)));
    assert.deepEqual(list.map((variant) => [variant.code, variant.directions.length]), [["86", 1], ["86A", 1], ["86C", 1]]);
  });

  it("pairs a code's only list each way even without stop locations", () => {
    const list = routeVariants([
      { direction: 0, headsign: "South - 27 Jane South towards Jane Station", trips: 123, stops: ["1"] },
      { direction: 1, headsign: "North - 27 Jane South towards Mount Dennis Station", trips: 122, stops: ["2"] },
    ], "27");
    assert.deepEqual(list.map((variant) => variant.code), ["27"]);
    assert.equal(list[0].name, "Jane Station ↔ Mount Dennis Station");
  });

  it("splits a code with several lists, with unique ids, telling alike ones apart by where they start", () => {
    const list = routeVariants([
      { direction: 0, headsign: "East - 86 Scarborough towards Kennedy", trips: 5, stops: ["1"] },
      { direction: 0, headsign: "East - 86 Scarborough towards Kennedy", trips: 4, stops: ["2"] },
    ], "86", (code) => `Stop ${code} Name`);
    assert.deepEqual(list.map((variant) => variant.id), ["86/1", "86/2"]);
    assert.deepEqual(list.map((variant) => variant.name), ["Kennedy, from Stop 1 Name", "Kennedy, from Stop 2 Name"]);
  });

  it("reads GO headsigns, and treats a sign that names no code as the route", () => {
    assert.deepEqual(routeVariants([
      { direction: 0, headsign: "18G - Union Station", trips: 1, stops: ["1"] },
      { direction: 1, headsign: "18J - West Harbour GO", trips: 10, stops: ["2"] },
      { direction: 1, headsign: "West Harbour Express", trips: 2, stops: ["3"] },
    ], "18").map((variant) => variant.code), ["18", "18G", "18J"]);
  });

  it("a direction opens its busiest branch, by its trips that way", () => {
    const list = routeVariants([
      { direction: 0, headsign: "East - 52F Lawrence towards A", trips: 90, stops: ["1"] },
      { direction: 1, headsign: "West - 52F Lawrence towards B", trips: 10, stops: ["2"] },
      { direction: 1, headsign: "West - 52A Lawrence towards C", trips: 50, stops: ["3"] },
    ], "52");
    assert.equal(busiestVariantFor(list, 0).code, "52F");
    assert.equal(busiestVariantFor(list, 1).code, "52A");
    assert.equal(busiestVariantFor(list, 9), null);
  });
});

describe("expressCounterpart", () => {
  const ttc = (route, name) => ({ network: "ttc", route, name });
  const routes = [
    ttc("89", "Weston"), ttc("989", "Weston Express"),
    ttc("39", "Finch East"), ttc("939", "Finch Express"),
    ttc("27", "Jane South"), ttc("927", "Highway 27 Express"),
    ttc("900", "Airport Express"), ttc("52", "Lawrence West"),
  ];
  const find = (number) => routes.find((route) => route.route === number);

  it("links an express and its regular route, both ways", () => {
    assert.deepEqual(expressCounterpart(find("89"), routes), { route: find("989"), isExpress: true });
    assert.deepEqual(expressCounterpart(find("989"), routes), { route: find("89"), isExpress: false });
    assert.equal(expressCounterpart(find("39"), routes).route.route, "939");
  });

  it("needs the names to agree: a shared number is not enough", () => {
    assert.equal(expressCounterpart(find("27"), routes), null);
    assert.equal(expressCounterpart(find("927"), routes), null);
  });

  it("gives nothing for a route with no counterpart, or outside the TTC", () => {
    assert.equal(expressCounterpart(find("900"), routes), null);
    assert.equal(expressCounterpart(find("52"), routes), null);
    const go = [{ network: "regional", route: "89", name: "A" }, { network: "regional", route: "989", name: "A Express" }];
    assert.equal(expressCounterpart(go[0], go), null);
  });
});

describe("routeBranchCodes", () => {
  it("lists a route's lettered branches once each, in order, without the plain route", () => {
    assert.deepEqual(routeBranchCodes([
      { direction: 0, headsign: "East - 52 Lawrence West towards Lawrence Station", trips: 1, stops: ["1"] },
      { direction: 1, headsign: "West - 52F Lawrence West towards Royal York", trips: 1, stops: ["2"] },
      { direction: 0, headsign: "East - 52F Lawrence West towards Sunnybrook Hospital", trips: 1, stops: ["3"] },
      { direction: 1, headsign: "West - 52A Lawrence West towards Pearson Airport", trips: 1, stops: ["4"] },
    ], "52"), ["52A", "52F"]);
  });

  it("is empty for a route with no letters, or not loaded", () => {
    assert.deepEqual(routeBranchCodes([{ direction: 0, headsign: "South - 27 Jane South towards Jane Station", trips: 1, stops: ["1"] }], "27"), []);
    assert.deepEqual(routeBranchCodes(undefined, "27"), []);
  });
});
