import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { placeOverlapBadges } from "../src/components/overlap-badge-placement.ts";

const MAP = { x: 0, y: 0, width: 2000, height: 1200 };
const ROUND = { width: 135, height: 135 };
const PILL = { width: 255, height: 135 };
const CLEARANCE = 10;

function place(badges, obstacles, options = {}) {
  return new Map(placeOverlapBadges({
    badges,
    obstacleLayers: [obstacles],
    mapBounds: MAP,
    siblingGap: 36,
    ...options,
  }).map((placement) => [placement.id, placement]));
}

function badgeBox(position, size, padding = 0) {
  return {
    x: position.x - size.width / 2 - padding,
    y: position.y - size.height / 2 - padding,
    width: size.width + padding * 2,
    height: size.height + padding * 2,
  };
}

function edgeGap(first, second) {
  const horizontal = Math.max(first.x - (second.x + second.width), second.x - (first.x + first.width), 0);
  const vertical = Math.max(first.y - (second.y + second.height), second.y - (first.y + first.height), 0);
  return Math.hypot(horizontal, vertical);
}

function boxPointDistance(box, point) {
  const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width));
  const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height));
  return Math.hypot(dx, dy);
}

function sampleLine(start, end, spacing = 10) {
  const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / spacing));
  return Array.from({ length: steps + 1 }, (_unused, index) => ({
    x: start.x + ((end.x - start.x) * index) / steps,
    y: start.y + ((end.y - start.y) * index) / steps,
  }));
}

function nearestTargetGap(position, size, targets) {
  const box = badgeBox(position, size);
  return Math.min(...targets.map((target) => boxPointDistance(box, target)));
}

