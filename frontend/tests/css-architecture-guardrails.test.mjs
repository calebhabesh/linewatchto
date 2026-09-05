import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  clearStylesheetCache,
  countClassSubstringSelectors,
  countImportantDeclarations,
  getAppStylesheetGraphFiles,
  getImportDirectives,
  readAppStylesheetGraph,
  readStylesheet,
  stripCssComments,
} from "./helpers/stylesheet-graph.mjs";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = resolve(TEST_DIR, "..");
const SRC_DIR = join(FRONTEND_DIR, "src");
const STYLES_DIR = join(SRC_DIR, "styles");
const ENTRY_STYLESHEET_PATH = getAppStylesheetGraphFiles()[0];

/**
 * Migration debt ceilings frozen in Session S12.
 * Future sessions (e.g. S13 replacing class-substring selectors, S15 removing !important)
 * will reduce these numbers; they may NEVER increase.
 */
const BASELINE_CEILINGS = {
  GRAPH_IMPORTANT_DECLARATIONS: 2072,
  GRAPH_CLASS_SUBSTRING_SELECTORS: 18,
  GLOBALS_IMPORTANT_DECLARATIONS: 0,
  GLOBALS_CLASS_SUBSTRING_SELECTORS: 0,
};

/**
 * Canonical 52-entry import manifest for the entry stylesheet in documented cascade order.
 */
export const CANONICAL_IMPORT_MANIFEST = [
  '@import "tailwindcss" source("../");',
  '@import "../styles/foundation/fonts.css";',
  '@import "../styles/foundation/tokens.css";',
  '@import "../styles/foundation/reset.css";',
  '@import "../styles/foundation/themes.css";',
  '@import "../styles/foundation/accessibility.css";',
  '@import "../styles/map/base-map.css";',
  '@import "../styles/map/impact-overlays.css";',
  '@import "../styles/map/regional-map.css";',
  '@import "../styles/map/station-markers.css";',
  '@import "../styles/map/map-selection.css";',
  '@import "../styles/map/overlap-chooser.css";',
  '@import "../styles/map/commute-preview.css";',
  '@import "../styles/map/train-markers.css";',
  '@import "../styles/shell/dashboard-shell.css";',
  '@import "../styles/shell/desktop-chrome.css";',
  '@import "../styles/shell/floating-panels.css";',
  '@import "../styles/shell/map-controls.css";',
  '@import "../styles/shell/mobile-chrome.css";',
  '@import "../styles/shell/mobile-sheets.css";',
  '@import "../styles/shell/mobile-landscape.css";',
  '@import "../styles/shell/responsive-density.css";',
  '@import "../styles/station/station-search.css";',
  '@import "../styles/station/station-detail.css";',
  '@import "../styles/station/station-arrivals.css";',
  '@import "../styles/station/station-accessibility.css";',
  '@import "../styles/station/surface-connections.css";',
  '@import "../styles/account/account-dialogs.css";',
  '@import "../styles/account/my-stations.css";',
  '@import "../styles/account/saved-commutes.css";',
  '@import "../styles/account/saved-commute-rules.css";',
  '@import "../styles/account/notification-settings.css";',
  '@import "../styles/panels/alerts.css";',
  '@import "../styles/panels/accessibility-outages.css";',
  '@import "../styles/panels/surface-notices.css";',
  '@import "../styles/panels/reliability.css";',
  '@import "../styles/panels/alert-history.css";',
  '@import "../styles/panels/feedback.css";',
  '@import "../styles/panels/info-modals.css";',
  '@import "../styles/utilities/scroll.css";',
  '@import "../styles/utilities/motion.css";',
  '@import "../styles/shell/header-flare.css";',
  '@import "../styles/shell/card-elevation.css";',
  '@import "../styles/shell/search-bar.css";',
  '@import "../styles/shell/badges.css";',
  '@import "../styles/map/map-legends.css";',
  '@import "../styles/shell/status-notices.css";',
  '@import "../styles/shell/error-screen.css";',
  '@import "../styles/foundation/high-contrast.css";',
  '@import "../styles/shell/subway-closed.css";',
  '@import "../styles/shell/map-mode-control.css";',
  '@import "../styles/station/station-picker-popover.css";',
];

