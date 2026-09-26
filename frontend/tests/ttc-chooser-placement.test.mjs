import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAP_VIEWBOX_BOUNDS,
  MAP_SVG_TO_CSS_SCALE,
  OVERLAP_CHOOSER_WIDTH,
  OVERLAP_CHOOSER_MOBILE_BREAKPOINT,
  OVERLAP_CHOOSER_MOBILE_WIDTH,
  OVERLAP_CHOOSER_TARGET_GAP,
  OVERLAP_CHOOSER_UI_GAP,
  OVERLAP_CHOOSER_MIN_COMPACT_HEIGHT,
  OVERLAP_CHOOSER_HEIGHT_STEP,
  boundsForBadgePosition,
  expandBox,
  boxesIntersect,
  boxIntersectionArea,
  boundsListsMatch,
  boundsContainingBoxes,
  minimumBoundsGap,
  minimumGapToBounds,
  nearestProtectedBoxesToPoint,
  overlapChooserSize,
  clampChooserScreenCoordinate,
  chooserCenterFitsViewport,
  chooserCenterAvoidsProtectedBoxes,
  chooserKeepoutEdgeCandidates,
  chooserKeepoutGridCandidates,
  boundedChooserViewportCandidates,
  scoreChooserScreenCandidate,
  overlapChooserScreenLayout,
} from "../src/components/ttc-chooser-placement.ts";
import { getImpactPriority } from "../src/app/map-alert-selector.ts";

