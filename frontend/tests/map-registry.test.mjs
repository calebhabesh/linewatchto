import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";

import { MAP_MANIFESTS, NETWORK_MAPS, mapArtworkUrl } from "../src/app/map-manifests.ts";
import { RASTER_MAP_PLANES_BY_MAP } from "../src/app/map-raster-manifest.ts";
import { DEFAULT_TTC_MAP_SOURCE } from "../src/app/map-preload.ts";
import { DEFAULT_REGIONAL_MAP_SOURCE } from "../src/app/regional-map-asset.ts";

describe("System Maps by id", () => {
  it("names each map by its id and gives it a network", () => {
    for (const [id, manifest] of Object.entries(MAP_MANIFESTS)) {
      assert.equal(manifest.id, id);
      assert.ok(manifest.network in NETWORK_MAPS, `${id} shows a known network`);
    }
  });

  it("shows each network a map of that network", () => {
    assert.deepEqual(Object.keys(NETWORK_MAPS).sort(), ["regional", "ttc"]);
    for (const [network, mapId] of Object.entries(NETWORK_MAPS)) {
      assert.equal(MAP_MANIFESTS[mapId]?.network, network);
    }
  });

  it("serves each map's SVG from its manifest path, with raster planes keyed by map", () => {
    for (const manifest of Object.values(MAP_MANIFESTS)) {
      const url = mapArtworkUrl(manifest);
      assert.match(url, /^\/assets\//);
      assert.ok(existsSync(new URL(`../public${url}`, import.meta.url)), `${url} exists`);
      assert.deepEqual(manifest.rasterPlanes, RASTER_MAP_PLANES_BY_MAP[manifest.id]);
    }
    assert.equal(DEFAULT_TTC_MAP_SOURCE, "/assets/linewatch/ttc-subway-map-custom.svg");
    assert.equal(DEFAULT_REGIONAL_MAP_SOURCE, "/assets/linewatch/regional-rail-map.svg");
  });
});
