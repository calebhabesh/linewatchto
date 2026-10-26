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

describe("overlap chooser placement after the camera settles", () => {
  const badgeBox = { x: 700, y: 430, width: 40, height: 40 };
  const input = { viewportSize: DESKTOP, badgeBox, affectedArea: [], keepouts: [], requestedSize: CARD };
  const preferredFrom = (placement, box = badgeBox) => ({
    offsetX: placement.left - (box.x + box.width / 2),
    offsetY: placement.top - (box.y + box.height / 2),
    width: placement.width,
    height: placement.height,
  });

  it("keeps an open card beside its badge when the badge moves and the spot is still clear", () => {
    const opened = placeOverlapChooser(input);
    const moved = { ...badgeBox, x: badgeBox.x - 90, y: badgeBox.y + 40 };
    const settled = placeOverlapChooser({ ...input, badgeBox: moved, preferred: preferredFrom(opened) });
    assert.equal(settled.left, opened.left - 90);
    assert.equal(settled.top, opened.top + 40);
    assert.equal(settled.anchorOffsetX, opened.anchorOffsetX);
    assert.equal(settled.anchorOffsetY, opened.anchorOffsetY);
  });

  it("moves the card once its spot runs off screen, under a control, or over the overlays", () => {
    const opened = placeOverlapChooser(input);
    const preferred = preferredFrom(opened);
    const kept = cardBox(placeOverlapChooser({ ...input, preferred }));

    const offScreenBadge = { ...badgeBox, x: DESKTOP.width - 60 - (kept.x + kept.width - badgeBox.x) + 200 };
    const offScreen = placeOverlapChooser({ ...input, badgeBox: offScreenBadge, preferred });
    assert.ok(offScreen.left + offScreen.width <= DESKTOP.width - 16);

    const control = { x: kept.x + 20, y: kept.y + 20, width: 60, height: 60 };
    const underControl = placeOverlapChooser({ ...input, keepouts: [control], preferred });
    assert.equal(intersects(cardBox(underControl), control), false);

    const corridor = { polyline: [{ x: kept.x - 50, y: kept.y + 40 }, { x: kept.x + kept.width + 50, y: kept.y + 40 }], radius: 12 };
    const overOverlay = placeOverlapChooser({ ...input, affectedArea: [corridor], preferred });
    assert.equal(coversCorridor(cardBox(overOverlay), corridor), false);
  });

  it("keeps a card that must cover the overlays where it is until a clear spot exists", () => {
    const keepouts = [
      { x: 0, y: 0, width: 390, height: 120 },
      { x: 0, y: 640, width: 390, height: 204 },
    ];
    const corridors = (shift) => [260, 420, 540].map((y) => ({
      polyline: [{ x: 0, y: y + shift }, { x: 390, y: y + shift }],
      radius: 10,
    }));
    const phone = { viewportSize: PHONE, keepouts, requestedSize: PHONE_CARD };
    const badgeAt = (shift) => ({ x: 180, y: 330 + shift, width: 30, height: 30 });
    const opened = placeOverlapChooser({ ...phone, badgeBox: badgeAt(0), affectedArea: corridors(0) });
    assert.equal(opened.coversAffectedArea, true);
    const preferred = { ...preferredFrom(opened, badgeAt(0)), coversAffectedArea: true };

    // A small pan: every spot still covers the overlays, so the card stays put.
    const panned = placeOverlapChooser({ ...phone, badgeBox: badgeAt(6), affectedArea: corridors(6), preferred });
    assert.equal(panned.top, opened.top + 6);
    assert.equal(panned.left, opened.left);

    // With the overlays gone from around the badge, a clear spot wins.
    const cleared = placeOverlapChooser({ ...phone, badgeBox: badgeAt(0), affectedArea: [], preferred });
    assert.equal(cleared.coversAffectedArea, false);
  });

  it("does not keep a spot that would cover the badge", () => {
    const preferred = { offsetX: -100, offsetY: -100, width: CARD.width, height: CARD.height };
    const placement = placeOverlapChooser({ ...input, preferred });
    assert.ok(gap(cardBox(placement), badgeBox) >= 12);
  });
});
