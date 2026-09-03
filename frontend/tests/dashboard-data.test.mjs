import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const dashboardDataSource = readFileSync(new URL("../src/app/dashboard-data.ts", import.meta.url), "utf8");
const dashboardAdapterSource = readFileSync(new URL("../src/app/dashboard-adapter.ts", import.meta.url), "utf8");
const dashboardClientSource = readFileSync(new URL("../src/app/dashboard-client.ts", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const dockerfileSource = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
const prodBuildPushSource = readFileSync(new URL("../../scripts/prod-build-push.sh", import.meta.url), "utf8");
const stagingComposeSource = readFileSync(new URL("../../docker-compose.staging.yml", import.meta.url), "utf8");

describe("dashboard spike mitigation", () => {
  it("prefers the single aggregate dashboard endpoint before legacy fan-out", () => {
    assert.match(dashboardDataSource, /fetchSafe<DashboardApiResponse>\("\/api\/dashboard\?network=ttc"\)/);
    assert.match(dashboardDataSource, /loadDashboardFromAggregate/);
    assert.match(dashboardDataSource, /loadDashboardFromLegacyEndpoints/);
  });

  it("keeps fixture fallback when backend dashboard data is unavailable", () => {
    assert.match(dashboardDataSource, /dataSource: "fallback"/);
    assert.match(dashboardAdapterSource, /dataSource: availability === "unavailable" \? "fallback" : "backend"/);
    assert.match(dashboardDataSource, /fallbackSegments/);
    assert.match(dashboardDataSource, /fallbackPerformance/);
  });

  it("uses a slower default dashboard refresh for production spike tolerance", () => {
    assert.match(shellSource, /const DEFAULT_DASHBOARD_REFRESH_MS = 30_000;/);
    assert.match(shellSource, /const MIN_DASHBOARD_REFRESH_MS = 10_000;/);
  });

  it("passes dashboard refresh interval as an optional build-time value", () => {
    assert.match(dockerfileSource, /ARG NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS/);
    assert.match(dockerfileSource, /ENV NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS=\$\{NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS\}/);
    assert.match(prodBuildPushSource, /NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS/);
  });

  it("aligns container train-marker polling with the smooth local cadence", () => {
    assert.match(dockerfileSource, /ARG NEXT_PUBLIC_LINEWATCH_TRAIN_MARKER_REFRESH_MS/);
    assert.match(dockerfileSource, /ENV NEXT_PUBLIC_LINEWATCH_TRAIN_MARKER_REFRESH_MS=\$\{NEXT_PUBLIC_LINEWATCH_TRAIN_MARKER_REFRESH_MS\}/);
    assert.match(stagingComposeSource, /NEXT_PUBLIC_LINEWATCH_TRAIN_MARKER_REFRESH_MS: \$\{NEXT_PUBLIC_LINEWATCH_TRAIN_MARKER_REFRESH_MS:-4000\}/);
    assert.match(prodBuildPushSource, /NEXT_PUBLIC_LINEWATCH_TRAIN_MARKER_REFRESH_MS=\$\{NEXT_PUBLIC_LINEWATCH_TRAIN_MARKER_REFRESH_MS:-4000\}/);
  });

  it("retains dashboard snapshots while browser refreshes retry in the background", () => {
    assert.match(dashboardClientSource, /DASHBOARD_RETRY_DELAYS_MS = \[1_000, 2_500\]/);
    assert.match(shellSource, /dashboardRefreshInFlightRef/);
    assert.match(shellSource, /retryDashboardRefresh/);
    assert.doesNotMatch(shellSource, /catch \{\s*setRegionalData\(regionalDashboardData\);/);
  });
});
