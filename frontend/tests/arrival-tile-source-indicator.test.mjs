import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const indicatorSource = readFileSync(new URL("../src/components/ArrivalTileSourceIndicator.tsx", import.meta.url), "utf8");
const stationPanelSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");
const regionalStationPanelSource = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");
const myStationsPanelSource = readFileSync(new URL("../src/components/MyStationsPanel.tsx", import.meta.url), "utf8");
const surfaceConnectionsSource = readFileSync(new URL("../src/components/SurfaceConnectionsSection.tsx", import.meta.url), "utf8");

describe("arrival tile source indicator for mixed arrival groups", () => {
  it("defines ArrivalTileSourceIndicator component using LiveSignalIcon and CalendarCheck2", () => {
    assert.match(indicatorSource, /import\s*\{[^}]*CalendarCheck2[^}]*\}\s*from\s*"lucide-react"/);
    assert.match(indicatorSource, /import\s*\{[^}]*LiveSignalIcon[^}]*\}\s*from\s*"\.\/LiveSignalIcon"/);
    assert.match(indicatorSource, /data-arrival-tile-source=/);
    assert.match(indicatorSource, /<LiveSignalIcon/);
    assert.match(indicatorSource, /<CalendarCheck2/);
    assert.match(indicatorSource, /text-slate-400\s+dark:text-slate-500/);
    assert.match(indicatorSource, /pointer-events-none/);
  });

  it("renders ArrivalTileSourceIndicator on TTC subway/LRT arrival tiles only when group is mixed", () => {
    assert.match(stationPanelSource, /import\s*\{[^}]*ArrivalTileSourceIndicator[^}]*\}\s*from\s*"\.\/ArrivalTileSourceIndicator"/);
    assert.match(stationPanelSource, /const\s+isMixedGroup\s*=\s*groupSourceLabel\s*===\s*"Mixed";/);
    assert.match(stationPanelSource, /\{isMixedGroup\s*&&\s*\(\s*<ArrivalTileSourceIndicator\s+status=\{arrival\.status\}/);
  });

  it("renders ArrivalTileSourceIndicator on Regional GO/UP train arrival tiles only when group is mixed", () => {
    assert.match(regionalStationPanelSource, /import\s*\{[^}]*ArrivalTileSourceIndicator[^}]*\}\s*from\s*"\.\/ArrivalTileSourceIndicator"/);
    assert.match(regionalStationPanelSource, /const\s+isMixedGroup\s*=\s*statusLabel\s*===\s*"Mixed";/);
    assert.match(regionalStationPanelSource, /\{isMixedGroup\s*&&\s*\(\s*<ArrivalTileSourceIndicator\s+status=\{arrival\.status\}/);
  });

  it("renders ArrivalTileSourceIndicator on Surface connections arrival tiles only when group is mixed", () => {
    assert.match(surfaceConnectionsSource, /import\s*\{[^}]*ArrivalTileSourceIndicator[^}]*\}\s*from\s*"\.\/ArrivalTileSourceIndicator"/);
    // In SurfaceRouteCard
    assert.match(surfaceConnectionsSource, /const\s+isMixedGroup\s*=\s*groupSourceLabel\s*===\s*"Mixed";/);
    assert.match(surfaceConnectionsSource, /\{isMixedGroup\s*&&\s*\(\s*<ArrivalTileSourceIndicator\s+status=\{arrival\.status\}\s+isDue=\{due\}\s+size=\{12\}\s*\/\>\s*\)/);
    // In SurfaceCompactRouteRow
    assert.match(surfaceConnectionsSource, /\{isMixedGroup\s*&&\s*\(\s*<ArrivalTileSourceIndicator\s+status=\{arrival\.status\}\s+isDue=\{due\}\s+isCompact\s*\/\>\s*\)/);
  });

  it("renders ArrivalTileSourceIndicator on MyStations saved station arrival tiles only when group is mixed", () => {
    assert.match(myStationsPanelSource, /import\s*\{[^}]*ArrivalTileSourceIndicator[^}]*\}\s*from\s*"\.\/ArrivalTileSourceIndicator"/);
    // Regional in MyStations
    assert.match(myStationsPanelSource, /const\s+isMixedGroup\s*=\s*sourceLabel\s*===\s*"Mixed";[\s\S]*<ArrivalTileSourceIndicator\s+status=\{arrival\.status\}\s+isDue=\{due\}\s+isCompact/);
    // TTC in MyStations
    assert.match(myStationsPanelSource, /const\s+isMixedGroup\s*=\s*sourceLabel\s*===\s*"Mixed";[\s\S]*<ArrivalTileSourceIndicator\s+status=\{arrival\.status\}\s+isDue=\{due\}\s+isCompact/);
  });
});
