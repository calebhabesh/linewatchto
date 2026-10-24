import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAP_VIEWBOX_BOUNDS,
  MAP_SVG_TO_CSS_SCALE,
  OVERLAP_CHOOSER_WIDTH,
  OVERLAP_CHOOSER_MOBILE_BREAKPOINT,
  OVERLAP_CHOOSER_MOBILE_WIDTH,
  boundsForBadgePosition,
  expandBox,
  boundsListsMatch,
  boundsContainingBoxes,
  overlapChooserSize,
  overlapChooserScreenLayout,
} from "../src/components/ttc-chooser-placement.ts";
import { getImpactPriority } from "../src/app/map-alert-selector.ts";

describe("TTC Chooser Placement - Sizing and Priority", () => {
  it("maintains layout constants contract", () => {
    assert.deepEqual(MAP_VIEWBOX_BOUNDS, { x: 0, y: 0, width: 8250, height: 4000 });
    assert.equal(MAP_SVG_TO_CSS_SCALE, 4500 / 8250);
    assert.equal(OVERLAP_CHOOSER_MOBILE_BREAKPOINT, 640);
  });

  it("maintains the canonical disruption priority hierarchy", () => {
    assert.ok(getImpactPriority("suspension") > getImpactPriority("delay"));
    assert.ok(getImpactPriority("delay") > getImpactPriority("planned-closure"));
    assert.ok(getImpactPriority("reduced-speed-zone") > getImpactPriority("planned-closure"));
    assert.ok(getImpactPriority("planned-closure") > getImpactPriority("clear"));
  });

  it("calculates desktop chooser dimensions with clamped heights", () => {
    const desktopWidth = 1024;
    const singleImpact = overlapChooserSize(1, desktopWidth);
    assert.equal(singleImpact.width, OVERLAP_CHOOSER_WIDTH);
    assert.equal(singleImpact.height, 68 + 1 * 88);

    const twoImpacts = overlapChooserSize(2, desktopWidth);
    assert.equal(twoImpacts.height, 68 + 2 * 88);

    const manyImpacts = overlapChooserSize(10, desktopWidth);
    assert.equal(manyImpacts.height, 440);
  });

  it("calculates mobile chooser dimensions below mobile breakpoint", () => {
    const mobileWidth = 400;
    const singleImpact = overlapChooserSize(1, mobileWidth);
    assert.equal(singleImpact.width, OVERLAP_CHOOSER_MOBILE_WIDTH);
    assert.equal(singleImpact.height, 56 + 1 * 64);

    const manyImpacts = overlapChooserSize(10, mobileWidth);
    assert.equal(manyImpacts.height, 380);
  });

  it("clamps chooser width when viewport is narrower than standard margin", () => {
    const narrowWidth = 260;
    const size = overlapChooserSize(1, narrowWidth);
    assert.ok(size.width <= narrowWidth - 32);
  });
});

describe("TTC Chooser Placement - Bounding Box and Geometry Helpers", () => {
  it("expands boxes symmetrically by padding", () => {
    const box = { x: 10, y: 20, width: 30, height: 40 };
    const expanded = expandBox(box, 5);
    assert.deepEqual(expanded, { x: 5, y: 15, width: 40, height: 50 });
  });

  it("computes bounds centered on badge position", () => {
    const position = { x: 100, y: 200 };
    const size = { width: 60, height: 40 };
    const bounds = boundsForBadgePosition(position, size);
    assert.deepEqual(bounds, { x: 70, y: 180, width: 60, height: 40 });
  });

  it("compares bounds lists for stable state equality", () => {
    const listA = [{ x: 10, y: 10, width: 20, height: 20 }];
    const listB = [{ x: 10.2, y: 10.1, width: 19.9, height: 20.1 }];
    const listC = [{ x: 15, y: 10, width: 20, height: 20 }];

    assert.equal(boundsListsMatch(listA, listB), true);
    assert.equal(boundsListsMatch(listA, listC), false);
    assert.equal(boundsListsMatch(listA, []), false);
  });

  it("computes enclosing bounds for multiple boxes", () => {
    assert.equal(boundsContainingBoxes([]), null);
    const boxes = [
      { x: 10, y: 20, width: 30, height: 40 },
      { x: 5, y: 50, width: 10, height: 10 },
    ];
    const enclosing = boundsContainingBoxes(boxes);
    assert.deepEqual(enclosing, { x: 5, y: 20, width: 35, height: 40 });
  });
});