describe("overlap badge placement", () => {
  // A diagonal line next to a horizontal one leaves a wedge-shaped nook. The
  // old placement blocked the diagonal's whole bounding box, which hid the nook.
  const horizontal = { polyline: [{ x: 0, y: 300 }, { x: 2000, y: 300 }], radius: 50 };
  const diagonal = { polyline: [{ x: 400, y: 300 }, { x: 1000, y: 900 }], radius: 50 };
  const diagonalTargets = sampleLine({ x: 400, y: 300 }, { x: 1000, y: 900 });
  // The middle of the diagonal, away from where it meets the horizontal line.
  const middleTargets = sampleLine({ x: 600, y: 500 }, { x: 800, y: 700 });

  it("tucks a badge into the nook beside a diagonal line", () => {
    const placement = place([{ id: "rsz", size: ROUND, targets: diagonalTargets }], [horizontal, diagonal]).get("rsz");
    const box = badgeBox(placement.position, ROUND);

    assert.equal(placement.collisionAvoided, true);
    for (const line of [horizontal, diagonal]) {
      const samples = sampleLine(line.polyline[0], line.polyline[1], 5);
      assert.ok(Math.min(...samples.map((point) => boxPointDistance(box, point))) >= line.radius);
    }
    // A box corner beside a 45-degree line: line radius, clearance, and one grid cell.
    assert.ok(nearestTargetGap(placement.position, ROUND, diagonalTargets) < 90);
  });

  it("lands closer to a diagonal line than its bounding box would allow", () => {
    const corridorPlacement = place(
      [{ id: "rsz", size: ROUND, targets: middleTargets }],
      [horizontal, diagonal],
    ).get("rsz");
    const boundingBoxPlacement = place(
      [{ id: "rsz", size: ROUND, targets: middleTargets }],
      [horizontal, { x: 350, y: 250, width: 700, height: 700 }],
    ).get("rsz");

    assert.ok(nearestTargetGap(corridorPlacement.position, ROUND, middleTargets) < 90);
    assert.ok(nearestTargetGap(boundingBoxPlacement.position, ROUND, middleTargets) > 200);
  });

  it("uses the open space beside a rotated label without covering it", () => {
    // A 45-degree label whose axis-aligned bounds would cover its target point.
    const label = { polygon: [{ x: 600, y: 400 }, { x: 640, y: 360 }, { x: 940, y: 660 }, { x: 900, y: 700 }], padding: 18 };
    const target = { x: 640, y: 600 };
    const placement = place([{ id: "station", size: ROUND, targets: [target] }], [label]).get("station");
    const box = badgeBox(placement.position, ROUND);
    const edges = label.polygon.flatMap((point, index) => (
      sampleLine(point, label.polygon[(index + 1) % label.polygon.length], 5)
    ));

    assert.ok(edges.every((point) => boxPointDistance(box, point) >= label.padding));
    assert.ok(boxPointDistance(box, target) < 40);
  });

  it("prefers a tight clear pocket beside its overlay over open space farther away", () => {
    // Everything around the target is blocked except one small pocket on its
    // left; the open half of the map is much farther away.
    const target = { x: 700, y: 600 };
    const obstacles = [
      { x: 0, y: 0, width: 1000, height: 400 },
      { x: 0, y: 800, width: 1000, height: 400 },
      { x: 0, y: 400, width: 470, height: 400 },
      { x: 650, y: 400, width: 350, height: 400 },
      { x: 470, y: 400, width: 180, height: 110 },
      { x: 470, y: 690, width: 180, height: 110 },
    ];
    const placement = place([{ id: "station", size: ROUND, targets: [target] }], obstacles).get("station");

    assert.equal(placement.collisionAvoided, true);
    assert.ok(Math.abs(placement.position.x - 560) <= 10, JSON.stringify(placement.position));
    assert.ok(Math.abs(placement.position.y - 600) <= 10, JSON.stringify(placement.position));
  });

  it("aligns neighbouring badges in a row or column with an exact sibling gap", () => {
    const badges = [
      { id: "station", size: PILL, targets: [{ x: 1000, y: 600 }] },
      { id: "segment", size: ROUND, targets: sampleLine({ x: 1000, y: 600 }, { x: 1000, y: 700 }) },
    ];
    const placements = place(badges, []);
    const station = placements.get("station");
    const segment = placements.get("segment");

    assert.equal(station.groupId, segment.groupId);
    assert.ok(
      Math.abs(station.position.x - segment.position.x) < 0.001
        || Math.abs(station.position.y - segment.position.y) < 0.001,
    );
    assert.ok(Math.abs(edgeGap(badgeBox(station.position, PILL), badgeBox(segment.position, ROUND)) - 36) < 0.001);
  });

  it("gives three neighbouring badges equal gaps and never overlaps them", () => {
    const badges = ["a", "b", "c"].map((id, index) => ({
      id,
      size: index === 1 ? PILL : ROUND,
      targets: [{ x: 1000 + index * 40, y: 600 }],
    }));
    const placements = [...place(badges, []).values()];
    const boxes = placements.map((placement) => badgeBox(placement.position, badges.find((badge) => badge.id === placement.id).size));
    const gaps = boxes.flatMap((box, index) => boxes.slice(index + 1).map((other) => edgeGap(box, other)));

    assert.equal(new Set(placements.map((placement) => placement.groupId)).size, 1);
    assert.ok(gaps.every((gap) => gap >= 36 - 0.001), JSON.stringify(gaps));
    assert.ok(gaps.filter((gap) => Math.abs(gap - 36) < 0.001).length >= 2, JSON.stringify(gaps));
  });

  it("places neighbours separately when no aligned formation fits near their overlays", () => {
    // Two pockets separated by a thin wall: each badge fits in its own pocket,
    // but no row or column with the standard gap fits anywhere nearby.
    const obstacles = [
      { x: 0, y: 0, width: 570, height: 1200 },
      { x: 740, y: 0, width: 1260, height: 1200 },
      { x: 570, y: 0, width: 170, height: 410 },
      { x: 570, y: 590, width: 170, height: 20 },
      { x: 570, y: 790, width: 170, height: 410 },
    ];
    const placements = place([
      { id: "upper", size: ROUND, targets: [{ x: 500, y: 500 }] },
      { id: "lower", size: ROUND, targets: [{ x: 500, y: 700 }] },
    ], obstacles);

    assert.ok(Math.abs(placements.get("upper").position.y - 500) <= 10);
    assert.ok(Math.abs(placements.get("lower").position.y - 700) <= 10);
    assert.notEqual(placements.get("upper").groupId, placements.get("lower").groupId);
    assert.ok([...placements.values()].every((placement) => placement.collisionAvoided));
  });

  it("keeps a badge from reading as part of another alert's overlay", () => {
    // Every spot on the ring around the target is equally close to it. Other
    // alerts' overlays run just above, right of, and below the ring, so only
    // the left side reads as belonging to this badge.
    const target = { x: 500, y: 600 };
    const foreignTargets = [
      ...sampleLine({ x: 0, y: 150 }, { x: 1000, y: 150 }),
      ...sampleLine({ x: 1000, y: 150 }, { x: 1000, y: 1050 }),
      ...sampleLine({ x: 0, y: 1050 }, { x: 1000, y: 1050 }),
    ];
    const ring = [{ polyline: [target], radius: 260 }];
    const withoutForeign = place([{ id: "station", size: ROUND, targets: [target] }], ring).get("station");
    const placement = place([{ id: "station", size: ROUND, targets: [target], foreignTargets }], ring).get("station");

    assert.ok(withoutForeign.position.x > 300, JSON.stringify(withoutForeign.position));
    assert.ok(placement.position.x < 300, JSON.stringify(placement.position));
  });

  it("stays inside the map and reports when no clear spot exists", () => {
    const placement = place(
      [{ id: "station", size: ROUND, targets: [{ x: 20, y: 20 }] }],
      [{ x: 0, y: 0, width: 2000, height: 1200 }],
    ).get("station");
    const box = badgeBox(placement.position, ROUND, CLEARANCE);

    assert.equal(placement.collisionAvoided, false);
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 2000 && box.y + box.height <= 1200);
  });

  it("returns the same layout regardless of input order or cached obstacle layers", () => {
    const badges = [
      { id: "a", size: ROUND, targets: diagonalTargets.slice(0, 20) },
      { id: "b", size: PILL, targets: diagonalTargets.slice(30) },
      { id: "c", size: ROUND, targets: [{ x: 1500, y: 500 }] },
    ];
    const obstacles = [horizontal, diagonal];
    const first = placeOverlapBadges({ badges, obstacleLayers: [obstacles], mapBounds: MAP, siblingGap: 36 });
    const reversed = placeOverlapBadges({ badges: [...badges].reverse(), obstacleLayers: [obstacles], mapBounds: MAP, siblingGap: 36 });
    const fresh = placeOverlapBadges({ badges, obstacleLayers: [[...obstacles]], mapBounds: MAP, siblingGap: 36 });

    assert.deepEqual(reversed, first);
    assert.deepEqual(fresh, first);
  });
});
