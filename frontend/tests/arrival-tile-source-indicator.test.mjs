import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const indicatorSource = readFileSync(new URL("../src/components/ArrivalTileSourceIndicator.tsx", import.meta.url), "utf8");
const stationPanelSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");
const regionalStationPanelSource = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");
const myStationsPanelSource = readFileSync(new URL("../src/components/MyStationsPanel.tsx", import.meta.url), "utf8");
const surfaceConnectionsSource = readFileSync(new URL("../src/components/SurfaceConnectionsSection.tsx", import.meta.url), "utf8");
const siteGuideSource = readFileSync(new URL("../src/components/SiteGuideDropdown.tsx", import.meta.url), "utf8");

describe("arrival tile source indicator and site guide controls", () => {
  it("defines ArrivalTileSourceIndicator component with green live signal icon and grey calendar-check-2", () => {
    assert.match(indicatorSource, /import\s*\{[^}]*CalendarCheck2[^}]*\}\s*from\s*"lucide-react"/);
    assert.match(indicatorSource, /import\s*\{[^}]*LiveSignalIcon[^}]*\}\s*from\s*"\.\/LiveSignalIcon"/);
    assert.match(indicatorSource, /data-arrival-tile-source=/);
    assert.match(indicatorSource, /<LiveSignalIcon/);
    assert.match(indicatorSource, /<CalendarCheck2/);
    // Green styling preserved even in Due state
    assert.match(indicatorSource, /isDue\s*\?\s*"text-emerald-400"\s*:\s*"text-emerald-600 dark:text-emerald-400"/);
    assert.match(indicatorSource, /text-slate-400\s+dark:text-slate-500/);
    assert.match(indicatorSource, /pointer-events-none/);
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

  it("renders icons on Scheduled (CalendarCheck2) and Mixed (Layers) arrival badges across all panels", () => {
    // StationDetailPanel
    assert.match(stationPanelSource, /groupSourceLabel === "Scheduled"\s*\?\s*\(\s*<CalendarCheck2/);
    assert.match(stationPanelSource, /groupSourceLabel === "Mixed"\s*\?\s*\(\s*<Layers/);

    // RegionalStationDetailPanel
    assert.match(regionalStationPanelSource, /statusLabel === "Scheduled"\s*\?\s*\(\s*<CalendarCheck2/);
    assert.match(regionalStationPanelSource, /statusLabel === "Mixed"\s*\?\s*\(\s*<Layers/);

    // SurfaceConnectionsSection
    assert.match(surfaceConnectionsSource, /groupSourceLabel === "Scheduled"\s*\?\s*\(\s*<CalendarCheck2/);
    assert.match(surfaceConnectionsSource, /groupSourceLabel === "Mixed"\s*\?\s*\(\s*<Layers/);

    // MyStationsPanel
    assert.match(myStationsPanelSource, /sourceLabel === "Scheduled"\s*\?\s*\(\s*<CalendarCheck2/);
    assert.match(myStationsPanelSource, /sourceLabel === "Mixed"\s*\?\s*\(\s*<Layers/);
  });

  it("uses Activity icon for TTC Source Status under Other Controls in SiteGuideDropdown", () => {
    assert.match(siteGuideSource, /import[\s\S]*Activity[\s\S]*from\s*"lucide-react"/);
    assert.match(siteGuideSource, /<GuideActionRow\s+icon=\{<Activity size=\{14\} \/>\}\s+label="TTC Source Status"/);
  });
});