function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe("TTC Chooser Placement - Screen Layout", () => {
  // Identity-ish transform: one map unit is MAP_SVG_TO_CSS_SCALE pixels.
  const transform = { x: 0, y: 0, scale: 1 / MAP_SVG_TO_CSS_SCALE };

  it("opens beside the badge, inside the viewport margins", () => {
    const viewport = { width: 1200, height: 900 };
    const layout = overlapChooserScreenLayout({
      position: { x: 600, y: 450 },
      size: { width: 60, height: 60 },
      chooserSize: { width: 360, height: 244 },
      affectedOutlines: [],
    }, transform, viewport, []);
    const badge = { x: 570, y: 420, width: 60, height: 60 };
    const card = { x: layout.left, y: layout.top, width: layout.width, height: layout.height };
    const gap = Math.max(card.x - (badge.x + badge.width), badge.x - (card.x + card.width), card.y - (badge.y + badge.height), badge.y - (card.y + card.height));

    assert.equal(layout.width, 360);
    assert.equal(layout.height, 244);
    assert.ok(!intersects(card, badge));
    assert.ok(gap <= 40, `card is ${gap}px from its badge`);
    assert.equal(layout.coversAffectedArea, false);
  });

  it("keeps the alert overlays it lists uncovered when there is room", () => {
    const viewport = { width: 1200, height: 900 };
    // A horizontal overlay passing just above the badge.
    const layout = overlapChooserScreenLayout({
      position: { x: 600, y: 450 },
      size: { width: 60, height: 60 },
      chooserSize: { width: 360, height: 244 },
      affectedOutlines: [{ polyline: [{ x: 100, y: 380 }, { x: 1100, y: 380 }], halfWidth: 20 }],
    }, transform, viewport, []);

    assert.ok(layout.top >= 400, `card should open below the overlay, got top ${layout.top}`);
    assert.equal(layout.coversAffectedArea, false);
  });

  it("stays clear of keep-outs at a viewport edge", () => {
    const viewport = { width: 800, height: 600 };
    const keepouts = [{ x: 0, y: 0, width: 800, height: 80 }];
    const layout = overlapChooserScreenLayout({
      position: { x: 60, y: 120 },
      size: { width: 60, height: 60 },
      chooserSize: { width: 360, height: 244 },
      affectedOutlines: [],
    }, transform, viewport, keepouts);
    const card = { x: layout.left, y: layout.top, width: layout.width, height: layout.height };

    assert.ok(layout.left >= 16 && layout.top >= 16);
    assert.ok(layout.left + layout.width <= viewport.width - 16);
    assert.ok(layout.top + layout.height <= viewport.height - 16);
    assert.ok(!intersects(card, expandBox(keepouts[0], 8)));
  });
});

describe("compact mobile chooser keepouts", () => {
  it("keeps inset margins even on viewports narrower than the minimum card width", () => {
    const viewportWidth = 250;
    assert.ok(overlapChooserSize(2, viewportWidth).width <= viewportWidth - 32);
  });

  it("narrows the chooser to fit between side controls before overlapping them", () => {
    const viewport = { width: 360, height: 600 };
    const keepouts = [
      { x: 0, y: 0, width: 360, height: 120 },
      { x: 0, y: 500, width: 360, height: 100 },
      { x: 0, y: 120, width: 52, height: 380 },
      { x: 308, y: 120, width: 52, height: 380 },
    ];
    const layout = overlapChooserScreenLayout({
      position: { x: 180, y: 280 },
      size: { width: 30, height: 30 },
      chooserSize: overlapChooserSize(3, viewport.width),
      affectedOutlines: [],
    }, { x: 0, y: 0, scale: 1 / MAP_SVG_TO_CSS_SCALE }, viewport, keepouts);
    const bounds = { x: layout.left, y: layout.top, width: layout.width, height: layout.height };
    assert.equal(layout.width, 240);
    assert.ok(keepouts.every((box) => !intersects(bounds, expandBox(box, 8))));
  });
});
