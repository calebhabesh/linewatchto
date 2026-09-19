import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveTravelDirectionFromDisplay,
} from "../src/app/map-alert-selector.ts";

import {
  projectImpactArrows,
  projectEstimatedTrainMarkers,
  getCoordinateDistanceMeters,
  getCachedPolylineDistances,
  getPointAndBearingAlongPolyline,
  isLinkPolylineForward,
  getTrainMarkerLabel,
  getImpactArrowColors,
} from "../src/app/geographic-overlays.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ttcCatalogPath = path.resolve(
  __dirname,
  "../public/assets/linewatch/geographic/ttc-catalog.json",
);
const ttcCatalog = JSON.parse(fs.readFileSync(ttcCatalogPath, "utf8"));

test("Session 3: Direction indicators and travel direction resolution", async (t) => {
  await t.test("resolves cardinal directions to topological forward/reverse", () => {
    // Line 2: Eastbound is forward (Kipling -> Kennedy)
    const line2Eb = resolveTravelDirectionFromDisplay("Eastbound", "line-2");
    assert.equal(line2Eb.travelDirection, "forward");
    assert.equal(line2Eb.directionCertainty, "explicit");

    // Line 2: Westbound is reverse (Kennedy -> Kipling)
    const line2Wb = resolveTravelDirectionFromDisplay("Westbound", "line-2");
    assert.equal(line2Wb.travelDirection, "reverse");
    assert.equal(line2Wb.directionCertainty, "explicit");

    // Line 1: Northbound on Yonge arm (Bloor-Yonge to Eglinton) is forward (towards Finch)
    const line1YongeNb = resolveTravelDirectionFromDisplay(
      "Northbound",
      "line-1",
      "station-bloor-yonge",
      "station-eglinton",
    );
    assert.equal(line1YongeNb.travelDirection, "forward");
    assert.equal(line1YongeNb.directionCertainty, "explicit");

    // Line 1: Southbound on Yonge arm is reverse
    const line1YongeSb = resolveTravelDirectionFromDisplay(
      "Southbound",
      "line-1",
      "station-bloor-yonge",
      "station-eglinton",
    );
    assert.equal(line1YongeSb.travelDirection, "reverse");
    assert.equal(line1YongeSb.directionCertainty, "explicit");

    // Line 1: Northbound on University arm (St George to Dupont) is reverse (towards Vaughan, lower indices)
    const line1UnivNb = resolveTravelDirectionFromDisplay(
      "Northbound",
      "line-1",
      "station-st-george",
      "station-dupont",
    );
    assert.equal(line1UnivNb.travelDirection, "reverse");
    assert.equal(line1UnivNb.directionCertainty, "explicit");

    // Both directions
    const bothDir = resolveTravelDirectionFromDisplay("Both directions", "line-2");
    assert.equal(bothDir.travelDirection, "bidirectional");
    assert.equal(bothDir.directionCertainty, "explicit");

    // Unknown or unspecified direction
    const unspec = resolveTravelDirectionFromDisplay("Direction not specified", "line-2");
    assert.equal(unspec.travelDirection, "bidirectional");
    assert.equal(unspec.directionCertainty, "unspecified");

    const emptyDir = resolveTravelDirectionFromDisplay("", "line-2");
    assert.equal(emptyDir.directionCertainty, "unspecified");
  });

  await t.test("projectImpactArrows: creates forward, reverse, and single joined bidirectional indicators", () => {
    // Pick a real Line 2 link: Broadview to Chester
    const broadviewChester = ttcCatalog.features.find(
      (f) => f.properties?.segmentId === "line-2-broadview-chester",
    );
    assert.ok(broadviewChester);

    const baseImpactLink = {
      type: "Feature",
      id: "impact-link-1",
      geometry: broadviewChester.geometry,
      properties: {
        segmentId: broadviewChester.properties.segmentId,
        lineId: "line-2",
        network: "ttc",
        impactKind: "delay",
        impactColor: "#f97316",
        impactCardId: "alert-1",
        allCardIds: ["alert-1"],
        travelDirection: "forward",
        directionCertainty: "explicit",
        rawImpacts: [],
      },
    };

    // 1. Forward direction
    const fwdResult = projectImpactArrows(ttcCatalog, [baseImpactLink]);
    assert.ok(fwdResult.features.length >= 1);
    assert.ok(fwdResult.features.every((feature) => feature.properties.travelDirection === "forward"));
    assert.equal(fwdResult.features[0].properties.directionCertainty, "explicit");
    assert.ok(typeof fwdResult.features[0].properties.bearing === "number");
    assert.equal(fwdResult.features[0].properties.iconImage, "direction-arrow");

    // 2. Reverse direction
    const revImpactLink = {
      ...baseImpactLink,
      properties: {
        ...baseImpactLink.properties,
        travelDirection: "reverse",
      },
    };
    const revResult = projectImpactArrows(ttcCatalog, [revImpactLink]);
    assert.equal(revResult.features.length, fwdResult.features.length);
    assert.ok(revResult.features.every((feature) => feature.properties.travelDirection === "reverse"));
    // Reverse bearing should be approximately 180 deg different from forward bearing
    const diff = Math.abs(revResult.features[0].properties.bearing - fwdResult.features[0].properties.bearing);
    assert.ok(Math.abs(diff - 180) <= 2, `Expected ~180° bearing difference, got ${diff}`);

    // 3. Bidirectional: single joined opposing-chevron feature per position, not two separated features
    const bidiImpactLink = {
      ...baseImpactLink,
      properties: {
        ...baseImpactLink.properties,
        travelDirection: "bidirectional",
      },
    };
    const bidiResult = projectImpactArrows(ttcCatalog, [bidiImpactLink]);
    assert.equal(bidiResult.features.length, fwdResult.features.length, "Single joined feature per position");
    const [bidiArrow] = bidiResult.features;
    assert.equal(bidiArrow.properties.travelDirection, "bidirectional");
    assert.equal(bidiArrow.properties.iconImage, "direction-arrow-bidirectional");
  });

  await t.test("projectImpactArrows: equidistant placement fractions (i + 1) / (count + 1) and count rules", () => {
    // Test count rule clamp(ceil(segmentLengthMeters / 240), 1, 6)
    // Short: ~100m -> count = 1 -> fraction [0.5]
    const shortCoords = [[-79.38, 43.65], [-79.38, 43.6509]]; // ~100m
    const shortLink = {
      type: "Feature",
      id: "impact-short",
      geometry: { type: "LineString", coordinates: shortCoords },
      properties: {
        segmentId: "short",
        lineId: "line-1",
        network: "ttc",
        impactKind: "delay",
        impactColor: "#f97316",
        impactCardId: "alert-short",
        travelDirection: "forward",
        directionCertainty: "explicit",
      },
    };
    const shortRes = projectImpactArrows(ttcCatalog, [shortLink]);
    assert.equal(shortRes.features.length, 1);
    assert.equal(shortRes.features[0].properties.fraction, 0.5);

    // Medium: ~960m -> count = 4 -> fractions [0.2, 0.4, 0.6, 0.8]
    const medCoords = [[-79.38, 43.65], [-79.38, 43.6586]]; // ~960m
    const medLink = {
      type: "Feature",
      id: "impact-med",
      geometry: { type: "LineString", coordinates: medCoords },
      properties: {
        segmentId: "med",
        lineId: "line-1",
        network: "ttc",
        impactKind: "delay",
        impactColor: "#f97316",
        impactCardId: "alert-med",
        travelDirection: "forward",
        directionCertainty: "explicit",
      },
    };
    const medRes = projectImpactArrows(ttcCatalog, [medLink]);
    assert.equal(medRes.features.length, 4);
    assert.equal(medRes.features[0].properties.fraction, 0.2);
    assert.equal(medRes.features[1].properties.fraction, 0.4);
    assert.equal(medRes.features[2].properties.fraction, 0.6);
    assert.equal(medRes.features[3].properties.fraction, 0.8);

    // Palette mapping test (dark casing + light core from handoff seed table)
    const suspColors = getImpactArrowColors("suspension", "ttc");
    assert.equal(suspColors.casingColor, "#991b1b");
    assert.equal(suspColors.coreColor, "#fecaca");

    const ttcDelayColors = getImpactArrowColors("delay", "ttc");
    assert.equal(ttcDelayColors.casingColor, "#92400e");
    assert.equal(ttcDelayColors.coreColor, "#fde68a");

    const regDelayColors = getImpactArrowColors("delay", "regional");
    assert.equal(regDelayColors.casingColor, "#075985");
    assert.equal(regDelayColors.coreColor, "#bae6fd");

    const rszColors = getImpactArrowColors("reduced-speed-zone", "ttc");
    assert.equal(rszColors.casingColor, "#78350f");
    assert.equal(rszColors.coreColor, "#fde68a");

    const closureColors = getImpactArrowColors("planned-closure", "ttc");
    assert.equal(closureColors.casingColor, "#1e40af");
    assert.equal(closureColors.coreColor, "#bfdbfe");
  });

  await t.test("projectImpactArrows: suppresses arrows for unspecified direction", () => {
    const link = ttcCatalog.features.find(
      (f) => f.properties?.segmentId === "line-2-broadview-chester",
    );
    assert.ok(link);

    const unspecLink = {
      type: "Feature",
      id: "impact-link-unspec",
      geometry: link.geometry,
      properties: {
        segmentId: link.properties.segmentId,
        lineId: "line-2",
        network: "ttc",
        impactKind: "delay",
        impactColor: "#f97316",
        impactCardId: "alert-unspec",
        allCardIds: ["alert-unspec"],
        travelDirection: "bidirectional",
        directionCertainty: "unspecified",
      },
    };

    const result = projectImpactArrows(ttcCatalog, [unspecLink]);
    assert.equal(result.features.length, 0, "Arrows must not be inferred for unspecified direction");
  });

  await t.test("projectImpactArrows: repeats direction on long links without unbounded marker growth", () => {
    const longLink = {
      type: "Feature",
      id: "impact-long",
      geometry: {
        type: "LineString",
        coordinates: [
          [-79.45, 43.65],
          [-79.44, 43.65],
          [-79.43, 43.655],
        ],
      },
      properties: {
        segmentId: "segment-long-link",
        lineId: "line-2",
        network: "ttc",
        impactKind: "delay",
        impactColor: "#f97316",
        impactCardId: "alert-long",
        allCardIds: ["alert-long"],
        travelDirection: "forward",
        directionCertainty: "explicit",
      },
    };

    const result = projectImpactArrows(ttcCatalog, [longLink]);
    assert.ok(result.features.length >= 3, "Long affected links should repeat direction arrows");
    assert.ok(result.features.length <= 6, "Arrow repetition must stay bounded");
  });

  await t.test("projectImpactArrows: preserves secondary selection directional emphasis", () => {
    const link = ttcCatalog.features.find(
      (f) => f.properties?.segmentId === "line-2-broadview-chester",
    );
    assert.ok(link);

    const primaryImpact = {
      kind: "suspension",
      cardId: "alert-susp-1",
      travelDirection: "forward",
      directionCertainty: "explicit",
      sourceAlertIds: ["alert-susp-1"],
    };

    const secondaryImpact = {
      kind: "delay",
      cardId: "alert-delay-2",
      travelDirection: "reverse",
      directionCertainty: "explicit",
      sourceAlertIds: ["alert-delay-2"],
    };

    const multiImpactLink = {
      type: "Feature",
      id: "impact-link-multi",
      geometry: link.geometry,
      properties: {
        segmentId: link.properties.segmentId,
        lineId: "line-2",
        network: "ttc",
        impactKind: primaryImpact.kind,
        impactColor: "#ef4444",
        impactCardId: primaryImpact.cardId,
        allCardIds: ["alert-susp-1", "alert-delay-2"],
        travelDirection: primaryImpact.travelDirection,
        directionCertainty: primaryImpact.directionCertainty,
        rawImpacts: [primaryImpact, secondaryImpact],
      },
    };

    // When no secondary selection is made, arrows describe primary impact (forward)
    const normalResult = projectImpactArrows(ttcCatalog, [multiImpactLink]);
    assert.ok(normalResult.features.length >= 1);
    assert.ok(normalResult.features.every((feature) => feature.properties.cardId === "alert-susp-1"));
    assert.ok(normalResult.features.every((feature) => feature.properties.travelDirection === "forward"));
    assert.ok(normalResult.features.every((feature) => feature.properties.isSelected === false));

    // When secondary impact is selected, arrow adopts secondary impact direction (reverse) with isSelected: true
    const selectedResult = projectImpactArrows(ttcCatalog, [multiImpactLink], {
      kind: "delay",
      id: "alert-delay-2",
    });
    assert.equal(selectedResult.features.length, normalResult.features.length);
    assert.ok(selectedResult.features.every((feature) => feature.properties.cardId === "alert-delay-2"));
    assert.ok(selectedResult.features.every((feature) => feature.properties.travelDirection === "reverse"));
    assert.ok(selectedResult.features.every((feature) => feature.properties.isSelected === true));
  });

  await t.test("getPointAndBearingAlongPolyline and isLinkPolylineForward compute tangent bearing and topology orientation", () => {
    const link = ttcCatalog.features.find(
      (f) => f.properties?.segmentId === "line-2-broadview-chester",
    );
    assert.ok(link);

    const isForward = isLinkPolylineForward(ttcCatalog, link);
    assert.equal(typeof isForward, "boolean");

    const sample = getPointAndBearingAlongPolyline(link.geometry.coordinates, 0.5);
    assert.ok(Array.isArray(sample.coordinates));
    assert.equal(sample.coordinates.length, 2);
    assert.ok(sample.bearing >= 0 && sample.bearing < 360);
  });
});

