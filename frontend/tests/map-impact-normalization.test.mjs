import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildActiveClosureImpactCardIds,
  normalizeActiveClosureMapImpact,
} from "../src/components/map-impact-normalization.ts";

const baseImpact = {
  kind: "planned-closure",
  cardId: "closure-parent",
  travelDirection: "bidirectional",
  sourceAlertIds: ["closure-parent"],
};

const baseClosure = {
  id: "closure-parent",
  activeNow: true,
  timingStatus: "active-now",
};

const baseActiveAlert = {
  id: "closure-parent",
  severity: "planned",
};

describe("active closure map impact normalization", () => {
  it("uses the active-alert icon identity for a projected canonical closure", () => {
    const cardIds = buildActiveClosureImpactCardIds(
      [baseActiveAlert],
      [baseClosure],
    );

    assert.deepEqual(normalizeActiveClosureMapImpact(baseImpact, cardIds), {
      ...baseImpact,
      kind: "suspension",
    });
  });

  it("uses a linked standalone child as the active map card identity", () => {
    const childAlert = {
      ...baseActiveAlert,
      id: "closure-child",
      relatedPlannedClosureId: "closure-parent",
    };
    const cardIds = buildActiveClosureImpactCardIds(
      [childAlert],
      [baseClosure],
    );

    assert.deepEqual(normalizeActiveClosureMapImpact(baseImpact, cardIds), {
      ...baseImpact,
      kind: "suspension",
      cardId: "closure-child",
      sourceAlertIds: ["closure-child"],
    });
  });

  it("keeps the planned-closure calendar identity before its window begins", () => {
    const upcomingClosure = {
      ...baseClosure,
      activeNow: false,
      timingStatus: "upcoming",
    };
    const cardIds = buildActiveClosureImpactCardIds([], [upcomingClosure]);

    assert.equal(normalizeActiveClosureMapImpact(baseImpact, cardIds), baseImpact);
  });
});
