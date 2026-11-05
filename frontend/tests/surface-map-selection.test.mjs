import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExpression } from "@maplibre/maplibre-gl-style-spec";

import {
  assignSelectedTtcStops,
  branchCorridors,
  mergeSurfaceSelection,
  routeCoordinates,
  routeCorridors,
  selectedRouteFilter,
  selectedRoutesInLayer,
  selectedStopFilter,
  surfaceRouteKey,
  surfaceRouteSelection,
  surfaceSelectionBounds,
  surfaceSelectionKey,
  unselectedStopFilter,
} from "../src/app/surface-map-selection.ts";
import {
  SELECTED_STOP_OUTLINE_IMAGE,
  SELECTED_STOP_PILL_IMAGE,
  applySurfaceSelectionAttentionFrame,
  applySurfaceSelectionLayers,
  surfaceSelectionLayerIds,
  surfaceSelectionStopCodeAtPoint,
} from "../src/components/geographic-surface-selection-layers.ts";
import {
  BUS_CASING_LAYER,
  BUS_SELECTION_TARGET,
  BUS_STOP_LAYER,
  busStopCodeAtPoint,
  installBusLayers,
  installBusSelectionSources,
  installBusStopLayers,
  removeBusLayers,
} from "../src/components/geographic-bus-layers.ts";
import {
  STREETCAR_SELECTION_TARGET,
  installStreetcarSelectionSources,
  removeStreetcarLayers,
} from "../src/components/geographic-streetcar-layers.ts";
import {
  NIGHT_SELECTION_TARGETS,
  NIGHT_STOP_SELECTION_TARGET,
  installNightSelectionSources,
  installNightStopSelectionSource,
  removeNightLayers,
  removeNightStopSelection,
} from "../src/components/geographic-night-layers.ts";

globalThis.window = globalThis;

const asset = (name) => JSON.parse(readFileSync(new URL(`../public/assets/linewatch/geographic/${name}`, import.meta.url), "utf8"));
const streetcars = asset("ttc-surface-streetcar.json");
const buses = asset("ttc-surface-bus.json");
const busStops = asset("ttc-surface-bus-stops.json");
const night = asset("ttc-surface-night.json");
const nightStops = asset("ttc-surface-night-stops.json");
const codesOf = (features) => new Set(features.map((feature) => feature.properties.stopCode).filter(Boolean));
const streetcarCodes = codesOf(streetcars.features.filter((feature) => feature.properties.featureType === "streetcar-stop"));
const shippedSets = { streetcar: streetcarCodes, bus: codesOf(busStops.features), night: codesOf(nightStops.features) };

/** Evaluates a layer filter against one feature's properties. */
function matches(filter, properties) {
  const compiled = createExpression(filter, { type: "boolean" });
  assert.equal(compiled.result, "success", JSON.stringify(compiled.value));
  return compiled.value.evaluate({ zoom: 14, globalState: {} }, { properties });
}

/** A MapLibre stand-in that refuses to drop a source a layer still reads. */
function createMockMap(existingLayers = []) {
  const sources = {};
  const layers = existingLayers.map((id) => ({ id }));
  const images = new Map();
  return {
    sources,
    layers,
    images,
    getSource: (id) => sources[id],
    addSource: (id, config) => {
      sources[id] = { ...config, setData: (data) => { sources[id].data = data; } };
    },
    removeSource: (id) => {
      const user = layers.find((layer) => layer.source === id);
      if (user) throw new Error(`Source "${id}" cannot be removed while layer "${user.id}" is using it.`);
      delete sources[id];
    },
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
    setFilter: (id, filter) => { layers.find((layer) => layer.id === id).filter = filter; },
    moveLayer: () => {},
    hasImage: (id) => images.has(id),
    addImage: (id, image) => images.set(id, image),
    removeImage: (id) => images.delete(id),
    setPaintProperty: () => {},
    setLayoutProperty: () => {},
    queryRenderedFeatures: (_box, options) => (options.layers.some((id) => id.endsWith("-selected-stops"))
      ? [{ properties: { stopCode: "96" } }]
      : []),
    getPaintProperty: () => undefined,
    getStyle: () => ({ layers }),
  };
}

