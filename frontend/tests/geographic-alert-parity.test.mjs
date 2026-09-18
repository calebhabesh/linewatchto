import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getEligiblePlannedClosures,
  normalizeActiveClosureMapImpact,
  countUniqueImpactsByKind,
  getImpactPriority,
} from "../src/app/map-alert-selector.ts";

import {
  projectImpactedLinks,
  projectImpactedStations,
  projectImpactBadges,
  getSelectionBounds,
  getProjectedSelectionBounds,
  getProjectedImpactGroup,
} from "../src/app/geographic-overlays.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ttcCatalogPath = path.resolve(
  __dirname,
  "../public/assets/linewatch/geographic/ttc-catalog.json",
);
const ttcCatalog = JSON.parse(fs.readFileSync(ttcCatalogPath, "utf8"));

test("Session 2: Shared pure semantic alert selector", async (t) => {
  await t.test("deduplicates active-now planned closure parent from previews", () => {
    const plannedClosures = [
      {
        id: "closure-active-1",
        lineId: "line-1",
        lineNumber: "1",
        title: "Weekend Track Maintenance",
        location: "St Clair to Eglinton",
        dates: "Saturday & Sunday",
        activeNow: true,
        previewSegmentIds: ["segment-line-1-st-clair-davisville"],
      },
      {
        id: "closure-upcoming-2",
        lineId: "line-2",
        lineNumber: "2",
        title: "Upcoming Signal Upgrades",
        location: "Broadview to Woodbine",
        dates: "Next Saturday",
        activeNow: false,
        timingStatus: "upcoming",
        previewSegmentIds: ["segment-line-2-broadview-chester"],
      },
    ];

    const activeAlerts = [
      {
        id: "alert-susp-1",
        lineId: "line-1",
        title: "Line 1 Closed for Track Work",
        severity: "suspension",
        relatedPlannedClosureId: "closure-active-1",
      },
    ];

    const {
      currentPlannedClosureIds,
      overlapPlannedClosures,
      eligiblePlannedClosures,
      activeClosureImpactCardIds,
    } = getEligiblePlannedClosures(plannedClosures, activeAlerts);

    assert.ok(currentPlannedClosureIds.has("closure-active-1"));
    assert.equal(currentPlannedClosureIds.has("closure-upcoming-2"), false);

    assert.equal(overlapPlannedClosures.length, 1);
    assert.equal(overlapPlannedClosures[0].id, "closure-upcoming-2");

    assert.equal(eligiblePlannedClosures.length, 1);
    assert.equal(eligiblePlannedClosures[0].id, "closure-upcoming-2");

    // Card ID mapping maps active closure parent to active alert child
    assert.equal(activeClosureImpactCardIds.get("closure-active-1"), "alert-susp-1");
  });

  await t.test("retains active planned closure in eligible previews if explicitly selected", () => {
    const plannedClosures = [
      {
        id: "closure-active-1",
        lineId: "line-1",
        lineNumber: "1",
        title: "Weekend Track Maintenance",
        location: "St Clair to Eglinton",
        dates: "Saturday & Sunday",
        activeNow: true,
        previewSegmentIds: ["segment-line-1-st-clair-davisville"],
      },
    ];

    const { eligiblePlannedClosures } = getEligiblePlannedClosures(
      plannedClosures,
      [],
      { kind: "planned-closure", id: "closure-active-1" },
    );

    assert.equal(eligiblePlannedClosures.length, 1);
    assert.equal(eligiblePlannedClosures[0].id, "closure-active-1");
  });

  await t.test("priority ordering follows suspension > delay > planned-closure > RSZ", () => {
    assert.ok(getImpactPriority("suspension") > getImpactPriority("delay"));
    assert.ok(getImpactPriority("delay") > getImpactPriority("planned-closure"));
    assert.ok(getImpactPriority("planned-closure") > getImpactPriority("reduced-speed-zone"));
    assert.ok(getImpactPriority("reduced-speed-zone") > getImpactPriority("clear"));
  });

  await t.test("normalizes active closure segment impacts to suspensions pointing to active alert", () => {
    const cardIds = new Map([["closure-1", "alert-active-1"]]);
    const normalized = normalizeActiveClosureMapImpact(
      {
        kind: "planned-closure",
        cardId: "closure-1",
        travelDirection: "bidirectional",
        sourceAlertIds: ["closure-1"],
      },
      cardIds,
    );

    assert.equal(normalized.kind, "suspension");
    assert.equal(normalized.cardId, "alert-active-1");
    assert.deepEqual(normalized.sourceAlertIds, ["alert-active-1"]);
  });

  await t.test("counts unique logical impacts per kind ignoring duplicate input rows", () => {
    const duplicateRows = [
      { kind: "delay", cardId: "delay-1" },
      { kind: "delay", cardId: "delay-1" }, // duplicate row
      { kind: "delay", cardId: "delay-2" },
      { kind: "suspension", cardId: "susp-1" },
    ];

    const kindCounts = countUniqueImpactsByKind(duplicateRows);
    assert.equal(kindCounts.length, 2);
    assert.equal(kindCounts[0].kind, "suspension");
    assert.equal(kindCounts[0].count, 1);
    assert.equal(kindCounts[1].kind, "delay");
    assert.equal(kindCounts[1].count, 2);
  });
});

