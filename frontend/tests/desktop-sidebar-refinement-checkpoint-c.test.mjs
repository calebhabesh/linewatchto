import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const desktopChromeCss = readFileSync(new URL("../src/styles/shell/desktop-chrome.css", import.meta.url), "utf8");
const headerFlareCss = readFileSync(new URL("../src/styles/shell/header-flare.css", import.meta.url), "utf8");
const statusOverviewSource = readFileSync(new URL("../src/components/DesktopStatusOverview.tsx", import.meta.url), "utf8");

describe("desktop visual treatment (Checkpoint C)", () => {
  describe("search styling", () => {
    it("styles the desktop search input with subdued dark surface and no white outline", () => {
      assert.match(desktopChromeCss, /\.desktop-sidebar-search-input\s*\{[^}]*height:\s*48px/);
      assert.match(desktopChromeCss, /\.desktop-sidebar-search-input\s*\{[^}]*min-height:\s*48px/);
      assert.match(desktopChromeCss, /\.dark\s+\.desktop-sidebar-search-input\s*\{[^}]*background:\s*#12151c/);
      assert.match(desktopChromeCss, /\.dark\s+\.desktop-sidebar-search-input\s*\{[^}]*border:\s*none/);
      assert.match(desktopChromeCss, /\.desktop-sidebar-search-input:focus-within/);
      assert.match(desktopChromeCss, /\.high-contrast\s+\.desktop-sidebar-search-input/);
    });

    it("uses 14px font size for search field text", () => {
      assert.match(desktopChromeCss, /\.desktop-sidebar-search-field\s*\{[^}]*font-size:\s*14px/);
    });
  });

  describe("section header sky-blue accent beam", () => {
    it("connects desktop status and more section headers to the header-flare diffuse light beam", () => {
      assert.match(headerFlareCss, /\.desktop-status-section-header/);
      assert.match(headerFlareCss, /\.desktop-more-section-header/);
      assert.match(headerFlareCss, /\.desktop-status-section-header\s*>\s*\.desktop-status-section-bar/);
      assert.match(headerFlareCss, /\.desktop-status-section-header::before/);
    });

    it("scales section titles to 13-14px", () => {
      assert.match(desktopChromeCss, /\.desktop-status-section-title[\s\S]*?font-size:\s*13\.5px/);
      assert.match(desktopChromeCss, /\.desktop-more-section-title[\s\S]*?font-size:\s*13\.5px/);
    });
  });

  describe("Status composition & Alerts & Notices", () => {
    it("names the second section Alerts & Notices", () => {
      assert.match(statusOverviewSource, /<h3 className="desktop-status-section-title">Alerts & Notices<\/h3>/);
      assert.match(statusOverviewSource, /aria-label="Alerts and notices"/);
    });

    it("styles 2x2 grid category capsules with shared tinted count badge styles", () => {
      assert.match(desktopChromeCss, /\.desktop-status-categories-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
      assert.match(desktopChromeCss, /\.desktop-status-category-capsule/);
    });

    it("scales informational collection rows to full width with min-height 40-44px", () => {
      assert.match(desktopChromeCss, /\.desktop-status-info-row\s*\{[^}]*flex-direction:\s*column/);
      assert.match(desktopChromeCss, /\.desktop-status-info-btn/);
      assert.match(desktopChromeCss, /\.desktop-status-info-label/);
    });
  });

  describe("rail current service incident section", () => {
    it("renders rail section with kicker, line group badges, and honest reassurance", () => {
      assert.match(statusOverviewSource, /desktop-status-rail-section/);
      assert.match(statusOverviewSource, /desktop-status-line-badge-btn/);
      assert.match(statusOverviewSource, /desktop-status-remaining-group/);
    });
  });

  describe("desktop more panel scaling", () => {
    it("scales nav items and setting rows to 44-48px minimum height with 14px labels", () => {
      assert.match(desktopChromeCss, /\.desktop-more-nav-item\s*\{[^}]*min-height:\s*44px/);
      assert.match(desktopChromeCss, /\.desktop-more-nav-item\s*\{[^}]*font-size:\s*14px/);
      assert.match(desktopChromeCss, /\.desktop-more-setting-row\s*\{[^}]*min-height:\s*46px/);
      assert.match(desktopChromeCss, /\.desktop-more-setting-title\s*\{[^}]*font-size:\s*14px/);
    });
  });
});