const ids = (map) => map.layers.map((layer) => layer.id);
const BASE = ["transit-routes-casing", "transit-routes", "transit-stations-outer", "transit-station-labels"];

describe("surface selection inputs (plan 14, U4)", () => {
  it("maps each searched route kind to the layer that draws it, and undrawn routes to none", () => {
    const route = (kind, drawn = true) => surfaceRouteSelection({ kind, route: "1", drawn });
    assert.deepEqual(route("streetcar"), { layer: "streetcar", route: "1" });
    assert.equal(route("bus").layer, "bus");
    assert.equal(route("express").layer, "bus");
    assert.equal(route("night-streetcar").layer, "night");
    assert.equal(route("night-bus").layer, "night");
    assert.equal(route("go-bus").layer, "go-bus");
    assert.equal(route("streetcar", false), null, "503 is all buses this period: nothing to select");
  });

  it("merges the open stop with what a panel shows, once each, and is empty without either", () => {
    assert.equal(mergeSurfaceSelection(null, null), null);
    assert.equal(mergeSurfaceSelection(null, { stopCodes: [], routes: [] }), null);
    assert.deepEqual(mergeSurfaceSelection("100", null), { stopCodes: ["100"], routes: [] });
    assert.deepEqual(
      mergeSurfaceSelection("100", { stopCodes: ["2040", "100"], routes: [{ layer: "bus", route: "29" }] }),
      { stopCodes: ["100", "2040"], routes: [{ layer: "bus", route: "29" }] },
    );
  });

  it("keys a selection by content, so the camera frames it once whatever the stop order", () => {
    const a = surfaceSelectionKey({ stopCodes: ["2040", "100"], routes: [] });
    assert.equal(a, surfaceSelectionKey({ stopCodes: ["100", "2040"], routes: [] }));
    assert.notEqual(a, surfaceSelectionKey({ stopCodes: ["100", "2040"], routes: [{ layer: "bus", route: "29" }] }));
    assert.notEqual(
      surfaceSelectionKey({ stopCodes: [], routes: [{ layer: "bus", route: "29" }] }),
      surfaceSelectionKey({ stopCodes: [], routes: [{ layer: "night", route: "29" }] }),
    );
    assert.equal(surfaceSelectionKey(null), "");
    assert.equal(surfaceSelectionKey({ stopCodes: [], routes: [] }), "");
  });

  it("finds a route among a corridor's routes by whole number, never by a longer one", () => {
    const filter = selectedRouteFilter(["29"]);
    assert.equal(matches(filter, { routeKey: surfaceRouteKey(["29", "929"]) }), true);
    assert.equal(matches(filter, { routeKey: surfaceRouteKey(["129", "290"]) }), false);
    assert.equal(matches(filter, { routeKey: surfaceRouteKey(["929"]) }), false);
    assert.equal(matches(selectedRouteFilter([]), { routeKey: surfaceRouteKey(["29"]) }), false);
  });

  it("finds any of several routes, whole numbers only, and keys them whatever the order", () => {
    const filter = selectedRouteFilter(["29", "41"]);
    assert.equal(matches(filter, { routeKey: surfaceRouteKey(["41"]) }), true);
    assert.equal(matches(filter, { routeKey: surfaceRouteKey(["29", "929"]) }), true);
    assert.equal(matches(filter, { routeKey: surfaceRouteKey(["129", "410"]) }), false);
    const bus = { layer: "bus", route: "29" };
    const night = { layer: "night", route: "329" };
    assert.equal(surfaceSelectionKey({ stopCodes: [], routes: [bus, night] }), surfaceSelectionKey({ stopCodes: [], routes: [night, bus] }));
    const both = { stopCodes: [], routes: [bus, night, { layer: "bus", route: "41" }] };
    assert.deepEqual(selectedRoutesInLayer(both, "bus"), ["29", "41"]);
    assert.deepEqual(selectedRoutesInLayer(both, "streetcar"), []);
    assert.deepEqual(selectedRoutesInLayer(null, "bus"), []);
  });

  it("splits stops between the selection layer and the ordinary labels", () => {
    assert.equal(matches(selectedStopFilter(["100", "2040"]), { stopCode: "2040" }), true);
    assert.equal(matches(selectedStopFilter(["100"]), { stopCode: "1000" }), false);
    assert.equal(matches(unselectedStopFilter(["100"]), { stopCode: "100" }), false);
    assert.equal(matches(unselectedStopFilter(["100"]), { stopCode: "1000" }), true);
    assert.equal(unselectedStopFilter([]), null, "no filter with nothing selected");
  });

  it("gives each selected TTC stop to one layer and waits for the file it needs", () => {
    const sets = { streetcar: new Set(["9037"]), bus: new Set(["9037", "2040"]), night: new Set(["96"]) };
    assert.deepEqual(assignSelectedTtcStops(["9037", "2040", "96", "424242"], sets),
      { streetcar: ["9037"], bus: ["2040"], night: ["96"], needs: null });
    assert.equal(assignSelectedTtcStops(["2040"], { ...sets, bus: null }).needs, "bus");
    assert.equal(assignSelectedTtcStops(["9037"], { ...sets, bus: null }).needs, null, "a streetcar pole needs no other file");
    assert.equal(assignSelectedTtcStops(["96"], { ...sets, night: null }).needs, "night");
    assert.equal(assignSelectedTtcStops(["96", "2040"], { streetcar: sets.streetcar, bus: null, night: null }).needs, "bus");
    assert.equal(assignSelectedTtcStops(["100"], { streetcar: null, bus: null, night: null }).needs, "streetcar");
  });

  it("places shipped stops: a shared pole with the streetcars, a bus pole, a night-only pole", () => {
    const sharedPole = [...streetcarCodes].find((code) => shippedSets.bus.has(code));
    assert.ok(sharedPole, "the shipped files share poles");
    const busPole = [...shippedSets.bus].find((code) => !streetcarCodes.has(code));
    const nightPole = nightStops.features[0].properties.stopCode;
    assert.ok(!shippedSets.bus.has(nightPole) && !streetcarCodes.has(nightPole));
    assert.deepEqual(assignSelectedTtcStops([sharedPole, busPole, nightPole], shippedSets),
      { streetcar: [sharedPole], bus: [busPole], night: [nightPole], needs: null });
  });

  it("frames a route's corridors and the stops around them", () => {
    const corridors = routeCorridors(buses.features, ["29"]);
    assert.ok(corridors.length > 0);
    assert.ok(corridors.every((feature) => feature.properties.routes.includes("29")));
    const [[west, south], [east, north]] = surfaceSelectionBounds(routeCoordinates(buses.features, ["29"]));
    // The 29 Dufferin runs up Dufferin St from Exhibition Place to Wilson.
    assert.ok(west > -79.5 && east < -79.38, `${west}..${east}`);
    assert.ok(south < 43.64 && north > 43.72, `${south}..${north}`);
    assert.equal(surfaceSelectionBounds([]), null);
    assert.deepEqual(surfaceSelectionBounds([[-79.4, 43.6], [-79.5, 43.7]]), [[-79.5, 43.6], [-79.4, 43.7]]);
  });
});

