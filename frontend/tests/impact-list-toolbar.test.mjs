import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const toolbarSource = readFileSync(new URL("../src/components/ImpactListToolbar.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("impact list toolbar", () => {
  it("labels transit line filters with a numbered route badge and line name", () => {
    assert.match(toolbarSource, /import Image from "next\/image"/);
    assert.match(toolbarSource, /Yonge-University/);
    assert.match(toolbarSource, /Bloor-Danforth/);
    assert.match(toolbarSource, /line-1-legend\.svg/);
    assert.match(toolbarSource, /impact-list-line-badge/);
    assert.match(toolbarSource, /option\.lineId/);
  });

  it("left-aligns dropdown menus on mobile while retaining the desktop sort edge case", () => {
    assert.match(globalCss, /@media \(min-width: 768px\)[\s\S]*?impact-list-select-control:last-child[\s\S]*?right:\s*0;/);
    assert.match(globalCss, /@media \(max-width: 767px\)[\s\S]*?saved-commute-sort-options\.impact-list-select-options[\s\S]*?left:\s*0;[\s\S]*?right:\s*auto;/);
  });
});
