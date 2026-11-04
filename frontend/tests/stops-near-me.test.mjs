import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createDepartureRequestCap,
  createNearMeStore,
  findStopsNearMe,
  formatStopDistance,
  goStopPreview,
  nearbyStopCodes,
  nearestStops,
  NEAR_ME_DEPARTURE_BUDGET,
  NEAR_ME_POSITION_OPTIONS,
  NEAR_ME_RESULT_TTL_MS,
  previewDepartures,
  previewTimeLabel,
  ttcStopPreview,
} from "../src/app/stops-near-me.ts";
import { distanceMeters, prepareSurfaceSearchIndex } from "../src/app/surface-search.ts";

const asset = (name) => JSON.parse(readFileSync(new URL(`../public/assets/linewatch/geographic/${name}`, import.meta.url), "utf8"));
const ttc = prepareSurfaceSearchIndex(asset("search-index-ttc.json"));
const go = prepareSurfaceSearchIndex(asset("search-index-go.json"));
const stopAt = (index, code) => index.stops[index.stopByCode.get(code)];

// One synthetic stop `meters` north of a fixed point.
const ORIGIN = { lat: 43.65, lon: -79.4 };
const syntheticIndex = (network, metersNorth) => ({
  network,
  stops: metersNorth.map((meters, i) => ({
    network, code: String(1000 + i), name: `Stop ${i}`, lat: ORIGIN.lat + meters / 111_320, lon: ORIGIN.lon, routes: [], station: null,
  })),
});

describe("nearestStops", () => {
  it("lists the shipped TTC stops within 500 m nearest first, at most 8", () => {
    const stop = stopAt(ttc, "100");
    const near = nearestStops([ttc, go], stop);
    assert.equal(near[0].stop.code, "100");
    assert.equal(near[0].distanceMeters, 0);
    assert.ok(near.length > 1 && near.length <= 8);
    for (let i = 1; i < near.length; i++) assert.ok(near[i].distanceMeters >= near[i - 1].distanceMeters);
    for (const { stop: found, distanceMeters: distance } of near) {
      assert.ok(distance <= 500);
      assert.equal(Math.round(distance), Math.round(distanceMeters(stop, found)));
    }
  });

  it("lists both networks together, marked by network", () => {
    // GO stop 00008 is at Yonge and Sheppard, among TTC poles.
    const goStop = stopAt(go, "00008");
    const near = nearestStops([ttc, go], goStop);
    assert.equal(near[0].stop.network, "regional");
    assert.equal(near[0].stop.code, "00008");
    assert.ok(near.some(({ stop }) => stop.network === "ttc"));
    assert.deepEqual(nearbyStopCodes({ status: "ready", result: { stops: near } }, "regional")[0], "00008");
    assert.ok(nearbyStopCodes({ status: "ready", result: { stops: near } }, "ttc").length > 0);
    assert.deepEqual(nearbyStopCodes({ status: "idle" }, "ttc"), []);
  });

  it("scans the full TTC index in well under a frame", () => {
    const start = performance.now();
    for (let i = 0; i < 50; i++) nearestStops([ttc, go], ORIGIN, { radiusMeters: 1_000 });
    assert.ok((performance.now() - start) / 50 < 8);
  });
});

describe("findStopsNearMe", () => {
  it("keeps to 500 m when something is there", () => {
    const result = findStopsNearMe([syntheticIndex("ttc", [300, 700])], ORIGIN);
    assert.equal(result.widened, false);
    assert.equal(result.radiusMeters, 500);
    assert.deepEqual(result.stops.map(({ stop }) => stop.code), ["1000"]);
  });

  it("widens to 1 km once when nothing is within 500 m", () => {
    const result = findStopsNearMe([syntheticIndex("ttc", [700, 1_400]), syntheticIndex("regional", [900])], ORIGIN);
    assert.equal(result.widened, true);
    assert.equal(result.radiusMeters, 1_000);
    assert.deepEqual(result.stops.map(({ stop }) => `${stop.network}:${stop.code}`), ["ttc:1000", "regional:1000"]);
  });

  it("says nothing is near when even 1 km is empty", () => {
    const result = findStopsNearMe([ttc, go], { lat: 43.55, lon: -79.4 });
    assert.deepEqual(result, { stops: [], radiusMeters: 1_000, widened: true });
  });
});

