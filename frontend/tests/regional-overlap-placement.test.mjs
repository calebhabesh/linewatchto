import assert from "node:assert/strict";
import { it } from "node:test";
import { regionalCollisionAdjustedOverlapBadges, regionalOverlapBadgeGroups } from "../src/app/regional-map-overlays.ts";
import { regionalBadgeCollisionBox, regionalCollisionIntersectionArea, regionalPathCorridorCollisionBoxes } from "../src/app/regional-map-geometry.ts";

const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const line = {
  getScreenCTM: () => identity,
  getTotalLength: () => 2000,
  getPointAtLength: (distance) => ({ x: distance, y: 1000 }),
};
const svg = {
  getScreenCTM: () => identity,
  querySelectorAll: (selector) => selector.includes("#regional-lines-layer") ? [line] : [],
};
const badge = (id, anchor, position, stable = false) => ({
  markerId: id, anchor, position, hasStablePosition: stable,
  preferredVector: { x: position.x - anchor.x, y: position.y - anchor.y },
  size: { width: 132, height: 132 }, impacts: [],
});

for (const scenario of ["stable", "aligned"]) {
  it(`keeps ${scenario} regional badges clear of unalerted transit lines`, () => {
    const badges = scenario === "stable"
      ? [badge("stable", { x: 1000, y: 650 }, { x: 1000, y: 1000 }, true)]
      : [
        badge("first", { x: 1000, y: 0 }, { x: 1000, y: 275 }, true),
        badge("second", { x: 1000, y: 650 }, { x: 1000, y: 1000 }),
      ];
    const placed = regionalCollisionAdjustedOverlapBadges(svg, badges);
    const corridors = regionalPathCorridorCollisionBoxes(svg, line, 112);
    for (const result of placed) {
      const box = regionalBadgeCollisionBox(result.position, result.size);
      assert.equal(corridors.reduce((total, corridor) => total + regionalCollisionIntersectionArea(box, corridor), 0), 0, result.markerId);
    }
  });
}

it("groups identical overlap sets once while preserving different closure pairs", () => {
  const impact = (cardId) => ({ kind: "planned-closure", cardId });
  const segment = (id, ids) => ({ id, impacts: ids.map(impact) });
  const groups = regionalOverlapBadgeGroups([
    segment("1", ["bloor-stratford", "georgetown-stratford"]),
    segment("2", ["georgetown-stratford", "bloor-stratford"]),
    segment("3", ["bloor-stratford", "bloor-mount-pleasant"]),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].segments.length, 2);
  assert.notEqual(groups[0].signature, groups[1].signature);
});
