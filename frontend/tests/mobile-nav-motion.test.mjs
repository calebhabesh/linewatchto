import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const bottomNavSource = readFileSync(new URL("../src/components/MobileBottomNav.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("mobile navigation motion", () => {
  it("moves one shared selection pill between mobile destinations", () => {
    assert.match(bottomNavSource, /data-active-key=\{activeKey\}/);
    assert.match(globalCss, /\.mobile-bottom-nav::before\s*\{[^}]*transition:\s*transform 220ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/s);
    assert.match(globalCss, /\.mobile-bottom-nav\[data-active-key="more"\]::before/);
    assert.match(globalCss, /\.mobile-bottom-nav-item\[data-active="true"\]\s*\{[^}]*background:\s*transparent/s);
  });

  it("brings non-map mobile panels up with short transform-only motion", () => {
    assert.match(globalCss, /\.floating-panel-shell\s*\{[^}]*animation:\s*floating-mobile-sheet-enter 240ms/s);
    assert.match(globalCss, /@keyframes floating-mobile-sheet-enter\s*\{[\s\S]*translate3d\(0, 28px, 0\) scale\(0\.985\)/);
    assert.match(globalCss, /\.mobile-view-content-wrapper\s*\{[^}]*animation:\s*mobile-content-fade-in 190ms/s);
    assert.match(globalCss, /\.station-search-panel\.open\s*\{[^}]*translate3d\(0, 0, 0\) scale\(1\)/s);
  });

  it("removes the new motion when reduced motion is active", () => {
    assert.match(globalCss, /\.motion-paused \.mobile-bottom-nav::before/);
    assert.match(globalCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.mobile-bottom-nav::before/);
  });

  it("does not route through Map when leaving Search from the bottom nav", () => {
    assert.match(
      shellSource,
      /if \(target instanceof Element && target\.closest\("\.mobile-bottom-nav"\)\) return;/,
    );
  });
});
