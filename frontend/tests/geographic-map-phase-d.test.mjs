import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  REGIONAL_GEOGRAPHIC_BOUNDS,
  REGIONAL_GEOGRAPHIC_CENTER,
  REGIONAL_GEOGRAPHIC_DEFAULT_ZOOM,
  REGIONAL_LINE_COLORS,
  ALL_LINE_COLORS,
  IMPACT_COLORS,
  REGIONAL_MAJOR_STATIONS,
  REGIONAL_GEOGRAPHIC_ATTRIBUTION,
  getCatalogUrl,
  getGeographicBounds,
  getGeographicCenter,
  getGeographicDefaultZoom,
  getGeographicAttribution,
} from "../src/app/geographic-config.ts";

import {
  partitionCatalogFeatures,
  getStationCoordinates,
  getLinkCoordinates,
  getSegmentMidpoint,
  getImpactColor,
  getImpactPriority,
  getLineStationIds,
  isLinkInStationSpan,
  projectImpactedLinks,
  projectImpactedStations,
  projectImpactBadges,
  projectCommutePreview,
  getSelectionBounds,
} from "../src/app/geographic-overlays.ts";

import {
  saveGeographicMapViewport,
  readGeographicMapViewport,
} from "../src/app/map-viewport-preference.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    get size() {
      return store.size;
    },
  };
}

const regionalCatalogPath = path.resolve(
  __dirname,
  "../public/assets/linewatch/geographic/regional-catalog.json",
);
const regionalCatalog = JSON.parse(fs.readFileSync(regionalCatalogPath, "utf8"));

const ttcCatalogPath = path.resolve(
  __dirname,
  "../public/assets/linewatch/geographic/ttc-catalog.json",
);
const ttcCatalog = JSON.parse(fs.readFileSync(ttcCatalogPath, "utf8"));

test("Regional geographic configuration & seam invariants", async (t) => {
  await t.test("regional bounds encompass full Greater Golden Horseshoe extent", () => {
    const [[west, south], [east, north]] = REGIONAL_GEOGRAPHIC_BOUNDS;
    assert.ok(west <= -80.97, "West bound must include Stratford (-80.97)");
    assert.ok(south <= 43.11, "South bound must include Niagara Falls (43.11)");
    assert.ok(east >= -78.88, "East bound must include Oshawa (-78.88)");
    assert.ok(north >= 44.37, "North bound must include Barrie (44.37)");
  });

  await t.test("regional center and default zoom are well-calibrated", () => {
    assert.equal(REGIONAL_GEOGRAPHIC_CENTER[0], -79.60);
    assert.equal(REGIONAL_GEOGRAPHIC_CENTER[1], 43.68);
    assert.equal(REGIONAL_GEOGRAPHIC_DEFAULT_ZOOM, 9.0);
  });

  await t.test("regional line colors cover all 8 corridors", () => {
    const expectedRoutes = [
      "regional-br",
      "regional-ki",
      "regional-le",
      "regional-lw",
      "regional-mi",
      "regional-rh",
      "regional-st",
      "regional-up",
    ];
    for (const routeId of expectedRoutes) {
      assert.ok(REGIONAL_LINE_COLORS[routeId], `Missing color for ${routeId}`);
      assert.ok(ALL_LINE_COLORS[routeId], `Missing ALL_LINE_COLORS entry for ${routeId}`);
    }
  });

  await t.test("attribution discloses Metrolinx for regional data", () => {
    assert.equal(REGIONAL_GEOGRAPHIC_ATTRIBUTION, getGeographicAttribution("regional"));
    const regionalAttr = getGeographicAttribution("regional");
    assert.ok(regionalAttr.includes("Metrolinx"));
    assert.ok(regionalAttr.includes("OpenFreeMap"));
    assert.ok(regionalAttr.includes("OpenStreetMap"));

    const ttcAttr = getGeographicAttribution("ttc");
    assert.ok(ttcAttr.includes("City of Toronto"));
  });

  await t.test("impact colors define expected palette for TTC and Regional", () => {
    assert.equal(IMPACT_COLORS.suspension, "#ef4444");
    assert.equal(IMPACT_COLORS.delayRegional, "#0ea5e9");
    assert.equal(IMPACT_COLORS.delayTtc, "#f59e0b");
    assert.equal(IMPACT_COLORS.plannedClosure, "#3b82f6");
    assert.equal(IMPACT_COLORS.reducedSpeedZone, "#d97706");
  });

  await t.test("network-aware configuration helpers dispatch correctly", () => {
    assert.equal(getCatalogUrl("regional"), "/assets/linewatch/geographic/regional-catalog.json");
    assert.equal(getCatalogUrl("ttc"), "/assets/linewatch/geographic/ttc-catalog.json");
    assert.deepEqual(getGeographicBounds("regional"), REGIONAL_GEOGRAPHIC_BOUNDS);
    assert.deepEqual(getGeographicCenter("regional"), REGIONAL_GEOGRAPHIC_CENTER);
    assert.equal(getGeographicDefaultZoom("regional"), 9.0);
    assert.equal(getGeographicDefaultZoom("ttc"), 11.2);
  });

  await t.test("major terminal stations set contains expected transfer hubs", () => {
    const expectedHubs = ["union", "kitchener", "allandale-waterfront", "niagara-falls", "pearson-airport"];
    for (const hub of expectedHubs) {
      assert.ok(REGIONAL_MAJOR_STATIONS.has(hub), `Missing hub ${hub}`);
    }
  });
});

