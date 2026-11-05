import assert from "node:assert/strict";
import { test } from "node:test";
import { lineWatchBuildLabel, releaseAssetUrl } from "../src/app/app-build.ts";
import { BUS_CATALOG_URL, cachedLoader } from "../src/app/geographic-bus-catalog.ts";
import { SCHEDULE_MANIFEST_URL, resetScheduleManifestForTests } from "../src/app/schedule-assets.ts";

test("without a schedule manifest, geographic JSON is requested per release, since /assets/* is served immutable", async () => {
  assert.equal(releaseAssetUrl(BUS_CATALOG_URL), `${BUS_CATALOG_URL}?v=${encodeURIComponent(lineWatchBuildLabel)}`);
  const requested = [];
  const originalFetch = globalThis.fetch;
  resetScheduleManifestForTests();
  globalThis.fetch = async (url) => {
    requested.push(url);
    return url === SCHEDULE_MANIFEST_URL ? new Response("Not Found", { status: 404 }) : new Response("{}");
  };
  try {
    await cachedLoader(BUS_CATALOG_URL, (value) => typeof value === "object", "bus routes").load();
  } finally {
    globalThis.fetch = originalFetch;
    resetScheduleManifestForTests();
  }
  assert.deepEqual(requested, [SCHEDULE_MANIFEST_URL, releaseAssetUrl(BUS_CATALOG_URL)]);
});
