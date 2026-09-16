import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

describe("desktop slate styling and card geometry cleanup (Step 2)", () => {
  describe("dark slate surface hierarchy and tone separation", () => {
    it("styles nav rail with dark slate background and subtle tone border", () => {
      assert.match(globalCss, /\.desktop-nav-rail\s*\{[^}]*background:\s*#f8fafc/);
      assert.match(globalCss, /\.dark \.desktop-nav-rail\s*\{[^}]*background:\s*#090d14/);
      assert.match(globalCss, /\.dark \.desktop-nav-rail\s*\{[^}]*border-right-color:\s*rgba\(255,\s*255,\s*255,\s*0\.05\)/);
      assert.match(globalCss, /\.high-contrast \.desktop-nav-rail\s*\{[^}]*border-right:\s*1px solid currentColor/);
    });

    it("styles sidebar container and header with dark slate palette without harsh white borders", () => {
      assert.match(globalCss, /\.dark \.desktop-sidebar-container\s*\{[^}]*background:\s*#0c1017/);
      assert.match(globalCss, /\.dark \.desktop-sidebar-container\s*\{[^}]*border-right-color:\s*rgba\(255,\s*255,\s*255,\s*0\.05\)/);
      assert.match(globalCss, /\.dark \.desktop-sidebar-header\s*\{[^}]*border-bottom-color:\s*rgba\(255,\s*255,\s*255,\s*0\.05\)/);
      assert.match(globalCss, /\.high-contrast \.desktop-sidebar-container\s*\{[^}]*border-right:\s*1px solid currentColor/);
    });

    it("resets embedded panels and strips nested outlines and redundant close controls", () => {
      assert.match(globalCss, /\.desktop-sidebar-container \.panel[\s\S]*?background:\s*transparent/);
      assert.match(globalCss, /\.desktop-sidebar-container \.panel[\s\S]*?border:\s*none/);
      assert.match(globalCss, /\.desktop-sidebar-container \.panel[\s\S]*?box-shadow:\s*none/);
      assert.match(globalCss, /\.desktop-sidebar-container \.panel-header-close\s*\{[^}]*display:\s*none/);
    });
  });

  describe("card geometry: consistent <= 8px radius and borderless surfaces", () => {
    it("sets border-radius <= 8px on summary card, disruption items, categories, and lines", () => {
      // Summary card has border-radius: 8px and border: none
      assert.match(globalCss, /\.desktop-status-summary-card\s*\{[^}]*border-radius:\s*8px/);
      assert.match(globalCss, /\.desktop-status-summary-card\s*\{[^}]*border:\s*none/);

      // Disruption items have border-radius: 8px and border: none
      assert.match(globalCss, /\.desktop-status-disruption-item[\s\S]*?\{[^}]*border-radius:\s*8px/);
      assert.match(globalCss, /\.desktop-status-disruption-item[\s\S]*?\{[^}]*border:\s*none/);

      // Category buttons have border-radius: 8px and border: none
      assert.match(globalCss, /\.desktop-status-cat-btn[\s\S]*?\{[^}]*border-radius:\s*8px/);
      assert.match(globalCss, /\.desktop-status-cat-btn[\s\S]*?\{[^}]*border:\s*none/);

      // Line status cards have border-radius: 8px and border: none
      assert.match(globalCss, /\.desktop-status-line-card\s*\{[^}]*border-radius:\s*8px/);
      assert.match(globalCss, /\.desktop-status-line-card\s*\{[^}]*border:\s*none/);

      // Rail toggle and item have border-radius: 8px
      assert.match(globalCss, /\.desktop-rail-toggle\s*\{[^}]*border-radius:\s*8px/);
      assert.match(globalCss, /\.desktop-rail-item\s*\{[^}]*border-radius:\s*8px/);

      // More panel account card and generic cards have border-radius: 8px
      assert.match(globalCss, /\.desktop-more-card\s*\{[^}]*border-radius:\s*8px/);
      assert.match(globalCss, /\.desktop-more-account-card\s*\{[^}]*border-radius:\s*8px/);
    });

    it("preserves high-contrast borders for accessibility across all card surfaces", () => {
      assert.match(globalCss, /\.high-contrast \.desktop-status-summary-card\s*\{[^}]*border:\s*1px solid currentColor/);
      assert.match(globalCss, /\.high-contrast \.desktop-status-disruption-item[\s\S]*?border:\s*1px solid currentColor/);
      assert.match(globalCss, /\.high-contrast \.desktop-status-cat-btn[\s\S]*?border:\s*1px solid currentColor/);
      assert.match(globalCss, /\.high-contrast \.desktop-status-line-card\s*\{[^}]*border:\s*1px solid currentColor/);
      assert.match(globalCss, /\.high-contrast \.desktop-more-card\s*\{[^}]*border:\s*1px solid currentColor/);
    });
  });

  describe("section headers with cyan accents and left alignment", () => {
    it("aligns section headers to start and styles cyan accent bar", () => {
      assert.match(globalCss, /\.desktop-status-section-header[\s\S]*?justify-content:\s*flex-start/);
      assert.match(globalCss, /\.desktop-status-section-bar\s*\{[^}]*background:\s*var\(--logo-blue/);
      assert.match(globalCss, /\.desktop-status-section-bar\s*\{[^}]*box-shadow:\s*0 0 6px/);
      assert.match(globalCss, /\.desktop-status-see-all-btn\s*\{[^}]*margin-left:\s*auto/);
    });
  });

  describe("status state pill base and notice styling", () => {
    it("defines desktop-status-state-pill base class and notice modifier", () => {
      assert.match(globalCss, /\.desktop-status-state-pill[\s\S]*?border-radius:\s*9999px/);
      assert.match(globalCss, /\.desktop-status-state-pill--notice\s*\{[^}]*color:\s*#2563eb/);
      assert.match(globalCss, /\.dark \.desktop-status-state-pill--notice\s*\{[^}]*color:\s*#60a5fa/);
    });
  });

  describe("compact map button and embedded scrollbar adapters", () => {
    it("styles compact labeled View on map buttons inside desktop sidebar container", () => {
      assert.match(globalCss, /\.desktop-sidebar-container \.impact-card-map-btn\s*\{[^}]*height:\s*32px/);
      assert.match(globalCss, /\.desktop-sidebar-container \.impact-card-map-btn\s*\{[^}]*border-radius:\s*6px/);
      assert.match(globalCss, /\.desktop-sidebar-container \.impact-card-map-btn\s*\{[^}]*flex-direction:\s*row/);
      assert.match(globalCss, /\.desktop-sidebar-container \.impact-card-map-btn svg\s*\{[^}]*height:\s*16px/);
    });

    it("ensures a single scrollbar by hiding outer scroll on desktop-sidebar-content when hosting panels", () => {
      assert.match(globalCss, /\.desktop-sidebar-content:has\(\.panel\)/);
      assert.match(globalCss, /overflow-y:\s*hidden/);
    });
  });

  describe("top-level view search bar visibility", () => {
    it("conditionally renders search row on top-level desktop views and hides above subordinate headers", () => {
      assert.match(shellSource, /isTopLevelDesktopView/);
      assert.match(shellSource, /\{isTopLevelDesktopView && \(/);
      assert.match(shellSource, /className="desktop-sidebar-search-row"/);
    });
  });
});
