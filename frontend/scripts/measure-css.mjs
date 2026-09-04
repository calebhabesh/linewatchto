import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import postcss from "postcss";

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

function countLines(content) {
  if (!content) return 0;
  let count = 0;
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) count++;
  }
  if (!content.endsWith("\n")) count++;
  return count;
}

function analyzeAst(cssContent) {
  const root = postcss.parse(cssContent);

  let rules = 0;
  let decls = 0;
  let importants = 0;
  let media = 0;
  let keyframes = 0;
  let classSubstrings = 0;
  const classTokens = new Set();
  const keyframeNames = {};

  root.walk(node => {
    if (node.type === "rule") {
      rules++;
      const selectorParts = node.selector.split(",");
      for (const part of selectorParts) {
        if (/\[class[*^$|~]?=/.test(part)) {
          classSubstrings++;
        }
      }
      const matches = node.selector.match(/\.[a-zA-Z0-9_\-\\\/]+/g);
      if (matches) {
        for (const m of matches) {
          classTokens.add(m.slice(1).replace(/\\/g, ""));
        }
      }
    } else if (node.type === "decl") {
      decls++;
      if (node.important) {
        importants++;
      }
    } else if (node.type === "atrule") {
      if (node.name === "media") {
        media++;
      } else if (node.name === "keyframes") {
        keyframes++;
        keyframeNames[node.params] = (keyframeNames[node.params] || 0) + 1;
      }
    }
  });

  const duplicateKeyframes = Object.entries(keyframeNames)
    .filter(([, count]) => count > 1)
    .map(([name, count]) => ({ name, count }));

  return {
    rules,
    decls,
    importants,
    media,
    keyframes,
    classSubstrings,
    classTokensCount: classTokens.size,
    duplicateKeyframes
  };
}

function countTestReferences() {
  if (!existsSync(testsDirectory)) return 0;
  let count = 0;
  const files = readdirSync(testsDirectory, { withFileTypes: true });
  for (const file of files) {
    if (file.isFile() && (file.name.endsWith(".test.mjs") || file.name.endsWith(".spec.ts"))) {
      const content = readFileSync(join(testsDirectory, file.name), "utf8");
      if (content.includes("globals.css")) {
        count++;
      }
    }
  }
  return count;
}

function measureBuiltCss() {
  if (!existsSync(nextChunksDirectory)) {
    return { found: false, files: [], largest: null };
  }
  const files = readdirSync(nextChunksDirectory)
    .filter(f => f.endsWith(".css"))
    .map(name => {
      const path = join(nextChunksDirectory, name);
      const content = readFileSync(path);
      const gzipped = gzipSync(content);
      return {
        name,
        rawBytes: content.length,
        gzipBytes: gzipped.length
      };
    })
    .sort((a, b) => b.rawBytes - a.rawBytes);

  return {
    found: files.length > 0,
    files,
    largest: files[0] || null
  };
}

export function runMetrics() {
  const globalsRaw = readFileSync(globalsCssPath, "utf8");
  const globalsBytes = statSync(globalsCssPath).size;
  const globalsLines = countLines(globalsRaw);
  const globalsAst = analyzeAst(globalsRaw);

  const authoredCssFiles = findCssFiles(srcDirectory);
  let totalAuthoredLines = 0;
  let totalAuthoredBytes = 0;
  const authoredBreakdown = [];

  for (const filePath of authoredCssFiles) {
    const raw = readFileSync(filePath, "utf8");
    const lines = countLines(raw);
    const bytes = statSync(filePath).size;
    totalAuthoredLines += lines;
    totalAuthoredBytes += bytes;
    authoredBreakdown.push({
      path: relative(frontendDirectory, filePath),
      lines,
      bytes
    });
  }

  const testCount = countTestReferences();
  const builtCss = measureBuiltCss();

  return {
    globals: {
      path: relative(frontendDirectory, globalsCssPath),
      lines: globalsLines,
      bytes: globalsBytes,
      ...globalsAst
    },
    authored: {
      totalLines: totalAuthoredLines,
      totalBytes: totalAuthoredBytes,
      files: authoredBreakdown
    },
    testsReferencingGlobals: testCount,
    builtCss
  };
}

// When run directly as a CLI script
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const metrics = runMetrics();

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(metrics, null, 2));
    process.exit(0);
  }

  console.log("=================================================================");
  console.log("             LineWatchTO CSS Refactor Metrics Report            ");
  console.log("=================================================================\n");

  console.log("globals.css Entry File:");
  console.log(`  Path:                       ${metrics.globals.path}`);
  console.log(`  Lines:                      ${metrics.globals.lines.toLocaleString()}`);
  console.log(`  Bytes:                      ${metrics.globals.bytes.toLocaleString()} bytes`);
  console.log(`  Parsed rules:               ${metrics.globals.rules.toLocaleString()}`);
  console.log(`  Parsed declarations:        ${metrics.globals.decls.toLocaleString()}`);
  console.log(`  !important declarations:    ${metrics.globals.importants.toLocaleString()}`);
  console.log(`  Media queries:              ${metrics.globals.media.toLocaleString()}`);
  console.log(`  Keyframe blocks:            ${metrics.globals.keyframes.toLocaleString()}`);
  console.log(`  Class substring selectors:  ${metrics.globals.classSubstrings.toLocaleString()}`);
  console.log(`  Distinct class tokens:      ~${metrics.globals.classTokensCount.toLocaleString()}`);

  if (metrics.globals.duplicateKeyframes.length > 0) {
    console.log("  Duplicate keyframe names:");
    for (const item of metrics.globals.duplicateKeyframes) {
      console.log(`    - ${item.name} (${item.count} occurrences)`);
    }
  }

  console.log("\nAuthored CSS Files:");
  for (const f of metrics.authored.files) {
    console.log(`  - ${f.path.padEnd(42)} ${f.lines.toString().padStart(6)} lines  ${(f.bytes / 1024).toFixed(1).padStart(7)} KB`);
  }
  console.log(`  Total authored lines:       ${metrics.authored.totalLines.toLocaleString()}`);
  console.log(`  Total authored bytes:       ${metrics.authored.totalBytes.toLocaleString()} bytes (${(metrics.authored.totalBytes / 1024).toFixed(1)} KB)`);

  console.log("\nTest References:");
  console.log(`  Tests referencing globals.css: ${metrics.testsReferencingGlobals}`);

  console.log("\nBuilt Production CSS Chunks:");
  if (metrics.builtCss.found) {
    for (const chunk of metrics.builtCss.files) {
      console.log(`  - ${chunk.name.padEnd(30)} ${chunk.rawBytes.toLocaleString().padStart(8)} bytes raw | ${chunk.gzipBytes.toLocaleString().padStart(7)} bytes gzip`);
    }
    if (metrics.builtCss.largest) {
      console.log(`  Largest production chunk:   ${metrics.builtCss.largest.rawBytes.toLocaleString()} bytes raw / ${metrics.builtCss.largest.gzipBytes.toLocaleString()} bytes gzip`);
    }
  } else {
    console.log("  (No build chunks found in .next/static/chunks. Run 'npm run build' first)");
  }

  console.log("\n-----------------------------------------------------------------");
  console.log("Markdown Table for docs/globals-css-refactor-progress.md:\n");
  console.log("| Metric | Baseline | Current |");
  console.log("|---|---:|---:|");
  console.log(`| Global entry lines | ${metrics.globals.lines.toLocaleString()} | ${metrics.globals.lines.toLocaleString()} |`);
  console.log(`| Total authored app CSS lines | ${metrics.authored.totalLines.toLocaleString()} | ${metrics.authored.totalLines.toLocaleString()} |`);
  console.log(`| Total authored app CSS bytes | ${metrics.authored.totalBytes.toLocaleString()} | ${metrics.authored.totalBytes.toLocaleString()} |`);
  console.log(`| Parsed rules | ${metrics.globals.rules.toLocaleString()} | ${metrics.globals.rules.toLocaleString()} |`);
  console.log(`| Declarations | ${metrics.globals.decls.toLocaleString()} | ${metrics.globals.decls.toLocaleString()} |`);
  console.log(`| !important | ${metrics.globals.importants.toLocaleString()} | ${metrics.globals.importants.toLocaleString()} |`);
  console.log(`| Class-substring selectors | ${metrics.globals.classSubstrings.toLocaleString()} | ${metrics.globals.classSubstrings.toLocaleString()} |`);
  if (metrics.builtCss.largest) {
    console.log(`| Production CSS bytes | ${metrics.builtCss.largest.rawBytes.toLocaleString()} | ${metrics.builtCss.largest.rawBytes.toLocaleString()} |`);
    console.log(`| Production CSS gzip bytes | ${metrics.builtCss.largest.gzipBytes.toLocaleString()} | ${metrics.builtCss.largest.gzipBytes.toLocaleString()} |`);
  } else {
    console.log(`| Production CSS bytes | TBD | TBD |`);
    console.log(`| Production CSS gzip bytes | TBD | TBD |`);
  }
  console.log("=================================================================\n");
}
