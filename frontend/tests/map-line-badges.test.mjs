import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import catalog from "../public/assets/linewatch/geographic/ttc-catalog.json" with { type: "json" };
import regionalCatalog from "../public/assets/linewatch/geographic/regional-catalog.json" with { type: "json" };
import {
  GEOGRAPHIC_LINE_BADGE_HIDDEN_ZOOM,
  REGIONAL_GEOGRAPHIC_LINE_BADGE_ANCHORS,
  SYSTEM_LINE_BADGE_FULL_SCALE,
  SYSTEM_LINE_BADGE_HALF_SCALE,
  SYSTEM_LINE_BADGE_HIDDEN_SCALE,
  TTC_GEOGRAPHIC_LINE_BADGE_ANCHORS,
  projectGeographicLineBadges,
  systemLineBadgeOpacity,
} from "../src/app/map-line-badges.ts";

const frontendRoot = fileURLToPath(new URL("..", import.meta.url));

describe("map line badges", () => {
  it("projects reviewed TTC anchors, including both Line 1 arms, without guessing missing stations", () => {
    const badges = projectGeographicLineBadges(catalog);
    assert.equal(badges.features.length, TTC_GEOGRAPHIC_LINE_BADGE_ANCHORS.length);
    assert.deepEqual(
      new Set(badges.features.map((feature) => feature.properties.lineId)),
      new Set(["line-1", "line-2", "line-4", "line-5", "line-6"]),
    );
    assert.ok(badges.features.some((feature) => feature.properties.anchorId === "line-1-vmc"));
    assert.ok(badges.features.some((feature) => feature.properties.anchorId === "line-1-finch"));
    assert.ok(badges.features.some((feature) => feature.properties.anchorId === "line-1-union"));

    const withoutFinch = {
      ...catalog,
      features: catalog.features.filter((feature) => feature.properties.stationId !== "finch"),
    };
    assert.equal(
      projectGeographicLineBadges(withoutFinch).features.length,
      TTC_GEOGRAPHIC_LINE_BADGE_ANCHORS.length - 1,
    );
  });

  it("projects a badge for every regional corridor at reviewed topology anchors", () => {
    const badges = projectGeographicLineBadges(regionalCatalog);
    assert.equal(badges.features.length, REGIONAL_GEOGRAPHIC_LINE_BADGE_ANCHORS.length);
    assert.deepEqual(
      new Set(badges.features.map((feature) => feature.properties.lineId)),
      new Set([
        "regional-br",
        "regional-ki",
        "regional-le",
        "regional-lw",
        "regional-mi",
        "regional-rh",
        "regional-st",
        "regional-up",
      ]),
    );
    assert.equal(
      badges.features.filter((feature) => feature.properties.lineId === "regional-lw").length,
      3,
    );

    const withoutPearson = {
      ...regionalCatalog,
      features: regionalCatalog.features.filter(
        (feature) => feature.properties.stationId !== "pearson-airport",
      ),
    };
    assert.equal(
      projectGeographicLineBadges(withoutPearson).features.length,
      REGIONAL_GEOGRAPHIC_LINE_BADGE_ANCHORS.length - 1,
    );
  });

  it("uses the calibrated system-map fade points", () => {
    assert.equal(systemLineBadgeOpacity(SYSTEM_LINE_BADGE_FULL_SCALE), 1);
    assert.equal(systemLineBadgeOpacity(SYSTEM_LINE_BADGE_HALF_SCALE), 0.5);
    assert.equal(systemLineBadgeOpacity(SYSTEM_LINE_BADGE_HIDDEN_SCALE), 0);
    assert.equal(systemLineBadgeOpacity(1.35), 0.75);
    assert.ok(Math.abs(systemLineBadgeOpacity(2.1) - 0.25) < 1e-10);
  });

  it("keeps geographic badges decorative and releases collision space at detail zoom", async () => {
    const source = await readFile(`${frontendRoot}/src/components/GeographicNetworkMap.tsx`, "utf8");
    const layerStart = source.indexOf('id: "transit-line-badges"');
    const layerEnd = source.indexOf("function applyDynamicDataAndFilters", layerStart);
    const layer = source.slice(layerStart, layerEnd);
    const listenerSection = source.slice(source.indexOf("map.on(\"click\""));

    assert.ok(layerStart > -1);
    assert.match(layer, /maxzoom: GEOGRAPHIC_LINE_BADGE_HIDDEN_ZOOM/);
    assert.equal(GEOGRAPHIC_LINE_BADGE_HIDDEN_ZOOM, 14);
    assert.match(layer, /"icon-allow-overlap": false/);
    assert.match(layer, /"icon-ignore-placement": false/);
    assert.doesNotMatch(listenerSection, /map\.on\([^\n]*transit-line-badges/);
    assert.match(source, /REGIONAL_ROUTE_DEFINITIONS\.map\(\(route\) =>/);
  });

  it("separates authored badges from labels, stations, and track artwork", async () => {
    const [preload, map, generator] = await Promise.all([
      readFile(`${frontendRoot}/src/app/map-preload.ts`, "utf8"),
      readFile(`${frontendRoot}/src/components/InteractiveTtcMap.tsx`, "utf8"),
      readFile(`${frontendRoot}/scripts/generate-map-rasters.mjs`, "utf8"),
    ]);
    assert.match(preload, /badges: serializeLayers\("ttc-map-line-badges-root", \[\s*"ttc-line-badges-layer"/);
    assert.doesNotMatch(
      preload.match(/part2: serializeLayers[\s\S]*?\]\),/)?.[0] ?? "",
      /ttc-line-badges-layer/,
    );
    assert.match(generator, /foregroundCss:[\s\S]*?#ttc-line-badges-layer/);
    assert.match(generator, /badgesCss:[\s\S]*?#ttc-stations-layer,[\s\S]*?opacity: 0 !important/);
    assert.match(generator, /plane === "badges" \|\| theme === "light"/);
    assert.match(map, /plane="badges"[\s\S]*?style=\{\{ opacity: lineBadgeOpacity \}\}/);
    assert.match(map, /pointerEvents="none"[\s\S]*?svgParts\?\.badges/);
  });
});