test("Session 2: Planned closure preview projection parity", async (t) => {
  await t.test("projects upcoming planned closures onto geographic catalog links with blue dashed styling", () => {
    const plannedClosures = [
      {
        id: "closure-bloor-stclair",
        lineId: "line-1",
        lineNumber: "1",
        title: "Weekend Closure",
        location: "Bloor-Yonge to St. Clair",
        dates: "Saturday",
        activeNow: false,
        timingStatus: "upcoming",
        previewSegmentIds: [
          "segment-line-1-bloor-yonge-rosedale",
          "segment-line-1-rosedale-summerhill",
          "segment-line-1-summerhill-st-clair",
        ],
      },
    ];

    const projected = projectImpactedLinks(
      ttcCatalog,
      [],
      "ttc",
      { plannedClosures },
    );

    assert.ok(projected.features.length >= 3, "Should project all 3 links in the preview span");
    for (const feat of projected.features) {
      assert.equal(feat.properties.impactKind, "planned-closure");
      assert.equal(feat.properties.impactColor, "#3b82f6");
      assert.equal(feat.properties.isDashed, true);
      assert.equal(feat.properties.impactCardId, "closure-bloor-stclair");
      assert.ok(feat.properties.allCardIds.includes("closure-bloor-stclair"));
    }
  });

  await t.test("keeps the 'C' type glyph and exposes a separate deduplicated count", () => {
    const plannedClosures = [
      {
        id: "closure-preview-1",
        lineId: "line-1",
        lineNumber: "1",
        title: "Night Closure",
        location: "Bloor to Rosedale",
        dates: "Tonight",
        activeNow: false,
        timingStatus: "upcoming",
        previewSegmentIds: ["line-1-bloor-yonge-rosedale"],
      },
    ];

    const projectedLinks = projectImpactedLinks(
      ttcCatalog,
      [],
      "ttc",
      { plannedClosures },
    );
    const badges = projectImpactBadges(ttcCatalog, projectedLinks.features, [], "ttc");

    assert.ok(badges.features.length >= 1);
    const badge = badges.features.find((b) => b.properties.targetId === "line-1-bloor-yonge-rosedale");
    assert.ok(badge);
    assert.equal(badge.properties.impactKind, "planned-closure");
    assert.equal(badge.properties.impactColor, "#3b82f6");
    assert.equal(badge.properties.label, "C");
    assert.equal(badge.properties.count, 1);
  });
});

