import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");

describe("dashboard server data binding", () => {
  it("trusts map API overlay metadata instead of rebuilding reduced speed zone impacts", () => {
    assert.doesNotMatch(pageSource, /networkSegments = networkSegments\.map/);
    assert.doesNotMatch(pageSource, /alertId:\s*alert\.id/);
    assert.match(pageSource, /networkSegments:\s*useFallback \? fallbackSegments : mapData\.segments/);
  });

  it("refreshes open dashboards through the existing server data path", () => {
    assert.match(shellSource, /useRouter/);
    assert.match(shellSource, /dashboardRefreshIntervalMs/);
    assert.match(shellSource, /router\.refresh\(\)/);
    assert.match(shellSource, /document\.visibilityState !== "visible"/);
    assert.match(shellSource, /visibilitychange/);
  });
});
