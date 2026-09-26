import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

export const DEFAULT_ENTRY_URL = new URL("../src/app/globals.css", import.meta.url);

/**
 * Normalizes a path or file:// URL to an absolute filesystem path.
 */
export function toAbsolutePath(pathOrUrl) {
  if (pathOrUrl instanceof URL) {
    return fileURLToPath(pathOrUrl);
  }
  if (typeof pathOrUrl === "string") {
    if (pathOrUrl.startsWith("file://")) {
      return fileURLToPath(new URL(pathOrUrl));
    }
    return resolve(pathOrUrl);
  }
  throw new TypeError(`Expected string or URL, received ${typeof pathOrUrl}`);
}

/**
 * Counts newline occurrences to determine physical lines in a string.
 */
export function countLines(content) {
  if (!content) return 0;
  let count = 0;
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) count++;
  }
  if (!content.endsWith("\n")) count++;
  return count;
}

/**
 * Strips all block comments (/* ... *\/) from a CSS string.
 */
export function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Reads an individual stylesheet directly without following its @import statements.
 */
export function readStylesheet(pathOrUrl) {
  const absolutePath = toAbsolutePath(pathOrUrl);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`Stylesheet not found: "${absolutePath}"`);
  }
  return readFileSync(absolutePath, "utf8");
}

/**
 * Extracts all non-comment @import directive strings from a stylesheet.
 */
export function getImportDirectives(pathOrUrl = DEFAULT_ENTRY_URL) {
  const content = readStylesheet(pathOrUrl);
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  const directives = [];
  for (const line of lines) {
    if (line.startsWith("@import ")) {
      directives.push(line);
    }
  }
  return directives;
}

/**
 * Strips comments when matching @import statements and recursively resolves
 * relative stylesheet imports in declared manifest order.
 *
 * Accounts for:
 * - Local imports: inlined in manifest sequence
 * - Cycles: detected and rejected with an explicit error
 * - Missing paths: explicit relative imports throw if not found on disk
 * - Repeated imports: recorded and deduplicated to prevent duplicate cascades
 * - Vendor/Tailwind imports: distinguished from authored rules and preserved in place
 */