test("Session 2: Overlap hierarchy, stroke layering & secondary selection", async (t) => {
  await t.test("primary stroke adopts highest priority impact while retaining all card IDs", () => {
    const segments = [
      {
        id: "line-1-bloor-yonge-rosedale",
        lineId: "line-1",
        label: "Bloor-Yonge to Rosedale",
        impacts: [
          { kind: "reduced-speed-zone", cardId: "rsz-1", travelDirection: "bidirectional", sourceAlertIds: ["rsz-1"] },
          { kind: "delay", cardId: "delay-1", travelDirection: "bidirectional", sourceAlertIds: ["delay-1"] },
          { kind: "suspension", cardId: "susp-1", travelDirection: "bidirectional", sourceAlertIds: ["susp-1"] },
        ],
      },
    ];

    const projected = projectImpactedLinks(ttcCatalog, segments, "ttc");
    const linkFeature = projected.features.find(
      (f) => f.properties.segmentId === "line-1-bloor-yonge-rosedale",
    );
    assert.ok(linkFeature);

    // Primary stroke must be suspension (red, not dashed)
    assert.equal(linkFeature.properties.impactKind, "suspension");
    assert.equal(linkFeature.properties.impactColor, "#ef4444");
    assert.equal(linkFeature.properties.impactCardId, "susp-1");
    assert.equal(linkFeature.properties.isDashed, false);
    assert.equal(linkFeature.properties.impactCount, 3);

    // allCardIds must contain all three card IDs for selection matching
    assert.ok(linkFeature.properties.allCardIds.includes("susp-1"));
    assert.ok(linkFeature.properties.allCardIds.includes("delay-1"));
    assert.ok(linkFeature.properties.allCardIds.includes("rsz-1"));
  });

  await t.test("produces multiple distinct per-kind badges along polyline for overlapping kinds", () => {
    const segments = [
      {
        id: "line-1-bloor-yonge-rosedale",
        lineId: "line-1",
        label: "Bloor-Yonge to Rosedale",
        impacts: [
          { kind: "delay", cardId: "delay-1", travelDirection: "bidirectional", sourceAlertIds: [] },
          { kind: "suspension", cardId: "susp-1", travelDirection: "bidirectional", sourceAlertIds: [] },
        ],
      },
    ];

    const projectedLinks = projectImpactedLinks(ttcCatalog, segments, "ttc");
    const badges = projectImpactBadges(ttcCatalog, projectedLinks.features, [], "ttc");

    const linkBadges = badges.features.filter(
      (b) => b.properties.targetId === "line-1-bloor-yonge-rosedale",
    );

    // Must have 2 separate badges: 1 for suspension and 1 for delay
    assert.equal(linkBadges.length, 2);

    const suspBadge = linkBadges.find((b) => b.properties.impactKind === "suspension");
    const delayBadge = linkBadges.find((b) => b.properties.impactKind === "delay");

    assert.ok(suspBadge);
    assert.equal(suspBadge.properties.label, "!");
    assert.equal(suspBadge.properties.impactColor, "#ef4444");

    assert.ok(delayBadge);
    assert.equal(delayBadge.properties.label, "D");
    assert.equal(delayBadge.properties.impactColor, "#f59e0b");

    // Coordinates must differ along polyline fractions
    assert.notDeepEqual(suspBadge.geometry.coordinates, delayBadge.geometry.coordinates);
  });

  await t.test("secondary selection bounds correctly resolves coordinates for hidden impact", () => {
    const segments = [
      {
        id: "line-1-bloor-yonge-rosedale",
        lineId: "line-1",
        label: "Bloor-Yonge to Rosedale",
        impacts: [
          { kind: "suspension", cardId: "primary-susp-1", travelDirection: "bidirectional", sourceAlertIds: [] },
          { kind: "delay", cardId: "secondary-delay-2", travelDirection: "bidirectional", sourceAlertIds: [] },
        ],
      },
    ];

    // Select the secondary delay
    const bounds = getSelectionBounds(
      ttcCatalog,
      { kind: "delay", id: "secondary-delay-2" },
      segments,
      [],
    );

    assert.ok(bounds, "Must compute valid camera bounds for secondary impact");
    const [[west, south], [east, north]] = bounds;
    assert.ok(west < east);
    assert.ok(south < north);
  });

  await t.test("camera bounds follow rendered overlay identity, including indirect source IDs", () => {
    const segments = [{
      id: "line-1-bloor-yonge-rosedale",
      lineId: "line-1",
      label: "Bloor-Yonge to Rosedale",
      impacts: [{
        kind: "reduced-speed-zone",
        cardId: "grouped-rsz-card",
        sourceAlertIds: ["sidebar-rsz-id"],
        travelDirection: "forward",
      }],
    }];
    const projected = projectImpactedLinks(ttcCatalog, segments, "ttc");
    const bounds = getProjectedSelectionBounds(
      { kind: "reduced-speed-zone", id: "sidebar-rsz-id" },
      projected.features,
      [],
    );

    assert.ok(bounds, "A rendered indirect alert ID must produce camera bounds");
    assert.ok(bounds[0][0] < bounds[1][0]);
    assert.ok(bounds[0][1] < bounds[1][1]);
  });

  await t.test("contiguous links with the same overlap set share one per-kind chooser badge", () => {
    const sharedImpacts = [
      { kind: "delay", cardId: "delay-a", travelDirection: "forward", sourceAlertIds: [] },
      { kind: "delay", cardId: "delay-b", travelDirection: "reverse", sourceAlertIds: [] },
      { kind: "reduced-speed-zone", cardId: "rsz-a", travelDirection: "forward", sourceAlertIds: [] },
    ];
    const segments = [
      {
        id: "line-1-bloor-yonge-rosedale",
        lineId: "line-1",
        label: "Bloor-Yonge to Rosedale",
        impacts: sharedImpacts,
      },
      {
        id: "line-1-rosedale-summerhill",
        lineId: "line-1",
        label: "Rosedale to Summerhill",
        impacts: sharedImpacts,
      },
    ];
    const projected = projectImpactedLinks(ttcCatalog, segments, "ttc");
    const badges = projectImpactBadges(ttcCatalog, projected.features, [], "ttc");

    assert.equal(badges.features.length, 2, "The contiguous overlap group should have one badge per kind");
    const delayBadge = badges.features.find((badge) => badge.properties.impactKind === "delay");
    assert.ok(delayBadge);
    assert.equal(delayBadge.properties.label, "D", "The type icon stays visible instead of becoming a bare number");
    assert.equal(delayBadge.properties.count, 2);
    assert.deepEqual(delayBadge.properties.allCardIds.sort(), ["delay-a", "delay-b"]);
  });

  await t.test("geographic overlap groups expose every distinct chooser option", () => {
    const segments = [{
      id: "line-1-bloor-yonge-rosedale",
      lineId: "line-1",
      label: "Bloor-Yonge to Rosedale",
      impacts: [
        { kind: "suspension", cardId: "susp-1", travelDirection: "forward", sourceAlertIds: [] },
        { kind: "delay", cardId: "delay-1", travelDirection: "reverse", sourceAlertIds: [] },
        { kind: "delay", cardId: "delay-2", travelDirection: "forward", sourceAlertIds: [] },
      ],
    }];
    const projected = projectImpactedLinks(ttcCatalog, segments, "ttc");
    const group = getProjectedImpactGroup("segment", "line-1-bloor-yonge-rosedale", projected.features, []);

    assert.ok(group);
    assert.deepEqual(
      group.impacts.map((impact) => `${impact.kind}:${impact.cardId}`).sort(),
      ["delay:delay-1", "delay:delay-2", "suspension:susp-1"],
    );
  });
});

