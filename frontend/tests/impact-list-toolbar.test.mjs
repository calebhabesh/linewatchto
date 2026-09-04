import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const toolbarSource = readFileSync(new URL("../src/components/ImpactListToolbar.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

describe("impact list toolbar", () => {
  it("labels transit line filters with a numbered route badge and line name", () => {
    assert.match(toolbarSource, /import \{ TransitLineBadge \} from "\.\/TransitLineBadge"/);
    assert.match(toolbarSource, /Yonge-University/);
    assert.match(toolbarSource, /Bloor-Danforth/);
    assert.match(toolbarSource, /Kitchener/);
    assert.match(toolbarSource, /UP Express/);
    assert.match(toolbarSource, /option\.lineId/);
  });

  it("left-aligns dropdown menus on mobile while retaining the desktop sort edge case", () => {
    assert.match(globalCss, /\.impact-list-select-control\s*\{[^}]*display:\s*inline-flex;/s);
    assert.match(globalCss, /@media \(min-width: 768px\)[\s\S]*?impact-list-select-control:last-child[\s\S]*?right:\s*0;/);
    assert.match(globalCss, /@media \(max-width: 767px\)[\s\S]*?saved-commute-sort-options\.impact-list-select-options[\s\S]*?left:\s*0;[\s\S]*?right:\s*auto;/);
  });

  it("keeps search bar and sort dropdown side-by-side on mobile for transit line submenus", () => {
    assert.match(
      globalCss,
      /@media \(max-width: 767px\)[\s\S]*?\.line-impacts-panel \.impact-list-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;/s,
    );
    assert.match(
      globalCss,
      /@media \(max-width: 767px\)[\s\S]*?\.line-impacts-panel \.impact-list-selects \.saved-commute-sort-options\.impact-list-select-options\s*\{[^}]*left:\s*auto;[^}]*right:\s*0;/s,
    );
  });
});
