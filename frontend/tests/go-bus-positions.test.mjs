import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  GO_BUS_POSITIONS_PATH,
  GO_BUS_POSITIONS_STORAGE_KEY,
  GO_BUS_VEHICLE_MIN_ZOOM,
  findGoBusVehicle,
  getGoBusPositions,
  goBusPositionsDetail,
  goBusVehicleFeatures,
  goBusVehicleFeaturesSignature,
  goBusVehicleKey,
  goBusVehicleState,
  goBusVehicleStop,
  readGoBusPositionsPreference,
} from "../src/app/go-bus-positions.ts";
import { GO_BUS_BADGE_MIN_ZOOM, GO_BUS_LAYER_STORAGE_KEY } from "../src/app/go-bus-catalog.ts";
import { BUS_POSITIONS_PATH } from "../src/app/bus-positions.ts";
import { streetcarPositionsDelayMs } from "../src/app/streetcar-positions.ts";
import { STREETCAR_POSITIONS_STORAGE_KEY } from "../src/app/map-view-layers.ts";
import {
  GO_BUS_VEHICLE_HALO_LAYER,
  GO_BUS_VEHICLE_LABEL_LAYER,
  GO_BUS_VEHICLE_LAYER,
  GO_BUS_VEHICLE_SOURCE,
  goBusVehicleImageId,
  installGoBusVehicleLayers,
  removeGoBusVehicleLayers,
  updateGoBusVehicleFilter,
} from "../src/components/geographic-go-bus-vehicles.ts";

const bus = (overrides = {}) => ({
  vehicleId: "2551",
  tripId: "20261103-41-41481",
  route: "41",
  destination: "Hamilton GO",
  latitude: 43.256,
  longitude: -79.874,
  reportedAt: "2026-11-03T19:59:40Z",
  ageSeconds: 20,
  stale: false,
  nextStopCode: "01007",
  ...overrides,
});

const read = (vehicles, overrides = {}) => ({
  data: {
    networkId: "regional",
    state: "live",
    source: "Metrolinx GO GTFS-RT VehiclePosition",
    generatedAt: "2026-11-03T20:00:00Z",
    sourceUpdatedAt: "2026-11-03T19:59:55Z",
    maxSourceAgeSeconds: 120,
    vehicleStaleAfterSeconds: 300,
    vehicleMaxAgeSeconds: 900,
    refreshSeconds: 15,
    vehicles,
    ...overrides,
  },
  receivedAt: 1_000_000,
  area: null,
});

