import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const stationSource = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/RegionalTripChangesList.tsx", import.meta.url), "utf8");
const logsSource = readFileSync(new URL("../src/components/LogsDropdown.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const mobileStatusSource = readFileSync(new URL("../src/components/MobileStatusSheet.tsx", import.meta.url), "utf8");
const mobilePeekSource = readFileSync(new URL("../src/components/MobileStatusPeek.tsx", import.meta.url), "utf8");
const mobileMoreSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("regional trip changes UI", () => {
  it("annotates matching arrivals and exposes a station-scoped upcoming section", () => {
    assert.match(stationSource, /findRegionalArrivalTripChange/);
    assert.match(stationSource, /data-station-section="trip-changes"/);
    assert.match(stationSource, /Upcoming Trip Changes/);
    assert.match(stationSource, /regionalTripChangeLabel\(tripChange\.kind\)/);
    assert.match(stationSource, /cleanRegionalTripNumber\(arrival\.tripNumber\)/);

    const arrivalsIdx = stationSource.indexOf('data-station-section="arrivals"');
    const surfaceIdx = stationSource.indexOf('<SurfaceConnectionsSection');
    const stationImpactsIdx = stationSource.indexOf('data-station-section="station-impacts"');
    const tripChangesIdx = stationSource.indexOf('data-station-section="trip-changes"');

    assert.ok(arrivalsIdx !== -1, "arrivals section must exist");
    assert.ok(surfaceIdx !== -1, "surface connections section must exist");
    assert.ok(stationImpactsIdx !== -1, "station impacts section must exist");
    assert.ok(tripChangesIdx !== -1, "trip changes section must exist");
    assert.ok(arrivalsIdx < surfaceIdx, "arrivals must precede surface connections");
    assert.ok(surfaceIdx < stationImpactsIdx, "surface connections must precede station impacts");
    assert.ok(stationImpactsIdx < tripChangesIdx, "station impacts must precede upcoming trip changes");
  });

  it("uses structured factual trip-change cards and source-honest guardrails", () => {
    assert.match(listSource, /formatRegionalTripDisplayName\(change\)/);
    assert.match(listSource, /formatRegionalTripSubtitle\(change\)/);
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

  it("uses the canonical amber treatment in map, menu, and mobile status navigation", () => {
    assert.match(shellSource, /desktop-status-chip--trip-changes/);
    assert.match(shellSource, /trip-change-count-badge/);
    assert.doesNotMatch(shellSource, /bg-red-500\/20[\s\S]{0,160}regionalTripChangeCount/);
    assert.match(mobileStatusSource, /mobile-status-btn-trip-changes[\s\S]*trip-change-tone/);
    assert.match(stylesSource, /--trip-change:\s*#f59e0b/);
    assert.doesNotMatch(stylesSource, /\.mobile-status-btn-trip-changes \.mobile-status-btn-circle\s*\{/);
    assert.match(shellSource, /\(regionalTripChangeCount \?\? 0\) === 1 \? "Trip Change" : "Trip Changes"/);
    assert.match(mobilePeekSource, /tripChangeCount === 1 \? "Trip Change" : "Trip Changes"/);
    assert.match(mobilePeekSource, /mobile-status-peek-count-badge trip-changes/);
    assert.match(stylesSource, /\.mobile-status-peek-count-badge\.trip-changes/);
  });

  it("keeps My Commutes available from mobile More in both network modes", () => {
    assert.match(mobileMoreSource, /onClick=\{onOpenCommutes\}[\s\S]*My Commutes/);
    assert.doesNotMatch(mobileMoreSource, /currentNetwork === "ttc" \? <button[^>]*onClick=\{onOpenCommutes\}/);
  });
});
