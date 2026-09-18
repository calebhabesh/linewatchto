import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  clearStylesheetCache,
  countClassSubstringSelectors,
  countImportantDeclarations,
  getAppStylesheetGraphFiles,
  getImportDirectives,
  readAppStylesheet,
  readAppStylesheetGraph,
  readStylesheet,
  stripCssComments,
} from "./helpers/stylesheet-graph.mjs";

describe("stylesheet-graph helper", () => {
  it("reads the default application stylesheet graph", () => {
    clearStylesheetCache();
    const css = readAppStylesheet();
    assert.ok(typeof css === "string");
    assert.ok(css.length > 500000, "default app stylesheet content should be loaded");
    assert.match(css, /@import "tailwindcss" source\("\.\.\/"\);/);
    assert.match(css, /--light-container/);
    assert.match(css, /\.linewatch-shell/);
  });

  it("returns graph files list containing the entrypoint", () => {
    const files = getAppStylesheetGraphFiles();
    assert.ok(Array.isArray(files));
    assert.ok(files.length >= 1);
    assert.ok(files[0].endsWith(".css") && files[0].includes("globals"));
  });

  it("inlines relative imports in declared cascade order", () => {
    const tempDir = join(tmpdir(), `linewatch-css-test-${Date.now()}`);
    mkdirSync(join(tempDir, "foundation"), { recursive: true });

    try {
      writeFileSync(join(tempDir, "foundation", "fonts.css"), "/* fonts */\n.font-loaded { font-family: sans-serif; }\n");
      writeFileSync(join(tempDir, "foundation", "tokens.css"), "/* tokens */\n:root { --accent: #fed105; }\n");
      writeFileSync(
        join(tempDir, "entry.css"),
        '@import "tailwindcss" source("../");\n@import "./foundation/fonts.css";\n@import "./foundation/tokens.css";\n\n.app { display: flex; }\n',
      );

      const graph = readAppStylesheetGraph(join(tempDir, "entry.css"), { forceRefresh: true });
      assert.match(graph, /@import "tailwindcss" source\("\.\.\/"\);/);

      const fontIdx = graph.indexOf(".font-loaded");
      const tokenIdx = graph.indexOf("--accent: #fed105");
      const appIdx = graph.indexOf(".app { display: flex; }");

      assert.ok(fontIdx > -1, "fonts rule included");
      assert.ok(tokenIdx > -1, "tokens rule included");
      assert.ok(appIdx > -1, "app rule included");
      assert.ok(fontIdx < tokenIdx, "fonts precede tokens in manifest order");
      assert.ok(tokenIdx < appIdx, "tokens precede app rules in cascade order");

      const files = getAppStylesheetGraphFiles(join(tempDir, "entry.css"));
      assert.equal(files.length, 3);
      assert.ok(files[0].endsWith("entry.css"));
      assert.ok(files[1].endsWith("fonts.css"));
      assert.ok(files[2].endsWith("tokens.css"));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("ignores commented-out @import statements", () => {
    const tempDir = join(tmpdir(), `linewatch-css-comment-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    try {
      writeFileSync(join(tempDir, "active.css"), ".active { color: green; }\n");
      writeFileSync(
        join(tempDir, "manifest.css"),
        '/* @import "./non-existent-commented.css"; */\n@import "./active.css";\n',
      );

      const graph = readAppStylesheetGraph(join(tempDir, "manifest.css"), { forceRefresh: true });
      assert.match(graph, /\/\* @import "\.\/non-existent-commented\.css"; \*\//);
      assert.match(graph, /\.active \{ color: green; \}/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("throws error for missing relative stylesheet imports", () => {
    const tempDir = join(tmpdir(), `linewatch-css-missing-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    try {
      writeFileSync(
        join(tempDir, "broken.css"),
        '@import "./does-not-exist.css";\n',
      );

      assert.throws(
        () => readAppStylesheetGraph(join(tempDir, "broken.css"), { forceRefresh: true }),
        /Stylesheet import not found: "\.\/does-not-exist\.css"/,
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("detects and rejects circular @import chains", () => {
    const tempDir = join(tmpdir(), `linewatch-css-cycle-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    try {
      writeFileSync(join(tempDir, "a.css"), '@import "./b.css";\n');
      writeFileSync(join(tempDir, "b.css"), '@import "./a.css";\n');

      assert.throws(
        () => readAppStylesheetGraph(join(tempDir, "a.css"), { forceRefresh: true }),
        /Circular stylesheet import detected/,
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reads an individual stylesheet directly via readStylesheet()", () => {
    const tempDir = join(tmpdir(), `linewatch-css-single-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    try {
      writeFileSync(join(tempDir, "leaf.css"), '@import "./ignored.css";\n.leaf { color: blue; }');
      const content = readStylesheet(join(tempDir, "leaf.css"));
      assert.match(content, /@import "\.\/ignored\.css";/);
      assert.match(content, /\.leaf \{ color: blue; \}/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("resolves the extracted foundation/fonts.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("fonts.css")), "fonts.css must be in graph files");
    const fontContent = readStylesheet(new URL("../src/styles/foundation/fonts.css", import.meta.url));
    assert.match(fontContent, /@font-face\s*{[^}]*font-family:\s*"TeX Gyre Heros"/);
    assert.match(fontContent, /@font-face\s*{[^}]*font-family:\s*"Switzer"/);
  });

  it("resolves the extracted foundation/tokens.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("tokens.css")), "tokens.css must be in graph files");
    const tokenContent = readStylesheet(new URL("../src/styles/foundation/tokens.css", import.meta.url));
    assert.match(tokenContent, /@theme\s*\{[^}]*--font-sans:/);
    assert.match(tokenContent, /:root\s*\{[^}]*--map-pulse-offset:/);
    assert.match(tokenContent, /--line-up:\s*#4084cd;/);
    assert.match(tokenContent, /html\[data-safe-area-debug="iphone-dynamic-island"\]/);
  });

  it("resolves the extracted foundation/reset.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("reset.css")), "reset.css must be in graph files");
    const resetContent = readStylesheet(new URL("../src/styles/foundation/reset.css", import.meta.url));
    assert.match(resetContent, /html\s*\{[^}]*font-size:\s*106\.25%;/);
    assert.match(resetContent, /\*\s*\{[^}]*box-sizing:\s*border-box;/);
    assert.match(resetContent, /scrollbar-color:\s*var\(--mobile-scroll-indicator-thumb\)/);
    assert.match(resetContent, /button,\s*input,\s*select,\s*textarea\s*\{[^}]*font:\s*inherit;/);
    assert.match(resetContent, /input\[type="search"\]::-webkit-search-cancel-button/);
  });

  it("resolves the extracted foundation/themes.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("themes.css")), "themes.css must be in graph files");
    const themeContent = readStylesheet(new URL("../src/styles/foundation/themes.css", import.meta.url));
    assert.match(themeContent, /\.linewatch-shell\s*\{[^}]*color-scheme:\s*light;/);
    assert.match(themeContent, /\.linewatch-shell\.dark\s*\{[^}]*color-scheme:\s*dark;/);
    assert.match(themeContent, /\.linewatch-backdrop\s*\{[^}]*background-color:\s*#f8fafc;/);
    assert.match(themeContent, /\.linewatch-shell\.high-contrast\s*\{[^}]*--bg:\s*#000000;/);
    assert.match(themeContent, /--badge-pill-bg-alerts/);
    assert.match(themeContent, /--dialog-modal-bg/);
  });

  it("resolves the extracted foundation/accessibility.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("accessibility.css")), "accessibility.css must be in graph files");
    const a11yContent = readStylesheet(new URL("../src/styles/foundation/accessibility.css", import.meta.url));
    assert.match(a11yContent, /button,\s*a\s*\{[^}]*-webkit-tap-highlight-color:\s*transparent;/);
    assert.match(a11yContent, /touch-action:\s*manipulation;/);
    assert.match(a11yContent, /\.motion-paused,\s*\.motion-paused \*/);
    assert.match(a11yContent, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/);
  });

  it("resolves the extracted map/base-map.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("base-map.css")), "base-map.css must be in graph files");
    const baseMapContent = readStylesheet(new URL("../src/styles/map/base-map.css", import.meta.url));
    assert.match(baseMapContent, /\.regional-map,\s*\.regional-map-viewport/);
    assert.match(baseMapContent, /\.raster-map-plane\s*\{[^}]*transform:\s*translateZ\(0\);/);
    assert.match(baseMapContent, /\.ttc-map-entrance-reveal/);
    assert.match(baseMapContent, /\.map-center-feedback/);
    assert.match(baseMapContent, /\.ttc-map-stage\[data-raster-map-ready="true"\]\s*\.ttc-authored-svg-source/);
    assert.match(baseMapContent, /\.linewatch-shell\.mobile-performance-mode\s*:is\(\.ttc-map-stage,\s*\.regional-map-stage\)/);
    assert.match(baseMapContent, /\.map-layer-entering,\s*\.map-layer-current/);
    assert.match(baseMapContent, /\.map-attribution-notice/);
    assert.match(baseMapContent, /:is\(\.map-gesture-active,\s*\[data-map-gesture-active="true"\],\s*\[data-map-zoom-active="true"\]\)/);
    assert.match(baseMapContent, /\[data-map-camera-moving="true"\]/);
  });

  it("resolves the extracted map/station-markers.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("station-markers.css")), "station-markers.css must be in graph files");
    const stationMarkersContent = readStylesheet(new URL("../src/styles/map/station-markers.css", import.meta.url));
    assert.match(stationMarkersContent, /\.station-hit-target/);
    assert.match(stationMarkersContent, /\.station-label-hit-target/);
    assert.match(stationMarkersContent, /\.station-label-hover-effect/);
    assert.match(stationMarkersContent, /\.station-hover-indicator/);
    assert.match(stationMarkersContent, /\.station-selected-indicator/);
    assert.match(stationMarkersContent, /\.station-impact-ring/);
    assert.match(stationMarkersContent, /\.station-impact-hover-priority/);
    assert.match(stationMarkersContent, /\.station-impact-dot-red-glow/);
    assert.match(stationMarkersContent, /\.station-impact-dot-red-ping/);
    assert.match(stationMarkersContent, /\.station-impact-direction-glyph/);
    assert.match(stationMarkersContent, /@keyframes station-selected-pulse/);
    assert.match(stationMarkersContent, /@keyframes gold-ring-pulse/);
    assert.match(stationMarkersContent, /@keyframes station-radar-core/);
    assert.match(stationMarkersContent, /@keyframes station-radar-ping/);
  });

  it("resolves the extracted map/impact-overlays.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("impact-overlays.css")), "impact-overlays.css must be in graph files");
    const overlaysContent = readStylesheet(new URL("../src/styles/map/impact-overlays.css", import.meta.url));
    assert.match(overlaysContent, /\.asset-svg-frame,\s*\.asset-label-frame/);
    assert.match(overlaysContent, /\.asset-alert-path-glow/);
    assert.match(overlaysContent, /\.asset-alert-path\.suspension-candy/);
    assert.match(overlaysContent, /\.asset-alert-path\.delay-candy/);
    assert.match(overlaysContent, /\.asset-alert-path\.planned-preview/);
    assert.match(overlaysContent, /\.rsz-chevron/);
  });

  it("resolves the extracted map/regional-map.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("regional-map.css")), "regional-map.css must be in graph files");
    const regionalMapContent = readStylesheet(new URL("../src/styles/map/regional-map.css", import.meta.url));
    assert.match(regionalMapContent, /\.regional-station-hit-target/);
    assert.match(regionalMapContent, /\.regional-overlay-segment-group/);
    assert.match(regionalMapContent, /\.regional-impact-path/);
    assert.match(regionalMapContent, /\.regional-impact-glow/);
    assert.match(regionalMapContent, /\.regional-delay-glyph/);
    assert.match(regionalMapContent, /\.regional-station-impact-ring/);
  });

  it("resolves the extracted map/map-selection.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("map-selection.css")), "map-selection.css must be in graph files");
    const mapSelectionContent = readStylesheet(new URL("../src/styles/map/map-selection.css", import.meta.url));
    assert.match(mapSelectionContent, /\.ttc-impact-hover-foreground/);
    assert.match(mapSelectionContent, /\.ttc-impact-hover-outline/);
    assert.match(mapSelectionContent, /\.map-selection-attention/);
    assert.match(mapSelectionContent, /@keyframes map-selection-path-intro/);
    assert.match(mapSelectionContent, /@keyframes map-selection-station-intro/);
    assert.match(mapSelectionContent, /\.asset-alert-path\.map-selection-flash/);
    assert.match(mapSelectionContent, /\.station-selection-flash/);
    assert.match(mapSelectionContent, /\.station-selected-indicator\.foreground-flash-active/);
  });

  it("resolves the extracted map/overlap-chooser.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("overlap-chooser.css")), "overlap-chooser.css must be in graph files");
    const overlapChooserContent = readStylesheet(new URL("../src/styles/map/overlap-chooser.css", import.meta.url));
    assert.match(overlapChooserContent, /\.overlap-indicator/);
    assert.match(overlapChooserContent, /\.overlap-chooser-surface/);
    assert.match(overlapChooserContent, /@keyframes overlap-chooser-enter/);
    assert.match(overlapChooserContent, /\.overlap-chooser-choice/);
    assert.match(overlapChooserContent, /\.overlap-indicator-pill/);
    assert.match(overlapChooserContent, /\.overlap-indicator-badge/);
    assert.match(overlapChooserContent, /\.delay-badge-exclamation/);
    assert.match(overlapChooserContent, /\.overlap-impact-ref/);
  });

  it("resolves the extracted map/commute-preview.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("commute-preview.css")), "commute-preview.css must be in graph files");
    const commutePreviewContent = readStylesheet(new URL("../src/styles/map/commute-preview.css", import.meta.url));
    assert.match(commutePreviewContent, /\.commute-path-preview-layer/);
    assert.match(commutePreviewContent, /\.commute-path-preview-glow/);
    assert.match(commutePreviewContent, /\.commute-path-preview-path/);
    assert.match(commutePreviewContent, /\.commute-path-preview-endpoint/);
    assert.match(commutePreviewContent, /@keyframes regional-commute-path-pulse/);
    assert.match(commutePreviewContent, /@keyframes commute-preview-chip-enter/);
    assert.match(commutePreviewContent, /\.commute-path-preview-chip/);
    assert.match(commutePreviewContent, /\.commute-path-preview-chip\.commute-path-preview-embedded/);
  });

  it("resolves the extracted map/train-markers.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("train-markers.css")), "train-markers.css must be in graph files");
    const trainMarkersContent = readStylesheet(new URL("../src/styles/map/train-markers.css", import.meta.url));
    assert.match(trainMarkersContent, /\.estimated-train-marker-layer/);
    assert.match(trainMarkersContent, /\.estimated-train-marker-layer\[data-muted="true"\]/);
    assert.match(trainMarkersContent, /\.estimated-train-marker/);
    assert.match(trainMarkersContent, /\.estimated-train-marker-outline/);
    assert.match(trainMarkersContent, /\.estimated-train-marker-core/);
    assert.match(trainMarkersContent, /\.estimated-train-marker-arrow/);
    assert.match(trainMarkersContent, /\.estimated-train-marker-window/);
    assert.match(trainMarkersContent, /\.estimated-train-marker-line-1/);
    assert.match(trainMarkersContent, /\.estimated-train-marker-regional-br/);
    assert.match(trainMarkersContent, /\.high-contrast \.estimated-train-marker-core/);
    assert.match(trainMarkersContent, /\.linewatch-shell\.mobile-performance-mode \.estimated-train-marker-outline/);
    assert.match(trainMarkersContent, /\.train-layer-toggle/);
    assert.match(trainMarkersContent, /\.mobile-train-toggle/);
    assert.match(trainMarkersContent, /\.mobile-train-pending-spinner/);
  });


  it("resolves the extracted shell/dashboard-shell.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("dashboard-shell.css")), "dashboard-shell.css must be in graph files");
    const dashboardShellContent = readStylesheet(new URL("../src/styles/shell/dashboard-shell.css", import.meta.url));
    assert.match(dashboardShellContent, /\.linewatch-wordmark/);
    assert.match(dashboardShellContent, /\.linewatch-shell/);
    assert.match(dashboardShellContent, /--desktop-global-search-width/);
    assert.match(dashboardShellContent, /\.panel-title-row/);
    assert.match(dashboardShellContent, /\.panel-heading/);
    assert.match(dashboardShellContent, /\.map-panel/);
    assert.match(dashboardShellContent, /\.network-map/);
    assert.match(dashboardShellContent, /\.asset-map-stage/);
    assert.match(dashboardShellContent, /@keyframes map-center-fade-in/);
    assert.match(dashboardShellContent, /\.animate-map-center-fade/);
    assert.match(dashboardShellContent, /\.alert-card/);
    assert.match(dashboardShellContent, /\.closure-card/);
    assert.match(dashboardShellContent, /\.commute-card/);
    assert.match(dashboardShellContent, /\.line-list/);
    assert.match(dashboardShellContent, /\.line-row/);
    assert.match(dashboardShellContent, /\.commute-panel/);
    assert.match(dashboardShellContent, /@keyframes drift-network/);
    assert.match(dashboardShellContent, /@media \(max-width: 1180px\)/);
    assert.match(dashboardShellContent, /@media \(max-width: 900px\)/);
    assert.match(dashboardShellContent, /@media \(max-width: 520px\)/);
    assert.match(dashboardShellContent, /@keyframes highlight-glow/);
    assert.match(dashboardShellContent, /\.highlight-active-card/);
  });

  it("verifies that entry stylesheet manifest is an import-only manifest", () => {
    const files = getAppStylesheetGraphFiles();
    const rawEntry = readStylesheet(files[0]);
    const lines = rawEntry.split("\n").map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      assert.ok(
        line.startsWith("@import ") || line.startsWith("/*") || line.startsWith("*") || line.endsWith("*/"),
        `entry stylesheet line must be an @import or comment, got: ${line}`
      );
    }
  });

  it("resolves the extracted shell/desktop-chrome.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("desktop-chrome.css")), "desktop-chrome.css must be in graph files");
    const desktopChromeContent = readStylesheet(new URL("../src/styles/shell/desktop-chrome.css", import.meta.url));
    assert.match(desktopChromeContent, /\.network-selector/);
    assert.match(desktopChromeContent, /\.network-selector-glider/);
    assert.match(desktopChromeContent, /\.desktop-top-chrome/);
    assert.match(desktopChromeContent, /\.desktop-status-capsule-anchor/);
    assert.match(desktopChromeContent, /\.desktop-status-capsule/);
    assert.match(desktopChromeContent, /\.desktop-status-train-switch/);
    assert.match(desktopChromeContent, /\.desktop-header-impact-chips/);
    assert.match(desktopChromeContent, /\.desktop-status-chip--alerts/);
    assert.match(desktopChromeContent, /\.desktop-status-chip--delays/);
    assert.match(desktopChromeContent, /\.main-menu-pin/);
    assert.match(desktopChromeContent, /\.menu-action-row/);
  });


  it("resolves the extracted shell/floating-panels.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("floating-panels.css")), "floating-panels.css must be in graph files");
    const floatingPanelsContent = readStylesheet(new URL("../src/styles/shell/floating-panels.css", import.meta.url));
    assert.match(floatingPanelsContent, /\.map-panel/);
    assert.match(floatingPanelsContent, /\.panel/);
    assert.match(floatingPanelsContent, /\.floating-panel-shell/);
    assert.match(floatingPanelsContent, /\.floating-panel-scroll/);
    assert.match(floatingPanelsContent, /\.panel-heading/);
    assert.match(floatingPanelsContent, /\.line-impact-panel-stack/);
    assert.match(floatingPanelsContent, /@keyframes floating-panel-enter/);
    assert.match(floatingPanelsContent, /\.panel-strong/);
    assert.match(floatingPanelsContent, /\[data-menu-pinned="true"\]/);
  });

  it("resolves the extracted shell/map-controls.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("map-controls.css")), "map-controls.css must be in graph files");
    const mapControlsContent = readStylesheet(new URL("../src/styles/shell/map-controls.css", import.meta.url));
    assert.match(mapControlsContent, /\.regional-map-controls/);
    assert.match(mapControlsContent, /\.desktop-map-control-rail/);
    assert.match(mapControlsContent, /\.map-control-rail/);
    assert.match(mapControlsContent, /\.map-control-button/);
    assert.match(mapControlsContent, /\.map-control-slider/);
    assert.match(mapControlsContent, /\.regional-map-control-rail/);
    assert.match(mapControlsContent, /\.map-control-zoom-group/);
    assert.match(mapControlsContent, /\.map-control-recenter-container/);
    assert.match(mapControlsContent, /\.map-control-recenter-mobile-label/);
  });

  it("resolves the extracted shell/mobile-chrome.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("mobile-chrome.css")), "mobile-chrome.css must be in graph files");
    const mobileChromeContent = readStylesheet(new URL("../src/styles/shell/mobile-chrome.css", import.meta.url));
    assert.match(mobileChromeContent, /--mobile-bottom-nav-height/);
    assert.match(mobileChromeContent, /--mobile-safe-top/);
    assert.match(mobileChromeContent, /\.mobile-bottom-nav/);
    assert.match(mobileChromeContent, /\.mobile-bottom-nav-item/);
    assert.match(mobileChromeContent, /\.pwa-install-nudge/);
    assert.match(mobileChromeContent, /\.mobile-status-peek/);
    assert.match(mobileChromeContent, /\.mobile-status-peek-info-btn/);
    assert.match(mobileChromeContent, /\.mobile-map-controls-group/);
    assert.match(mobileChromeContent, /\.mobile-map-recenter-btn/);
    assert.match(mobileChromeContent, /\.network-selector--compact-vertical/);
    assert.match(mobileChromeContent, /\.rotate-map-btn/);
    assert.match(mobileChromeContent, /\.mobile-alert-history-shortcut/);
    assert.match(mobileChromeContent, /\.mobile-my-stations-shortcut/);
  });

  it("resolves the extracted shell/mobile-sheets.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("mobile-sheets.css")), "mobile-sheets.css must be in graph files");
    const mobileSheetsContent = readStylesheet(new URL("../src/styles/shell/mobile-sheets.css", import.meta.url));
    assert.match(mobileSheetsContent, /\.mobile-status-sheet/);
    assert.match(mobileSheetsContent, /\.mobile-sheet-heading/);
    assert.match(mobileSheetsContent, /\.mobile-status-actions/);
    assert.match(mobileSheetsContent, /\.mobile-line-status-row/);
    assert.match(mobileSheetsContent, /\.mobile-more-sheet/);
    assert.match(mobileSheetsContent, /\.mobile-more-row/);
    assert.match(mobileSheetsContent, /\.floating-panel-shell/);
    assert.match(mobileSheetsContent, /@keyframes floating-mobile-sheet-enter/);
    assert.match(mobileSheetsContent, /\.floating-panel-scroll/);
    assert.match(mobileSheetsContent, /\.mobile-impact-inspector/);
    assert.match(mobileSheetsContent, /@keyframes mobile-impact-inspector-enter/);
  });

  it("resolves the extracted shell/mobile-landscape.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("mobile-landscape.css")), "mobile-landscape.css must be in graph files");
    const mobileLandscapeContent = readStylesheet(new URL("../src/styles/shell/mobile-landscape.css", import.meta.url));
    assert.match(mobileLandscapeContent, /\.mobile-map-controls/);
    assert.match(mobileLandscapeContent, /\.mobile-map-controls\[data-mode="rotated-landscape"\]/);
    assert.match(mobileLandscapeContent, /\.linewatch-shell\.mobile-map-rotated/);
    assert.match(mobileLandscapeContent, /\.rotated-map-ui-surface/);
    assert.match(mobileLandscapeContent, /\.rotated-map-hud/);
    assert.match(mobileLandscapeContent, /\.rotated-map-selection-hud/);
    assert.match(mobileLandscapeContent, /\.rotated-map-selection-card/);
    assert.match(mobileLandscapeContent, /\.rotated-map-selection-action-column/);
    assert.match(mobileLandscapeContent, /\.rotated-map-selection-details-action/);
    assert.match(mobileLandscapeContent, /\.rotated-map-selection-portrait-cue/);
    assert.match(mobileLandscapeContent, /\.rotated-map-selection-card-critical/);
  });

  it("resolves the extracted shell/responsive-density.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("responsive-density.css")), "responsive-density.css must be in graph files");
    const responsiveDensityContent = readStylesheet(new URL("../src/styles/shell/responsive-density.css", import.meta.url));
    assert.match(responsiveDensityContent, /@media \(max-width: 480px\)/);
    assert.match(responsiveDensityContent, /\.rotate-map-btn/);
    assert.match(responsiveDensityContent, /\.mobile-legend-pill--expanded/);
    assert.match(responsiveDensityContent, /@media \(max-width: 400px\), \(orientation: landscape\) and \(max-height: 520px\)/);
    assert.match(responsiveDensityContent, /--mobile-edge-inset/);
    assert.match(responsiveDensityContent, /\.opening-disclaimer-backdrop/);
    assert.match(responsiveDensityContent, /\.subway-closed-screen/);
    assert.match(responsiveDensityContent, /\.station-search-panel/);
    assert.match(responsiveDensityContent, /@media \(orientation: landscape\)/);
    assert.match(responsiveDensityContent, /@media \(min-width: 768px\) and \(max-width: 1099px\)/);
    assert.match(responsiveDensityContent, /\.desktop-status-capsule-anchor/);
    assert.match(responsiveDensityContent, /@media \(min-width: 768px\) and \(max-width: 899px\)/);
    assert.match(responsiveDensityContent, /\.header-search-bar/);
  });

  it("resolves the extracted station/station-search.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("station-search.css")), "station-search.css must be in graph files");
    const stationSearchContent = readStylesheet(new URL("../src/styles/station/station-search.css", import.meta.url));
    assert.match(stationSearchContent, /\.station-search-panel/);
    assert.match(stationSearchContent, /\.station-search-input-row/);
    assert.match(stationSearchContent, /\.station-search-amenity-toolbar/);
    assert.match(stationSearchContent, /\.station-search-amenity-chip/);
    assert.match(stationSearchContent, /\.global-search-impact-result/);
    assert.match(stationSearchContent, /\.global-search-resource-result/);
    assert.match(stationSearchContent, /\.global-search-browse-alerts/);
    assert.match(stationSearchContent, /\.station-search-browse-container/);
    assert.match(stationSearchContent, /\.station-search-lines-column/);
    assert.match(stationSearchContent, /\.station-search-stations-column/);
    assert.match(stationSearchContent, /@keyframes station-search-list-slide-in/);
    assert.match(stationSearchContent, /\.station-search-line-trigger/);
    assert.match(stationSearchContent, /\.station-search-station/);
    assert.match(stationSearchContent, /\.station-search-bookmark/);
    assert.match(stationSearchContent, /\.station-search-mobile-back/);
    assert.match(stationSearchContent, /@keyframes mobile-station-search-slide-in/);
    assert.match(stationSearchContent, /\.station-search-panel\[data-expanded="true"\]/);
  });

  it("resolves the extracted station/station-detail.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("station-detail.css")), "station-detail.css must be in graph files");
    const stationDetailContent = readStylesheet(new URL("../src/styles/station/station-detail.css", import.meta.url));
    assert.match(stationDetailContent, /\.station-detail-panel/);
    assert.match(stationDetailContent, /@keyframes station-detail-enter-mobile/);
    assert.match(stationDetailContent, /@keyframes station-detail-enter-desktop/);
    assert.match(stationDetailContent, /\.station-detail-sheet-dragging/);
    assert.match(stationDetailContent, /\.station-sheet-drag-handle-container/);
    assert.match(stationDetailContent, /\.station-sheet-drag-pill/);
    assert.match(stationDetailContent, /\.station-sheet-drag-ridges/);
    assert.match(stationDetailContent, /\.station-detail-header-actions/);
    assert.match(stationDetailContent, /\.station-detail-save-control/);
    assert.match(stationDetailContent, /\.station-detail-close-button/);
    assert.match(stationDetailContent, /@keyframes saved-station-spin/);
    assert.match(stationDetailContent, /\.station-detail-updating/);
    assert.match(stationDetailContent, /\.station-detail-scroll/);
    assert.match(stationDetailContent, /\.station-detail-body-wrapper/);
    assert.match(stationDetailContent, /\.station-detail-content-swap/);
    assert.match(stationDetailContent, /@keyframes station-detail-content-in-mobile/);
    assert.match(stationDetailContent, /@keyframes station-detail-content-in-desktop/);
    assert.match(stationDetailContent, /\.station-detail-map-button/);
    assert.match(stationDetailContent, /\.station-header-line-row/);
    assert.match(stationDetailContent, /\.station-header-line-badge/);
    assert.match(stationDetailContent, /\.station-line-directions/);
    assert.match(stationDetailContent, /\.station-submenu-nav-btn/);
    assert.match(stationDetailContent, /\.station-detail-closing/);
    assert.match(stationDetailContent, /@keyframes station-detail-exit-mobile/);
    assert.match(stationDetailContent, /@keyframes station-detail-exit-desktop/);
  });

  it("resolves the extracted station/station-arrivals.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("station-arrivals.css")), "station-arrivals.css must be in graph files");
    const stationArrivalsContent = readStylesheet(new URL("../src/styles/station/station-arrivals.css", import.meta.url));
    assert.match(stationArrivalsContent, /\.station-arrival-line-divider/);
    assert.match(stationArrivalsContent, /\[data-arrival-group\]/);
    assert.match(stationArrivalsContent, /\.station-arrival-track-spine/);
    assert.match(stationArrivalsContent, /\.station-arrival-track-node/);
    assert.match(stationArrivalsContent, /\[data-regional-arrival-direction\]/);
    assert.match(stationArrivalsContent, /\.station-arrival-tile/);
  });

  it("resolves the extracted station/station-accessibility.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("station-accessibility.css")), "station-accessibility.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/station/station-accessibility.css", import.meta.url));
    assert.match(content, /\.station-accessibility-details/);
    assert.match(content, /\.station-accessibility-chevron/);
    assert.match(content, /\.station-notices-details/);
    assert.match(content, /\.station-notices-chevron/);
    assert.match(content, /\.station-access-outage-badge/);
    assert.match(content, /\.station-access-outage-count/);
    assert.match(content, /\[data-station-access-outage-summary\]/);
    assert.match(content, /\.station-notice-card/);
    assert.match(content, /\.station-accessibility-card/);
  });

  it("resolves the extracted station/surface-connections.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("surface-connections.css")), "surface-connections.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/station/surface-connections.css", import.meta.url));
    assert.match(content, /\.surface-connections-details/);
    assert.match(content, /\.surface-connections-chevron/);
    assert.match(content, /\.station-connections-card/);
    assert.match(content, /\.station-connections-title/);
    assert.match(content, /\.station-connection-row/);
    assert.match(content, /\[data-surface-route\]/);
    assert.match(content, /\.surface-departure-tile/);
  });

  it("resolves the extracted account/account-dialogs.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("account-dialogs.css")), "account-dialogs.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/account/account-dialogs.css", import.meta.url));
    assert.match(content, /\.account-dialog/);
    assert.match(content, /\.account-dialog-backdrop/);
    assert.match(content, /\.account-dialog-header/);
    assert.match(content, /\.account-dialog-close/);
    assert.match(content, /\.account-choice-primary/);
    assert.match(content, /\.account-choice-google-custom/);
    assert.match(content, /\.account-field/);
    assert.match(content, /\.account-primary-button/);
    assert.match(content, /\.account-link-button/);
    assert.match(content, /\.account-linked-status/);
    assert.match(content, /\.account-reset-status/);
    assert.match(content, /\.account-feature-preview/);
    assert.match(content, /linewatch-dialog-enter/);
  });

  it("resolves the extracted account/my-stations.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("my-stations.css")), "my-stations.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/account/my-stations.css", import.meta.url));
    assert.match(content, /\.my-stations-panel/);
    assert.match(content, /\.my-stations-count/);
    assert.match(content, /\.my-stations-body/);
    assert.match(content, /\.my-stations-controls/);
    assert.match(content, /\.my-stations-search/);
    assert.match(content, /\.my-stations-add/);
    assert.match(content, /\.my-stations-done/);
    assert.match(content, /\.my-stations-list/);
    assert.match(content, /\.my-stations-picker-list/);
    assert.match(content, /\.my-stations-picker-section/);
    assert.match(content, /\.my-stations-row/);
    assert.match(content, /\.my-stations-row-main/);
    assert.match(content, /\.my-stations-bookmark/);
    assert.match(content, /\.saved-station-rich-row/);
    assert.match(content, /\.saved-station-rich-content/);
    assert.match(content, /\.saved-station-disruption-disclosure/);
    assert.match(content, /\.saved-station-disruption-summary/);
    assert.match(content, /\.saved-station-arrivals/);
    assert.match(content, /\.saved-station-arrival-group/);
    assert.match(content, /\.saved-station-arrival-direction/);
    assert.match(content, /\.saved-station-arrival-times/);
    assert.match(content, /\.saved-station-inline-undo/);
    assert.match(content, /\.my-stations-empty/);
    assert.match(content, /\.my-stations-undo/);
    assert.match(content, /\.saved-station-global-notice/);
    assert.match(content, /\.account-network-filter/);
    assert.match(content, /\.account-network-glider/);
    assert.match(content, /\.account-network-badge/);
    assert.match(content, /my-stations-mode-swap/);
    assert.match(content, /my-stations-search-nudge/);
  });

  it("resolves the extracted account/saved-commutes.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("saved-commutes.css")), "saved-commutes.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/account/saved-commutes.css", import.meta.url));
    assert.match(content, /\.commute-card/);
    assert.match(content, /\.commute-grid/);
    assert.match(content, /\.saved-commute-card-header/);
    assert.match(content, /\.saved-commute-card-identity/);
    assert.match(content, /\.saved-commute-title-icon/);
    assert.match(content, /\.saved-commute-current-impact-badge/);
    assert.match(content, /\.saved-commute-endpoints/);
    assert.match(content, /\.saved-commute-endpoint-row/);
    assert.match(content, /\.saved-commute-endpoint-connector/);
    assert.match(content, /\.saved-commute-endpoint-prefix/);
    assert.match(content, /\.saved-commute-endpoint-station/);
    assert.match(content, /\.saved-commute-station-text/);
    assert.match(content, /\.saved-commute-origin-swap/);
    assert.match(content, /\.saved-commute-dest-swap/);
    assert.match(content, /commuteOriginSwapIn/);
    assert.match(content, /commuteDestSwapIn/);
    assert.match(content, /\.saved-commute-impact-disclosure/);
    assert.match(content, /\.saved-commute-impact-summary/);
    assert.match(content, /\.saved-commute-impact-summary-chips/);
    assert.match(content, /\.saved-commute-impact-summary-chip/);
    assert.match(content, /\.saved-commute-impact-content-wrapper/);
    assert.match(content, /\.saved-commute-impact-list/);
    assert.match(content, /\.saved-commute-impact-icon/);
    assert.match(content, /\.commute-route-actions/);
    assert.match(content, /\.commute-route-stop-toggle/);
    assert.match(content, /\.commute-route-edit-button/);
    assert.match(content, /\.saved-commute-map-action/);
    assert.match(content, /\.commute-leg-toggle/);
    assert.match(content, /\.commute-leg-glider/);
    assert.match(content, /\.commute-single-leg-container/);
    assert.match(content, /\.commute-single-leg-banner/);
    assert.match(content, /\.saved-commute-time-estimate/);
    assert.match(content, /\.saved-commute-time-headline-clock/);
    assert.match(content, /\.saved-commute-leg-row/);
    assert.match(content, /\.commute-route-stop-list/);
    assert.match(content, /\.commute-route-delete-button/);
    assert.match(content, /\.commute-route-delete-confirm-button/);
    assert.match(content, /\.commute-route-delete-confirmation/);
    assert.match(content, /\.commute-toast-success/);
    assert.match(content, /\.saved-commute-routing-boundary-disclosure/);
    assert.match(content, /\.saved-commute-routing-boundary-static/);
    assert.match(content, /\.saved-commute-add-btn/);
    assert.match(content, /\.saved-commute-cancel-button/);
  });

  it("resolves the extracted account/saved-commute-rules.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("saved-commute-rules.css")), "saved-commute-rules.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/account/saved-commute-rules.css", import.meta.url));
    assert.match(content, /\.saved-commute-form/);
    assert.match(content, /\.saved-commute-primary-button/);
    assert.match(content, /\.saved-commute-sort-control/);
    assert.match(content, /\.saved-commute-sort-trigger/);
    assert.match(content, /\.saved-commute-sort-options/);
    assert.match(content, /\.saved-commute-sort-option/);
    assert.match(content, /\.saved-commute-list-actions/);
    assert.match(content, /\.saved-commute-edit-danger-zone/);
    assert.match(content, /\.saved-commute-delete-confirm-box/);
    assert.match(content, /\.commute-station-picker/);
    assert.match(content, /\.commute-station-label/);
    assert.match(content, /\.commute-station-trigger/);
    assert.match(content, /\.commute-station-popover/);
    assert.match(content, /\.commute-station-search-row/);
    assert.match(content, /\.commute-station-lines/);
    assert.match(content, /\.commute-station-options/);
    assert.match(content, /\.commute-station-line-trigger/);
    assert.match(content, /\.commute-station-option/);
    assert.match(content, /\.commute-station-name-text/);
    assert.match(content, /\.commute-station-line-badges/);
    assert.match(content, /\.commute-station-line-badge/);
    assert.match(content, /\.commute-station-empty/);
    assert.match(content, /\.saved-commute-station-grid/);
    assert.match(content, /\.commute-station-browse-container/);
    assert.match(content, /\.commute-station-lines-column/);
    assert.match(content, /\.commute-station-lines-list/);
    assert.match(content, /\.commute-station-stations-column/);
    assert.match(content, /\.commute-station-stations-scroll/);
    assert.match(content, /\.commute-station-stations-scroll-content/);
    assert.match(content, /\.commute-station-line-chevron/);
    assert.match(content, /mini-search-expansion-slide-in/);
    assert.match(content, /mini-search-list-slide-in/);
    assert.match(content, /\.station-commute-green-flash/);
    assert.match(content, /station-commute-green-flash-anim/);
    assert.match(content, /\.saved-commute-switch/);
    assert.match(content, /\.saved-commute-slider/);
    assert.match(content, /\.saved-commute-return-toggle/);
    assert.match(content, /\.saved-commute-customize-toggle/);
    assert.match(content, /\.saved-commute-notification-summary/);
    assert.match(content, /\.saved-commute-notification-rule/);
    assert.match(content, /\.saved-commute-rule-editor/);
    assert.match(content, /\.saved-commute-rule-summary/);
    assert.match(content, /\.saved-commute-rule-actions/);
    assert.match(content, /\.saved-commute-notification-master/);
    assert.match(content, /\.saved-commute-notification-master-row/);
    assert.match(content, /\.saved-commute-notification-master-copy/);
    assert.match(content, /\.saved-commute-schedule-list/);
    assert.match(content, /\.saved-commute-schedule/);
    assert.match(content, /\.saved-commute-schedule-header/);
    assert.match(content, /\.saved-commute-schedule-disclosure/);
    assert.match(content, /\.saved-commute-schedule-copy/);
    assert.match(content, /\.saved-commute-schedule-summary/);
    assert.match(content, /\.saved-commute-schedule-controls/);
    assert.match(content, /\.saved-commute-notification-block/);
    assert.match(content, /\.saved-commute-notification-leg-toggle/);
    assert.match(content, /\.saved-commute-route-label/);
    assert.match(content, /\.saved-commute-day-grid/);
    assert.match(content, /\.saved-commute-day-button/);
    assert.match(content, /\.saved-commute-notification-segmented/);
    assert.match(content, /\.saved-commute-custom-schedule/);
    assert.match(content, /\.saved-commute-time-window/);
    assert.match(content, /\.saved-commute-notification-checks/);
    assert.match(content, /\.saved-commute-event-types/);
    assert.match(content, /\.notification-event-icon/);
    assert.match(content, /\.saved-commute-notification-note/);
    assert.match(content, /\.saved-commute-notification-divider/);
    assert.match(content, /\.saved-commute-notification-help/);
  });

  it("resolves the extracted account/notification-settings.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("notification-settings.css")), "notification-settings.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/account/notification-settings.css", import.meta.url));
    assert.match(content, /\.push-settings-card/);
    assert.match(content, /\.push-settings-heading/);
    assert.match(content, /\.push-settings-toggle/);
    assert.match(content, /\.push-settings-message/);
    assert.match(content, /\.notification-settings-panel/);
    assert.match(content, /\.notification-settings-scroll/);
    assert.match(content, /\.notification-settings-section/);
    assert.match(content, /\.notification-settings-section-header/);
    assert.match(content, /\.notification-settings-status/);
    assert.match(content, /\.notification-network-filter/);
    assert.match(content, /\.notification-network-note/);
    assert.match(content, /\.notification-follow-up-header/);
    assert.match(content, /\.notification-follow-up-options/);
    assert.match(content, /\.notification-follow-up-option/);
    assert.match(content, /\.notification-follow-up-copy/);
    assert.match(content, /\.notification-follow-up-title/);
    assert.match(content, /\.notification-settings-card/);
    assert.match(content, /\.notification-settings-row/);
    assert.match(content, /\.notification-settings-row-main/);
    assert.match(content, /\.notification-settings-row-label/);
    assert.match(content, /\.notification-settings-icon/);
    assert.match(content, /\.notification-settings-list/);
    assert.match(content, /\.notification-settings-note/);
    assert.match(content, /\.notification-settings-message/);
    assert.match(content, /\.notification-settings-prompt/);
    assert.match(content, /\.notification-settings-toggle/);
    assert.match(content, /\.notification-line-badge/);
    assert.match(content, /\.notification-event-type-grid/);
    assert.match(content, /\.notification-event-type-header/);
    assert.match(content, /\.notification-settings-control-grid/);
    assert.match(content, /\.notification-settings-icon-label/);
    assert.match(content, /\.notification-settings-muted-warning/);
    assert.match(content, /\.notification-settings-row-actions/);
    assert.match(content, /\.push-diagnostics-details/);
    assert.match(content, /\.push-diagnostics-summary/);
    assert.match(content, /\.push-diagnostics-summary-copy/);
    assert.match(content, /\.push-diagnostics-status/);
    assert.match(content, /\.push-diagnostics-chevron/);
    assert.match(content, /\.push-diagnostics-panel/);
    assert.match(content, /\.push-diagnostics-header/);
    assert.match(content, /\.push-diagnostics-note/);
    assert.match(content, /\.push-devices-section/);
    assert.match(content, /\.push-devices-header/);
    assert.match(content, /\.push-devices-list/);
    assert.match(content, /\.push-device-row/);
    assert.match(content, /\.push-device-details/);
    assert.match(content, /\.push-device-main/);
    assert.match(content, /\.push-device-hash/);
    assert.match(content, /\.push-device-health/);
    assert.match(content, /\.push-device-meta/);
    assert.match(content, /\.push-device-actions/);
    assert.match(content, /\.push-device-disable/);
    assert.match(content, /\.push-device-test/);
    assert.match(content, /\.push-diagnostics-scroll/);
    assert.match(content, /\.push-diagnostics-filter/);
    assert.match(content, /\.push-diagnostics-archive-toggle/);
    assert.match(content, /\.push-diagnostics-item/);
    assert.match(content, /\.push-diagnostics-item-heading/);
    assert.match(content, /\.push-diagnostics-meta/);
    assert.match(content, /\.push-diagnostics-source/);
    assert.match(content, /\.push-diagnostics-attempts/);
    assert.match(content, /\.push-diagnostics-attempt/);
    assert.match(content, /\.push-diagnostics-recipient/);
    assert.match(content, /\.push-diagnostics-events/);
    assert.match(content, /\.push-diagnostics-empty-events/);
  });

  it("resolves the extracted panels/alerts.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("alerts.css")), "alerts.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/panels/alerts.css", import.meta.url));
    assert.match(content, /\.impact-card-map-btn/);
    assert.match(content, /\.jump-to-location-icon/);
    assert.match(content, /\.alert-card/);
    assert.match(content, /\.closure-card/);
    assert.match(content, /\.preview-button/);
    assert.match(content, /\.impact-card-utility-row/);
    assert.match(content, /\.impact-card-badges/);
    assert.match(content, /\.impact-route/);
    assert.match(content, /\.impact-route__bounds/);
    assert.match(content, /\.impact-metadata-grid/);
    assert.match(content, /\.rsz-zone-count-label-separator/);
    assert.match(content, /\.rsz-resolution-breakdown/);
    assert.match(content, /\.rsz-timing-breakdown/);
    assert.match(content, /\.impact-timestamp/);
    assert.match(content, /\.related-planned-closure-button/);
    assert.match(content, /\.planned-closure-status-button/);
    assert.match(content, /\.closure-window-value/);
    assert.match(content, /\.impact-list-toolbar/);
    assert.match(content, /\.line-impact-category-filters/);
    assert.match(content, /\.line-impact-total-badge/);
    assert.match(content, /\.line-impacts-panel/);
    assert.match(content, /\.line-impact-panel-stack/);
    assert.match(content, /\.embedded-impact-panel/);
    assert.match(content, /\.impact-list-search/);
    assert.match(content, /\.impact-list-selects/);
    assert.match(content, /\.impact-list-view-toggle/);
    assert.match(content, /\.impact-list-select-control/);
    assert.match(content, /\.compact-impact-list-item/);
    assert.match(content, /\.compact-impact-location__arrow/);
    assert.match(content, /\.station-impact-jump-actions/);
    assert.match(content, /\.station-impact-jump-button/);
    assert.match(content, /\.station-impact-card-highlight/);
    assert.match(content, /\.rsz-tone/);
    assert.match(content, /\.rsz-count-badge/);
    assert.match(content, /\.delay-tone/);
    assert.match(content, /\.delay-count-badge/);
    assert.match(content, /\.legend-rsz-button/);
    assert.match(content, /\.legend-delay-button/);
  });

  it("resolves the extracted panels/accessibility-outages.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("accessibility-outages.css")), "accessibility-outages.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/panels/accessibility-outages.css", import.meta.url));
    assert.match(content, /\.accessibility-accordion-wrapper/);
    assert.match(content, /\.accessibility-accordion-wrapper\[data-expanded="true"\]/);
    assert.match(content, /\.accessibility-accordion-wrapper\[data-expanded="false"\]/);
    assert.match(content, /\.accessibility-accordion-chevron/);
    assert.match(content, /\.accessibility-accordion-chevron\[data-expanded="true"\]/);
    assert.match(content, /\.accessibility-accordion-chevron\[data-expanded="false"\]/);
    assert.match(content, /\.motion-paused \.accessibility-accordion-chevron/);
  });

  it("resolves the extracted panels/surface-notices.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("surface-notices.css")), "surface-notices.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/panels/surface-notices.css", import.meta.url));
    assert.match(content, /\.surface-notices-body/);
    assert.match(content, /\.dark \.surface-notices-body/);
    assert.match(content, /\.high-contrast \.surface-notices-body/);
    assert.match(content, /\.floating-panel-shell\[data-floating-panel="mobile-panel"\]:has\(\[data-active-view="surface-notices"\]\) \.floating-panel-scroll/);
    assert.match(content, /\.regional-notices-filter/);
    assert.match(content, /\.regional-notices-glider/);
    assert.match(content, /\.regional-notices-filter\[data-content="notices"\] \.regional-notices-glider/);
    assert.match(content, /\.regional-notices-filter\[data-content="trip-changes"\] \.regional-notices-glider/);
    assert.match(content, /\.trip-change-tone/);
    assert.match(content, /\.dark \.trip-change-tone/);
    assert.match(content, /\.trip-change-count-badge/);
    assert.match(content, /\.dark \.trip-change-count-badge/);
    assert.match(content, /\.station-trip-changes-summary/);
    assert.match(content, /\.station-trip-changes-chevron/);
    assert.match(content, /\.station-trip-changes-details\[open\] \.station-trip-changes-chevron/);
  });

  it("resolves the extracted panels/reliability.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("reliability.css")), "reliability.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/panels/reliability.css", import.meta.url));
    assert.match(content, /\.analytics-panel/);
    assert.match(content, /\.health-panel/);
    assert.match(content, /\.reliability-row/);
    assert.match(content, /\.reliability-copy/);
    assert.match(content, /\.score-track/);
    assert.match(content, /\.health-grid/);
    assert.match(content, /\.health-item/);
    assert.match(content, /@media \(max-width: 1180px\)/);
    assert.match(content, /@media \(max-width: 900px\)/);
  });

  it("resolves the extracted panels/alert-history.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("alert-history.css")), "alert-history.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/panels/alert-history.css", import.meta.url));
    assert.match(content, /\.alert-history-panel/);
    assert.match(content, /\.alert-history-timeline/);
    assert.match(content, /\.alert-history-controls/);
    assert.match(content, /\.alert-history-search-row/);
    assert.match(content, /\.alert-history-selects-row/);
    assert.match(content, /\.alert-history-search-field/);
    assert.match(content, /\.alert-history-line-filter/);
    assert.match(content, /\.alert-history-line-filter-options/);
    assert.match(content, /\.alert-history-period-chip/);
    assert.match(content, /\.alert-history-filter-chip/);
    assert.match(content, /\.alert-history-list/);
    assert.match(content, /\.alert-history-item/);
    assert.match(content, /\.alert-history-type-label/);
    assert.match(content, /\.alert-history-status-label/);
    assert.match(content, /\.alert-history-primary-time/);
    assert.match(content, /\.alert-history-title/);
    assert.match(content, /\.alert-history-fact-grid/);
    assert.match(content, /\.compact-impact-location/);
    assert.match(content, /\.alert-history-duration/);
    assert.match(content, /\.alert-history-details/);
    assert.match(content, /\.alert-history-lifecycle-event/);
    assert.match(content, /\.alert-history-loading/);
  });

  it("resolves the extracted panels/feedback.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("feedback.css")), "feedback.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/panels/feedback.css", import.meta.url));
    assert.match(content, /\.feedback-panel/);
    assert.match(content, /\.feedback-content/);
    assert.match(content, /\.feedback-field/);
    assert.match(content, /\.feedback-textarea-container/);
    assert.match(content, /\.feedback-count/);
    assert.match(content, /\.feedback-count-error/);
    assert.match(content, /\.feedback-textarea/);
    assert.match(content, /\.feedback-honeypot/);
    assert.match(content, /\.feedback-actions/);
    assert.match(content, /\.feedback-submit-button/);
    assert.match(content, /\.feedback-status/);
    assert.match(content, /\.feedback-support-card/);
    assert.match(content, /\.feedback-support-button/);
  });

  it("resolves the extracted panels/info-modals.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("info-modals.css")), "info-modals.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/panels/info-modals.css", import.meta.url));
    assert.match(content, /\.opening-disclaimer-backdrop/);
    assert.match(content, /\.opening-disclaimer-panel/);
    assert.match(content, /\.opening-welcome-panel/);
    assert.match(content, /\.opening-welcome-slide/);
    assert.match(content, /\.site-guide-dropdown/);
    assert.match(content, /\.utility-popover/);
    assert.match(content, /@keyframes utility-popover-enter/);
    assert.match(content, /@keyframes utility-popover-exit/);
    assert.match(content, /\.source-status-panel/);
    assert.match(content, /\.release-notes-notice/);
    assert.match(content, /\.release-notes-panel/);
    assert.match(content, /\.release-notes-current/);
    assert.match(content, /\.release-note-card/);
    assert.match(content, /\.privacy-acknowledgements-panel/);
    assert.match(content, /@keyframes opening-disclaimer-backdrop-enter/);
  });

  it("resolves the extracted utilities/scroll.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("scroll.css")), "scroll.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/utilities/scroll.css", import.meta.url));
    assert.match(content, /\.stealth-scrollbar/);
    assert.match(content, /\.stealth-scrollbar::-webkit-scrollbar/);
    assert.match(content, /#linewatch-main-menu-scroll::-webkit-scrollbar/);
    assert.match(content, /\.station-detail-scroll::-webkit-scrollbar/);
    assert.match(content, /\.linewatch-shell\.high-contrast #linewatch-main-menu-scroll/);
    assert.match(content, /\.linewatch-shell \[data-scroll-more-below\]/);
  });

  it("resolves the extracted utilities/motion.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("motion.css")), "motion.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/utilities/motion.css", import.meta.url));
    assert.match(content, /html\[data-network-transition-direction\]/);
    assert.match(content, /@keyframes network-map-slide-in-from-right/);
    assert.match(content, /@keyframes network-map-slide-out-to-left/);
    assert.match(content, /\.live-signal-icon/);
    assert.match(content, /@keyframes live-signal-wave-inner/);
    assert.match(content, /\.desktop-view-content-wrapper/);
    assert.match(content, /\.desktop-view-content-wrapper\s*\{[^}]*panel-container-root 220ms/s);
    assert.match(content, /\.mobile-view-content-wrapper/);
    assert.match(content, /@keyframes mobile-content-fade-in/);
    assert.match(content, /@keyframes menu-border-pulse/);
    assert.match(content, /@keyframes linewatch-toast-lifecycle/);
    assert.match(content, /\.floating-panel-shell/);
    assert.match(content, /@keyframes floating-panel-back-exit/);
    assert.match(content, /@keyframes panel-container-forward/);
    assert.match(content, /@keyframes panel-container-back/);
    assert.match(content, /@keyframes mobile-sheet-slide-down-exit/);
    assert.match(content, /@keyframes floating-panel-exit-desktop/);
    assert.match(content, /@keyframes panel-container-root/);
    assert.match(content, /\.linewatch-shell button:not\(:disabled\)/);
    assert.match(content, /@keyframes terminating-blink/);
    assert.match(content, /\.animate-terminating-blink/);
  });

  it("resolves the extracted shell/header-flare.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("header-flare.css")), "header-flare.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/shell/header-flare.css", import.meta.url));
    assert.match(content, /\.station-subsection-header/);
    assert.match(content, /\.station-connections-title/);
    assert.match(content, /\.mobile-status-section-heading/);
    assert.match(content, /\[data-station-section\] \.station-subsection-header > \.bg-logo-blue/);
  });

  it("resolves the extracted shell/card-elevation.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("card-elevation.css")), "card-elevation.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/shell/card-elevation.css", import.meta.url));
    assert.match(content, /\.alert-card/);
    assert.match(content, /\.rsz-card-border/);
    assert.match(content, /\.delay-card-border/);
    assert.match(content, /\.suspension-card-border/);
    assert.match(content, /\.planned-closure-card-border/);
    assert.match(content, /\.desktop-line-status-row/);
    assert.match(content, /\.station-detail-disruption-card/);
    assert.match(content, /var\(--surface-card-opaque\)/);
  });

  it("resolves the extracted shell/search-bar.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("search-bar.css")), "search-bar.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/shell/search-bar.css", import.meta.url));
    assert.match(content, /\.header-search-bar/);
    assert.match(content, /\.header-search-input/);
    assert.match(content, /\.search-btn\[aria-expanded="true"\]/);
  });

  it("resolves the extracted shell/badges.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("badges.css")), "badges.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/shell/badges.css", import.meta.url));
    assert.match(content, /\.overlapping-count-badge/);
    assert.match(content, /\.line-badge/);
    assert.match(content, /\.status-pill/);
    assert.match(content, /\.mobile-line-status-impacts/);
    assert.match(content, /\.mobile-status-actions/);
    assert.match(content, /\.desktop-menu-count-badge/);
  });

  it("resolves the extracted map/map-legends.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("map-legends.css")), "map-legends.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/map/map-legends.css", import.meta.url));
    assert.match(content, /\.desktop-map-legend/);
    assert.match(content, /\.desktop-legend-route-badge/);
    assert.match(content, /\.desktop-legend-route-badge--ttc/);
    assert.match(content, /\.desktop-legend-route-badge--regional/);
    assert.match(content, /\.legend-impact-count/);
    assert.match(content, /\.regional-map-legend/);
    assert.match(content, /\.mobile-legend-pill/);
    assert.match(content, /\.mobile-legend-route-badge/);
    assert.match(content, /\.mobile-legend-line-list/);
    assert.match(content, /\.mobile-legend-line-row/);
  });

  it("resolves the extracted shell/status-notices.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("status-notices.css")), "status-notices.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/shell/status-notices.css", import.meta.url));
    assert.match(content, /\.dashboard-availability-notice/);
    assert.match(content, /\.dashboard-availability-notice\[data-state="unavailable"\]/);
    assert.match(content, /\.app-update-banner/);
    assert.match(content, /\.app-update-banner-copy/);
    assert.match(content, /\.app-update-banner-actions/);
  });

  it("resolves the extracted shell/error-screen.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("error-screen.css")), "error-screen.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/shell/error-screen.css", import.meta.url));
    assert.match(content, /\.linewatch-error-screen/);
    assert.match(content, /\.linewatch-error-card/);
    assert.match(content, /\.linewatch-transit-accent-strip/);
    assert.match(content, /\.linewatch-error-brand/);
    assert.match(content, /\.linewatch-error-actions/);
  });

  it("resolves the extracted foundation/high-contrast.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("high-contrast.css")), "high-contrast.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/foundation/high-contrast.css", import.meta.url));
    assert.match(content, /\.linewatch-shell\.high-contrast \.linewatch-backdrop/);
    assert.match(content, /\.linewatch-shell\.high-contrast \.text-slate-900/);
    assert.match(content, /\.linewatch-shell\.high-contrast button:hover/);
    assert.match(content, /\.linewatch-shell\.high-contrast \.panel/);
    assert.match(content, /\.high-contrast \.station-detail-panel/);
  });

  it("resolves the extracted shell/subway-closed.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("subway-closed.css")), "subway-closed.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/shell/subway-closed.css", import.meta.url));
    assert.match(content, /\.subway-closing-soon-chip/);
    assert.match(content, /\.subway-closed-screen/);
    assert.match(content, /\.subway-closed-content/);
    assert.match(content, /\.subway-closed-resume/);
    assert.match(content, /\.subway-closed-schedule-table/);
    assert.match(content, /\.go-up-closed-content/);
    assert.match(content, /\.subway-closed-peek-chip/);
    assert.match(content, /@keyframes subway-closed-modal-enter/);
  });

  it("resolves the extracted shell/map-mode-control.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("map-mode-control.css")), "map-mode-control.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/shell/map-mode-control.css", import.meta.url));
    assert.match(content, /\.default-map-mode-control/);
    assert.match(content, /\.default-map-mode-label/);
    assert.match(content, /\.default-map-mode-options/);
    assert.match(content, /\.default-map-mode-glider/);
    assert.match(content, /\.default-map-mode-btn/);
    assert.match(content, /\.default-map-mode-btn-regional/);
  });

  it("resolves the extracted station/station-picker-popover.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("station-picker-popover.css")), "station-picker-popover.css must be in graph files");
    const content = readStylesheet(new URL("../src/styles/station/station-picker-popover.css", import.meta.url));
    assert.match(content, /\.site-dropdown-trigger/);
    assert.match(content, /\.site-dropdown-menu/);
    assert.match(content, /\.site-dropdown-option/);
    assert.match(content, /@keyframes commute-popover-enter/);
    assert.match(content, /\.commute-station-popover/);
    assert.match(content, /\.commute-station-search-row/);
    assert.match(content, /\.commute-station-browse-container/);
    assert.match(content, /@keyframes commute-popover-enter-mobile/);
    assert.match(content, /\.commute-station-mobile-back/);
  });

  it("strips comments and counts debt metrics accurately", () => {
    const sampleCss = `
      /* !important comment */
      .valid { color: red !important; }
      /* [class*="fake"] */
      .target[class*="min-h-[74px]"] { padding: 4px !important; }
    `;
    assert.equal(stripCssComments(sampleCss).includes("fake"), false);
    assert.equal(countImportantDeclarations(sampleCss), 2);
    assert.equal(countClassSubstringSelectors(sampleCss), 1);
  });

  it("extracts @import directives from stylesheet entries", () => {
    const directives = getImportDirectives();
    assert.ok(Array.isArray(directives));
    assert.equal(directives.length, 53);
    assert.equal(directives[0], '@import "tailwindcss" source("../");');
    assert.equal(directives[1], '@import "../styles/foundation/fonts.css";');
  });
});
