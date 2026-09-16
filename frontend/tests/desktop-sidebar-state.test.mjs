import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readDesktopSidebarCollapsed,
  saveDesktopSidebarCollapsed,
  computeDesktopLayoutMetrics,
  resolveDesktopDestinationProfile,
  DESKTOP_PROFILE_WIDTHS,
  DESKTOP_PROFILE_DOCK_BUDGETS,
  DESKTOP_DOCK_BUDGET,
  DESKTOP_RAIL_WIDTH,
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
    // Cleans up obsolete key
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

describe("desktop destination profile resolution", () => {
  it("resolves compact profile (380px) for status and more roots", () => {
    for (const view of ["status", "more", "menu", "saved", "map"]) {
      assert.equal(
        resolveDesktopDestinationProfile(view),
        "compact",
        `Expected ${view} to resolve to compact`,
      );
      assert.equal(
        resolveDesktopDestinationProfile({ activeView: view }),
        "compact",
      );
    }
  });

  it("resolves medium profile (560px) for search, station detail, and substantive forms", () => {
    // Search resolves to medium (560px)
    assert.equal(resolveDesktopDestinationProfile("search"), "medium");
    assert.equal(resolveDesktopDestinationProfile({ activeView: "search" }), "medium");

    // Station detail takes precedence regardless of underlying activeView
    assert.equal(
      resolveDesktopDestinationProfile({ activeView: "status", selectedStationId: "union" }),
      "medium",
    );
    assert.equal(
      resolveDesktopDestinationProfile({ activeView: "alerts", selectedStationId: "bloor-yonge" }),
      "medium",
    );

    // Substantive forms & documents
    for (const formView of ["notifications", "feedback", "privacy-acknowledgements", "release-notes"]) {
      assert.equal(
        resolveDesktopDestinationProfile(formView),
        "medium",
        `Expected ${formView} to resolve to medium`,
      );
    }
  });

  it("resolves wide profile (680px) for rich impact collections, Stations, My Commutes, line impacts, and analytics", () => {
    const wideViews = [
      "alerts",
      "delays",
      "reduced-speed-zones",
      "closures",
      "line-impacts",
      "accessibility-outages",
      "surface-notices",
      "announcements",
      "analytics",
      "alert-history",
      "my-stations",
      "commutes",
    ];
    for (const view of wideViews) {
      assert.equal(
        resolveDesktopDestinationProfile(view),
        "wide",
        `Expected ${view} to resolve to wide`,
      );
    }

    // Both commute collection and commute creation/edit flow resolve to wide (680px)
    assert.equal(
      resolveDesktopDestinationProfile({ activeView: "commutes", commutesTab: "create" }),
      "wide",
    );
    assert.equal(
      resolveDesktopDestinationProfile({ activeView: "commutes", commutesTab: "saved" }),
      "wide",
    );
  });

  it("keeps profile stable across simulated filter/data/loading changes", () => {
    // Calling with pure view strings or contexts without counts preserves stability
    assert.equal(resolveDesktopDestinationProfile({ activeView: "closures" }), "wide");
    assert.equal(resolveDesktopDestinationProfile({ activeView: "my-stations" }), "wide");
    assert.equal(resolveDesktopDestinationProfile({ activeView: "commutes" }), "wide");
  });
});