describe("formatStopDistance", () => {
  it("rounds to 10 m and switches to km", () => {
    assert.equal(formatStopDistance(0), "10 m");
    assert.equal(formatStopDistance(124), "120 m");
    assert.equal(formatStopDistance(996), "1.0 km");
    assert.equal(formatStopDistance(1_234), "1.2 km");
  });
});

describe("createDepartureRequestCap", () => {
  it("reuses a stop asked for within a minute, and caps requests per window", () => {
    const cap = createDepartureRequestCap();
    assert.equal(cap.decide("ttc:1", 0), "request");
    assert.equal(cap.decide("ttc:1", 30_000), "reuse");
    for (let i = 2; i <= NEAR_ME_DEPARTURE_BUDGET.requests; i++) assert.equal(cap.decide(`ttc:${i}`, 31_000), "request");
    assert.equal(cap.decide("ttc:99", 32_000), "capped");
    // A minute on, stop 1 may be asked again only once the window has room.
    assert.equal(cap.decide("ttc:1", 61_000), "capped");
    assert.equal(cap.decide("ttc:1", NEAR_ME_DEPARTURE_BUDGET.windowMs + 1), "request");
  });
});

describe("previews", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  it("keeps every time's live or scheduled label, soonest first", () => {
    const preview = ttcStopPreview({
      kind: "ok",
      data: {
        availability: "available",
        routes: [
          { route: "509", departures: [{ status: "scheduled", at: "2026-11-04T12:09:00Z" }] },
          { route: "511", departures: [{ status: "live", at: "2026-11-04T12:04:00Z" }, { status: "live", at: "2026-11-04T11:50:00Z" }] },
        ],
      },
    });
    assert.deepEqual(previewDepartures(preview.departures, now), [
      { route: "511", at: "2026-11-04T12:04:00Z", status: "live" },
      { route: "509", at: "2026-11-04T12:09:00Z", status: "scheduled" },
    ]);
  });

  it("words times as the stop panel does", () => {
    assert.equal(previewTimeLabel("2026-11-04T12:00:20Z", now), "Due");
    assert.equal(previewTimeLabel("2026-11-04T12:04:00Z", now), "4 min");
    assert.equal(previewTimeLabel("2026-11-04T13:10:00Z", now), "8:10 AM");
  });

  it("says nothing for a stop the source cannot answer", () => {
    assert.deepEqual(ttcStopPreview({ kind: "not-found", stopCode: "1" }), { status: "unavailable" });
    assert.deepEqual(ttcStopPreview({ kind: "ok", data: { availability: "disabled", routes: [] } }), { status: "unavailable" });
    assert.deepEqual(goStopPreview({ kind: "error", stopCode: "00008" }), { status: "unavailable" });
    assert.deepEqual(goStopPreview({ kind: "ok", data: { availability: "no-departures", departures: [] } }), { status: "ready", departures: [] });
    assert.deepEqual(
      goStopPreview({ kind: "ok", data: { availability: "available", departures: [{ route: "67", at: "x", status: "live", minutes: 3 }] } }),
      { status: "ready", departures: [{ route: "67", at: "x", status: "live" }] },
    );
  });
});

