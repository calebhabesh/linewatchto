import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const prodCaddyfile = readFileSync(new URL("../../Caddyfile", import.meta.url), "utf8");
const stagingCaddyfile = readFileSync(new URL("../../Caddyfile.staging", import.meta.url), "utf8");
const awsLabCaddyfile = readFileSync(new URL("../../Caddyfile.aws-lab", import.meta.url), "utf8");
const trafficSpikeRunbook = readFileSync(new URL("../../docs/traffic-spike-runbook.md", import.meta.url), "utf8");
const applicationConfig = readFileSync(new URL("../../backend/src/main/resources/application.yml", import.meta.url), "utf8");
const devLiveConfig = readFileSync(new URL("../../backend/src/main/resources/application-dev-live.yml", import.meta.url), "utf8");
const stagingCompose = readFileSync(new URL("../../docker-compose.staging.yml", import.meta.url), "utf8");
const productionCompose = readFileSync(new URL("../../docker-compose.prod.yml", import.meta.url), "utf8");

function assertCachePolicy(source, label) {
  assert.match(source, /\(linewatch_cache_headers\)/, `${label} should define reusable cache headers`);
  assert.match(source, /@linewatch_static_cache/, `${label} should define static cache matcher`);
  assert.match(source, /\/_next\/static\/\*/, `${label} should cache Next static chunks`);
  assert.match(source, /\/assets\/\*/, `${label} should cache public assets`);
  assert.match(source, /@linewatch_public_api_cache/, `${label} should define public API cache matcher`);
  assert.match(source, /\/api\/dashboard/, `${label} should cache aggregate dashboard endpoint`);
  assert.match(source, /@linewatch_train_marker_api_cache\s*\{\s*path \/api\/trains \/api\/regional\/trains\s*\}/, `${label} should isolate train marker cache cadence`);
  assert.match(source, /@linewatch_train_marker_api_cache Cache-Control "public, max-age=0, s-maxage=4, stale-while-revalidate=4"/, `${label} should align train marker cache freshness with polling`);
  assert.match(source, /\/api\/alerts/, `${label} should cache public alert endpoint`);
  assert.match(source, /\/api\/announcements/, `${label} should cache public announcements endpoint`);
  assert.match(source, /\/api\/stations/, `${label} should cache public stations endpoint`);
  assert.match(source, /@linewatch_station_api_no_store\s*\{\s*path \/api\/stations\/\* \/api\/regional\/stations\/\*\s*\}/, `${label} should isolate dynamic station APIs`);
  assert.match(source, /@linewatch_station_api_no_store Cache-Control "no-store"/, `${label} should keep station arrivals uncached`);
  assert.match(source, /\/api\/alert-history/, `${label} should cache public alert history endpoint`);
  assert.match(source, /s-maxage=30/, `${label} should expose a short shared-cache TTL`);
  const publicApiMatcher = source.match(/@linewatch_public_api_cache\s*\{\s*path ([^\n]+)\s*\}/)?.[1] ?? "";
  assert.doesNotMatch(publicApiMatcher, /\/api\/trains|\/api\/regional\/trains/, `${label} should not apply dashboard TTLs to train markers`);
  assert.doesNotMatch(publicApiMatcher, /\/api\/stations\/\*|\/api\/regional\/stations\/\*/, `${label} should not cache dynamic station APIs`);
  assert.match(source, /@linewatch_private_api_no_store/, `${label} should define private API no-store matcher`);
  assert.match(source, /\/api\/auth\/\*/, `${label} should keep auth uncached`);
  assert.match(source, /\/api\/account\/\*/, `${label} should keep account APIs uncached`);
  assert.match(source, /\/api\/admin\/\*/, `${label} should classify operator APIs as private`);
  assert.match(source, /\/api\/diagnostics\/\*/, `${label} should keep diagnostics uncached`);
  assert.match(source, /\/api\/feedback/, `${label} should keep feedback uncached`);
  assert.match(source, /Cache-Control "no-store"/, `${label} should set no-store`);
  assert.match(source, /handle \/api\/admin\/\* \{\s*respond 404\s*\}/, `${label} should block operator APIs at the public edge`);
  assert.doesNotMatch(source, /\/api\/regional\/alerts\/raw/, `${label} should not cache the retired raw-alert route`);
}

