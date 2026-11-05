import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareSurfaceSearchIndex } from "../src/app/surface-search.ts";
import { surfaceNoticeMapTarget } from "../src/app/surface-notice-target.ts";

const asset = (name) => JSON.parse(readFileSync(new URL(`../public/assets/linewatch/geographic/${name}`, import.meta.url), "utf8"));
const ttc = prepareSurfaceSearchIndex(asset("search-index-ttc.json"));
const go = prepareSurfaceSearchIndex(asset("search-index-go.json"));

const notice = (fields) => ({
  id: "n",
  category: "detour",
  routeType: "Bus",
  routeIds: [],
  title: "Notice",
  description: "",
  stopIds: [],
  stops: [],
  updatedAt: "2026-11-04T12:00:00Z",
  source: "test",
  ...fields,
});
const stops = (...pairs) => ({
  stopIds: pairs.map(([stopId]) => stopId),
  stops: pairs.map(([stopId, stopName]) => ({ stopId, stopName })),
});

describe("surfaceNoticeMapTarget on TTC", () => {
  test("pole numbers are stop numbers, from a live GTFS-RT notice", () => {
    const target = surfaceNoticeMapTarget(notice({
      routeIds: ["41"],
      ...stops(["7897", "Keele St at Sheppard Ave West North Side"], ["11321", "Keele St at Finch Ave West - Finch West Station"]),
    }), "ttc", ttc);
    assert.deepEqual(target, { kind: "stops", stopCodes: ["7897", "11321"] });
  });

  test("a stop listed twice is one stop, so View can open its departures", () => {
    const name = "Woodbine Racetrack Loop (Main Entrance)";
    assert.deepEqual(
      surfaceNoticeMapTarget(notice({ routeIds: ["37"], ...stops([name, name], [name, name]) }), "ttc", ttc),
      { kind: "stops", stopCodes: ["13938"] },
    );
  });

  test("a name matches only poles on the notice's route", () => {
    // Both sides of the intersection serve the 123.
    const target = surfaceNoticeMapTarget(notice({
      routeIds: ["123"],
      ...stops(["North Queen St at Atomic Ave", "North Queen St at Atomic Ave"]),
    }), "ttc", ttc);
    assert.deepEqual(target.stopCodes.toSorted(), ["9510", "9511"]);

    // Off the notice's route, the same name is not trusted and the route is framed.
    assert.deepEqual(
      surfaceNoticeMapTarget(notice({ routeIds: ["504"], ...stops(["North Queen St at Atomic Ave", "North Queen St at Atomic Ave"]) }), "ttc", ttc),
      { kind: "routes", routes: [{ layer: "streetcar", route: "504" }] },
    );
  });

  test("without a route, only a name with one pole counts", () => {
    const name = "Woodbine Racetrack Loop (Main Entrance)";
    assert.deepEqual(surfaceNoticeMapTarget(notice(stops([name, name])), "ttc", ttc), { kind: "stops", stopCodes: ["13938"] });
    const shared = "North Queen St at Atomic Ave";
    assert.deepEqual(surfaceNoticeMapTarget(notice(stops([shared, shared])), "ttc", ttc), { kind: "none" });
  });

  test("mixed ids: a known number, a name, and an unknown number that falls back to its name", () => {
    const target = surfaceNoticeMapTarget(notice({
      routeIds: ["82", "97"],
      ...stops(
        ["7337", "South Dr at May St"],
        ["Yonge St at Davenport Rd", "Yonge St at Davenport Rd"],
        ["99999991", "Yonge St at Scollard St"],
        ["99999992", "Nowhere At All"],
      ),
    }), "ttc", ttc);
    assert.deepEqual(target.stopCodes.toSorted(), ["3220", "3242", "7337"].toSorted());
  });

  test("a stopIds entry with no paired name still resolves", () => {
    assert.deepEqual(
      surfaceNoticeMapTarget(notice({ routeIds: ["41"], stopIds: ["7897"], stops: undefined }), "ttc", ttc),
      { kind: "stops", stopCodes: ["7897"] },
    );
  });

  test("no stops: the route, by route number and in its own layer", () => {
    assert.deepEqual(surfaceNoticeMapTarget(notice({ routeIds: ["29C"] }), "ttc", ttc), { kind: "routes", routes: [{ layer: "bus", route: "29" }] });
    assert.deepEqual(surfaceNoticeMapTarget(notice({ routeType: "Streetcar", routeIds: ["501C"] }), "ttc", ttc), { kind: "routes", routes: [{ layer: "streetcar", route: "501" }] });
    assert.deepEqual(surfaceNoticeMapTarget(notice({ routeIds: ["329"] }), "ttc", ttc), { kind: "routes", routes: [{ layer: "night", route: "329" }] });
  });

  test("several routes: all the map draws, once each, across layers", () => {
    const routes = (routeIds, routeType = "Bus") => surfaceNoticeMapTarget(notice({ routeType, routeIds }), "ttc", ttc).routes;
    assert.deepEqual(routes(["508", "503", "504C"], "Streetcar").map((route) => route.route).includes("503"), false);
    assert.ok(routes(["508", "503", "504C"], "Streetcar").some((route) => route.route === "504"));
    assert.deepEqual(routes(["29C", "29B", "329"]), [{ layer: "bus", route: "29" }, { layer: "night", route: "329" }]);
    assert.deepEqual(routes(["29", "504"]), [{ layer: "bus", route: "29" }, { layer: "streetcar", route: "504" }]);
  });

  test("stops with no known position fall back to the route", () => {
    assert.deepEqual(
      surfaceNoticeMapTarget(notice({ routeIds: ["29"], ...stops(["99999991", "Nowhere At All"]) }), "ttc", ttc),
      { kind: "routes", routes: [{ layer: "bus", route: "29" }] },
    );
  });

  test("neither: an undrawn route, an unknown route, or nothing", () => {
    assert.deepEqual(surfaceNoticeMapTarget(notice({ routeType: "Streetcar", routeIds: ["503"] }), "ttc", ttc), { kind: "none" });
    assert.deepEqual(surfaceNoticeMapTarget(notice({ routeIds: ["124"] }), "ttc", ttc), { kind: "none" });
    assert.deepEqual(surfaceNoticeMapTarget(notice({}), "ttc", ttc), { kind: "none" });
  });
});

