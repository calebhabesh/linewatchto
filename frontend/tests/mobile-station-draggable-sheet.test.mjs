import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  clampSheetRatio,
  computeDampedRatio,
  readStoredSheetHeightRatio,
  writeStoredSheetHeightRatio,
  MOBILE_STATION_SHEET_STORAGE_KEY,
  MOBILE_SHEET_FLOOR_RATIO,
  MOBILE_SHEET_DEFAULT_RATIO,
  MOBILE_SHEET_EXPANDED_RATIO,
  MOBILE_SHEET_CEILING_RATIO,
} from "../src/hooks/useMobileDraggableSheet.ts";

const panelSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");
const regionalPanelSource = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");
const handleSource = readFileSync(new URL("../src/components/MobileSheetDragHandle.tsx", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("../src/hooks/useMobileDraggableSheet.ts", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("mobile station draggable sheet UX", () => {
  it("defines bounded floor and ceiling constants for vertical sheet drag", () => {
    assert.equal(MOBILE_SHEET_FLOOR_RATIO, 0.50);
    assert.equal(MOBILE_SHEET_DEFAULT_RATIO, 0.50);
    assert.equal(MOBILE_SHEET_EXPANDED_RATIO, 0.90);
    assert.equal(MOBILE_SHEET_CEILING_RATIO, 0.92);
  });

  it("clamps sheet height ratio safely within floor and ceiling bounds", () => {
    assert.equal(clampSheetRatio(0.30), 0.50);
    assert.equal(clampSheetRatio(0.50), 0.50);
    assert.equal(clampSheetRatio(0.75), 0.75);
    assert.equal(clampSheetRatio(0.90), 0.90);
    assert.equal(clampSheetRatio(0.92), 0.92);
    assert.equal(clampSheetRatio(0.99), 0.92);
    assert.equal(clampSheetRatio(Number.NaN), 0.50);
    assert.equal(clampSheetRatio(Number.POSITIVE_INFINITY), 0.50);
  });

  it("reads and writes stored sheet height ratio to storage safely", () => {
    const memory = new Map();
    const mockStorage = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, String(value)),
      removeItem: (key) => memory.delete(key),
    };

    // Default when empty
    assert.equal(readStoredSheetHeightRatio(mockStorage), 0.50);

    // Save customized height
    writeStoredSheetHeightRatio(mockStorage, 0.85);
    assert.equal(readStoredSheetHeightRatio(mockStorage), 0.85);

    // Clamps out-of-range values on write
    writeStoredSheetHeightRatio(mockStorage, 1.20);
    assert.equal(readStoredSheetHeightRatio(mockStorage), 0.92);

    writeStoredSheetHeightRatio(mockStorage, 0.20);
    assert.equal(readStoredSheetHeightRatio(mockStorage), 0.50);
    assert.equal(memory.get(MOBILE_STATION_SHEET_STORAGE_KEY), "0.5");

    // Graceful error recovery on throwing storage
    const throwingStorage = {
      getItem: () => { throw new Error("Blocked"); },
      setItem: () => { throw new Error("Quota exceeded"); },
    };
    assert.equal(readStoredSheetHeightRatio(throwingStorage), 0.50);
    assert.doesNotThrow(() => writeStoredSheetHeightRatio(throwingStorage, 0.70));
  });

  it("integrates MobileSheetDragHandle into TTC and Regional station panels", () => {
    // TTC Panel
    assert.match(panelSource, /import\s*\{\s*MobileSheetDragHandle\s*\}\s*from\s*"\.\/MobileSheetDragHandle"/);
    assert.match(panelSource, /import\s*\{\s*useMobileDraggableSheet\s*\}\s*from\s*"\.\.\/hooks\/useMobileDraggableSheet"/);
    assert.match(panelSource, /useMobileDraggableSheet\(\)/);
    assert.match(panelSource, /<MobileSheetDragHandle/);
    assert.match(panelSource, /data-sheet-expanded=/);
    assert.match(panelSource, /station-detail-sheet-dragging/);

    // Regional Panel
    assert.match(regionalPanelSource, /import\s*\{\s*MobileSheetDragHandle\s*\}\s*from\s*"\.\/MobileSheetDragHandle"/);
    assert.match(regionalPanelSource, /import\s*\{\s*useMobileDraggableSheet\s*\}\s*from\s*"\.\.\/hooks\/useMobileDraggableSheet"/);
    assert.match(regionalPanelSource, /useMobileDraggableSheet\(\)/);
    assert.match(regionalPanelSource, /<MobileSheetDragHandle/);
    assert.match(regionalPanelSource, /data-sheet-expanded=/);
    assert.match(regionalPanelSource, /station-detail-sheet-dragging/);
  });

  it("renders a pill-shaped handle with tactile ridges and accessibility semantics", () => {
    assert.match(handleSource, /data-mobile-sheet-drag-handle/);
    assert.match(handleSource, /station-sheet-drag-pill/);
    assert.match(handleSource, /station-sheet-drag-ridges/);
    assert.match(hookSource, /role:\s*"slider"/);
    assert.match(hookSource, /aria-label.*Adjust station panel height/);
    assert.match(hookSource, /aria-valuemin/);
    assert.match(hookSource, /aria-valuemax/);
    assert.match(hookSource, /aria-valuenow/);
  });

  it("defines responsive CSS rules and drag handle styles in globals.css", () => {
    assert.match(globalCss, /\.station-sheet-drag-handle-container\s*\{[^}]*cursor:\s*grab/s);
    assert.match(globalCss, /\.station-sheet-drag-pill\s*\{[^}]*border-radius:\s*9999px/s);
    assert.match(globalCss, /\.station-sheet-drag-ridges\s*\{[^}]*display:\s*flex/s);
    assert.match(globalCss, /--mobile-station-sheet-height/);
    assert.match(globalCss, /\.station-detail-panel\.station-detail-sheet-dragging\s*\{[^}]*transition:\s*none\s*!important/s);
  });

  it("strictly disables and hides the drag handle on desktop viewport", () => {
    assert.match(handleSource, /md:hidden/);
    assert.match(globalCss, /\.station-sheet-drag-handle-container\s*\{[^}]*display:\s*none\s*!important/s);
    assert.match(globalCss, /@media\s*\(min-width:\s*768px\)[\s\S]*?\.station-sheet-drag-handle-container\s*\{[^}]*display:\s*none\s*!important/);
    assert.match(globalCss, /@media\s*\(min-width:\s*768px\)[\s\S]*?\.station-detail-panel\s*\{[^}]*height:\s*auto\s*!important/);
  });

  it("uses requestAnimationFrame and direct DOM updates in useMobileDraggableSheet for lag-free dragging", () => {
    assert.match(hookSource, /requestAnimationFrame/);
    assert.match(hookSource, /sheetRef/);
    assert.match(hookSource, /MOBILE_SHEET_SNAP_THRESHOLD/);
    assert.match(hookSource, /snapToRatio/);
    assert.match(panelSource, /ref=\{sheetRef\}/);
    assert.match(regionalPanelSource, /ref=\{sheetRef\}/);
    assert.match(globalCss, /contain:\s*paint/);
    assert.match(globalCss, /transform:\s*translateZ\(0\)/);
  });

  it("supports user-decided in-between custom height ratios without forced binary snapping", () => {
    // Custom ratios in between floor (0.50) and ceiling (0.92) must be preserved
    assert.equal(clampSheetRatio(0.60), 0.60);
    assert.equal(clampSheetRatio(0.68), 0.68);
    assert.equal(clampSheetRatio(0.735), 0.735);
    assert.equal(clampSheetRatio(0.82), 0.82);

    const memory = new Map();
    const mockStorage = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, String(value)),
    };

    // Storing a custom in-between ratio retains the exact ratio
    writeStoredSheetHeightRatio(mockStorage, 0.68);
    assert.equal(readStoredSheetHeightRatio(mockStorage), 0.68);

    writeStoredSheetHeightRatio(mockStorage, 0.735);
    assert.equal(readStoredSheetHeightRatio(mockStorage), 0.735);
  });

  it("applies elastic rubber-band damping beyond floor and ceiling bounds during active drag", () => {
    // In-bounds ratios are 1:1 direct tracking
    assert.equal(computeDampedRatio(0.65), 0.65);
    assert.equal(computeDampedRatio(0.50), 0.50);
    assert.equal(computeDampedRatio(0.92), 0.92);

    // Below floor (0.50) applies elastic resistance instead of hard wall
    const belowFloor = computeDampedRatio(0.40);
    assert.ok(belowFloor < 0.50, "Allows damped visual pull below floor");
    assert.ok(belowFloor > 0.40, "Damps the distance pulled below floor");
    assert.equal(belowFloor, 0.478);

    // Above ceiling (0.92) applies elastic resistance instead of hard wall
    const aboveCeiling = computeDampedRatio(0.98);
    assert.ok(aboveCeiling > 0.92, "Allows damped visual pull above ceiling");
    assert.ok(aboveCeiling < 0.98, "Damps the distance pulled above ceiling");
    assert.equal(aboveCeiling, 0.933);
  });

  it("renders Jump To buttons with words and icons in a space-efficient grid and places Access Outages inside scrollable area below Jump To", () => {
    const navButtonsSource = readFileSync(new URL("../src/components/StationSubmenuNavButtons.tsx", import.meta.url), "utf8");
    assert.match(navButtonsSource, /grid\s+grid-cols-3/);
    assert.match(navButtonsSource, /\{item\.shortLabel\s*\?\?\s*item\.label\}/);
    assert.match(navButtonsSource, /\{item\.icon\}/);

    // Verify StationDetailPanel layout order: Jump To is outside scroll area, Access Outages is inside scroll area
    const navIndex = panelSource.indexOf("<StationSubmenuNavButtons");
    const scrollIndex = panelSource.indexOf("station-detail-scroll");
    const outageIndex = panelSource.indexOf("data-station-access-outage-summary");
    assert.ok(navIndex > 0);
    assert.ok(scrollIndex > navIndex, "Scrollable section must begin after StationSubmenuNavButtons");
    assert.ok(outageIndex > scrollIndex, "Access Outages must be inside the scrollable container below Jump To");

    // Verify RegionalStationDetailPanel layout order as well
    const regNavIndex = regionalPanelSource.indexOf("<StationSubmenuNavButtons");
    const regScrollIndex = regionalPanelSource.indexOf("station-detail-scroll");
    const regOutageIndex = regionalPanelSource.indexOf("data-station-access-outage-summary");
    assert.ok(regNavIndex > 0);
    assert.ok(regScrollIndex > regNavIndex, "Regional scrollable section must begin after StationSubmenuNavButtons");
    assert.ok(regOutageIndex > regScrollIndex, "Regional Access Outages must be inside the scrollable container below Jump To");
  });
});
