import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const indicatorSource = readFileSync(new URL("../src/components/StationLineDirectionIndicator.tsx", import.meta.url), "utf8");
const stationDetailSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");
const regionalStationDetailSource = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");

const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("StationLineDirectionIndicator", () => {
  it("defines vibrant container styling matching tactile badges with borderless design and true line color", () => {
    assert.match(indicatorSource, /station-line-directions/);
    assert.match(indicatorSource, /rounded-full/);
    assert.match(indicatorSource, /text-xs/);
    assert.match(indicatorSource, /--line-direction-color/);
    assert.match(indicatorSource, /--line-direction-text/);
    assert.match(indicatorSource, /transitLineBadgeColors/);
    assert.doesNotMatch(indicatorSource, /borderWidth:\s*"1\.5px"/);

    // Assert globals.css provides container styles using true line color matching badges
    assert.match(globalCss, /\.station-line-directions\s*\{[\s\S]*?border:\s*none\s*!important;/);
    assert.match(globalCss, /\.station-line-directions\s*\{[\s\S]*?border-radius:\s*999px\s*!important;/);
    assert.match(globalCss, /\.station-line-directions\s*\{[\s\S]*?background-color:\s*var\(--line-direction-color/);
    assert.match(globalCss, /\.dark \.station-line-directions\s*\{[\s\S]*?background-color:\s*var\(--line-direction-color/);
  });

  it("integrates StationLineDirectionIndicator in TTC and Regional station panels", () => {
    assert.match(stationDetailSource, /import\s*\{\s*StationLineDirectionIndicator\s*\}\s*from\s*"[./]+StationLineDirectionIndicator"/);
    assert.match(stationDetailSource, /<StationLineDirectionIndicator\s+lineId=\{line\.id\}\s+platformLabel=\{line\.platformLabel\}\s*\/>/);

    assert.match(regionalStationDetailSource, /import\s*\{\s*StationLineDirectionIndicator\s*\}\s*from\s*"[./]+StationLineDirectionIndicator"/);
    assert.match(regionalStationDetailSource, /<StationLineDirectionIndicator\s+lineId=\{route\.id\}\s+platformLabel=\{direction\}\s*\/>/);
  });
});
