import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

describe("desktop status capsule", () => {
  it("extends the desktop time capsule with clickable impact chips and icons", () => {
    assert.match(shellSource, /desktop-status-stack/);
    assert.match(shellSource, /desktop-status-capsule/);
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
    const searchBarIndex = shellSource.indexOf("stationSearchInputRef");
    const containerIndex = shellSource.indexOf('desktop-status-chip-row-container');
    const centeredCapsuleIndex = shellSource.indexOf("Floating Desktop Status Capsule");

    assert.notEqual(searchBarIndex, -1);
    assert.notEqual(containerIndex, -1);
    assert.notEqual(centeredCapsuleIndex, -1);
    assert.ok(searchBarIndex < containerIndex);
    assert.ok(centeredCapsuleIndex < containerIndex);
  });

  it("styles the desktop status capsule as a compact primary surface with search-adjacent chips", () => {
    assert.match(globalCss, /\.desktop-status-capsule-anchor/);
    assert.match(globalCss, /\.desktop-status-capsule-anchor\s*\{[^}]*max-width:\s*min\(1320px, calc\(100vw - 320px\)\)/s);
    assert.match(globalCss, /\.desktop-status-stack/);
    assert.match(globalCss, /\.desktop-status-stack\s*\{[\s\S]*align-items:\s*center/);
    assert.match(globalCss, /\.desktop-status-stack\s*\{[\s\S]*flex-direction:\s*column/);
    assert.match(globalCss, /\.desktop-status-capsule/);
    assert.match(globalCss, /\.desktop-status-capsule\s*\{[\s\S]*width:\s*max-content/);
    assert.match(globalCss, /\.desktop-status-primary-row/);
    assert.match(globalCss, /\.desktop-status-primary-row\s*\{[\s\S]*justify-content:\s*center/);
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
    assert.match(globalCss, /\.menu-toggle-btn,[\s\S]*?\.desktop-status-capsule,[\s\S]*?\.desktop-map-control-rail[\s\S]*?\{[\s\S]*?border:\s*none\s*!important;/);
    assert.match(globalCss, /\.dark \.alert-history-shortcut,[\s\S]*?\.dark \.logs-trigger-btn[\s\S]*?\{[\s\S]*?border:\s*none\s*!important;/);

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

  it("keeps the labeled estimated-train switch in the center status console", () => {
    const capsuleIndex = shellSource.indexOf('desktop-status-capsule desktop-top-chrome');
    const switchIndex = shellSource.indexOf('desktop-status-train-switch');
    const utilityIndex = shellSource.indexOf('map-utility-cluster');

    assert.ok(capsuleIndex >= 0 && switchIndex > capsuleIndex && switchIndex < utilityIndex);
    assert.match(shellSource, /Estimated Train Markers/);
    assert.match(shellSource, /desktop-status-train-copy/);
    assert.match(shellSource, /desktop-status-train-copy--compact/);
    assert.match(shellSource, /estimatedTrainDisplayPending[\s\S]*estimated-train-pending-indicator/);
    assert.match(globalCss, /\.estimated-train-pending-indicator/);
    assert.match(globalCss, /\.desktop-status-train-switch\[aria-pressed="true"\]/);
    assert.match(globalCss, /@media \(max-width:\s*1399px\)\s*\{[^}]*\.desktop-status-train-copy:not\(\.desktop-status-train-copy--compact\)\s*\{[^}]*display:\s*none;[^}]*\}[^}]*\.desktop-status-train-copy--compact\s*\{[^}]*display:\s*flex;/s);
    assert.match(globalCss, /@media \(min-width:\s*768px\) and \(max-width:\s*1399px\)\s*\{[\s\S]*?\.desktop-status-capsule-anchor\s*\{[^}]*left:\s*calc\(50% \+ clamp\(40px, 7vw, 90px\)\)/s);
    assert.match(globalCss, /\.linewatch-shell\[data-active-view="search"\] \.desktop-status-capsule-anchor\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s);
    assert.match(globalCss, /@media \(max-width:\s*1023px\)\s*\{[^}]*\.desktop-status-capsule-anchor\s*\{[^}]*max-width:\s*calc\(100vw - 48px\)/s);
  });

  it("keeps the desktop TTC map controls centered below the status capsule and regional controls on the right", () => {
    assert.match(mapSource, /desktop-map-control-rail/);
    assert.match(globalCss, /@media \(min-width:\s*1024px\)\s*\{[\s\S]*\.desktop-map-control-rail\s*\{[\s\S]*top:\s*96px\s*!important/);
    assert.match(globalCss, /\.regional-map-control-rail\s*\{[\s\S]*right:\s*24px\s*!important/);
  });

  it("enforces blocking on desktop status badges and current service panel when main menu is pinned or visible", () => {
    assert.match(shellSource, /desktop-status-chip-row-container fixed bottom-6 left-6[\s\S]*?\$\{menuVisible \? "opacity-0 pointer-events-none" : "opacity-100"\}/);
    assert.match(shellSource, /aria-hidden=\{menuVisible \? "true" : undefined\}/);
    assert.match(shellSource, /!isMobile && !menuVisible && \(showMobileStatusPeek \|\| \(activeView === "search"/);
  });
});

