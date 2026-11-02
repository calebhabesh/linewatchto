import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import {
  STREETCAR_CATALOG_URL,
  isStreetcarCorridorFeature,
  isStreetcarStopFeature,
} from "../src/app/geographic-surface-catalog.ts";
import { validateCoordinate } from "../../scripts/lib/geographic-geometry.mjs";

const raw = readFileSync(new URL(`../public${STREETCAR_CATALOG_URL}`, import.meta.url), "utf8");
const catalog = JSON.parse(raw);
const corridors = catalog.features.filter(isStreetcarCorridorFeature);
const stops = catalog.features.filter(isStreetcarStopFeature);
const routesByNumber = new Map(catalog.routes.map(route => [route.route, route]));

describe("streetcar catalog asset", () => {
  it("names its open-data source and schedule period", () => {
    assert.equal(catalog.schemaVersion, "1.0.0");
    assert.equal(catalog.network, "ttc");
    assert.equal(catalog.layer, "streetcar");
    assert.equal(catalog.source.publisher, "Toronto Transit Commission (TTC)");
    assert.equal(catalog.source.license, "Open Government Licence – Toronto");
    assert.equal(
      catalog.source.attribution,
      "Contains information licensed under the Open Government Licence – Toronto.",
    );
    assert.match(catalog.source.feedVersion, /\S/);
    assert.match(catalog.source.feedStartDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(catalog.source.feedEndDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(catalog.source.archiveSha256, /^[0-9a-f]{64}$/);
  });

  it("holds only corridors and stops, every feature with a known id", () => {
    assert.equal(corridors.length + stops.length, catalog.features.length);
    assert.ok(corridors.length > 0 && stops.length > 0);
    const ids = catalog.features.map(feature => feature.id);
    assert.equal(new Set(ids).size, ids.length, "feature ids are unique");
  });

  it("draws only daytime streetcar routes that run streetcars", () => {
    for (const route of catalog.routes) {
      assert.match(route.route, /^5\d\d$/, `${route.route} is a daytime streetcar route`);
      assert.equal(route.drawn, route.weekdayTrips.streetcar > 0,
        `${route.route} is drawn only when weekday streetcar trips run`);
    }
    for (const corridor of corridors) {
      assert.ok(corridor.properties.routes.length > 0, `${corridor.id} carries routes`);
      for (const route of corridor.properties.routes) {
        assert.equal(routesByNumber.get(route)?.drawn, true, `${corridor.id} draws ${route}`);
      }
    }
    const drawn = new Set(corridors.flatMap(corridor => corridor.properties.routes));
    for (const route of catalog.routes.filter(route => route.drawn)) {
      assert.ok(drawn.has(route.route), `${route.route} has a corridor`);
    }
  });

  it("keeps coordinates valid and inside the region", () => {
    for (const corridor of corridors) {
      assert.ok(corridor.geometry.coordinates.length >= 2, corridor.id);
      corridor.geometry.coordinates.forEach(coordinate => validateCoordinate(coordinate));
    }
    for (const stop of stops) validateCoordinate(stop.geometry.coordinates);
  });

  it("gives each stop its routes and, where published, its pole number", () => {
    for (const stop of stops) {
      assert.ok(stop.properties.routes.length > 0, stop.id);
      assert.ok(stop.properties.routes.every(route => routesByNumber.has(route)), stop.id);
      if (stop.properties.stopCode !== undefined) assert.match(stop.properties.stopCode, /^\d+$/, stop.id);
    }
    const numbered = stops.filter(stop => stop.properties.stopCode).length;
    assert.ok(numbered / stops.length > 0.9, `${numbered} of ${stops.length} stops have pole numbers`);
  });

  it("stays light enough to load with the Map View", () => {
    assert.ok(Buffer.byteLength(raw) <= 200 * 1024, `raw ${Buffer.byteLength(raw)} bytes`);
    assert.ok(gzipSync(raw).length <= 40 * 1024, `gzipped ${gzipSync(raw).length} bytes`);
  });
});
