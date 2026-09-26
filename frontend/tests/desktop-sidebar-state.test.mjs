import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeDesktopLayoutMetrics,
  desktopRailDestinationForView,
  DESKTOP_DOCK_BUDGET,
  DESKTOP_RAIL_WIDTH,
  DESKTOP_SIDEBAR_TARGET_WIDTH,
  DESKTOP_SIDEBAR_DEFAULT_WIDTH,
  DESKTOP_MAP_MIN_WIDTH,
  DESKTOP_OVERLAY_MIN_MAP_EXPOSED,
  readDesktopLeftOcclusion,
  measureDesktopMapInsets,
} from "../src/app/desktop-sidebar-state.ts";

describe("desktop layout budget and responsive modes", () => {
  it("returns mobile mode for mobile viewports or screens under 768px", () => {
    assert.deepEqual(
      computeDesktopLayoutMetrics({ windowWidth: 1024, isMobile: true }),
      {
        mode: "mobile",
        sidebarWidth: 0,
        minMapWidth: 0,
        dockBudget: DESKTOP_DOCK_BUDGET,
        railWidth: 0,
      },
    );

    assert.deepEqual(
      computeDesktopLayoutMetrics({ windowWidth: 500, isMobile: false }),
      {
        mode: "mobile",
        sidebarWidth: 0,
        minMapWidth: 0,
        dockBudget: DESKTOP_DOCK_BUDGET,
        railWidth: 0,
      },
    );
  });

  it("enforces uniform 560px target width and concrete 1120px dock threshold", () => {
    assert.equal(DESKTOP_SIDEBAR_TARGET_WIDTH, 560);
    assert.equal(DESKTOP_SIDEBAR_DEFAULT_WIDTH, 560);
    assert.equal(DESKTOP_RAIL_WIDTH, 80);
    assert.equal(DESKTOP_MAP_MIN_WIDTH, 480);
    assert.equal(DESKTOP_DOCK_BUDGET, 1120);

    // Below dock budget: overlay mode
    const under = computeDesktopLayoutMetrics({ windowWidth: 1119, isMobile: false });
    assert.equal(under.mode, "overlay");
    assert.equal(under.sidebarWidth, 560);

    // At dock budget: docked mode
    const atDock = computeDesktopLayoutMetrics({ windowWidth: 1120, isMobile: false });
    assert.equal(atDock.mode, "docked");
    assert.equal(atDock.sidebarWidth, 560);

    // Above dock budget: docked mode with 560px sidebar
    const above = computeDesktopLayoutMetrics({ windowWidth: 1440, isMobile: false });
    assert.equal(above.mode, "docked");
    assert.equal(above.sidebarWidth, 560);
  });

  it("calculates overlay width leaving at least 160px exposed map at narrow desktop viewports", () => {
    // 768px desktop boundary: 768 - 80 (rail) - 160 (min exposed map) = 528px available
    const at768 = computeDesktopLayoutMetrics({ windowWidth: 768, isMobile: false });
    assert.equal(at768.mode, "overlay");
    assert.equal(at768.sidebarWidth, 528);

    const exposedMap = 768 - DESKTOP_RAIL_WIDTH - at768.sidebarWidth;
    assert.equal(exposedMap, DESKTOP_OVERLAY_MIN_MAP_EXPOSED);
  });

  it("validates 1024px, 1120px, and 1440px viewport milestones from handoff", () => {
    // At 1024px: overlay mode (1024 < 1120) with full 560px width
    const at1024 = computeDesktopLayoutMetrics({ windowWidth: 1024, isMobile: false });
    assert.equal(at1024.mode, "overlay");
    assert.equal(at1024.sidebarWidth, 560);
    const exposedMap1024 = 1024 - DESKTOP_RAIL_WIDTH - at1024.sidebarWidth;
    assert.equal(exposedMap1024, 384); // > 160px

    // At 1120px: docked mode (1120 >= 1120), leaving exactly 480px for map
    const at1120 = computeDesktopLayoutMetrics({ windowWidth: 1120, isMobile: false });
    assert.equal(at1120.mode, "docked");
    assert.equal(at1120.sidebarWidth, 560);
    const mapRemaining1120 = 1120 - DESKTOP_RAIL_WIDTH - at1120.sidebarWidth;
    assert.equal(mapRemaining1120, 480);

    // Standard 1440px desktop: docked with 560px sidebar
    const at1440 = computeDesktopLayoutMetrics({ windowWidth: 1440, isMobile: false });
    assert.equal(at1440.mode, "docked");
    assert.equal(at1440.sidebarWidth, 560);
    const mapRemaining1440 = 1440 - DESKTOP_RAIL_WIDTH - at1440.sidebarWidth;
    assert.equal(mapRemaining1440, 800);
  });

  it("maps rail destinations correctly including source-status and search", () => {
    assert.equal(desktopRailDestinationForView("status"), "status");
    assert.equal(desktopRailDestinationForView("alerts"), "alerts");
    assert.equal(desktopRailDestinationForView("delays"), "delays");
    assert.equal(desktopRailDestinationForView("reduced-speed-zones"), "reduced-speed-zones");
    assert.equal(desktopRailDestinationForView("closures"), "closures");
    assert.equal(desktopRailDestinationForView("trip-changes"), "trip-changes");
    assert.equal(desktopRailDestinationForView("search"), "status");
    assert.equal(desktopRailDestinationForView("my-stations"), "stations");
    assert.equal(desktopRailDestinationForView("commutes"), "commutes");
    assert.equal(desktopRailDestinationForView("alert-history"), "alert-history");
    assert.equal(desktopRailDestinationForView("source-status"), "source-status");
    assert.equal(desktopRailDestinationForView("feedback"), "feedback");
    assert.equal(desktopRailDestinationForView("more"), "more");
  });
});


