import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createExpression } from "@maplibre/maplibre-gl-style-spec";

import {
  BUS_OFF_ROUTE_METERS,
  BUS_POSITIONS_PATH,
  BUS_VEHICLE_MIN_ZOOM,
  busPositionsArea,
  busPositionsAreaCovers,
  busVehicleFamily,
  busVehicleFeatures,
  busVehicleFeaturesSignature,
  distanceToBusRoute,
  findBusVehicle,
  getBusPositions,
  isBusOffRoute,
} from "../src/app/bus-positions.ts";
import { streetcarPositionsDelayMs } from "../src/app/streetcar-positions.ts";
import {
  BUS_VEHICLE_HALO_LAYER,
  BUS_VEHICLE_LABEL_LAYER,
  BUS_VEHICLE_LAYER,
  BUS_VEHICLE_SOURCE,
  busVehicleImageId,
  installBusVehicleLayers,
  removeBusVehicleLayers,
  updateBusVehicleFilter,
} from "../src/components/geographic-bus-vehicles.ts";
import {
  STREETCAR_VEHICLE_HALO_LAYER,
  STREETCAR_VEHICLE_LAYER,
  installStreetcarVehicleLayers,
} from "../src/components/geographic-streetcar-vehicles.ts";
import { estimatedTrainsDetail, vehiclePositionsDetail } from "../src/app/map-view-layers.ts";
import { getGeographicDefaultZoom } from "../src/app/geographic-config.ts";
import { streetcarVehicleCardSize } from "../src/components/map-chooser-layout.ts";

const catalog = {
  features: [
    // Dufferin, south to north along one longitude.
    { type: "Feature", id: "b1", geometry: { type: "LineString", coordinates: [[-79.435, 43.64], [-79.435, 43.70]] }, properties: { featureType: "bus-corridor", routes: ["29", "929"] } },
  ],
};

function bus(overrides = {}) {
  return {
    vehicleId: "8100",
    route: "29",
    routeName: "Dufferin",
    destination: "North - 29 Dufferin towards Wilson Station",
    latitude: 43.66,
    longitude: -79.435,
    bearing: 0,
    reportedAt: "2026-11-03T13:00:00Z",
    ageSeconds: 20,
    stale: false,
    replacement: false,
    ...overrides,
  };
}

function read(vehicles, overrides = {}) {
  return {
    receivedAt: 1_000_000,
    area: null,
    data: {
      networkId: "ttc",
      state: "live",
      source: "TTC GTFS-RT vehicle positions",
      generatedAt: "2026-11-03T13:00:20Z",
      sourceUpdatedAt: "2026-11-03T13:00:10Z",
      maxSourceAgeSeconds: 120,
      vehicleStaleAfterSeconds: 120,
      vehicleMaxAgeSeconds: 300,
      refreshSeconds: 15,
      vehicles,
      ...overrides,
    },
  };
}

describe("bus positions read", () => {
  it("asks for the area around the view, rounded outward", async () => {
    const urls = [];
    const fetcher = async (url) => {
      urls.push(String(url));
      return new Response(JSON.stringify(read([bus()]).data), { status: 200 });
    };
    const area = busPositionsArea([-79.40, 43.64, -79.38, 43.66]);
    assert.deepEqual(area, [-79.42, 43.63, -79.36, 43.67]);
    const result = await getBusPositions({ area, fetcher, now: () => 5 });
    assert.equal(result.kind, "ok");
    assert.deepEqual(result.read.area, area);
    assert.equal(result.read.receivedAt, 5);
    assert.ok(urls[0].endsWith(`${BUS_POSITIONS_PATH}?bbox=-79.42,43.63,-79.36,43.67`), urls[0]);
  });

  it("treats a failed or malformed answer as an error and reads again later", async () => {
    const failed = await getBusPositions({ area: null, fetcher: async () => new Response("", { status: 500 }) });
    assert.equal(failed.kind, "error");
    const malformed = await getBusPositions({ area: null, fetcher: async () => new Response("{}", { status: 200 }) });
    assert.equal(malformed.kind, "error");
    assert.equal(streetcarPositionsDelayMs(failed), 30_000);
  });

  it("does not read again while the view stays inside the read area", () => {
    const area = busPositionsArea([-79.40, 43.64, -79.38, 43.66]);
    assert.equal(busPositionsAreaCovers(area, [-79.41, 43.635, -79.37, 43.665]), true);
    assert.equal(busPositionsAreaCovers(area, [-79.43, 43.64, -79.39, 43.66]), false);
    assert.equal(busPositionsAreaCovers(null, [-79.40, 43.64, -79.38, 43.66]), false);
  });

  it("stops asking a disabled source, and slows down when it is unavailable", () => {
    assert.equal(streetcarPositionsDelayMs({ kind: "ok", read: read([], { state: "disabled" }) }), null);
    assert.equal(streetcarPositionsDelayMs({ kind: "ok", read: read([], { state: "unavailable" }) }), 60_000);
    assert.equal(streetcarPositionsDelayMs({ kind: "ok", read: read([bus()]) }), 15_000);
  });
});

