import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createExpression } from "@maplibre/maplibre-gl-style-spec";

import {
  BUS_BADGE_LAYER,
  BUS_CASING_LAYER,
  BUS_HIT_LAYER,
  BUS_LINE_LAYER,
  BUS_STOP_DOT_LAYER,
  BUS_STOP_LAYER,
  addMissingBusBadgeImage,
  busStopCodeAtPoint,
  hasBusLayers,
  hasBusStopLayers,
  installBusLayers,
  installBusStopLayers,
  removeBusLayers,
  removeBusStopLayers,
  updateBusFilter,
  updateBusStopSelection,
} from "../src/components/geographic-bus-layers.ts";
import {
  STREETCAR_BADGE_LAYER,
  STREETCAR_CASING_LAYER,
  STREETCAR_LINE_LAYER,
  STREETCAR_STOP_DOT_LAYER,
  STREETCAR_STOP_LAYER,
  installStreetcarLayers,
  removeStreetcarLayers,
} from "../src/components/geographic-streetcar-layers.ts";
import { STREETCAR_VEHICLE_HALO_LAYER, installStreetcarVehicleLayers } from "../src/components/geographic-streetcar-vehicles.ts";
import { installTransitLayers } from "../src/components/geographic-map-operations.ts";
import {
  STREETCAR_POSITIONS_STORAGE_KEY,
  STREETCAR_ROUTES_STORAGE_KEY,
  readLayerPreference,
  writeLayerPreference,
} from "../src/app/map-view-layers.ts";
import {
  BUS_BADGE_MIN_ZOOM,
  BUS_LAYER_STORAGE_KEY,
  BUS_STOP_MIN_ZOOM,
  busBadgeImageId,
  busBadgeRoutes,
  busCardRows,
  busStopByCode,
  cachedBusCatalog,
  loadBusCatalog,
  nearestBusStop,
  readBusLayerPreference,
  writeBusLayerPreference,
} from "../src/app/geographic-bus-catalog.ts";
import { STREETCAR_BADGE_MIN_ZOOM } from "../src/app/geographic-surface-catalog.ts";
import { getGeographicDefaultZoom } from "../src/app/geographic-config.ts";

globalThis.window = globalThis;

const busCatalog = {
  type: "FeatureCollection",
  schemaVersion: "1.0.0",
  network: "ttc",
  layer: "bus",
  source: { feedStartDate: "2026-11-01", feedEndDate: "2026-12-19" },
  routes: [
    { route: "29", name: "Dufferin", color: "#ED1C24", textColor: "#FFFFFF", drawn: true, weekdayTrips: { bus: 600, shortTurn: 0 } },
    { route: "929", name: "Dufferin Express", color: "#00A651", textColor: "#FFFFFF", drawn: true, weekdayTrips: { bus: 300, shortTurn: 0 } },
  ],
  features: [
    { type: "Feature", id: "b1", geometry: { type: "LineString", coordinates: [[-79.4335, 43.64], [-79.4335, 43.66]] }, properties: { featureType: "bus-corridor", routes: ["29", "929"] } },
  ],
};

const busStops = {
  type: "FeatureCollection",
  schemaVersion: "1.0.0",
  network: "ttc",
  layer: "bus-stops",
  source: busCatalog.source,
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [-79.4335, 43.65] }, properties: { featureType: "bus-stop", stopCode: "2040", name: "Dufferin St at Dufferin Park Ave", routes: ["29", "929"] } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-79.4335, 43.6555] }, properties: { featureType: "bus-stop", stopCode: "11630", name: "Dufferin Mall", routes: ["29"] } },
    // A shared pole the streetcar layer already draws.
    { type: "Feature", geometry: { type: "Point", coordinates: [-79.4336, 43.6488] }, properties: { featureType: "bus-stop", stopCode: "9037", name: "Dufferin St at Queen St", routes: ["29"] } },
  ],
};

const streetcarCatalog = {
  type: "FeatureCollection",
  schemaVersion: "1.0.0",
  network: "ttc",
  layer: "streetcar",
  source: { feedStartDate: "2026-11-01", feedEndDate: "2026-12-19" },
  routes: [{ route: "501", name: "Queen", color: "#ED1C24", textColor: "#FFFFFF", drawn: true, weekdayTrips: { streetcar: 1, shortTurn: 0, replacementBus: 0 } }],
  features: [
    { type: "Feature", id: "c1", geometry: { type: "LineString", coordinates: [[-79.44, 43.6488], [-79.42, 43.6488]] }, properties: { featureType: "streetcar-corridor", routes: ["501"] } },
    { type: "Feature", id: "s1", geometry: { type: "Point", coordinates: [-79.4336, 43.6488] }, properties: { featureType: "streetcar-stop", stopId: "1", stopCode: "9037", name: "Queen St West at Dufferin St", routes: ["501"] } },
  ],
};

