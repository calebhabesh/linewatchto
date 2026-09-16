import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const statusOverviewSource = readFileSync(new URL("../src/components/DesktopStatusOverview.tsx", import.meta.url), "utf8");
const morePanelSource = readFileSync(new URL("../src/components/DesktopMorePanel.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

describe("desktop content and navigation migration (Session 2)", () => {
  describe("desktop status overview", () => {
    it("renders network service summary with header and live pill", () => {
      assert.match(statusOverviewSource, /desktop-status-header-row/);
      assert.match(statusOverviewSource, /mobile-service-sheet-recessed-badge/);
    });

    it("presents imminent rail disruptions within 24h before surface preview", () => {
      assert.match(statusOverviewSource, /desktop-status-rail-section/);
      assert.match(statusOverviewSource, /currentServiceSummary/);
      assert.match(statusOverviewSource, /desktop-status-incident-row/);
    });

    it("provides impact category navigation for alerts, delays, RSZ, and closures", () => {
      assert.match(statusOverviewSource, /desktop-status-categories-grid/);
      assert.match(statusOverviewSource, /desktop-status-category-capsule/);
      assert.match(statusOverviewSource, /onOpenCategory\("alerts"\)/);
      assert.match(statusOverviewSource, /onOpenCategory\("delays"\)/);
      assert.match(statusOverviewSource, /onOpenCategory\("reduced-speed-zones"\)/);
      assert.match(statusOverviewSource, /onOpenCategory\("closures"\)/);
    });

    it("provides informational collections for accessibility, surface notices, and announcements", () => {
      assert.match(statusOverviewSource, /desktop-status-info-row/);
      assert.match(statusOverviewSource, /onOpenCategory\("accessibility-outages"\)/);
      assert.match(statusOverviewSource, /onOpenCategory\("surface-notices"\)/);
    });

    it("renders clickable line badges and status rows for remaining lines", () => {
      assert.match(statusOverviewSource, /desktop-status-remaining-list/);
      assert.match(statusOverviewSource, /TransitLineBadge/);
      assert.match(statusOverviewSource, /desktop-status-remaining-row/);
    });
  });

  describe("desktop more panel", () => {
    it("renders account card with sign-in, create account, and demo actions", () => {
      assert.match(morePanelSource, /desktop-more-account-card/);
      assert.match(morePanelSource, /onRequestSignIn/);
      assert.match(morePanelSource, /onRequestCreateAccount/);
      assert.match(morePanelSource, /onDemoAccount/);
      assert.match(morePanelSource, /onSignOut/);
    });

    it("exposes appearance and performance toggles", () => {
      assert.match(morePanelSource, /onToggleTheme/);
      assert.match(morePanelSource, /onToggleHighContrast/);
      assert.match(morePanelSource, /onToggleReducedMotion/);
      assert.match(morePanelSource, /onToggleDotBackground/);
      assert.match(morePanelSource, /onDefaultNetworkChange/);
    });

    it("exposes secondary tools including analytics, alert history, and transit guide", () => {
      assert.match(morePanelSource, /onOpenAnalytics/);
      assert.match(morePanelSource, /onOpenAlertHistory/);
      assert.match(morePanelSource, /onOpenFeedback/);
      assert.match(morePanelSource, /onOpenPrivacyAcknowledgements/);
      assert.match(morePanelSource, /onOpenReleaseNotes/);
      assert.match(morePanelSource, /onOpenGuide/);
    });
  });

  describe("shell desktop sidebar navigation integration", () => {
    it("renders DesktopStatusOverview and DesktopMorePanel inside renderDesktopSidebarContent", () => {
      assert.match(shellSource, /<DesktopStatusOverview/);
      assert.match(shellSource, /<DesktopMorePanel/);
    });

    it("renders station detail panels directly inside sidebar when a station is selected", () => {
      assert.match(shellSource, /if \(selectedStationId\) \{[\s\S]*?<StationDetailPanel[\s\S]*?<RegionalStationDetailPanel/);
    });

    it("renders My Stations and My Commutes as independent full-width sidebar destinations", () => {
      assert.match(shellSource, /case "my-stations":/);
      assert.match(shellSource, /<MyStationsPanel/);
      assert.match(shellSource, /case "commutes":/);
      assert.match(shellSource, /<SavedCommutesPanel/);
    });

    it("includes persistent search field in sidebar header with clear affordance", () => {
      assert.match(shellSource, /desktop-sidebar-header/);
      assert.match(shellSource, /desktop-sidebar-search-field/);
      assert.match(shellSource, /desktop-sidebar-search-clear/);
      assert.match(shellSource, /desktopSearchInputRef/);
    });

    it("preserves search origin across activation and dismissal", () => {
      assert.match(shellSource, /searchOriginRef\.current/);
    });

    it("preserves top-level rail destination on network switch", () => {
      assert.match(shellSource, /if \(!isMobile\) \{[\s\S]*?activeView === "search" \|\|[\s\S]*?activeView === "my-stations" \|\|[\s\S]*?activeView === "commutes" \|\|[\s\S]*?activeView === "more"[\s\S]*?setActiveView\("status"\)/);
    });
  });

  describe("stylesheet retirement of legacy desktop floating chrome", () => {
    it("hides legacy top chrome buttons and bottom sheet chips on desktop screens", () => {
      assert.match(
        globalCss,
        /@media\s*\(min-width:\s*768px\)\s*\{[^}]*\.linewatch-shell\s+\.menu-toggle-btn/s,
      );
      assert.match(
        globalCss,
        /@media\s*\(min-width:\s*768px\)\s*\{[^}]*\.linewatch-shell\s+\.desktop-quick-shortcuts/s,
      );
      assert.match(
        globalCss,
        /@media\s*\(min-width:\s*768px\)\s*\{[^}]*\.linewatch-shell\s+\.header-search-bar/s,
      );
      assert.match(
        globalCss,
        /@media\s*\(min-width:\s*768px\)\s*\{[^}]*\.linewatch-shell\s+#linewatch-main-menu/s,
      );
      assert.match(
        globalCss,
        /@media\s*\(min-width:\s*768px\)\s*\{[^}]*\.linewatch-shell\s+\.desktop-status-chip-row-container/s,
      );
    });

    it("contains dedicated desktop sidebar, saved navigation, and overview styles", () => {
      assert.match(globalCss, /\.desktop-sidebar-search-clear/);
      assert.match(globalCss, /\.desktop-saved-container/);
      assert.match(globalCss, /\.desktop-saved-nav/);
      assert.match(globalCss, /\.desktop-saved-tab/);
      assert.match(globalCss, /\.desktop-status-overview/);
      assert.match(globalCss, /\.desktop-status-header-row/);
      assert.match(globalCss, /\.desktop-more-panel/);
      assert.match(globalCss, /\.desktop-more-account-card/);
    });
  });
});
