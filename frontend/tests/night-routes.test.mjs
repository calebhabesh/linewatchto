import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  NIGHT_BADGE_MIN_ZOOM,
  nightBadgeImageId,
  nightBadgeRoutes,
  nightCardRows,
  nightCorridors,
} from "../src/app/night-route-catalog.ts";
import { BUS_BADGE_MIN_ZOOM } from "../src/app/geographic-bus-catalog.ts";
import {
  NIGHT_BUS_LINE_LAYER,
  NIGHT_PRESS_LAYERS,
  NIGHT_STREETCAR_LINE_LAYER,
  hasNightLayers,
  installNightLayers,
  removeNightLayers,
  updateNightFilter,
} from "../src/components/geographic-night-layers.ts";
import { BUS_CASING_LAYER, installBusLayers } from "../src/components/geographic-bus-layers.ts";

const asset = JSON.parse(readFileSync(new URL("../public/assets/linewatch/geographic/ttc-surface-night.json", import.meta.url), "utf8"));

describe("night route asset (plan 13, S10)", () => {
  it("draws every 300-series route from the weekday night schedule, each corridor one kind", () => {
    assert.equal(asset.layer, "night");
    assert.equal(asset.source.servicePattern, "weekday-night");
    assert.equal(asset.routes.length, 35);
    assert.ok(asset.routes.every((route) => /^3\d\d$/.test(route.route) && route.drawn));
    assert.deepEqual(asset.routes.filter((route) => route.kind === "streetcar").map((route) => route.route),
      ["301", "304", "305", "306", "310", "312"]);
    const kindOf = new Map(asset.routes.map((route) => [route.route, route.kind]));
    for (const feature of asset.features) {
      assert.equal(feature.properties.featureType, "night-corridor");
      assert.ok(feature.properties.routes.every((route) => kindOf.get(route) === feature.properties.kind),
        `${feature.id} mixes kinds`);
    }
    assert.ok(!asset.features.some((feature) => feature.geometry.type === "Point"), "no night stop file or stops");
  });
});

describe("night route helpers", () => {
  it("name badge images per kind, so a streetcar badge row never takes a bus route", () => {
    const id = nightBadgeImageId("streetcar", ["301", "304"]);
    assert.deepEqual(nightBadgeRoutes("streetcar", id), ["301", "304"]);
    assert.equal(nightBadgeRoutes("bus", id), null);
    assert.equal(nightBadgeRoutes("bus", "bus-badges:29"), null);
    assert.equal(NIGHT_BADGE_MIN_ZOOM <= BUS_BADGE_MIN_ZOOM, true);
  });

  it("list the night routes on a line, noting a night streetcar's replacement buses", () => {
    const rows = nightCardRows(asset, ["301", "320", "999"]);
    assert.deepEqual(rows.map((row) => [row.route, row.replacementBuses]), [["301", true], ["320", false]]);
    assert.equal(nightCorridors(asset, "streetcar").features.every((f) => f.properties.kind === "streetcar"), true);
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

describe("night layers", () => {
  const busCatalog = { features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[-79.4, 43.65], [-79.3, 43.65]] }, properties: { routes: ["29"] } }] };

  it("sit under the daytime bus lines, streetcar night routes solid and bus night routes dashed", () => {
    const map = createMockMap(["transit-streetcar-casing", "transit-routes-casing", "transit-stations-outer"]);
    installBusLayers(map, busCatalog, { dark: false, activeFilteredLine: null });
    installNightLayers(map, asset, { dark: false, activeFilteredLine: null });
    installNightLayers(map, asset, { dark: false, activeFilteredLine: null });
    const ids = map.layers.map((layer) => layer.id);
    assert.ok(ids.indexOf(NIGHT_STREETCAR_LINE_LAYER) < ids.indexOf(BUS_CASING_LAYER));
    assert.ok(ids.indexOf(NIGHT_BUS_LINE_LAYER) < ids.indexOf(BUS_CASING_LAYER));
    assert.equal(ids.filter((id) => id === NIGHT_BUS_LINE_LAYER).length, 1);
    const streetcar = map.layers.find((layer) => layer.id === NIGHT_STREETCAR_LINE_LAYER);
    const bus = map.layers.find((layer) => layer.id === NIGHT_BUS_LINE_LAYER);
    assert.equal(streetcar.paint["line-dasharray"], undefined);
    assert.ok(Array.isArray(bus.paint["line-dasharray"]));
    assert.equal(streetcar.paint["line-color"], "#0054A6");
    assert.ok(NIGHT_PRESS_LAYERS.every((id) => ids.includes(id)));
    assert.ok(hasNightLayers(map));
  });

  it("take the lighter night blue on the dark map, dim under a line filter, and go when buses turn off", () => {
    const map = createMockMap(["transit-stations-outer"]);
    installNightLayers(map, asset, { dark: true, activeFilteredLine: null });
    assert.notEqual(map.layers.find((layer) => layer.id === NIGHT_BUS_LINE_LAYER).paint["line-color"], "#0054A6");
    updateNightFilter(map, "line-1");
    assert.ok(map.paint.some((entry) => entry.layer === NIGHT_BUS_LINE_LAYER && entry.property === "line-opacity"));
    removeNightLayers(map);
    assert.deepEqual(map.layers.map((layer) => layer.id), ["transit-stations-outer"]);
    assert.equal(Object.keys(map.sources).length, 0);
  });
});
