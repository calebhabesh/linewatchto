import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  desktopRailDestinationForView,
  computeDesktopLayoutMetrics,
  DESKTOP_SIDEBAR_TARGET_WIDTH,
} from "../src/app/desktop-sidebar-state.ts";

const shellSource = readFileSync(
  new URL("../src/components/LineWatchShell.tsx", import.meta.url),
  "utf8",
);
const railSource = readFileSync(
  new URL("../src/components/DesktopNavRail.tsx", import.meta.url),
  "utf8",
);

describe("Desktop sidebar refinement: Checkpoint A (widths & navigation)", () => {
  describe("Uniform target width and responsive metrics", () => {
    it("targets 560px uniform width across all destinations", () => {
      assert.equal(DESKTOP_SIDEBAR_TARGET_WIDTH, 560);
      const metrics = computeDesktopLayoutMetrics({ windowWidth: 1440, isMobile: false });
      assert.equal(metrics.sidebarWidth, 560);
      assert.equal(metrics.mode, "docked");
      assert.equal(metrics.dockBudget, 1120);
    });
  });

  describe("Rail destinations: Status -> Stations -> Commutes -> Alert History -> More -> Source Status", () => {
    it("defines the agreed rail destinations", () => {
      assert.match(railSource, /{\s*key:\s*"status",\s*label:\s*"Status"/);
      assert.match(railSource, /{\s*key:\s*"stations",\s*label:\s*"My Stations"/);
      assert.match(railSource, /{\s*key:\s*"commutes",\s*label:\s*"My Commutes"/);
      assert.match(railSource, /{\s*key:\s*"alert-history",\s*label:\s*"Alert History"/);
      assert.match(railSource, /{\s*key:\s*"more",\s*label:\s*"More"/);
      assert.match(railSource, /data-dest="source-status"/);
    });

    it("maps view keys to distinct stations, commutes, alert-history, and source-status", () => {
      assert.equal(desktopRailDestinationForView("my-stations"), "stations");
      assert.equal(desktopRailDestinationForView("commutes"), "commutes");
      assert.equal(desktopRailDestinationForView("search"), "status");
      assert.equal(desktopRailDestinationForView("status"), "status");
      assert.equal(desktopRailDestinationForView("alert-history"), "alert-history");
      assert.equal(desktopRailDestinationForView("source-status"), "source-status");
      assert.equal(desktopRailDestinationForView("more"), "more");
    });

    it("handles badges separately for stations and commutes, hiding zero badges", () => {
      assert.match(railSource, /key === "stations" && savedStationsAffectedCount > 0/);
      assert.match(railSource, /key === "commutes" && commuteAffectedCount > 0/);
      assert.doesNotMatch(railSource, /savedBadge = commuteAffectedCount \+ savedStationsAffectedCount/);
    });
  });

  describe("Search session, query preservation, and return context behavior", () => {
    it("preserves search return context without overwriting on repeated keystrokes", () => {
      assert.match(shellSource, /searchReturnContextRef/);
      assert.match(shellSource, /if \(!searchReturnContextRef\.current\) \{/);
    });

    it("preserves search query when closing search or navigating away", () => {
      const handleCloseSearchBlock = shellSource.slice(
        shellSource.indexOf("const handleCloseSearch = useCallback("),
        shellSource.indexOf("}, [accountState.authenticated, accountState.source, isClosingSearch, isMobile, navigateRoot, reducedMotion, selectedNetwork, stationCatalogs]);"),
      );
      assert.doesNotMatch(handleCloseSearchBlock, /setStationSearchQuery\(""\)/);
    });

    it("dismisses search and restores origin on Escape without immediately reopening", () => {
      assert.match(shellSource, /suppressSearchReopenRef/);
    });
  });

  describe("Mobile preservation", () => {
    it("preserves mobile fallback and bottom navigation routing", () => {
      assert.match(shellSource, /onMobileNavSelect/);
      assert.match(shellSource, /lastSavedViewRef\.current/);
      assert.match(shellSource, /case "saved":\s*navigateRoot\(lastSavedViewRef\.current\);/);
    });

    it("preserves mobile layout mode under 768px", () => {
      const mobileMetrics = computeDesktopLayoutMetrics({ windowWidth: 360, isMobile: true });
      assert.equal(mobileMetrics.mode, "mobile");
      assert.equal(mobileMetrics.sidebarWidth, 0);
    });
  });
});
