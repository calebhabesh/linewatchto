import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const prodCaddyfile = readFileSync(new URL("../../Caddyfile", import.meta.url), "utf8");
const stagingCaddyfile = readFileSync(new URL("../../Caddyfile.staging", import.meta.url), "utf8");
const awsLabCaddyfile = readFileSync(new URL("../../Caddyfile.aws-lab", import.meta.url), "utf8");
const trafficSpikeRunbook = readFileSync(new URL("../../docs/traffic-spike-runbook.md", import.meta.url), "utf8");

function assertCachePolicy(source, label) {
  assert.match(source, /\(linewatch_cache_headers\)/, `${label} should define reusable cache headers`);
  assert.match(source, /@linewatch_static_cache/, `${label} should define static cache matcher`);
  assert.match(source, /\/_next\/static\/\*/, `${label} should cache Next static chunks`);
  assert.match(source, /\/assets\/\*/, `${label} should cache public assets`);
  assert.match(source, /@linewatch_public_api_cache/, `${label} should define public API cache matcher`);
  assert.match(source, /\/api\/dashboard/, `${label} should cache aggregate dashboard endpoint`);
  assert.match(source, /\/api\/trains/, `${label} should cache public train marker endpoint`);
  assert.match(source, /\/api\/alerts/, `${label} should cache public alert endpoint`);
  assert.match(source, /\/api\/announcements/, `${label} should cache public announcements endpoint`);
  assert.match(source, /\/api\/stations/, `${label} should cache public stations endpoint`);
  assert.match(source, /\/api\/stations\/\*/, `${label} should cache dynamic station detail endpoint`);
  assert.match(source, /\/api\/alert-history/, `${label} should cache public alert history endpoint`);
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

  it("sets matching public and private cache headers in aws lab", () => {
    assertCachePolicy(awsLabCaddyfile, "Caddyfile.aws-lab");
  });

  it("documents public APIs including train markers, station details, and alert history in traffic spike runbook", () => {
    assert.match(trafficSpikeRunbook, /"\/api\/trains"/, "runbook should include train markers in cache rules");
    assert.match(trafficSpikeRunbook, /"\/api\/stations"/, "runbook should include stations in cache rules");
    assert.match(trafficSpikeRunbook, /starts_with\(http\.request\.uri\.path, "\/api\/stations\/"\)/, "runbook should include dynamic station details in cache rules");
    assert.match(trafficSpikeRunbook, /"\/api\/alert-history"/, "runbook should include alert history in cache rules");
    assert.match(trafficSpikeRunbook, /"\/api\/announcements"/, "runbook should include announcements in cache rules");
    assert.match(trafficSpikeRunbook, /curl -I https:\/\/linewatchto\.ca\/api\/trains/, "runbook should verify train marker cache headers");
    assert.match(trafficSpikeRunbook, /curl -I https:\/\/linewatchto\.ca\/api\/stations\/union/, "runbook should verify station detail cache headers");
    assert.match(trafficSpikeRunbook, /curl -I https:\/\/linewatchto\.ca\/api\/alert-history/, "runbook should verify alert history cache headers");
    assert.match(trafficSpikeRunbook, /curl -I https:\/\/linewatchto\.ca\/api\/announcements/, "runbook should verify announcement cache headers");
    assert.match(trafficSpikeRunbook, /autocannon .*https:\/\/linewatchto\.ca\/api\/trains/, "runbook should load-test train markers");
    assert.match(trafficSpikeRunbook, /autocannon .*https:\/\/linewatchto\.ca\/api\/stations\/union/, "runbook should load-test station details");
    assert.match(trafficSpikeRunbook, /autocannon .*https:\/\/linewatchto\.ca\/api\/alert-history/, "runbook should load-test alert history");
  });
});
