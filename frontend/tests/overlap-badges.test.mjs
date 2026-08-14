import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as overlapBadges from "../src/components/map-overlap-badges.ts";

const {
  alignedOverlapBadgePositionCandidates,
  buildStationOverlapBadgeGroups,
  coveredSegmentOverlapBadgeSignatures,
  overlapBadgeKindCounts,
  overlapBadgeSignature,
  chooseOverlapChooserPosition,
  organizeOverlapBadgeClusters,
} = overlapBadges;

function badgeEdgeGap(first, second) {
  const horizontalGap = Math.max(
    Math.abs(first.position.x - second.position.x) - (first.size.width + second.size.width) / 2,
    0,
  );
  const verticalGap = Math.max(
    Math.abs(first.position.y - second.position.y) - (first.size.height + second.size.height) / 2,
    0,
  );
  return Math.hypot(horizontalGap, verticalGap);
}

function lockedLayoutsFor(badges) {
  const layouts = new Map();
  for (const badge of badges) {
    const positions = layouts.get(badge.layoutKey) ?? new Map();
    positions.set(badge.id, badge.position);
    layouts.set(badge.layoutKey, positions);
  }
  return layouts;
}

describe("map overlap badge grouping", () => {
  it("uses stable geometry tie-breaks for equally near alignment lanes", () => {
    const placedBadges = [
      {
        anchor: { x: 400, y: 500 },
        position: { x: 300, y: 500 },
        size: { width: 100, height: 100 },
      },
      {
        anchor: { x: 600, y: 500 },
        position: { x: 700, y: 500 },
        size: { width: 100, height: 100 },
      },
    ];
    const options = {
      anchor: { x: 500, y: 500 },
      size: { width: 100, height: 100 },
      gap: 20,
      maxAnchorDistance: 200,
    };

    assert.deepEqual(
      alignedOverlapBadgePositionCandidates({ ...options, placedBadges }),
      alignedOverlapBadgePositionCandidates({ ...options, placedBadges: [...placedBadges].reverse() }),
    );
  });

  it("keeps nearby badges on one vertical lane by separating them along that lane", () => {
    const candidates = alignedOverlapBadgePositionCandidates({
      anchor: { x: 2937, y: 1381 },
      size: { width: 132, height: 132 },
      placedBadges: [
        {
          anchor: { x: 2936, y: 1246 },
          position: { x: 3150, y: 1246 },
          size: { width: 132, height: 132 },
        },
      ],
      gap: 36,
      maxAnchorDistance: 260,
    });

    assert.deepEqual(candidates[0], { x: 3150, y: 1414 });
  });

  it("preserves natural anchor spacing when it already exceeds the minimum gap", () => {
    const candidates = alignedOverlapBadgePositionCandidates({
      anchor: { x: 2950, y: 1486 },
      size: { width: 220, height: 132 },
      placedBadges: [
        {
          anchor: { x: 2936, y: 1246 },
          position: { x: 3150, y: 1246 },
          size: { width: 132, height: 132 },
        },
      ],
      gap: 36,
      maxAnchorDistance: 440,
    });

    assert.deepEqual(candidates[0], { x: 3150, y: 1486 });
    const firstBottom = 1246 + 132 / 2;
    const secondTop = candidates[0].y - 132 / 2;
    assert.equal(secondTop - firstBottom, 108);
  });

  it("preserves fixed-center spacing for regional three-badge formations", () => {
    const centerSpacing = 290;
    const candidates = alignedOverlapBadgePositionCandidates({
      anchor: { x: 3350, y: 1361 },
      size: { width: 132, height: 132 },
      placedBadges: [
        {
          anchor: { x: 2936, y: 1246 },
          position: { x: 3150, y: 1246 },
          size: { width: 132, height: 132 },
        },
        {
          anchor: { x: 2950, y: 1486 },
          position: { x: 3150, y: 1536 },
          size: { width: 255, height: 132 },
        },
      ],
      gap: 36,
      maxAnchorDistance: 500,
      centerSpacing,
    });

    const trianglePoint = candidates[0];
    assert.ok(Math.abs(Math.hypot(trianglePoint.x - 3150, trianglePoint.y - 1246) - centerSpacing) < 0.001);
    assert.ok(Math.abs(Math.hypot(trianglePoint.x - 3150, trianglePoint.y - 1536) - centerSpacing) < 0.001);
  });

  it("jointly arranges a pill and two round badges with equal visual edge gaps", () => {
    const badges = [
      {
        id: "top",
        anchor: { x: 400, y: 300 },
        position: { x: 650, y: 330 },
        size: { width: 132, height: 132 },
      },
      {
        id: "combined",
        anchor: { x: 410, y: 470 },
        position: { x: 650, y: 498 },
        size: { width: 255, height: 132 },
      },
      {
        id: "right",
        anchor: { x: 610, y: 385 },
        position: { x: 910, y: 414 },
        size: { width: 132, height: 132 },
      },
    ];
    const options = {
      blockedBoxes: [],
      mapBounds: { x: 0, y: 0, width: 1400, height: 900 },
      gap: 36,
      maxAnchorDistance: 260,
    };
    const arranged = organizeOverlapBadgeClusters({ badges, ...options });
    const arrangedById = new Map(arranged.map((badge) => [badge.id, badge.position]));
    const reversedById = new Map(
      organizeOverlapBadgeClusters({ badges: [...badges].reverse(), ...options })
        .map((badge) => [badge.id, badge.position]),
    );
    const gaps = arranged.flatMap((first, firstIndex) => (
      arranged.slice(firstIndex + 1).map((second) => badgeEdgeGap(first, second))
    ));

    assert.ok(gaps.every((gap) => Math.abs(gap - options.gap) < 0.001), JSON.stringify(gaps));
    assert.deepEqual(arrangedById, reversedById);
  });

  it("arranges two nearby mixed-size badges on one viewport axis with an exact edge gap", () => {
    const badges = [
      {
        id: "round",
        anchor: { x: 500, y: 430 },
        position: { x: 370, y: 270 },
        size: { width: 132, height: 132 },
      },
      {
        id: "pill",
        anchor: { x: 530, y: 470 },
        position: { x: 690, y: 620 },
        size: { width: 255, height: 132 },
      },
    ];
    const arranged = organizeOverlapBadgeClusters({
      badges,
      blockedBoxes: [],
      mapBounds: { x: 0, y: 0, width: 1200, height: 900 },
      gap: 36,
      maxAnchorDistance: 260,
    });

    assert.ok(
      arranged[0].position.x === arranged[1].position.x
        || arranged[0].position.y === arranged[1].position.y,
      JSON.stringify(arranged.map((badge) => badge.position)),
    );
    assert.ok(Math.abs(badgeEdgeGap(arranged[0], arranged[1]) - 36) < 0.001);
  });

  it("arranges three equal-size badges as an edge-equidistant triangle", () => {
    const badges = [
      { id: "a", anchor: { x: 470, y: 410 }, position: { x: 300, y: 250 }, size: { width: 132, height: 132 } },
      { id: "b", anchor: { x: 530, y: 410 }, position: { x: 730, y: 260 }, size: { width: 132, height: 132 } },
      { id: "c", anchor: { x: 500, y: 480 }, position: { x: 520, y: 700 }, size: { width: 132, height: 132 } },
    ];
    const arranged = organizeOverlapBadgeClusters({
      badges,
      blockedBoxes: [],
      mapBounds: { x: 0, y: 0, width: 1200, height: 900 },
      gap: 36,
      maxAnchorDistance: 260,
    });
    const gaps = arranged.flatMap((first, firstIndex) => (
      arranged.slice(firstIndex + 1).map((second) => badgeEdgeGap(first, second))
    ));
    const [first, second, third] = arranged.map((badge) => badge.position);
    const triangleArea = Math.abs(
      first.x * (second.y - third.y)
        + second.x * (third.y - first.y)
        + third.x * (first.y - second.y),
    ) / 2;

    assert.ok(gaps.every((edgeGap) => Math.abs(edgeGap - 36) < 0.001), JSON.stringify(gaps));
    assert.ok(triangleArea > 0, `expected a triangle, got ${JSON.stringify(arranged)}`);
  });

  it("arranges four badges as a deterministic two-by-two edge-aware grid", () => {
    const badges = [
      { id: "a", anchor: { x: 470, y: 410 }, position: { x: 260, y: 200 }, size: { width: 132, height: 132 } },
      { id: "b", anchor: { x: 530, y: 410 }, position: { x: 760, y: 230 }, size: { width: 255, height: 132 } },
      { id: "c", anchor: { x: 470, y: 480 }, position: { x: 330, y: 720 }, size: { width: 132, height: 132 } },
      { id: "d", anchor: { x: 530, y: 480 }, position: { x: 800, y: 690 }, size: { width: 132, height: 132 } },
    ];
    const options = {
      blockedBoxes: [],
      mapBounds: { x: 0, y: 0, width: 1400, height: 1000 },
      gap: 36,
      maxAnchorDistance: 260,
    };
    const arranged = organizeOverlapBadgeClusters({ badges, ...options });
    const reversed = organizeOverlapBadgeClusters({ badges: [...badges].reverse(), ...options });
    const uniqueX = new Set(arranged.map((badge) => badge.position.x.toFixed(3)));
    const uniqueY = new Set(arranged.map((badge) => badge.position.y.toFixed(3)));

    assert.equal(uniqueX.size, 2);
    assert.equal(uniqueY.size, 2);
    assert.deepEqual(
      new Map(arranged.map((badge) => [badge.id, badge.position])),
      new Map(reversed.map((badge) => [badge.id, badge.position])),
    );
    assert.ok(arranged.every((first, firstIndex) => arranged.slice(firstIndex + 1).every(
      (second) => badgeEdgeGap(first, second) >= 36 - 0.001,
    )));
  });

  it("expands five badges into a balanced grid instead of an irregular cluster", () => {
    const badges = [
      { id: "a", anchor: { x: 460, y: 400 }, position: { x: 220, y: 180 }, size: { width: 132, height: 132 } },
      { id: "b", anchor: { x: 500, y: 390 }, position: { x: 780, y: 170 }, size: { width: 255, height: 132 } },
      { id: "c", anchor: { x: 540, y: 410 }, position: { x: 250, y: 460 }, size: { width: 132, height: 132 } },
      { id: "d", anchor: { x: 470, y: 470 }, position: { x: 820, y: 500 }, size: { width: 132, height: 132 } },
      { id: "e", anchor: { x: 530, y: 480 }, position: { x: 510, y: 760 }, size: { width: 255, height: 132 } },
    ];
    const arranged = organizeOverlapBadgeClusters({
      badges,
      blockedBoxes: [],
      mapBounds: { x: 0, y: 0, width: 1600, height: 1100 },
      gap: 36,
      maxAnchorDistance: 260,
    });
    const columnCount = new Set(arranged.map((badge) => badge.position.x.toFixed(3))).size;
    const rowCount = new Set(arranged.map((badge) => badge.position.y.toFixed(3))).size;

    assert.ok(
      (columnCount === 3 && rowCount === 2) || (columnCount === 2 && rowCount === 3),
      `expected a 3x2 or 2x3 grid, got ${columnCount}x${rowCount}`,
    );
    assert.ok(arranged.every((first, firstIndex) => arranged.slice(firstIndex + 1).every(
      (second) => badgeEdgeGap(first, second) >= 36 - 0.001,
    )));
  });

  it("locks an unchanged neighborhood to the same coordinates across refresh inputs", () => {
    const badges = [
      { id: "a", anchor: { x: 470, y: 410 }, position: { x: 260, y: 200 }, size: { width: 132, height: 132 } },
      { id: "b", anchor: { x: 530, y: 410 }, position: { x: 760, y: 230 }, size: { width: 255, height: 132 } },
      { id: "c", anchor: { x: 470, y: 480 }, position: { x: 330, y: 720 }, size: { width: 132, height: 132 } },
      { id: "d", anchor: { x: 530, y: 480 }, position: { x: 800, y: 690 }, size: { width: 132, height: 132 } },
    ];
    const options = {
      blockedBoxes: [],
      mapBounds: { x: 0, y: 0, width: 1400, height: 1000 },
      gap: 36,
      maxAnchorDistance: 260,
    };
    const first = organizeOverlapBadgeClusters({ badges, ...options });
    const refreshed = organizeOverlapBadgeClusters({
      ...options,
      badges: badges.map((badge, index) => ({
        ...badge,
        position: { x: 1050 + index * 40, y: 700 + index * 25 },
      })),
      blockedBoxes: [{ x: 350, y: 250, width: 420, height: 420 }],
      lockedLayouts: lockedLayoutsFor(first),
    });

    assert.deepEqual(
      new Map(refreshed.map((badge) => [badge.id, badge.position])),
      new Map(first.map((badge) => [badge.id, badge.position])),
    );
  });

  it("moves a singleton badge from a distant fallback to the nearest clear space around its segment anchor", () => {
    const badges = [
      {
        id: "pill",
        anchor: { x: 500, y: 450 },
        position: { x: 1250, y: 850 },
        size: { width: 255, height: 132 },
      },
    ];
    const options = {
      blockedBoxes: [
        { x: 475, y: 350, width: 50, height: 200 },
        { x: 430, y: 210, width: 300, height: 140 },
        { x: 620, y: 350, width: 300, height: 220 },
        { x: 430, y: 550, width: 300, height: 150 },
      ],
      mapBounds: { x: 0, y: 0, width: 1600, height: 1100 },
      gap: 36,
      maxAnchorDistance: 260,
    };
    const arranged = organizeOverlapBadgeClusters({ badges, ...options });
    const anchorDistance = Math.hypot(
      arranged[0].position.x - badges[0].anchor.x,
      arranged[0].position.y - badges[0].anchor.y,
    );
    const fallbackDistance = Math.hypot(
      badges[0].position.x - badges[0].anchor.x,
      badges[0].position.y - badges[0].anchor.y,
    );

    assert.ok(arranged[0].position.x < badges[0].anchor.x, JSON.stringify(arranged[0].position));
    assert.ok(anchorDistance < fallbackDistance / 2, `${anchorDistance} should be much closer than ${fallbackDistance}`);

    const refreshed = organizeOverlapBadgeClusters({
      ...options,
      badges: [{ ...badges[0], position: { x: 1400, y: 900 } }],
      lockedLayouts: lockedLayoutsFor(arranged),
    });
    assert.deepEqual(refreshed[0].position, arranged[0].position);
  });

  it("measures a singleton badge against its full overlap corridor instead of only its midpoint", () => {
    const placementAnchors = [
      { x: 2934, y: 1810 },
      { x: 3068, y: 1892 },
      { x: 3202, y: 1974 },
      { x: 3336, y: 2056 },
      { x: 3470, y: 2137 },
      { x: 3604, y: 2220 },
      { x: 3739, y: 2303 },
    ];
    const corridorBoxes = placementAnchors.map((point) => ({
      x: point.x - 54,
      y: point.y - 54,
      width: 108,
      height: 108,
    }));
    const badge = {
      id: "cedarvale-corridor-pill",
      anchor: { x: 3336, y: 2056 },
      placementAnchors,
      position: { x: 3137, y: 2402 },
      size: { width: 255, height: 132 },
    };
    const arranged = organizeOverlapBadgeClusters({
      badges: [badge],
      blockedBoxes: [
        ...corridorBoxes,
        { x: 2411, y: 1844, width: 386, height: 386 },
        { x: 2838, y: 1714, width: 192, height: 192 },
        { x: 2918, y: 2152, width: 507, height: 172 },
        { x: 3300, y: 1700, width: 750, height: 800 },
      ],
      mapBounds: { x: 0, y: 0, width: 8250, height: 4000 },
      gap: 36,
      maxAnchorDistance: 260,
    });
    const distanceToCorridor = (position) => Math.min(...placementAnchors.map((point) => Math.hypot(
      position.x - point.x,
      position.y - point.y,
    )));

    assert.ok(arranged[0].position.x < 3100, JSON.stringify(arranged[0].position));
    assert.ok(arranged[0].position.y > 1950 && arranged[0].position.y < 2150, JSON.stringify(arranged[0].position));
    assert.ok(
      distanceToCorridor(arranged[0].position) < distanceToCorridor(badge.position) / 2,
      `${distanceToCorridor(arranged[0].position)} should be much closer than ${distanceToCorridor(badge.position)}`,
    );
  });

  it("keeps an existing neighborhood locked when a distant badge appears", () => {
    const badges = [
      { id: "a", anchor: { x: 400, y: 400 }, position: { x: 300, y: 300 }, size: { width: 132, height: 132 } },
      { id: "b", anchor: { x: 480, y: 430 }, position: { x: 620, y: 500 }, size: { width: 132, height: 132 } },
    ];
    const options = {
      blockedBoxes: [],
      mapBounds: { x: 0, y: 0, width: 1800, height: 1200 },
      gap: 36,
      maxAnchorDistance: 260,
    };
    const first = organizeOverlapBadgeClusters({ badges, ...options });
    const next = organizeOverlapBadgeClusters({
      ...options,
      badges: [
        ...badges.map((badge) => ({ ...badge, position: { x: 900, y: 900 } })),
        { id: "distant", anchor: { x: 1550, y: 950 }, position: { x: 1500, y: 900 }, size: { width: 132, height: 132 } },
      ],
      lockedLayouts: lockedLayoutsFor(first),
    });

    assert.deepEqual(
      new Map(next.filter((badge) => badge.id !== "distant").map((badge) => [badge.id, badge.position])),
      new Map(first.map((badge) => [badge.id, badge.position])),
    );
  });

  it("recomputes only when a badge is added within the locked neighborhood", () => {
    const badges = [
      { id: "a", anchor: { x: 400, y: 400 }, position: { x: 300, y: 300 }, size: { width: 132, height: 132 } },
      { id: "b", anchor: { x: 480, y: 430 }, position: { x: 620, y: 500 }, size: { width: 132, height: 132 } },
    ];
    const options = {
      blockedBoxes: [],
      mapBounds: { x: 0, y: 0, width: 1200, height: 900 },
      gap: 36,
      maxAnchorDistance: 260,
    };
    const first = organizeOverlapBadgeClusters({ badges, ...options });
    const next = organizeOverlapBadgeClusters({
      ...options,
      badges: [
        ...badges,
        { id: "nearby", anchor: { x: 440, y: 500 }, position: { x: 520, y: 650 }, size: { width: 132, height: 132 } },
      ],
      lockedLayouts: lockedLayoutsFor(first),
    });

    assert.equal(new Set(next.map((badge) => badge.layoutKey)).size, 1);
    assert.notDeepEqual(
      new Map(next.filter((badge) => badge.id !== "nearby").map((badge) => [badge.id, badge.position])),
      new Map(first.map((badge) => [badge.id, badge.position])),
    );
  });

  it("recomputes a locked neighborhood when one of its badges is removed", () => {
    const badges = [
      { id: "a", anchor: { x: 400, y: 400 }, position: { x: 300, y: 300 }, size: { width: 132, height: 132 } },
      { id: "b", anchor: { x: 480, y: 430 }, position: { x: 620, y: 500 }, size: { width: 132, height: 132 } },
      { id: "c", anchor: { x: 440, y: 500 }, position: { x: 520, y: 650 }, size: { width: 132, height: 132 } },
    ];
    const options = {
      blockedBoxes: [],
      mapBounds: { x: 0, y: 0, width: 1200, height: 900 },
      gap: 36,
      maxAnchorDistance: 260,
    };
    const first = organizeOverlapBadgeClusters({ badges, ...options });
    const next = organizeOverlapBadgeClusters({
      ...options,
      badges: badges.slice(0, 2),
      lockedLayouts: lockedLayoutsFor(first),
    });

    assert.notEqual(next[0].layoutKey, first[0].layoutKey);
    assert.ok(Math.abs(badgeEdgeGap(next[0], next[1]) - 36) < 0.001);
  });

  it("does not merge distant alert neighborhoods just because their fallback badges are close", () => {
    const badges = [
      {
        id: "station:cedarvale",
        anchor: { x: 2933.924, y: 1810 },
        position: { x: 2977.898, y: 2379.246 },
        size: { width: 255, height: 132 },
      },
      {
        id: "station:st-clair-west",
        anchor: { x: 3470.279, y: 2137.114 },
        position: { x: 3208.898, y: 2379.246 },
        size: { width: 132, height: 132 },
      },
    ];
    const arranged = organizeOverlapBadgeClusters({
      badges,
      blockedBoxes: [],
      mapBounds: { x: 0, y: 0, width: 8250, height: 4000 },
      gap: 36,
      maxAnchorDistance: 260,
    });

    assert.ok(badgeEdgeGap(badges[0], badges[1]) < 260);
    assert.ok(Math.hypot(
      badges[0].anchor.x - badges[1].anchor.x,
      badges[0].anchor.y - badges[1].anchor.y,
    ) > 600);
    assert.equal(new Set(arranged.map((badge) => badge.layoutKey)).size, 2);
    assert.deepEqual(arranged.map((badge) => badge.position), badges.map((badge) => badge.anchor));
  });

  it("searches outward from alert anchors before retaining a distant fallback cluster", () => {
    const badges = [
      {
        id: "top",
        anchor: { x: 400, y: 300 },
        position: { x: 1400, y: 300 },
        size: { width: 132, height: 132 },
      },
      {
        id: "combined",
        anchor: { x: 410, y: 470 },
        position: { x: 1400, y: 590 },
        size: { width: 255, height: 132 },
      },
      {
        id: "right",
        anchor: { x: 610, y: 385 },
        position: { x: 1650, y: 445 },
        size: { width: 132, height: 132 },
      },
    ];
    const arranged = organizeOverlapBadgeClusters({
      badges,
      blockedBoxes: [{ x: 330, y: 0, width: 280, height: 900 }],
      mapBounds: { x: 0, y: 0, width: 2400, height: 900 },
      gap: 36,
      maxAnchorDistance: 440,
    });
    const arrangedCenter = {
      x: arranged.reduce((sum, badge) => sum + badge.position.x, 0) / arranged.length,
      y: arranged.reduce((sum, badge) => sum + badge.position.y, 0) / arranged.length,
    };
    const anchorCenter = {
      x: badges.reduce((sum, badge) => sum + badge.anchor.x, 0) / badges.length,
      y: badges.reduce((sum, badge) => sum + badge.anchor.y, 0) / badges.length,
    };
    const fallbackCenter = {
      x: badges.reduce((sum, badge) => sum + badge.position.x, 0) / badges.length,
      y: badges.reduce((sum, badge) => sum + badge.position.y, 0) / badges.length,
    };

    assert.ok(
      Math.hypot(arrangedCenter.x - anchorCenter.x, arrangedCenter.y - anchorCenter.y) < 500,
      `expected cluster near alert anchors, got ${JSON.stringify(arrangedCenter)}`,
    );
    assert.ok(
      Math.hypot(arrangedCenter.x - anchorCenter.x, arrangedCenter.y - anchorCenter.y)
        < Math.hypot(fallbackCenter.x - anchorCenter.x, fallbackCenter.y - anchorCenter.y),
    );
  });

  it("keeps station labels as hard obstacles while preserving equal visual gaps", () => {
    const badges = [
      {
        id: "wilson",
        anchor: { x: 2932, y: 1234 },
        position: { x: 3787, y: 1353 },
        size: { width: 132, height: 132 },
      },
      {
        id: "yorkdale",
        anchor: { x: 2932, y: 1371 },
        position: { x: 3712, y: 1633 },
        size: { width: 132, height: 132 },
      },
      {
        id: "lawrence-west",
        anchor: { x: 2932, y: 1507 },
        position: { x: 3507, y: 1428 },
        size: { width: 255, height: 132 },
      },
    ];
    const labelBoxes = [
      { x: 2996, y: 955, width: 407, height: 275 },
      { x: 2996, y: 1055, width: 239, height: 175 },
      { x: 2965, y: 1584, width: 425, height: 175 },
    ];
    const arranged = organizeOverlapBadgeClusters({
      badges,
      blockedBoxes: [
        { x: 2868, y: 1040, width: 128, height: 660 },
        ...labelBoxes,
      ],
      mapBounds: { x: 0, y: 0, width: 8250, height: 4000 },
      gap: 36,
      maxAnchorDistance: 440,
    });
    const arrangedCenterX = arranged.reduce((sum, badge) => sum + badge.position.x, 0) / arranged.length;
    const fallbackCenterX = badges.reduce((sum, badge) => sum + badge.position.x, 0) / badges.length;

    assert.ok(
      arrangedCenterX < fallbackCenterX - 300,
      `expected the label-aware formation to move left toward its alerts, got ${arrangedCenterX}`,
    );
    assert.ok(
      arranged.every((badge) => Math.hypot(
        badge.position.x - badge.anchor.x,
        badge.position.y - badge.anchor.y,
      ) < 650),
    );
    assert.ok(arranged.every((badge) => labelBoxes.every((label) => {
      const badgeBox = {
        x: badge.position.x - badge.size.width / 2 - 10,
        y: badge.position.y - badge.size.height / 2 - 10,
        width: badge.size.width + 20,
        height: badge.size.height + 20,
      };
      return badgeBox.x + badgeBox.width <= label.x
        || badgeBox.x >= label.x + label.width
        || badgeBox.y + badgeBox.height <= label.y
        || badgeBox.y >= label.y + label.height;
    })));
  });

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