function findCssFilesInDirectory(dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findCssFilesInDirectory(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".css")) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("CSS architecture guardrails", () => {
  describe("entry manifest integrity", () => {
    it("enforces that entry stylesheet contains only approved Tailwind setup, @import directives, and comments", () => {
      const content = readStylesheet(ENTRY_STYLESHEET_PATH);
      const lines = content.split("\n").map(l => l.trim()).filter(Boolean);

      for (const line of lines) {
        const isApprovedDirective =
          line.startsWith("@import ") ||
          line.startsWith("/*") ||
          line.startsWith("*") ||
          line.endsWith("*/");

        assert.ok(
          isApprovedDirective,
          `Disallowed non-import, non-comment line detected in entry manifest: "${line}"`,
        );
      }
    });

    it("verifies that entry stylesheet has zero CSS rules, declaration blocks, media queries, or keyframes", () => {
      const content = readStylesheet(ENTRY_STYLESHEET_PATH);
      const withoutComments = stripCssComments(content);

      assert.equal(
        withoutComments.includes("{"),
        false,
        "entry stylesheet must contain zero declaration blocks or opening braces '{'",
      );
      assert.equal(
        withoutComments.includes("}"),
        false,
        "entry stylesheet must contain zero closing braces '}'",
      );
      assert.equal(
        /@media\b/.test(withoutComments),
        false,
        "entry stylesheet must contain zero @media query rules",
      );
      assert.equal(
        /@keyframes\b/.test(withoutComments),
        false,
        "entry stylesheet must contain zero @keyframes blocks",
      );
    });

    it("freezes !important declarations in entry stylesheet strictly at zero", () => {
      const content = readStylesheet(ENTRY_STYLESHEET_PATH);
      const count = countImportantDeclarations(content);
      assert.equal(
        count,
        BASELINE_CEILINGS.GLOBALS_IMPORTANT_DECLARATIONS,
        `entry stylesheet must contain 0 !important declarations, found: ${count}`,
      );
    });

    it("freezes class-substring selectors in entry stylesheet strictly at zero", () => {
      const content = readStylesheet(ENTRY_STYLESHEET_PATH);
      const count = countClassSubstringSelectors(content);
      assert.equal(
        count,
        BASELINE_CEILINGS.GLOBALS_CLASS_SUBSTRING_SELECTORS,
        `entry stylesheet must contain 0 class-substring selectors, found: ${count}`,
      );
    });
  });

  describe("graph resolution and import health", () => {
    it("verifies that all imported stylesheets in entry manifest exist on disk", () => {
      const directives = getImportDirectives(ENTRY_STYLESHEET_PATH);

      for (const directive of directives) {
        if (directive.includes("tailwindcss")) continue;

        const match = directive.match(/@import\s+["'](.*?)["'];/);
        assert.ok(match, `Invalid @import directive syntax: "${directive}"`);

        const relativePath = match[1];
        const targetPath = resolve(dirname(ENTRY_STYLESHEET_PATH), relativePath);

        assert.ok(
          statSync(targetPath).isFile(),
          `Imported stylesheet does not exist on disk: "${relativePath}" (resolved to: "${targetPath}")`,
        );
      }
    });

    it("enforces that no stylesheet is imported more than once in entry manifest", () => {
      const directives = getImportDirectives(ENTRY_STYLESHEET_PATH);
      const seen = new Set();
      const duplicates = [];

      for (const directive of directives) {
        if (seen.has(directive)) {
          duplicates.push(directive);
        }
        seen.add(directive);
      }

      assert.deepEqual(
        duplicates,
        [],
        `Duplicate @import directives found in entry manifest: ${duplicates.join(", ")}`,
      );
      assert.equal(directives.length, CANONICAL_IMPORT_MANIFEST.length);
    });

    it("enforces that no leaf stylesheet in src/styles/ contains nested @import directives", () => {
      const allStyleFiles = findCssFilesInDirectory(STYLES_DIR);
      const violatingFiles = [];

      for (const filePath of allStyleFiles) {
        const content = readStylesheet(filePath);
        const stripped = stripCssComments(content);
        if (/@import\b/.test(stripped)) {
          violatingFiles.push(relative(FRONTEND_DIR, filePath));
        }
      }

      assert.deepEqual(
        violatingFiles,
        [],
        `Leaf stylesheets must not contain @import directives (all imports must be centrally declared in entry manifest): ${violatingFiles.join(", ")}`,
      );
    });

    it("verifies that all stylesheets in src/styles/ are registered in entry manifest (no orphaned files)", () => {
      const allStyleFiles = findCssFilesInDirectory(STYLES_DIR).map(f => resolve(f));
      const directives = getImportDirectives(ENTRY_STYLESHEET_PATH);

      const importedTargets = new Set();
      for (const directive of directives) {
        if (directive.includes("tailwindcss")) continue;
        const match = directive.match(/@import\s+["'](.*?)["'];/);
        if (match) {
          importedTargets.add(resolve(dirname(ENTRY_STYLESHEET_PATH), match[1]));
        }
      }

      const unimportedFiles = allStyleFiles
        .filter(f => !importedTargets.has(f))
        .map(f => relative(FRONTEND_DIR, f));

      assert.deepEqual(
        unimportedFiles,
        [],
        `Orphaned stylesheet files found in src/styles/ that are not imported in entry manifest: ${unimportedFiles.join(", ")}`,
      );
      assert.equal(allStyleFiles.length, 51, "Expected exactly 51 modular stylesheets in src/styles/");
    });

    it("verifies that the resolved stylesheet graph contains exactly 52 unique files without cycles", () => {
      clearStylesheetCache();
      const files = getAppStylesheetGraphFiles();

      assert.equal(files.length, 52, "Graph must contain 52 files (entry manifest + 51 modular stylesheets)");
      assert.equal(new Set(files).size, 52, "Graph files must all be distinct");
      assert.ok(files[0].endsWith(".css") && files[0].includes("globals"), "Entry file must be globals entrypoint");
    });
  });

  describe("cascade ordering and layer hierarchy", () => {
    it("enforces that Tailwind source configuration is the very first directive", () => {
      const directives = getImportDirectives(ENTRY_STYLESHEET_PATH);
      assert.equal(
        directives[0],
        '@import "tailwindcss" source("../");',
        "Tailwind source import must be the first directive in entry manifest",
      );
    });

    it("strictly validates the complete documented @import cascade manifest", () => {
      const directives = getImportDirectives(ENTRY_STYLESHEET_PATH);
      assert.deepEqual(
        directives,
        CANONICAL_IMPORT_MANIFEST,
        "Import manifest in entry file deviates from canonical cascade sequence",
      );
    });

    it("enforces that foundation styles precede all component, shell, and panel stylesheets", () => {
      const directives = getImportDirectives(ENTRY_STYLESHEET_PATH);

      const firstComponentIndex = directives.findIndex(d =>
        d.includes("/map/") ||
        d.includes("/shell/") ||
        d.includes("/station/") ||
        d.includes("/panels/"),
      );

      assert.ok(
        firstComponentIndex > 0,
        "Component stylesheets must exist in the import manifest",
      );
      assert.ok(
        firstComponentIndex > 5,
        "Initial foundation stylesheets (fonts, tokens, reset, themes, accessibility) must precede components",
      );
    });

    it("enforces that high-contrast overrides follow the base components they override", () => {
      const directives = getImportDirectives(ENTRY_STYLESHEET_PATH);

      const highContrastIndex = directives.findIndex(d => d.includes("high-contrast.css"));
      const shellIndex = directives.findIndex(d => d.includes("dashboard-shell.css"));
      const stationDetailIndex = directives.findIndex(d => d.includes("station-detail.css"));

      assert.ok(highContrastIndex > shellIndex, "high-contrast.css must follow dashboard-shell.css");
      assert.ok(highContrastIndex > stationDetailIndex, "high-contrast.css must follow station-detail.css");
    });
  });

  describe("keyframe hygiene and uniqueness", () => {
    it("enforces that no duplicate @keyframes names exist across the application stylesheet graph", () => {
      clearStylesheetCache();
      const graphCss = stripCssComments(readAppStylesheetGraph({ forceRefresh: true }));
      const keyframeNames = [...graphCss.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/g)].map(m => m[1]);
      const counts = new Map();
      const duplicates = [];

      for (const name of keyframeNames) {
        const current = (counts.get(name) || 0) + 1;
        counts.set(name, current);
        if (current === 2) {
          duplicates.push(name);
        }
      }

      assert.deepEqual(
        duplicates,
        [],
        `Duplicate @keyframes names detected across the stylesheet graph: ${duplicates.join(", ")}`,
      );
      assert.equal(keyframeNames.length, 99, "Expected exactly 99 unique @keyframes definitions across graph");
    });
  });

  describe("technical debt migration ceilings", () => {
    it("enforces that graph-wide !important declarations do not exceed the migration ceiling", () => {
      clearStylesheetCache();
      const graphCss = readAppStylesheetGraph();
      const count = countImportantDeclarations(graphCss);

      assert.ok(
        count <= BASELINE_CEILINGS.GRAPH_IMPORTANT_DECLARATIONS,
        `Graph !important count (${count}) exceeded recorded ceiling (${BASELINE_CEILINGS.GRAPH_IMPORTANT_DECLARATIONS})`,
      );
      assert.equal(
        count,
        BASELINE_CEILINGS.GRAPH_IMPORTANT_DECLARATIONS,
        "Graph !important count should match baseline ceiling in S15F",
      );
    });

    it("enforces that graph-wide class-substring selectors do not exceed the migration ceiling", () => {
      clearStylesheetCache();
      const graphCss = readAppStylesheetGraph();
      const count = countClassSubstringSelectors(graphCss);

      assert.ok(
        count <= BASELINE_CEILINGS.GRAPH_CLASS_SUBSTRING_SELECTORS,
        `Graph class-substring selector count (${count}) exceeded recorded ceiling (${BASELINE_CEILINGS.GRAPH_CLASS_SUBSTRING_SELECTORS})`,
      );
      assert.equal(
        count,
        BASELINE_CEILINGS.GRAPH_CLASS_SUBSTRING_SELECTORS,
        "Graph class-substring selector count should match ceiling in S13A",
      );
    });

    it("enforces that total authored CSS !important declarations across all src/ files do not exceed ceiling", () => {
      const allCssFiles = findCssFilesInDirectory(SRC_DIR);
      let totalImportants = 0;

      for (const file of allCssFiles) {
        const content = readStylesheet(file);
        totalImportants += countImportantDeclarations(content);
      }

      assert.ok(
        totalImportants <= BASELINE_CEILINGS.GRAPH_IMPORTANT_DECLARATIONS,
        `Total authored CSS !important count (${totalImportants}) exceeded ceiling (${BASELINE_CEILINGS.GRAPH_IMPORTANT_DECLARATIONS})`,
      );
    });

    it("enforces that total authored CSS class-substring selectors across all src/ files do not exceed ceiling", () => {
      const allCssFiles = findCssFilesInDirectory(SRC_DIR);
      let totalClassSubstrings = 0;

      for (const file of allCssFiles) {
        const content = readStylesheet(file);
        totalClassSubstrings += countClassSubstringSelectors(content);
      }

      assert.ok(
        totalClassSubstrings <= BASELINE_CEILINGS.GRAPH_CLASS_SUBSTRING_SELECTORS,
        `Total authored CSS class-substring selector count (${totalClassSubstrings}) exceeded ceiling (${BASELINE_CEILINGS.GRAPH_CLASS_SUBSTRING_SELECTORS})`,
      );
    });
  });
});
