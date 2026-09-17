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

    it("keeps Status and More entries on the search field width guides", () => {
      assert.match(globalCss, /\.desktop-status-overview\s*\{[^}]*padding:\s*12px 16px 16px 16px/);
      assert.match(globalCss, /\.desktop-more-panel\s*\{[^}]*padding:\s*8px 16px 16px 16px/);
      assert.doesNotMatch(
        globalCss,
        /\.desktop-status-overview,\s*\.desktop-more-panel\s*\{[^}]*padding-right:/s,
      );
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

  describe("reconciled map button and embedded scrollbar adapters", () => {
    it("reconciles impact card map buttons inside desktop sidebar container", () => {
      assert.match(globalCss, /\.desktop-sidebar-container \.impact-card-map-btn\s*\{[^}]*align-self:\s*flex-start/);
      assert.match(globalCss, /\.impact-card-map-btn\s*\{[^}]*height:\s*44px/);
      assert.match(globalCss, /\.impact-card-map-btn\s*\{[^}]*min-width:\s*44px/);
    });

    it("ensures a single scrollbar by hiding outer scroll on desktop-sidebar-content when hosting panels", () => {
      assert.match(globalCss, /\.desktop-sidebar-content:has\(\.panel\)/);
      assert.match(globalCss, /overflow-y:\s*hidden/);
    });

    it("allows every desktop sidebar destination wrapper to scroll vertically", () => {
      assert.match(
        globalCss,
        /\.desktop-view-content-wrapper\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;/s,
      );
      assert.match(
        globalCss,
        /\.desktop-view-content-wrapper,[^}]*scrollbar-width:\s*thin;/s,
      );
      assert.match(
        globalCss,
        /\.desktop-view-content-wrapper::\-webkit-scrollbar\s*\{[^}]*width:\s*4px;/s,
      );
      assert.match(
        globalCss,
        /\.desktop-view-content-wrapper::\-webkit-scrollbar-thumb\s*\{[^}]*border:\s*0;/s,
      );
      assert.match(
        globalCss,
        /\.desktop-view-content-wrapper::\-webkit-scrollbar-button\s*\{[^}]*display:\s*none\s*!important;[^}]*height:\s*0;[^}]*width:\s*0;/s,
      );
      assert.match(
        globalCss,
        /\.desktop-sidebar-container \.line-impact-panel-stack::\-webkit-scrollbar,[^}]*width:\s*4px;/s,
      );
      assert.match(
        globalCss,
        /\.desktop-sidebar-container \.line-impact-panel-stack::\-webkit-scrollbar-button,[^}]*display:\s*none\s*!important;/s,
      );
      assert.match(
        globalCss,
        /\.desktop-sidebar-container \.station-detail-scroll,[^}]*padding-right:\s*6px;[^}]*scrollbar-gutter:\s*stable;/s,
      );
      assert.doesNotMatch(
        globalCss,
        /\.desktop-sidebar-container \.line-impact-panel-stack,[^}]*scrollbar-gutter:\s*auto;/s,
      );
      assert.doesNotMatch(
        globalCss,
        /\.desktop-sidebar-content[^\{]*\{[^}]*scrollbar-gutter:\s*stable;/s,
      );
      assert.match(
        globalCss,
        /\.desktop-sidebar-container \*::\-webkit-scrollbar-button,[^}]*appearance:\s*none\s*!important;[^}]*block-size:\s*0\s*!important;[^}]*display:\s*none\s*!important;/s,
      );
    });
  });

  describe("global search bar visibility", () => {
    it("renders search row in expanded desktop sidebar header across all destinations", () => {
      assert.match(shellSource, /className="desktop-sidebar-search-row"/);
      assert.match(shellSource, /desktop-sidebar-search-input/);
    });
  });
});