describe("destination-aware sidebar widths", () => {
  const metrics = (activeView, windowWidth = 1440, selectedStationId = null) =>
    computeDesktopLayoutMetrics({ windowWidth, isMobile: false, activeView, selectedStationId });

  it("keeps overviews compact and gives detailed views room", () => {
    for (const view of ["status", "map", "more"]) {
      const width = view === "more" ? 380 : 420;
      assert.equal(metrics(view).sidebarWidth, width);
      assert.equal(metrics(view, width + 559).mode, "overlay");
      assert.equal(metrics(view, width + 560).mode, "docked");
    }
    for (const view of ["search", "my-stations", "commutes", "alerts", "closures", "analytics", "source-status"]) {
      assert.equal(metrics(view).sidebarWidth, 560);
      assert.equal(metrics(view, 1119).mode, "overlay");
      assert.equal(metrics(view, 1120).mode, "docked");
    }
  });

  it("expands station detail over Status and restores compact width on dismissal", () => {
    assert.equal(metrics("status", 1024, "station-union").sidebarWidth, 560);
    assert.equal(metrics("status", 1024, "station-union").mode, "overlay");
    assert.equal(metrics("status", 1024).sidebarWidth, 420);
    assert.equal(metrics("status", 1024).mode, "docked");
  });

  it("preserves mobile and exposed-map limits", () => {
    assert.equal(metrics("status", 360).sidebarWidth, 0);
    assert.equal(metrics("status", 768).sidebarWidth, 420);
    assert.equal(metrics("search", 768).sidebarWidth, 528);
  });
});

describe("desktop map insets and occlusion helpers", () => {
  it("returns zero insets when container is missing or on mobile", () => {
    assert.deepEqual(measureDesktopMapInsets(null), { top: 0, bottom: 0 });
    assert.equal(readDesktopLeftOcclusion(null, false), 0);
  });

  it("measures desktop map insets from rail and bottom chips", () => {
    const origWindow = globalThis.window;
    globalThis.window = {
      innerWidth: 1024,
      getComputedStyle: () => ({ display: "block" }),
    };

    const mockRail = {
      getBoundingClientRect: () => ({ width: 48, height: 120, top: 0, bottom: 120 }),
    };
    const mockContainer = {
      getClientRects: () => [{ width: 1024, height: 768 }],
      getBoundingClientRect: () => ({ width: 1024, height: 768, top: 0, bottom: 768 }),
      closest: () => ({
        querySelector: (sel) => {
          if (sel === ".desktop-map-control-rail") return mockRail;
          if (sel === ".desktop-status-chip-row-container") {
            return {
              getBoundingClientRect: () => ({ width: 400, height: 40, top: 720, bottom: 760 }),
            };
          }
          return null;
        },
      }),
    };

    const insets = measureDesktopMapInsets(mockContainer, mockRail);
    assert.equal(insets.top, 120);
    assert.equal(insets.bottom, 48); // 768 - 720

    globalThis.window = origWindow;
  });

  it("measures desktop left occlusion bounded by minimum visible width", () => {
    const origWindow = globalThis.window;
    globalThis.window = {
      innerWidth: 1280,
      getComputedStyle: () => ({ display: "block" }),
    };

    const mockViewport = {
      getBoundingClientRect: () => ({ left: 0, right: 1280, width: 1280, top: 0, bottom: 800 }),
      closest: () => ({
        querySelector: (sel) => {
          if (sel.includes(".desktop-sidebar-container")) {
            return {
              getAttribute: () => "false",
              getBoundingClientRect: () => ({ left: 0, right: 380, width: 380 }),
            };
          }
          if (sel === "#linewatch-main-menu") {
            return {
              getAttribute: () => "false",
              getBoundingClientRect: () => ({ left: 0, right: 280, width: 280 }),
            };
          }
          return null;
        },
      }),
    };

    const occlusion = readDesktopLeftOcclusion(mockViewport, false, 24);
    assert.equal(occlusion, 380 + 24); // 404

    globalThis.window = origWindow;
  });
});
