import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const panZoomSource = readFileSync(new URL("../src/hooks/usePanZoom.ts", import.meta.url), "utf8");
const backgroundSource = readFileSync(new URL("../src/components/DynamicBackground.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("mobile performance guardrails", () => {
  it("keeps the expensive SVG map behind a memoized boundary", () => {
    assert.match(mapSource, /import\s+\{[^}]*memo[^}]*\}\s+from "react"/);
    assert.match(mapSource, /function InteractiveTtcMapComponent\(/);
    assert.match(mapSource, /export const InteractiveTtcMap = memo\(InteractiveTtcMapComponent\)/);
    assert.match(mapSource, /InteractiveTtcMap\.displayName = "InteractiveTtcMap"/);
  });

  it("passes stable handlers into the memoized map", () => {
    assert.match(shellSource, /import\s+\{[^}]*useCallback[^}]*\}\s+from "react"/);
    assert.match(shellSource, /const handleMapSelectImpact = useCallback/);
    assert.match(shellSource, /const handleSelectStationId = useCallback/);
    assert.match(shellSource, /const handleClearCommutePathPreview = useCallback/);
    assert.match(shellSource, /const handleToggleTheme = useCallback/);
    assert.match(shellSource, /onToggleTheme=\{handleToggleTheme\}/);
    assert.match(shellSource, /onClearCommutePathPreview=\{handleClearCommutePathPreview\}/);
    assert.doesNotMatch(shellSource, /onToggleTheme=\{\(\) => setIsDark/);
    assert.doesNotMatch(shellSource, /onClearCommutePathPreview=\{\(\) => handleClearCommutePathPreview\(\)\}/);
  });

  it("renders only the active floating submenu panel", () => {
    assert.match(shellSource, /FloatingPanelShell/);
    assert.match(shellSource, /const activeFloatingPanel = /);
    assert.match(shellSource, /activeView === "alerts"/);
    assert.match(shellSource, /activeView === "delays"/);
    assert.match(shellSource, /activeView === "reduced-speed-zones"/);
    assert.match(shellSource, /activeView === "closures"/);
    assert.match(shellSource, /activeView === "commutes"/);
    assert.match(shellSource, /activeView === "analytics"/);
    assert.doesNotMatch(shellSource, /opacity-0 -translate-x-8 pointer-events-none/);
  });

  it("keeps the background enabled on mobile performance mode (due to lightweight canvas implementation)", () => {
    assert.match(shellSource, /useMobilePerformanceMode/);
    assert.match(shellSource, /mobilePerformanceMode/);
    assert.match(shellSource, /mobile-performance-mode/);
    assert.match(backgroundSource, /disabled/);
    assert.match(backgroundSource, /if \(reducedMotion \|\| disabled\)/);
    assert.doesNotMatch(shellSource, /<DynamicBackground[^>]*disabled=\{mobilePerformanceMode\}/s);
  });

  it("has mobile-only paint simplification rules for the SVG map", () => {
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path-glow/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.station-impact-ring/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.station-impact-dot-red-glow/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.station-impact-dot-red-ping/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.overlap-indicator/);
    assert.match(globalCss, /filter:\s*none\s*!important/);
  });

  it("keeps short map and station focus flashes enabled in mobile performance mode", () => {
    const disabledAnimationBlock =
      globalCss.match(
        /\.linewatch-shell\.mobile-performance-mode \.station-impact-ring,[\s\S]*?\.commute-path-preview-glow\s*\{[^}]*\}/,
      )?.[0] ?? "";

    assert.doesNotMatch(disabledAnimationBlock, /station-selection-flash/);
    assert.doesNotMatch(disabledAnimationBlock, /asset-alert-path\.map-selection-flash/);
    assert.doesNotMatch(disabledAnimationBlock, /station-selected-indicator/);

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path\.map-selection-flash\s*\{[^}]*filter:\s*none\s*!important;[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-selection-flash\s*\{[^}]*filter:\s*none\s*!important;[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-selected-indicator\s*\{[^}]*filter:\s*none\s*!important;[^}]*\}/s,
    );
  });

  it("restores lightweight mobile overlay emphasis while keeping heavy paint effects disabled", () => {
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path-glow\s*\{[^}]*filter:\s*none\s*!important;[^}]*opacity:\s*0\.28;[^}]*stroke-width:\s*132;[^}]*\}/s,
    );
    assert.doesNotMatch(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path-glow\s*\{[^}]*animation:\s*none\s*!important;/s,
    );
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.interactive-glow\s*\{[^}]*display:\s*block;[^}]*filter:\s*none\s*!important;[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.interactive-glow\.selected\s*\{[^}]*opacity:\s*0\.48;[^}]*stroke-width:\s*162;[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.rsz-chevron\s*\{[^}]*stroke-width:\s*7;[^}]*transform:\s*scale\(1\.0\);[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.delay-hourglass-mask-path,[\s\S]*?\.suspension-mask-path\s*\{[^}]*animation:\s*none\s*!important;[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-impact-dot-red-glow,[\s\S]*?\.station-impact-dot-red-ping[\s\S]*?\{[^}]*animation:\s*none\s*!important;[^}]*\}/s,
    );
  });

  it("does not animate search expansion with layout properties", () => {
    assert.doesNotMatch(globalCss, /width 300ms cubic-bezier/);
    assert.doesNotMatch(globalCss, /padding-left 300ms cubic-bezier/);
    assert.doesNotMatch(globalCss, /padding-right 300ms cubic-bezier/);
  });

  it("keeps mobile menu transitions compositor-friendly", () => {
    assert.match(
      globalCss,
      /\.mobile-bottom-nav-item\s*\{[^}]*transition:\s*background-color 150ms ease,\s*border-color 150ms ease,\s*color 150ms ease,\s*transform 120ms ease;[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.mobile-bottom-nav-item:active\s*\{[^}]*transform:\s*translateY\(1px\) scale\(0\.98\);[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.mobile-status-actions button\s*\{[^}]*transition:\s*background-color 150ms ease,\s*border-color 150ms ease,\s*color 150ms ease,\s*transform 120ms ease;[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.station-search-panel\s*\{[^}]*transition:\s*[\s\S]*opacity 220ms[\s\S]*transform 220ms[\s\S]*\}/s,
    );
    assert.doesNotMatch(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-search-panel,[\s\S]*?transition:\s*none\s*!important;/s,
    );
  });

  it("tracks two active pointers for custom pinch zoom", () => {
    assert.match(mapSource, /onPointerCancel=\{handlePointerCancel\}/);
    assert.match(mapSource, /touch-none/);
  });

  it("does not end captured touch gestures on pointer leave", () => {
    assert.match(mapSource, /onPointerLeave=\{handlePointerLeave\}/);
    assert.match(panZoomSource, /const handlePointerLeave = useCallback/);
    assert.match(panZoomSource, /e\.pointerType !== "mouse"/);
  });

  it("pauses expensive overlay paint effects only while map gestures are active", () => {
    assert.match(globalCss, /\.map-gesture-active \.asset-alert-path-glow/);
    assert.match(globalCss, /\.map-gesture-active \.interactive-glow/);
    assert.match(globalCss, /\.map-gesture-active \.station-impact-ring/);
    assert.match(globalCss, /\.map-gesture-active \.station-impact-dot-red-glow/);
    assert.match(globalCss, /\.map-gesture-active \.station-impact-dot-red-ping/);
    assert.match(globalCss, /animation:\s*none\s*!important/);
    assert.match(globalCss, /transition:\s*none\s*!important/);
    assert.match(globalCss, /filter:\s*none\s*!important/);
  });
});
