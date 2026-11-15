import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as overlapBadges from "../src/components/map-overlap-badges.ts";

const {
  buildStationOverlapBadgeGroups,
  coveredSegmentOverlapBadgeSignatures,
  overlapBadgeKindCounts,
  overlapBadgeSignature,
} = overlapBadges;

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

  it("counts duplicate impact kinds for compact overlap marker badges", () => {
    const counts = overlapBadgeKindCounts([
      {
        kind: "delay",
        cardId: "station-delay-jane",
        travelDirection: "bidirectional",
        sourceAlertIds: ["station-delay-jane"],
      },
      {
        kind: "delay",
        cardId: "segment-delay-jane-runnymede",
        travelDirection: "bidirectional",
        sourceAlertIds: ["segment-delay-jane-runnymede"],
      },
      {
        kind: "reduced-speed-zone",
        cardId: "rsz-jane-runnymede",
        travelDirection: "bidirectional",
        sourceAlertIds: ["rsz-jane-runnymede"],
      },
      {
        kind: "planned-closure",
        cardId: "closure-jane-runnymede",
        travelDirection: "bidirectional",
        sourceAlertIds: ["closure-jane-runnymede"],
      },
    ]);

    assert.deepEqual(counts, [
      { kind: "delay", count: 2 },
      { kind: "reduced-speed-zone", count: 1 },
      { kind: "planned-closure", count: 1 },
    ]);
  });

  it("keeps one same-kind overlap badge to a single visual item", () => {
    const visualItemCount = overlapBadges.overlapBadgeVisualItemCount;

    assert.equal(typeof visualItemCount, "function");
    assert.equal(visualItemCount([{ kind: "reduced-speed-zone", count: 2 }]), 1);
    assert.equal(visualItemCount([{ kind: "delay", count: 1 }]), 1);
    assert.equal(
      visualItemCount([
        { kind: "delay", count: 1 },
        { kind: "reduced-speed-zone", count: 1 },
      ]),
      2,
    );
  });

  it("creates a station-boundary overlap group for distinct impacts of the same kind", () => {
    const groups = buildStationOverlapBadgeGroups({
      segments: [
        {
          id: "yorkdale-wilson",
          label: "Yorkdale to Wilson",
          stationAId: "yorkdale",
          stationBId: "wilson",
          impacts: [
            {
              kind: "reduced-speed-zone",
              cardId: "rsz-yorkdale-wilson",
              travelDirection: "bidirectional",
              sourceAlertIds: ["rsz-yorkdale-wilson"],
            },
          ],
        },
        {
          id: "wilson-sheppard-west",
          label: "Wilson to Sheppard West",
          stationAId: "wilson",
          stationBId: "sheppard-west",
          impacts: [
            {
              kind: "reduced-speed-zone",
              cardId: "rsz-sheppard-west-wilson",
              travelDirection: "bidirectional",
              sourceAlertIds: ["rsz-sheppard-west-wilson"],
            },
          ],
        },
      ],
      plannedClosures: [],
      stationNodeImpacts: [],
      suppressedSignatures: new Set(),
    });

    assert.equal(groups.length, 1);
    assert.equal(groups[0].stationId, "wilson");
    assert.deepEqual(groups[0].impactKinds, ["reduced-speed-zone"]);
    assert.deepEqual(overlapBadgeKindCounts(groups[0].impacts), [
      { kind: "reduced-speed-zone", count: 2 },
    ]);
  });

  it("treats a station-node overlap group as covering the matching segment badge when it is a strict superset", () => {
    const segmentImpacts = [
      {
        kind: "delay",
        cardId: "segment-delay-jane-runnymede",
        travelDirection: "bidirectional",
        sourceAlertIds: ["segment-delay-jane-runnymede"],
      },
      {
        kind: "reduced-speed-zone",
        cardId: "rsz-jane-runnymede",
        travelDirection: "bidirectional",
        sourceAlertIds: ["rsz-jane-runnymede"],
      },
    ];
    const segment = {
      id: "jane-runnymede",
      label: "Jane to Runnymede",
      stationAId: "jane",
      stationBId: "runnymede",
      impacts: segmentImpacts,
    };

    const stationGroups = buildStationOverlapBadgeGroups({
      segments: [segment],
      plannedClosures: [],
      stationNodeImpacts: [
        {
          stationId: "jane",
          kind: "delay",
          cardId: "station-delay-jane",
          title: "Delay at Jane Station",
        },
      ],
      suppressedSignatures: new Set(),
    });
    const coveredSignatures = coveredSegmentOverlapBadgeSignatures(
      [
        {
          signature: overlapBadgeSignature(segmentImpacts),
          impacts: segmentImpacts,
          segments: [segment],
        },
      ],
      stationGroups,
    );

    assert.deepEqual(stationGroups[0].impactKinds, ["delay", "reduced-speed-zone"]);
    assert.deepEqual(overlapBadgeKindCounts(stationGroups[0].impacts), [
      { kind: "delay", count: 2 },
      { kind: "reduced-speed-zone", count: 1 },
    ]);
    assert.deepEqual([...coveredSignatures], [overlapBadgeSignature(segmentImpacts)]);
  });

  describe("stations drawn with a dot per line", () => {
    const impact = (cardId, kind = "suspension") => ({
      kind, cardId, travelDirection: "bidirectional", sourceAlertIds: [cardId],
    });
    const segment = (lineId, stationAId, stationBId, cardIds, anchors = {}) => ({
      id: `${lineId}-${stationAId}-${stationBId}`,
      label: `${stationAId} to ${stationBId}`,
      lineId,
      stationAId,
      stationBId,
      stationAAnchorId: anchors.a,
      stationBAnchorId: anchors.b,
      impacts: cardIds.map((cardId) => impact(cardId)),
    });
    const groups = (segments, stationNodeImpacts = [], stationImpactLineId) => buildStationOverlapBadgeGroups({
      segments, plannedClosures: [], stationNodeImpacts, stationImpactLineId,
    }).map((group) => ({
      stationId: group.stationId,
      dotIds: group.dotIds,
      cards: group.impacts.map((item) => item.cardId).sort(),
    }));

    // TTC: Spadina draws Line 1 and Line 2 as two dots joined by a connector.
    const line1 = segment("line-1", "dupont", "spadina", ["line-1-alert"], { b: "station-spadina-1" });
    const line2 = segment("line-2", "spadina", "bathurst", ["line-2-alert"], { a: "station-spadina-2" });

    it("gives alerts on different lines' dots no badge together", () => {
      assert.deepEqual(groups([line1, line2]), []);
    });

    it("keeps one badge where both lines share one dot", () => {
      assert.deepEqual(groups([
        segment("line-1", "wellesley", "bloor-yonge", ["line-1-alert"]),
        segment("line-2", "bloor-yonge", "sherbourne", ["line-2-alert"]),
      ]), [{ stationId: "bloor-yonge", dotIds: [], cards: ["line-1-alert", "line-2-alert"] }]);
      // GO/UP's Union: every line names the same pill.
      assert.deepEqual(groups([
        segment("regional-ki", "union", "bloor", ["ki"], { a: "station-union", b: "station-bloor-ki" }),
        segment("regional-up", "union", "bloor", ["up"], { a: "station-union", b: "station-bloor-up" }),
        segment("regional-le", "union", "danforth", ["le"], { a: "station-union", b: "station-danforth" }),
      ]), [{ stationId: "union", dotIds: [], cards: ["ki", "le", "up"] }]);
    });

    it("badges alerts that meet on one line's dot, naming that dot", () => {
      assert.deepEqual(groups([
        line1,
        segment("line-1", "spadina", "st-george", ["line-1-other"], { a: "station-spadina-1" }),
        line2,
      ]), [{ stationId: "spadina", dotIds: ["station-spadina-1"], cards: ["line-1-alert", "line-1-other"] }]);
    });

    it("puts a station alert on its line's dot", () => {
      const stationAlert = { stationId: "spadina", kind: "delay", cardId: "spadina-delay", title: "Delay at Spadina" };
      assert.deepEqual(
        groups([line1, line2], [stationAlert], () => "line-2"),
        [{ stationId: "spadina", dotIds: ["station-spadina-2"], cards: ["line-2-alert", "spadina-delay"] }],
      );
    });

    it("lets a station alert whose line is unknown meet every dot", () => {
      const stationAlert = { stationId: "spadina", kind: "delay", cardId: "spadina-delay", title: "Delay at Spadina" };
      for (const lineId of [undefined, () => null, () => "line-4"]) {
        assert.deepEqual(
          groups([line1, line2], [stationAlert], lineId),
          [{ stationId: "spadina", dotIds: [], cards: ["line-1-alert", "line-2-alert", "spadina-delay"] }],
        );
      }
    });
  });
});
