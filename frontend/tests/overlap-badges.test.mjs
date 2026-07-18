import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as overlapBadges from "../src/components/map-overlap-badges.ts";

const {
  buildStationOverlapBadgeGroups,
  coveredSegmentOverlapBadgeSignatures,
  overlapBadgeKindCounts,
  overlapBadgeSignature,
  chooseOverlapChooserPosition,
} = overlapBadges;

describe("map overlap badge grouping", () => {
  it("places the chooser on the clearest nearby side of its badge", () => {
    const position = chooseOverlapChooserPosition({
      anchor: { x: 500, y: 500 },
      badgeSize: { width: 100, height: 80 },
      chooserSize: { width: 300, height: 200 },
      blockedBoxes: [
        { x: 540, y: 310, width: 440, height: 380 },
      ],
      mapBounds: { x: 0, y: 0, width: 1000, height: 1000 },
    });

    assert.ok(position.x < 500, `expected the chooser left of the blocked area, got ${JSON.stringify(position)}`);
    assert.equal(position.collisionAvoided, true);
  });

  it("keeps a clear chooser fully inside the map bounds", () => {
    const chooserSize = { width: 300, height: 220 };
    const position = chooseOverlapChooserPosition({
      anchor: { x: 40, y: 40 },
      badgeSize: { width: 88, height: 88 },
      chooserSize,
      blockedBoxes: [],
      mapBounds: { x: 0, y: 0, width: 1000, height: 600 },
    });

    assert.ok(position.x >= chooserSize.width / 2);
    assert.ok(position.x <= 1000 - chooserSize.width / 2);
    assert.ok(position.y >= chooserSize.height / 2);
    assert.ok(position.y <= 600 - chooserSize.height / 2);
  });

  it("can slide along a nearby side to avoid a station label", () => {
    const position = chooseOverlapChooserPosition({
      anchor: { x: 500, y: 500 },
      badgeSize: { width: 88, height: 88 },
      chooserSize: { width: 300, height: 180 },
      blockedBoxes: [
        { x: 560, y: 430, width: 300, height: 170 },
        { x: 180, y: 360, width: 260, height: 280 },
        { x: 360, y: 650, width: 280, height: 200 },
      ],
      mapBounds: { x: 0, y: 0, width: 1000, height: 1000 },
    });

    assert.ok(position.y < 500, `expected a higher open placement, got ${JSON.stringify(position)}`);
    assert.equal(position.collisionAvoided, true);
  });

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
    ]);

    assert.deepEqual(counts, [
      { kind: "delay", count: 2 },
      { kind: "reduced-speed-zone", count: 1 },
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
});
