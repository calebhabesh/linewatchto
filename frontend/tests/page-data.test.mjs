import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const dashboardDataSource = readFileSync(new URL("../src/app/dashboard-data.ts", import.meta.url), "utf8");
const dashboardAdapterSource = readFileSync(new URL("../src/app/dashboard-adapter.ts", import.meta.url), "utf8");
const dashboardSessionSource = readFileSync(new URL("../src/hooks/useDashboardSession.ts", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const regionalDataSource = readFileSync(new URL("../src/app/regional-data.ts", import.meta.url), "utf8");
const regionalStationDetailSource = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");

describe("dashboard server data binding", () => {
  it("trusts map API overlay metadata instead of rebuilding reduced speed zone impacts", () => {
    assert.doesNotMatch(dashboardDataSource, /networkSegments = networkSegments\.map/);
    assert.doesNotMatch(dashboardDataSource, /alertId:\s*alert\.id/);
    assert.match(dashboardAdapterSource, /networkSegments:\s*payload\.map\.segments/);
    assert.match(dashboardDataSource, /networkSegments:\s*fallbackSegments/);
  });

  it("refreshes open dashboards through the resilient browser data path", () => {
    assert.match(shellSource, /useRouter/);
    assert.match(shellSource, /useDashboardSession/);
    assert.match(shellSource, /dashboardRefreshIntervalMs/);
    assert.match(dashboardSessionSource, /getDashboardRefresh/);
    assert.match(dashboardSessionSource, /retryDashboardRefresh/);
    assert.match(dashboardSessionSource, /document\.visibilityState !== "visible"/);
    assert.match(dashboardSessionSource, /visibilitychange/);
  });

  it("keeps selected station detail fresh while the submenu remains open", () => {
    assert.match(shellSource, /STATION_DETAIL_REFRESH_MS\s*=\s*15_000/);
    assert.match(shellSource, /fetchStationDetail/);
    assert.match(shellSource, /fetchStationDetail\(true\)/);
    assert.match(shellSource, /fetchStationDetail\(false\)/);
    assert.match(shellSource, /if \(showLoading\) \{/);
    assert.match(shellSource, /window\.setInterval\(\(\) => \{[\s\S]*fetchStationDetail\(false\);[\s\S]*\}, STATION_DETAIL_REFRESH_MS\)/);
    assert.match(shellSource, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
    assert.match(shellSource, /getStationDetail\(selectedStationId/);
    assert.match(shellSource, /controller\?\.abort\(\)/);
  });

  it("refreshes regional arrivals while the station submenu remains open", () => {
    assert.match(regionalStationDetailSource, /REGIONAL_ARRIVAL_REFRESH_MS\s*=\s*15_000/);
    assert.match(regionalStationDetailSource, /const refreshArrivals = \(\) =>/);
    assert.match(regionalStationDetailSource, /window\.setInterval\(\(\) => \{[\s\S]*refreshArrivals\(\);[\s\S]*\}, REGIONAL_ARRIVAL_REFRESH_MS\)/);
    assert.match(regionalStationDetailSource, /document\.visibilityState === "visible"/);
    assert.match(regionalStationDetailSource, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
    assert.match(regionalStationDetailSource, /controller\?\.abort\(\)/);
  });

  it("pauses dashboard refresh while the closed screen covers the feed", () => {
    assert.match(shellSource, /subwayOperatingState\.status === "closed" && !closedMapPeek/);
    assert.match(shellSource, /return;/);
  });

  it("marks dashboard payloads as backend or fallback and lets the shell retain backend data", () => {
    assert.match(dashboardDataSource, /dataSource: "fallback"/);
    assert.match(dashboardAdapterSource, /dataSource: availability === "unavailable" \? "fallback" : "backend"/);
    assert.match(shellSource, /displayData/);
    assert.match(dashboardSessionSource, /setTtcData\(restoredTtc\)/);
    assert.match(dashboardSessionSource, /selectedNetwork === "regional" \? regionalData : ttcData/);
    assert.match(dashboardSessionSource, /canSaveDashboard\(initialData\)/);
  });

  it("loads and refreshes the selected regional dashboard through the network-scoped API", () => {
    assert.match(regionalDataSource, /regionalDashboardDataFromApi/);
    assert.match(dashboardSessionSource, /getDashboardRefresh\(networkId/);
    assert.match(dashboardSessionSource, /regionalDashboardDataFromApi/);
    assert.match(dashboardSessionSource, /selectedNetwork === "regional"/);
    assert.match(dashboardSessionSource, /document\.visibilityState !== "visible"/);
    assert.match(dashboardSessionSource, /void fetchDashboard\(selectedNetwork\)/);
  });
});
