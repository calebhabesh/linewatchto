import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createExpression } from "@maplibre/maplibre-gl-style-spec";

import {
  STREETCAR_OFF_ROUTE_METERS,
  distanceToStreetcarRoute,
  getStreetcarPositions,
  streetcarAgeLabel,
  streetcarPositionsDelayMs,
  streetcarVehicleAgeSeconds,
  streetcarVehicleFeatures,
  streetcarVehicleState,
  streetcarVehicleStatusLabel,
} from "../src/app/streetcar-positions.ts";
import {
  STREETCAR_VEHICLE_HALO_LAYER,
  STREETCAR_VEHICLE_LABEL_LAYER,
  STREETCAR_VEHICLE_LAYER,
  STREETCAR_VEHICLE_MIN_ZOOM,
  STREETCAR_VEHICLE_SOURCE,
  installStreetcarVehicleLayers,
  streetcarVehicleImageId,
  updateStreetcarVehicleFilter,
} from "../src/components/geographic-streetcar-vehicles.ts";
import { STREETCAR_LINE_LAYER, STREETCAR_STOP_LAYER } from "../src/components/geographic-streetcar-layers.ts";
import { getGeographicDefaultZoom } from "../src/app/geographic-config.ts";
import { streetcarVehicleCardSize } from "../src/components/map-chooser-layout.ts";

const catalog = {
  type: "FeatureCollection",
  schemaVersion: "1.0.0",
  network: "ttc",
  layer: "streetcar",
  source: { feedStartDate: "2026-11-01", feedEndDate: "2026-12-19" },
  routes: [
    { route: "504", name: "King", color: "#ED1C24", textColor: "#FFFFFF", drawn: true, weekdayTrips: { streetcar: 270, shortTurn: 4, replacementBus: 415 } },
    { route: "510", name: "Spadina", color: "#ED1C24", textColor: "#FFFFFF", drawn: true, weekdayTrips: { streetcar: 438, shortTurn: 0, replacementBus: 0 } },
  ],
  features: [
    // King St, west to east along one latitude.
    { type: "Feature", id: "c1", geometry: { type: "LineString", coordinates: [[-79.42, 43.644], [-79.38, 43.644]] }, properties: { featureType: "streetcar-corridor", routes: ["504"] } },
    // Spadina, south to north.
    { type: "Feature", id: "c2", geometry: { type: "LineString", coordinates: [[-79.396, 43.64], [-79.396, 43.66]] }, properties: { featureType: "streetcar-corridor", routes: ["510"] } },
  ],
};

function vehicle(overrides = {}) {
  return {
    vehicleId: "4508",
    route: "504",
    routeName: "King",
    destination: "East - 504 King towards Broadview Station",
    latitude: 43.6441,
    longitude: -79.4,
    bearing: 90,
    reportedAt: "2026-11-02T22:00:00Z",
    ageSeconds: 40,
    stale: false,
    ...overrides,
  };
}

function read(vehicles, overrides = {}) {
  return {
    receivedAt: 1_000_000,
    data: {
      networkId: "ttc",
      state: "live",
      source: "TTC GTFS-RT vehicle positions",
      generatedAt: "2026-11-02T22:00:40Z",
      sourceUpdatedAt: "2026-11-02T22:00:20Z",
      maxSourceAgeSeconds: 120,
      vehicleStaleAfterSeconds: 120,
      vehicleMaxAgeSeconds: 300,
      refreshSeconds: 15,
      vehicles,
      ...overrides,
    },
  };
}

describe("streetcar position ages", () => {
  it("grow from the served age by the time since the read arrived", () => {
    const current = read([vehicle()]);
    assert.equal(streetcarVehicleAgeSeconds(vehicle(), current, 1_000_000), 40);
    assert.equal(streetcarVehicleAgeSeconds(vehicle(), current, 1_030_000), 70);
    // A clock that steps backwards never makes a report younger than served.
    assert.equal(streetcarVehicleAgeSeconds(vehicle(), current, 990_000), 40);
  });

  it("turn a car stale after its limit and drop it after the maximum, without a new read", () => {
    const current = read([vehicle()]);
    assert.equal(streetcarVehicleState(vehicle(), current, 1_000_000), "live");
    assert.equal(streetcarVehicleState(vehicle(), current, 1_000_000 + 81_000), "stale");
    assert.equal(streetcarVehicleState(vehicle(), current, 1_000_000 + 261_000), "expired");
  });

  it("are stale whenever the server says so or the source is stale", () => {
    assert.equal(streetcarVehicleState(vehicle({ stale: true }), read([]), 1_000_000), "stale");
    assert.equal(streetcarVehicleState(vehicle(), read([], { state: "stale" }), 1_000_000), "stale");
  });

  it("read as live GPS with an age, or stale with the last report", () => {
    assert.equal(streetcarAgeLabel(8.9), "8 s ago");
    assert.equal(streetcarAgeLabel(61), "1 min ago");
    assert.equal(streetcarVehicleStatusLabel("live", 40), "Live GPS · 40 s ago");
    assert.equal(streetcarVehicleStatusLabel("stale", 185), "Stale · Last Report 3 min ago");
  });
});

