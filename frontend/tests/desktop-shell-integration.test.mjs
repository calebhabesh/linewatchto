import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const regionalMapSource = readFileSync(new URL("../src/components/InteractiveRegionalMap.tsx", import.meta.url), "utf8");
const ttcMapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const panZoomSource = readFileSync(new URL("../src/hooks/usePanZoom.ts", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

describe("desktop shell layout & geometry integration (Session 1)", () => {
  it("renders DesktopNavRail and desktop sidebar container when not mobile", () => {
    assert.match(shellSource, /!isMobile \? \(\s*<div className="linewatch-desktop-layout">/);
    assert.match(shellSource, /<DesktopNavRail[\s\S]*?activeDestination=\{[\s\S]*?desktopRailDestinationForView\(activeView\)[\s\S]*?\}/);
    assert.match(shellSource, /id="desktop-sidebar-container"/);
    assert.match(shellSource, /desktop-sidebar-container--docked/);
    assert.match(shellSource, /desktop-sidebar-container--overlay/);
    assert.match(shellSource, /desktop-sidebar-container--collapsed/);
    assert.match(shellSource, /className="desktop-map-workspace"/);
  });

  it("wires category counts and direct destinations into the desktop rail", () => {
    assert.match(shellSource, /activeAlertCount=\{activeAlerts\.length\}/);
    assert.match(shellSource, /delayCount=\{delays\.length\}/);
    assert.match(shellSource, /reducedSpeedZoneCount=\{reducedSpeedZoneCount\}/);
    assert.match(shellSource, /plannedClosureCount=\{plannedClosures\.length\}/);
    assert.match(shellSource, /tripChangeCount=\{regionalTripChangeCount \?\? 0\}/);
    assert.match(shellSource, /case "alerts":[\s\S]*?case "closures":[\s\S]*?navigateRoot\(dest\)/);
    assert.match(shellSource, /case "trip-changes":[\s\S]*?setSurfaceNoticeInitialContent\("trip-changes"\)[\s\S]*?navigateRoot\("surface-notices"\)/);
    assert.match(shellSource, /activeView === "surface-notices"[\s\S]*?surfaceNoticeInitialContent === "trip-changes"[\s\S]*?\? "trip-changes"/);
  });

  it("keeps map interactive on desktop beside open sidebar", () => {
    assert.match(
      shellSource,
      /isMapActive=\{!showClosedScreen\}/,
    );
  });

  it("initializes activeView deterministically and syncs status on desktop mount", () => {
    assert.match(shellSource, /const \[activeView, setActiveView\] = useState<ActiveView>\("map"\);/);
    assert.match(shellSource, /setActiveView\(\(curr\) => \(curr === "map" \? "status" : curr\)\);/);
  });

  it("expands desktop sidebar in-memory when station or impact is selected on map", () => {
    assert.match(shellSource, /if \(!isMobile && desktopSidebarCollapsed\) \{\s*setDesktopSidebarCollapsed\(false\);\s*\}/);
    assert.match(shellSource, /if \(desktopSidebarCollapsed\) \{\s*setDesktopSidebarCollapsed\(false\);\s*\}/);
  });

  it("toggles desktop sidebar in-memory for active session", () => {
    assert.match(shellSource, /const handleToggleDesktopSidebar = useCallback\(\(\) => \{\s*setDesktopSidebarCollapsed\(\(prev\) => !prev\);\s*\}, \[\]\);/);
  });

  it("keeps default camera fitting independent from the sidebar and uses its inset only for focused targets", () => {
    assert.doesNotMatch(panZoomSource, /readDesktopOverlayInsets/);
    assert.match(ttcMapSource, /readDesktopOverlayInsets/);
    assert.match(regionalMapSource, /readDesktopOverlayInsets/);
    assert.doesNotMatch(regionalMapSource, /observer\.observe\(sidebar\)/);
    assert.doesNotMatch(panZoomSource, /observer\.observe\(sidebar\)/);
  });

  it("centers selected station in unoccluded viewport area on desktop", () => {
    assert.match(
      ttcMapSource,
      /const focusX = isMobile\s*\?\s*logicalWidth \/ 2\s*:\s*\(logicalWidth \+ selectionFocusInsets\.left - selectionFocusInsets\.right\) \/ 2;/,
    );
    assert.match(
      regionalMapSource,
      /const focusX = isMobile\s*\?\s*logicalWidth \/ 2\s*:\s*\(logicalWidth \+ focusInsets\.left - focusInsets\.right\) \/ 2;/,
    );
  });

  it("defines correct CSS layout classes for desktop rail, sidebar, and workspace", () => {
    assert.match(globalCss, /\.linewatch-desktop-layout\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*row;/s);
    assert.match(globalCss, /\.desktop-nav-rail\s*\{[^}]*width:\s*var\(--desktop-rail-width,\s*80px\);/s);
    assert.match(globalCss, /\.desktop-sidebar-container\s*\{[^}]*position:\s*absolute;/s);
    assert.match(globalCss, /\.desktop-sidebar-container--docked\s*\{/);
    assert.match(globalCss, /\.desktop-sidebar-container--overlay\s*\{/);
    assert.match(globalCss, /\.desktop-sidebar-container--collapsed\s*\{/);
    assert.match(globalCss, /\.desktop-map-workspace\s*\{[^}]*flex:\s*1 1 0;[^}]*position:\s*relative;/s);
  });

  it("renders an animated transit accent strip transitioning between collapsed and expanded portions with curved edges", () => {
    assert.match(shellSource, /className=\{`linewatch-transit-accent-strip desktop-sidebar-accent-strip/);
    assert.match(globalCss, /\.linewatch-transit-accent-strip\.desktop-sidebar-accent-strip\s*\{[^}]*border-top:\s*5px solid transparent/s);
    assert.match(globalCss, /\.linewatch-transit-accent-strip\.desktop-sidebar-accent-strip\s*\{[^}]*border-right:\s*1\.8px solid transparent/s);
    assert.match(globalCss, /\.linewatch-transit-accent-strip\.desktop-sidebar-accent-strip\s*\{[^}]*border-top-right-radius:\s*16px/s);
    assert.match(globalCss, /\.linewatch-transit-accent-strip\.desktop-sidebar-accent-strip\s*\{[^}]*border-bottom-right-radius:\s*1\.8px/s);
    assert.match(globalCss, /\.desktop-nav-rail\s*\{[^}]*border-top-right-radius:\s*0;/s);
    assert.match(globalCss, /\.desktop-nav-rail\[data-collapsed="true"\]\s*\{[^}]*border-top-right-radius:\s*16px;/s);
    assert.match(globalCss, /\.desktop-sidebar-container\s*\{[^}]*border-top-right-radius:\s*16px;/s);
  });

  it("hides desktop rail, sidebar, accent strip, and notices under mobile viewports to prevent layout leakage", () => {
    assert.match(
      globalCss,
      /@media\s*\([^)]*max-width:\s*767px[^)]*\)[^{]*\{[\s\S]*?\.desktop-nav-rail[\s\S]*?\.desktop-sidebar-container[\s\S]*?display:\s*none/s,
    );
    assert.match(
      globalCss,
      /@media\s*\([^)]*max-width:\s*767px[^)]*\)[^{]*\{[\s\S]*?\.desktop-sidebar-accent-strip[\s\S]*?display:\s*none/s,
    );
  });
});
