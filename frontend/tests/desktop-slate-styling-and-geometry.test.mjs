import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

describe("desktop slate styling and card geometry cleanup (Step 2)", () => {
  describe("dark slate surface hierarchy and tone separation", () => {
    it("styles nav rail with deep slate background and seamless edge", () => {
      assert.match(globalCss, /\.desktop-nav-rail\s*\{[^}]*background:\s*#f8fafc/);
      assert.match(globalCss, /\.dark \.desktop-nav-rail\s*\{[^}]*background:\s*#06090e/);
      assert.match(globalCss, /\.dark \.desktop-nav-rail\s*\{[^}]*border-right:\s*none/);
      assert.match(globalCss, /\.dark \.desktop-nav-rail\s*\{[^}]*box-shadow:\s*1px 0 2px/);
      assert.match(globalCss, /\.high-contrast \.desktop-nav-rail\s*\{[^}]*border-right:\s*1px solid currentColor/);
    });

    it("styles sidebar container and header with dark slate palette without harsh borders and without search divider", () => {
      assert.match(globalCss, /\.dark \.desktop-sidebar-container\s*\{[^}]*background:\s*#0c1017/);
      assert.match(globalCss, /\.dark \.desktop-sidebar-container\s*\{[^}]*border-right:\s*none/);
      assert.match(globalCss, /\.desktop-sidebar-header\s*\{[^}]*border-bottom:\s*none/);
      assert.match(globalCss, /\.high-contrast \.desktop-sidebar-container\s*\{[^}]*border-right:\s*1px solid currentColor/);
    });

    it("styles collapsed nav rail and expanded sidebar with seamless sharp right edge and tight micro-shadow", () => {
      assert.match(globalCss, /\.desktop-nav-rail\[data-collapsed="true"\]\s*\{[^}]*border-right:\s*none/);
      assert.match(globalCss, /\.dark \.desktop-nav-rail\[data-collapsed="true"\]\s*\{[^}]*border-right:\s*none/);
      assert.match(globalCss, /\.desktop-sidebar-container\s*\{[^}]*border-right:\s*none/);
      assert.match(globalCss, /\.desktop-sidebar-container\s*\{[^}]*box-shadow:\s*1px 0 2px/);
      assert.match(globalCss, /\.dark \.desktop-sidebar-container\s*\{[^}]*box-shadow:\s*1px 0 2px/);
    });

    it("resets embedded panels and strips nested outlines and redundant close controls", () => {
      assert.match(globalCss, /\.desktop-sidebar-container \.panel[\s\S]*?background:\s*transparent/);
      assert.match(globalCss, /\.desktop-sidebar-container \.panel[\s\S]*?border:\s*none/);
      assert.match(globalCss, /\.desktop-sidebar-container \.panel[\s\S]*?box-shadow:\s*none/);
      assert.match(globalCss, /\.desktop-sidebar-container \.panel-header-close\s*\{[^}]*display:\s*none/);
    });
  });

  describe("card geometry: consistent radius and borderless surfaces", () => {
    it("sets clean geometry on category capsules, rail buttons, and cards", () => {
      // Rail toggle and item have border-radius: 8px
      assert.match(globalCss, /\.desktop-rail-toggle\s*\{[^}]*border-radius:\s*8px/);
      assert.match(globalCss, /\.desktop-rail-item\s*\{[^}]*border-radius:\s*8px/);

      // Category capsules have border-radius: 9999px
      assert.match(globalCss, /\.desktop-status-category-capsule\s*\{[^}]*border-radius:\s*9999px/);

      // Line badge buttons have border-radius: 4px
      assert.match(globalCss, /\.desktop-status-line-badge-btn\s*\{[^}]*border-radius:\s*4px/);

      // More panel account card and generic cards have border-radius: 8px
      assert.match(globalCss, /\.desktop-more-card\s*\{[^}]*border-radius:\s*8px/);
      assert.match(globalCss, /\.desktop-more-account-card\s*\{[^}]*border-radius:\s*8px/);
    });

    it("preserves high-contrast borders for accessibility across interactive surfaces", () => {
      assert.match(globalCss, /\.high-contrast \.desktop-status-category-capsule[\s\S]*?border:\s*1px solid currentColor/);
      assert.match(globalCss, /\.high-contrast \.desktop-status-line-badge-btn[\s\S]*?border:\s*1px solid currentColor/);
      assert.match(globalCss, /\.high-contrast \.desktop-more-card\s*\{[^}]*border:\s*1px solid currentColor/);
    });
  });

  describe("section headers with cyan accents and left alignment", () => {
    it("aligns section headers to start and styles cyan accent bar", () => {
      assert.match(globalCss, /\.desktop-status-section-header[\s\S]*?justify-content:\s*flex-start/);
      assert.match(globalCss, /\.desktop-status-section-bar\s*\{[^}]*background:\s*var\(--logo-blue/);
      assert.match(globalCss, /\.desktop-status-section-bar\s*\{[^}]*box-shadow:\s*0 0 6px/);
    });
  });

  describe("recessed live pill styling", () => {
    it("defines recessed live badge base class with jewel indicator", () => {
      assert.match(globalCss, /\.mobile-service-sheet-recessed-badge/);
      assert.match(globalCss, /\.mobile-service-sheet-led-jewel/);
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

  describe("global search bar visibility", () => {
    it("renders search row in expanded desktop sidebar header across all destinations", () => {
      assert.match(shellSource, /className="desktop-sidebar-search-row"/);
      assert.match(shellSource, /desktop-sidebar-search-input/);
    });
  });
});
