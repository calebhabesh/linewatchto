import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { releaseAssetUrl } from "../src/app/app-build.ts";
import { BUS_CATALOG_URL, cachedLoader } from "../src/app/geographic-bus-catalog.ts";
import {
  SCHEDULE_MANIFEST_URL,
  fetchScheduleAsset,
  isScheduleManifest,
  loadScheduleManifest,
  resetScheduleManifestForTests,
  scheduleAssetUrl,
} from "../src/app/schedule-assets.ts";

const STREETCAR = "/assets/linewatch/geographic/ttc-surface-streetcar.json";
const PLANS = "/assets/linewatch/geographic/ttc-station-plans.json";
const manifest = (files, network = "ttc") => ({
  schemaVersion: "1.0.0",
  generation: "abc",
  publishedAt: "2026-11-05T17:00:00Z",
  networks: { [network]: { origin: "runtime", feedVersion: "S1", feedStartDate: "2026-11-01", feedEndDate: "2026-12-19", publishedAt: "2026-11-05T17:00:00Z", files } },
});

/** Replaces fetch with `routes` (url -> Response or function), recording each request. */
function stubFetch(routes) {
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    const route = routes[String(url)];
    if (route instanceof Error) throw route;
    const response = typeof route === "function" ? route() : route;
    return response ? response.clone() : new Response("Not Found", { status: 404 });
  };
  return requested;
}
const jsonResponse = (value) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  resetScheduleManifestForTests();
});

describe("schedule manifest (plan 16)", () => {
  it("resolves a named file to its hashed URL and leaves the rest to the release", async () => {
    stubFetch({ [SCHEDULE_MANIFEST_URL]: jsonResponse(manifest({ "ttc-surface-streetcar.json": "files/ttc-surface-streetcar.0123456789abcdef.json" })) });
    assert.deepEqual(await scheduleAssetUrl(STREETCAR), { url: "/data/schedule/files/ttc-surface-streetcar.0123456789abcdef.json", fromManifest: true });
    assert.deepEqual(await scheduleAssetUrl(PLANS), { url: releaseAssetUrl(PLANS), fromManifest: false });
  });

  it("reads the manifest once per page", async () => {
    const requested = stubFetch({ [SCHEDULE_MANIFEST_URL]: jsonResponse(manifest({})) });
    await Promise.all([loadScheduleManifest(), scheduleAssetUrl(STREETCAR), scheduleAssetUrl(PLANS)]);
    assert.equal(requested.filter((url) => url === SCHEDULE_MANIFEST_URL).length, 1);
  });

  for (const [label, response] of [
    ["missing", undefined],
    ["an HTML page", new Response("<!doctype html>", { status: 200, headers: { "Content-Type": "text/html" } })],
    ["invalid", jsonResponse({ schemaVersion: "1.0.0", networks: { ttc: { files: { "x.json": "../../etc/passwd" } } } })],
    ["unreachable", new TypeError("Failed to fetch")],
  ]) {
    it(`falls back to the release's files when the manifest is ${label}`, async () => {
      stubFetch({ [SCHEDULE_MANIFEST_URL]: response });
      assert.equal(await loadScheduleManifest(), null);
      assert.deepEqual(await scheduleAssetUrl(STREETCAR), { url: releaseAssetUrl(STREETCAR), fromManifest: false });
    });
  }

  it("rereads the manifest once when a hashed file is gone, and keeps the page's choice if that fails", async () => {
    let generation = 1;
    const requested = stubFetch({
      [SCHEDULE_MANIFEST_URL]: () => jsonResponse(manifest({ "ttc-surface-streetcar.json": `files/ttc-surface-streetcar.${String(generation).repeat(16)}.json` })),
      "/data/schedule/files/ttc-surface-streetcar.2222222222222222.json": jsonResponse({ ok: 2 }),
    });
    await loadScheduleManifest();
    generation = 2;
    const response = await fetchScheduleAsset(STREETCAR);
    assert.deepEqual(await response.json(), { ok: 2 });
    assert.deepEqual(requested, [
      SCHEDULE_MANIFEST_URL,
      "/data/schedule/files/ttc-surface-streetcar.1111111111111111.json",
      SCHEDULE_MANIFEST_URL,
      "/data/schedule/files/ttc-surface-streetcar.2222222222222222.json",
    ]);
  });

  it("does not reread for a release file", async () => {
    const requested = stubFetch({});
    const response = await fetchScheduleAsset(STREETCAR);
    assert.equal(response.status, 404);
    assert.deepEqual(requested, [SCHEDULE_MANIFEST_URL, releaseAssetUrl(STREETCAR)]);
  });

  it("feeds cachedLoader, which every schedule-derived loader but the streetcar one uses", async () => {
    const hashed = "/data/schedule/files/ttc-surface-bus.0123456789abcdef.json";
    const requested = stubFetch({
      [SCHEDULE_MANIFEST_URL]: jsonResponse(manifest({ "ttc-surface-bus.json": hashed.replace("/data/schedule/", "") })),
      [hashed]: jsonResponse({ layer: "bus" }),
    });
    const value = await cachedLoader(BUS_CATALOG_URL, (v) => v?.layer === "bus", "bus routes").load();
    assert.deepEqual(value, { layer: "bus" });
    assert.deepEqual(requested, [SCHEDULE_MANIFEST_URL, hashed]);
  });

  it("accepts only paths under files/", () => {
    assert.ok(isScheduleManifest(manifest({ "a.json": "files/a.0123456789abcdef.json" })));
    assert.ok(!isScheduleManifest(manifest({ "a.json": "https://example.com/a.json" })));
    assert.ok(!isScheduleManifest({ ...manifest({}), schemaVersion: "2.0.0" }));
  });
});