describe("desktop layout budget and responsive modes", () => {
  it("returns mobile mode for mobile viewports or screens under 768px", () => {
    assert.deepEqual(
      computeDesktopLayoutMetrics({ windowWidth: 1024, isMobile: true, profile: "compact" }),
      {
        mode: "mobile",
        sidebarWidth: 0,
        minMapWidth: 0,
        dockBudget: DESKTOP_PROFILE_DOCK_BUDGETS.compact,
        railWidth: 0,
        profile: "compact",
      },
    );

    assert.deepEqual(
      computeDesktopLayoutMetrics({ windowWidth: 500, isMobile: false, profile: "wide" }),
      {
        mode: "mobile",
        sidebarWidth: 0,
        minMapWidth: 0,
        dockBudget: DESKTOP_PROFILE_DOCK_BUDGETS.wide,
        railWidth: 0,
        profile: "wide",
      },
    );
  });

  it("enforces concrete dock thresholds: 940px (compact), 1120px (medium), 1240px (wide)", () => {
    assert.equal(DESKTOP_PROFILE_WIDTHS.compact, 380);
    assert.equal(DESKTOP_PROFILE_WIDTHS.medium, 560);
    assert.equal(DESKTOP_PROFILE_WIDTHS.wide, 680);
    assert.equal(DESKTOP_SIDEBAR_DEFAULT_WIDTH, 380);
    assert.equal(DESKTOP_MAP_MIN_WIDTH, 480);
    assert.equal(DESKTOP_PROFILE_DOCK_BUDGETS.compact, 940);
    assert.equal(DESKTOP_PROFILE_DOCK_BUDGETS.medium, 1120);
    assert.equal(DESKTOP_PROFILE_DOCK_BUDGETS.wide, 1240);
    assert.equal(DESKTOP_DOCK_BUDGET, 940);

    // Compact threshold (940px)
    const compactUnder = computeDesktopLayoutMetrics({ windowWidth: 939, isMobile: false, profile: "compact" });
    assert.equal(compactUnder.mode, "overlay");
    assert.equal(compactUnder.sidebarWidth, 380);

    const compactAt = computeDesktopLayoutMetrics({ windowWidth: 940, isMobile: false, profile: "compact" });
    assert.equal(compactAt.mode, "docked");
    assert.equal(compactAt.sidebarWidth, 380);

    // Medium threshold (1120px)
    const mediumUnder = computeDesktopLayoutMetrics({ windowWidth: 1119, isMobile: false, profile: "medium" });
    assert.equal(mediumUnder.mode, "overlay");
    assert.equal(mediumUnder.sidebarWidth, 560);

    const mediumAt = computeDesktopLayoutMetrics({ windowWidth: 1120, isMobile: false, profile: "medium" });
    assert.equal(mediumAt.mode, "docked");
    assert.equal(mediumAt.sidebarWidth, 560);

    // Wide threshold (1240px)
    const wideUnder = computeDesktopLayoutMetrics({ windowWidth: 1239, isMobile: false, profile: "wide" });
    assert.equal(wideUnder.mode, "overlay");
    assert.equal(wideUnder.sidebarWidth, 680);

    const wideAt = computeDesktopLayoutMetrics({ windowWidth: 1240, isMobile: false, profile: "wide" });
    assert.equal(wideAt.mode, "docked");
    assert.equal(wideAt.sidebarWidth, 680);
  });

  it("calculates overlay width leaving at least 160px exposed map at narrow desktop viewports", () => {
    // 768px desktop boundary: 768 - 80 (rail) - 160 (min exposed map) = 528px available
    const compactAt768 = computeDesktopLayoutMetrics({ windowWidth: 768, isMobile: false, profile: "compact" });
    assert.equal(compactAt768.mode, "overlay");
    assert.equal(compactAt768.sidebarWidth, 380); // min(380, 528) = 380

    const mediumAt768 = computeDesktopLayoutMetrics({ windowWidth: 768, isMobile: false, profile: "medium" });
    assert.equal(mediumAt768.mode, "overlay");
    assert.equal(mediumAt768.sidebarWidth, 528); // min(560, 528) = 528

    const wideAt768 = computeDesktopLayoutMetrics({ windowWidth: 768, isMobile: false, profile: "wide" });
    assert.equal(wideAt768.mode, "overlay");
    assert.equal(wideAt768.sidebarWidth, 528); // min(680, 528) = 528

    // Exposed map space is exactly 160px for medium/wide at 768px
    const exposedMap = 768 - DESKTOP_RAIL_WIDTH - wideAt768.sidebarWidth;
    assert.equal(exposedMap, DESKTOP_OVERLAY_MIN_MAP_EXPOSED);
  });

  it("validates 1024px, 1280px, and 1440px viewport milestones from handoff", () => {
    // At 1024px: wide panel overlays (1024 < 1240)
    const wideAt1024 = computeDesktopLayoutMetrics({ windowWidth: 1024, isMobile: false, profile: "wide" });
    assert.equal(wideAt1024.mode, "overlay");
    assert.equal(wideAt1024.sidebarWidth, 680);
    const exposedMap1024 = 1024 - DESKTOP_RAIL_WIDTH - wideAt1024.sidebarWidth;
    assert.equal(exposedMap1024, 264); // > 160px

    // At 1280px: wide panel docks (1280 >= 1240), leaving 520px for map
    const wideAt1280 = computeDesktopLayoutMetrics({ windowWidth: 1280, isMobile: false, profile: "wide" });
    assert.equal(wideAt1280.mode, "docked");
    assert.equal(wideAt1280.sidebarWidth, 680);
    const mapRemaining1280 = 1280 - DESKTOP_RAIL_WIDTH - wideAt1280.sidebarWidth;
    assert.equal(mapRemaining1280, 520);

    // Standard 1440px desktop: all profiles docked
    const compact1440 = computeDesktopLayoutMetrics({ windowWidth: 1440, isMobile: false, profile: "compact" });
    assert.equal(compact1440.mode, "docked");
    assert.equal(compact1440.sidebarWidth, 380);

    const wide1440 = computeDesktopLayoutMetrics({ windowWidth: 1440, isMobile: false, profile: "wide" });
    assert.equal(wide1440.mode, "docked");
    assert.equal(wide1440.sidebarWidth, 680);
  });
});