test("Regional camera persistence & independent network viewports", async (t) => {
  await t.test("persists separate cameras for TTC and Regional", () => {
    const storage = createMockStorage();

    saveGeographicMapViewport(storage, "ttc", { lng: -79.38, lat: 43.68, zoom: 12 });
    saveGeographicMapViewport(storage, "regional", { lng: -79.60, lat: 43.70, zoom: 9.5 });

    const ttcCamera = readGeographicMapViewport(storage, "ttc");
    const regCamera = readGeographicMapViewport(storage, "regional");

    assert.equal(ttcCamera.zoom, 12);
    assert.equal(regCamera.zoom, 9.5);
    assert.equal(regCamera.lng, -79.60);
  });
});

test("Regional catalog partitioning & coordinate lookup", async (t) => {
  await t.test("partitions regional catalog into links and stations", () => {
    const { links, stations } = partitionCatalogFeatures(regionalCatalog);
    assert.ok(links.features.length > 0, "Expected link features");
    assert.ok(stations.features.length > 0, "Expected station features");
    assert.equal(links.type, "FeatureCollection");
    assert.equal(stations.type, "FeatureCollection");
  });

  await t.test("retrieves verified coordinates for regional stations", () => {
    const unionCoords = getStationCoordinates(regionalCatalog, "union");
    assert.ok(unionCoords);
    assert.ok(Math.abs(unionCoords[0] - -79.38) < 0.05);
    assert.ok(Math.abs(unionCoords[1] - 43.64) < 0.05);

    const kitchenerCoords = getStationCoordinates(regionalCatalog, "kitchener");
    assert.ok(kitchenerCoords);
    assert.ok(Math.abs(kitchenerCoords[0] - -80.48) < 0.05);

    const pearsonCoords = getStationCoordinates(regionalCatalog, "pearson-airport");
    assert.ok(pearsonCoords);
    assert.ok(Math.abs(pearsonCoords[0] - -79.61) < 0.05);
  });

  await t.test("retrieves link coordinates for regional segment ID", () => {
    const coords = getLinkCoordinates(regionalCatalog, "segment-br-aurora-newmarket");
    assert.ok(coords && coords.length > 2);
    assert.ok(Array.isArray(coords[0]));
  });
});

test("Boundary 2: Segment midpoint calculation", async (t) => {
  await t.test("calculates accurate midpoint of straight line", () => {
    const line = [[0, 0], [10, 0]];
    const mid = getSegmentMidpoint(line);
    assert.deepEqual(mid, [5, 0]);
  });

  await t.test("calculates accurate midpoint along multi-point polyline", () => {
    const polyline = [
      [0, 0],
      [4, 0],
      [4, 6],
    ];
    // Total length = 4 + 6 = 10. Half distance = 5.
    // 4 units on first leg, 1 unit into second leg: [4, 1].
    const mid = getSegmentMidpoint(polyline);
    assert.equal(mid[0], 4);
    assert.equal(mid[1], 1);
  });
});

