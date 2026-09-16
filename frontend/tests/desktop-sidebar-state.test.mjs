import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readDesktopSidebarCollapsed,
  saveDesktopSidebarCollapsed,
  computeDesktopLayoutMetrics,
  DESKTOP_DOCK_BUDGET,
  DESKTOP_RAIL_WIDTH,
  DESKTOP_SIDEBAR_DEFAULT_WIDTH,
  DESKTOP_SIDEBAR_MIN_WIDTH,
  DESKTOP_MAP_MIN_WIDTH,
} from "../src/app/desktop-sidebar-state.ts";

const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, val) => map.set(key, String(val)),
    removeItem: (key) => map.delete(key),
  };
};

describe("desktop sidebar collapse preference persistence", () => {
  it("defaults to expanded (false) when storage is empty or null", () => {
    assert.equal(readDesktopSidebarCollapsed(null), false);
    assert.equal(readDesktopSidebarCollapsed(memoryStorage()), false);
  });

  it("persists and restores explicit collapsed and expanded states", () => {
    const storage = memoryStorage();
    saveDesktopSidebarCollapsed(storage, true);
    assert.equal(readDesktopSidebarCollapsed(storage), true);

    saveDesktopSidebarCollapsed(storage, false);
    assert.equal(readDesktopSidebarCollapsed(storage), false);
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

  it("returns overlay mode on narrow desktops below the dock budget", () => {
    // 768px desktop minimum
    const at768 = computeDesktopLayoutMetrics({ windowWidth: 768, isMobile: false });
    assert.equal(at768.mode, "overlay");
    assert.equal(at768.sidebarWidth, DESKTOP_SIDEBAR_MIN_WIDTH);
    assert.equal(at768.railWidth, DESKTOP_RAIL_WIDTH);

    // 820px narrow desktop (like tablet in landscape)
    const at820 = computeDesktopLayoutMetrics({ windowWidth: 820, isMobile: false });
    assert.equal(at820.mode, "overlay");
    assert.equal(at820.sidebarWidth, DESKTOP_SIDEBAR_MIN_WIDTH);

    // Just below the 872px boundary (871px)
    const at871 = computeDesktopLayoutMetrics({ windowWidth: 871, isMobile: false });
    assert.equal(at871.mode, "overlay");
    assert.equal(at871.sidebarWidth, DESKTOP_SIDEBAR_MIN_WIDTH);
  });

  it("returns docked mode when window width meets or exceeds the dock budget", () => {
    // Exactly at the 872px dock boundary
    const at872 = computeDesktopLayoutMetrics({ windowWidth: 872, isMobile: false });
    assert.equal(at872.mode, "docked");
    assert.equal(at872.sidebarWidth, DESKTOP_SIDEBAR_MIN_WIDTH); // 320px
    assert.equal(at872.minMapWidth, DESKTOP_MAP_MIN_WIDTH);

    // 900px intermediate desktop
    const at900 = computeDesktopLayoutMetrics({ windowWidth: 900, isMobile: false });
    assert.equal(at900.mode, "docked");
    assert.equal(at900.sidebarWidth, 900 - 72 - 480); // 348px

    // 932px where content reaches default full 380px
    const at932 = computeDesktopLayoutMetrics({ windowWidth: 932, isMobile: false });
    assert.equal(at932.mode, "docked");
    assert.equal(at932.sidebarWidth, DESKTOP_SIDEBAR_DEFAULT_WIDTH); // 380px

    // Standard 1440px desktop
    const at1440 = computeDesktopLayoutMetrics({ windowWidth: 1440, isMobile: false });
    assert.equal(at1440.mode, "docked");
    assert.equal(at1440.sidebarWidth, DESKTOP_SIDEBAR_DEFAULT_WIDTH); // 380px
  });
});
