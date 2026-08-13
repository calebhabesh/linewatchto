import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const stationSource = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/RegionalTripChangesList.tsx", import.meta.url), "utf8");
const logsSource = readFileSync(new URL("../src/components/LogsDropdown.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const mobileStatusSource = readFileSync(new URL("../src/components/MobileStatusSheet.tsx", import.meta.url), "utf8");

describe("regional trip changes UI", () => {
  it("annotates matching arrivals and exposes a station-scoped upcoming section", () => {
    assert.match(stationSource, /findRegionalArrivalTripChange/);
    assert.match(stationSource, /data-station-section="trip-changes"/);
    assert.match(stationSource, /Upcoming Trip Changes/);
    assert.match(stationSource, /regionalTripChangeLabel\(tripChange\.kind\)/);
    assert.match(stationSource, /`Train \$\{arrival\.tripNumber\}`/);
  });

  it("uses structured factual trip-change cards and source-honest guardrails", () => {
    assert.match(listSource, /Train \{change\.tripNumber \|\| change\.tripId\}/);
    assert.match(listSource, /Scheduled stops affected/);
    assert.match(listSource, /Schedule-matched changes include published stop times/);
    assert.match(listSource, /Stops listed by Metrolinx/);
    assert.match(listSource, /No upcoming GO train changes\./);
    assert.match(listSource, /do not drive map or commute impacts/);
    assert.doesNotMatch(listSource, /alternate route/i);
  });

  it("shows collection states and schedule lookahead in the source-status panel", () => {
    assert.match(logsSource, /\/api\/health\/regional-ingestion/);
    assert.match(logsSource, /\/api\/health\/regional-schedule/);
    assert.match(logsSource, /Collection coverage/);
    assert.match(logsSource, /collection\.recordsFetched/);
    assert.match(logsSource, /schedule\.requiredThrough/);
  });

  it("places the regional trip changes entry below planned closures and above accessibility outages on desktop and mobile", () => {
    const desktopClosuresIdx = shellSource.indexOf('onClick={() => openImpactCategory("closures")}');
    const desktopTripChangesIdx = shellSource.indexOf("onClick={openRegionalTripChanges}");
    const desktopAccessibilityIdx = shellSource.indexOf('onClick={() => navigateForward("accessibility-outages")}');

    assert.ok(desktopClosuresIdx !== -1, "desktop closures entry must exist");
    assert.ok(desktopTripChangesIdx !== -1, "desktop trip changes entry must exist");
    assert.ok(desktopAccessibilityIdx !== -1, "desktop accessibility outages entry must exist");
    assert.ok(desktopClosuresIdx < desktopTripChangesIdx, "desktop planned closures must precede trip changes");
    assert.ok(desktopTripChangesIdx < desktopAccessibilityIdx, "desktop trip changes must precede accessibility outages");

    const mobileClosuresIdx = mobileStatusSource.indexOf('onClick={() => onOpenCategory("closures")}');
    const mobileTripChangesIdx = mobileStatusSource.indexOf('onClick={() => onOpenCategory("trip-changes")}');
    const mobileAccessibilityIdx = mobileStatusSource.indexOf('onClick={() => onOpenCategory("accessibility-outages")}');

    assert.ok(mobileClosuresIdx !== -1, "mobile closures entry must exist");
    assert.ok(mobileTripChangesIdx !== -1, "mobile trip changes entry must exist");
    assert.ok(mobileAccessibilityIdx !== -1, "mobile accessibility outages entry must exist");
    assert.ok(mobileClosuresIdx < mobileTripChangesIdx, "mobile planned closures must precede trip changes");
    assert.ok(mobileTripChangesIdx < mobileAccessibilityIdx, "mobile trip changes must precede accessibility outages");
  });
});
