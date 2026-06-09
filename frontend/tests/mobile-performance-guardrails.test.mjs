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

  it("does not animate search expansion with layout properties", () => {
    assert.doesNotMatch(globalCss, /width 300ms cubic-bezier/);
    assert.doesNotMatch(globalCss, /padding-left 300ms cubic-bezier/);
    assert.doesNotMatch(globalCss, /padding-right 300ms cubic-bezier/);
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
});
