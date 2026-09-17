import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readDesktopSidebarCollapsed,
  saveDesktopSidebarCollapsed,
  computeDesktopLayoutMetrics,
  desktopRailDestinationForView,
  DESKTOP_DOCK_BUDGET,
  DESKTOP_RAIL_WIDTH,
  DESKTOP_SIDEBAR_TARGET_WIDTH,
  DESKTOP_SIDEBAR_DEFAULT_WIDTH,
  DESKTOP_MAP_MIN_WIDTH,
  DESKTOP_OVERLAY_MIN_MAP_EXPOSED,
} from "../src/app/desktop-sidebar-state.ts";

const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, val) => map.set(key, String(val)),
    removeItem: (key) => map.delete(key),
  };
};

describe("desktop sidebar startup behavior and session-only collapse", () => {
  it("always defaults to expanded (false) on fresh load even when legacy storage says collapsed", () => {
    assert.equal(readDesktopSidebarCollapsed(null), false);
    const storage = memoryStorage();
    storage.setItem("linewatch-desktop-sidebar-collapsed", "true");
    assert.equal(readDesktopSidebarCollapsed(storage), false);
    assert.equal(storage.getItem("linewatch-desktop-sidebar-collapsed"), null);
  });

  it("handles throwing storage gracefully without errors", () => {
    const brokenStorage = {
      getItem() { throw new Error("Blocked"); },
      setItem() { throw new Error("Blocked"); },
      removeItem() { throw new Error("Blocked"); },
    };

    assert.equal(readDesktopSidebarCollapsed(brokenStorage), false);
    assert.doesNotThrow(() => saveDesktopSidebarCollapsed(brokenStorage, true));
  });
});

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
    assert.equal(desktopRailDestinationForView("search"), "status");
    assert.equal(desktopRailDestinationForView("my-stations"), "stations");
    assert.equal(desktopRailDestinationForView("commutes"), "commutes");
    assert.equal(desktopRailDestinationForView("alert-history"), "alert-history");
    assert.equal(desktopRailDestinationForView("source-status"), "source-status");
    assert.equal(desktopRailDestinationForView("more"), "more");
  });
});


describe("destination-aware sidebar widths", () => {
  const metrics = (activeView, windowWidth = 1440, selectedStationId = null) =>
    computeDesktopLayoutMetrics({ windowWidth, isMobile: false, activeView, selectedStationId });

  it("keeps overviews compact and gives detailed views room", () => {
    for (const view of ["status", "more"]) {
      assert.equal(metrics(view).sidebarWidth, 380);
      assert.equal(metrics(view, 939).mode, "overlay");
      assert.equal(metrics(view, 940).mode, "docked");
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
    assert.equal(metrics("status", 1024).sidebarWidth, 380);
    assert.equal(metrics("status", 1024).mode, "docked");
  });

  it("preserves mobile and exposed-map limits", () => {
    assert.equal(metrics("status", 360).sidebarWidth, 0);
    assert.equal(metrics("status", 768).sidebarWidth, 380);
    assert.equal(metrics("search", 768).sidebarWidth, 528);
  });
});