function createMockMap(existingLayers = []) {
  const sources = {};
  const layers = existingLayers.map((id) => ({ id }));
  const paint = [];
  const images = new Map();
  return {
    sources,
    layers,
    paint,
    images,
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
    moveLayer: () => {},
    hasImage: (id) => images.has(id),
    addImage: (id, image) => images.set(id, image),
    removeImage: (id) => images.delete(id),
    setFilter: (layer, filter) => { layers.find((item) => item.id === layer).filter = filter; },
    setPaintProperty: (layer, property, value) => paint.push({ layer, property, value }),
    setLayoutProperty: (layer, property, value) => {
      const target = layers.find((item) => item.id === layer);
      target.layout = { ...target.layout, [property]: value };
    },
    queryRenderedFeatures: (_box, options) => (options.layers.includes(BUS_STOP_LAYER)
      ? [{ properties: { stopCode: "2040" } }]
      : []),
    getPaintProperty: () => undefined,
    getStyle: () => ({ layers }),
  };
}

function evaluate(expression, zoom) {
  const compiled = createExpression(expression, { type: "number", expression: { interpolated: true, parameters: ["zoom"] } });
  assert.equal(compiled.result, "success", JSON.stringify(compiled.value));
  return compiled.value.evaluateWithoutErrorHandling({ zoom, globalState: {} }, { properties: {} });
}

const ids = (map) => map.layers.map((layer) => layer.id);
const BASE = ["transit-routes-casing", "transit-routes", "transit-stations-outer", "transit-station-labels"];
const streetcarCodes = new Set(["9037"]);