export function buildStylesheetGraph(
  entryAbsolutePath,
  visitedBranch = new Set(),
  collectedFiles = [],
  graphState = {
    allVisited: new Set(),
    vendorImports: [],
    repeatedImports: [],
    dedupeRepeated: true,
  },
) {
  if (visitedBranch.has(entryAbsolutePath)) {
    throw new Error(
      `Circular stylesheet import detected: "${entryAbsolutePath}" is already in the import chain: ${Array.from(visitedBranch).join(" -> ")}`,
    );
  }

  if (!existsSync(entryAbsolutePath) || !statSync(entryAbsolutePath).isFile()) {
    throw new Error(`Stylesheet not found: "${entryAbsolutePath}"`);
  }

  visitedBranch.add(entryAbsolutePath);
  if (!collectedFiles.includes(entryAbsolutePath)) {
    collectedFiles.push(entryAbsolutePath);
  }
  if (graphState.allVisited) {
    graphState.allVisited.add(entryAbsolutePath);
  }

  const content = readFileSync(entryAbsolutePath, "utf8");
  const fileDir = dirname(entryAbsolutePath);

  // Regex matches comments or @import declarations:
  // - /* ... */ -> preserved as is
  // - @import url("...") or @import "..." -> resolved if local relative file
  const tokenRegex = /\/\*[\s\S]*?\*\/|@import\s+(?:url\(\s*(?:(["\x27])(.*?)\1|([^)"\x27\s]+))\s*\)|(["\x27])(.*?)\4)([^;]*);/g;

  const resolved = content.replace(tokenRegex, (match, q1, url1, url2, q2, url3) => {
    // Preserve comments
    if (match.startsWith("/*")) {
      return match;
    }

    const importTarget = url1 || url2 || url3;
    if (!importTarget) {
      return match;
    }

    // Determine whether this is a local relative import or an external/framework package
    const isExplicitRelative = importTarget.startsWith(".") || importTarget.startsWith("/");
    const candidatePath = resolve(fileDir, importTarget);

    if (existsSync(candidatePath) && statSync(candidatePath).isFile()) {
      // 1. Check for cycles in the current branch first
      if (visitedBranch.has(candidatePath)) {
        throw new Error(
          `Circular stylesheet import detected: "${candidatePath}" is already in the import chain: ${Array.from(visitedBranch).join(" -> ")}`,
        );
      }

      // 2. Check for repeated/diamond imports across previously resolved branches
      if (graphState.allVisited && graphState.allVisited.has(candidatePath)) {
        if (graphState.repeatedImports) {
          graphState.repeatedImports.push({
            referrer: entryAbsolutePath,
            target: importTarget,
            path: candidatePath,
          });
        }
        if (graphState.dedupeRepeated) {
          return `/* @import "${importTarget}" (already included) */\n`;
        }
      }

      const inlined = buildStylesheetGraph(candidatePath, new Set(visitedBranch), collectedFiles, graphState);
      return inlined.endsWith("\n") ? inlined : `${inlined}\n`;
    }

    if (isExplicitRelative) {
      throw new Error(`Stylesheet import not found: "${importTarget}" referenced from "${entryAbsolutePath}"`);
    }

    // Keep external imports (e.g. @import "tailwindcss" source("../");) in place and record
    if (graphState.vendorImports) {
      graphState.vendorImports.push(match.trim());
    }
    return match;
  });

  return resolved;
}

/**
 * Resolves the complete stylesheet graph starting from an entrypoint, returning
 * both concatenated content and graph metadata.
 */
export function resolveStylesheetGraph(entryPathOrUrl = DEFAULT_ENTRY_URL, options = {}) {
  const entryAbsolutePath = toAbsolutePath(entryPathOrUrl);
  const collectedFiles = [];
  const graphState = {
    allVisited: new Set(),
    vendorImports: [],
    repeatedImports: [],
    dedupeRepeated: options.dedupeRepeated !== false,
  };

  const content = buildStylesheetGraph(
    entryAbsolutePath,
    new Set(),
    collectedFiles,
    graphState,
  );

  const entryContent = readStylesheet(entryAbsolutePath);
  const entryDirectives = getImportDirectives(entryAbsolutePath);

  return {
    entry: entryAbsolutePath,
    files: collectedFiles,
    content,
    vendorImports: graphState.vendorImports,
    repeatedImports: graphState.repeatedImports,
    entryDirectives,
    entryContent,
  };
}

/**
 * Uses PostCSS AST to analyze the structural metrics of authored CSS rules.
 */
export function analyzeCssAst(cssContent) {
  const root = postcss.parse(cssContent);

  let rules = 0;
  let decls = 0;
  let importants = 0;
  let media = 0;
  let keyframes = 0;
  let classSubstrings = 0;
  let totalSelectors = 0;
  const classTokens = new Set();
  const keyframeNames = {};
  const vendorAtRules = [];

  root.walk(node => {
    if (node.type === "rule") {
      rules++;
      const selectorParts = node.selector.split(",");
      totalSelectors += selectorParts.length;
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
      } else if (node.name === "import") {
        if (!node.params.startsWith(".") && !node.params.includes(".css")) {
          vendorAtRules.push(`@${node.name} ${node.params}`);
        }
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
    totalSelectors,
    classTokensCount: classTokens.size,
    duplicateKeyframes,
    vendorAtRules,
  };
}

/**
 * Counts !important declarations outside of comments using AST analysis.
 */
export function countImportantDeclarations(css) {
  try {
    return analyzeCssAst(css).importants;
  } catch {
    const stripped = stripCssComments(css);
    const matches = stripped.match(/!\s*important\b/gi);
    return matches ? matches.length : 0;
  }
}

/**
 * Counts [class*="..."] and other class substring/prefix/suffix selectors using AST analysis.
 */
export function countClassSubstringSelectors(css) {
  try {
    return analyzeCssAst(css).classSubstrings;
  } catch {
    const stripped = stripCssComments(css);
    const matches = stripped.match(/\[class[*^$|~]?=[^\]]*\]/g);
    return matches ? matches.length : 0;
  }
}
