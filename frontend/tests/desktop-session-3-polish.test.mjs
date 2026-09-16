import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";
import {
  computeDesktopLayoutMetrics,
  DESKTOP_DOCK_BUDGET,
  DESKTOP_RAIL_WIDTH,
  DESKTOP_SIDEBAR_DEFAULT_WIDTH,
  DESKTOP_MAP_MIN_WIDTH,
} from "../src/app/desktop-sidebar-state.ts";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const railSource = readFileSync(new URL("../src/components/DesktopNavRail.tsx", import.meta.url), "utf8");
const statusOverviewSource = readFileSync(new URL("../src/components/DesktopStatusOverview.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

describe("desktop responsive and accessibility polish (Session 3)", () => {
  describe("keyboard navigation shortcuts (Esc and Arrow Keys)", () => {
    it("DesktopNavRail supports ArrowDown, ArrowUp, Home, and End roving focus across rail items", () => {
      assert.match(railSource, /handleItemKeyDown/);
      assert.match(railSource, /event\.key === "ArrowDown"/);
      assert.match(railSource, /event\.key === "ArrowUp"/);
      assert.match(railSource, /event\.key === "Home"/);
      assert.match(railSource, /event\.key === "End"/);
      assert.match(railSource, /handleToggleKeyDown/);
      assert.match(railSource, /itemRefs\.current\[0\]\?\.focus\(\)/);
    });

    it("DesktopNavRail binds refs and keyboard handlers to all rail buttons", () => {
      assert.match(railSource, /itemRefs\.current\[index\] = element/);
      assert.match(railSource, /onKeyDown=\{\(e\) => handleItemKeyDown\(index, e\)\}/);
      assert.match(railSource, /onKeyDown=\{handleToggleKeyDown\}/);
    });

    it("LineWatchShell registers global Escape listener for desktop mode", () => {
      assert.match(shellSource, /handleDesktopKeyDown/);
      assert.match(shellSource, /if \(event\.key !== "Escape"\) return/);
      assert.match(shellSource, /window\.addEventListener\("keydown", handleDesktopKeyDown\)/);
    });

    it("Escape key dismisses search, closes selected station, clears selection, or navigates back from subpanels", () => {
      // Escape clears query or dismisses search
      assert.match(shellSource, /activeView === "search"[\s\S]*?handleCloseSearch\(\)/);
      // Escape closes station details
      assert.match(shellSource, /selectedStationId[\s\S]*?closeSelectedStation\(selectedStationId\)/);
      // Escape clears map selection
      assert.match(shellSource, /selection[\s\S]*?setSelection\(null\)/);
      // Escape navigates back from subpanel drilldowns
      assert.match(shellSource, /handleSubmenuBack\(\)/);
    });
  });

  describe("ARIA live region announcements", () => {
    it("LineWatchShell mounts a dedicated live region with role status and aria-live polite", () => {
      assert.match(shellSource, /className="desktop-live-region"/);
      assert.match(shellSource, /role="status"/);
      assert.match(shellSource, /aria-live="polite"/);
      assert.match(shellSource, /aria-atomic="true"/);
      assert.match(shellSource, /\{desktopLiveAnnouncement\}/);
    });

    it("announces sidebar expansion and collapse state changes", () => {
      assert.match(shellSource, /announceDesktop\(desktopSidebarCollapsed \? "Sidebar collapsed" : "Sidebar expanded"\)/);
    });

    it("announces rail destination navigation", () => {
      assert.match(shellSource, /announceDesktop\("System status overview"\)/);
      assert.match(shellSource, /announceDesktop\("Search stations, lines, and alerts"\)/);
      assert.match(shellSource, /announceDesktop\("My Stations"\)/);
      assert.match(shellSource, /announceDesktop\("My Commutes"\)/);
      assert.match(shellSource, /announceDesktop\("More options and settings"\)/);
    });

    it("announces network switches between TTC and GO/UP", () => {
      assert.match(shellSource, /Switched to GO Transit and UP Express network/);
      assert.match(shellSource, /Switched to TTC Subway and LRT network/);
    });

    it("announces station detail opening and closing", () => {
      assert.match(shellSource, /announceDesktop\("Station details opened"\)/);
      assert.match(shellSource, /announceDesktop\("Station details closed"\)/);
    });
  });

  describe("narrow desktop overlay transitions and layout budget", () => {
    it("computes docked mode when window width meets layout budget (940px)", () => {
      assert.equal(DESKTOP_DOCK_BUDGET, 940);
      const docked = computeDesktopLayoutMetrics({ windowWidth: 1024, isMobile: false });
      assert.equal(docked.mode, "docked");
      assert.equal(docked.railWidth, DESKTOP_RAIL_WIDTH);
      assert.equal(docked.sidebarWidth, DESKTOP_SIDEBAR_DEFAULT_WIDTH);

      const budgetExact = computeDesktopLayoutMetrics({ windowWidth: 940, isMobile: false });
      assert.equal(budgetExact.mode, "docked");
      assert.equal(budgetExact.sidebarWidth, DESKTOP_SIDEBAR_DEFAULT_WIDTH);
    });

    it("computes overlay mode on narrow desktop below dock budget", () => {
      const overlay = computeDesktopLayoutMetrics({ windowWidth: 820, isMobile: false });
      assert.equal(overlay.mode, "overlay");
      assert.equal(overlay.sidebarWidth, DESKTOP_SIDEBAR_DEFAULT_WIDTH);
      assert.equal(overlay.minMapWidth, DESKTOP_MAP_MIN_WIDTH);
    });

    it("falls back to mobile metrics when isMobile is true or width < 768", () => {
      const mobileWidth = computeDesktopLayoutMetrics({ windowWidth: 767, isMobile: false });
      assert.equal(mobileWidth.mode, "mobile");
      assert.equal(mobileWidth.sidebarWidth, 0);

      const mobileFlag = computeDesktopLayoutMetrics({ windowWidth: 1200, isMobile: true });
      assert.equal(mobileFlag.mode, "mobile");
    });

    it("applies shadow transitions without sliding width animation in stylesheet", () => {
      assert.match(globalCss, /\.desktop-sidebar-container\s*\{[^}]*transition:\s*box-shadow/);
      assert.match(globalCss, /\.desktop-sidebar-container--overlay\s*\{[^}]*box-shadow/);
      assert.match(globalCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.desktop-sidebar-container/);
    });
  });

  describe("visual polish: category cards, disruption pills, and layout hygiene", () => {
    it("groups category icons and labels inside desktop-status-cat-label-group", () => {
      assert.match(statusOverviewSource, /desktop-status-cat-label-group/);
      assert.match(globalCss, /\.desktop-status-cat-label-group/);
    });

    it("renders line disruption badges as structured colored pills with icons", () => {
      assert.match(statusOverviewSource, /desktop-status-line-disruptions/);
      assert.match(statusOverviewSource, /desktop-status-line-pill--alerts/);
      assert.match(statusOverviewSource, /desktop-status-line-pill--delays/);
      assert.match(statusOverviewSource, /desktop-status-line-pill--rsz/);
      assert.match(statusOverviewSource, /desktop-status-line-pill--closures/);
      assert.match(globalCss, /\.desktop-status-line-pill--alerts/);
      assert.match(globalCss, /\.desktop-status-line-pill--delays/);
      assert.match(globalCss, /\.desktop-status-line-pill--rsz/);
      assert.match(globalCss, /\.desktop-status-line-pill--closures/);
    });

    it("styles line trigger button to fill card with focus-visible and chevron hover", () => {
      assert.match(statusOverviewSource, /desktop-status-line-main/);
      assert.match(globalCss, /\.desktop-status-line-trigger/);
      assert.match(globalCss, /\.desktop-status-line-trigger:focus-visible/);
      assert.match(globalCss, /\.desktop-status-line-chevron/);
    });

    it("structures informational collection rows with desktop-status-info-main and count badges", () => {
      assert.match(statusOverviewSource, /desktop-status-info-main/);
      assert.match(globalCss, /\.desktop-status-info-main/);
      assert.match(globalCss, /\.desktop-status-info-badge/);
    });
  });
});
