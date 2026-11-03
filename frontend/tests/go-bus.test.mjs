import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExpression } from "@maplibre/maplibre-gl-style-spec";

import {
  GO_BUS_BADGE_LAYER,
  GO_BUS_CASING_LAYER,
  GO_BUS_HIT_LAYER,
  GO_BUS_LINE_LAYER,
  GO_BUS_STOP_LAYER,
  goBusStopCodeAtPoint,
  hasGoBusLayers,
  hasGoBusStopLayers,
  installGoBusLayers,
  installGoBusStopLayers,
  removeGoBusLayers,
  updateGoBusFilter,
} from "../src/components/geographic-go-bus-layers.ts";
import { BUS_LINE_LAYER, installBusLayers } from "../src/components/geographic-bus-layers.ts";
import {
  GO_BUS_BADGE_MIN_ZOOM,
  GO_BUS_LAYER_STORAGE_KEY,
  GO_BUS_LINE_COLOR,
  GO_BUS_STOP_MIN_ZOOM,
  goBusBadgeImageId,
  goBusBadgeRoutes,
  goBusCardRows,
  goBusStopByCode,
  nearestGoBusStop,
  readGoBusLayerPreference,
  writeGoBusLayerPreference,
} from "../src/app/go-bus-catalog.ts";
import { BUS_LAYER_STORAGE_KEY, busBadgeRoutes } from "../src/app/geographic-bus-catalog.ts";
import {
  getGoBusStopDepartures,
  goBusStopDisclaimer,
  goBusStopGroups,
  goBusStopSourceLine,
} from "../src/app/go-bus-stop-departures.ts";
import { getGeographicDefaultZoom } from "../src/app/geographic-config.ts";

globalThis.window = globalThis;

const catalog = {
  type: "FeatureCollection",
  schemaVersion: "1.0.0",
  network: "regional",
  layer: "go-bus",
  source: { feedStartDate: "2026-10-28", feedEndDate: "2026-11-27", sampleWeek: ["2026-11-02", "2026-11-06"] },
  routes: [
    { route: "19", name: "Mississauga / North York", color: "#f57f25", textColor: "#000000", drawn: true, variants: [], weekdayTrips: 71 },
    { route: "27", name: "Milton / North York", color: "#f57f25", textColor: "#000000", drawn: true, variants: ["27A"], weekdayTrips: 56 },
    { route: "35", name: "Union Pearson Express", color: "#00a6ff", textColor: "#FFFFFF", drawn: false, variants: [], weekdayTrips: 0 },
  ],
  features: [
    { type: "Feature", id: "g1", geometry: { type: "LineString", coordinates: [[-79.42, 43.76], [-79.6, 43.6]] }, properties: { featureType: "go-bus-corridor", routes: ["19", "27"] } },
  ],
};
const stops = {
  type: "FeatureCollection",
  schemaVersion: "1.0.0",
  network: "regional",
  layer: "go-bus-stops",
  source: catalog.source,
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [-79.4116, 43.7615] }, properties: { featureType: "go-bus-stop", stopCode: "00008", name: "Yonge St. @ Sheppard Ave.", routes: ["19", "27"] } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-79.6, 43.6] }, properties: { featureType: "go-bus-stop", stopCode: "00132", name: "Square One", routes: ["19"] } },
  ],
};

function createMockMap(existingLayers = []) {
  const sources = {};
  const layers = existingLayers.map((id) => ({ id }));
  const paint = [];
  return {
    sources,
    layers,
    paint,
    getSource: (id) => sources[id],
    addSource: (id, config) => { sources[id] = { ...config, setData: (data) => { sources[id].data = data; } }; },
    removeSource: (id) => { delete sources[id]; },
    getLayer: (id) => layers.find((layer) => layer.id === id),
    addLayer: (layer, beforeId) => {
      const index = beforeId ? layers.findIndex((l) => l.id === beforeId) : -1;
      if (index >= 0) layers.splice(index, 0, layer);
      else layers.push(layer);
    },
    removeLayer: (id) => {
      const index = layers.findIndex((layer) => layer.id === id);
      if (index >= 0) layers.splice(index, 1);
    },
    hasImage: () => false,
    addImage: () => {},
    setPaintProperty: (layer, property, value) => paint.push({ layer, property, value }),
    setLayoutProperty: () => {},
    getPaintProperty: () => undefined,
    queryRenderedFeatures: (_box, options) => (options.layers.includes(GO_BUS_STOP_LAYER) ? [{ properties: { stopCode: "00008" } }] : []),
    getStyle: () => ({ layers }),
  };
}

function evaluate(expression, zoom) {
  const compiled = createExpression(expression, { type: "number", expression: { interpolated: true, parameters: ["zoom"] } });
  assert.equal(compiled.result, "success", JSON.stringify(compiled.value));
  return compiled.value.evaluateWithoutErrorHandling({ zoom, globalState: {} }, { properties: {} });
}

