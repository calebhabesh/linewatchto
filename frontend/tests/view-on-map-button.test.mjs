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
const impactCardFieldsSource = readFileSync(new URL("../src/components/ImpactCardFields.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

describe("44px View on Map button", () => {
  it("uses impact-card-map-btn with accessible name across all impact panels", () => {
    for (const source of [activeAlertsSource, delaysSource, rszSource, closuresSource]) {
      assert.match(source, /ImpactCardShell/);
      assert.match(source, /onFocusMap/);
      assert.doesNotMatch(source, /Show on Map/);
    }
    assert.match(impactCardFieldsSource, /ImpactCardMapButton/);
    assert.match(impactCardFieldsSource, /impact-card-map-btn/);
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

  it("styles impact card buttons as 44px slate/visionOS surface with Lucide MapPinned dual-tone icon", () => {
    // 44px height button with slate/visionOS surface and no decorative white outline
    assert.match(globalCss, /\.impact-card-map-btn\s*\{[^}]*height:\s*44px/s);
    assert.match(globalCss, /\.impact-card-map-btn\s*\{[^}]*min-width:\s*44px/s);
    assert.match(globalCss, /\.impact-card-map-btn\s*\{[^}]*border:\s*none\s*!important/s);
    assert.match(globalCss, /\.impact-card-map-btn\s*\{[^}]*border-radius:\s*8px/s);
    assert.match(globalCss, /\.impact-card-map-btn:focus-visible\s*\{[^}]*outline:/s);

    // Lucide MapPinned dual-tone icon: red pin, blue folded-map base
    assert.match(globalCss, /\.impact-card-map-btn svg path:first-of-type[\s\S]*?stroke:\s*#ef4444/);
    assert.match(globalCss, /\.impact-card-map-btn svg path:last-of-type[\s\S]*?stroke:\s*#2563eb/);

    // JumpToLocationIcon dual-tone icon preserved for other consumers
    assert.match(globalCss, /\.jump-to-corners path[\s\S]*?stroke:\s*#ffffff\s*!important/);
    assert.match(globalCss, /\.jump-to-pin[\s\S]*?color:\s*#2563eb/);

    // Unfocus / is-active state
    assert.match(globalCss, /\.impact-card-map-btn\.is-active\s*\{[^}]*background:\s*#2563eb/s);
    assert.match(globalCss, /\.dark \.impact-card-map-btn\.is-active\s*\{[^}]*background:\s*#1d4ed8/s);
  });

  it("renders 'Map' when inactive and 'Back' when active with stable toggle dimensions", () => {
    assert.match(impactCardFieldsSource, /Back/);
    assert.match(impactCardFieldsSource, /Map/);
    assert.match(impactCardFieldsSource, /isBack \? \([\s\S]*?<ArrowLeft[\s\S]*?: \([\s\S]*?<MapPinned/);
    assert.match(impactCardFieldsSource, /aria-pressed/);
    assert.match(globalCss, /\.impact-card-map-btn--labeled\s*\{[^}]*min-width:\s*78px;[^}]*width:\s*78px/s);
    assert.match(globalCss, /\.impact-card-map-btn\.is-active \.impact-card-back-icon path\s*\{[^}]*stroke:\s*#ffffff;/s);
    assert.match(globalCss, /\.impact-card-map-btn__label/);
  });
});
