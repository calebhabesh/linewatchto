import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createExpression } from "@maplibre/maplibre-gl-style-spec";

import {
  STREETCAR_BADGE_LAYER,
  STREETCAR_CASING_LAYER,
  STREETCAR_HIT_LAYER,
  STREETCAR_LINE_LAYER,
  STREETCAR_STOP_LAYER,
  installStreetcarLayers,
  streetcarStopCodeAtPoint,
  updateStreetcarFilter,
  updateStreetcarStopSelection,
} from "../src/components/geographic-streetcar-layers.ts";
import { installTransitLayers } from "../src/components/geographic-map-operations.ts";
import {
  cachedStreetcarCatalog,
  loadStreetcarCatalog,
  streetcarBadgeImageId,
  streetcarCardRows,
  streetcarRouteSets,
  streetcarSchedulePeriodLabel,
  STREETCAR_BADGE_MIN_ZOOM,
  nearestStreetcarStop,
  streetcarStopByCode,
} from "../src/app/geographic-surface-catalog.ts";
import { streetcarCardSize } from "../src/components/map-chooser-layout.ts";
import { getGeographicDefaultZoom } from "../src/app/geographic-config.ts";

globalThis.window = globalThis;

const catalog = {
  type: "FeatureCollection",
  schemaVersion: "1.0.0",
  network: "ttc",
  layer: "streetcar",
  source: { feedStartDate: "2026-11-01", feedEndDate: "2026-12-19" },
  routes: [
    { route: "503", name: "Kingston Rd", color: "#ED1C24", textColor: "#FFFFFF", drawn: false, weekdayTrips: { streetcar: 0, shortTurn: 0, replacementBus: 336 } },
    { route: "504", name: "King", color: "#ED1C24", textColor: "#FFFFFF", drawn: true, weekdayTrips: { streetcar: 270, shortTurn: 4, replacementBus: 415 } },
    { route: "510", name: "Spadina", color: "#ED1C24", textColor: "#FFFFFF", drawn: true, weekdayTrips: { streetcar: 438, shortTurn: 0, replacementBus: 0 } },
  ],
  features: [
    { type: "Feature", id: "c1", geometry: { type: "LineString", coordinates: [[-79.4, 43.64], [-79.39, 43.645]] }, properties: { featureType: "streetcar-corridor", routes: ["504", "510"] } },
    { type: "Feature", id: "c2", geometry: { type: "LineString", coordinates: [[-79.39, 43.645], [-79.38, 43.65]] }, properties: { featureType: "streetcar-corridor", routes: ["504"] } },
    { type: "Feature", id: "s1", geometry: { type: "Point", coordinates: [-79.39, 43.645] }, properties: { featureType: "streetcar-stop", stopId: "1", stopCode: "9037", name: "King St at Spadina", routes: ["504", "510"] } },
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
    addSource: (id, config) => {
      sources[id] = { ...config, setData: (data) => { sources[id].data = data; } };
    },
    getLayer: (id) => layers.find((layer) => layer.id === id),
    addLayer: (layer, beforeId) => {
      const index = beforeId ? layers.findIndex((l) => l.id === beforeId) : -1;
      if (index >= 0) layers.splice(index, 0, layer);
      else layers.push(layer);
    },
    moveLayer: () => {},
    hasImage: () => false,
    addImage: () => {},
    setPaintProperty: (layer, property, value) => paint.push({ layer, property, value }),
    setLayoutProperty: (layer, property, value) => {
      const target = layers.find((item) => item.id === layer);
      target.layout = { ...target.layout, [property]: value };
    },
    removeImage: () => {},
    queryRenderedFeatures: (_box, options) => (options.layers.includes("transit-streetcar-stops")
      ? [{ properties: { stopCode: "9037" } }]
      : []),
    getPaintProperty: () => undefined,
    getStyle: () => ({ layers }),
  };
}

