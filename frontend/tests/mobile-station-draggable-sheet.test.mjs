import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  clampSheetRatio,
  computeDampedRatio,
  readStoredSheetHeightRatio,
  writeStoredSheetHeightRatio,
  MOBILE_STATION_SHEET_STORAGE_KEY,
  MOBILE_STATION_SHEET_RESIZE_EVENT,
  MOBILE_SHEET_FLOOR_RATIO,
  MOBILE_SHEET_DEFAULT_RATIO,
  MOBILE_SHEET_EXPANDED_RATIO,
  MOBILE_SHEET_CEILING_RATIO,
} from "../src/hooks/useMobileDraggableSheet.ts";
import {
  computeBoundedMapFrame,
  computeInsetViewportFocus,
} from "../src/hooks/panZoomMath.ts";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const panelSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");
const regionalPanelSource = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");
const handleSource = readFileSync(new URL("../src/components/MobileSheetDragHandle.tsx", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("../src/hooks/useMobileDraggableSheet.ts", import.meta.url), "utf8");
const ttcMapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const regionalMapSource = readFileSync(new URL("../src/components/InteractiveRegionalMap.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");

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

  it("defines responsive CSS rules and drag handle styles in stylesheet", () => {
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
    assert.match(hookSource, /translate3d/);
    assert.match(hookSource, /willChange\s*=\s*"transform"/);
    assert.match(panelSource, /ref=\{sheetRef\}/);
    assert.match(regionalPanelSource, /ref=\{sheetRef\}/);
    assert.match(globalCss, /contain:\s*paint/);
    assert.match(globalCss, /transform:\s*translate3d/);
    assert.match(globalCss, /will-change:\s*transform/);
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

  it("clamps firmly at floor and ceiling bounds without rubber-band rebound", () => {
    // In-bounds ratios are 1:1 direct tracking
    assert.equal(computeDampedRatio(0.65), 0.65);
    assert.equal(computeDampedRatio(0.50), 0.50);
    assert.equal(computeDampedRatio(0.92), 0.92);

    // Below floor (0.50) firmly clamps to floor without rubber-band rebound
    assert.equal(computeDampedRatio(0.40), 0.50);
    assert.equal(computeDampedRatio(0.20), 0.50);

    // Above ceiling (0.92) firmly clamps to ceiling without rubber-band rebound
    assert.equal(computeDampedRatio(0.98), 0.92);
    assert.equal(computeDampedRatio(1.20), 0.92);
  });

  it("renders Jump To buttons with words and icons in a space-efficient grid, keeping desktop outside scroll and placing mobile inside scroll below line badges", () => {
    const navButtonsSource = readFileSync(new URL("../src/components/StationSubmenuNavButtons.tsx", import.meta.url), "utf8");
    assert.match(navButtonsSource, /grid\s+grid-cols-3/);
    assert.match(navButtonsSource, /\{item\.shortLabel\s*\?\?\s*item\.label\}/);
    assert.match(navButtonsSource, /\{item\.icon\}/);

    // Verify StationDetailPanel layout order: Desktop Jump To is outside scroll area, Mobile Jump To and Access Outages are inside scroll area
    const desktopNavIndex = panelSource.indexOf("!isMobile && (\n            <StationSubmenuNavButtons");
    const scrollIndex = panelSource.indexOf("station-detail-scroll station-detail-section-stack");
    const mobileNavIndex = panelSource.indexOf("isMobile && (\n              <StationSubmenuNavButtons");
    const outageIndex = panelSource.indexOf("data-station-access-outage-summary");
    assert.ok(desktopNavIndex > 0);
    assert.ok(scrollIndex > desktopNavIndex, "Desktop Jump To must be outside the scrollable section");
    assert.ok(mobileNavIndex > scrollIndex, "Mobile Jump To must be inside the scrollable container below line badges");
    assert.ok(outageIndex > mobileNavIndex, "Access Outages must be inside the scrollable container below Jump To");

    // Verify RegionalStationDetailPanel layout order as well
    const regDesktopNavIndex = regionalPanelSource.indexOf("!isMobile && (\n            <StationSubmenuNavButtons");
    const regScrollIndex = regionalPanelSource.indexOf("station-detail-scroll");
    const regMobileNavIndex = regionalPanelSource.indexOf("isMobile && (\n              <StationSubmenuNavButtons");
    const regOutageIndex = regionalPanelSource.indexOf("data-station-access-outage-summary");
    assert.ok(regDesktopNavIndex > 0);
    assert.ok(regScrollIndex > regDesktopNavIndex, "Regional Desktop Jump To must be outside the scrollable section");
    assert.ok(regMobileNavIndex > regScrollIndex, "Regional Mobile Jump To must be inside the scrollable container below line badges");
    assert.ok(regOutageIndex > regMobileNavIndex, "Regional Access Outages must be inside the scrollable container below Jump To");
  });

  it("exports MOBILE_STATION_SHEET_RESIZE_EVENT and dispatches it upon settling at custom ratio", () => {
    assert.equal(MOBILE_STATION_SHEET_RESIZE_EVENT, "linewatch:station-sheet-resize");
    assert.match(hookSource, /MOBILE_STATION_SHEET_RESIZE_EVENT/);
    assert.match(hookSource, /window\.dispatchEvent\(new CustomEvent\(MOBILE_STATION_SHEET_RESIZE_EVENT,\s*\{\s*detail:\s*\{\s*ratio:\s*clamped\s*\}\s*\}\)\)/);
  });

  it("applies the stored sheet height when opening station submenus without live map layout churn during active drag", () => {
    assert.match(shellSource, /readStoredSheetHeightRatio\(window\.localStorage\)/);
    assert.match(shellSource, /"--mobile-station-sheet-height":\s*`\$\{Math\.round\(stationSheetRatio\s*\*\s*100\)\}dvh`/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector-station > main,\s*\.linewatch-shell\.mobile-map-inspector-station\[data-network="regional"\] > main\s*\{[^}]*bottom:\s*0\s*!important;/s);
    assert.match(ttcMapSource, /\(logicalHeight\s*\*\s*\(1\s*-\s*storedRatio\)\)\s*\/\s*2/);
    assert.match(regionalMapSource, /\(logicalHeight\s*\*\s*\(1\s*-\s*storedRatio\)\)\s*\/\s*2/);
  });

  it("dynamically adjusts the map viewport focus and bounding box to the remaining area above the sheet", () => {
    const viewportWidth = 400;
    const viewportHeight = 800;
    const stationBounds = { x: 100, y: 100, width: 64, height: 64 };

    // 1. Default 50/50 split (50% sheet, 50% remaining map view):
    const ratio50 = 0.50;
    const sheetHeight50 = viewportHeight * ratio50; // 400px
    const remaining50 = viewportHeight - sheetHeight50; // 400px
    const padding50 = Math.min(24, Math.max(8, Math.round(remaining50 * 0.08))); // 24px
    const insets50 = {
      left: padding50,
      right: padding50,
      top: padding50,
      bottom: sheetHeight50 + padding50,
    };
    const focus50 = computeInsetViewportFocus(viewportWidth, viewportHeight, insets50);
    // Focus Y must be at the exact vertical center of the top 400px remaining space (200px)
    assert.equal(focus50.focusY, 200);
    const frame50 = computeBoundedMapFrame(viewportWidth, viewportHeight, stationBounds, insets50);
    assert.ok(frame50.scale > 0);

    // 2. User increases menu size to 70% (30% remaining map view):
    const ratio70 = 0.70;
    const sheetHeight70 = viewportHeight * ratio70; // 560px
    const remaining70 = viewportHeight - sheetHeight70; // 240px
    const padding70 = Math.min(24, Math.max(8, Math.round(remaining70 * 0.08))); // 19px
    const insets70 = {
      left: padding70,
      right: padding70,
      top: padding70,
      bottom: sheetHeight70 + padding70,
    };
    const focus70 = computeInsetViewportFocus(viewportWidth, viewportHeight, insets70);
    // Focus Y must be at the exact vertical center of the top 240px remaining space (120px)
    assert.equal(focus70.focusY, 120);
    const frame70 = computeBoundedMapFrame(viewportWidth, viewportHeight, stationBounds, insets70);
    assert.ok(frame70.scale > 0);

    // 3. User increases menu size to 80% (20% remaining map view):
    const ratio80 = 0.80;
    const sheetHeight80 = viewportHeight * ratio80; // 640px
    const remaining80 = viewportHeight - sheetHeight80; // 160px
    const padding80 = Math.min(24, Math.max(8, Math.round(remaining80 * 0.08))); // 13px
    const insets80 = {
      left: padding80,
      right: padding80,
      top: padding80,
      bottom: sheetHeight80 + padding80,
    };
    const focus80 = computeInsetViewportFocus(viewportWidth, viewportHeight, insets80);
    // Focus Y must be at the exact vertical center of the top 160px remaining space (80px)
    assert.equal(focus80.focusY, 80);
    const frame80 = computeBoundedMapFrame(viewportWidth, viewportHeight, stationBounds, insets80);
    assert.ok(frame80.scale > 0);

    // 4. User increases menu size to 90% (10% remaining map view):
    const ratio90 = 0.90;
    const sheetHeight90 = viewportHeight * ratio90; // 720px
    const remaining90 = viewportHeight - sheetHeight90; // 80px
    const padding90 = Math.min(24, Math.max(8, Math.round(remaining90 * 0.08))); // 8px
    const insets90 = {
      left: padding90,
      right: padding90,
      top: padding90,
      bottom: sheetHeight90 + padding90,
    };
    const focus90 = computeInsetViewportFocus(viewportWidth, viewportHeight, insets90);
    // Focus Y must be at the exact vertical center of the top 80px remaining space (40px)
    assert.equal(focus90.focusY, 40);
    const frame90 = computeBoundedMapFrame(viewportWidth, viewportHeight, stationBounds, insets90);
    assert.ok(frame90.scale > 0);
  });

  it("preserves stored sheet height and frames the focused station in the remaining area when reopened", () => {
    const memory = new Map();
    const mockStorage = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, String(value)),
    };

    // User resized to 70% and closed the sheet
    writeStoredSheetHeightRatio(mockStorage, 0.70);

    // Next time the station submenu is opened, read stored ratio
    const restoredRatio = readStoredSheetHeightRatio(mockStorage);
    assert.equal(restoredRatio, 0.70);

    const viewportHeight = 844; // Standard iPhone 12/13/14 height
    const sheetHeight = Math.round(viewportHeight * restoredRatio); // 591px
    const remainingHeight = viewportHeight - sheetHeight; // 253px
    const padding = Math.min(24, Math.max(8, Math.round(remainingHeight * 0.08)));
    const insets = {
      left: padding,
      right: padding,
      top: padding,
      bottom: sheetHeight + padding,
    };
    const focus = computeInsetViewportFocus(390, viewportHeight, insets);
    assert.equal(focus.focusY, remainingHeight / 2);
  });

  it("establishes a minimum height floor (0.50) preventing downward over-drag while allowing upward resizing to 0.92", () => {
    // 1. Station panel stylesheet enforces 0.92 base height for mobile-map-inspector-station
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-map-inspector-station \.station-detail-panel[\s\S]*?height:\s*calc\(var\(--visual-viewport-height,\s*100dvh\)\s*\*\s*0\.92\)/,
    );
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-map-inspector-station \.station-detail-panel[\s\S]*?max-height:\s*calc\(var\(--visual-viewport-height,\s*100dvh\)\s*\*\s*0\.92\)/,
    );

    // 2. Minimum point (floor) is established at 50%
    assert.equal(MOBILE_SHEET_FLOOR_RATIO, 0.50);
    assert.equal(MOBILE_SHEET_DEFAULT_RATIO, 0.50);

    // 3. User cannot drag down past minimum floor: 0.30, 0.10, 0.00 all clamp to 0.50
    assert.equal(clampSheetRatio(0.40), 0.50);
    assert.equal(clampSheetRatio(0.20), 0.50);
    assert.equal(clampSheetRatio(0.05), 0.50);

    // 4. User can drag upwards from 0.50 towards 0.92 to see more of the station submenu
    assert.equal(clampSheetRatio(0.60), 0.60);
    assert.equal(clampSheetRatio(0.75), 0.75);
    assert.equal(clampSheetRatio(0.90), 0.90);
    assert.equal(clampSheetRatio(0.92), 0.92);
  });
});
