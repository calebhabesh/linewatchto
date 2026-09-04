import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ENTRY_URL = new URL("../../src/app/globals.css", import.meta.url);

let cachedGraph = null;
let cachedGraphFiles = null;
let cachedEntryPath = null;

/**
 * Normalizes a path or file:// URL to an absolute filesystem path.
 */
function toAbsolutePath(pathOrUrl) {
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
 * Strips comments when matching @import statements and recursively resolves
 * relative stylesheet imports in declared manifest order.
 */
function buildStylesheetGraph(entryAbsolutePath, visitedBranch = new Set(), collectedFiles = []) {
  if (visitedBranch.has(entryAbsolutePath)) {
    throw new Error(`Circular stylesheet import detected: "${entryAbsolutePath}" is already in the import chain: ${Array.from(visitedBranch).join(" -> ")}`);
  }

  if (!existsSync(entryAbsolutePath) || !statSync(entryAbsolutePath).isFile()) {
    throw new Error(`Stylesheet not found: "${entryAbsolutePath}"`);
  }

  visitedBranch.add(entryAbsolutePath);
  if (!collectedFiles.includes(entryAbsolutePath)) {
    collectedFiles.push(entryAbsolutePath);
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
    const isExplicitRelative = importTarget.startsWith(".") || importTarget.endsWith(".css");
    const candidatePath = resolve(fileDir, importTarget);

    if (existsSync(candidatePath) && statSync(candidatePath).isFile()) {
      const inlined = buildStylesheetGraph(candidatePath, new Set(visitedBranch), collectedFiles);
      return inlined.endsWith("\n") ? inlined : `${inlined}\n`;
    }

    if (isExplicitRelative) {
      throw new Error(`Stylesheet import not found: "${importTarget}" referenced from "${entryAbsolutePath}"`);
    }

    // Keep external imports (e.g. @import "tailwindcss" source("../");) in place
    return match;
  });

  return resolved;
}

/**
 * Reads the complete application stylesheet graph starting from globals.css (or specified entry),
 * inlining relative imports in manifest order.
 *
 * @param {string | URL | { entry?: string | URL, forceRefresh?: boolean }} [options]
 * @returns {string} The concatenated stylesheet contents.
 */
export function readAppStylesheet(options = {}) {
  let entry = DEFAULT_ENTRY_URL;
  let forceRefresh = false;

  if (typeof options === "string" || options instanceof URL) {
    entry = options;
  } else if (typeof options === "object" && options !== null) {
    if (options.entry) entry = options.entry;
    if (options.forceRefresh) forceRefresh = options.forceRefresh;
  }

  const absoluteEntry = toAbsolutePath(entry);

  if (!forceRefresh && cachedGraph !== null && cachedEntryPath === absoluteEntry) {
    return cachedGraph;
  }

  const collectedFiles = [];
  const content = buildStylesheetGraph(absoluteEntry, new Set(), collectedFiles);

  cachedGraph = content;
  cachedGraphFiles = collectedFiles;
  cachedEntryPath = absoluteEntry;

  return content;
}

/**
 * Alias for readAppStylesheet to make intent explicit when loading full graph.
 */
export const readAppStylesheetGraph = readAppStylesheet;

/**
 * Returns an array of absolute file paths included in the stylesheet graph.
 *
 * @param {string | URL} [entry]
 * @returns {string[]}
 */
export function getAppStylesheetGraphFiles(entry = DEFAULT_ENTRY_URL) {
  const absoluteEntry = toAbsolutePath(entry);
  if (cachedGraphFiles !== null && cachedEntryPath === absoluteEntry) {
    return [...cachedGraphFiles];
  }
  const collectedFiles = [];
  buildStylesheetGraph(absoluteEntry, new Set(), collectedFiles);
  return collectedFiles;
}

/**
 * Reads an individual stylesheet directly without following its @import statements.
 *
 * @param {string | URL} pathOrUrl
 * @returns {string}
 */
export function readStylesheet(pathOrUrl) {
  const absolutePath = toAbsolutePath(pathOrUrl);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`Stylesheet not found: "${absolutePath}"`);
  }
  return readFileSync(absolutePath, "utf8");
}

/**
 * Clears the in-memory stylesheet graph cache.
 */
export function clearStylesheetCache() {
  cachedGraph = null;
  cachedGraphFiles = null;
  cachedEntryPath = null;
}

/**
 * Strips all block comments (/* ... *\/) from a CSS string.
 *
 * @param {string} css
 * @returns {string}
 */
export function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Counts !important declarations outside of comments.
 *
 * @param {string} css
 * @returns {number}
 */
export function countImportantDeclarations(css) {
  const stripped = stripCssComments(css);
  const matches = stripped.match(/!\s*important\b/gi);
  return matches ? matches.length : 0;
}

/**
 * Counts [class*="..."] and other class substring/prefix/suffix selectors outside of comments.
 *
 * @param {string} css
 * @returns {number}
 */
export function countClassSubstringSelectors(css) {
  const stripped = stripCssComments(css);
  const matches = stripped.match(/\[class[*^$|~]?=[^\]]*\]/g);
  return matches ? matches.length : 0;
}

/**
 * Extracts all non-comment @import directive strings from a stylesheet.
 *
 * @param {string | URL} [pathOrUrl]
 * @returns {string[]}
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