function evaluate(expression, zoom, globalState = {}) {
  const compiled = createExpression(expression, { type: "number", expression: { interpolated: true, parameters: ["zoom"] } });
  assert.equal(compiled.result, "success", JSON.stringify(compiled.value));
  return compiled.value.evaluateWithoutErrorHandling({ zoom, globalState }, { properties: {} });
}

const ids = (map) => map.layers.map((layer) => layer.id);

describe("streetcar layers on the Map View", () => {
  it("draws under the subway lines, with badges under the station markers", () => {
    const map = createMockMap(["transit-routes-casing", "transit-routes", "transit-stations-outer", "transit-station-labels"]);
    installStreetcarLayers(map, catalog, { dark: true, activeFilteredLine: null });
    const order = ids(map);
    for (const layer of [STREETCAR_CASING_LAYER, STREETCAR_LINE_LAYER, STREETCAR_HIT_LAYER]) {
      assert.ok(order.indexOf(layer) < order.indexOf("transit-routes-casing"), `${layer} under the subway`);
    }
    assert.ok(order.indexOf(STREETCAR_BADGE_LAYER) > order.indexOf("transit-routes"));
    assert.ok(order.indexOf(STREETCAR_BADGE_LAYER) < order.indexOf("transit-stations-outer"));
  });

  it("shows the lines at every zoom, thinner than the subway, and names them once zoomed in", () => {
    const map = createMockMap();
    installStreetcarLayers(map, catalog, { dark: false, activeFilteredLine: null });
    const defaultZoom = getGeographicDefaultZoom("ttc");
    for (const id of [STREETCAR_CASING_LAYER, STREETCAR_LINE_LAYER, STREETCAR_HIT_LAYER]) {
      assert.equal(map.getLayer(id).minzoom, undefined, `${id} is drawn at the default zoom`);
    }
    assert.equal(map.getLayer(STREETCAR_LINE_LAYER).paint["line-opacity"], 1);
    // The subway's route width: 2.2 px at zoom 9, 5 at 14, 8 at 17.
    const subway = ["interpolate", ["linear"], ["zoom"], 9, 2.2, 14, 5.0, 17, 8.0];
    const width = map.getLayer(STREETCAR_LINE_LAYER).paint["line-width"];
    for (const zoom of [9, defaultZoom, 14, 17]) {
      assert.ok(evaluate(width, zoom) < evaluate(subway, zoom), `thinner than the subway at zoom ${zoom}`);
    }
    assert.ok(map.getLayer(STREETCAR_BADGE_LAYER).minzoom > defaultZoom);
  });

  it("never colours the line from data", () => {
    const map = createMockMap();
    installStreetcarLayers(map, catalog, { dark: false, activeFilteredLine: null });
    assert.equal(typeof map.getLayer(STREETCAR_LINE_LAYER).paint["line-color"], "string");
    assert.equal(map.getLayer(STREETCAR_LINE_LAYER).paint["line-color"], "#ED1C24");
  });

  it("names each corridor's badge image after its routes and is idempotent", () => {
    const map = createMockMap();
    installStreetcarLayers(map, catalog, { dark: false, activeFilteredLine: null });
    installStreetcarLayers(map, catalog, { dark: false, activeFilteredLine: null });
    assert.equal(ids(map).length, 6);
    const corridors = map.sources["transit-streetcar-corridors"].data.features;
    assert.equal(corridors.length, 2, "stops are not drawn as corridors");
    assert.deepEqual(corridors.map((f) => f.properties.badgeImage), ["streetcar-badges:504,510", "streetcar-badges:504"]);
    assert.deepEqual(streetcarRouteSets(catalog), [["504", "510"], ["504"]]);
    assert.equal(streetcarBadgeImageId(["501", "504"]), "streetcar-badges:501,504");
  });

  it("dims with the other lines while a subway line is filtered", () => {
    const map = createMockMap();
    installStreetcarLayers(map, catalog, { dark: false, activeFilteredLine: null });
    updateStreetcarFilter(map, "line-1");
    const line = map.paint.find((call) => call.layer === STREETCAR_LINE_LAYER && call.property === "line-opacity");
    assert.equal(evaluate(line.value, 13), 0.25);
    const badges = map.paint.find((call) => call.layer === STREETCAR_BADGE_LAYER);
    assert.equal(evaluate(badges.value, 13), 0.25);
    updateStreetcarFilter(map, null);
    const cleared = map.paint.filter((call) => call.layer === STREETCAR_LINE_LAYER).at(-1);
    assert.equal(evaluate(cleared.value, 13), 1);
  });
});

