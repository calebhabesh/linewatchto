import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  regionalGuideRoutes,
  regionalGuideStations,
  stationsForGuideRoute,
  transitGuideSitemapPages,
  ttcGuideRoutes,
  ttcGuideStations,
} from "../src/app/transit-guide-data.ts";

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("crawlable transit guides", () => {
  const guideComponents = source("../src/app/(transit-guides)/transit-guide-components.tsx");
  const guideData = source("../src/app/transit-guide-data.ts");
  const guideLayout = source("../src/app/(transit-guides)/layout.tsx");
  const sitemap = source("../src/app/sitemap.ts");
  const nextConfig = source("../next.config.ts");

  it("keeps the information pages server-only and connects them with crawlable links", () => {
    assert.doesNotMatch(guideComponents, /["']use client["']/);
    assert.doesNotMatch(guideLayout, /["']use client["']/);
    assert.match(guideLayout, /href="\/explore"/);
    assert.match(guideLayout, /href="\/ttc"/);
    assert.match(guideLayout, /href="\/go-up"/);
    assert.match(guideComponents, /href={stationGuidePath\(station\)}/);
    assert.match(guideComponents, /href={routeGuidePath\(route\)}/);
    assert.match(nextConfig, /staticGuideSources/);
    assert.match(nextConfig, /max-age=300, s-maxage=86400, stale-while-revalidate=604800/);
  });

  it("generates network, line, corridor, station, and reliability sitemap entries", () => {
    assert.match(guideData, /path:\s*"\/explore"/);
    assert.match(guideData, /path:\s*"\/ttc\/reliability"/);
    assert.match(guideData, /path:\s*"\/go-up\/reliability"/);
    assert.match(guideData, /routeGuidePath\(route\)/);
    assert.match(guideData, /stationGuidePath\(station\)/);
    assert.match(sitemap, /transitGuideSitemapPages\(\)/);

    const pages = transitGuideSitemapPages();
    const paths = pages.map((page) => page.path);
    assert.equal(ttcGuideRoutes.length, 5);
    assert.equal(regionalGuideRoutes.length, 8);
    assert.equal(ttcGuideStations.length, 109);
    assert.equal(regionalGuideStations.length, 72);
    assert.equal(paths.length, 200);
    assert.equal(new Set(paths).size, paths.length, "sitemap paths must be unique");
    assert.ok(paths.includes("/ttc/stations/greenwood"));
    assert.ok(paths.includes("/ttc/stations/o-connor"));
    assert.ok(paths.includes("/go-up/corridors/lakeshore-west"));
    assert.ok(paths.every((path) => !path.includes("greenwoood") && !path.includes("_")));

    for (const route of [...ttcGuideRoutes, ...regionalGuideRoutes]) {
      assert.equal(stationsForGuideRoute(route).length, route.stationIds.length);
    }
  });

  it("statically generates bounded detail routes with unique metadata", () => {
    const detailPages = [
      "../src/app/(transit-guides)/ttc/lines/[lineSlug]/page.tsx",
      "../src/app/(transit-guides)/ttc/stations/[stationSlug]/page.tsx",
      "../src/app/(transit-guides)/go-up/corridors/[corridorSlug]/page.tsx",
      "../src/app/(transit-guides)/go-up/stations/[stationSlug]/page.tsx",
    ].map(source);

    for (const page of detailPages) {
      assert.match(page, /dynamicParams\s*=\s*false/);
      assert.match(page, /generateStaticParams/);
      assert.match(page, /generateMetadata/);
      assert.match(page, /buildTransitGuideMetadata/);
      assert.doesNotMatch(page, /["']use client["']/);
    }
  });

  it("deep-links guide visitors into the existing interactive dashboard", () => {
    const shell = source("../src/components/LineWatchShell.tsx");
    const mobileMore = source("../src/components/MobileMoreSheet.tsx");

    assert.match(guideComponents, /station:\s*station\.id/);
    assert.match(shell, /params\.get\("station"\)/);
    assert.match(shell, /requestedStationId/);
    assert.match(shell, /href="\/explore"/);
    assert.match(mobileMore, /href="\/explore"/);
  });

  it("labels static references separately from current source-freshness checks", () => {
    assert.match(guideComponents, /Static guide pages explain the mapped network; they are not a current service guarantee/);
    assert.match(guideComponents, /reviewed station-map attributes, not current facility-operation guarantees/);
    assert.match(guideComponents, /only presents supported current information when ingestion is fresh/);
  });
});
