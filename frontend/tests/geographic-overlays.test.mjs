import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
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

const ttcCatalogUrl = new URL("../public/assets/linewatch/geographic/ttc-catalog.json", import.meta.url);
const regionalCatalogUrl = new URL("../public/assets/linewatch/geographic/regional-catalog.json", import.meta.url);

const ttcCatalog = JSON.parse(readFileSync(ttcCatalogUrl, "utf8"));
const regionalCatalog = JSON.parse(readFileSync(regionalCatalogUrl, "utf8"));

describe("geographic overlays: catalog partitioning & coordinates", () => {
  it("partitions catalog features into links and stations", () => {
    const { links, stations } = partitionCatalogFeatures(regionalCatalog);
    assert.ok(links.features.length > 0, "Expected link features");
    assert.ok(stations.features.length > 0, "Expected station features");
    assert.equal(links.type, "FeatureCollection");
    assert.equal(stations.type, "FeatureCollection");
  });

  it("retrieves verified coordinates for regional and TTC stations", () => {
    const unionCoords = getStationCoordinates(regionalCatalog, "union");
    assert.ok(unionCoords);
    assert.ok(Math.abs(unionCoords[0] - -79.38) < 0.05);
    assert.ok(Math.abs(unionCoords[1] - 43.64) < 0.05);

    const kitchenerCoords = getStationCoordinates(regionalCatalog, "kitchener");
    assert.ok(kitchenerCoords);
    assert.ok(Math.abs(kitchenerCoords[0] - -80.48) < 0.05);

    const bloorYonge = getStationCoordinates(ttcCatalog, "bloor-yonge");
    assert.ok(bloorYonge);
    assert.ok(Math.abs(bloorYonge[0] - -79.38) < 0.05);
    assert.ok(Math.abs(bloorYonge[1] - 43.67) < 0.05);

    assert.equal(getStationCoordinates(regionalCatalog, "nonexistent-station"), null);
  });

  it("retrieves link coordinates for catalog segment ID", () => {
    const coords = getLinkCoordinates(regionalCatalog, "segment-br-aurora-newmarket");
    assert.ok(coords && coords.length > 2);
    assert.ok(Array.isArray(coords[0]));
    assert.equal(getLinkCoordinates(regionalCatalog, "invalid-segment"), null);
  });
});

describe("geographic overlays: geometry math & midpoints", () => {
  it("calculates accurate midpoint of straight line", () => {
    const line = [[0, 0], [10, 0]];
    const mid = getSegmentMidpoint(line);
    assert.deepEqual(mid, [5, 0]);
  });

  it("calculates accurate midpoint along multi-point polyline", () => {
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

describe("geographic overlays: route resolution & station spans", () => {
  it("identifies links within a multi-station span on TTC Line 1", () => {
    const line1Stations = getLineStationIds("ttc", "line-1");
    assert.ok(line1Stations.length > 20);

    // Bloor-Yonge to Rosedale is adjacent on Line 1
    const inSpan = isLinkInStationSpan("bloor-yonge", "rosedale", "queen", "eglinton", line1Stations);
    assert.equal(inSpan, true);

    // Finch to North York Centre is outside Queen-Eglinton span
    const outOfSpan = isLinkInStationSpan("finch", "north-york-centre", "queen", "eglinton", line1Stations);
    assert.equal(outOfSpan, false);
  });

  it("resolves regional line station sequences", () => {
    const brStations = getLineStationIds("regional", "regional-br");
    assert.ok(brStations.includes("union"));
    assert.ok(brStations.includes("allandale-waterfront"));
    assert.equal(brStations[0], "union");
  });
});

describe("geographic overlays: live disruption & alert projection", () => {
  it("maintains canonical impact priority order", () => {
    assert.ok(getImpactPriority("suspension") > getImpactPriority("delay"));
    assert.ok(getImpactPriority("delay") > getImpactPriority("planned-closure"));
    assert.ok(getImpactPriority("reduced-speed-zone") > getImpactPriority("planned-closure"));
  });

  it("returns canonical impact colors matching network styling", () => {
    assert.equal(getImpactColor("suspension", "ttc"), "#ef4444");
    assert.equal(getImpactColor("suspension", "regional"), "#ef4444");
    assert.equal(getImpactColor("delay", "regional"), "#0ea5e9");
    assert.equal(getImpactColor("delay", "ttc"), "#f59e0b");
    assert.equal(getImpactColor("planned-closure"), "#3b82f6");
    assert.equal(getImpactColor("reduced-speed-zone"), "#d97706");
  });

  it("projects active segment delays onto regional catalog links", () => {
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

  it("projects multi-station span closure onto TTC catalog links", () => {
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

  it("projects station node impacts onto catalog stations", () => {
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

  it("projects disruption badges at segment midpoints", () => {
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
    assert.equal(badge.properties.label, "D");
  });
});

describe("geographic overlays: commute preview & selection bounds", () => {
  it("projects commute preview links and origin/destination stations", () => {
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

  it("returns empty feature collections when commute preview is null", () => {
    const result = projectCommutePreview(regionalCatalog, null);
    assert.equal(result.links.features.length, 0);
    assert.equal(result.stations.features.length, 0);
  });

  it("computes valid bounding box for an impacted segment selection", () => {
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

  it("computes valid bounding box for a single station impact selection with padding", () => {
    const mockStationImpacts = [
      {
        stationId: "bloor-yonge",
        kind: "delay",
        cardId: "bloor-delay-1",
        title: "Bloor-Yonge Crowd Delay",
      },
    ];

    const bounds = getSelectionBounds(
      ttcCatalog,
      { kind: "delay", id: "bloor-delay-1" },
      [],
      mockStationImpacts,
    );

    assert.ok(bounds, "Must compute padded bounds for station-only impact");
    const [[west, south], [east, north]] = bounds;
    assert.ok(west < east);
    assert.ok(south < north);
  });

  it("returns null when selection does not match any coordinates", () => {
    const bounds = getSelectionBounds(
      regionalCatalog,
      { kind: "delay", id: "unknown-alert-id" },
      [],
      [],
    );
    assert.equal(bounds, null);
  });
});