describe("surface selection layers (plan 14, U4)", () => {
  it("outline a route under its layer's casing and leave the layer's line to draw it", () => {
    const map = createMockMap(BASE);
    installBusLayers(map, buses, { dark: false, activeFilteredLine: null });
    applySurfaceSelectionLayers(map, BUS_SELECTION_TARGET, { routes: ["29"], stopCodes: [], routeLine: false, dark: false });
    const sel = surfaceSelectionLayerIds("transit-bus");
    const order = ids(map);
    assert.ok(order.indexOf(sel.halo) < order.indexOf(sel.outline), "glow under the band");
    assert.ok(order.indexOf(sel.outline) < order.indexOf(BUS_CASING_LAYER), "under the casing");
    assert.equal(map.getLayer(sel.line), undefined, "the bus line itself draws the route");
    assert.deepEqual(map.getLayer(sel.outline).filter, selectedRouteFilter(["29"]));
    // The Map View's train selection colours, constant, never from data.
    assert.equal(map.getLayer(sel.outline).paint["line-color"], "#38bdf8");
    assert.equal(map.getLayer(sel.halo).paint["line-color"], "#0ea5e9");
    const shown = map.sources["transit-bus-corridors"].data.features.filter((feature) =>
      matches(selectedRouteFilter(["29"]), feature.properties));
    assert.equal(shown.length, routeCorridors(buses.features, ["29"]).length);

    applySurfaceSelectionLayers(map, BUS_SELECTION_TARGET, { routes: [], stopCodes: [], routeLine: false, dark: false });
    assert.equal(map.getLayer(sel.outline), undefined, "cleared with the selection");
    assert.equal(map.getLayer(sel.halo), undefined);
  });

  it("outline a selected stop in blue under its solid pill and flash only the blue", () => {
    const map = createMockMap(BASE);
    const paints = [];
    map.setPaintProperty = (id, property, value) => paints.push([id, property, value]);
    installBusSelectionSources(map, {
      corridors: routeCorridors(buses.features, ["29"]),
      stops: busStops.features.filter((feature) => feature.properties.stopCode === "2040"),
    });
    applySurfaceSelectionLayers(map, BUS_SELECTION_TARGET, { routes: ["29"], stopCodes: ["2040"], routeLine: false, dark: false });
    const sel = surfaceSelectionLayerIds("transit-bus");
    const order = ids(map);
    assert.ok(order.indexOf(sel.stopRing) < order.indexOf(sel.stopDots), "ring around the dot");
    assert.ok(order.indexOf(sel.stopOutline) < order.indexOf(sel.stops), "outline around the pill");
    assert.equal(map.getLayer(sel.stopRing).paint["circle-stroke-color"], "#38bdf8");
    assert.equal(map.getLayer(sel.stopOutline).layout["icon-image"], SELECTED_STOP_OUTLINE_IMAGE);
    assert.deepEqual(map.getLayer(sel.stopOutline).filter, map.getLayer(sel.stops).filter);

    applySurfaceSelectionAttentionFrame(map, ["transit-bus", "transit-streetcar"], { opacity: 0.4, widthMultiplier: 1.2, state: "intro", active: true });
    const painted = new Set(paints.map(([id]) => id));
    assert.deepEqual([...painted].sort(), [sel.halo, sel.outline, sel.stopOutline, sel.stopRing].sort(), "only drawn layers, never the pill or number");
    const band = paints.find(([id, property]) => id === sel.outline && property === "line-opacity");
    assert.ok(JSON.stringify(band[2]).includes("0.4"), "the band takes the frame's opacity");
    const width = paints.find(([id, property]) => id === sel.outline && property === "line-width");
    assert.deepEqual(width[2].map((value) => (typeof value === "number" ? Number(value.toFixed(3)) : value)),
      ["interpolate", ["linear"], ["zoom"], 9, 7.2, 14, 13.2, 17, 21.6], "and its widths");

    applySurfaceSelectionLayers(map, BUS_SELECTION_TARGET, { routes: [], stopCodes: [], routeLine: false, dark: false });
    for (const id of Object.values(sel)) assert.equal(map.getLayer(id), undefined, id);
  });

  it("with Bus Routes off, hold only the selected route and stops and draw just those", () => {
    const map = createMockMap(BASE);
    const codes = new Set(["2040"]);
    installBusSelectionSources(map, {
      corridors: routeCorridors(buses.features, ["29"]),
      stops: busStops.features.filter((feature) => codes.has(feature.properties.stopCode)),
    });
    applySurfaceSelectionLayers(map, BUS_SELECTION_TARGET, { routes: ["29"], stopCodes: ["2040"], routeLine: true, dark: true });
    const sel = surfaceSelectionLayerIds("transit-bus");
    assert.equal(map.sources["transit-bus-corridors"].data.features.length, routeCorridors(buses.features, ["29"]).length);
    assert.deepEqual(map.sources["transit-bus-stops"].data.features.map((feature) => feature.properties.stopCode), ["2040"]);
    assert.equal(map.getLayer(BUS_CASING_LAYER), undefined, "the switch's own layers stay off");
    assert.equal(map.getLayer(sel.line).paint["line-color"], "#ED1C24", "the route in its layer's own paint");
    assert.ok(map.getLayer(sel.line).paint["line-dasharray"], "dashed as a bus line");
    const order = ids(map);
    assert.ok(order.indexOf(sel.outline) < order.indexOf(sel.line));
    assert.ok(order.indexOf(sel.line) < order.indexOf("transit-routes-casing"), "under the subway");

    const pill = map.getLayer(sel.stops);
    assert.equal(pill.minzoom, undefined, "a selected stop shows at every zoom");
    assert.equal(pill.layout["icon-image"], SELECTED_STOP_PILL_IMAGE);
    assert.equal(pill.layout["icon-allow-overlap"], true);
    assert.equal(pill.paint["text-color"], "#ffffff");
    assert.ok(ids(map).indexOf(sel.stops) < ids(map).indexOf("transit-stations-outer"), "under station markers");
    assert.equal(busStopCodeAtPoint(map, { x: 0, y: 0 }), "96", "a selected pill takes presses");

    // Turning the switch off again (or clearing) removes layers before sources.
    removeBusLayers(map);
    assert.deepEqual(ids(map), BASE);
    assert.deepEqual(Object.keys(map.sources), []);
  });

  it("leave a selected stop out of the ordinary labels while the switch is on", () => {
    const map = createMockMap(BASE);
    installBusLayers(map, buses, { dark: false, activeFilteredLine: null });
    installBusStopLayers(map, busStops, { activeFilteredLine: null, selectedStopCodes: ["2040"], streetcarStopCodes: new Set() });
    applySurfaceSelectionLayers(map, BUS_SELECTION_TARGET, { routes: [], stopCodes: ["2040"], routeLine: false, dark: false });
    assert.equal(matches(map.getLayer(BUS_STOP_LAYER).filter, { stopCode: "2040" }), false);
    const sel = surfaceSelectionLayerIds("transit-bus");
    assert.ok(ids(map).indexOf(sel.stops) > ids(map).indexOf(BUS_STOP_LAYER), "over the ordinary labels");
  });

  it("draw a streetcar route with Streetcar Routes off, and come off cleanly", () => {
    const map = createMockMap(BASE);
    installStreetcarSelectionSources(map, streetcars, { routes: ["504"], stopCodes: [] });
    applySurfaceSelectionLayers(map, STREETCAR_SELECTION_TARGET, { routes: ["504"], stopCodes: [], routeLine: true, dark: false });
    const corridors = map.sources["transit-streetcar-corridors"].data.features;
    assert.ok(corridors.length > 0 && corridors.every((feature) => feature.properties.routes.includes("504")));
    assert.deepEqual(map.sources["transit-streetcar-stops"].data.features, []);
    installStreetcarSelectionSources(map, streetcars, { routes: ["504", "501"], stopCodes: [] });
    const both = map.sources["transit-streetcar-corridors"].data.features;
    assert.ok(both.some((feature) => feature.properties.routes.includes("501")) && both.some((feature) => feature.properties.routes.includes("504")));
    assert.equal(map.getLayer(surfaceSelectionLayerIds("transit-streetcar").line).paint["line-dasharray"], undefined, "solid");
    removeStreetcarLayers(map);
    assert.deepEqual(ids(map), BASE);
  });

  it("draw a night route only on its own kind, and night-only poles from their own source", () => {
    const map = createMockMap(BASE);
    const route = night.routes.find((candidate) => candidate.kind === "bus" && candidate.drawn).route;
    installNightSelectionSources(map, night, [route]);
    for (const target of NIGHT_SELECTION_TARGETS) {
      applySurfaceSelectionLayers(map, target, { routes: [route], stopCodes: [], routeLine: true, dark: true });
    }
    assert.equal(map.sources["transit-night-streetcar-corridors"].data.features.length, 0);
    assert.ok(map.sources["transit-night-bus-corridors"].data.features.length > 0);
    assert.equal(map.getLayer("transit-night-bus-selected-line").paint["line-color"], "#5B9BE0", "the dark map's night blue");

    const pole = nightStops.features[0];
    installNightStopSelectionSource(map, [pole]);
    applySurfaceSelectionLayers(map, NIGHT_STOP_SELECTION_TARGET, {
      routes: [], stopCodes: [pole.properties.stopCode], routeLine: false, dark: false,
    });
    assert.ok(map.getLayer("transit-night-selected-stops"));
    assert.equal(surfaceSelectionStopCodeAtPoint(map, { x: 0, y: 0 }, NIGHT_STOP_SELECTION_TARGET.prefix), "96");
    removeNightStopSelection(map);
    removeNightLayers(map);
    assert.deepEqual(ids(map), BASE);
    assert.deepEqual(Object.keys(map.sources), []);
  });
});