test("Session 3: Estimated train projection and distance interpolation", async (t) => {
  const line2Link = ttcCatalog.features.find(
    (f) => f.properties?.segmentId === "line-2-broadview-chester",
  );
  assert.ok(line2Link);

  await t.test("interpolates train position at endpoints (0.0, 1.0) and interior (0.5)", () => {
    const stA = line2Link.properties.stationAId;
    const stB = line2Link.properties.stationBId;

    // Progress 0.0 (at fromStation)
    const train0 = {
      id: "train-0",
      lineId: "line-2",
      segmentId: line2Link.properties.segmentId,
      fromStationId: stA,
      toStationId: stB,
      progress: 0.0,
      direction: "EB",
    };

    // Progress 0.5 (halfway)
    const trainHalf = {
      id: "train-half",
      lineId: "line-2",
      segmentId: line2Link.properties.segmentId,
      fromStationId: stA,
      toStationId: stB,
      progress: 0.5,
      direction: "EB",
    };

    // Progress 1.0 (at toStation)
    const train1 = {
      id: "train-1",
      lineId: "line-2",
      segmentId: line2Link.properties.segmentId,
      fromStationId: stA,
      toStationId: stB,
      progress: 1.0,
      direction: "EB",
    };

    const res = projectEstimatedTrainMarkers(
      ttcCatalog,
      [train0, trainHalf, train1],
      { enabled: true, isOnline: true },
    );

    assert.equal(res.features.length, 3);
    const [f0, fHalf, f1] = res.features;

    assert.equal(f0.properties.markerId, "train-0");
    assert.equal(fHalf.properties.markerId, "train-half");
    assert.equal(f1.properties.markerId, "train-1");

    // Position 0.0 should be at first vertex of oriented link
    assert.equal(f0.geometry.coordinates[0], line2Link.geometry.coordinates[0][0]);
    assert.equal(f0.geometry.coordinates[1], line2Link.geometry.coordinates[0][1]);

    // Position 1.0 should be at last vertex
    const lastCoord = line2Link.geometry.coordinates.at(-1);
    assert.equal(f1.geometry.coordinates[0], lastCoord[0]);
    assert.equal(f1.geometry.coordinates[1], lastCoord[1]);

    // Position 0.5 distance from start should be ~ half of total distance
    const totalDist = getCachedPolylineDistances("test-line-2", line2Link.geometry.coordinates).totalDistance;
    const distFromStart = getCoordinateDistanceMeters(
      f0.geometry.coordinates,
      fHalf.geometry.coordinates,
    );
    assert.ok(
      Math.abs(distFromStart - totalDist * 0.5) < 15,
      `Expected ~${totalDist * 0.5}m along curve, got chord distance ${distFromStart}m`,
    );

    // Bearing should be finite and normalized [0, 360)
    for (const f of [f0, fHalf, f1]) {
      assert.ok(f.properties.bearing >= 0 && f.properties.bearing < 360);
    }
  });

  await t.test("orients reversed train (toStation -> fromStation) correctly", () => {
    const stA = line2Link.properties.stationAId;
    const stB = line2Link.properties.stationBId;

    // Train traveling from stB to stA (reverse direction of link stationA->stationB)
    const revTrain = {
      id: "train-rev",
      lineId: "line-2",
      segmentId: line2Link.properties.segmentId,
      fromStationId: stB,
      toStationId: stA,
      progress: 0.0,
      direction: "WB",
    };

    const res = projectEstimatedTrainMarkers(
      ttcCatalog,
      [revTrain],
      { enabled: true, isOnline: true },
    );

    assert.equal(res.features.length, 1);
    // At progress 0.0, marker should be at stB (which is the last coordinate of the catalog link)
    const lastCoord = line2Link.geometry.coordinates.at(-1);
    assert.equal(res.features[0].geometry.coordinates[0], lastCoord[0]);
    assert.equal(res.features[0].geometry.coordinates[1], lastCoord[1]);
  });

  await t.test("rejects malformed progress values (out of range, NaN, non-numeric)", () => {
    const stA = line2Link.properties.stationAId;
    const stB = line2Link.properties.stationBId;

    const malformed = [
      { id: "t1", lineId: "line-2", fromStationId: stA, toStationId: stB, progress: -0.1 },
      { id: "t2", lineId: "line-2", fromStationId: stA, toStationId: stB, progress: 1.1 },
      { id: "t3", lineId: "line-2", fromStationId: stA, toStationId: stB, progress: NaN },
      { id: "t4", lineId: "line-2", fromStationId: stA, toStationId: stB, progress: Infinity },
      { id: "t5", lineId: "line-2", fromStationId: stA, toStationId: stB, progress: "0.5" },
    ];

    const res = projectEstimatedTrainMarkers(
      ttcCatalog,
      malformed,
      { enabled: true, isOnline: true },
    );

    assert.equal(res.features.length, 0, "All malformed progress estimates must be rejected");
  });

  await t.test("rejects ambiguous or absent link estimates", () => {
    const invalidTrains = [
      // Absent / non-existent stations
      {
        id: "absent-st",
        lineId: "line-2",
        fromStationId: "station-mars",
        toStationId: "station-jupiter",
        progress: 0.5,
      },
      // Stations from different lines with no direct link
      {
        id: "cross-line",
        lineId: "line-2",
        fromStationId: "station-finch", // Line 1
        toStationId: "station-kipling", // Line 2
        progress: 0.5,
      },
    ];

    const res = projectEstimatedTrainMarkers(
      ttcCatalog,
      invalidTrains,
      { enabled: true, isOnline: true },
    );

    assert.equal(res.features.length, 0, "Estimates with absent or mismatched links must be rejected");
  });

  await t.test("handles single-point / zero-length links safely", () => {
    const mockCatalog = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "zero-link",
          geometry: {
            type: "LineString",
            coordinates: [[-79.38, 43.65]],
          },
          properties: {
            featureType: "link",
            segmentId: "segment-zero",
            lineId: "line-1",
            stationAId: "st-a",
            stationBId: "st-b",
          },
        },
      ],
    };

    const train = {
      id: "train-zero",
      lineId: "line-1",
      segmentId: "segment-zero",
      fromStationId: "st-a",
      toStationId: "st-b",
      progress: 0.5,
    };

    const res = projectEstimatedTrainMarkers(
      mockCatalog,
      [train],
      { enabled: true, isOnline: true },
    );

    assert.equal(res.features.length, 1);
    assert.deepEqual(res.features[0].geometry.coordinates, [-79.38, 43.65]);
  });

  await t.test("formats train marker labels cleanly", () => {
    assert.equal(getTrainMarkerLabel({ lineId: "line-1", direction: "NB" }), "Northbound");
    assert.equal(getTrainMarkerLabel({ lineId: "line-2", direction: "Westbound" }), "Westbound");
    assert.equal(getTrainMarkerLabel({ lineId: "regional-lw", direction: "EB" }), "Eastbound");
    assert.equal(getTrainMarkerLabel({ lineId: "line-4" }), "");
  });
});

