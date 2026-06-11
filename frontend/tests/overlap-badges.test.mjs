import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildStationOverlapBadgeGroups,
  overlapBadgeSignature,
} from "../src/components/map-overlap-badges.ts";

describe("map overlap badge grouping", () => {
  it("creates a station-boundary overlap group when active and planned impacts only share an endpoint", () => {
    const segments = [
      {
        id: "museum-st-george",
        label: "Museum to St George",
        stationAId: "museum",
        stationBId: "st-george",
        impacts: [
          {
            kind: "suspension",
            cardId: "active-museum-st-george",
            travelDirection: "forward",
            sourceAlertIds: ["active-museum-st-george"],
          },
        ],
      },
      {
        id: "st-george-spadina",
        label: "St George to Spadina",
        stationAId: "st-george",
        stationBId: "spadina",
      },
    ];

    const groups = buildStationOverlapBadgeGroups({
      segments,
      plannedClosures: [
        {
          id: "closure-st-george-sheppard-west",
          previewSegmentIds: ["st-george-spadina"],
        },
      ],
      stationNodeImpacts: [],
      suppressedSignatures: new Set(),
    });

    assert.equal(groups.length, 1);
    assert.equal(groups[0].stationId, "st-george");
    assert.deepEqual(groups[0].impactKinds, ["suspension", "planned-closure"]);
    assert.deepEqual(
      groups[0].impacts.map((impact) => `${impact.kind}:${impact.cardId}`),
      [
        "suspension:active-museum-st-george",
        "planned-closure:closure-st-george-sheppard-west",
      ],
    );
  });

  it("suppresses station-boundary groups already represented by a segment overlap badge", () => {
    const duplicateSignature = overlapBadgeSignature([
      {
        kind: "delay",
        cardId: "delay-spadina-st-george",
        travelDirection: "bidirectional",
        sourceAlertIds: ["delay-spadina-st-george"],
      },
      {
        kind: "planned-closure",
        cardId: "closure-st-george-spadina",
        travelDirection: "bidirectional",
        sourceAlertIds: ["closure-st-george-spadina"],
      },
    ]);

    const groups = buildStationOverlapBadgeGroups({
      segments: [
        {
          id: "spadina-st-george",
          label: "Spadina to St George",
          stationAId: "spadina",
          stationBId: "st-george",
          impacts: [
            {
              kind: "delay",
              cardId: "delay-spadina-st-george",
              travelDirection: "bidirectional",
              sourceAlertIds: ["delay-spadina-st-george"],
            },
          ],
        },
      ],
      plannedClosures: [
        {
          id: "closure-st-george-spadina",
          previewSegmentIds: ["spadina-st-george"],
        },
      ],
      stationNodeImpacts: [],
      suppressedSignatures: new Set([duplicateSignature]),
    });

    assert.equal(groups.length, 0);
  });
});
