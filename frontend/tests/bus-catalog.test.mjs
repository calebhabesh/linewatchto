import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { BUS_CATALOG_URL, BUS_STOPS_URL } from "../src/app/geographic-bus-catalog.ts";
import { STREETCAR_CATALOG_URL } from "../src/app/geographic-surface-catalog.ts";
import { validateCoordinate } from "../../scripts/lib/geographic-geometry.mjs";

// Plan 13, S5: the TTC bus corridors and their stops, generated from the same
// static GTFS archive as the streetcar asset.
const read = (url) => readFileSync(new URL(`../public${url}`, import.meta.url), "utf8");
const raw = read(BUS_CATALOG_URL);
const stopsRaw = read(BUS_STOPS_URL);
const catalog = JSON.parse(raw);
const stops = JSON.parse(stopsRaw);
const streetcar = JSON.parse(read(STREETCAR_CATALOG_URL));
const routesByNumber = new Map(catalog.routes.map((route) => [route.route, route]));

describe("bus catalog assets", () => {
  it("name their open-data source and match the streetcar asset's schedule period", () => {
    for (const asset of [catalog, stops]) {
      assert.equal(asset.network, "ttc");
      assert.equal(asset.source.license, "Open Government Licence – Toronto");
      assert.equal(asset.source.publisher, "Toronto Transit Commission (TTC)");
      for (const key of ["feedVersion", "feedStartDate", "feedEndDate", "archiveSha256"]) {
        assert.equal(asset.source[key], streetcar.source[key], `${key} matches the streetcar asset`);
      }
    }
    assert.equal(catalog.layer, "bus");
    assert.equal(stops.layer, "bus-stops");
  });

  it("draws only daytime bus routes, every drawn route with a corridor", () => {
    for (const route of catalog.routes) {
      assert.match(route.route, /^\d+$/);
      assert.doesNotMatch(route.route, /^3\d\d$/, `${route.route} is not a night route`);
      assert.doesNotMatch(route.route, /^5\d\d$/, `${route.route} is not a streetcar route`);
    }
    const drawn = new Set(catalog.features.flatMap((feature) => feature.properties.routes));
    for (const route of catalog.routes.filter((route) => route.drawn)) {
      assert.ok(drawn.has(route.route), `${route.route} has a corridor`);
    }
    for (const feature of catalog.features) {
      assert.equal(feature.properties.featureType, "bus-corridor");
      assert.ok(feature.properties.routes.every((route) => routesByNumber.get(route)?.drawn), feature.id);
      assert.ok(feature.geometry.coordinates.length >= 2, feature.id);
      feature.geometry.coordinates.forEach((coordinate) => validateCoordinate(coordinate));
    }
    // Every daytime route of feed S1000544 draws, Community routes included.
    assert.ok(catalog.routes.filter((route) => route.drawn).length / catalog.routes.length > 0.97);
  });

  it("gives every stop a pole number, a name and routes the corridors carry", () => {
    const codes = new Set();
    for (const stop of stops.features) {
      assert.equal(stop.properties.featureType, "bus-stop");
      assert.match(stop.properties.stopCode, /^\d+$/);
      assert.ok(stop.properties.name);
      assert.ok(stop.properties.routes.length > 0 && stop.properties.routes.every((route) => routesByNumber.has(route)));
      validateCoordinate(stop.geometry.coordinates);
      codes.add(stop.properties.stopCode);
    }
    assert.equal(codes.size, stops.features.length, "pole numbers are unique");
  });

  it("stays within its load budgets: corridors with the toggle, stops near stop zoom", () => {
    assert.ok(gzipSync(raw).length <= 140 * 1024, `corridors gzipped ${gzipSync(raw).length} bytes`);
    assert.ok(Buffer.byteLength(raw) <= 750 * 1024, `corridors raw ${Buffer.byteLength(raw)} bytes`);
    assert.ok(gzipSync(stopsRaw).length <= 200 * 1024, `stops gzipped ${gzipSync(stopsRaw).length} bytes`);
  });
});