describe("surfaceNoticeMapTarget on GO/UP", () => {
  test("a GO Bus route draws in the GO bus layer", () => {
    assert.deepEqual(surfaceNoticeMapTarget(notice({ routeType: "GO Bus", routeIds: ["31"] }), "regional", go), { kind: "routes", routes: [{ layer: "go-bus", route: "31" }] });
  });

  test("a GO Bus stop number, with or without leading zeros", () => {
    assert.deepEqual(surfaceNoticeMapTarget(notice({ routeType: "GO Bus", routeIds: ["31"], ...stops(["00128", "x"]) }), "regional", go), { kind: "stops", stopCodes: ["00128"] });
    assert.deepEqual(surfaceNoticeMapTarget(notice({ routeType: "GO Bus", routeIds: ["31"], ...stops(["128", "x"]) }), "regional", go), { kind: "stops", stopCodes: ["00128"] });
  });

  test("rail notices never resolve, whatever their codes look like", () => {
    assert.deepEqual(surfaceNoticeMapTarget(notice({ routeType: "GO / UP", routeIds: ["MI"], ...stops(["SR", "Streetsville GO"]) }), "regional", go), { kind: "none" });
    // A rail notice's numbers are not bus stops or routes.
    assert.deepEqual(surfaceNoticeMapTarget(notice({ routeType: "GO / UP", routeIds: ["31"], ...stops(["00128", "x"]) }), "regional", go), { kind: "none" });
  });
});

describe("surfaceNoticeMapTarget keeps the networks apart", () => {
  test("a GO notice never resolves on TTC, or a TTC notice on GO", () => {
    assert.deepEqual(surfaceNoticeMapTarget(notice({ routeType: "GO Bus", routeIds: ["29"] }), "ttc", ttc), { kind: "none" });
    assert.deepEqual(surfaceNoticeMapTarget(notice({ routeType: "Bus", routeIds: ["31"] }), "regional", go), { kind: "none" });
    assert.deepEqual(surfaceNoticeMapTarget(notice({ routeIds: ["29"] }), "ttc", go), { kind: "none" });
  });
});
