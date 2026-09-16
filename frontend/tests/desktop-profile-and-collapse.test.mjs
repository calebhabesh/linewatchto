import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readDesktopSidebarCollapsed,
  saveDesktopSidebarCollapsed,
  computeDesktopLayoutMetrics,
  resolveDesktopDestinationProfile,
  readDesktopOverlayInsets,
} from "../src/app/desktop-sidebar-state.ts";

const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, val) => map.set(key, String(val)),
    removeItem: (key) => map.delete(key),
  };
};

describe("desktop profile navigation and back-state restoration", () => {
  it("restores originating profile width when navigating back from details or forms", () => {
    // 1. Initial status view -> compact (380px)
    let currentView = "status";
    let selectedStationId = null;
    assert.equal(
      resolveDesktopDestinationProfile({ activeView: currentView, selectedStationId }),
      "compact",
    );
    assert.equal(
      computeDesktopLayoutMetrics({ windowWidth: 1440, isMobile: false, profile: "compact" }).sidebarWidth,
      380,
    );

    // 2. Drill down into station detail -> medium (560px)
    selectedStationId = "bloor-yonge";
    const detailProfile = resolveDesktopDestinationProfile({ activeView: currentView, selectedStationId });
    assert.equal(detailProfile, "medium");
    assert.equal(
      computeDesktopLayoutMetrics({ windowWidth: 1440, isMobile: false, profile: detailProfile }).sidebarWidth,
      560,
    );

    // 3. Back from station detail -> restores compact (380px)
    selectedStationId = null;
    const restoredProfile = resolveDesktopDestinationProfile({ activeView: currentView, selectedStationId });
    assert.equal(restoredProfile, "compact");
    assert.equal(
      computeDesktopLayoutMetrics({ windowWidth: 1440, isMobile: false, profile: restoredProfile }).sidebarWidth,
      380,
    );

    // 4. Navigate into closures -> wide (680px)
    currentView = "closures";
    const closuresProfile = resolveDesktopDestinationProfile({ activeView: currentView, selectedStationId });
    assert.equal(closuresProfile, "wide");
    assert.equal(
      computeDesktopLayoutMetrics({ windowWidth: 1440, isMobile: false, profile: closuresProfile }).sidebarWidth,
      680,
    );

    // 5. Drill into station from closure -> medium (560px)
    selectedStationId = "spadina";
    assert.equal(
      resolveDesktopDestinationProfile({ activeView: currentView, selectedStationId }),
      "medium",
    );

    // 6. Back from station -> restores wide (680px) for closures
    selectedStationId = null;
    assert.equal(
      resolveDesktopDestinationProfile({ activeView: currentView, selectedStationId }),
      "wide",
    );
  });
});

describe("transient 'View on map' collapse contract", () => {
  it("preserves durable preference during transient collapse, unlike explicit rail collapse", () => {
    const storage = memoryStorage();
    // User preference is expanded (default: false)
    assert.equal(readDesktopSidebarCollapsed(storage), false);

    // In-memory state
    let inMemoryCollapsed = false;

    // Transient collapse: triggered by "View on map" in overlay mode
    // Sets in-memory state to true WITHOUT mutating storage
    inMemoryCollapsed = true;
    assert.equal(inMemoryCollapsed, true);
    // Durable storage remains false!
    assert.equal(readDesktopSidebarCollapsed(storage), false);

    // Re-opening via rail toggle button writes the new explicit preference (false)
    inMemoryCollapsed = false;
    saveDesktopSidebarCollapsed(storage, false);
    assert.equal(readDesktopSidebarCollapsed(storage), false);

    // Explicit rail collapse: writes true to storage
    inMemoryCollapsed = true;
    saveDesktopSidebarCollapsed(storage, true);
    assert.equal(readDesktopSidebarCollapsed(storage), true);
  });

  it("yields zero overlay insets when collapsed, preventing duplicate camera jumps", () => {
    // Simulated mock elements
    const mockViewport = {
      closest(selector) {
        if (selector === ".linewatch-shell") {
          return mockShell;
        }
        return null;
      },
      getBoundingClientRect() {
        return { left: 72, right: 1024, width: 952, height: 768 };
      },
    };

    let isCollapsed = false;
    const mockOverlayPanel = {
      getAttribute(attr) {
        if (attr === "aria-hidden") return isCollapsed ? "true" : null;
        return null;
      },
      getBoundingClientRect() {
        return { left: 72, right: 72 + 680, width: 680, height: 768 };
      },
    };

    const mockShell = {
      querySelector(selector) {
        if (selector.includes("--overlay") && !isCollapsed) {
          return mockOverlayPanel;
        }
        return null;
      },
    };

    // Global mock window for Node test
    const prevWindow = globalThis.window;
    globalThis.window = { innerWidth: 1024 };

    try {
      // 1. When sidebar is open in overlay mode: overlay inset is measured (680px)
      isCollapsed = false;
      const openInsets = readDesktopOverlayInsets(mockViewport);
      assert.equal(openInsets.left, 680);

      // 2. When transiently collapsed: overlay inset immediately drops to 0
      isCollapsed = true;
      const collapsedInsets = readDesktopOverlayInsets(mockViewport);
      assert.equal(collapsedInsets.left, 0);
    } finally {
      globalThis.window = prevWindow;
    }
  });
});
