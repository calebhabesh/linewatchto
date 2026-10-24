import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { placeOverlapChooser } from "../src/components/overlap-chooser-placement.ts";

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const CARD = { width: 420, height: 332 };
const PHONE_CARD = { width: 240, height: 312 };

function cardBox(placement) {
  return { x: placement.left, y: placement.top, width: placement.width, height: placement.height };
}

function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function gap(a, b) {
  const horizontal = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  const vertical = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
  return Math.hypot(horizontal, vertical);
}

function coversCorridor(box, corridor) {
  // Sample the corridor centreline; any sample within the radius of the box counts.
  const [start, end] = corridor.polyline;
  for (let step = 0; step <= 100; step += 1) {
    const point = { x: start.x + ((end.x - start.x) * step) / 100, y: start.y + ((end.y - start.y) * step) / 100 };
    const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width));
    const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height));
    if (Math.hypot(dx, dy) < corridor.radius) return true;
  }
  return false;
}

describe("overlap chooser placement", () => {
  const badgeBox = { x: 700, y: 430, width: 40, height: 40 };

  it("opens right next to its badge without covering it", () => {
    const placement = placeOverlapChooser({
      viewportSize: DESKTOP,
      badgeBox,
      affectedArea: [],
      keepouts: [],
      requestedSize: CARD,
    });
    const card = cardBox(placement);

    assert.deepEqual({ width: placement.width, height: placement.height }, CARD);
    assert.ok(!intersects(card, badgeBox));
    assert.ok(gap(card, badgeBox) <= 30, `card is ${gap(card, badgeBox)}px away`);
  });

  it("opens on the side away from the alerts it lists so they stay visible", () => {
    // The badge sits just above a long horizontal overlay.
    const corridor = { polyline: [{ x: 100, y: 500 }, { x: 1340, y: 500 }], radius: 14 };
    const placement = placeOverlapChooser({
      viewportSize: DESKTOP,
      badgeBox,
      affectedArea: [corridor],
      keepouts: [],
      requestedSize: CARD,
    });

    assert.equal(placement.coversAffectedArea, false);
    assert.ok(!coversCorridor(cardBox(placement), corridor));
    assert.ok(placement.top + placement.height <= 500 - corridor.radius, "card should stay on the badge's side of the overlay");
    assert.ok(gap(cardBox(placement), badgeBox) <= 30);
  });

  it("opens over other badges rather than moving away from its own", () => {
    // Other badges are not inputs at all, so a crowded neighbourhood never
    // pushes the card away; this pins that contract.
    const placement = placeOverlapChooser({
      viewportSize: DESKTOP,
      badgeBox,
      affectedArea: [],
      keepouts: [],
      requestedSize: CARD,
    });
    assert.ok(gap(cardBox(placement), badgeBox) <= 30);
  });

  it("never covers phone keep-outs, narrowing between side controls", () => {
    const keepouts = [
      { x: 0, y: 0, width: 390, height: 120 },
      { x: 0, y: 600, width: 390, height: 244 },
      { x: 0, y: 120, width: 56, height: 480 },
      { x: 330, y: 120, width: 60, height: 480 },
    ];
    const placement = placeOverlapChooser({
      viewportSize: PHONE,
      badgeBox: { x: 180, y: 360, width: 30, height: 30 },
      affectedArea: [],
      keepouts,
      requestedSize: PHONE_CARD,
    });
    const card = cardBox(placement);

    assert.ok(keepouts.every((box) => !intersects(card, box)), JSON.stringify(card));
    assert.ok(placement.width <= 330 - 56 - 16);
  });

  it("keeps a usable height on a phone, covering the overlays only as a last resort", () => {
    // Overlays fill every open band around the badge; the only spots that
    // avoid them are too short to read as a list.
    const keepouts = [
      { x: 0, y: 0, width: 390, height: 120 },
      { x: 0, y: 640, width: 390, height: 204 },
    ];
    const affectedArea = [
      { polyline: [{ x: 0, y: 260 }, { x: 390, y: 260 }], radius: 10 },
      { polyline: [{ x: 0, y: 420 }, { x: 390, y: 420 }], radius: 10 },
      { polyline: [{ x: 0, y: 540 }, { x: 390, y: 540 }], radius: 10 },
    ];
    const placement = placeOverlapChooser({
      viewportSize: PHONE,
      badgeBox: { x: 180, y: 330, width: 30, height: 30 },
      affectedArea,
      keepouts,
      requestedSize: PHONE_CARD,
    });
    const card = cardBox(placement);

    assert.ok(placement.height >= 220, `card shrank to ${placement.height}px`);
    assert.equal(placement.coversAffectedArea, true);
    assert.ok(keepouts.every((box) => !intersects(card, box)));
    assert.ok(!intersects(card, { x: 180, y: 330, width: 30, height: 30 }));
  });

  it("reports where the badge sits relative to the card for its pointer", () => {
    const placement = placeOverlapChooser({
      viewportSize: DESKTOP,
      badgeBox,
      affectedArea: [],
      keepouts: [],
      requestedSize: CARD,
    });
    const cardCenter = { x: placement.left + placement.width / 2, y: placement.top + placement.height / 2 };
    assert.equal(placement.anchorOffsetX, 720 - cardCenter.x);
    assert.equal(placement.anchorOffsetY, 450 - cardCenter.y);
  });
});
