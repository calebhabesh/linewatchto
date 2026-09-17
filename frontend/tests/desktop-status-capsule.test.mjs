import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const moreSource = readFileSync(new URL("../src/components/DesktopMorePanel.tsx", import.meta.url), "utf8");
const overviewSource = readFileSync(new URL("../src/components/DesktopStatusOverview.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

describe("desktop status and map chrome relocation", () => {
  it("renders clickable impact chips and icons in bottom-left corner", () => {
    assert.match(shellSource, /desktop-status-chip-row/);
    assert.match(shellSource, /desktop-status-chip desktop-status-chip--alerts/);
    assert.match(shellSource, /desktop-status-chip desktop-status-chip--delays/);
    assert.match(shellSource, /desktop-status-chip desktop-status-chip--reduced-speed-zone/);
    assert.match(shellSource, /desktop-status-chip desktop-status-chip--closures/);
    assert.match(shellSource, /desktop-status-chip desktop-status-chip--trip-changes/);
    assert.match(shellSource, /AlertTriangle size=\{18\}/);
    assert.match(shellSource, /DelayIcon size=\{18\}/);
    assert.match(shellSource, /Construction size=\{18\}/);
    assert.match(shellSource, /PlannedClosureIcon size=\{18\}/);
    assert.match(shellSource, /Reduced Speed Zone/);
    assert.doesNotMatch(shellSource, /desktop-status-chip[\s\S]{0,800}>RSZ</);
  });

  it("places impact chips in the bottom-left corner of the viewport", () => {
    const searchBarIndex = shellSource.indexOf("desktopSearchInputRef");
    const containerIndex = shellSource.indexOf('desktop-status-chip-row-container');
    const noticesAnchorIndex = shellSource.indexOf("desktop-collapsed-map-notice-anchor");

    assert.notEqual(searchBarIndex, -1);
    assert.notEqual(containerIndex, -1);
    assert.notEqual(noticesAnchorIndex, -1);
    assert.ok(searchBarIndex < containerIndex);
    assert.ok(noticesAnchorIndex < containerIndex);
  });

  it("styles the desktop status badges and conditional notices anchor", () => {
    assert.match(globalCss, /\.desktop-status-capsule-anchor/);
    assert.match(globalCss, /\.desktop-status-capsule-anchor\s*\{[^}]*max-width:\s*min\(1320px, calc\(100vw - 320px\)\)/s);
    assert.match(globalCss, /\.desktop-status-chip-row/);
    assert.match(globalCss, /\.desktop-header-impact-chips/);
    assert.match(globalCss, /\.desktop-status-chip--reduced-speed-zone/);
    assert.match(
      globalCss,
      /\.desktop-header-impact-chips \.desktop-status-chip-count\s*\{(?=[^}]*display:\s*inline-grid;)(?=[^}]*place-items:\s*center;)(?=[^}]*box-sizing:\s*border-box;)(?=[^}]*width:\s*auto;)(?=[^}]*height:\s*36px;)(?=[^}]*min-width:\s*36px;)(?=[^}]*font-family:\s*inherit;)(?=[^}]*font-variant-numeric:\s*tabular-nums;)[^}]*\}/s,
    );
    assert.doesNotMatch(globalCss, /\.desktop-header-impact-chips \.desktop-status-chip-count\s*\{[^}]*font-family:\s*Arial/s);
    assert.match(
      globalCss,
      /\.desktop-status-chip-count-value\s*\{(?=[^}]*display:\s*block;)(?=[^}]*line-height:\s*1;)(?=[^}]*transform:\s*translateY\(-0\.5px\);)[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.desktop-status-chip-count\[data-digit-count="multiple"\] \.desktop-status-chip-count-value\s*\{[^}]*transform:\s*translate\(-0\.75px, -0\.5px\);[^}]*\}/s,
    );
    assert.equal((shellSource.match(/data-digit-count=\{/g) ?? []).length, 5);
    assert.equal((shellSource.match(/desktop-status-chip-count-value/g) ?? []).length, 5);
    assert.match(globalCss, /\.desktop-header-impact-chips \.desktop-status-chip\s*\{[\s\S]*?border:\s*none\s*!important;/);
    assert.match(globalCss, /\.dark \.desktop-status-chip--alerts\s*\{[\s\S]*?background:\s*#2d1414;/);
    assert.match(globalCss, /\.desktop-header-impact-chips \.desktop-status-chip--alerts \.desktop-status-chip-count\s*\{[\s\S]*?background:\s*rgba\(239,\s*68,\s*68,\s*0\.14\);/);
    assert.match(globalCss, /\.dark \.desktop-header-impact-chips \.desktop-status-chip--alerts \.desktop-status-chip-count\s*\{[\s\S]*?background:\s*rgba\(239,\s*68,\s*68,\s*0\.28\);/);

    const bottomChipsStart = shellSource.indexOf('className="desktop-status-chip-row desktop-header-impact-chips"');
    const alertsChipIdx = shellSource.indexOf('desktop-status-chip--alerts', bottomChipsStart);
    const delaysChipIdx = shellSource.indexOf('desktop-status-chip--delays', bottomChipsStart);
    const closuresChipIdx = shellSource.indexOf('desktop-status-chip--closures', bottomChipsStart);
    const rszChipIdx = shellSource.indexOf('desktop-status-chip--reduced-speed-zone', bottomChipsStart);
    const tripChangesChipIdx = shellSource.indexOf('desktop-status-chip--trip-changes', bottomChipsStart);

    assert.ok(alertsChipIdx < delaysChipIdx, "alerts chip must precede delays chip");
    assert.ok(delaysChipIdx < closuresChipIdx, "delays chip must precede planned closures chip");
    assert.ok(closuresChipIdx < rszChipIdx, "planned closures chip must precede reduced speed zones chip");
    assert.ok(closuresChipIdx < tripChangesChipIdx, "planned closures chip must precede trip changes chip");
  });

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
    assert.match(globalCss, /@media \(min-width:\s*768px\)\s*\{[\s\S]*\.desktop-map-control-rail\s*\{[\s\S]*top:\s*20px\s*!important/);
    assert.match(globalCss, /@media \(min-width:\s*768px\)\s*\{[\s\S]*\.regional-map-control-rail\s*\{[\s\S]*top:\s*20px/);
  });

  it("enforces blocking on desktop status badges and current service panel when main menu is pinned or visible", () => {
    assert.match(shellSource, /desktop-status-chip-row-container fixed bottom-6 left-6[\s\S]*?\$\{menuVisible \? "opacity-0 pointer-events-none" : "opacity-100"\}/);
    assert.match(shellSource, /aria-hidden=\{menuVisible \? "true" : undefined\}/);
    assert.match(shellSource, /!isMobile && !menuVisible && !rotatedMapMode && !showPwaInstallNudge && !commutePathPreview && \(activeView === "map" \|\| activeView === "search"/);
  });
});

