import assert from "node:assert/strict";
import { test } from "node:test";

import { connectionAllowsBulkDownload, connectionAllowsPrefetch, prefetchTileZoom, ringTiles, sortTilesNearest, tileRange } from "../src/components/map-tile-prefetch.ts";

test("prefetch picks the tile level MapLibre draws each source at", () => {
  // Raster diagram planes: 256 css px tiles, rounded zoom, clamped to the pyramid.
  const diagram = { tileSize: 256, minzoom: 8, maxzoom: 14, roundZoom: true };
  assert.equal(prefetchTileZoom(10.4, diagram), 11);
  assert.equal(prefetchTileZoom(10.6, diagram), 12);
  assert.equal(prefetchTileZoom(3, diagram), 8);
  assert.equal(prefetchTileZoom(18, diagram), 14);
  // OpenFreeMap vector tiles: 512 px, floored, overzoomed past z14.
  const vector = { tileSize: 512, minzoom: 0, maxzoom: 14, roundZoom: false };
  assert.equal(prefetchTileZoom(12.9, vector), 12);
  assert.equal(prefetchTileZoom(16, vector), 14);
});

test("prefetch loads only the ring outside the view, nearest first", () => {
  const view = { west: -79.5, south: 43.6, east: -79.3, north: 43.75 };
  const inner = tileRange(view, 12);
  const outer = tileRange({ west: -79.6, south: 43.525, east: -79.2, north: 43.825 }, 12);
  assert.ok(outer.minX < inner.minX && outer.maxX > inner.maxX && outer.minY < inner.minY && outer.maxY > inner.maxY);

  const ring = ringTiles(outer, inner, 1000);
  const outerCount = (outer.maxX - outer.minX + 1) * (outer.maxY - outer.minY + 1);
  const innerCount = (inner.maxX - inner.minX + 1) * (inner.maxY - inner.minY + 1);
  assert.equal(ring.length, outerCount - innerCount);
  for (const { x, y } of ring) {
    assert.ok(!(x >= inner.minX && x <= inner.maxX && y >= inner.minY && y <= inner.maxY));
  }
  for (let i = 1; i < ring.length; i++) assert.ok(ring[i - 1].d <= ring[i].d);
  assert.equal(ringTiles(outer, inner, 5).length, 5);
});

test("tile ranges stay inside the world at the poles and the antimeridian", () => {
  const range = tileRange({ west: -200, south: -89, east: 200, north: 89 }, 3);
  assert.deepEqual(range, { z: 3, minX: 0, maxX: 7, minY: 0, maxY: 7 });
});

test("the System Map preload takes the tiles nearest the view first", () => {
  const viewBox = { x: -200, y: -200, width: 1000 };
  const tiles = [];
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) tiles.push({ column, row });
  // Level 2 is 4 tiles of 250 units across; (480, 520) is in column 2, row 2.
  const ordered = sortTilesNearest([...tiles], { x: 480, y: 520 }, 2, viewBox);
  assert.deepEqual(ordered[0], { column: 2, row: 2 });
  assert.deepEqual(ordered.at(-1), { column: 0, row: 0 });
  // Without a view yet, the order is left as it is.
  assert.deepEqual(sortTilesNearest([...tiles], null, 2, viewBox), tiles);
});

test("bulk tile downloads respect data saver and slow links", () => {
  assert.equal(connectionAllowsPrefetch(undefined), true);
  assert.equal(connectionAllowsBulkDownload(undefined), true, "Safari reports no connection");
  assert.equal(connectionAllowsBulkDownload({ effectiveType: "4g" }), true);
  assert.equal(connectionAllowsBulkDownload({ effectiveType: "3g" }), false);
  assert.equal(connectionAllowsPrefetch({ effectiveType: "3g" }), true);
  assert.equal(connectionAllowsPrefetch({ effectiveType: "slow-2g" }), false);
  assert.equal(connectionAllowsPrefetch({ effectiveType: "4g", saveData: true }), false);
  assert.equal(connectionAllowsBulkDownload({ effectiveType: "4g", saveData: true }), false);
});

test("prefetch waits for the first view's tiles, ignoring camera jumps while the map loads", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const previous = { document: globalThis.document, window: globalThis.window };
  globalThis.document = { visibilityState: "visible" };
  globalThis.window = globalThis;
  t.after(() => Object.assign(globalThis, previous));
  const handlers = new Map();
  const map = {
    on: (type, handler) => handlers.set(type, [...(handlers.get(type) ?? []), handler]),
    once: (type, handler) => handlers.set(type, [...(handlers.get(type) ?? []), handler]),
    off: () => {},
    getBounds: () => ({ getWest: () => -79.5, getSouth: () => 43.6, getEast: () => -79.3, getNorth: () => 43.75 }),
    getZoom: () => 10,
  };
  const { installTilePrefetch } = await import("../src/components/map-tile-prefetch.ts");
  let rounds = 0;
  installTilePrefetch(map, () => { rounds += 1; return []; });
  const fire = (type) => { for (const handler of handlers.get(type) ?? []) handler(); };

  // The entrance's jumpTo while the first view loads.
  fire("movestart");
  fire("moveend");
  t.mock.timers.tick(1000);
  assert.equal(rounds, 0);

  fire("idle");
  t.mock.timers.tick(1000);
  assert.equal(rounds, 1);

  fire("moveend");
  t.mock.timers.tick(1000);
  assert.equal(rounds, 2);
});