describe("branchCorridors", () => {
  const corridor = (id, coordinates, routes = ["52"]) => ({ id, geometry: { coordinates }, properties: { routes } });
  // Lawrence runs east along 43.7; Dixon Rd turns off north at -79.5.
  const trunk = corridor("trunk", [[-79.5, 43.7], [-79.4, 43.7]]);
  const dixon = corridor("dixon", [[-79.5, 43.7], [-79.5, 43.75]]);
  const west = corridor("west", [[-79.6, 43.7], [-79.5, 43.7]]);
  const other = corridor("other", [[-79.5, 43.7], [-79.4, 43.7]], ["29"]);
  const features = [trunk, dixon, west, other];
  const alongTrunk = [[-79.5, 43.7001], [-79.45, 43.7001], [-79.4, 43.7001]];

  it("keeps the route's corridors that follow the branch's stops", () => {
    assert.deepEqual(branchCorridors(features, "52", [alongTrunk]).map((item) => item.id), ["trunk"]);
    const toDixon = [[-79.4, 43.7001], [-79.5, 43.7001], [-79.5001, 43.75]];
    assert.deepEqual(branchCorridors(features, "52", [toDixon]).map((item) => item.id), ["trunk", "dixon"]);
  });

  it("never takes another route's corridor", () => {
    assert.ok(!branchCorridors(features, "52", [alongTrunk]).some((item) => item.id === "other"));
  });

  it("falls back to the whole route when the stops are not known or match nothing", () => {
    assert.deepEqual(branchCorridors(features, "52", [[]]).map((item) => item.id), ["trunk", "dixon", "west"]);
    assert.deepEqual(branchCorridors(features, "52", [[[-79, 44]]]).map((item) => item.id), ["trunk", "dixon", "west"]);
  });

  it("gives a branch its own selection key, so changing branch frames it", () => {
    const route = { layer: "bus", route: "52" };
    const key = (branch) => surfaceSelectionKey({ stopCodes: [], routes: [{ ...route, ...(branch ? { branch: { id: branch, path: [] } } : {}) }] });
    assert.notEqual(key("52A"), key("52F"));
    assert.notEqual(key(), key("52F"));
  });
});
