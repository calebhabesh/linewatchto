import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

describe("desktop quick shortcuts under hamburger icon", () => {
  it("renders vertically stacked quick-action buttons for My Commutes and My Stations under menu button", () => {
    assert.match(shellSource, /desktop-quick-shortcuts/);
    assert.match(shellSource, /desktop-quick-action-btn/);
    assert.match(shellSource, /desktop-quick-action-btn--commutes/);
    assert.match(shellSource, /desktop-quick-action-btn--stations/);
    assert.match(shellSource, /onClick=\{openMyCommutes\}/);
    assert.match(shellSource, /onClick=\{openMyStations\}/);
    assert.match(shellSource, /title="My Commutes"/);
    assert.match(shellSource, /title="My Stations"/);
  });

  it("places quick shortcuts in a vertical column with the menu button before the search bar", () => {
    const menuIdx = shellSource.indexOf("menu-toggle-btn");
    const shortcutsIdx = shellSource.indexOf("desktop-quick-shortcuts");
    const searchIdx = shellSource.indexOf("header-search-bar");

    assert.ok(menuIdx !== -1, "menu-toggle-btn exists");
    assert.ok(shortcutsIdx !== -1, "desktop-quick-shortcuts exists");
    assert.ok(searchIdx !== -1, "header-search-bar exists");
    assert.ok(menuIdx < shortcutsIdx, "menu button precedes quick shortcuts in column");
    assert.ok(shortcutsIdx < searchIdx, "quick shortcuts column precedes search bar in top chrome row");
  });

  it("badges affected commutes and stations with sleek micro-badges when disruptions exist", () => {
    assert.match(shellSource, /commuteAffectedCount > 0 && \([\s\S]*?desktop-quick-action-badge--alert/);
    assert.match(shellSource, /savedStationsAffectedCount > 0/);
    assert.match(shellSource, /desktop-quick-action-badge/);
  });

  it("includes hover tooltips for clear desktop affordance", () => {
    assert.match(shellSource, /desktop-quick-action-tooltip[\s\S]*?My Commutes/);
    assert.match(shellSource, /desktop-quick-action-tooltip[\s\S]*?My Stations/);
  });

  it("fades out when menu, desktop panel, or closed screen is active", () => {
    assert.match(
      shellSource,
      /menuVisible \|\| isDesktopPanel \|\| showClosedScreen \? "opacity-0 pointer-events-none -translate-y-2" : "opacity-100 translate-y-0"/
    );
  });

  it("styles circular buttons with emerald and sky color accents and micro-badges", () => {
    assert.match(globalCss, /\.desktop-quick-action-btn/);
    assert.match(globalCss, /\.desktop-quick-action-btn--commutes/);
    assert.match(globalCss, /\.desktop-quick-action-btn--stations/);
    assert.match(globalCss, /\.desktop-quick-action-badge/);
    assert.match(globalCss, /\.desktop-quick-action-tooltip/);
  });
});