describe("TTC Chooser Placement - Sizing and Priority", () => {
  it("maintains layout constants contract", () => {
    assert.deepEqual(MAP_VIEWBOX_BOUNDS, { x: 0, y: 0, width: 8250, height: 4000 });
    assert.equal(MAP_SVG_TO_CSS_SCALE, 4500 / 8250);
    assert.equal(OVERLAP_CHOOSER_MOBILE_BREAKPOINT, 640);
    assert.equal(OVERLAP_CHOOSER_TARGET_GAP, 16);
    assert.equal(OVERLAP_CHOOSER_UI_GAP, 8);
    assert.equal(OVERLAP_CHOOSER_MIN_COMPACT_HEIGHT, 142);
    assert.equal(OVERLAP_CHOOSER_HEIGHT_STEP, 4);
  });

  it("maintains the canonical disruption priority hierarchy", () => {
    assert.ok(getImpactPriority("suspension") > getImpactPriority("delay"));
    assert.ok(getImpactPriority("delay") > getImpactPriority("planned-closure"));
    assert.ok(getImpactPriority("planned-closure") > getImpactPriority("reduced-speed-zone"));
    assert.ok(getImpactPriority("reduced-speed-zone") > getImpactPriority("clear"));
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
    assert.equal(size.width, 240);
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

  it("detects box intersections correctly", () => {
    const a = { x: 0, y: 0, width: 50, height: 50 };
    const b = { x: 25, y: 25, width: 50, height: 50 };
    const c = { x: 60, y: 60, width: 50, height: 50 };

    assert.equal(boxesIntersect(a, b), true);
    assert.equal(boxesIntersect(a, c), false);
    assert.equal(boxIntersectionArea(a, b), 25 * 25);
    assert.equal(boxIntersectionArea(a, c), 0);
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

  it("computes minimum gaps between bounds", () => {
    const a = { x: 0, y: 0, width: 50, height: 50 };
    const b = { x: 70, y: 0, width: 50, height: 50 };
    assert.equal(minimumBoundsGap(a, b), 20);

    const intersecting = { x: 20, y: 20, width: 50, height: 50 };
    assert.equal(minimumBoundsGap(a, intersecting), 0);
    assert.equal(minimumGapToBounds(a, [b, intersecting]), 0);
  });

  it("finds nearest protected boxes to a point", () => {
    const point = { x: 0, y: 0 };
    const boxes = [
      { x: 100, y: 0, width: 10, height: 10 },
      { x: 20, y: 0, width: 10, height: 10 },
      { x: 50, y: 0, width: 10, height: 10 },
    ];
    const nearest = nearestProtectedBoxesToPoint(boxes, point, 2);
    assert.equal(nearest.length, 2);
    assert.equal(nearest[0].x, 20);
    assert.equal(nearest[1].x, 50);
  });
});

describe("TTC Chooser Placement - Viewport Clamping and Candidates", () => {
  it("clamps screen coordinates within viewport margins", () => {
    const margin = 16;
    const length = 200;
    const viewport = 1000;
    // Minimum allowable center: 16 + 100 = 116
    // Maximum allowable center: 1000 - 16 - 100 = 884
    assert.equal(clampChooserScreenCoordinate(50, length, viewport, margin), 116);
    assert.equal(clampChooserScreenCoordinate(500, length, viewport, margin), 500);
    assert.equal(clampChooserScreenCoordinate(950, length, viewport, margin), 884);
  });

  it("checks whether chooser center fits viewport margins", () => {
    const size = { width: 200, height: 150 };
    const viewport = { width: 1000, height: 800 };
    assert.equal(chooserCenterFitsViewport({ x: 500, y: 400 }, size, viewport, 16), true);
    assert.equal(chooserCenterFitsViewport({ x: 50, y: 400 }, size, viewport, 16), false);
    assert.equal(chooserCenterFitsViewport({ x: 500, y: 50 }, size, viewport, 16), false);
  });

  it("checks whether chooser avoids protected boxes", () => {
    const size = { width: 100, height: 100 };
    const center = { x: 200, y: 200 };
    const blocked = [{ x: 180, y: 180, width: 50, height: 50 }];
    const clear = [{ x: 400, y: 400, width: 50, height: 50 }];

    assert.equal(chooserCenterAvoidsProtectedBoxes(center, size, blocked), false);
    assert.equal(chooserCenterAvoidsProtectedBoxes(center, size, clear), true);
  });

  it("generates bounded viewport candidates within valid bounds", () => {
    const anchor = { x: 500, y: 400 };
    const chooserSize = { width: 300, height: 200 };
    const viewportSize = { width: 1000, height: 800 };
    const candidates = boundedChooserViewportCandidates(anchor, chooserSize, viewportSize, 16);

    assert.ok(candidates.length > 0);
    for (const candidate of candidates) {
      assert.ok(chooserCenterFitsViewport(candidate, chooserSize, viewportSize, 16));
    }
  });

  it("generates edge keepout candidates sorted by distance to proposed point", () => {
    const proposed = { x: 300, y: 300 };
    const chooserSize = { width: 200, height: 150 };
    const viewport = { width: 1000, height: 800 };
    const keepoutBoxes = [{ x: 250, y: 250, width: 100, height: 100 }];

    const edgeCandidates = chooserKeepoutEdgeCandidates(proposed, chooserSize, viewport, keepoutBoxes, 16);
    assert.ok(edgeCandidates.length > 0);
    // Nearest candidate should be closer to proposed than farthest candidate
    const firstDist = Math.hypot(edgeCandidates[0].x - proposed.x, edgeCandidates[0].y - proposed.y);
    const lastDist = Math.hypot(edgeCandidates[edgeCandidates.length - 1].x - proposed.x, edgeCandidates[edgeCandidates.length - 1].y - proposed.y);
    assert.ok(firstDist <= lastDist);
  });

  it("generates grid keepout candidates aligned to keepout boundaries", () => {
    const proposed = { x: 300, y: 300 };
    const chooserSize = { width: 200, height: 150 };
    const viewport = { width: 1000, height: 800 };
    const keepoutBoxes = [{ x: 250, y: 250, width: 100, height: 100 }];

    const gridCandidates = chooserKeepoutGridCandidates(proposed, chooserSize, viewport, keepoutBoxes, 16);
    assert.ok(gridCandidates.length > 0);
    for (const candidate of gridCandidates) {
      assert.ok(chooserCenterFitsViewport(candidate, chooserSize, viewport, 16));
    }
  });

  it("scores candidates with proximity, target gap deviations, and overlap penalty", () => {
    const anchor = { x: 200, y: 200 };
    const chooserSize = { width: 100, height: 100 };
    const closeCenter = { x: 200, y: 316 }; // gap ~ 16
    const farCenter = { x: 200, y: 600 };

    const scoreClose = scoreChooserScreenCandidate(closeCenter, anchor, chooserSize, [], []);
    const scoreFar = scoreChooserScreenCandidate(farCenter, anchor, chooserSize, [], []);
    assert.ok(scoreClose < scoreFar, "Closer candidate with target gap must score lower than distant candidate");
  });
});

describe("TTC Chooser Placement - Full Screen Layout Decision", () => {
  it("lays out chooser adjacent to badge anchor in screen coordinates", () => {
    const badge = {
      position: { x: 4125, y: 2000 },
      chooserPosition: { x: 4125, y: 2300 },
      size: { width: 60, height: 60 },
      chooserSize: { width: 360, height: 244 },
      protectedBoxes: [{ x: 4100, y: 1975, width: 50, height: 50 }],
    };
    const transform = { x: 0, y: 0, scale: 1 };
    const viewport = { width: 1200, height: 900 };

    const layout = overlapChooserScreenLayout(badge, transform, viewport, [], []);

    assert.ok(layout.left >= 16);
    assert.ok(layout.left + layout.width <= viewport.width - 16);
    assert.ok(layout.top >= 16);
    assert.ok(layout.top + layout.height <= viewport.height - 16);
    assert.equal(layout.width, badge.chooserSize.width);
    assert.ok(layout.height <= badge.chooserSize.height);
  });

  it("clamps chooser within viewport when badge is at the extreme edge", () => {
    const badge = {
      position: { x: 100, y: 100 },
      chooserPosition: { x: 0, y: 0 },
      size: { width: 60, height: 60 },
      chooserSize: { width: 360, height: 244 },
      protectedBoxes: [],
    };
    const transform = { x: 0, y: 0, scale: 1 };
    const viewport = { width: 800, height: 600 };

    const layout = overlapChooserScreenLayout(badge, transform, viewport, [], []);

    assert.ok(layout.left >= 16, "Left coordinate must respect 16px screen margin");
    assert.ok(layout.top >= 16, "Top coordinate must respect 16px screen margin");
    assert.ok(layout.left + layout.width <= viewport.width - 16);
    assert.ok(layout.top + layout.height <= viewport.height - 16);
  });

  it("compacts height candidates to clear keepout obstacles when space is constrained", () => {
    const badge = {
      position: { x: 4000, y: 2000 },
      chooserPosition: { x: 4000, y: 2000 },
      size: { width: 60, height: 60 },
      chooserSize: { width: 360, height: 380 },
      protectedBoxes: [],
    };
    const transform = { x: 0, y: 0, scale: 1 };
    // Constrained viewport height
    const viewport = { width: 800, height: 350 };
    // Keepouts that obstruct tall chooser
    const keepouts = [
      { x: 0, y: 0, width: 800, height: 60 },
      { x: 0, y: 260, width: 800, height: 90 },
    ];

    const layout = overlapChooserScreenLayout(badge, transform, viewport, keepouts, []);

    assert.ok(layout.height <= 380);
    assert.ok(layout.top >= 16);
    assert.ok(layout.top + layout.height <= viewport.height - 16);
  });
});
