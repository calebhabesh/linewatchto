import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const mobileNav = readFileSync(new URL("../src/components/MobileBottomNav.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const stationOutageBadge = readFileSync(new URL("../src/components/StationOutageBadge.tsx", import.meta.url), "utf8");
const stationDetail = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");

describe("overlapping count badge sizing", () => {
  it("disables browser text inflation at the document boundary", () => {
    assert.match(css, /html\s*\{(?=[^}]*-webkit-text-size-adjust:\s*100%;)(?=[^}]*text-size-adjust:\s*100%;)[^}]*\}/s);
  });

  it("keeps overlapping numeric glyphs inside a stable line box", () => {
    assert.match(
      css,
      /\.overlapping-count-badge\s*\{(?=[^}]*-webkit-text-size-adjust:\s*100%;)(?=[^}]*font-variant-numeric:\s*tabular-nums;)(?=[^}]*line-height:\s*1\s*!important;)(?=[^}]*overflow:\s*hidden;)(?=[^}]*text-size-adjust:\s*100%;)(?=[^}]*white-space:\s*nowrap;)[^}]*\}/s,
    );
  });

  it("hardens the mobile nav, desktop menu, and icon-overlap counters", () => {
    assert.match(mobileNav, /mobile-bottom-nav-badge overlapping-count-badge/);
    assert.match(shell, /overlapping-count-badge absolute -top-1\.5 -right-1\.5/);
    assert.match(stationOutageBadge, /station-search-outage-count overlapping-count-badge/);
    assert.match(stationDetail, /station-access-outage-count overlapping-count-badge/);
  });
});
