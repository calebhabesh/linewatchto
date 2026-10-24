import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { placeOverlapBadges } from "../src/components/overlap-badge-placement.ts";

// Real TTC map geometry (labels, line corridors, alert overlays) and the
// overlap badges that live alerts produced on 2026-10-23. Points are [x, y];
// obstacles are polylines (l, r), rotated label polygons (g, p), or boxes (b).
const fixture = JSON.parse(readFileSync(new URL("./fixtures/ttc-overlap-placement.json", import.meta.url), "utf8"));
const point = ([x, y]) => ({ x, y });
const obstacles = fixture.obstacles.map((obstacle) => {
  if (obstacle.l) return { polyline: obstacle.l.map(point), radius: obstacle.r };
  if (obstacle.g) return { polygon: obstacle.g.map(point), padding: obstacle.p };
  const [x, y, width, height] = obstacle.b;
  return { x, y, width, height };
});
const badges = fixture.badges.map((badge) => ({
  id: badge.id,
  size: { width: badge.size[0], height: badge.size[1] },
  targets: badge.targets.map(point),
  ...(badge.anchor ? { anchor: point(badge.anchor) } : {}),
}));
const placements = new Map(placeOverlapBadges({
  badges,
  obstacleLayers: [obstacles],
  mapBounds: { x: 0, y: 0, width: 8250, height: 4000 },
  siblingGap: 36,
}).map((placement) => [placement.id, placement]));

function badgeBox(id) {
  const { size } = badges.find((badge) => badge.id === id);
  const { position } = placements.get(id);
  return { x: position.x - size.width / 2, y: position.y - size.height / 2, width: size.width, height: size.height };
}

function gapToTargets(id) {
  const box = badgeBox(id);
  return Math.min(...badges.find((badge) => badge.id === id).targets.map((target) => Math.hypot(
    Math.max(box.x - target.x, 0, target.x - (box.x + box.width)),
    Math.max(box.y - target.y, 0, target.y - (box.y + box.height)),
  )));
}

describe("overlap badge placement on the real TTC map", () => {
  it("finds a clear spot for every badge, close to its own overlay", () => {
    for (const badge of badges) {
      assert.equal(placements.get(badge.id).collisionAvoided, true, badge.id);
      assert.ok(gapToTargets(badge.id) < 200, `${badge.id} is ${gapToTargets(badge.id)} units from its overlay`);
    }
  });

  it("never overlaps two badges", () => {
    const boxes = badges.map((badge) => badgeBox(badge.id));
    boxes.forEach((box, index) => boxes.slice(index + 1).forEach((other) => {
      assert.ok(
        box.x + box.width <= other.x || other.x + other.width <= box.x
          || box.y + box.height <= other.y || other.y + other.height <= box.y,
      );
    }));
  });

  it("tucks St Clair West's badge into the wedge beside its reduced speed zone", () => {
    // The open wedge between Line 5, the Cedarvale-Dupont diagonal, and the
    // St Clair West label. Bounding-box obstacles used to hide it entirely.
    const { position } = placements.get("station:st-clair-west");
    assert.ok(position.x > 2800 && position.x < 3094, JSON.stringify(position));
    assert.ok(position.y > 1888 && position.y < 2154, JSON.stringify(position));
  });

  it("centres a station badge on its station instead of the end of a line", () => {
    // Jane station sits at x = 1761 on Line 2.
    assert.ok(Math.abs(placements.get("station:jane").position.x - 1761) < 60);
  });
});
