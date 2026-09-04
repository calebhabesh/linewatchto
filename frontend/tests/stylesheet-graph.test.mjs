import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  clearStylesheetCache,
  getAppStylesheetGraphFiles,
  readAppStylesheet,
  readAppStylesheetGraph,
  readStylesheet,
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
  });

  it("resolves the extracted shell/dashboard-shell.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("dashboard-shell.css")), "dashboard-shell.css must be in graph files");
    const dashboardShellContent = readStylesheet(new URL("../src/styles/shell/dashboard-shell.css", import.meta.url));
    assert.match(dashboardShellContent, /\.linewatch-wordmark/);
    assert.match(dashboardShellContent, /\.linewatch-shell/);
    assert.match(dashboardShellContent, /--desktop-global-search-width/);
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
    assert.match(stationSearchContent, /html:not\(\[data-visual-keyboard="open"\]\) \.station-search-panel/);
  });

  it("resolves the extracted station/station-detail.css in the application stylesheet graph", () => {
    clearStylesheetCache();
    const files = getAppStylesheetGraphFiles();
    assert.ok(files.some(f => f.endsWith("station-detail.css")), "station-detail.css must be in graph files");
    const stationDetailContent = readStylesheet(new URL("../src/styles/station/station-detail.css", import.meta.url));
    assert.match(stationDetailContent, /\.station-detail-panel/);
    assert.match(stationDetailContent, /@keyframes station-detail-enter/);
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
    assert.match(stationDetailContent, /@keyframes station-detail-content-in/);
    assert.match(stationDetailContent, /\.station-detail-map-button/);
    assert.match(stationDetailContent, /\.station-header-line-row/);
    assert.match(stationDetailContent, /\.station-header-line-badge/);
    assert.match(stationDetailContent, /\.station-line-directions/);
    assert.match(stationDetailContent, /\.station-submenu-nav-btn/);
    assert.match(stationDetailContent, /\.station-detail-closing/);
    assert.match(stationDetailContent, /@keyframes station-detail-exit-mobile/);
    assert.match(stationDetailContent, /@keyframes station-detail-exit-desktop/);
  });
});
