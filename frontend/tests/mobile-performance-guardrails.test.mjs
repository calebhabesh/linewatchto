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
    assert.match(backgroundSource, /if \(disabled\)/);
    assert.match(backgroundSource, /interactive=\{!reducedMotion\}/);
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

  it("disables continuous SVG map overlay animations in mobile performance mode", () => {
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path-glow,[\s\S]*?\.linewatch-shell\.mobile-performance-mode \.asset-alert-path\.map-selection-flash,[\s\S]*?\.linewatch-shell\.mobile-performance-mode \.station-selection-flash\s*\{[^}]*animation:\s*none\s*!important;[^}]*filter:\s*none\s*!important;[^}]*transition:\s*none\s*!important;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path-glow\s*\{[^}]*opacity:\s*0\.34;[^}]*stroke-width:\s*132;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path-glow\.selected\s*\{[^}]*opacity:\s*0\.54;[^}]*stroke-width:\s*162;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path\.map-selection-flash\s*\{[^}]*opacity:\s*0\.7;[^}]*stroke-width:\s*140;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-selection-flash\s*\{[^}]*opacity:\s*0\.7;[^}]*\}/s,
    );

    assert.doesNotMatch(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path-glow\s*\{[^}]*animation:\s*aura-pulse/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path\.planned-preview[\s\S]*?\{[^}]*animation:\s*none\s*!important;/s,
    );
  });

  it("keeps map and station focus indicators visible but static on mobile", () => {
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path\.map-selection-flash\s*\{[^}]*animation:\s*none\s*!important;[^}]*filter:\s*none\s*!important;[^}]*opacity:\s*0\.7;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-selection-flash\s*\{[^}]*animation:\s*none\s*!important;[^}]*filter:\s*none\s*!important;[^}]*opacity:\s*0\.7;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-selected-indicator\s*\{[^}]*animation:\s*none\s*!important;[^}]*filter:\s*none\s*!important;[^}]*opacity:\s*0\.85;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-selected-indicator\.multi-anchor\s*\{[^}]*opacity:\s*0;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-selected-indicator\.multi-anchor\.active\s*\{[^}]*opacity:\s*0\.85;[^}]*\}/s,
    );
  });

  it("disables continuous station and commute map animations on mobile", () => {
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-impact-ring,[\s\S]*?\.linewatch-shell\.mobile-performance-mode \.commute-path-preview-glow\s*\{[^}]*animation:\s*none\s*!important;[^}]*filter:\s*none\s*!important;[^}]*transition:\s*none\s*!important;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-impact-ring\s*\{[^}]*stroke-width:\s*5;[^}]*opacity:\s*0\.95;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.commute-path-preview-path\s*\{[^}]*animation:\s*none\s*!important;[^}]*stroke-width:\s*112;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-impact-dot-red-glow\s*\{[^}]*transform:\s*scale\(1\);[^}]*opacity:\s*0\.95;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-impact-dot-red-ping\s*\{[^}]*display:\s*none;[^}]*\}/s,
    );
  });

  it("uses static programmatic map transforms in mobile performance mode", () => {
    assert.match(
      panZoomSource,
      /disableProgrammaticMotion\?:\s*boolean/,
    );
    assert.match(
      panZoomSource,
      /disableProgrammaticMotion\s*=\s*false/,
    );
    assert.match(
      panZoomSource,
      /const shouldAnimateProgrammaticTransform = !reducedMotion && !disableProgrammaticMotion/,
    );
    assert.match(
      mapSource,
      /mobilePerformanceMode\?:\s*boolean/,
    );
    assert.match(
      mapSource,
      /usePanZoom\(\{\s*reducedMotion,\s*viewportOrientation,\s*disableProgrammaticMotion:\s*mobilePerformanceMode,\s*defaultFrame:\s*defaultMapFrame,\s*animateInitialEntrance,\s*\}\)/s,
    );
    assert.match(
      shellSource,
      /mobilePerformanceMode=\{mobileMapPerformanceMode\}/,
    );
    assert.match(shellSource, /mobileMapPerformanceMode = mobilePerformanceMode \|\| rotatedMapMode/);
  });

  it("does not animate search expansion with layout properties", () => {
    assert.doesNotMatch(globalCss, /width 300ms cubic-bezier/);
    assert.doesNotMatch(globalCss, /padding-left 300ms cubic-bezier/);
    assert.doesNotMatch(globalCss, /padding-right 300ms cubic-bezier/);
  });

  it("keeps mobile menu transitions compositor-friendly", () => {
    assert.match(
      globalCss,
      /\.mobile-bottom-nav::before\s*\{[^}]*transition:\s*transform 220ms[^}]*will-change:\s*transform;[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.mobile-bottom-nav-item\s*\{[^}]*transition:\s*color 170ms ease,\s*transform 120ms ease;[^}]*\}/s,
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

  it("keeps the fixed app viewport stable while a map camera gesture is active", () => {
    assert.match(shellSource, /const mapCameraInteractionActive = \(\) => Boolean\(document\.querySelector/);
    assert.match(shellSource, /\[data-map-gesture-active="true"\], \[data-map-zoom-active="true"\]/);
    assert.match(shellSource, /if \(!force && mapCameraInteractionActive\(\)\) \{[\s\S]*?viewportUpdatePending = true;[\s\S]*?return;/);
    assert.match(shellSource, /const pageZoomed = Math\.abs\(scale - 1\) > 0\.01/);
    assert.match(shellSource, /const layoutHeight = pageZoomed \? window\.innerHeight : height/);
    assert.match(shellSource, /window\.addEventListener\("pointerup", flushPendingViewportUpdate\)/);
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode :is\(\.ttc-map-stage, \.regional-map-stage\) \.raster-map-plane\s*\{[^}]*backface-visibility:\s*visible;[^}]*transform:\s*none;/s,
    );
  });

  it("does not end captured touch gestures on pointer leave", () => {
    assert.match(mapSource, /onPointerLeave=\{handlePointerLeave\}/);
    assert.match(panZoomSource, /const handlePointerLeave = useCallback/);
    assert.match(panZoomSource, /e\.pointerType !== "mouse"/);
  });

  it("pauses overlay pulses and removes expensive gesture-time paint", () => {
    const interactionSelector = /:is\(\.map-gesture-active, \[data-map-gesture-active="true"\], \[data-map-zoom-active="true"\]\)/;
    assert.match(globalCss, interactionSelector);
    assert.match(globalCss, /\) \.asset-alert-path-glow/);
    assert.match(globalCss, /\) \.interactive-glow/);
    assert.match(globalCss, /\) \.station-impact-ring/);
    assert.match(globalCss, /\) \.station-impact-dot-red-glow/);
    assert.match(globalCss, /\) \.station-impact-dot-red-ping/);
    assert.match(globalCss, /\) \.asset-alert-path\.planned-preview/);
    assert.match(globalCss, /animation-play-state:\s*paused\s*!important/);
    assert.match(globalCss, /transition:\s*none\s*!important/);
    assert.match(
      globalCss,
      /:is\(\[data-map-gesture-active="true"\], \[data-map-zoom-active="true"\]\) :is\([\s\S]*?filter:\s*none\s*!important;/s,
    );
    assert.match(globalCss, /\.asset-alert-path-glow:not\(\.map-selection-attention\),[\s\S]*?opacity:\s*0\s*!important;/s);
    assert.match(globalCss, /\.ttc-impact-hover-foreground,[\s\S]*?visibility:\s*hidden\s*!important;/s);
  });
});
