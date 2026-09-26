import {
  analyzeCssAst,
  buildStylesheetGraph,
  countClassSubstringSelectors,
  countImportantDeclarations,
  countLines,
  getImportDirectives,
  readStylesheet,
  resolveStylesheetGraph,
  stripCssComments,
  toAbsolutePath,
} from "../../scripts/stylesheet-graph.mjs";

export {
  analyzeCssAst,
  buildStylesheetGraph,
  countClassSubstringSelectors,
  countImportantDeclarations,
  countLines,
  getImportDirectives,
  readStylesheet,
  resolveStylesheetGraph,
  stripCssComments,
  toAbsolutePath,
};

const DEFAULT_ENTRY_URL = new URL("../../src/app/globals.css", import.meta.url);

let cachedGraph = null;
let cachedGraphFiles = null;
let cachedEntryPath = null;

/**
 * Reads the complete application stylesheet graph starting from globals.css (or specified entry),
 * inlining relative imports in manifest order.
 *
 * @param {string | URL | { entry?: string | URL, forceRefresh?: boolean }} [options]
 * @param {{ forceRefresh?: boolean }} [extraOptions]
 * @returns {string} The concatenated stylesheet contents.
 */
export function readAppStylesheet(options = {}, extraOptions = {}) {
  let entry = DEFAULT_ENTRY_URL;
  let forceRefresh = false;

  if (typeof options === "string" || options instanceof URL) {
    entry = options;
    if (typeof extraOptions === "object" && extraOptions !== null && extraOptions.forceRefresh) {
      forceRefresh = extraOptions.forceRefresh;
    }
  } else if (typeof options === "object" && options !== null) {
    if (options.entry) entry = options.entry;
    if (options.forceRefresh) forceRefresh = options.forceRefresh;
  }

  const absoluteEntry = toAbsolutePath(entry);

  if (!forceRefresh && cachedGraph !== null && cachedEntryPath === absoluteEntry) {
    return cachedGraph;
  }

  const result = resolveStylesheetGraph(absoluteEntry, { dedupeRepeated: true });

  cachedGraph = result.content;
  cachedGraphFiles = result.files;
  cachedEntryPath = absoluteEntry;

  return result.content;
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
  const result = resolveStylesheetGraph(absoluteEntry, { dedupeRepeated: true });
  return result.files;
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
 * Resolves stylesheet graph and performs full AST analysis on the resolved content.
 */
export function analyzeStylesheetGraph(entry = DEFAULT_ENTRY_URL, options = {}) {
  const absoluteEntry = toAbsolutePath(entry);
  const graph = resolveStylesheetGraph(absoluteEntry, options);
  const ast = analyzeCssAst(graph.content);
  return {
    ...graph,
    ast,
  };
}
