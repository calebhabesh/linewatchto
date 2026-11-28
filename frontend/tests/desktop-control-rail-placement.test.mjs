import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { desktopControlRailFits, placeDesktopControlRail } from "../src/app/desktop-sidebar-state.ts";

describe("desktop toolbar placement", () => {
  it("sits midway between an open sidebar and the right-hand buttons", () => {
    const placement = placeDesktopControlRail({
      containerWidth: 1840, workspaceLeft: 420, railWidth: 674, rightControls: { left: 1470, bottom: 81 },
    });
    assert.deepEqual(placement, { left: 608, top: 20 });
    assert.equal(placement.left - 420, 1470 - (placement.left + 674));
  });

  it("keeps the gaps even on a laptop window, where centering over the map crowds the sidebar", () => {
    // 1680px window at 133%: 1600px map, sidebar edge at 420, buttons at 1241. Centered over the
    // map it sat 45px from the sidebar and 106px from the buttons.
    const placement = placeDesktopControlRail({
      containerWidth: 1600, workspaceLeft: 420, railWidth: 670, rightControls: { left: 1241, bottom: 81 },
    });
    const leftGap = placement.left - 420;
    const rightGap = 1241 - (placement.left + 670);
    assert.equal(placement.top, 20);
    assert.ok(Math.abs(leftGap - rightGap) <= 1, `${leftGap} vs ${rightGap}`);
  });

  it("is centered over the whole map when the sidebar is collapsed", () => {
    const placement = placeDesktopControlRail({
      containerWidth: 1840, workspaceLeft: 0, railWidth: 674, rightControls: { left: 1470, bottom: 81 },
    });
    assert.deepEqual(placement, { left: Math.round((1840 - 674) / 2), top: 20 });
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

  it("reports a second row that still runs past a narrow window", () => {
    // 900px window: 820px map, 420px floating sidebar, 552px compact toolbar.
    const placement = placeDesktopControlRail({
      containerWidth: 820, workspaceLeft: 420, railWidth: 552, rightControls: { left: 567, bottom: 81 },
    });
    assert.equal(desktopControlRailFits({ containerWidth: 820, left: placement.left, railWidth: 552 }), false);
    const narrower = placeDesktopControlRail({
      containerWidth: 820, workspaceLeft: 420, railWidth: 330, rightControls: { left: 567, bottom: 81 },
    });
    assert.equal(desktopControlRailFits({ containerWidth: 820, left: narrower.left, railWidth: 330 }), true);
  });
});
