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
});
