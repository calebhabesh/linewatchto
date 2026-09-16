import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const bottomNavSource = readFileSync(new URL("../src/components/MobileBottomNav.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const floatingPanelSource = readFileSync(new URL("../src/components/FloatingPanelShell.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

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
    assert.match(globalCss, /\.motion-paused \*,\s*\.motion-paused \*::before,\s*\.motion-paused \*::after\s*\{[^}]*animation:\s*none !important;[^}]*transition:\s*none !important;/s);
    assert.match(globalCss, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.linewatch-shell \*::after\s*\{[^}]*animation:\s*none !important;[^}]*transition:\s*none !important;/s);
    assert.match(shellSource, /reducedMotion \? 0 : isMobile \? 240 : 380/);
  });

  it("distinguishes root navigation, forward drill-ins, reverse Back, and Close", () => {
    assert.match(floatingPanelSource, /navDirection = "root"/);
    assert.match(floatingPanelSource, /"root" \| "forward" \| "back"/);
    assert.match(globalCss, /data-nav-direction="root"[\s\S]*panel-container-root/);
    assert.match(globalCss, /data-nav-direction="forward"[\s\S]*panel-container-forward/);
    assert.match(globalCss, /data-nav-direction="back"[\s\S]*panel-container-back/);
    assert.match(globalCss, /data-closing="true"[\s\S]*mobile-sheet-slide-down-exit/);
    assert.match(shellSource, /onMobileNavSelect[\s\S]*navigateRoot\("status"\)/);
    assert.match(shellSource, /handleSubmenuBack[\s\S]*setNavDirection\("back"\)/);
    assert.match(shellSource, /onOpenCategory=\{\(view\) => \{[\s\S]*navigateForward\(view\)/);
    assert.match(shellSource, /onOpenCommutes=\{\(\) => navigateForward\("commutes"\)\}/);
    assert.match(shellSource, /onOpenMyStations=\{\(\) => navigateForward\("my-stations"\)\}/);
    assert.match(shellSource, /popViewHistory\(viewHistoryRef\.current, fallback\)/);
    assert.match(shellSource, /reducedMotion \|\| !isMobile \|\| \(isMobile && targetView !== "map"\)/);
    assert.match(globalCss, /@media \(max-width:\s*767px\)\s*\{[\s\S]*?\.floating-panel-shell\[data-going-back="true"\],[\s\S]*?animation:\s*mobile-sheet-slide-down-exit 240ms/s);
    assert.doesNotMatch(globalCss, /\.mobile-view-content-wrapper\[data-closing="true"\][\s\S]*?animation:\s*mobile-sheet-slide-down-exit/);
    assert.match(shellSource, /<MobileStatusSheet[\s\S]*?onClose=\{handleClosePanel\}/);
    assert.doesNotMatch(shellSource, /handleMobileSheetClose/);
  });

  it("animates account container entry, exit, and keyed inner view changes", () => {
    assert.match(shellSource, /key=\{`\$\{accountDialogMode\}-\$\{accountEntryIntent\}`\}[\s\S]*data-account-dialog-view=\{accountDialogMode\}/);
    assert.match(shellSource, /account-dialog-backdrop--closing/);
    assert.match(shellSource, /account-dialog--closing/);
    assert.match(globalCss, /\.account-dialog-backdrop\s*\{[^}]*linewatch-backdrop-enter/s);
    assert.match(globalCss, /\.account-dialog\s*\{[^}]*linewatch-dialog-enter/s);
    assert.match(globalCss, /\.account-dialog-backdrop--closing\s*\{[^}]*linewatch-backdrop-exit/s);
    assert.match(globalCss, /\.account-dialog--closing\s*\{[^}]*linewatch-dialog-exit/s);
    assert.match(globalCss, /@keyframes linewatch-dialog-exit\s*\{/);
    assert.match(globalCss, /data-account-dialog-view[^}]*linewatch-dialog-content-enter/s);
  });

  it("does not route through Map when leaving Search from the bottom nav", () => {
    assert.match(
      shellSource,
      /if \(target instanceof Element && target\.closest\("\.mobile-bottom-nav, \.mobile-app-topbar"\)\) return;/,
    );
  });
});
