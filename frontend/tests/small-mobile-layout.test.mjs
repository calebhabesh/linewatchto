import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("compact phone layout", () => {
  it("targets narrow phones and short mobile viewports without changing taller regular-width phones", () => {
    assert.match(
      globalCss,
      /@media \(max-width: 400px\), \(orientation: landscape\) and \(max-width: 740px\) and \(max-height: 430px\)/,
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
});