describe("streetcars with the transit layers", () => {
  const subway = {
    features: [
      { type: "Feature", geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] }, properties: { featureType: "link", lineId: "line-1", segmentId: "seg-1", stationAId: "a", stationBId: "b" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: { featureType: "station", stationId: "a", lineIds: ["line-1"], name: "A" } },
    ],
  };

  it("install with the TTC network once their catalog has loaded, never on GO/UP", async () => {
    const before = createMockMap();
    installTransitLayers(before, subway, "ttc", false, false);
    assert.equal(before.getLayer(STREETCAR_LINE_LAYER), undefined, "nothing to draw before the catalog loads");

    let requests = 0;
    globalThis.fetch = async () => {
      requests += 1;
      return { ok: true, json: async () => catalog };
    };
    await Promise.all([loadStreetcarCatalog(), loadStreetcarCatalog()]);
    assert.equal(requests, 1, "concurrent loads share one request");
    assert.equal(cachedStreetcarCatalog(), catalog);

    const ttc = createMockMap();
    installTransitLayers(ttc, subway, "ttc", false, false);
    assert.ok(ttc.getLayer(STREETCAR_LINE_LAYER));
    const order = ids(ttc);
    assert.ok(order.indexOf(STREETCAR_LINE_LAYER) < order.indexOf("transit-routes-casing"));

    const regional = createMockMap();
    installTransitLayers(regional, { ...subway, network: "regional" }, "regional", false, false);
    assert.equal(regional.getLayer(STREETCAR_LINE_LAYER), undefined);
  });
});

describe("streetcar card", () => {
  it("lists the corridor's routes with a note where replacement buses run", () => {
    assert.deepEqual(streetcarCardRows(catalog, ["504", "510", "999"]), [
      { route: "504", name: "King", color: "#ED1C24", textColor: "#FFFFFF", replacementBuses: true },
      { route: "510", name: "Spadina", color: "#ED1C24", textColor: "#FFFFFF", replacementBuses: false },
    ]);
  });

  it("names the schedule period it is drawn from", () => {
    assert.equal(streetcarSchedulePeriodLabel({ feedStartDate: "2026-11-01", feedEndDate: "2026-12-19" }), "Nov 1 – Dec 19");
    assert.equal(
      streetcarSchedulePeriodLabel({ feedStartDate: "2026-12-20", feedEndDate: "2027-02-14" }),
      "Dec 20, 2026 – Feb 14, 2027",
    );
  });

  it("asks for room for each route and its note, more on phones", () => {
    const plain = streetcarCardSize([{ replacementBuses: false }], 1440);
    const noted = streetcarCardSize([{ replacementBuses: true }], 1440);
    const phone = streetcarCardSize([{ replacementBuses: true }], 360);
    assert.ok(noted.height > plain.height);
    assert.ok(phone.height > noted.height);
    assert.ok(phone.width <= 360 - 32);
  });
});

