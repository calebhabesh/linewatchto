import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  arrivalSourceBadgeClassName,
  arrivalTileSourceIndicatorData,
} from "../src/app/arrival-source-badge.ts";

const stationPanelSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");
const regionalStationPanelSource = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");
const myStationsPanelSource = readFileSync(new URL("../src/components/MyStationsPanel.tsx", import.meta.url), "utf8");
const surfaceConnectionsSource = readFileSync(new URL("../src/components/SurfaceConnectionsSection.tsx", import.meta.url), "utf8");
const siteGuideSource = readFileSync(new URL("../src/components/SiteGuideDropdown.tsx", import.meta.url), "utf8");

describe("arrival tile source indicator and badge contracts", () => {
  it("resolves arrival tile source indicator attributes and styling by status", () => {
    const liveStandard = arrivalTileSourceIndicatorData("live", false, false);
    assert.equal(liveStandard.isLive, true);
    assert.equal(liveStandard.source, "live");
    assert.equal(liveStandard.title, "Live arrival estimate");
    assert.equal(liveStandard.iconSize, 13);
    assert.ok(liveStandard.signalClass.includes("text-emerald-600"));

    const liveDueCompact = arrivalTileSourceIndicatorData("live", true, true);
    assert.equal(liveDueCompact.isLive, true);
    assert.equal(liveDueCompact.iconSize, 10.5);
    assert.ok(liveDueCompact.signalClass.includes("text-emerald-400"));

    const scheduledNotDue = arrivalTileSourceIndicatorData("scheduled", false, false);
    assert.equal(scheduledNotDue.isLive, false);
    assert.equal(scheduledNotDue.source, "scheduled");
    assert.equal(scheduledNotDue.title, "Scheduled timetable");
    assert.ok(scheduledNotDue.calendarClass.includes("text-slate-400"));

    const scheduledDue = arrivalTileSourceIndicatorData("scheduled", true, false);
    assert.equal(scheduledDue.isLive, false);
    assert.ok(scheduledDue.calendarClass.includes("text-red-200"));
  });

  it("resolves distinct badge classes for Live, Scheduled, Mixed, and Demo sources", () => {
    const liveClass = arrivalSourceBadgeClassName("Live", "default");
    assert.ok(liveClass.includes("border-emerald-500"), "Live badge should have emerald border");
    assert.ok(liveClass.includes("bg-emerald-500"), "Live badge should have emerald bg");

    const schedClass = arrivalSourceBadgeClassName("Scheduled", "default");
    assert.ok(schedClass.includes("border-slate-400"), "Scheduled badge should have slate border");

    const mixedClass = arrivalSourceBadgeClassName("Mixed", "compact");
    assert.ok(mixedClass.includes("border-cyan-500"), "Mixed badge should have cyan border");

    const demoClass = arrivalSourceBadgeClassName("Demo", "default");
    assert.ok(demoClass.includes("border-violet-500"), "Demo badge should have violet border");
  });

  it("renders ArrivalTileSourceIndicator on all TTC subway/LRT arrival tiles", () => {
    assert.match(stationPanelSource, /import\s*\{[^}]*ArrivalTileSourceIndicator[^}]*\}\s*from\s*"\.\/ArrivalTileSourceIndicator"/);
    assert.match(stationPanelSource, /<ArrivalTileSourceIndicator\s+status=\{arrival\.status\}\s+isDue=\{due\}\s*\/>/);
  });

  it("renders ArrivalTileSourceIndicator on all Regional GO/UP train arrival tiles", () => {
    assert.match(regionalStationPanelSource, /import\s*\{[^}]*ArrivalTileSourceIndicator[^}]*\}\s*from\s*"\.\/ArrivalTileSourceIndicator"/);
    assert.match(regionalStationPanelSource, /<ArrivalTileSourceIndicator\s+status=\{arrival\.status\}\s+isDue=\{due \|\| tripChange\?\.kind === "cancellation" \|\| tripChange\?\.kind === "skipped-stop"\}\s*\/>/);
  });

  it("renders ArrivalTileSourceIndicator on all Surface connections arrival tiles", () => {
    assert.match(surfaceConnectionsSource, /import\s*\{[^}]*ArrivalTileSourceIndicator[^}]*\}\s*from\s*"\.\/ArrivalTileSourceIndicator"/);
    // In SurfaceRouteCard
    assert.match(surfaceConnectionsSource, /<ArrivalTileSourceIndicator\s+status=\{arrival\.status\}\s+isDue=\{due\}\s+size=\{12\}\s*\/>/);
    // In SurfaceCompactRouteRow
    assert.match(surfaceConnectionsSource, /<ArrivalTileSourceIndicator\s+status=\{arrival\.status\}\s+isDue=\{due\}\s+isCompact\s*\/>/);
  });

  it("renders ArrivalTileSourceIndicator on all MyStations saved station arrival tiles", () => {
    assert.match(myStationsPanelSource, /import\s*\{[^}]*ArrivalTileSourceIndicator[^}]*\}\s*from\s*"\.\/ArrivalTileSourceIndicator"/);
    // Regional and TTC in MyStations
    assert.match(myStationsPanelSource, /<ArrivalTileSourceIndicator\s+status=\{arrival\.status\}\s+isDue=\{due\}\s+isCompact\s*\/>/);
  });

  it("integrates ArrivalSourceBadge across StationDetail, RegionalStationDetail, SurfaceConnections, and MyStations", () => {
    // StationDetailPanel
    assert.match(stationPanelSource, /<ArrivalSourceBadge\s+label=\{groupSourceLabel\}/);

    // RegionalStationDetailPanel
    assert.match(regionalStationPanelSource, /<ArrivalSourceBadge\s+label=\{statusLabel\}/);

    // SurfaceConnectionsSection
    assert.match(surfaceConnectionsSource, /<ArrivalSourceBadge\s+label=\{groupSourceLabel\}/);

    // MyStationsPanel
    assert.match(myStationsPanelSource, /<ArrivalSourceBadge[\s\S]*?label=\{sourceLabel\}[\s\S]*?size="compact"/);
  });

  it("uses Activity icon for Source Status under Other Controls in SiteGuideDropdown", () => {
    assert.match(siteGuideSource, /import[\s\S]*Activity[\s\S]*from\s*"lucide-react"/);
    assert.match(siteGuideSource, /<GuideActionRow\s+icon=\{<Activity size=\{14\} \/>\}\s+label="Source Status"/);
  });
});
