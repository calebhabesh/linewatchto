import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const moreSource = readFileSync(new URL("../src/components/DesktopMorePanel.tsx", import.meta.url), "utf8");
const overviewSource = readFileSync(new URL("../src/components/DesktopStatusOverview.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const ttcMapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const regionalMapSource = readFileSync(new URL("../src/components/InteractiveRegionalMap.tsx", import.meta.url), "utf8");
const logsDropdownSource = readFileSync(new URL("../src/components/LogsDropdown.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

describe("desktop sidebar refinement - Checkpoint D: Map Chrome & Data Relocation", () => {
  it("relocates clock to sidebar header, diagnostics to More panel, and train markers to top map chrome", () => {
    // Map & Data section removed from status overview
    assert.doesNotMatch(overviewSource, /id="desktop-map-data-section"/);
    assert.doesNotMatch(overviewSource, /className="desktop-status-map-data-section"/);

    // Clock display in header
    assert.match(shellSource, /className="desktop-sidebar-clock"/);
    assert.match(shellSource, /clock\.time/);
    assert.match(shellSource, /clock\.date/);

    // Estimated trains button in top map utility cluster
    assert.match(shellSource, /desktop-train-toggle-btn/);
    assert.match(shellSource, /onClick=\{handleToggleEstimatedTrains\}/);
    assert.match(shellSource, /estimatedTrainDisplayPending/);

    // Operating banner for closing/closed states under status summary
    assert.match(overviewSource, /desktop-status-operating-banner--closing/);
    assert.match(overviewSource, /desktop-status-operating-banner--closed/);

    // Diagnostics body embedded in DesktopMorePanel
    assert.match(moreSource, /<SourceDiagnosticsBody network=\{currentNetwork\}/);
    assert.match(logsDropdownSource, /export function SourceDiagnosticsBody/);
  });

  it("passes required props to DesktopStatusOverview and configures train button in LineWatchShell", () => {
    assert.match(shellSource, /<DesktopStatusOverview/);
    assert.match(shellSource, /onOpenMore=\{/);
    assert.match(shellSource, /operatingState=\{selectedNetwork === "ttc" \? subwayOperatingState : regionalRailOperatingState\}/);
    assert.match(shellSource, /desktop-train-toggle-btn/);
  });

  it("removes the desktop center capsule and provides compact conditional map notices", () => {
    // Center capsule removed from shell
    assert.doesNotMatch(shellSource, /<div className="desktop-status-capsule desktop-top-chrome"/);

    // Conditional notices anchor retained for closing soon, closed peek, and stale/offline/estimated
    assert.match(shellSource, /className="desktop-conditional-notices-anchor/);
    assert.match(shellSource, /SubwayClosingSoonChip/);
    assert.match(shellSource, /GoUpClosingSoonChip/);
    assert.match(shellSource, /subway-closed-peek-chip/);
    assert.match(shellSource, /desktop-map-conditional-pill--stale/);
  });

  it("removes desktop top-right chrome while keeping theme toggle on map and mobile controls intact", () => {
    // Utility cluster on desktop only renders theme toggle
    assert.match(shellSource, /\{isMobile && <LogsDropdown network=\{selectedNetwork\} \/>\}/);
    assert.match(shellSource, /\{isMobile && \([\s\S]*?<div className="site-guide-network-stack">/);
    assert.match(shellSource, /className="theme-toggle-btn/);

    // Mobile network selector and shortcuts preserved for isMobile
    assert.match(shellSource, /mobile-network-selector-slot/);
    assert.match(shellSource, /mobile-alert-history-shortcut/);
    assert.match(shellSource, /mobile-my-stations-shortcut/);
  });

  it("moves Center / Magnify controls upward to top 20px on desktop for both TTC and GO/UP", () => {
    // TTC Map
    assert.match(ttcMapSource, /className="map-control-rail desktop-map-control-rail absolute top-14 sm:top-5/);

    // Regional Map
    assert.match(regionalMapSource, /className="map-control-rail desktop-map-control-rail regional-map-control-rail absolute top-14 sm:top-5/);

    // Stylesheet positioning
    assert.match(globalCss, /@media \(min-width:\s*768px\)\s*\{[\s\S]*?\.desktop-map-control-rail[\s\S]*?top:\s*20px\s*!important/);
    assert.match(globalCss, /@media \(min-width:\s*768px\)\s*\{[\s\S]*?\.regional-map-control-rail[\s\S]*?top:\s*20px/);
  });
});
