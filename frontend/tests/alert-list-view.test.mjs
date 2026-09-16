import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const toolbarSource = readSource("../src/components/ImpactListToolbar.tsx");
const compactRowSource = readSource("../src/components/CompactImpactListItem.tsx");
const preferenceSource = readSource("../src/hooks/useImpactListView.ts");
const globalCss = readAppStylesheet();
const panelSources = [
  readSource("../src/components/ActiveAlertsPanel.tsx"),
  readSource("../src/components/DelaysPanel.tsx"),
  readSource("../src/components/ReducedSpeedZonesPanel.tsx"),
  readSource("../src/components/PlannedClosuresPanel.tsx"),
];

describe("alert card and list views", () => {
  it("offers an accessible cards/list toggle in the shared alert toolbar", () => {
    assert.match(toolbarSource, /aria-label="Card view"/);
    assert.match(toolbarSource, /aria-label="List view"/);
    assert.match(toolbarSource, /aria-pressed=\{viewMode === "cards"\}/);
    assert.match(toolbarSource, /aria-pressed=\{viewMode === "list"\}/);
  });

  it("defaults to cards and stores one per-device preference for all alert types", () => {
    assert.match(preferenceSource, /linewatch-impact-list-view-v1/);
    assert.match(preferenceSource, /useSyncExternalStore/);
    assert.match(preferenceSource, /ImpactListView => "cards"/);
    assert.match(preferenceSource, /window\.localStorage\.setItem/);
  });

  it("renders a map-focusable compact row with the core alert context", () => {
    assert.match(compactRowSource, /CompactImpactLocation/);
    assert.match(compactRowSource, /data-impact-card-id=\{impactId\}/);
    assert.match(compactRowSource, /Show .* on map/);
    assert.match(compactRowSource, /label: "Direction"/);
    assert.match(compactRowSource, /CompactImpactTimeValue/);
    assert.match(panelSources[2], /label: "Reduced Speed"/);
    assert.match(panelSources[2], /label: "Zone Count"/);
    assert.match(panelSources[2], /startedValue=\{showStartedBreakdown/);
    assert.match(panelSources[2], /label: "Updated"/);
    assert.match(panelSources[2], /label: "Est\. Resolution"/);
    assert.match(globalCss, /\.compact-impact-list-item__detail\s*\{[^}]*grid-column:\s*2 \/ 4;/s);
    assert.match(globalCss, /\.compact-impact-list-item__facts\s*\{[^}]*display:\s*flex;/s);
    assert.match(globalCss, /@container compact-impact \(max-width: 520px\)/);
    assert.match(globalCss, /\.compact-impact-list-item\.rsz-card-border\s*\{[^}]*border-left-color:\s*var\(--impact-rsz\);/s);
    assert.match(globalCss, /\.compact-impact-list-item\.suspension-card-border\s*\{[^}]*border-left-color:\s*#ef4444;/s);
    assert.match(globalCss, /\.compact-impact-list-item\.delay-card-border\s*\{[^}]*border-left-color:\s*#FEEC41;/s);
    assert.match(globalCss, /\.compact-impact-list-item\.planned-closure-card-border\s*\{[^}]*border-left-color:\s*#3b82f6;/s);
    assert.match(globalCss, /\.compact-impact-location__station/);
    assert.doesNotMatch(globalCss, /\.compact-impact-list-item\s*\{[^}]*border-left-width:\s*4px;/s);
  });

  it("organizes closures and speed zones around location with separate expandable details", () => {
    for (const source of panelSources.slice(2)) {
      assert.match(source, /locationFirst/);
      assert.match(source, /details=\{/);
    }
    assert.match(panelSources[2], /label: "Updated"[\s\S]*?label: "Est\. Resolution"/);
    assert.match(compactRowSource, /<details className="compact-impact-disclosure__details">/);
    assert.match(compactRowSource, /compact-impact-list-item compact-impact-disclosure/);
    assert.ok(compactRowSource.indexOf("</button>") < compactRowSource.indexOf("<details"));
    assert.match(panelSources[3], /title="Planned Closure"/);
    assert.match(panelSources[3], /closure.shuttle && "Shuttle"/);
    assert.match(globalCss, /\.planned-closure-metadata > \.is-window-row\s*\{[^}]*grid-column: 1 \/ -1;/s);
  });

  it("hides repeated type labels consistently in dedicated submenus", () => {
    for (const source of panelSources) {
      assert.match(source, /hideTypeLabel=\{!showImpactTypeIndicator\}/);
    }
    assert.match(compactRowSource, /const omitTitle = hideTypeLabel &&/);
    assert.match(compactRowSource, /!omitTitle \? <span/);
  });

  it("supports compact rows in every alert-type submenu", () => {
    for (const source of panelSources) {
      assert.match(source, /useImpactListView\(\)/);
      assert.match(source, /viewMode=\{viewMode\}/);
      assert.match(source, /<CompactImpactListItem/);
      assert.match(source, /is-list-view/);
    }
  });
});
