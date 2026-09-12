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

  it("reduces bottom padding on panel headers with metadata to balance spacing between badges and search bar", () => {
    assert.match(
      globalCss,
      /\.floating-panel-shell \.panel-heading:has\(\.panel-header-metadata\)[\s\S]*?padding-bottom:\s*0;/s,
    );
    assert.match(
      globalCss,
      /\.panel-header--has-metadata\s*\{[^}]*padding-bottom:\s*0;/s,
    );
  });

  it("aligns spacing between the toolbar console and cards across desktop and mobile", () => {
    assert.match(
      globalCss,
      /\.impact-list-toolbar \+ \.alert-stack,\s*\.impact-list-toolbar \+ \.closure-stack,\s*\.impact-list-toolbar \+ \.line-impact-panel-stack\s*\{[^}]*padding-top:\s*6px;/s,
    );
    assert.match(
      globalCss,
      /\.floating-panel-shell \.impact-list-toolbar \+ \.alert-stack,\s*\.floating-panel-shell \.impact-list-toolbar \+ \.closure-stack,\s*\.floating-panel-shell \.impact-list-toolbar \+ \.line-impact-panel-stack\s*\{[^}]*padding-top:\s*6px;/s,
    );
  });

  it("enlarges count badge and source badge on desktop panel header metadata while preserving mobile compact dimensions and vertical padding", () => {
    // Desktop: 12px font size, 26px height, 0 10px padding for count badges and source tags
    assert.match(
      globalCss,
      /\.panel-header-metadata \.rsz-count-badge[\s\S]*?\.panel-header-metadata \.card-source\s*\{[^}]*font-size:\s*12px;[^}]*height:\s*26px;[^}]*padding:\s*0 10px;/s,
    );
    // Dark mode source badge readability
    assert.match(
      globalCss,
      /\.dark \.panel-header-metadata \.card-source\s*\{[^}]*color:\s*#cbd5e1;/s,
    );
    // Mobile retains compact 10px / 22px height
    assert.match(
      globalCss,
      /@media \(max-width: 767px\)[\s\S]*?\.floating-panel-shell \.panel-header-metadata \.card-source\s*\{[^}]*font-size:\s*10px;[^}]*height:\s*22px;[^}]*padding:\s*0 8px;/s,
    );
    // Preserves 6px top margin on metadata container (producing 10px gap with 4px header gap)
    assert.match(
      globalCss,
      /\.panel-header-metadata\s*\{[^}]*margin:\s*6px 0 0;/s,
    );
  });
});