describe("bus layers on the Map View (plan 13, S5)", () => {
  it("draw under the streetcars and the subway, whichever installs first", () => {
    for (const streetcarsFirst of [true, false]) {
      const map = createMockMap(BASE);
      if (streetcarsFirst) installStreetcarLayers(map, streetcarCatalog, { dark: false, activeFilteredLine: null });
      installBusLayers(map, busCatalog, { dark: false, activeFilteredLine: null });
      installBusStopLayers(map, busStops, { activeFilteredLine: null, streetcarStopCodes: streetcarCodes });
      if (!streetcarsFirst) installStreetcarLayers(map, streetcarCatalog, { dark: false, activeFilteredLine: null });
      const order = ids(map);
      const at = (id) => order.indexOf(id);
      for (const id of [BUS_CASING_LAYER, BUS_LINE_LAYER, BUS_HIT_LAYER]) {
        assert.ok(at(id) < at(STREETCAR_CASING_LAYER), `${id} under the streetcar lines (${streetcarsFirst})`);
        assert.ok(at(id) < at("transit-routes-casing"), `${id} under the subway`);
      }
      assert.ok(at(BUS_BADGE_LAYER) < at(STREETCAR_BADGE_LAYER), "bus badges under streetcar badges");
      assert.ok(at(BUS_STOP_LAYER) < at(STREETCAR_STOP_DOT_LAYER), "bus stops under streetcar stops");
      assert.ok(at(BUS_STOP_LAYER) < at(STREETCAR_STOP_LAYER));
      assert.ok(at(BUS_STOP_LAYER) < at("transit-stations-outer"));
      assert.ok(at(STREETCAR_LINE_LAYER) < at("transit-routes-casing"));
    }
  });

  it("draw at every zoom once on, thinner than streetcars, badges after theirs", () => {
    const map = createMockMap(BASE);
    installBusLayers(map, busCatalog, { dark: true, activeFilteredLine: null });
    installBusStopLayers(map, busStops, { activeFilteredLine: null, streetcarStopCodes: streetcarCodes });
    for (const id of [BUS_CASING_LAYER, BUS_LINE_LAYER, BUS_HIT_LAYER]) {
      assert.equal(map.getLayer(id).minzoom, undefined, `${id} draws at the default view`);
    }
    assert.ok(BUS_BADGE_MIN_ZOOM > getGeographicDefaultZoom("ttc"));
    assert.equal(map.getLayer(BUS_BADGE_LAYER).minzoom, BUS_BADGE_MIN_ZOOM);
    assert.ok(BUS_BADGE_MIN_ZOOM > STREETCAR_BADGE_MIN_ZOOM);
    assert.equal(map.getLayer(BUS_STOP_LAYER).minzoom, BUS_STOP_MIN_ZOOM);
    const streetcar = ["interpolate", ["linear"], ["zoom"], 9, 1.1, 12, 1.8, 14, 2.6, 17, 4.6];
    const width = map.getLayer(BUS_LINE_LAYER).paint["line-width"];
    for (const zoom of [9, getGeographicDefaultZoom("ttc"), 12, 14, 17]) assert.ok(evaluate(width, zoom) < evaluate(streetcar, zoom), `thinner at ${zoom}`);
  });

  it("are TTC red and dashed, a constant never taken from data", () => {
    const map = createMockMap(BASE);
    installBusLayers(map, busCatalog, { dark: false, activeFilteredLine: null });
    const paint = map.getLayer(BUS_LINE_LAYER).paint;
    assert.equal(paint["line-color"], "#ED1C24");
    assert.ok(Array.isArray(paint["line-dasharray"]) && paint["line-dasharray"].every((n) => typeof n === "number"));
  });

  it("stay under live cars when the cars were drawn first", () => {
    const map = createMockMap(BASE);
    installStreetcarVehicleLayers(map, { dark: false, activeFilteredLine: null });
    installBusLayers(map, busCatalog, { dark: false, activeFilteredLine: null });
    installBusStopLayers(map, busStops, { activeFilteredLine: null, streetcarStopCodes: new Set() });
    installStreetcarLayers(map, streetcarCatalog, { dark: false, activeFilteredLine: null });
    const order = ids(map);
    for (const id of [BUS_BADGE_LAYER, BUS_STOP_LAYER, STREETCAR_BADGE_LAYER, STREETCAR_STOP_LAYER]) {
      assert.ok(order.indexOf(id) < order.indexOf(STREETCAR_VEHICLE_HALO_LAYER), `${id} under the cars`);
    }
    removeBusStopLayers(map);
    assert.equal(hasBusStopLayers(map), false);
    assert.ok(hasBusLayers(map), "the lines stay");
    assert.equal(map.getSource("transit-bus-stops"), undefined);
  });

  it("leave shared poles to the streetcar stop labels", () => {
    const map = createMockMap(BASE);
    installBusLayers(map, busCatalog, { dark: false, activeFilteredLine: null });
    installBusStopLayers(map, busStops, { activeFilteredLine: null, streetcarStopCodes: streetcarCodes });
    const codes = map.sources["transit-bus-stops"].data.features.map((feature) => feature.properties.stopCode);
    assert.deepEqual(codes, ["2040", "11630"]);
  });

  it("install stops only with the lines, are idempotent, and come off completely", () => {
    const map = createMockMap(BASE);
    installBusStopLayers(map, busStops, { activeFilteredLine: null, streetcarStopCodes: streetcarCodes });
    assert.equal(hasBusStopLayers(map), false, "no stops without the lines");
    installBusLayers(map, busCatalog, { dark: false, activeFilteredLine: null });
    installBusLayers(map, busCatalog, { dark: false, activeFilteredLine: null });
    installBusStopLayers(map, busStops, { activeFilteredLine: null, selectedStopCodes: ["2040"], streetcarStopCodes: streetcarCodes });
    installBusStopLayers(map, busStops, { activeFilteredLine: null, selectedStopCodes: ["2040"], streetcarStopCodes: streetcarCodes });
    assert.ok(hasBusLayers(map) && hasBusStopLayers(map));
    assert.equal(ids(map).length, BASE.length + 6);
    removeBusLayers(map);
    assert.deepEqual(ids(map), BASE);
    assert.deepEqual(Object.keys(map.sources), []);
  });

  it("leave the open stop to the selection layer, take presses, and dim with a filtered subway line", () => {
    const map = createMockMap(BASE);
    installBusLayers(map, busCatalog, { dark: false, activeFilteredLine: null });
    installBusStopLayers(map, busStops, { activeFilteredLine: null, selectedStopCodes: ["2040"], streetcarStopCodes: streetcarCodes });
    assert.deepEqual(map.getLayer(BUS_STOP_LAYER).filter, ["!", ["in", ["get", "stopCode"], ["literal", ["2040"]]]]);
    updateBusStopSelection(map, []);
    assert.equal(map.getLayer(BUS_STOP_LAYER).filter, null);
    assert.equal(busStopCodeAtPoint(map, { x: 10, y: 10 }), "2040");
    updateBusFilter(map, "line-1");
    const line = map.paint.find((call) => call.layer === BUS_LINE_LAYER && call.property === "line-opacity");
    assert.equal(evaluate(line.value, 13), 0.25);
  });

  it("draw a badge row only when the map asks for it, and leave other images alone", () => {
    const map = createMockMap(BASE);
    assert.equal(addMissingBusBadgeImage(map, "overlap-badge:x"), false);
    assert.equal(addMissingBusBadgeImage(map, busBadgeImageId(["29", "929"])), true);
    assert.deepEqual(busBadgeRoutes("bus-badges:29,929"), ["29", "929"]);
    assert.equal(busBadgeRoutes("streetcar-badges:501"), null);
    installBusLayers(map, busCatalog, { dark: false, activeFilteredLine: null });
    assert.equal(map.sources["transit-bus-corridors"].data.features[0].properties.badgeImage, "bus-badges:29,929");
  });
});