function assertRawDiagnosticsBlocked(source, label) {
  assert.match(
    source,
    /handle \/api\/diagnostics\/raw-alerts\/\* \{\s*respond 404\s*\}/,
    `${label} should block browser-visible raw diagnostics at the edge`,
  );
}

describe("Caddy cache headers", () => {
  it("sets public and private cache headers in production", () => {
    assertCachePolicy(prodCaddyfile, "Caddyfile");
    assertRawDiagnosticsBlocked(prodCaddyfile, "Caddyfile");
  });

  it("sets matching public and private cache headers in staging", () => {
    assertCachePolicy(stagingCaddyfile, "Caddyfile.staging");
    assert.doesNotMatch(
      stagingCaddyfile,
      /handle \/api\/diagnostics\/raw-alerts\/\*/,
      "staging should pass enabled raw diagnostics through to the backend",
    );
  });

  it("sets matching public and private cache headers in aws lab", () => {
    assertCachePolicy(awsLabCaddyfile, "Caddyfile.aws-lab");
    assertRawDiagnosticsBlocked(awsLabCaddyfile, "Caddyfile.aws-lab");
  });

  it("enables raw diagnostics only in explicit non-production configuration", () => {
    assert.match(applicationConfig, /LINEWATCH_DIAGNOSTICS_RAW_ALERTS_ENABLED:false/);
    assert.match(devLiveConfig, /raw-alerts:\s+enabled: true/);
    assert.match(stagingCompose, /LINEWATCH_DIAGNOSTICS_RAW_ALERTS_ENABLED: "true"/);
    assert.doesNotMatch(productionCompose, /LINEWATCH_DIAGNOSTICS_RAW_ALERTS_ENABLED/);
  });

  it("documents public API caching and dynamic station cache bypass in traffic spike runbook", () => {
    assert.match(trafficSpikeRunbook, /"\/api\/trains"/, "runbook should include train markers in cache rules");
    assert.match(trafficSpikeRunbook, /"\/api\/stations"/, "runbook should include stations in cache rules");
    assert.match(trafficSpikeRunbook, /starts_with\(http\.request\.uri\.path, "\/api\/stations\/"\)/, "runbook should include dynamic station details in bypass rules");
    assert.match(trafficSpikeRunbook, /starts_with\(http\.request\.uri\.path, "\/api\/regional\/stations\/"\)/, "runbook should include regional station arrivals in bypass rules");
    assert.match(trafficSpikeRunbook, /"\/api\/alert-history"/, "runbook should include alert history in cache rules");
    assert.match(trafficSpikeRunbook, /"\/api\/announcements"/, "runbook should include announcements in cache rules");
    assert.match(trafficSpikeRunbook, /curl -I https:\/\/linewatchto\.ca\/api\/trains/, "runbook should verify train marker cache headers");
    assert.match(trafficSpikeRunbook, /curl -I https:\/\/linewatchto\.ca\/api\/stations\/union/, "runbook should verify station detail cache headers");
    assert.match(trafficSpikeRunbook, /curl -I https:\/\/linewatchto\.ca\/api\/regional\/stations\/bloor\/arrivals/, "runbook should verify regional arrival cache headers");
    assert.match(trafficSpikeRunbook, /curl -I https:\/\/linewatchto\.ca\/api\/alert-history/, "runbook should verify alert history cache headers");
    assert.match(trafficSpikeRunbook, /curl -I https:\/\/linewatchto\.ca\/api\/announcements/, "runbook should verify announcement cache headers");
    assert.match(trafficSpikeRunbook, /autocannon .*https:\/\/linewatchto\.ca\/api\/trains/, "runbook should load-test train markers");
    assert.match(trafficSpikeRunbook, /autocannon .*https:\/\/linewatchto\.ca\/api\/stations\/union/, "runbook should load-test station details");
    assert.match(trafficSpikeRunbook, /autocannon .*https:\/\/linewatchto\.ca\/api\/alert-history/, "runbook should load-test alert history");
  });
});
