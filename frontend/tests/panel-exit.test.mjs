import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { panelExitMs, PHONE_PANEL_EXIT_MS, WIDE_PANEL_EXIT_MS } from "../src/hooks/panel-exit.ts";

const css = (path) => readFileSync(new URL(`../src/styles/${path}`, import.meta.url), "utf8");

describe("panel close wait", () => {
  it("is zero wherever no exit animation plays", () => {
    for (const phoneWidth of [true, false]) {
      assert.equal(panelExitMs({ reducedMotion: false, inDesktopSidebar: true, phoneWidth }), 0);
      assert.equal(panelExitMs({ reducedMotion: true, inDesktopSidebar: false, phoneWidth }), 0);
    }
  });

  it("lasts as long as the exit animation the stylesheet plays", () => {
    assert.equal(panelExitMs({ reducedMotion: false, inDesktopSidebar: false, phoneWidth: true }), PHONE_PANEL_EXIT_MS);
    assert.equal(panelExitMs({ reducedMotion: false, inDesktopSidebar: false, phoneWidth: false }), WIDE_PANEL_EXIT_MS);
    const station = css("station/station-detail.css");
    assert.match(station, new RegExp(`animation: station-detail-exit-mobile ${PHONE_PANEL_EXIT_MS}ms`));
    assert.match(station, new RegExp(`animation: station-detail-exit-desktop ${WIDE_PANEL_EXIT_MS}ms`));
    assert.match(css("utilities/motion.css"), new RegExp(`\\.mobile-impact-inspector-closing \\{\\s*animation: mobile-sheet-slide-down-exit ${PHONE_PANEL_EXIT_MS}ms`));
    // The sidebar plays no exit, which is why a panel there closes at once.
    assert.match(station, /\.linewatch-shell\.dark \.desktop-sidebar-container \.station-detail-panel \{\s*animation: none;/);
  });
});
