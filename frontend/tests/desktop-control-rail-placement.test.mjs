import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { placeDesktopControlRail } from "../src/app/desktop-sidebar-state.ts";

describe("desktop toolbar placement", () => {
  it("stays centered over the whole map when nothing is in the way", () => {
    const placement = placeDesktopControlRail({
      containerWidth: 1840, workspaceLeft: 420, railWidth: 674, rightControls: { left: 1470, bottom: 81 },
    });
    assert.deepEqual(placement, { left: Math.round((1840 - 674) / 2), top: 20 });
  });

  it("moves right to clear an open sidebar", () => {
    const placement = placeDesktopControlRail({
      containerWidth: 1286, workspaceLeft: 420, railWidth: 500, rightControls: { left: 1100, bottom: 81 },
    });
    assert.deepEqual(placement, { left: 436, top: 20 });
  });

  it("moves left to clear the right-hand buttons", () => {
    const placement = placeDesktopControlRail({
      containerWidth: 1840, workspaceLeft: 0, railWidth: 674, rightControls: { left: 1200, bottom: 81 },
    });
    assert.equal(placement.top, 20);
    assert.equal(placement.left + 674, 1200 - 16);
  });

  it("drops to a second row when the gap between sidebar and buttons is too narrow", () => {
    const placement = placeDesktopControlRail({
      containerWidth: 1286, workspaceLeft: 420, railWidth: 674, rightControls: { left: 916, bottom: 81 },
    });
    assert.equal(placement.top, 93);
    assert.ok(placement.left >= 436);
    assert.ok(placement.left + 674 <= 1286 - 16);
  });
});
