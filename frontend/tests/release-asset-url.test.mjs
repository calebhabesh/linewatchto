import assert from "node:assert/strict";
import { test } from "node:test";
import { lineWatchBuildLabel, releaseAssetUrl } from "../src/app/app-build.ts";
import { BUS_CATALOG_URL, cachedLoader } from "../src/app/geographic-bus-catalog.ts";

test("geographic JSON is requested per release, since /assets/* is served immutable", async () => {
  assert.equal(releaseAssetUrl(BUS_CATALOG_URL), `${BUS_CATALOG_URL}?v=${encodeURIComponent(lineWatchBuildLabel)}`);
  const requested = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { requested.push(url); return new Response("{}"); };
  try {
    await cachedLoader(BUS_CATALOG_URL, (value) => typeof value === "object", "bus routes").load();
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(requested, [releaseAssetUrl(BUS_CATALOG_URL)]);
});