const BASE = ["transit-routes-casing", "transit-routes", "transit-stations-outer", "transit-station-labels"];
const ids = (map) => map.layers.map((layer) => layer.id);

describe("GO bus layers on the GO/UP Map View (plan 13, S6)", () => {
  it("draw under the GO/UP rail lines and stations, at every zoom, thinner than rail", () => {
    const map = createMockMap(BASE);
    installGoBusLayers(map, catalog, { dark: false, activeFilteredLine: null });
    installGoBusStopLayers(map, stops, { activeFilteredLine: null, selectedStopCode: null });
    const order = ids(map);
    for (const id of [GO_BUS_CASING_LAYER, GO_BUS_LINE_LAYER, GO_BUS_HIT_LAYER]) {
      assert.ok(order.indexOf(id) < order.indexOf("transit-routes-casing"), `${id} under the rail lines`);
      assert.equal(map.getLayer(id).minzoom, undefined);
    }
    assert.ok(order.indexOf(GO_BUS_BADGE_LAYER) < order.indexOf("transit-stations-outer"));
    assert.ok(order.indexOf(GO_BUS_STOP_LAYER) < order.indexOf("transit-stations-outer"));
    assert.ok(GO_BUS_BADGE_MIN_ZOOM > getGeographicDefaultZoom("regional"));
    assert.equal(map.getLayer(GO_BUS_STOP_LAYER).minzoom, GO_BUS_STOP_MIN_ZOOM);
    const rail = ["interpolate", ["linear"], ["zoom"], 9, 2.2, 14, 5.0, 17, 8.0];
    const width = map.getLayer(GO_BUS_LINE_LAYER).paint["line-width"];
    for (const zoom of [7, 9, 12, 14, 17]) assert.ok(evaluate(width, zoom) < evaluate(rail, zoom), `thinner at ${zoom}`);
  });

  it("are GO green and dashed, a constant never taken from data, apart from TTC bus ids", () => {
    const map = createMockMap(BASE);
    installGoBusLayers(map, catalog, { dark: false, activeFilteredLine: null });
    installBusLayers(map, { features: [] }, { dark: false, activeFilteredLine: null });
    const paint = map.getLayer(GO_BUS_LINE_LAYER).paint;
    assert.equal(paint["line-color"], GO_BUS_LINE_COLOR);
    assert.equal(GO_BUS_LINE_COLOR, "#00853E");
    assert.equal(map.getLayer(BUS_LINE_LAYER).paint["line-color"], "#ED1C24", "TTC buses keep TTC red");
    const dark = createMockMap(BASE);
    installGoBusLayers(dark, catalog, { dark: true, activeFilteredLine: null });
    assert.equal(dark.getLayer(GO_BUS_LINE_LAYER).paint["line-color"], "#3CC47A", "lifted on the dark map");
    assert.ok(paint["line-dasharray"].every((n) => typeof n === "number"));
    assert.notEqual(GO_BUS_LINE_LAYER, BUS_LINE_LAYER);
    assert.equal(map.sources["transit-go-bus-corridors"].data.features[0].properties.badgeImage, "go-bus-badges:19,27");
  });

  it("dim with a filtered line, take stop presses, and remove cleanly", () => {
    const map = createMockMap(BASE);
    installGoBusLayers(map, catalog, { dark: false, activeFilteredLine: null });
    installGoBusStopLayers(map, stops, { activeFilteredLine: null, selectedStopCode: "00008" });
    assert.ok(hasGoBusLayers(map) && hasGoBusStopLayers(map));
    assert.equal(goBusStopCodeAtPoint(map, { x: 1, y: 1 }), "00008");
    updateGoBusFilter(map, "regional-lw");
    const line = map.paint.find((entry) => entry.layer === GO_BUS_LINE_LAYER && entry.property === "line-opacity");
    assert.equal(evaluate(line.value, 10), 0.25);
    removeGoBusLayers(map);
    assert.deepEqual(ids(map), BASE);
    assert.deepEqual(Object.keys(map.sources), []);
  });
});