describe("streetcar position features", () => {
  it("draw live and stale cars, leave out expired ones, and keep the heading", () => {
    const current = read([
      vehicle(),
      vehicle({ vehicleId: "4510", ageSeconds: 150 }),
      vehicle({ vehicleId: "4512", ageSeconds: 310 }),
      vehicle({ vehicleId: "4514", bearing: null }),
    ]);
    const features = streetcarVehicleFeatures(current, catalog, 1_000_000, "4510").features;
    assert.deepEqual(features.map((feature) => [feature.properties.key, feature.properties.state]), [
      ["4508", "live"], ["4510", "stale"], ["4514", "live"],
    ]);
    assert.equal(features[0].properties.bearing, 90);
    assert.equal(features[2].properties.bearing, -1);
    assert.equal(features[1].properties.selected, true);
    assert.equal(features[0].properties.night, false);
    assert.deepEqual(features[0].geometry.coordinates, [-79.4, 43.6441]);
  });

  it("draw nothing for a disabled or unavailable source", () => {
    assert.equal(streetcarVehicleFeatures(read([vehicle()], { state: "disabled" }), catalog, 1_000_000).features.length, 0);
    assert.equal(streetcarVehicleFeatures(read([vehicle()], { state: "unavailable" }), catalog, 1_000_000).features.length, 0);
    assert.equal(streetcarVehicleFeatures(null, catalog, 1_000_000).features.length, 0);
  });

  it("flag a car off its route's drawn line, not one on another route's line", () => {
    // 11 m from King: on route.
    assert.ok(distanceToStreetcarRoute(catalog, "504", [-79.4, 43.6441]) < 20);
    // On Spadina but on a 504 trip, ~440 m from King: off its mapped route.
    const offKing = [-79.396, 43.648];
    assert.ok(distanceToStreetcarRoute(catalog, "504", offKing) > STREETCAR_OFF_ROUTE_METERS);
    assert.ok(distanceToStreetcarRoute(catalog, "510", offKing) < 1);
    assert.equal(distanceToStreetcarRoute(catalog, "503", offKing), Infinity);
    const features = streetcarVehicleFeatures(read([
      vehicle(),
      vehicle({ vehicleId: "4520", latitude: offKing[1], longitude: offKing[0] }),
    ]), catalog, 1_000_000).features;
    assert.deepEqual(features.map((feature) => feature.properties.offRoute), [false, true]);
  });
});

describe("streetcar position reads", () => {
  it("ask without caching and stamp when the read arrived", async () => {
    let asked;
    const result = await getStreetcarPositions({
      apiBaseUrl: "http://api.test",
      now: () => 42,
      fetcher: async (url, init) => {
        asked = { url, init };
        return new Response(JSON.stringify(read([vehicle()]).data), { status: 200 });
      },
    });
    assert.equal(result.kind, "ok");
    assert.equal(result.read.receivedAt, 42);
    assert.equal(asked.url, "http://api.test/api/surface/streetcars/positions");
    assert.equal(asked.init.cache, "no-store");
    const failed = await getStreetcarPositions({ fetcher: async () => new Response("", { status: 503 }) });
    assert.equal(failed.kind, "error");
  });

  it("follow the server's cadence, back off on errors and stop when the source is disabled", () => {
    assert.equal(streetcarPositionsDelayMs({ kind: "ok", read: read([]) }), 15_000);
    assert.equal(streetcarPositionsDelayMs({ kind: "ok", read: read([], { state: "unavailable" }) }), 60_000);
    assert.equal(streetcarPositionsDelayMs({ kind: "ok", read: read([], { state: "disabled" }) }), null);
    assert.equal(streetcarPositionsDelayMs({ kind: "error" }), 30_000);
  });
});