describe("bus features", () => {
  it("carry state, heading and the route family colour; expired reports are left out", () => {
    const data = busVehicleFeatures(read([
      bus(),
      bus({ vehicleId: "8101", route: "329", ageSeconds: 130 }),
      bus({ vehicleId: "8102", route: "929", bearing: null }),
      bus({ vehicleId: "6725", route: "503", replacement: true }),
      bus({ vehicleId: "8103", route: "402", ageSeconds: 301 }),
    ]), 1_000_000, "8102");
    assert.deepEqual(data.features.map((feature) => [
      feature.properties.key, feature.properties.state, feature.properties.family,
      feature.properties.bearing, feature.properties.selected,
    ]), [
      ["8100", "live", "regular", 0, false],
      ["8101", "stale", "night", 0, false],
      ["8102", "live", "express", -1, true],
      ["6725", "live", "regular", 0, false],
    ]);
  });

  it("turn stale as their age grows in the browser, and then go", () => {
    const positions = read([bus({ ageSeconds: 100 })]);
    assert.equal(busVehicleFeatures(positions, 1_000_000).features[0].properties.state, "live");
    assert.equal(busVehicleFeatures(positions, 1_000_000 + 25_000).features[0].properties.state, "stale");
    assert.equal(busVehicleFeatures(positions, 1_000_000 + 205_000).features.length, 0);
  });

  it("draw nothing from a disabled or unavailable read", () => {
    assert.equal(busVehicleFeatures(read([bus()], { state: "disabled" }), 1_000_000).features.length, 0);
    assert.equal(busVehicleFeatures(read([bus()], { state: "unavailable" }), 1_000_000).features.length, 0);
    assert.equal(busVehicleFeatures(null, 1_000_000).features.length, 0);
  });

  it("mark every bus stale when the source is stale", () => {
    const data = busVehicleFeatures(read([bus()], { state: "stale" }), 1_000_000);
    assert.equal(data.features[0].properties.state, "stale");
  });

  it("change their signature only when a state or the selection changes, not with age", () => {
    const positions = read([bus({ ageSeconds: 20 }), bus({ vehicleId: "8101", ageSeconds: 110 })]);
    const first = busVehicleFeaturesSignature(busVehicleFeatures(positions, 1_000_000));
    assert.equal(busVehicleFeaturesSignature(busVehicleFeatures(positions, 1_000_000 + 5_000)), first);
    assert.notEqual(busVehicleFeaturesSignature(busVehicleFeatures(positions, 1_000_000 + 15_000)), first);
    assert.notEqual(busVehicleFeaturesSignature(busVehicleFeatures(positions, 1_000_000, "8100")), first);
  });

  it("find a bus by its key", () => {
    assert.equal(findBusVehicle(read([bus()]), "8100")?.route, "29");
    assert.equal(findBusVehicle(read([bus()]), "nope"), null);
  });

  it("colour Lines 5 and 6 buses (replacements) as regular routes", () => {
    assert.equal(busVehicleFamily("5"), "regular");
    assert.equal(busVehicleFamily("405"), "community");
  });
});