function fakeStore({ fix, error, indexes = [ttc, go], failIndexes = false } = {}) {
  const calls = { position: 0, options: null, previews: [] };
  const timers = [];
  let clock = 1_000;
  let pendingSuccess = null;
  const geolocation = {
    getCurrentPosition(success, failure, options) {
      calls.position++;
      calls.options = options;
      if (error) failure({ code: error });
      else if (fix === "hold") pendingSuccess = success;
      else success({ coords: { latitude: fix.lat, longitude: fix.lon, accuracy: fix.accuracy ?? 12 } });
    },
  };
  const store = createNearMeStore({
    geolocation: () => (fix === null ? null : geolocation),
    loadIndexes: () => (failIndexes ? Promise.reject(new Error("offline")) : Promise.resolve(indexes)),
    fetchPreview: (network, code) => {
      calls.previews.push(`${network}:${code}`);
      return Promise.resolve({ status: "ready", departures: [] });
    },
    now: () => clock,
    setTimer: (callback, ms) => { timers.push({ callback, ms }); return timers.length; },
    clearTimer: () => {},
  });
  return { store, calls, timers, advance: (ms) => { clock += ms; }, release: (coords) => pendingSuccess?.({ coords }) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createNearMeStore", () => {
  const stop100 = stopAt(ttc, "100");

  it("asks once with high accuracy and a 10 s timeout, then lists stops and requests only the nearest 3", async () => {
    const { store, calls } = fakeStore({ fix: { lat: stop100.lat, lon: stop100.lon } });
    assert.equal(store.getSnapshot().state.status, "idle");
    store.locate();
    assert.equal(store.getSnapshot().state.status, "asking");
    await settle();
    const { state, previews } = store.getSnapshot();
    assert.equal(state.status, "ready");
    assert.equal(state.result.stops[0].stop.code, "100");
    assert.equal(state.lowAccuracy, false);
    assert.equal(calls.position, 1);
    assert.deepEqual(calls.options, NEAR_ME_POSITION_OPTIONS);
    assert.equal(NEAR_ME_POSITION_OPTIONS.enableHighAccuracy, true);
    assert.equal(NEAR_ME_POSITION_OPTIONS.timeout, 10_000);
    assert.deepEqual(calls.previews, state.result.stops.slice(0, 3).map(({ stop }) => `ttc:${stop.code}`));
    assert.equal(previews.size, 3);
  });

  it("keeps the stops picked, never the position", async () => {
    const position = { lat: 43.6389471234, lon: -79.4007719876 };
    const { store } = fakeStore({ fix: position });
    store.locate();
    await settle();
    const saved = JSON.stringify(store.getSnapshot().state);
    assert.ok(!saved.includes("43.6389471234") && !saved.includes("-79.4007719876"));
    assert.ok(!/latitude|longitude/.test(saved));
  });

  it("does not repeat departure requests when tapped again while walking", async () => {
    const { store, calls, advance } = fakeStore({ fix: { lat: stop100.lat, lon: stop100.lon } });
    store.locate();
    await settle();
    advance(20_000);
    store.locate();
    await settle();
    assert.equal(calls.position, 2);
    assert.equal(calls.previews.length, 3);
    assert.equal(store.getSnapshot().previews.size, 3);
  });

  it("says when location is denied, missing or unavailable", async () => {
    const denied = fakeStore({ error: 1 });
    denied.store.locate();
    assert.equal(denied.store.getSnapshot().state.status, "denied");
    const timeout = fakeStore({ error: 3 });
    timeout.store.locate();
    assert.equal(timeout.store.getSnapshot().state.status, "no-fix");
    const unavailable = fakeStore({ error: 2 });
    unavailable.store.locate();
    assert.equal(unavailable.store.getSnapshot().state.status, "no-fix");
    const unsupported = fakeStore({ fix: null });
    unsupported.store.locate();
    assert.equal(unsupported.store.getSnapshot().state.status, "unsupported");
    for (const { calls } of [denied, timeout, unavailable, unsupported]) assert.deepEqual(calls.previews, []);
  });

  it("flags a low-accuracy fix and an index that failed to load", async () => {
    const rough = fakeStore({ fix: { lat: stop100.lat, lon: stop100.lon, accuracy: 1_850.4 } });
    rough.store.locate();
    await settle();
    assert.equal(rough.store.getSnapshot().state.lowAccuracy, true);
    assert.equal(rough.store.getSnapshot().state.accuracyMeters, 1_850);
    const offline = fakeStore({ fix: { lat: stop100.lat, lon: stop100.lon }, failIndexes: true });
    offline.store.locate();
    await settle();
    assert.equal(offline.store.getSnapshot().state.status, "index-unavailable");
  });

  it("ignores a late fix from an earlier tap and expires an old list", async () => {
    const { store, timers, release } = fakeStore({ fix: "hold" });
    store.locate();
    store.reset();
    release({ latitude: stop100.lat, longitude: stop100.lon, accuracy: 10 });
    await settle();
    assert.equal(store.getSnapshot().state.status, "idle");

    store.locate();
    release({ latitude: stop100.lat, longitude: stop100.lon, accuracy: 10 });
    await settle();
    assert.equal(store.getSnapshot().state.status, "ready");
    const expiry = timers.at(-1);
    assert.equal(expiry.ms, NEAR_ME_RESULT_TTL_MS);
    expiry.callback();
    assert.equal(store.getSnapshot().state.status, "idle");
  });

  it("tells subscribers about each change", async () => {
    const { store } = fakeStore({ fix: { lat: stop100.lat, lon: stop100.lon } });
    const seen = [];
    const unsubscribe = store.subscribe(() => seen.push(store.getSnapshot().state.status));
    store.locate();
    await settle();
    unsubscribe();
    store.reset();
    assert.equal(seen[0], "asking");
    assert.ok(seen.includes("ready"));
    assert.notEqual(seen.at(-1), "idle");
  });
});
