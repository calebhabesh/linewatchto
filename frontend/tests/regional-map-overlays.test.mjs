import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { regionalOverlayRuns } from "../src/app/regional-map-overlays.ts";

describe("regional map overlay utilities", () => {
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
