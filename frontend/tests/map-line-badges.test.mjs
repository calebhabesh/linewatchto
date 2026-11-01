import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import catalog from "../public/assets/linewatch/geographic/ttc-catalog.json" with { type: "json" };
import regionalCatalog from "../public/assets/linewatch/geographic/regional-catalog.json" with { type: "json" };
import {
  GEOGRAPHIC_LINE_BADGE_HIDDEN_ZOOM,
  REGIONAL_GEOGRAPHIC_LINE_BADGE_ANCHORS,
  TTC_GEOGRAPHIC_LINE_BADGE_ANCHORS,
  projectGeographicLineBadges,
  geographicRouteOffsetPixels,
  projectGeographicLineBreadcrumbs,
  projectGeographicLinePaths,
} from "../src/app/map-line-badges.ts";
import { readTtcMapSource } from "./helpers/map-source.mjs";

const frontendRoot = fileURLToPath(new URL("..", import.meta.url));

describe("map line badges", () => {
  it("shifts UP and KI either side of their shared track by one table, which their breadcrumbs follow", () => {
    assert.equal(geographicRouteOffsetPixels("regional-up", 10), 0);
    assert.equal(geographicRouteOffsetPixels("regional-up", 13), 3);
    assert.equal(geographicRouteOffsetPixels("regional-ki", 14.5), -4);
    assert.equal(geographicRouteOffsetPixels("regional-ki", 18), -5);
    assert.equal(geographicRouteOffsetPixels("line-1", 15), 0);
  });

  it("spaces Map View breadcrumbs evenly per zoom level, with UP alternating with KI on their shared track", () => {
    const breadcrumbs = projectGeographicLineBreadcrumbs(regionalCatalog).features;
    const at = (lineId, level) => breadcrumbs.filter((feature) => feature.properties.lineId === lineId && feature.properties.level === level);
    // Each level doubles the last one's points along a line.
    const ki = [0, 1, 2, 3].map((level) => at("regional-ki", level).length);
    for (let level = 1; level < ki.length; level += 1) assert.ok(Math.abs(ki[level] - 2 * ki[level - 1]) <= 1, JSON.stringify(ki));
    // Near Weston and Mount Dennis (shared track), UP's badges fall between KI's, never on them.
    const metres = ([lngA, latA], [lngB, latB]) => Math.hypot((lngB - lngA) * Math.cos(latA * Math.PI / 180), latB - latA) * 111195;
    const near = (feature) => metres(feature.geometry.coordinates, [-79.5, 43.69]) < 4000;
    const level = 5;
    const kiPoints = at("regional-ki", level).filter(near);
    const upPoints = at("regional-up", level).filter(near);
    assert.ok(kiPoints.length > 1 && upPoints.length > 1, `${kiPoints.length} KI and ${upPoints.length} UP near Weston`);
    const spacing = metres(kiPoints[0].geometry.coordinates, kiPoints[1].geometry.coordinates);
    for (const up of upPoints) {
      const closest = Math.min(...kiPoints.map((point) => metres(point.geometry.coordinates, up.geometry.coordinates)));
      assert.ok(closest > spacing / 4, `UP badge ${Math.round(closest)} m from a KI badge (spacing ${Math.round(spacing)} m)`);
    }
  });

  it("joins each line's links into continuous paths for Map View breadcrumbs", () => {
    const count = (paths) => {
      const perLine = {};
      for (const feature of paths.features) perLine[feature.properties.lineId] = (perLine[feature.properties.lineId] ?? 0) + 1;
      return perLine;
    };
    // Every TTC line is one path (Line 1's U included); GO/UP's only branch is Lakeshore West's Niagara arm.
    assert.deepEqual(count(projectGeographicLinePaths(catalog)), { "line-1": 1, "line-2": 1, "line-4": 1, "line-5": 1, "line-6": 1 });
    const regional = count(projectGeographicLinePaths(regionalCatalog));
    assert.equal(regional["regional-lw"], 2);
    assert.ok(Object.entries(regional).every(([lineId, paths]) => lineId === "regional-lw" || paths === 1));
    // A joined path keeps every link's points once: Line 2 spans Kipling to Kennedy.
    const links = catalog.features.filter((feature) => feature.geometry.type === "LineString" && feature.properties.lineId === "line-2");
    const [line2] = projectGeographicLinePaths(catalog).features.filter((feature) => feature.properties.lineId === "line-2");
    assert.equal(line2.geometry.coordinates.length, links.reduce((sum, link) => sum + link.geometry.coordinates.length - 1, 1));
  });

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

  it("keeps geographic badges decorative and releases collision space at detail zoom", async () => {
    const [operationsSource, mapSource] = await Promise.all([
      readFile(`${frontendRoot}/src/components/geographic-map-operations.ts`, "utf8"),
      readFile(`${frontendRoot}/src/components/GeographicNetworkMap.tsx`, "utf8"),
    ]);
    const layerStart = operationsSource.indexOf('id: "transit-line-badges"');
    const layerEnd = operationsSource.indexOf("}", operationsSource.indexOf("map.addLayer(", layerStart));
    const layer = operationsSource.slice(layerStart, layerEnd + 10);
    const listenerSection = mapSource.slice(mapSource.indexOf("map.on(\"click\""));

    assert.ok(layerStart > -1);
    assert.match(layer, /maxzoom: GEOGRAPHIC_LINE_BADGE_HIDDEN_ZOOM/);
    assert.equal(GEOGRAPHIC_LINE_BADGE_HIDDEN_ZOOM, 14);
    assert.match(layer, /"icon-allow-overlap": false/);
    assert.match(layer, /"icon-ignore-placement": false/);
    assert.doesNotMatch(listenerSection, /map\.on\([^\n]*transit-line-badges/);
    assert.match(operationsSource, /REGIONAL_ROUTE_DEFINITIONS\.map\(\(route\) =>/);
  });

  it("separates authored badges from labels, stations, and track artwork without fading them", async () => {
    const [ttcSvg, map, generator] = await Promise.all([
      readFile(`${frontendRoot}/public/assets/linewatch/ttc-subway-map-custom.svg`, "utf8"),
      Promise.resolve(readTtcMapSource()),
      readFile(`${frontendRoot}/scripts/generate-map-rasters.mjs`, "utf8"),
    ]);
    // The authored badges are a layer of the artwork; once the rasters are
    // ready they paint from their own plane, under the live overlays.
    assert.match(ttcSvg, /id="ttc-line-badges-layer"/);
    assert.match(generator, /foregroundCss:[\s\S]*?#ttc-line-badges-layer/);
    assert.match(generator, /badgesCss:[\s\S]*?#ttc-stations-layer,[\s\S]*?opacity: 0 !important/);
    assert.match(generator, /plane === "badges" \|\| theme === "light"/);
    assert.match(map, /const UNDER_PLANES: readonly RasterMapPlaneName\[\] = \["background", "badges"\];/);
    assert.match(map, /\{underPlanes\.map\(renderRasterPlane\)\}[\s\S]*?<AuthoredArtwork[\s\S]*?className=\{`raster-map-dynamic-plane map-overlay-plane/);
    assert.doesNotMatch(map, /systemLineBadgeOpacity|lineBadgeOpacity/);
  });
});
