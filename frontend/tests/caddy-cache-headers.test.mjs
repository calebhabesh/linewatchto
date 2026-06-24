import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const prodCaddyfile = readFileSync(new URL("../../Caddyfile", import.meta.url), "utf8");
const stagingCaddyfile = readFileSync(new URL("../../Caddyfile.staging", import.meta.url), "utf8");

function assertCachePolicy(source, label) {
  assert.match(source, /\(linewatch_cache_headers\)/, `${label} should define reusable cache headers`);
  assert.match(source, /@linewatch_static_cache/, `${label} should define static cache matcher`);
  assert.match(source, /\/_next\/static\/\*/, `${label} should cache Next static chunks`);
  assert.match(source, /\/assets\/\*/, `${label} should cache public assets`);
  assert.match(source, /@linewatch_public_api_cache/, `${label} should define public API cache matcher`);
  assert.match(source, /\/api\/dashboard/, `${label} should cache aggregate dashboard endpoint`);
  assert.match(source, /\/api\/alerts/, `${label} should cache public alert endpoint`);
  assert.match(source, /s-maxage=30/, `${label} should expose a short shared-cache TTL`);
  assert.match(source, /@linewatch_private_api_no_store/, `${label} should define private API no-store matcher`);
  assert.match(source, /\/api\/auth\/\*/, `${label} should keep auth uncached`);
  assert.match(source, /\/api\/account\/\*/, `${label} should keep account APIs uncached`);
  assert.match(source, /\/api\/feedback/, `${label} should keep feedback uncached`);
  assert.match(source, /Cache-Control "no-store"/, `${label} should set no-store`);
}

describe("Caddy cache headers", () => {
  it("sets public and private cache headers in production", () => {
    assertCachePolicy(prodCaddyfile, "Caddyfile");
  });

  it("sets matching public and private cache headers in staging", () => {
    assertCachePolicy(stagingCaddyfile, "Caddyfile.staging");
  });
});