describe("streetcar stop pills", () => {
  it("places stop numbers deeper than the route badges, over them, under the stations, and hides them on collision", () => {
    const map = createMockMap(["transit-routes-casing", "transit-routes", "transit-stations-outer", "transit-station-labels"]);
    installStreetcarLayers(map, catalog, { dark: true, activeFilteredLine: null });
    const order = ids(map);
    const stops = map.getLayer(STREETCAR_STOP_LAYER);
    assert.ok(stops.minzoom > STREETCAR_BADGE_MIN_ZOOM);
    assert.ok(order.indexOf(STREETCAR_STOP_LAYER) > order.indexOf(STREETCAR_BADGE_LAYER));
    assert.ok(order.indexOf(STREETCAR_STOP_LAYER) < order.indexOf("transit-stations-outer"));
    assert.equal(stops.layout["icon-allow-overlap"], false);
    assert.equal(stops.layout["text-allow-overlap"], false);
    assert.deepEqual(stops.layout["text-field"], ["get", "stopCode"]);
    const points = map.sources["transit-streetcar-stops"].data.features;
    assert.deepEqual(points.map((feature) => feature.properties.stopCode), ["9037"]);
  });

  it("marks the open stop and reads a pressed pill's number", () => {
    const map = createMockMap();
    installStreetcarLayers(map, catalog, { dark: false, activeFilteredLine: null });
    assert.equal(map.getLayer(STREETCAR_STOP_LAYER).layout["icon-image"], "streetcar-stop-pill");
    updateStreetcarStopSelection(map, "9037");
    assert.deepEqual(map.getLayer(STREETCAR_STOP_LAYER).layout["icon-image"],
      ["case", ["==", ["get", "stopCode"], "9037"], "streetcar-stop-pill-selected", "streetcar-stop-pill"]);
    updateStreetcarStopSelection(map, null);
    assert.equal(map.getLayer(STREETCAR_STOP_LAYER).layout["icon-image"], "streetcar-stop-pill");
    assert.equal(streetcarStopCodeAtPoint(map, { x: 10, y: 10 }), "9037");
  });

  it("labels stops black on white above a dot on the stop's published position", () => {
    const map = createMockMap();
    installStreetcarLayers(map, catalog, { dark: true, activeFilteredLine: null });
    const dot = map.getLayer("transit-streetcar-stop-dots");
    assert.equal(dot.type, "circle");
    assert.equal(dot.source, "transit-streetcar-stops");
    const label = map.getLayer(STREETCAR_STOP_LAYER);
    assert.equal(label.layout["text-anchor"], "bottom");
    assert.ok(label.layout["text-offset"][1] < 0, "the label sits above the dot");
    // Dark text in both themes, never the route red.
    assert.equal(label.paint["text-color"], "#0f172a");
    const order = ids(map);
    assert.ok(order.indexOf("transit-streetcar-stop-dots") < order.indexOf(STREETCAR_STOP_LAYER));
  });

  it("dims the pills with the lines while a subway line is filtered", () => {
    const map = createMockMap();
    installStreetcarLayers(map, catalog, { dark: false, activeFilteredLine: null });
    updateStreetcarFilter(map, "line-1");
    const pill = map.paint.find((call) => call.layer === STREETCAR_STOP_LAYER && call.property === "icon-opacity");
    assert.equal(evaluate(pill.value, 15), 0.25);
  });

  it("finds a stop by its number and the nearest stop on a pressed street's routes", () => {
    assert.equal(streetcarStopByCode(catalog, "9037")?.properties.name, "King St at Spadina");
    assert.equal(streetcarStopByCode(catalog, "1"), null);
    // About 80 m from the stop, on a route that serves it.
    assert.equal(nearestStreetcarStop(catalog, [-79.391, 43.645], ["510"])?.stop.properties.stopCode, "9037");
    // A route that does not serve it, or a press too far away, offers no stop.
    assert.equal(nearestStreetcarStop(catalog, [-79.391, 43.645], ["501"]), null);
    assert.equal(nearestStreetcarStop(catalog, [-79.40, 43.645], ["510"]), null);
  });

  it("makes room in the card for the nearest-stop button", () => {
    const rows = [{ replacementBuses: false }];
    assert.ok(streetcarCardSize(rows, 1440, true).height > streetcarCardSize(rows, 1440).height);
  });
});
