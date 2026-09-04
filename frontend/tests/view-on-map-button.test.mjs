import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const activeAlertsSource = readFileSync(new URL("../src/components/ActiveAlertsPanel.tsx", import.meta.url), "utf8");
const delaysSource = readFileSync(new URL("../src/components/DelaysPanel.tsx", import.meta.url), "utf8");
const rszSource = readFileSync(new URL("../src/components/ReducedSpeedZonesPanel.tsx", import.meta.url), "utf8");
const closuresSource = readFileSync(new URL("../src/components/PlannedClosuresPanel.tsx", import.meta.url), "utf8");
const stationHeaderSource = readFileSync(new URL("../src/components/StationDetailHeader.tsx", import.meta.url), "utf8");
const stationPanelSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");
const regionalStationPanelSource = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

describe("circular View on Map button", () => {
  it("uses circular impact-card-map-btn with 'View on Map' text across all impact panels", () => {
    for (const source of [activeAlertsSource, delaysSource, rszSource, closuresSource]) {
      assert.match(source, /impact-card-map-btn/);
      assert.match(source, /View on Map/);
      assert.match(source, /Unfocus/);
      assert.doesNotMatch(source, /Show on Map/);
    }
  });

  it("does not include View on Map button in the station detail header", () => {
    assert.doesNotMatch(stationHeaderSource, /station-detail-map-button/);
    assert.doesNotMatch(stationHeaderSource, /View on Map/);
    assert.doesNotMatch(stationHeaderSource, /onViewOnMap/);
    assert.doesNotMatch(stationHeaderSource, /JumpToLocationIcon/);
  });

  it("does not forward onViewOnMap through station detail panels", () => {
    assert.doesNotMatch(stationPanelSource, /onViewOnMap/);
    assert.doesNotMatch(regionalStationPanelSource, /onViewOnMap/);
    assert.doesNotMatch(shellSource, /handleViewStationOnMap/);
  });

  it("styles impact card buttons as borderless circles with white text and dual-tone icon", () => {
    // Impact card circular button - borderless circle
    assert.match(globalCss, /\.impact-card-map-btn\s*\{[^}]*border-radius:\s*9999px/s);
    assert.match(globalCss, /\.impact-card-map-btn\s*\{[^}]*border:\s*none\s*!important/s);
    assert.match(globalCss, /\.impact-card-map-btn\s*\{[^}]*width:\s*88px/s);
    assert.match(globalCss, /\.impact-card-map-btn\s*\{[^}]*height:\s*88px/s);
    assert.match(globalCss, /\.impact-card-map-btn\s*\{[^}]*background:\s*rgba\(37,\s*99,\s*235/s);
    assert.match(globalCss, /\.dark \.impact-card-map-btn\s*\{[^}]*background:\s*rgba\(56,\s*189,\s*248/s);
    assert.match(globalCss, /\.impact-card-map-btn span\s*\{[^}]*color:\s*#ffffff\s*!important/s);

    // JumpToLocationIcon dual-tone icon: 4 corner L pieces in white, center pin in blue (#2563eb matching mobile status peek center button infill)
    assert.match(globalCss, /\.jump-to-corners path[\s\S]*?stroke:\s*#ffffff\s*!important/);
    assert.match(globalCss, /\.jump-to-pin[\s\S]*?color:\s*#2563eb/);

    // Unfocus / is-active state: calm subdued royal blue with no neon glow aura
    assert.match(globalCss, /\.impact-card-map-btn\.is-active\s*\{[^}]*background:\s*#2563eb\s*!important;/s);
    assert.match(globalCss, /\.dark \.impact-card-map-btn\.is-active\s*\{[^}]*background:\s*#1d4ed8\s*!important;/s);
    assert.match(globalCss, /\.impact-card-map-btn\.is-active \.jump-to-pin\s*\{[^}]*filter:\s*none\s*!important;/s);
    assert.doesNotMatch(globalCss, /\.impact-card-map-btn\.is-active\s*\{[^}]*rgba\(56,\s*189,\s*248,\s*0\.45\)/s);
  });

  it("scales down the button slightly on mobile screens", () => {
    assert.match(globalCss, /@media\s*\(max-width:\s*767px\)\s*\{[^}]*\.impact-card-map-btn\s*\{[^}]*width:\s*72px\s*!important/s);
    assert.match(globalCss, /@media\s*\(max-width:\s*767px\)\s*\{[^}]*\.impact-card-map-btn\s*\{[^}]*height:\s*72px\s*!important/s);
  });
});