describe("bus catalog helpers", () => {
  it("remember the toggle per device, off unless stored on", () => {
    const store = new Map();
    const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
    assert.equal(readBusLayerPreference(storage), false);
    writeBusLayerPreference(storage, true);
    assert.equal(store.get(BUS_LAYER_STORAGE_KEY), "on");
    assert.equal(readBusLayerPreference(storage), true);
    writeBusLayerPreference(storage, false);
    assert.equal(readBusLayerPreference(storage), false);
    assert.equal(readBusLayerPreference({ getItem: () => { throw new Error("blocked"); } }), false);
    assert.equal(readBusLayerPreference(null), false);
  });

  it("find a stop by pole number and the nearest stop on a line's routes", () => {
    assert.equal(busStopByCode(busStops, "11630")?.properties.name, "Dufferin Mall");
    assert.equal(busStopByCode(busStops, "1"), null);
    assert.equal(nearestBusStop(busStops, [-79.4335, 43.6501], ["929"])?.stop.properties.stopCode, "2040");
    assert.equal(nearestBusStop(busStops, [-79.4335, 43.6555], ["929"], 100), null, "929 does not stop at 11630");
  });

  it("list a corridor's routes for the card and load the corridors once", async () => {
    assert.deepEqual(busCardRows(busCatalog, ["29", "929", "999"]).map((row) => row.route), ["29", "929"]);
    let requests = 0;
    globalThis.fetch = async () => {
      requests += 1;
      return { ok: true, json: async () => busCatalog };
    };
    await Promise.all([loadBusCatalog(), loadBusCatalog()]);
    assert.equal(requests, 1);
    assert.equal(cachedBusCatalog(), busCatalog);
  });
});

describe("Map View layer switches", () => {
  it("default streetcars on and remember each switch", () => {
    const store = new Map();
    const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
    assert.equal(readLayerPreference(storage, STREETCAR_ROUTES_STORAGE_KEY, true), true);
    assert.equal(readLayerPreference(storage, STREETCAR_POSITIONS_STORAGE_KEY, true), true);
    writeLayerPreference(storage, STREETCAR_ROUTES_STORAGE_KEY, false);
    assert.equal(readLayerPreference(storage, STREETCAR_ROUTES_STORAGE_KEY, true), false);
    assert.equal(readLayerPreference(storage, STREETCAR_POSITIONS_STORAGE_KEY, true), true, "switches are independent");
    store.set(STREETCAR_POSITIONS_STORAGE_KEY, "garbage");
    assert.equal(readLayerPreference(storage, STREETCAR_POSITIONS_STORAGE_KEY, true), true);
  });

  it("streetcar routes come off completely and a style reinstall honours the switch", async () => {
    const map = createMockMap(BASE);
    installStreetcarLayers(map, streetcarCatalog, { dark: false, activeFilteredLine: null });
    removeStreetcarLayers(map);
    assert.deepEqual(ids(map), BASE);
    assert.deepEqual(Object.keys(map.sources), []);

    globalThis.fetch = async () => ({ ok: true, json: async () => streetcarCatalog });
    const { loadStreetcarCatalog } = await import("../src/app/geographic-surface-catalog.ts");
    await loadStreetcarCatalog();
    const subway = {
      features: [
        { type: "Feature", geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] }, properties: { featureType: "link", lineId: "line-1", segmentId: "seg-1", stationAId: "a", stationBId: "b" } },
        { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: { featureType: "station", stationId: "a", lineIds: ["line-1"], name: "A" } },
      ],
    };
    const off = createMockMap();
    installTransitLayers(off, subway, "ttc", false, false, { streetcarRoutes: false });
    assert.equal(off.getLayer(STREETCAR_LINE_LAYER), undefined, "routes stay off");
    assert.ok(off.getLayer("transit-streetcar-vehicles"), "live cars install without the routes");
    const on = createMockMap();
    installTransitLayers(on, subway, "ttc", false, false);
    assert.ok(on.getLayer(STREETCAR_LINE_LAYER), "routes are on by default");
  });
});