test("Session 2: Station-only service impacts and interchange isolation", async (t) => {
  await t.test("station-only impacts create station rings and badges without fabricating corridor spans", () => {
    const stationNodeImpacts = [
      {
        stationId: "st-george",
        kind: "delay",
        cardId: "sta-impact-sg-1",
        title: "Station Elevator Maintenance",
      },
    ];

    const impactedLinks = projectImpactedLinks(ttcCatalog, [], "ttc");
    const impactedStations = projectImpactedStations(ttcCatalog, stationNodeImpacts, "ttc");
    const badges = projectImpactBadges(ttcCatalog, impactedLinks.features, impactedStations.features, "ttc");

    // Zero link features fabricated
    assert.equal(impactedLinks.features.length, 0);

    // Exactly 1 station feature
    assert.equal(impactedStations.features.length, 1);
    assert.equal(impactedStations.features[0].properties.stationId, "st-george");
    assert.equal(impactedStations.features[0].properties.impactKind, "delay");

    // Badge correctly typed as 'D' (not collapsed or skipped)
    assert.equal(badges.features.length, 1);
    const badge = badges.features[0];
    assert.equal(badge.properties.targetType, "station");
    assert.equal(badge.properties.targetId, "st-george");
    assert.equal(badge.properties.impactKind, "delay");
    assert.equal(badge.properties.label, "D");
  });

  await t.test("interchange station does not cross-match unrelated routes sharing endpoints", () => {
    // A segment on Line 2 with St George endpoint should NEVER match Line 1 links
    const line2Segment = [
      {
        id: "line-2-spadina-st-george",
        lineId: "line-2",
        stationAId: "spadina",
        stationBId: "st-george",
        impacts: [
          { kind: "delay", cardId: "line-2-delay", travelDirection: "bidirectional", sourceAlertIds: [] },
        ],
      },
    ];

    const projected = projectImpactedLinks(ttcCatalog, line2Segment, "ttc");
    // All projected links must belong to Line 2, never Line 1
    assert.ok(projected.features.length > 0);
    for (const feat of projected.features) {
      assert.equal(feat.properties.lineId, "line-2");
      assert.notEqual(feat.properties.lineId, "line-1");
    }
  });

  await t.test("missing link geometry is gracefully handled without throwing or inventing bogus coordinates", () => {
    const unmappedSegment = [
      {
        id: "imaginary-future-line-segment",
        lineId: "line-99",
        stationAId: "fake-station-a",
        stationBId: "fake-station-b",
        impacts: [
          { kind: "delay", cardId: "fake-delay", travelDirection: "bidirectional", sourceAlertIds: [] },
        ],
      },
    ];

    const projected = projectImpactedLinks(ttcCatalog, unmappedSegment, "ttc");
    assert.equal(projected.features.length, 0);

    const bounds = getSelectionBounds(
      ttcCatalog,
      { kind: "delay", id: "fake-delay" },
      unmappedSegment,
      [],
    );
    assert.equal(bounds, null);
  });
});
