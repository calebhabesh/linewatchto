import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheetGraph, stripCssComments } from "./helpers/stylesheet-graph.mjs";

// Plan 11 phase 4: changes that made Chromium restyle the whole map or the
// whole document on an ordinary interaction.
const css = stripCssComments(readAppStylesheetGraph());
const selectors = [...css.matchAll(/([^{}]+)\{/g)]
  .flatMap((match) => match[1].split(","))
  .map((selector) => selector.trim())
  .filter((selector) => selector && !selector.startsWith("@"));

describe("style invalidation guardrails", () => {
  it("never tests the class attribute before a combinator", () => {
    // `[class*="divide-"] > *` made any class change on any element restyle
    // its whole subtree (the shell's inspector classes restyled the page).
    const offenders = selectors.filter((selector) => /\[class[*^$~|]?=[^\]]*\]\s*(?:[>+~]|\s)\s*\S/.test(selector));
    assert.deepEqual(offenders, []);
  });

  it("changes the inherited cursor on the map only for fine pointers", () => {
    // A touch press set `cursor` on the viewport and restyled every element under it.
    const source = readFileSync(new URL("../src/styles/map/base-map.css", import.meta.url), "utf8");
    const outsideFinePointer = source.replace(/@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\n\}/g, "");
    assert.doesNotMatch(stripCssComments(outsideFinePointer), /(system-map-viewport|map-stage)[^{]*\{[^}]*cursor:\s*grabbing/);
  });

  it("pins the shell's inline custom properties on the map stage", () => {
    // Each one changes on sheet, inspector or viewport changes; unpinned, it restyles the whole map.
    const stage = css.match(/(?:^|\})\s*\.map-stage\s*\{([^}]*)\}/)?.[1] ?? "";
    const pinned = new Set([...stage.matchAll(/(--[\w-]+):\s*initial/g)].map((match) => match[1]));
    const written = [
      "../src/components/LineWatchShell.tsx",
      "../src/components/MobileStatusPeek.tsx",
      "../src/components/MobileImpactInspector.tsx",
      "../src/components/MobileLegend.tsx",
    ].flatMap((path) => [...readFileSync(new URL(path, import.meta.url), "utf8")
      .matchAll(/(?:setProperty\(\s*|["'])(--(?:mobile-(?:station-sheet|status-peek|impact-inspector|map-legend)|visual-|rotated-map-)[\w-]*)/g)]
      .map((match) => match[1]));
    const heightProperty = "--mobile-impact-inspector-total-height";
    const missing = [...new Set([...written, heightProperty, "--panel", "--mobile-inspector-height", "--mobile-inspector-total-height"])]
      .filter((name) => !pinned.has(name));
    assert.deepEqual(missing, []);
  });
});
