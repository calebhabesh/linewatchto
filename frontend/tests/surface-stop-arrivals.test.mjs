import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getSurfaceStopArrivals,
  surfaceNoticesForStop,
  surfaceStopCodeFromQuery,
  surfaceStopDisclaimer,
  surfaceStopGroups,
  surfaceStopSchedulePeriod,
  surfaceStopSourceLine,
} from "../src/app/surface-stop-arrivals.ts";

const live = (at) => ({ status: "live", at, predictedAt: at, scheduledAt: null, minutes: 0 });
const scheduled = (at) => ({ status: "scheduled", at, predictedAt: null, scheduledAt: at, minutes: 0 });

const route = (departures, overrides = {}) => ({
  route: "506", routeName: "Carlton", mode: "streetcar",
  destination: "East - 506 Carlton towards Main Street Station", departures, ...overrides,
});

describe("stop departures as arrival tiles", () => {
  it("keep each time's status, with live times predicted and scheduled times from the timetable", () => {
    const groups = surfaceStopGroups({
      stopName: "Howard Park Ave at Dundas St West",
      live: { state: "live", source: "TTC GTFS-RT", sourceUpdatedAt: null, maxAgeSeconds: 120 },
      routes: [
        route([
          { ...live("2026-11-02T18:04:00-05:00"), scheduledAt: "2026-11-02T18:03:00-05:00", minutes: 4 },
          { ...scheduled("2026-11-02T18:20:00-05:00"), minutes: 20 },
        ]),
        route([], { route: "306", destination: "East - 306 Carlton towards Main Street Station" }),
      ],
    });
    assert.equal(groups.length, 1, "a route without times is not a card");
    const [first, second] = groups[0].arrivals;
    assert.equal(first.status, "live");
    assert.equal(first.predictedAt, "2026-11-02T18:04:00-05:00");
    assert.equal(first.scheduledAt, "2026-11-02T18:03:00-05:00");
    assert.equal(second.status, "scheduled");
    assert.equal(second.predictedAt, null);
    assert.equal(second.scheduledAt, "2026-11-02T18:20:00-05:00");
  });
});

describe("stop live source", () => {
  const base = { maxAgeSeconds: 120, source: "TTC GTFS-RT" };
  const routes = (statuses) => [route(statuses.map((status) => (status === "live"
    ? live("2026-11-02T18:04:00-05:00") : scheduled("2026-11-02T18:09:00-05:00"))))];

  it("names a stale source and says the schedule is shown", () => {
    assert.equal(
      surfaceStopSourceLine({ live: { ...base, state: "stale", sourceUpdatedAt: "2026-11-02T22:55:00Z" }, routes: routes(["scheduled"]) }),
      "Live times stale since 5:55 PM · schedule shown",
    );
  });

  it("names unavailable and switched-off sources, and what a fresh source supplied", () => {
    assert.equal(surfaceStopSourceLine({ live: { ...base, state: "unavailable", sourceUpdatedAt: null }, routes: [] }),
      "Live times unavailable · schedule shown");
    assert.equal(surfaceStopSourceLine({ live: { ...base, state: "disabled", sourceUpdatedAt: null }, routes: [] }),
      "TTC stop departures turned off");
    const fresh = { ...base, state: "live", sourceUpdatedAt: "2026-11-02T23:00:00Z" };
    assert.equal(surfaceStopSourceLine({ live: fresh, routes: routes(["live", "scheduled"]) }), "TTC live estimates + published schedule");
    assert.equal(surfaceStopSourceLine({ live: fresh, routes: routes(["scheduled"]) }), "Published schedule · no live estimates here now");
  });

  it("notes where the times come from and the next-departure rule", () => {
    const note = surfaceStopDisclaimer({
      horizonMinutes: 120,
      schedule: { state: "available", serviceStart: "2026-11-01", serviceEnd: "2026-12-21", source: "" },
    });
    assert.match(note, /published TTC schedule \(Nov 1 – Dec 21\)/);
    assert.match(note, /nothing in the next 2 hours shows its next scheduled departures/);
  });

  it("formats the schedule period the times come from", () => {
    assert.equal(surfaceStopSchedulePeriod({ state: "available", serviceStart: "2026-11-01", serviceEnd: "2026-12-21", source: "" }),
      "Nov 1 – Dec 21");
    assert.equal(surfaceStopSchedulePeriod({ state: "unavailable", serviceStart: null, serviceEnd: null, source: "" }), null);
  });
});

describe("stop requests", () => {
  const respond = (status, body) => async () => new Response(body === undefined ? null : JSON.stringify(body), { status });

  it("treats 404 as an unknown stop and other failures as an error, not an empty stop", async () => {
    assert.deepEqual(await getSurfaceStopArrivals("1", { fetcher: respond(404), apiBaseUrl: "http://api.test" }),
      { kind: "not-found", stopCode: "1" });
    assert.deepEqual(await getSurfaceStopArrivals("1", { fetcher: respond(500), apiBaseUrl: "http://api.test" }),
      { kind: "error", stopCode: "1" });
    assert.deepEqual(await getSurfaceStopArrivals("1", { fetcher: respond(200, { nope: true }), apiBaseUrl: "http://api.test" }),
      { kind: "error", stopCode: "1" });
  });

  it("returns a stop that is not in the current schedule as data, with its message", async () => {
    let requested = "";
    const body = {
      stopCode: "15100", availability: "not-in-schedule", message: "This stop is not in the current TTC schedule.",
      live: { state: "live" }, routes: [],
    };
    const result = await getSurfaceStopArrivals("15100", {
      apiBaseUrl: "http://api.test",
      fetcher: async (url) => { requested = String(url); return new Response(JSON.stringify(body), { status: 200 }); },
    });
    assert.equal(requested, "http://api.test/api/surface/stops/15100/arrivals");
    assert.equal(result.kind, "ok");
    assert.equal(result.data.availability, "not-in-schedule");
  });
});

describe("stop search", () => {
  it("reads a stop number from the search box", () => {
    assert.equal(surfaceStopCodeFromQuery("9037"), "9037");
    assert.equal(surfaceStopCodeFromQuery(" Stop 9037 "), "9037");
    assert.equal(surfaceStopCodeFromQuery("#9037"), "9037");
    assert.equal(surfaceStopCodeFromQuery("Union"), null);
    assert.equal(surfaceStopCodeFromQuery("Line 1"), null);
    assert.equal(surfaceStopCodeFromQuery("1234567"), null);
  });
});

describe("stop notices", () => {
  const notice = (id, extra) => ({
    id, category: "detour", routeType: "Streetcar", routeIds: [], title: id, description: "", stopIds: [],
    updatedAt: "2026-11-02T20:00:00Z", source: "TTC", ...extra,
  });
  const now = Date.parse("2026-11-02T21:00:00Z");

  it("lists active notices for the stop's routes or the stop itself, never announcements", () => {
    const notices = [
      notice("route", { routeIds: ["504"], updatedAt: "2026-11-02T19:00:00Z" }),
      notice("stop", { stopIds: ["2120"] }),
      notice("other", { routeIds: ["501"] }),
      notice("planned", { routeIds: ["504"], scheduleAnnouncement: true }),
      notice("later", { routeIds: ["504"], startAt: "2026-11-03T05:00:00Z" }),
      notice("ended", { routeIds: ["504"], endAt: "2026-11-02T20:30:00Z" }),
    ];
    assert.deepEqual(surfaceNoticesForStop(notices, { stopId: "2120", routes: ["504", "510"] }, now).map((item) => item.id),
      ["stop", "route"]);
  });
});
