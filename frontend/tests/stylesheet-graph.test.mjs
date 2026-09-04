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
});