describe("GO bus catalog helpers", () => {
  it("keeps its own off-by-default preference, apart from TTC buses", () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    assert.equal(readGoBusLayerPreference(storage), false);
    writeGoBusLayerPreference(storage, true);
    assert.equal(store.get(GO_BUS_LAYER_STORAGE_KEY), "on");
    assert.notEqual(GO_BUS_LAYER_STORAGE_KEY, BUS_LAYER_STORAGE_KEY);
    assert.equal(readGoBusLayerPreference({ getItem: () => { throw new Error("blocked"); } }), false);
  });

  it("names badge images apart from TTC ones and lists card rows in GO colours", () => {
    assert.deepEqual(goBusBadgeRoutes(goBusBadgeImageId(["19", "27"])), ["19", "27"]);
    assert.equal(busBadgeRoutes(goBusBadgeImageId(["19"])), null);
    assert.equal(goBusBadgeRoutes("bus-badges:29"), null);
    assert.deepEqual(goBusCardRows(catalog, ["19", "99"]), [
      { route: "19", name: "Mississauga / North York", color: "#f57f25", textColor: "#000000", replacementBuses: false },
    ]);
  });

  it("finds a stop by number, and the nearest stop on the pressed routes", () => {
    assert.equal(goBusStopByCode(stops, "00132").properties.name, "Square One");
    assert.equal(goBusStopByCode(stops, "132"), null);
    assert.equal(nearestGoBusStop(stops, [-79.412, 43.7618], ["27"]).stop.properties.stopCode, "00008");
    assert.equal(nearestGoBusStop(stops, [-79.6, 43.6], ["27"]), null, "Square One is not on the 27");
  });

  it("matches the generated asset", () => {
    const asset = JSON.parse(readFileSync(new URL("../public/assets/linewatch/geographic/go-surface-bus.json", import.meta.url), "utf8"));
    const stopAsset = JSON.parse(readFileSync(new URL("../public/assets/linewatch/geographic/go-surface-bus-stops.json", import.meta.url), "utf8"));
    assert.equal(asset.network, "regional");
    assert.equal(asset.layer, "go-bus");
    assert.ok(asset.features.length > 100);
    assert.ok(asset.features.every((feature) => feature.properties.routes.length > 0));
    assert.ok(stopAsset.features.every((feature) => /^\d{5}$/.test(feature.properties.stopCode)), "GO stop numbers, never rail station codes");
    const drawn = new Set(asset.features.flatMap((feature) => feature.properties.routes));
    for (const route of asset.routes) assert.equal(route.drawn, drawn.has(route.route), route.route);
  });
});

describe("GO bus stop departures", () => {
  const data = {
    networkId: "regional",
    stopCode: "00008",
    stopName: "Yonge St. @ Sheppard Ave.",
    routes: ["19", "27"],
    availability: "available",
    message: null,
    generatedAt: "2026-11-03T14:00:00Z",
    sourceUpdatedAt: "2026-11-03T14:00:00Z",
    source: "Metrolinx GO Next Service",
    horizonMinutes: 120,
    departures: [
      { route: "19", routeName: "Mississauga / North York", destination: "Square One", minutes: 12, at: "2026-11-03T14:12:30Z", predictedAt: "2026-11-03T14:12:30Z", scheduledAt: "2026-11-03T14:10:00Z", bayPlatform: "", tripId: "19001", status: "live" },
      { route: "19", routeName: "Mississauga / North York", destination: "Square One", minutes: 40, at: "2026-11-03T14:40:00Z", predictedAt: null, scheduledAt: "2026-11-03T14:40:00Z", bayPlatform: "", tripId: "19003", status: "scheduled" },
    ],
  };

  it("groups by route and keeps each time's status", () => {
    const groups = goBusStopGroups(data);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].arrivals.map((arrival) => arrival.status), ["live", "scheduled"]);
    assert.equal(groups[0].arrivals[1].predictedAt, null);
    assert.equal(groups[0].arrivals[1].source, "GO published schedule");
  });

  it("names the source honestly", () => {
    assert.equal(goBusStopSourceLine(data), "Metrolinx live estimates + GO schedule");
    assert.equal(goBusStopSourceLine({ ...data, departures: [data.departures[1]] }), "GO schedule · no live estimates here now");
    assert.equal(goBusStopSourceLine({ availability: "disabled", departures: [] }), "GO bus stop departures turned off");
    assert.equal(goBusStopSourceLine({ availability: "unavailable", departures: [] }), "GO bus departures unavailable");
    assert.match(goBusStopDisclaimer(120), /next 2 hours.*do not affect GO\/UP train status/);
  });

  it("reads the endpoint and tells a missing stop from a failure", async () => {
    const calls = [];
    const fetcher = async (url) => {
      calls.push(url);
      if (url.includes("/99999/")) return new Response("", { status: 404 });
      if (url.includes("/00132/")) return new Response("", { status: 503 });
      return Response.json(data);
    };
    assert.equal((await getGoBusStopDepartures("00008", { fetcher, apiBaseUrl: "http://api.test" })).kind, "ok");
    assert.equal((await getGoBusStopDepartures("99999", { fetcher, apiBaseUrl: "http://api.test" })).kind, "not-found");
    assert.equal((await getGoBusStopDepartures("00132", { fetcher, apiBaseUrl: "http://api.test" })).kind, "error");
    assert.ok(calls[0].endsWith("/api/regional/bus-stops/00008/departures"));
  });
});
