import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  measureBuiltCss,
  recordBuildInfo,
  runMetrics,
} from "../scripts/measure-css.mjs";

describe("CSS measurement tool (Chunk C1)", () => {
  it("measures a fixture graph producing nonzero known counts while keeping entry-only metrics distinct", () => {
    const tempDir = join(tmpdir(), `linewatch-c1-fixture-${Date.now()}`);
    mkdirSync(join(tempDir, "src"), { recursive: true });

    try {
      // 1. Leaf stylesheet 1: buttons
      writeFileSync(
        join(tempDir, "src", "buttons.css"),
        `
        .btn { color: red !important; font-size: 14px; }
        .btn[class*="icon-"] { margin-right: 4px; }
        @media (max-width: 768px) {
          .btn { display: block; }
        }
        `,
      );

      // 2. Leaf stylesheet 2: cards
      writeFileSync(
        join(tempDir, "src", "cards.css"),
        `
        @keyframes card-fade { 0% { opacity: 0; } 100% { opacity: 1; } }
        .card { background: white; border: 1px solid black; }
        `,
      );

      // 3. Entry manifest with only @import directives
      writeFileSync(
        join(tempDir, "src", "entry.css"),
        `@import "./buttons.css";\n@import "./cards.css";\n`,
      );

      const metrics = runMetrics({
        cwd: tempDir,
        entryPath: join(tempDir, "src", "entry.css"),
        srcDir: join(tempDir, "src"),
        testsDir: join(tempDir, "tests"),
        chunksDir: join(tempDir, ".next", "static", "chunks"),
      });

      // Entry manifest metrics: rules/decls/importants MUST stay 0 (clean manifest)
      assert.equal(metrics.manifest.rules, 0, "entry manifest must report 0 parsed rules");
      assert.equal(metrics.manifest.decls, 0, "entry manifest must report 0 declarations");
      assert.equal(metrics.manifest.importants, 0, "entry manifest must report 0 !important");
      assert.equal(metrics.manifest.media, 0, "entry manifest must report 0 media queries");
      assert.equal(metrics.manifest.keyframes, 0, "entry manifest must report 0 keyframes");
      assert.equal(metrics.manifest.importsCount, 2, "entry manifest must report 2 @import directives");

      // Resolved application graph metrics: nonzero, exact counts
      assert.equal(metrics.graph.fileCount, 3, "resolved graph must contain 3 files (entry + 2 leaves)");
      assert.equal(metrics.graph.rules, 6, "resolved graph must report 6 rules (.btn, .btn[class*='icon-'], .btn in media, 2 keyframe steps, .card)");
      assert.equal(metrics.graph.decls, 8, "resolved graph must report 8 declarations");
      assert.equal(metrics.graph.importants, 1, "resolved graph must report 1 !important declaration");
      assert.equal(metrics.graph.media, 1, "resolved graph must report 1 media query");
      assert.equal(metrics.graph.keyframes, 1, "resolved graph must report 1 keyframe definition");
      assert.equal(metrics.graph.classSubstrings, 1, "resolved graph must report 1 class-substring selector");
      assert.equal(metrics.graph.classTokensCount, 2, "resolved graph must report 2 distinct class tokens (btn, card)");

      // Backward compatibility aliases
      assert.equal(metrics.globals.rules, 0);
      assert.equal(metrics.resolvedGraph.rules, 6);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("inventories other authored component/module styles without double counting", () => {
    const tempDir = join(tmpdir(), `linewatch-c1-components-${Date.now()}`);
    mkdirSync(join(tempDir, "src"), { recursive: true });

    try {
      writeFileSync(join(tempDir, "src", "in-manifest.css"), ".in-graph { color: green; }\n");
      writeFileSync(join(tempDir, "src", "entry.css"), '@import "./in-manifest.css";\n');
      writeFileSync(join(tempDir, "src", "standalone.module.css"), ".component { padding: 10px; }\n");

      const metrics = runMetrics({
        cwd: tempDir,
        entryPath: join(tempDir, "src", "entry.css"),
        srcDir: join(tempDir, "src"),
        testsDir: join(tempDir, "tests"),
        chunksDir: join(tempDir, ".next", "static", "chunks"),
      });

      // Graph files
      assert.equal(metrics.graph.fileCount, 2);
      assert.ok(metrics.graph.files.some(f => f.path.includes("in-manifest.css")));

      // Other authored component styles
      assert.equal(metrics.otherAuthored.fileCount, 1);
      assert.ok(metrics.otherAuthored.files[0].path.includes("standalone.module.css"));
      assert.equal(metrics.otherAuthored.rules, 1);

      // Total authored summary (graph + component styles)
      assert.equal(metrics.authored.totalFiles, 3);
      assert.equal(
        metrics.authored.totalLines,
        metrics.graph.totalLines + metrics.otherAuthored.totalLines,
        "combined lines must exactly equal graph lines + other authored lines",
      );
      assert.equal(
        metrics.authored.totalBytes,
        metrics.graph.totalBytes + metrics.otherAuthored.totalBytes,
        "combined bytes must exactly equal graph bytes + other authored bytes",
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("labels absent build directory as unknown and never attributes it to current HEAD", () => {
    const tempDir = join(tmpdir(), `linewatch-c1-absent-build-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    try {
      const built = measureBuiltCss({
        cwd: tempDir,
        chunksDir: join(tempDir, ".next", "static", "chunks"),
        buildInfoPath: join(tempDir, ".next", "linewatch-build-info.json"),
      });

      assert.equal(built.found, false);
      assert.equal(built.status, "absent");
      assert.equal(built.verified, false);
      assert.equal(built.label, "unknown");
      assert.equal(built.commit, null);
      assert.deepEqual(built.files, []);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("labels unverified build chunks as unknown and never attributes them to current HEAD", () => {
    const tempDir = join(tmpdir(), `linewatch-c1-unverified-build-${Date.now()}`);
    const chunksDir = join(tempDir, ".next", "static", "chunks");
    mkdirSync(chunksDir, { recursive: true });

    try {
      writeFileSync(join(chunksDir, "chunk-1.css"), ".unverified { color: black; }");

      // 1. No build metadata present
      const builtNoMeta = measureBuiltCss({
        cwd: tempDir,
        chunksDir,
        buildInfoPath: join(tempDir, ".next", "linewatch-build-info.json"),
        expectedCommit: "commit-abc1234",
      });

      assert.equal(builtNoMeta.found, true);
      assert.equal(builtNoMeta.status, "unverified");
      assert.equal(builtNoMeta.verified, false);
      assert.equal(builtNoMeta.label, "unknown");

      // 2. Mismatched commit in build metadata
      writeFileSync(
        join(tempDir, ".next", "linewatch-build-info.json"),
        JSON.stringify({ commit: "old-commit-9999", dirty: false }),
      );

      const builtMismatched = measureBuiltCss({
        cwd: tempDir,
        chunksDir,
        buildInfoPath: join(tempDir, ".next", "linewatch-build-info.json"),
        expectedCommit: "current-head-1111",
      });

      assert.equal(builtMismatched.found, true);
      assert.equal(builtMismatched.status, "unverified");
      assert.equal(builtMismatched.verified, false);
      assert.equal(builtMismatched.label, "unknown");
      assert.match(builtMismatched.reason, /does not match current HEAD/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("labels verified build matching commit as verified and reports chunk sizes", () => {
    const tempDir = join(tmpdir(), `linewatch-c1-verified-build-${Date.now()}`);
    const chunksDir = join(tempDir, ".next", "static", "chunks");
    mkdirSync(chunksDir, { recursive: true });

    try {
      writeFileSync(join(chunksDir, "app-chunk.css"), ".verified-app { display: grid; }");

      recordBuildInfo({
        cwd: tempDir,
        commit: "abc1234567890",
        dirty: false,
        configuration: "production",
      });

      const built = measureBuiltCss({
        cwd: tempDir,
        chunksDir,
        buildInfoPath: join(tempDir, ".next", "linewatch-build-info.json"),
        expectedCommit: "abc1234567890",
        allowDirty: false,
      });

      assert.equal(built.found, true);
      assert.equal(built.status, "verified");
      assert.equal(built.verified, true);
      assert.equal(built.label, "abc12345");
      assert.equal(built.commit, "abc1234567890");
      assert.equal(built.files.length, 1);
      assert.ok(built.largest.rawBytes > 0);
      assert.ok(built.largest.gzipBytes > 0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("measures the real production application graph truthfully across distinct populations", () => {
    const metrics = runMetrics();

    // Population 1: Entry Manifest
    assert.equal(metrics.manifest.path, "src/app/globals.css");
    assert.equal(metrics.manifest.rules, 0, "globals.css must contain 0 parsed rules");
    assert.equal(metrics.manifest.decls, 0, "globals.css must contain 0 declarations");
    assert.equal(metrics.manifest.importants, 0, "globals.css must contain 0 !important");
    assert.equal(metrics.manifest.importsCount, 53, "globals.css must contain 53 import directives");

    // Population 2: Resolved Application Import Graph
    assert.equal(metrics.graph.fileCount, 53, "resolved graph must contain 53 modular files");
    assert.ok(metrics.graph.rules > 5000, "resolved graph must report over 5000 parsed rules");
    assert.ok(metrics.graph.decls > 15000, "resolved graph must report over 15000 declarations");
    assert.equal(metrics.graph.importants, 519, "resolved graph !important must match baseline ceiling (519)");
    assert.equal(metrics.graph.classSubstrings, 18, "resolved graph class-substrings must match ceiling (18)");
    assert.equal(metrics.graph.keyframes, 98, "resolved graph keyframes must match unique definitions (98)");
    assert.equal(metrics.graph.duplicateKeyframes.length, 0, "resolved graph must have zero duplicate keyframe names");

    // Population 3: Other Authored Component Styles
    assert.equal(metrics.otherAuthored.fileCount, 3, "must identify 3 standalone component/module stylesheets");
    assert.ok(metrics.otherAuthored.files.some(f => f.path.includes("transit-guide.module.css")));
    assert.ok(metrics.otherAuthored.files.some(f => f.path.includes("SquishSwitch.css")));
    assert.ok(metrics.otherAuthored.files.some(f => f.path.includes("Stepper.css")));

    // Population 4: Combined Authored CSS Summary
    assert.equal(metrics.authored.totalFiles, 56, "total authored files must be exactly 53 + 3 = 56");
    assert.equal(
      metrics.authored.totalLines,
      metrics.graph.totalLines + metrics.otherAuthored.totalLines,
      "total authored lines must equal graph + other authored lines",
    );
    assert.equal(
      metrics.authored.totalBytes,
      metrics.graph.totalBytes + metrics.otherAuthored.totalBytes,
      "total authored bytes must equal graph + other authored bytes",
    );
  });
});
