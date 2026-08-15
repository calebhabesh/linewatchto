import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const badge = readFileSync(new URL("../src/components/OverlappingCountBadge.tsx", import.meta.url), "utf8");
const mobileNav = readFileSync(new URL("../src/components/MobileBottomNav.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const stationOutageBadge = readFileSync(new URL("../src/components/StationOutageBadge.tsx", import.meta.url), "utf8");
const stationDetail = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");

describe("overlapping count badge sizing", () => {
  it("renders the count in an SVG coordinate system instead of live HTML text", () => {
    assert.match(badge, /<svg[\s\S]*viewBox=/);
    assert.match(badge, /<text[\s\S]*dominantBaseline="central"[\s\S]*textAnchor="middle"/);
    assert.match(badge, /const viewBoxWidth = Math\.max\(7, label\.length \* 5\.5 \+ 1\)/);
  });

  it("keeps the SVG glyph clipped to the stable badge box", () => {
    assert.match(
      css,
      /\.overlapping-count-badge\s*\{(?=[^}]*-webkit-text-size-adjust:\s*none;)(?=[^}]*font-size:\s*0\s*!important;)(?=[^}]*overflow:\s*hidden;)(?=[^}]*text-size-adjust:\s*none;)[^}]*\}/s,
    );
    assert.match(css, /\.overlapping-count-badge__svg\s*\{(?=[^}]*height:\s*100%;)(?=[^}]*overflow:\s*hidden;)(?=[^}]*width:\s*auto;)[^}]*\}/s);
    assert.match(css, /\.overlapping-count-badge__text\s*\{(?=[^}]*font-size:\s*var\(--overlapping-count-font-size\);)(?=[^}]*font-weight:\s*900;)[^}]*\}/s);
  });

  it("hardens the mobile nav, desktop menu, and icon-overlap counters", () => {
    assert.match(mobileNav, /<OverlappingCountBadge className="mobile-bottom-nav-badge" count=\{badge\}/);
    assert.match(shell, /<OverlappingCountBadge[\s\S]*className="desktop-menu-count-badge absolute/);
    assert.match(stationOutageBadge, /<OverlappingCountBadge className="station-search-outage-count" count=\{count\}/);
    assert.match(stationDetail, /<OverlappingCountBadge className="station-access-outage-count" count=\{count\}/);
  });
});
