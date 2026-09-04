import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const globalCss = readAppStylesheet();

describe("compact phone layout", () => {
  it("targets narrow phones and short mobile viewports without changing taller regular-width phones", () => {
    assert.match(
      globalCss,
      /@media \(max-width: 400px\), \(orientation: landscape\) and \(max-height: 520px\)/,
    );
    assert.match(globalCss, /--mobile-bottom-nav-height:\s*64px/);
  });

  it("compacts first-run and closed-hours cards while keeping them scroll-safe", () => {
    assert.match(
      globalCss,
      /\.subway-closed-content\s*\{[^}]*max-height:\s*calc\(100dvh - 16px\);[^}]*overflow-y:\s*auto/s,
    );
  });

  it("reduces sheet and card density but preserves practical primary touch targets", () => {
    assert.match(
      globalCss,
      /\.floating-panel-shell\s*\{[^}]*max-height:\s*min\(82dvh,/s,
    );
    assert.match(
      globalCss,
      /\.mobile-status-actions button\s*\{[^}]*min-height:\s*44px/s,
    );
    assert.match(
      globalCss,
      /\.mobile-bottom-nav-item\s*\{[^}]*min-height:\s*46px/s,
    );
  });

  it("centers the nav bar selection highlight over entries on narrow phones", () => {
    assert.match(
      globalCss,
      /\.mobile-bottom-nav::before\s*\{[^}]*width:\s*calc\(\(100% - 14px\) \/ 5\);/s,
    );
  });
});
