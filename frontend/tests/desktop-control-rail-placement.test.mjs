import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { desktopControlRailFits, placeDesktopControlRail, restingSidebarRight } from "../src/app/desktop-sidebar-state.ts";

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

  it("tucks a second row under the right-hand buttons, right edges aligned", () => {
    // A half-screen tile on a 1440p monitor: 960px map, sidebar edge at 420, buttons 707-944.
    const placement = placeDesktopControlRail({
      containerWidth: 960, workspaceLeft: 420, railWidth: 298, rightControls: { left: 707, right: 944, bottom: 76 },
    });
    assert.deepEqual(placement, { left: 646, top: 88 });
    assert.equal(placement.left + 298, 944);
  });

  it("keeps a second row clear of the sidebar when it can't reach the buttons' edge", () => {
    const placement = placeDesktopControlRail({
      containerWidth: 760, workspaceLeft: 420, railWidth: 330, rightControls: { left: 507, right: 744, bottom: 76 },
    });
    assert.deepEqual(placement, { left: 436, top: 88 });
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

describe("toolbar against a sidebar mid-animation", () => {
  // The sidebar opens, closes and widens with 160ms transitions; the toolbar is placed once,
  // against where it lands, so it glides there instead of chasing the animated edge.
  const sidebar = ({ collapsed = false, rect, width }) => ({
    classList: { contains: (name) => collapsed && name === "desktop-sidebar-container--collapsed" },
    getAttribute: (name) => (name === "aria-hidden" && collapsed ? "true" : null),
    getBoundingClientRect: () => rect,
    style: { getPropertyValue: (name) => (name === "--desktop-sidebar-width" ? width : "") },
  });
  const withWindow = (transform, run) => {
    const saved = { window: globalThis.window, matrix: globalThis.DOMMatrixReadOnly };
    globalThis.window = { getComputedStyle: () => ({ display: "block", transform }) };
    globalThis.DOMMatrixReadOnly = class {
      constructor(value) { this.m41 = Number(value.match(/matrix\(([^)]*)\)/)[1].split(",")[4]); }
    };
    try { run(); } finally {
      globalThis.window = saved.window;
      globalThis.DOMMatrixReadOnly = saved.matrix;
    }
  };

  it("has no edge for a closed sidebar", () => {
    withWindow("none", () => {
      assert.equal(restingSidebarRight(sidebar({ collapsed: true, rect: { left: 68, width: 0 }, width: "420px" })), null);
      assert.equal(restingSidebarRight(null), null);
    });
  });

  it("reads where an opening sidebar lands, not its first frame", () => {
    // First frame of opening: still slid 12px left and only 30px wide.
    withWindow("matrix(1, 0, 0, 1, -12, 0)", () => {
      assert.equal(restingSidebarRight(sidebar({ rect: { left: 68, width: 30 }, width: "420px" })), 500);
    });
  });

  it("reads the width a sidebar is widening to", () => {
    // Station details widen it from 420px to 560px; this frame is part-way.
    withWindow("none", () => {
      assert.equal(restingSidebarRight(sidebar({ rect: { left: 80, width: 470 }, width: "560px" })), 640);
    });
  });
});
