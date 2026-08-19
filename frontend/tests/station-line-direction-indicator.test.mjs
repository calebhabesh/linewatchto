import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const indicatorSource = readFileSync(new URL("../src/components/StationLineDirectionIndicator.tsx", import.meta.url), "utf8");
const stationDetailSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");
const regionalStationDetailSource = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");

describe("StationLineDirectionIndicator", () => {
  it("defines line-colored lightly tinted capsule tag styling with crisp 1.5px border and no glow", () => {
    assert.match(indicatorSource, /transitLineBadgeColors/);
    assert.match(indicatorSource, /backgroundColor:\s*`color-mix\(in srgb,\s*\$\{lineColor\}\s*18%,\s*transparent\)`/);
    assert.match(indicatorSource, /borderColor:\s*`color-mix\(in srgb,\s*\$\{lineColor\}\s*80%,\s*transparent\)`/);
    assert.match(indicatorSource, /borderWidth:\s*"1\.5px"/);
    assert.doesNotMatch(indicatorSource, /boxShadow/);
    assert.match(indicatorSource, /rounded-full/);
    assert.match(indicatorSource, /text-xs/);
  });

  it("integrates StationLineDirectionIndicator in TTC and Regional station panels", () => {
    assert.match(stationDetailSource, /import\s*\{\s*StationLineDirectionIndicator\s*\}\s*from\s*"[./]+StationLineDirectionIndicator"/);
    assert.match(stationDetailSource, /<StationLineDirectionIndicator\s+lineId=\{line\.id\}\s+platformLabel=\{line\.platformLabel\}\s*\/>/);

    assert.match(regionalStationDetailSource, /import\s*\{\s*StationLineDirectionIndicator\s*\}\s*from\s*"[./]+StationLineDirectionIndicator"/);
    assert.match(regionalStationDetailSource, /<StationLineDirectionIndicator\s+lineId=\{route\.id\}\s+platformLabel=\{direction\}\s*\/>/);
  });
});