describe("bus off-route rule", () => {
  it("flags a bus more than 100 m from every drawn line of its route", () => {
    assert.ok(distanceToBusRoute(catalog, "29", [-79.435, 43.66]) < 1);
    assert.equal(isBusOffRoute(catalog, bus()), false);
    // About 160 m east of Dufferin.
    assert.ok(distanceToBusRoute(catalog, "29", [-79.433, 43.66]) > BUS_OFF_ROUTE_METERS);
    assert.equal(isBusOffRoute(catalog, bus({ longitude: -79.433 })), true);
  });

  it("says nothing for a route with no drawn bus line (night routes, replacement buses)", () => {
    assert.equal(distanceToBusRoute(catalog, "329", [-79.433, 43.66]), null);
    assert.equal(isBusOffRoute(catalog, bus({ route: "503", longitude: -79.3 })), false);
    assert.equal(isBusOffRoute(null, bus({ longitude: -79.3 })), false);
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

describe("bus vehicle layers", () => {
  it("sit under live streetcars and over stops, from the bus zoom (above the default view)", () => {
    const map = createMockMap(["transit-bus-stops", "transit-stations-outer"]);
    installStreetcarVehicleLayers(map, { dark: true, activeFilteredLine: null });
    installBusVehicleLayers(map, { dark: true, activeFilteredLine: null });
    installBusVehicleLayers(map, { dark: true, activeFilteredLine: null });
    const ids = map.layers.map((layer) => layer.id);
    assert.ok(ids.indexOf("transit-bus-stops") < ids.indexOf(BUS_VEHICLE_HALO_LAYER));
    assert.ok(ids.indexOf(BUS_VEHICLE_LABEL_LAYER) < ids.indexOf(STREETCAR_VEHICLE_HALO_LAYER));
    assert.ok(ids.indexOf(STREETCAR_VEHICLE_LAYER) < ids.indexOf("transit-stations-outer"));
    assert.equal(ids.filter((id) => id === BUS_VEHICLE_LAYER).length, 1);
    assert.ok(BUS_VEHICLE_MIN_ZOOM > getGeographicDefaultZoom("ttc"));
    assert.equal(map.layers.find((layer) => layer.id === BUS_VEHICLE_LAYER).minzoom, BUS_VEHICLE_MIN_ZOOM);
  });

  it("choose the family image, a plain one without a heading, and the pale image when stale", () => {
    const map = createMockMap(["transit-stations-outer"]);
    installBusVehicleLayers(map, { dark: false, activeFilteredLine: null });
    const layer = map.layers.find((item) => item.id === BUS_VEHICLE_LAYER);
    const image = createExpression(layer.layout["icon-image"], { type: "resolvedImage", expression: { parameters: ["zoom", "feature"] } }, "layers[0].layout.icon-image");
    assert.equal(image.result, "success");
    const evaluate = (properties) => String(image.value.evaluate({ zoom: 14 }, { type: "Point", properties }));
    assert.equal(evaluate({ state: "live", bearing: 90, family: "express" }), busVehicleImageId("live", true, "express"));
    assert.equal(evaluate({ state: "stale", bearing: -1, family: "night" }), busVehicleImageId("stale", false, "night"));
  });

  it("dim while a subway line is filtered, and go entirely when turned off", () => {
    const map = createMockMap(["transit-stations-outer"]);
    installBusVehicleLayers(map, { dark: true, activeFilteredLine: null });
    updateBusVehicleFilter(map, "line-1");
    assert.deepEqual(map.paint.map((entry) => entry.layer), [BUS_VEHICLE_LAYER, BUS_VEHICLE_LABEL_LAYER]);
    removeBusVehicleLayers(map);
    assert.deepEqual(map.layers.map((layer) => layer.id), ["transit-stations-outer"]);
    assert.equal(map.sources[BUS_VEHICLE_SOURCE], undefined);
  });

  it("size the card for a replacement-bus note", () => {
    const plain = streetcarVehicleCardSize(1440, { offRoute: false, withStop: true });
    const replacement = streetcarVehicleCardSize(1440, { offRoute: false, withStop: true, replacement: true });
    assert.equal(replacement.height - plain.height, 22);
  });
});

describe("Live GPS switch caption", () => {
  it("names the vehicles it shows, buses only while bus routes are on", () => {
    assert.equal(vehiclePositionsDetail(false, "disabled", null, false), "Streetcars");
    assert.equal(vehiclePositionsDetail(true, "live", null, false), "Streetcars");
    assert.equal(vehiclePositionsDetail(true, "live", "live", true), "Streetcars & Buses");
    // Below the bus zoom nothing is read for buses yet; the caption still names them.
    assert.equal(vehiclePositionsDetail(true, "live", null, true), "Streetcars & Buses");
    assert.equal(vehiclePositionsDetail(true, null, null, true), "Streetcars & Buses");
  });

  it("names a source state honestly", () => {
    assert.equal(vehiclePositionsDetail(true, "disabled", null), "Source Off");
    assert.equal(vehiclePositionsDetail(true, "disabled", "disabled", true), "Source Off");
    assert.equal(vehiclePositionsDetail(true, "live", "disabled", true), "Streetcars Only");
    assert.equal(vehiclePositionsDetail(true, "live", "stale", true), "Stale");
    assert.equal(vehiclePositionsDetail(true, "unavailable", "live", true), "Unavailable");
    assert.equal(vehiclePositionsDetail(true, "disabled", "live", true), "Partly Off");
  });
});

describe("Train Markers switch caption", () => {
  it("names the trains, with their count when on", () => {
    assert.equal(estimatedTrainsDetail(false, "Off"), "Trains");
    assert.equal(estimatedTrainsDetail(true, "64 shown"), "64 Trains");
    assert.equal(estimatedTrainsDetail(true, "1 shown"), "1 Train");
    assert.equal(estimatedTrainsDetail(true, "12 held"), "12 Trains Held");
  });

  it("lets other marker states stand in for the count", () => {
    for (const status of ["Closed", "Connecting", "Waiting", "Reconnecting", "Unavailable"]) {
      assert.equal(estimatedTrainsDetail(true, status), status);
    }
  });
});