test("Session 3: Estimated train gating invariants", async (t) => {
  const line2Link = ttcCatalog.features.find(
    (f) => f.properties?.segmentId === "line-2-broadview-chester",
  );
  assert.ok(line2Link);

  const validTrain = {
    id: "train-valid",
    lineId: "line-2",
    segmentId: line2Link.properties.segmentId,
    fromStationId: line2Link.properties.stationAId,
    toStationId: line2Link.properties.stationBId,
    progress: 0.5,
    direction: "EB",
  };

  await t.test("gating: disabled toggle returns zero markers", () => {
    const res = projectEstimatedTrainMarkers(
      ttcCatalog,
      [validTrain],
      { enabled: false, isOnline: true },
    );
    assert.equal(res.features.length, 0);
  });

  await t.test("gating: offline state independently suppresses train markers", () => {
    const res = projectEstimatedTrainMarkers(
      ttcCatalog,
      [validTrain],
      { enabled: true, isOnline: false },
    );
    assert.equal(res.features.length, 0, "Must clear train data when offline to prevent false live positions");
  });

  await t.test("gating: closed service hours suppresses train markers", () => {
    const res = projectEstimatedTrainMarkers(
      ttcCatalog,
      [validTrain],
      { enabled: true, isOnline: true, closedHours: true },
    );
    assert.equal(res.features.length, 0, "Closed hours must suppress train markers");
  });

  await t.test("gating: empty markers array returns empty collection", () => {
    const res = projectEstimatedTrainMarkers(
      ttcCatalog,
      [],
      { enabled: true, isOnline: true },
    );
    assert.equal(res.features.length, 0);
  });
});
