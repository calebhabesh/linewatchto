import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  resolveDesktopDestinationProfile,
  desktopRailDestinationForView,
  computeDesktopLayoutMetrics,
  DESKTOP_PROFILE_WIDTHS,
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
  describe("Destination profiles and target widths", () => {
    it("assigns Status and More to Compact profile (380px)", () => {
      assert.equal(resolveDesktopDestinationProfile("status"), "compact");
      assert.equal(resolveDesktopDestinationProfile("more"), "compact");
      assert.equal(DESKTOP_PROFILE_WIDTHS.compact, 380);
    });

    it("assigns Search to Medium profile (560px)", () => {
      assert.equal(resolveDesktopDestinationProfile("search"), "medium");
      assert.equal(DESKTOP_PROFILE_WIDTHS.medium, 560);
    });

    it("assigns Station detail to Medium profile (560px)", () => {
      assert.equal(
        resolveDesktopDestinationProfile({ activeView: "status", selectedStationId: "bloor-yonge" }),
        "medium",
      );
      assert.equal(
        resolveDesktopDestinationProfile({ activeView: "search", selectedStationId: "union" }),
        "medium",
      );
    });

    it("assigns Stations collection to Wide profile (680px)", () => {
      assert.equal(resolveDesktopDestinationProfile("my-stations"), "wide");
      assert.equal(resolveDesktopDestinationProfile({ activeView: "my-stations" }), "wide");
      assert.equal(DESKTOP_PROFILE_WIDTHS.wide, 680);
    });

    it("assigns My Commutes collection and create/edit flow to Wide profile (680px)", () => {
      assert.equal(resolveDesktopDestinationProfile("commutes"), "wide");
      assert.equal(
        resolveDesktopDestinationProfile({ activeView: "commutes", commutesTab: "saved" }),
        "wide",
      );
      assert.equal(
        resolveDesktopDestinationProfile({ activeView: "commutes", commutesTab: "create" }),
        "wide",
      );
    });

    it("assigns Impact collections and Alert History to Wide profile (680px)", () => {
      for (const view of ["alerts", "delays", "reduced-speed-zones", "closures", "line-impacts", "alert-history"]) {
        assert.equal(resolveDesktopDestinationProfile(view), "wide", `Expected ${view} to be wide`);
      }
    });
  });

  describe("Rail destinations split: Status -> Search -> Stations -> Commutes -> Alert History -> More", () => {
    it("defines the 6 agreed rail destinations in exact order", () => {
      assert.match(railSource, /{\s*key:\s*"status",\s*label:\s*"Status"/);
      assert.match(railSource, /{\s*key:\s*"search",\s*label:\s*"Search"/);
      assert.match(railSource, /{\s*key:\s*"stations",\s*label:\s*"My Stations"/);
      assert.match(railSource, /{\s*key:\s*"commutes",\s*label:\s*"My Commutes"/);
      assert.match(railSource, /{\s*key:\s*"alert-history",\s*label:\s*"Alert History"/);
      assert.match(railSource, /{\s*key:\s*"more",\s*label:\s*"More"/);
    });

    it("maps view keys to distinct stations, commutes, and alert-history rail destinations", () => {
      assert.equal(desktopRailDestinationForView("my-stations"), "stations");
      assert.equal(desktopRailDestinationForView("commutes"), "commutes");
      assert.equal(desktopRailDestinationForView("search"), "search");
      assert.equal(desktopRailDestinationForView("status"), "status");
      assert.equal(desktopRailDestinationForView("alert-history"), "alert-history");
      assert.equal(desktopRailDestinationForView("more"), "more");
    });

    it("handles badges separately for stations and commutes, hiding zero badges", () => {
      assert.match(railSource, /key === "stations" && savedStationsAffectedCount > 0/);
      assert.match(railSource, /key === "commutes" && commuteAffectedCount > 0/);
      assert.doesNotMatch(railSource, /savedBadge = commuteAffectedCount \+ savedStationsAffectedCount/);
    });
  });

  describe("Search session, query preservation, and Escape behavior", () => {
    it("preserves search origin across activation without overwriting on repeated typing", () => {
      assert.match(shellSource, /searchSessionActiveRef/);
      assert.match(shellSource, /if \(!searchSessionActiveRef\.current\) \{[\s\S]*?searchOriginRef\.current = activeView;[\s\S]*?searchSessionActiveRef\.current = true;/);
    });

    it("preserves search query when closing search or navigating away", () => {
      // handleCloseSearch does NOT wipe stationSearchQuery
      const handleCloseSearchBlock = shellSource.slice(
        shellSource.indexOf("const handleCloseSearch = useCallback("),
        shellSource.indexOf("}, [isClosingSearch, isMobile, navigateRoot, reducedMotion]);"),
      );
      assert.doesNotMatch(handleCloseSearchBlock, /setStationSearchQuery\(""\)/);
    });

    it("dismisses search and restores origin on Escape without immediately reopening", () => {
      assert.match(shellSource, /suppressSearchReopenRef/);
      assert.match(shellSource, /if \(suppressSearchReopenRef\.current\) \{[\s\S]*?suppressSearchReopenRef\.current = false;[\s\S]*?return;/);
    });
  });

  describe("Mobile preservation", () => {
    it("preserves mobile fallback and bottom navigation routing", () => {
      assert.match(shellSource, /onMobileNavSelect/);
      assert.match(shellSource, /lastSavedViewRef\.current/);
      assert.match(shellSource, /case "saved":\s*navigateRoot\(lastSavedViewRef\.current\);/);
    });

    it("preserves mobile layout mode under 768px", () => {
      const mobileMetrics = computeDesktopLayoutMetrics({ windowWidth: 360, isMobile: true, profile: "wide" });
      assert.equal(mobileMetrics.mode, "mobile");
      assert.equal(mobileMetrics.sidebarWidth, 0);
    });
  });
});
