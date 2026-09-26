import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  analyzeCssAst,
  countLines,
  getImportDirectives,
  readStylesheet,
  resolveStylesheetGraph,
} from "./stylesheet-graph.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(scriptDirectory, "..");
const srcDirectory = join(frontendDirectory, "src");
const globalsCssPath = join(srcDirectory, "app", "globals.css");
const testsDirectory = join(frontendDirectory, "tests");
const nextChunksDirectory = join(frontendDirectory, ".next", "static", "chunks");

function findCssFiles(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findCssFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".css")) {
      results.push(fullPath);
    }
  }
  return results;
}

function countTestReferences(dir = testsDirectory) {
  if (!existsSync(dir)) return 0;
  let count = 0;
  const files = readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (file.isFile() && (file.name.endsWith(".test.mjs") || file.name.endsWith(".spec.ts"))) {
      const content = readFileSync(join(dir, file.name), "utf8");
      if (content.includes("globals.css")) {
        count++;
      }
    }
  }
  return count;
}

function getCurrentGitCommit(cwd = frontendDirectory) {
  try {
    const stdout = execSync("git rev-parse HEAD", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

function hasUncommittedCssChanges(cwd = frontendDirectory) {
  try {
    const stdout = execSync("git status --porcelain", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    const lines = stdout.split("\n").filter(Boolean);
    return lines.some(line => line.includes(".css"));
  } catch {
    return false;
  }
}

/**
 * Records build metadata tying .next output to a specific git commit and configuration.
 */
export function recordBuildInfo(options = {}) {
  const cwd = options.cwd || frontendDirectory;
  const buildDir = options.buildDir || join(cwd, ".next");
  if (!existsSync(buildDir)) {
    mkdirSync(buildDir, { recursive: true });
  }

  const commit = options.commit || getCurrentGitCommit(cwd) || "unknown";
  const dirty = options.dirty !== undefined ? options.dirty : hasUncommittedCssChanges(cwd);
  const configuration = options.configuration || "production";
  const buildIdPath = join(buildDir, "BUILD_ID");
  const buildId = existsSync(buildIdPath) ? readFileSync(buildIdPath, "utf8").trim() : null;

  const buildInfo = {
    commit,
    dirty,
    configuration,
    buildId,
    timestamp: options.timestamp || new Date().toISOString(),
  };

  const filePath = options.filePath || join(buildDir, "linewatch-build-info.json");
  writeFileSync(filePath, JSON.stringify(buildInfo, null, 2), "utf8");
  return buildInfo;
}

/**
 * Measures built production CSS chunks, verifying whether the build is tied
 * to a known, matching commit/configuration.
 */
export function measureBuiltCss(options = {}) {
  const cwd = options.cwd || frontendDirectory;
  const chunksDir = options.chunksDir || (options.cwd ? join(cwd, ".next", "static", "chunks") : nextChunksDirectory);
  const buildInfoPath = options.buildInfoPath || join(cwd, ".next", "linewatch-build-info.json");

  if (!existsSync(chunksDir)) {
    return {
      found: false,
      status: "absent",
      verified: false,
      label: "unknown",
      commit: null,
      configuration: null,
      reason: "No build chunks directory found (.next/static/chunks)",
      files: [],
      largest: null,
    };
  }

  const files = readdirSync(chunksDir)
    .filter(f => f.endsWith(".css"))
    .map(name => {
      const path = join(chunksDir, name);
      const content = readFileSync(path);
      const gzipped = gzipSync(content);
      return {
        name,
        rawBytes: content.length,
        gzipBytes: gzipped.length,
      };
    })
    .sort((a, b) => b.rawBytes - a.rawBytes);

  if (files.length === 0) {
    return {
      found: false,
      status: "absent",
      verified: false,
      label: "unknown",
      commit: null,
      configuration: null,
      reason: "No .css chunk files found in build chunks directory",
      files: [],
      largest: null,
    };
  }

  let buildInfo = options.buildInfo || null;
  if (!buildInfo && existsSync(buildInfoPath)) {
    try {
      buildInfo = JSON.parse(readFileSync(buildInfoPath, "utf8"));
    } catch {
      buildInfo = null;
    }
  }

  const currentCommit = options.expectedCommit !== undefined
    ? options.expectedCommit
    : getCurrentGitCommit(cwd);

  let verified = false;
  let status = "unverified";
  let reason = "";

  if (options.forceVerified) {
    verified = true;
    status = "verified";
    reason = "Forced verification via options";
  } else if (buildInfo && buildInfo.commit && currentCommit && buildInfo.commit === currentCommit) {
    if (buildInfo.dirty && !options.allowDirty) {
      verified = false;
      status = "unverified";
      reason = `Build was generated on dirty working tree with uncommitted CSS changes at commit ${buildInfo.commit.slice(0, 8)}`;
    } else if (hasUncommittedCssChanges(cwd) && !options.allowDirty) {
      verified = false;
      status = "unverified";
      reason = `Working tree has uncommitted CSS changes since build at commit ${buildInfo.commit.slice(0, 8)}`;
    } else {
      verified = true;
      status = "verified";
      reason = `Build verified matching current HEAD commit (${buildInfo.commit.slice(0, 8)})`;
    }
  } else if (buildInfo && buildInfo.commit) {
    verified = false;
    status = "unverified";
    reason = `Build commit (${buildInfo.commit.slice(0, 8)}) does not match current HEAD (${currentCommit ? currentCommit.slice(0, 8) : "unknown"})`;
  } else {
    verified = false;
    status = "unverified";
    reason = "No build metadata found tying .next chunks to current HEAD commit";
  }

  return {
    found: true,
    status,
    verified,
    label: verified ? (buildInfo?.commit ? buildInfo.commit.slice(0, 8) : "verified") : "unknown",
    commit: buildInfo?.commit || null,
    configuration: buildInfo?.configuration || null,
    reason,
    files,
    largest: files[0] || null,
  };
}

/**
 * Computes CSS architecture metrics across four distinct populations:
 * 1. Entry Manifest: imports and manifest-only properties
 * 2. Resolved Application Import Graph: authored rules, decls, !important, media, keyframes, selectors
 * 3. Other Authored Component/Module Styles: separate inventory, no double counting
 * 4. Built CSS: files and raw/gzip sizes tied to a known build commit/configuration
 */
export function runMetrics(options = {}) {
  const cwd = options.cwd || frontendDirectory;
  const entryPath = options.entryPath || globalsCssPath;
  const srcDir = options.srcDir || srcDirectory;
  const testsDir = options.testsDir || testsDirectory;

  // 1. Entry manifest population
  const globalsRaw = readStylesheet(entryPath);
  const globalsBytes = statSync(entryPath).size;
  const globalsLines = countLines(globalsRaw);
  const globalsAst = analyzeCssAst(globalsRaw);
  const entryDirectives = getImportDirectives(entryPath);
  const vendorImportsInManifest = entryDirectives.filter(d => !d.startsWith("@import .") && !d.includes(".css"));
  const localImportsInManifest = entryDirectives.filter(d => !vendorImportsInManifest.includes(d));

  const manifest = {
    path: relative(cwd, entryPath),
    lines: globalsLines,
    bytes: globalsBytes,
    importsCount: entryDirectives.length,
    vendorImportsCount: vendorImportsInManifest.length,
    localImportsCount: localImportsInManifest.length,
    directives: entryDirectives,
    ...globalsAst,
  };

  // 2. Resolved application import graph population
  const graphDetails = resolveStylesheetGraph(entryPath, { dedupeRepeated: true });
  const graphAst = analyzeCssAst(graphDetails.content);

  let graphTotalLines = 0;
  let graphTotalBytes = 0;
  const graphFilesBreakdown = [];

  for (const filePath of graphDetails.files) {
    const raw = readFileSync(filePath, "utf8");
    const lines = countLines(raw);
    const bytes = statSync(filePath).size;
    graphTotalLines += lines;
    graphTotalBytes += bytes;
    graphFilesBreakdown.push({
      path: relative(cwd, filePath),
      lines,
      bytes,
    });
  }

  const graph = {
    entry: relative(cwd, graphDetails.entry),
    fileCount: graphDetails.files.length,
    totalLines: graphTotalLines,
    totalBytes: graphTotalBytes,
    files: graphFilesBreakdown,
    vendorImports: graphDetails.vendorImports,
    repeatedImports: graphDetails.repeatedImports,
    ...graphAst,
  };

  // 3. Other authored component/module styles population (no double counting)
  const allSrcCssFiles = findCssFiles(srcDir);
  const graphFilesSet = new Set(graphDetails.files.map(f => resolve(f)));

  const otherAuthoredFilePaths = allSrcCssFiles.filter(f => !graphFilesSet.has(resolve(f)));
  let otherTotalLines = 0;
  let otherTotalBytes = 0;
  const otherFilesBreakdown = [];
  let combinedOtherCss = "";

  for (const filePath of otherAuthoredFilePaths) {
    const raw = readFileSync(filePath, "utf8");
    const lines = countLines(raw);
    const bytes = statSync(filePath).size;
    otherTotalLines += lines;
    otherTotalBytes += bytes;
    combinedOtherCss += `${raw}\n`;
    otherFilesBreakdown.push({
      path: relative(cwd, filePath),
      lines,
      bytes,
    });
  }

  const otherAst = otherAuthoredFilePaths.length > 0 ? analyzeCssAst(combinedOtherCss) : null;

  const otherAuthored = {
    fileCount: otherAuthoredFilePaths.length,
    totalLines: otherTotalLines,
    totalBytes: otherTotalBytes,
    files: otherFilesBreakdown,
    ...(otherAst || {
      rules: 0,
      decls: 0,
      importants: 0,
      media: 0,
      keyframes: 0,
      classSubstrings: 0,
      totalSelectors: 0,
      classTokensCount: 0,
      duplicateKeyframes: [],
      vendorAtRules: [],
    }),
  };

  // 4. Combined authored styles summary (graph + other component styles)
  const authored = {
    totalFiles: graphDetails.files.length + otherAuthoredFilePaths.length,
    totalLines: graphTotalLines + otherTotalLines,
    totalBytes: graphTotalBytes + otherTotalBytes,
    files: [...graphFilesBreakdown, ...otherFilesBreakdown],
  };

  const testCount = countTestReferences(testsDir);
  const builtCss = measureBuiltCss(options);

  return {
    manifest,
    entryManifest: manifest,
    globals: manifest, // Backward-compatibility alias
    graph,
    resolvedGraph: graph,
    otherAuthored,
    componentStyles: otherAuthored,
    authored,
    testsReferencingGlobals: testCount,
    builtCss,
  };
}

// When run directly as a CLI script
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv.includes("--record-build")) {
    const info = recordBuildInfo();
    console.log(`[measure-css] Build metadata recorded for commit: ${info.commit.slice(0, 8)} (dirty: ${info.dirty})`);
    process.exit(0);
  }

  const metrics = runMetrics();

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(metrics, null, 2));
    process.exit(0);
  }

  console.log("=================================================================");
  console.log("             LineWatchTO CSS Refactor Metrics Report            ");
  console.log("=================================================================\n");

  console.log("1. Entry Manifest (globals.css):");
  console.log(`  Path:                         ${metrics.manifest.path}`);
  console.log(`  Lines:                        ${metrics.manifest.lines.toLocaleString()}`);
  console.log(`  Bytes:                        ${metrics.manifest.bytes.toLocaleString()} bytes`);
  console.log(`  Import directives:            ${metrics.manifest.importsCount.toLocaleString()} (${metrics.manifest.vendorImportsCount} external, ${metrics.manifest.localImportsCount} modular)`);
  console.log(`  Manifest-only parsed rules:   ${metrics.manifest.rules.toLocaleString()} (clean manifest)`);
  console.log(`  Manifest-only declarations:   ${metrics.manifest.decls.toLocaleString()}`);

  console.log("\n2. Resolved Application Import Graph:");
  console.log(`  Graph files:                  ${metrics.graph.fileCount.toLocaleString()}`);
  console.log(`  Graph total lines:            ${metrics.graph.totalLines.toLocaleString()}`);
  console.log(`  Graph total bytes:            ${metrics.graph.totalBytes.toLocaleString()} bytes (${(metrics.graph.totalBytes / 1024).toFixed(1)} KB)`);
  console.log(`  Parsed rules:                 ${metrics.graph.rules.toLocaleString()}`);
  console.log(`  Parsed declarations:          ${metrics.graph.decls.toLocaleString()}`);
  console.log(`  !important declarations:      ${metrics.graph.importants.toLocaleString()}`);
  console.log(`  Media queries:                ${metrics.graph.media.toLocaleString()}`);
  console.log(`  Keyframe blocks:              ${metrics.graph.keyframes.toLocaleString()}`);
  console.log(`  Class substring selectors:    ${metrics.graph.classSubstrings.toLocaleString()}`);
  console.log(`  Distinct class tokens:        ~${metrics.graph.classTokensCount.toLocaleString()}`);
  console.log(`  Total selectors:              ${metrics.graph.totalSelectors.toLocaleString()}`);

  if (metrics.graph.duplicateKeyframes.length > 0) {
    console.log("  Duplicate keyframe names:");
    for (const item of metrics.graph.duplicateKeyframes) {
      console.log(`    - ${item.name} (${item.count} occurrences)`);
    }
  }

  console.log("\n3. Other Authored Component/Module Styles (Not in import graph):");
  console.log(`  File count:                   ${metrics.otherAuthored.fileCount.toLocaleString()}`);
  for (const f of metrics.otherAuthored.files) {
    console.log(`  - ${f.path.padEnd(46)} ${f.lines.toString().padStart(6)} lines  ${(f.bytes / 1024).toFixed(1).padStart(7)} KB`);
  }
  console.log(`  Component styles lines:       ${metrics.otherAuthored.totalLines.toLocaleString()}`);
  console.log(`  Component styles bytes:       ${metrics.otherAuthored.totalBytes.toLocaleString()} bytes (${(metrics.otherAuthored.totalBytes / 1024).toFixed(1)} KB)`);
  console.log(`  Component styles rules:       ${metrics.otherAuthored.rules.toLocaleString()}`);
  console.log(`  Component styles decls:       ${metrics.otherAuthored.decls.toLocaleString()}`);

  console.log("\n4. All Authored CSS Summary (No Double Counting):");
  console.log(`  Total authored files:         ${metrics.authored.totalFiles.toLocaleString()}`);
  console.log(`  Total authored lines:         ${metrics.authored.totalLines.toLocaleString()}`);
  console.log(`  Total authored bytes:         ${metrics.authored.totalBytes.toLocaleString()} bytes (${(metrics.authored.totalBytes / 1024).toFixed(1)} KB)`);

  console.log("\n5. Test References:");
  console.log(`  Tests referencing globals.css: ${metrics.testsReferencingGlobals}`);

  console.log("\n6. Built Production CSS Chunks:");
  if (metrics.builtCss.status === "verified") {
    console.log(`  Status: VERIFIED (commit: ${metrics.builtCss.commit ? metrics.builtCss.commit.slice(0, 8) : "current"})`);
    for (const chunk of metrics.builtCss.files) {
      console.log(`  - ${chunk.name.padEnd(30)} ${chunk.rawBytes.toLocaleString().padStart(8)} bytes raw | ${chunk.gzipBytes.toLocaleString().padStart(7)} bytes gzip`);
    }
    if (metrics.builtCss.largest) {
      console.log(`  Largest production chunk:     ${metrics.builtCss.largest.rawBytes.toLocaleString()} bytes raw / ${metrics.builtCss.largest.gzipBytes.toLocaleString()} bytes gzip`);
    }
  } else if (metrics.builtCss.status === "unverified") {
    console.log("  Status: UNVERIFIED / UNKNOWN (build chunks not verified against current HEAD)");
    console.log(`  Detail: ${metrics.builtCss.reason}`);
    console.log(`  (${metrics.builtCss.files.length} chunk file(s) found on disk from prior build, labeled unknown for current HEAD)`);
  } else {
    console.log("  Status: ABSENT / UNKNOWN (no production build chunks found in .next/static/chunks)");
  }

  console.log("\n-----------------------------------------------------------------");
  console.log("Markdown Table for docs/globals-css-refactor-progress.md:\n");
  console.log("| Metric | Population | Value |");
  console.log("|---|---|---:|");
  console.log(`| Global entry lines | Entry manifest | ${metrics.manifest.lines.toLocaleString()} |`);
  console.log(`| Global entry bytes | Entry manifest | ${metrics.manifest.bytes.toLocaleString()} |`);
  console.log(`| Entry import directives | Entry manifest | ${metrics.manifest.importsCount.toLocaleString()} |`);
  console.log(`| Manifest-only rules | Entry manifest | ${metrics.manifest.rules.toLocaleString()} |`);
  console.log(`| Application graph files | Resolved graph | ${metrics.graph.fileCount.toLocaleString()} |`);
  console.log(`| Application graph lines | Resolved graph | ${metrics.graph.totalLines.toLocaleString()} |`);
  console.log(`| Application graph bytes | Resolved graph | ${metrics.graph.totalBytes.toLocaleString()} |`);
  console.log(`| Parsed rules | Resolved graph | ${metrics.graph.rules.toLocaleString()} |`);
  console.log(`| Declarations | Resolved graph | ${metrics.graph.decls.toLocaleString()} |`);
  console.log(`| !important | Resolved graph | ${metrics.graph.importants.toLocaleString()} |`);
  console.log(`| Media queries | Resolved graph | ${metrics.graph.media.toLocaleString()} |`);
  console.log(`| Keyframe blocks | Resolved graph | ${metrics.graph.keyframes.toLocaleString()} |`);
  console.log(`| Class-substring selectors | Resolved graph | ${metrics.graph.classSubstrings.toLocaleString()} |`);
  console.log(`| Distinct class tokens | Resolved graph | ~${metrics.graph.classTokensCount.toLocaleString()} |`);
  console.log(`| Other component styles files | Component styles | ${metrics.otherAuthored.fileCount.toLocaleString()} |`);
  console.log(`| Other component styles lines | Component styles | ${metrics.otherAuthored.totalLines.toLocaleString()} |`);
  console.log(`| Other component styles bytes | Component styles | ${metrics.otherAuthored.totalBytes.toLocaleString()} |`);
  console.log(`| Total authored app CSS files | All authored | ${metrics.authored.totalFiles.toLocaleString()} |`);
  console.log(`| Total authored app CSS lines | All authored | ${metrics.authored.totalLines.toLocaleString()} |`);
  console.log(`| Total authored app CSS bytes | All authored | ${metrics.authored.totalBytes.toLocaleString()} |`);

  if (metrics.builtCss.status === "verified" && metrics.builtCss.largest) {
    console.log(`| Production CSS bytes | Built CSS (${metrics.builtCss.label}) | ${metrics.builtCss.largest.rawBytes.toLocaleString()} |`);
    console.log(`| Production CSS gzip bytes | Built CSS (${metrics.builtCss.label}) | ${metrics.builtCss.largest.gzipBytes.toLocaleString()} |`);
  } else if (metrics.builtCss.status === "unverified") {
    console.log(`| Production CSS bytes | Built CSS | unknown (unverified build) |`);
    console.log(`| Production CSS gzip bytes | Built CSS | unknown (unverified build) |`);
  } else {
    console.log(`| Production CSS bytes | Built CSS | unknown (no build found) |`);
    console.log(`| Production CSS gzip bytes | Built CSS | unknown (no build found) |`);
  }
  console.log("=================================================================\n");
}