test("Boundary 2: Station span and route resolution", async (t) => {
  await t.test("identifies links within a multi-station span", () => {
    const line1Stations = getLineStationIds("ttc", "line-1");
    assert.ok(line1Stations.length > 20);

    // Bloor-Yonge to Rosedale is adjacent on Line 1
    const inSpan = isLinkInStationSpan("bloor-yonge", "rosedale", "queen", "eglinton", line1Stations);
    assert.equal(inSpan, true);

    // Finch to North York Centre is outside Queen-Eglinton span
    const outOfSpan = isLinkInStationSpan("finch", "north-york-centre", "queen", "eglinton", line1Stations);
    assert.equal(outOfSpan, false);
  });

  await t.test("resolves regional line station sequences", () => {
    const brStations = getLineStationIds("regional", "regional-br");
    assert.ok(brStations.includes("union"));
    assert.ok(brStations.includes("allandale-waterfront"));
    assert.equal(brStations[0], "union");
  });
});

test("Boundary 2: Live disruption & alert projection", async (t) => {
  await t.test("impact priority order matches specification", () => {
    assert.ok(getImpactPriority("suspension") > getImpactPriority("delay"));
    assert.ok(getImpactPriority("delay") > getImpactPriority("planned-closure"));
    assert.ok(getImpactPriority("planned-closure") > getImpactPriority("reduced-speed-zone"));
  });

  await t.test("canonical impact colors match diagram styling", () => {
    assert.equal(getImpactColor("suspension", "ttc"), "#ef4444");
    assert.equal(getImpactColor("suspension", "regional"), "#ef4444");
    assert.equal(getImpactColor("delay", "regional"), "#0ea5e9");
    assert.equal(getImpactColor("delay", "ttc"), "#f59e0b");
    assert.equal(getImpactColor("planned-closure"), "#3b82f6");
    assert.equal(getImpactColor("reduced-speed-zone"), "#d97706");
  });

  await t.test("projects active segment delays onto regional catalog links", () => {
    const mockSegments = [
      {
        id: "segment-br-aurora-newmarket",
        lineId: "regional-br",
        label: "Aurora to Newmarket",
        overlay: "delay",
        impacts: [
          {
            kind: "delay",
            cardId: "delay-br-1",
            travelDirection: "forward",
            sourceAlertIds: ["alt-1"],
          },
        ],
      },
    ];

    const projected = projectImpactedLinks(regionalCatalog, mockSegments, "regional");
    assert.equal(projected.type, "FeatureCollection");
    assert.equal(projected.features.length, 1);

    const feat = projected.features[0];
    assert.equal(feat.properties.segmentId, "segment-br-aurora-newmarket");
    assert.equal(feat.properties.impactKind, "delay");
    assert.equal(feat.properties.impactColor, "#0ea5e9");
    assert.equal(feat.properties.impactCardId, "delay-br-1");
  });

  await t.test("projects multi-station span closure onto TTC catalog links", () => {
    const mockSegments = [
      {
        id: "line-1-bloor-yonge-st-clair",
        lineId: "line-1",
        label: "Bloor-Yonge to St. Clair",
        stationAId: "bloor-yonge",
        stationBId: "st-clair",
        overlay: "suspension",
        impacts: [
          {
            kind: "suspension",
            cardId: "susp-1",
            travelDirection: "bidirectional",
            sourceAlertIds: ["alert-close"],
          },
        ],
      },
    ];

    const projected = projectImpactedLinks(ttcCatalog, mockSegments, "ttc");
    assert.ok(projected.features.length >= 3, "Should project multiple links between Bloor-Yonge and St. Clair");
    assert.ok(projected.features.every((f) => f.properties.impactKind === "suspension"));
    assert.ok(projected.features.every((f) => f.properties.impactColor === "#ef4444"));
  });

  await t.test("projects station node impacts onto catalog stations", () => {
    const mockStationImpacts = [
      {
        stationId: "union",
        kind: "delay",
        cardId: "sta-delay-1",
        title: "Union Station Track Delay",
      },
    ];

    const projected = projectImpactedStations(regionalCatalog, mockStationImpacts, "regional");
    assert.equal(projected.features.length, 1);
    assert.equal(projected.features[0].properties.stationId, "union");
    assert.equal(projected.features[0].properties.impactKind, "delay");
    assert.equal(projected.features[0].properties.impactColor, "#0ea5e9");
  });

  await t.test("projects disruption badges at segment midpoints", () => {
    const mockSegments = [
      {
        id: "segment-br-aurora-newmarket",
        lineId: "regional-br",
        label: "Aurora to Newmarket",
        overlay: "delay",
        impacts: [
          { kind: "delay", cardId: "d1", travelDirection: "forward", sourceAlertIds: ["1"] },
          { kind: "delay", cardId: "d2", travelDirection: "forward", sourceAlertIds: ["2"] },
        ],
      },
    ];

    const impactedLinks = projectImpactedLinks(regionalCatalog, mockSegments, "regional");
    const badges = projectImpactBadges(regionalCatalog, impactedLinks.features, [], "regional");

    assert.equal(badges.features.length, 1);
    const badge = badges.features[0];
    assert.equal(badge.properties.targetType, "segment");
    assert.equal(badge.properties.targetId, "segment-br-aurora-newmarket");
    assert.equal(badge.properties.count, 2);
    assert.equal(badge.properties.label, "2");
  });
});

