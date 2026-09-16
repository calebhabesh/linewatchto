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
    assert.match(shellSource, /<DesktopNavRail[\s\S]*?activeDestination=\{desktopRailDestinationForView\(activeView\)\}/);
    assert.match(shellSource, /id="desktop-sidebar-container"/);
    assert.match(shellSource, /desktop-sidebar-container--docked/);
    assert.match(shellSource, /desktop-sidebar-container--overlay/);
    assert.match(shellSource, /desktop-sidebar-container--collapsed/);
    assert.match(shellSource, /className="desktop-map-workspace"/);
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

  it("accounts for desktop overlay insets in pan zoom camera fitting for both TTC and GO/UP", () => {
    assert.match(panZoomSource, /readDesktopOverlayInsets/);
    assert.match(ttcMapSource, /readDesktopOverlayInsets/);
    assert.match(regionalMapSource, /readDesktopOverlayInsets/);
    assert.match(regionalMapSource, /const desktopOverlay = readDesktopOverlayInsets\(viewport\);/);
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
    assert.match(globalCss, /\.desktop-sidebar-container\s*\{/);
    assert.match(globalCss, /\.desktop-sidebar-container--docked\s*\{/);
    assert.match(globalCss, /\.desktop-sidebar-container--overlay\s*\{/);
    assert.match(globalCss, /\.desktop-sidebar-container--collapsed\s*\{/);
    assert.match(globalCss, /\.desktop-map-workspace\s*\{[^}]*flex:\s*1 1 0;[^}]*position:\s*relative;/s);
  });
});
