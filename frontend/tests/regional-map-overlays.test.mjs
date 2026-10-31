import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  REGIONAL_DYNAMIC_SEGMENT_LAYER_ID,
  REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID,
  REGIONAL_DYNAMIC_COMMUTE_LAYER_ID,
  REGIONAL_DYNAMIC_HOVER_LAYER_ID,
  REGIONAL_TOP_HOVER_LAYER_ID,
  regionalImpactPriority,
  regionalOverlayRuns,
  regionalOverlayContentSignature,
} from "../src/app/regional-map-overlays.ts";

describe("regional map overlay utilities", () => {
  describe("dynamic layer constants", () => {
    it("exports all dynamic layer IDs per contract", () => {
      assert.equal(REGIONAL_DYNAMIC_SEGMENT_LAYER_ID, "regional-dynamic-segment-layer");
      assert.equal(REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID, "regional-dynamic-selected-segment-layer");
      assert.equal(REGIONAL_DYNAMIC_COMMUTE_LAYER_ID, "regional-dynamic-commute-layer");
      assert.equal(REGIONAL_DYNAMIC_HOVER_LAYER_ID, "regional-dynamic-hover-layer");
      assert.equal(REGIONAL_TOP_HOVER_LAYER_ID, "regional-top-hover-layer");
    });
  });

  describe("regionalImpactPriority", () => {
    it("orders disruption kinds by ascending severity", () => {
      assert.equal(regionalImpactPriority("reduced-speed-zone"), 1);
      assert.equal(regionalImpactPriority("planned-closure"), 0);
      assert.equal(regionalImpactPriority("delay"), 2);
      assert.equal(regionalImpactPriority("suspension"), 3);
      assert.equal(regionalImpactPriority("unknown-kind"), -1);

      const kinds = ["suspension", "reduced-speed-zone", "delay", "planned-closure"];
      const sorted = [...kinds].sort((a, b) => regionalImpactPriority(a) - regionalImpactPriority(b));
      assert.deepEqual(sorted, ["planned-closure", "reduced-speed-zone", "delay", "suspension"]);
    });
  });

  describe("regionalOverlayRuns", () => {
    it("returns an empty array when given no pieces", () => {
      assert.deepEqual(regionalOverlayRuns([]), []);
    });

    it("creates a single run for a single piece", () => {
      const piece = {
        pieceId: "piece-1",
        lineId: "regional-lw",
        impact: { kind: "delay", cardId: "card-lw-1" },
        segment: {
          id: "seg-1",
          stationAId: "union",
          stationBId: "exhibition",
          lineId: "regional-lw",
        },
        pathD: "M 0 0 L 10 10",
        layerIndex: 0,
      };

      const runs = regionalOverlayRuns([piece]);
      assert.equal(runs.length, 1);
      assert.equal(runs[0].lineId, "regional-lw");
      assert.equal(runs[0].impact.cardId, "card-lw-1");
      assert.equal(runs[0].segments.length, 1);
      assert.equal(runs[0].pathD, "M 0 0 L 10 10");
    });

    it("merges adjacent segments sharing the same impact into a single run", () => {
      const pieces = [
        {
          pieceId: "p1",
          lineId: "regional-lw",
          impact: { kind: "delay", cardId: "card-lw-1" },
          segment: { id: "seg-1", stationAId: "union", stationBId: "exhibition", lineId: "regional-lw" },
          pathD: "M 0 0 L 10 10",
          layerIndex: 0,
        },
        {
          pieceId: "p2",
          lineId: "regional-lw",
          impact: { kind: "delay", cardId: "card-lw-1" },
          segment: { id: "seg-2", stationAId: "exhibition", stationBId: "mimico", lineId: "regional-lw" },
          pathD: "M 10 10 L 20 20",
          layerIndex: 0,
        },
      ];

      const runs = regionalOverlayRuns(pieces);
      assert.equal(runs.length, 1);
      assert.equal(runs[0].segments.length, 2);
      assert.equal(runs[0].pathD, "M 0 0 L 10 10 M 10 10 L 20 20");
    });

    it("keeps non-adjacent segments as separate runs", () => {
      const pieces = [
        {
          pieceId: "p1",
          lineId: "regional-lw",
          impact: { kind: "delay", cardId: "card-lw-1" },
          segment: { id: "seg-1", stationAId: "union", stationBId: "exhibition", lineId: "regional-lw" },
          pathD: "M 0 0 L 10 10",
          layerIndex: 0,
        },
        {
          pieceId: "p2",
          lineId: "regional-lw",
          impact: { kind: "delay", cardId: "card-lw-1" },
          segment: { id: "seg-3", stationAId: "clarkson", stationBId: "oakville", lineId: "regional-lw" },
          pathD: "M 50 50 L 60 60",
          layerIndex: 0,
        },
      ];

      const runs = regionalOverlayRuns(pieces);
      assert.equal(runs.length, 2);
      assert.equal(runs[0].segments.length, 1);
      assert.equal(runs[1].segments.length, 1);
    });

    it("keeps different impact cards as separate runs even if adjacent", () => {
      const pieces = [
        {
          pieceId: "p1",
          lineId: "regional-lw",
          impact: { kind: "delay", cardId: "card-1" },
          segment: { id: "seg-1", stationAId: "union", stationBId: "exhibition", lineId: "regional-lw" },
          pathD: "M 0 0 L 10 10",
          layerIndex: 0,
        },
        {
          pieceId: "p2",
          lineId: "regional-lw",
          impact: { kind: "suspension", cardId: "card-2" },
          segment: { id: "seg-2", stationAId: "exhibition", stationBId: "mimico", lineId: "regional-lw" },
          pathD: "M 10 10 L 20 20",
          layerIndex: 0,
        },
      ];

      const runs = regionalOverlayRuns(pieces);
      assert.equal(runs.length, 2);
      assert.equal(runs[0].impact.kind, "delay");
      assert.equal(runs[1].impact.kind, "suspension");
    });
  });
});

describe("regionalOverlayContentSignature", () => {
  const snapshot = (updatedAt, closureTitle = "Weekend service adjustments") => ({
    activeAlerts: [{ id: "alert-1", severity: "delay", lineId: "regional-lw", affectedSegmentIds: [], updatedAt }],
    delays: [],
    reducedSpeedZones: [],
    plannedClosures: [{ id: "closure-1", lineId: "regional-lw", title: closureTitle, previewSegmentIds: [], previewStationIds: ["oakville"], updatedAt }],
    networkSegments: [{ id: "segment-lw-a-b", lineId: "regional-lw", impacts: [] }],
    stationNodeImpacts: [],
    stations: [{ id: "oakville", name: "Oakville" }],
    commutePathPreview: null,
  });

  it("keeps overlays in place when a poll only returns fresh copies with new run timestamps", () => {
    assert.equal(
      regionalOverlayContentSignature(snapshot("2026-10-23T21:03:36Z")),
      regionalOverlayContentSignature(snapshot("2026-10-23T21:07:37Z")),
    );
  });

  it("rebuilds overlays when drawn content changes", () => {
    assert.notEqual(
      regionalOverlayContentSignature(snapshot("2026-10-23T21:03:36Z")),
      regionalOverlayContentSignature(snapshot("2026-10-23T21:03:36Z", "Line closed")),
    );
  });
});