test("Boundary 2: Commute preview projection", async (t) => {
  await t.test("projects commute preview links and origin/destination stations", () => {
    const preview = {
      id: "commute-1",
      commuteId: "c1",
      legId: "outbound",
      label: "Morning Commute",
      routeLabel: "Barrie Line to Union",
      stationIds: ["aurora", "newmarket"],
      segmentIds: ["segment-br-aurora-newmarket"],
    };

    const result = projectCommutePreview(regionalCatalog, preview);
    assert.equal(result.links.features.length, 1);
    assert.equal(result.stations.features.length, 2);

    assert.equal(result.stations.features[0].properties.isOrigin, true);
    assert.equal(result.stations.features[1].properties.isDestination, true);
  });

  await t.test("returns empty feature collections when commute preview is null", () => {
    const result = projectCommutePreview(regionalCatalog, null);
    assert.equal(result.links.features.length, 0);
    assert.equal(result.stations.features.length, 0);
  });
});

test("Boundary 2: Selection bounds calculation", async (t) => {
  await t.test("computes valid bounding box for an impacted segment selection", () => {
    const mockSegments = [
      {
        id: "segment-br-aurora-newmarket",
        lineId: "regional-br",
        label: "Aurora to Newmarket",
        overlay: "delay",
        impacts: [{ kind: "delay", cardId: "alert-focus", travelDirection: "forward", sourceAlertIds: [] }],
      },
    ];

    const bounds = getSelectionBounds(
      regionalCatalog,
      { kind: "delay", id: "alert-focus" },
      mockSegments,
      [],
    );

    assert.ok(bounds);
    const [[west, south], [east, north]] = bounds;
    assert.ok(west < east);
    assert.ok(south < north);
  });

  await t.test("returns null when selection does not match any coordinates", () => {
    const bounds = getSelectionBounds(
      regionalCatalog,
      { kind: "delay", id: "non-existent-alert" },
      [],
      [],
    );
    assert.equal(bounds, null);
  });
});

test("NetworkMap dispatch parity for Regional network", async (t) => {
  await t.test("NetworkMap source code renders GeographicNetworkMap when isGeographic is true for regional", () => {
    const networkMapPath = path.resolve(__dirname, "../src/components/NetworkMap.tsx");
    const content = fs.readFileSync(networkMapPath, "utf8");

    assert.ok(content.includes("if (isGeographic) {"));
    assert.ok(content.includes("<GeographicNetworkMap"));
    assert.ok(content.includes("network={network}"));
    assert.ok(content.includes("selection={props.selection}"));
    assert.ok(content.includes("onSelectImpact={props.onSelectImpact}"));
    assert.ok(content.includes("commutePathPreview={props.commutePathPreview}"));
  });
});
