import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const css = readAppStylesheet();
const badge = readFileSync(new URL("../src/components/OverlappingCountBadge.tsx", import.meta.url), "utf8");
const mapBadge = readFileSync(new URL("../src/components/MapOverlapIndicator.tsx", import.meta.url), "utf8");
const regionalMap = readFileSync(new URL("../src/components/InteractiveRegionalMap.tsx", import.meta.url), "utf8");
const ttcMap = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const mobileNav = readFileSync(new URL("../src/components/MobileBottomNav.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const stationOutageBadge = readFileSync(new URL("../src/components/StationOutageBadge.tsx", import.meta.url), "utf8");
const stationDetail = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");

describe("overlapping count badge sizing", () => {
  it("renders the count in an SVG coordinate system instead of live HTML text", () => {
    assert.match(badge, /<svg[\s\S]*viewBox=/);
    assert.match(badge, /<text[\s\S]*dominantBaseline="central"[\s\S]*textAnchor="middle"/);
    assert.match(badge, /const viewBoxWidth = Math\.max\(9, label\.length \* 7 \+ 2\)/);
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

  it("preserves circular 1:1 aspect ratio for single digits and expands for multi-digit counts", () => {
    assert.match(badge, /data-count-digits=\{label\.length\}/);
    assert.match(badge, /data-single-digit=\{isSingleDigit \? "true" : "false"\}/);
    assert.match(badge, /"--overlapping-count-viewbox-width": viewBoxWidth/);
    assert.match(
      css,
      /\.overlapping-count-badge\[data-single-digit="true"\]\s*\{(?=[^}]*aspect-ratio:\s*1\s*\/\s*1;)(?=[^}]*padding-left:\s*0\s*!important;)(?=[^}]*padding-right:\s*0\s*!important;)[^}]*\}/s,
    );
    assert.match(
      css,
      /\.mobile-bottom-nav-badge\[data-single-digit="true"\]\s*\{(?=[^}]*padding:\s*0;)(?=[^}]*width:\s*21px;)[^}]*\}/s,
    );
    assert.match(
      css,
      /\.desktop-menu-count-badge\[data-single-digit="true"\]\s*\{(?=[^}]*padding-left:\s*0\s*!important;)(?=[^}]*padding-right:\s*0\s*!important;)(?=[^}]*width:\s*28px;)[^}]*\}/s,
    );
    assert.match(
      css,
      /\.station-access-outage-count\[data-single-digit="true"\]\s*\{(?=[^}]*padding:\s*0;)(?=[^}]*width:\s*20px;)[^}]*\}/s,
    );
    assert.match(
      css,
      /\.station-search-outage-count\[data-single-digit="true"\]\s*\{(?=[^}]*padding:\s*0;)(?=[^}]*width:\s*20px;)[^}]*\}/s,
    );
  });

  it("renders shared TTC and GO/UP map counts as vector geometry without live glyph text", () => {
    assert.match(ttcMap, /<MapOverlapIndicator/);
    assert.match(regionalMap, /<MapOverlapIndicator/);
    assert.match(mapBadge, /function MapBadgeVectorLabel/);
    assert.match(mapBadge, /MAP_BADGE_GLYPH_OUTLINES/);
    assert.match(mapBadge, /Fixed Inter Black outlines/);
    assert.match(mapBadge, /className="overlap-indicator-vector-label"/);
    assert.doesNotMatch(mapBadge, /<text(?:\s|>)/);
    assert.match(css, /\.overlap-indicator-vector-label\s*\{[^}]*fill:\s*#ffffff;/s);
    assert.doesNotMatch(css, /\.overlap-indicator-count-text/);
  });
});
