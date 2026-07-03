import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const dashboardDataSource = readFileSync(new URL("../src/app/dashboard-data.ts", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");

describe("dashboard server data binding", () => {
  it("trusts map API overlay metadata instead of rebuilding reduced speed zone impacts", () => {
    assert.doesNotMatch(dashboardDataSource, /networkSegments = networkSegments\.map/);
    assert.doesNotMatch(dashboardDataSource, /alertId:\s*alert\.id/);
    assert.match(dashboardDataSource, /networkSegments:\s*payload\.map\.segments/);
    assert.match(dashboardDataSource, /networkSegments:\s*fallbackSegments/);
  });

  it("refreshes open dashboards through the existing server data path", () => {
    assert.match(shellSource, /useRouter/);
    assert.match(shellSource, /dashboardRefreshIntervalMs/);
    assert.match(shellSource, /router\.refresh\(\)/);
    assert.match(shellSource, /document\.visibilityState !== "visible"/);
    assert.match(shellSource, /visibilitychange/);
  });

  it("keeps selected station detail fresh while the submenu remains open", () => {
    assert.match(shellSource, /STATION_DETAIL_REFRESH_MS\s*=\s*15_000/);
    assert.match(shellSource, /fetchStationDetail/);
    assert.match(shellSource, /fetchStationDetail\(true\)/);
    assert.match(shellSource, /fetchStationDetail\(false\)/);
    assert.match(shellSource, /if \(showLoading\) \{/);
    assert.match(shellSource, /window\.setInterval\(\(\) => \{[\s\S]*fetchStationDetail\(false\);[\s\S]*\}, STATION_DETAIL_REFRESH_MS\)/);
    assert.match(shellSource, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
    assert.match(shellSource, /getStationDetail\(selectedStationId\)/);
  });

  it("pauses dashboard refresh while the closed screen covers the feed", () => {
    assert.match(shellSource, /subwayOperatingState\.status === "closed" && !closedMapPeek/);
    assert.match(shellSource, /return;/);
    assert.match(shellSource, /router\.refresh\(\)/);
  });

  it("marks dashboard payloads as backend or fallback and lets the shell retain backend data", () => {
    assert.match(dashboardDataSource, /dataSource: "fallback"/);
    assert.match(dashboardDataSource, /dataSource: "backend"/);
    assert.match(shellSource, /displayData/);
    assert.match(shellSource, /setDisplayData\(initialData\)/);
    assert.match(shellSource, /initialData\.dataSource === "backend"/);
  });
});