function createMockMap(existingLayers = []) {
  const sources = {};
  const layers = existingLayers.map((id) => ({ id }));
  const paint = [];
  return {
    sources,
    layers,
    paint,
    getSource: (id) => sources[id],
    addSource: (id, config) => {
      sources[id] = { ...config, setData: (data) => { sources[id].data = data; } };
    },
    getLayer: (id) => layers.find((layer) => layer.id === id),
    addLayer: (layer, beforeId) => {
      const index = beforeId ? layers.findIndex((l) => l.id === beforeId) : -1;
      if (index >= 0) layers.splice(index, 0, layer);
      else layers.push(layer);
    },
    hasImage: () => false,
    addImage: () => {},
    removeImage: () => {},
    setPaintProperty: (layer, property, value) => paint.push({ layer, property, value }),
  };
}

describe("streetcar vehicle layers", () => {
  it("sit above the streetcar lines and stop pills and under station markers, from the default view", () => {
    const map = createMockMap([STREETCAR_LINE_LAYER, STREETCAR_STOP_LAYER, "transit-stations-outer", "transit-station-labels"]);
    installStreetcarVehicleLayers(map, { dark: true, activeFilteredLine: null });
    installStreetcarVehicleLayers(map, { dark: true, activeFilteredLine: null });
    const ids = map.layers.map((layer) => layer.id);
    assert.deepEqual(ids, [
      STREETCAR_LINE_LAYER, STREETCAR_STOP_LAYER,
      STREETCAR_VEHICLE_HALO_LAYER, STREETCAR_VEHICLE_LAYER, STREETCAR_VEHICLE_LABEL_LAYER,
      "transit-stations-outer", "transit-station-labels",
    ]);
    assert.ok(STREETCAR_VEHICLE_MIN_ZOOM <= getGeographicDefaultZoom("ttc"));
    assert.equal(map.sources[STREETCAR_VEHICLE_SOURCE].data.features.length, 0);
  });

  it("choose a hollow image for stale cars and a plain one without a heading", () => {
    const map = createMockMap(["transit-stations-outer"]);
    installStreetcarVehicleLayers(map, { dark: false, activeFilteredLine: null });
    const layer = map.layers.find((item) => item.id === STREETCAR_VEHICLE_LAYER);
    const image = createExpression(layer.layout["icon-image"], { type: "resolvedImage", expression: { parameters: ["zoom", "feature"] } }, "layers[0].layout.icon-image");
    assert.equal(image.result, "success");
    const evaluate = (properties) => image.value.evaluate({ zoom: 13 }, { type: "Point", properties });
    assert.equal(String(evaluate({ state: "live", bearing: 90 })), streetcarVehicleImageId("live", true));
    assert.equal(String(evaluate({ state: "stale", bearing: -1 })), streetcarVehicleImageId("stale", false));
    assert.equal(String(evaluate({ state: "live", bearing: 10, night: true })), streetcarVehicleImageId("live", true, true));
    const opacity = createExpression(layer.paint["icon-opacity"], { type: "number", expression: { interpolated: true, parameters: ["zoom", "feature"] } }, "layers[0].paint.icon-opacity");
    assert.equal(opacity.value.evaluate({ zoom: 13 }, { type: "Point", properties: { state: "stale" } }), 0.6);
  });

  it("dim with the streetcar lines while a subway line is filtered", () => {
    const map = createMockMap(["transit-stations-outer"]);
    installStreetcarVehicleLayers(map, { dark: true, activeFilteredLine: null });
    updateStreetcarVehicleFilter(map, "line-1");
    assert.deepEqual(map.paint.map((entry) => entry.layer), [STREETCAR_VEHICLE_LAYER, STREETCAR_VEHICLE_LABEL_LAYER]);
  });

  it("size the card for the off-route note and the next-stop button", () => {
    const plain = streetcarVehicleCardSize(1440, { offRoute: false, withStop: false });
    const full = streetcarVehicleCardSize(1440, { offRoute: true, withStop: true });
    assert.equal(plain.width, 300);
    assert.ok(full.height > plain.height);
    assert.ok(streetcarVehicleCardSize(360, { offRoute: true, withStop: true }).width <= 328);
  });
});
