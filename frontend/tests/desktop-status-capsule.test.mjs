import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";
import { readShellSource } from "./helpers/shell-source.mjs";
import { readTtcMapSource } from "./helpers/map-source.mjs";

const moreSource = readFileSync(new URL("../src/components/DesktopMorePanel.tsx", import.meta.url), "utf8");
const overviewSource = readFileSync(new URL("../src/components/DesktopStatusOverview.tsx", import.meta.url), "utf8");
const shellSource = readShellSource();
const mapSource = readTtcMapSource();
const globalCss = readAppStylesheet();

describe("desktop status and map chrome relocation", () => {
  it("relocates estimated-train controls to map utility cluster, clock to sidebar header, and diagnostics to dedicated sidebar destination", () => {
    assert.doesNotMatch(overviewSource, /desktop-status-map-data-section/);
    assert.match(shellSource, /desktop-train-toggle-btn/);
    assert.match(shellSource, /handleToggleEstimatedTrains/);
    assert.doesNotMatch(moreSource, /SourceDiagnosticsBody/);
    assert.match(shellSource, /SourceDiagnosticsBody/);
    assert.match(shellSource, /desktop-sidebar-clock/);
    assert.match(globalCss, /\.desktop-sidebar-clock/);
  });

  it("moves desktop map controls upward into top area for both networks", () => {
    assert.match(mapSource, /desktop-map-control-rail/);
    assert.match(globalCss, /@media \(min-width:\s*768px\)\s*\{[\s\S]*\.desktop-map-control-rail\s*\{[\s\S]*top:\s*var\(--desktop-rail-top,\s*20px\)\s*!important/);
    // One toolbar class for both maps.
    assert.doesNotMatch(globalCss, /\.regional-map-control-rail/);
  });
});

