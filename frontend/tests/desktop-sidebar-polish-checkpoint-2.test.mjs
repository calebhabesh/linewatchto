import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const shellSource = readFileSync(
  new URL("../src/components/LineWatchShell.tsx", import.meta.url),
  "utf8",
);
const moreSource = readFileSync(
  new URL("../src/components/DesktopMorePanel.tsx", import.meta.url),
  "utf8",
);
const overviewSource = readFileSync(
  new URL("../src/components/DesktopStatusOverview.tsx", import.meta.url),
  "utf8",
);
const navRailSource = readFileSync(
  new URL("../src/components/DesktopNavRail.tsx", import.meta.url),
  "utf8",
);
const lineLegendSource = readFileSync(
  new URL("../src/components/LineLegend.tsx", import.meta.url),
  "utf8",
);
const chooserKeepoutsSource = readFileSync(
  new URL("../src/components/map-chooser-keepouts.ts", import.meta.url),
  "utf8",
);
const globalCss = readAppStylesheet();

describe("Desktop Sidebar Polish — Checkpoint 2 (Steps 3, 4, 5)", () => {
  describe("Step 3: One desktop notice owner", () => {
    it("manages desktop notice priority: connection wins over operating notice", () => {
      // desktopNotice checks connection conditions before operating conditions
      const desktopNoticeStart = shellSource.indexOf("const desktopNotice: DesktopNotice | null = useMemo(");
      assert.notEqual(desktopNoticeStart, -1, "desktopNotice must be defined in LineWatchShell");

      const connectionCheckIdx = shellSource.indexOf("// Priority 1: Connection notice", desktopNoticeStart);
      const operatingCheckIdx = shellSource.indexOf("// Priority 2: Operating notice", desktopNoticeStart);

      assert.ok(connectionCheckIdx > -1, "desktopNotice must check connection priority");
      assert.ok(operatingCheckIdx > -1, "desktopNotice must check operating priority");
      assert.ok(connectionCheckIdx < operatingCheckIdx, "Connection notice must precede operating notice");
    });

    it("suppresses compact desktop notice when full takeover closed screen is active", () => {
      assert.match(
        shellSource,
        /if\s*\(\s*showClosedScreen\s*\)\s*\{\s*return null;\s*\}/,
        "desktopNotice must return null when showClosedScreen is active",
      );
    });

    it("renders desktop notice in expanded sidebar below search row and on collapsed map", () => {
      // Expanded sidebar notice
      assert.match(
        shellSource,
        /!desktopSidebarCollapsed && desktopNotice \?\s*\(\s*<div className="desktop-sidebar-notice-wrapper">/,
        "Expanded sidebar header must render desktop notice in desktop-sidebar-notice-wrapper",
      );

      // Collapsed map notice
      assert.match(
        shellSource,
        /!isMobile && desktopSidebarCollapsed && desktopNotice \?\s*\(\s*<div className="desktop-collapsed-map-notice-anchor">/,
        "Collapsed map must render desktop notice in desktop-collapsed-map-notice-anchor",
      );
    });

    it("guards root dashboardAvailabilityNotice so it never renders on desktop", () => {
      assert.match(
        shellSource,
        /\{isMobile && \(!showClosedScreen \|\| displayData\.snapshot\) && dashboardAvailabilityNotice \?/,
        "Root dashboardAvailabilityNotice must be guarded with isMobile",
      );
    });

    it("retires obsolete individual desktop closing/closed chips and purple status banner", () => {
      // Old chip components not imported or rendered in LineWatchShell
      assert.doesNotMatch(shellSource, /<SubwayClosingSoonChip/);
      assert.doesNotMatch(shellSource, /<GoUpClosingSoonChip/);
      assert.doesNotMatch(shellSource, /className="[^"]*subway-closed-peek-chip/);
      assert.doesNotMatch(shellSource, /className="[^"]*desktop-map-conditional-pill/);

      // Redundant banner removed from DesktopStatusOverview
      assert.doesNotMatch(overviewSource, /desktop-status-operating-banner/);
    });
  });

  describe("Step 4: Source status destination and flat option rows", () => {
    it("provides standalone rail entry for source status below network switcher", () => {
      assert.match(navRailSource, /data-dest="source-status"/);
      assert.match(navRailSource, /className="desktop-rail-item desktop-rail-source-item"/);
      assert.match(navRailSource, /onClick=\{\(\) => onSelectDestination\("source-status"\)\}/);
      assert.match(navRailSource, /sourceStatusLabel/);
    });

    it("renders source diagnostics as a first-class desktop sidebar panel", () => {
      assert.match(shellSource, /case "source-status":/);
      assert.match(shellSource, /activeView === "source-status"/);
      assert.match(shellSource, /className="panel desktop-source-status-panel"/);
      assert.match(shellSource, /<SourceDiagnosticsBody network=\{selectedNetwork\} \/>/);
    });

    it("removes source diagnostics from DesktopMorePanel", () => {
      assert.doesNotMatch(moreSource, /SourceDiagnosticsBody/);
      assert.doesNotMatch(moreSource, /desktop-more-diagnostics-card/);
    });

    it("flattens desktop More cards and status informational buttons", () => {
      // More cards are borderless with transparent background
      assert.match(globalCss, /\.desktop-more-card\s*\{[^}]*background:\s*transparent;[^}]*border:\s*none;/s);
      assert.match(globalCss, /\.dark \.desktop-more-card\s*\{[^}]*background:\s*transparent;/s);
      assert.match(globalCss, /\.high-contrast \.desktop-more-card\s*\{[^}]*border:\s*1px solid currentColor;/s);

      // Status informational buttons are flat
      assert.match(globalCss, /\.desktop-status-info-btn\s*\{[^}]*background:\s*transparent;[^}]*border:\s*none;/s);
      assert.match(globalCss, /\.dark \.desktop-status-info-btn\s*\{[^}]*background:\s*transparent;[^}]*border:\s*none;/s);
    });
  });

  describe("Step 5: Polish desktop map legends", () => {
    it("enlarges desktop TTC route badge and number font", () => {
      assert.match(globalCss, /\.desktop-legend-route-badge--ttc\s*\{[^}]*height:\s*40px;[^}]*width:\s*40px;/s);
      assert.match(globalCss, /\.desktop-legend-route-badge--ttc \.desktop-legend-route-number\s*\{[^}]*font-size:\s*22px;/s);
    });

    it("reduces TTC alert count bubbles and scales vector label", () => {
      // Single digit bubble is 21px
      assert.match(globalCss, /\.legend-impact-count\s*\{[^}]*width:\s*21px;[^}]*height:\s*21px;/s);
      // Multiple digit bubble is 26px
      assert.match(globalCss, /\.legend-impact-count\[data-digit-count="multiple"\]\s*\{[^}]*width:\s*26px;/s);
      // Vector label targetHeight is scaled to 15 for TTC
      assert.match(lineLegendSource, /targetHeight=\{isRegional \? 17\.5 : 15\}/);
    });

    it("enlarges regional route badge and repositions regional legend for tight attribution gap", () => {
      // Regional badge is 38px
      assert.match(globalCss, /\.desktop-legend-route-badge--regional\s*\{[^}]*height:\s*38px;[^}]*width:\s*38px;/s);

      // Regional legend positioning (inset right: 14px, bottom: 28px)
      assert.match(globalCss, /\.desktop-map-legend--regional\s*\{[^}]*right:\s*14px;[^}]*bottom:\s*28px;/s);

      // Line name text size increased to 20px
      assert.match(lineLegendSource, /isRegional \? "text-\[20px\]" : "text-\[20px\]"/);

      // Chooser keepouts protects desktop map legend
      assert.match(chooserKeepoutsSource, /"\.desktop-map-legend"/);
    });
  });
});