describe("GO bus positions", () => {
  it("read their own endpoint for the area asked, never the TTC bus endpoint", async () => {
    const urls = [];
    const result = await getGoBusPositions({
      area: [-79.9, 43.2, -79.7, 43.4],
      apiBaseUrl: "http://api.test",
      now: () => 5,
      fetcher: async (url) => {
        urls.push(String(url));
        return new Response(JSON.stringify(read([bus()]).data), { status: 200 });
      },
    });
    assert.equal(result.kind, "ok");
    assert.equal(result.read.receivedAt, 5);
    assert.deepEqual(urls, [`http://api.test${GO_BUS_POSITIONS_PATH}?bbox=-79.90,43.20,-79.70,43.40`]);
    assert.notEqual(GO_BUS_POSITIONS_PATH, BUS_POSITIONS_PATH);
  });

  it("treat a failed or malformed read as an error, and back off a disabled source", async () => {
    const failed = await getGoBusPositions({ area: null, fetcher: async () => new Response("", { status: 503 }) });
    assert.equal(failed.kind, "error");
    const malformed = await getGoBusPositions({ area: null, fetcher: async () => new Response("{}", { status: 200 }) });
    assert.equal(malformed.kind, "error");
    assert.equal(streetcarPositionsDelayMs({ kind: "ok", read: read([], { state: "disabled" }) }), null);
    assert.equal(streetcarPositionsDelayMs({ kind: "ok", read: read([]) }), 15_000);
  });

  it("turn stale after the GO limit and drop out after the longer one", () => {
    const current = read([bus()]);
    assert.equal(goBusVehicleState(bus(), current, current.receivedAt), "live");
    // 20 s served + 290 s since the read: 310 s, past the 5 min GO limit.
    assert.equal(goBusVehicleState(bus(), current, current.receivedAt + 290_000), "stale");
    assert.equal(goBusVehicleState(bus({ stale: true }), current, current.receivedAt), "stale");
    assert.equal(goBusVehicleState(bus(), read([bus()], { state: "stale" }), current.receivedAt), "stale");
    assert.equal(goBusVehicleState(bus(), current, current.receivedAt + 900_000), "expired");
  });

  it("draw a feature per bus with its state, and only redraw when a state or the selection changes", () => {
    const current = read([bus(), bus({ vehicleId: null, tripId: "t-2", ageSeconds: 400 })]);
    const data = goBusVehicleFeatures(current, current.receivedAt, "vehicle:2551");
    assert.deepEqual(data.features.map((feature) => feature.properties), [
      { key: "vehicle:2551", route: "41", state: "live", selected: true },
      { key: "trip:t-2", route: "41", state: "stale", selected: false },
    ]);
    const later = goBusVehicleFeatures(current, current.receivedAt + 4_000, "vehicle:2551");
    assert.equal(goBusVehicleFeaturesSignature(later), goBusVehicleFeaturesSignature(data));
    assert.equal(goBusVehicleFeatures(read([bus()], { state: "disabled" }), 0).features.length, 0);
    assert.equal(findGoBusVehicle(current, goBusVehicleKey(bus()))?.vehicleId, "2551");
  });

  it("offer the bus's next stop when it is on its route, else the nearest on its route within 1 km", () => {
    const stop = (stopCode, coordinates, routes) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates },
      properties: { featureType: "go-bus-stop", stopCode, name: `Stop ${stopCode}`, routes },
    });
    const stops = {
      features: [
        stop("01007", [-79.80, 43.30], ["41"]),
        stop("02000", [-79.8745, 43.2565], ["41"]),
        stop("03000", [-79.8741, 43.2561], ["12"]),
      ],
    };
    assert.deepEqual(
      [goBusVehicleStop(stops, bus())?.stop.properties.stopCode, goBusVehicleStop(stops, bus())?.next],
      ["01007", true],
    );
    const unknownNext = goBusVehicleStop(stops, bus({ nextStopCode: "99999" }));
    assert.deepEqual([unknownNext?.stop.properties.stopCode, unknownNext?.next], ["02000", false]);
    assert.equal(goBusVehicleStop(stops, bus({ nextStopCode: null, latitude: 44, longitude: -79 })), null);
  });

  it("keep their own switch, on by default, apart from TTC Live GPS and GO bus routes", () => {
    assert.notEqual(GO_BUS_POSITIONS_STORAGE_KEY, STREETCAR_POSITIONS_STORAGE_KEY);
    assert.notEqual(GO_BUS_POSITIONS_STORAGE_KEY, GO_BUS_LAYER_STORAGE_KEY);
    assert.equal(readGoBusPositionsPreference(null), true);
    assert.equal(readGoBusPositionsPreference({ getItem: () => "off" }), false);
    assert.ok(GO_BUS_VEHICLE_MIN_ZOOM <= GO_BUS_BADGE_MIN_ZOOM);
  });

  it("caption the switch with what it shows or why it cannot", () => {
    assert.equal(goBusPositionsDetail(false, true, null), "With GO Buses");
    assert.equal(goBusPositionsDetail(true, true, null), "GO Buses");
    assert.equal(goBusPositionsDetail(true, true, "live"), "GO Buses");
    assert.equal(goBusPositionsDetail(true, true, "disabled"), "Source Off");
    assert.equal(goBusPositionsDetail(true, true, "stale"), "Stale");
    assert.equal(goBusPositionsDetail(true, false, "live"), "GO Buses");
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
    removeImage: () => {},
    setPaintProperty: (layer, property, value) => paint.push({ layer, property, value }),
  };
}

describe("GO bus vehicle layers", () => {
  it("sit under the train markers and stations, from the GO bus zoom, without turning with a heading", () => {
    const map = createMockMap(["transit-go-bus-stops", "transit-train-markers-halo", "transit-stations-outer"]);
    installGoBusVehicleLayers(map, { dark: false, activeFilteredLine: null });
    installGoBusVehicleLayers(map, { dark: false, activeFilteredLine: null });
    const ids = map.layers.map((layer) => layer.id);
    assert.ok(ids.indexOf("transit-go-bus-stops") < ids.indexOf(GO_BUS_VEHICLE_HALO_LAYER));
    assert.ok(ids.indexOf(GO_BUS_VEHICLE_LABEL_LAYER) < ids.indexOf("transit-train-markers-halo"));
    assert.equal(ids.filter((id) => id === GO_BUS_VEHICLE_LAYER).length, 1);
    const layer = map.layers.find((item) => item.id === GO_BUS_VEHICLE_LAYER);
    assert.equal(layer.minzoom, GO_BUS_VEHICLE_MIN_ZOOM);
    assert.equal(layer.layout["icon-rotate"], undefined);
    assert.deepEqual(layer.layout["icon-image"], ["concat", "go-bus-vehicle:", ["get", "state"]]);
    assert.equal(goBusVehicleImageId("stale"), "go-bus-vehicle:stale");
  });

  it("dim while a line is filtered, and go entirely when turned off", () => {
    const map = createMockMap(["transit-stations-outer"]);
    installGoBusVehicleLayers(map, { dark: true, activeFilteredLine: null });
    updateGoBusVehicleFilter(map, "regional-lw");
    assert.deepEqual(map.paint.map((entry) => entry.layer), [GO_BUS_VEHICLE_LAYER, GO_BUS_VEHICLE_LABEL_LAYER]);
    removeGoBusVehicleLayers(map);
    assert.deepEqual(map.layers.map((layer) => layer.id), ["transit-stations-outer"]);
    assert.equal(map.sources[GO_BUS_VEHICLE_SOURCE], undefined);
  });
});
