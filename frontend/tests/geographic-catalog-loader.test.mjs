import assert from "node:assert/strict";
import { test } from "node:test";
import { cachedGeographicCatalog, loadGeographicCatalog } from "../src/app/geographic-catalog-loader.ts";

test("catalog preparation shares pending work and reuses a successful catalog", async t => {
  let requests = 0;
  let release;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    await new Promise(resolve => { release = resolve; });
    return Response.json({ network: "ttc", features: [] });
  });
  assert.equal(cachedGeographicCatalog("ttc"), null);
  const first = loadGeographicCatalog("ttc");
  const second = loadGeographicCatalog("ttc");
  assert.equal(first, second);
  assert.equal(requests, 1);
  release();
  const catalog = await first;
  assert.equal(await loadGeographicCatalog("ttc"), catalog);
  assert.equal(cachedGeographicCatalog("ttc"), catalog);
  assert.equal(requests, 1);
});

test("failed or mismatched catalogs are not cached and can be retried", async t => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    if (requests === 1) return new Response("Unavailable", { status: 503 });
    return Response.json({ network: requests === 2 ? "ttc" : "regional", features: [] });
  });
  await assert.rejects(loadGeographicCatalog("regional"), /503/);
  assert.equal(cachedGeographicCatalog("regional"), null);
  await assert.rejects(loadGeographicCatalog("regional"), /Invalid geographic/);
  assert.equal(cachedGeographicCatalog("regional"), null);
  assert.equal((await loadGeographicCatalog("regional")).network, "regional");
  assert.equal(requests, 3);
});
