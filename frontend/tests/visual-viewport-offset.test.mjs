import assert from "node:assert/strict";
import { test } from "node:test";
import { shellViewportOffsetTop } from "../src/app/visual-viewport-offset.ts";

test("iOS rubber-band offsets never move the shell's fixed chrome", () => {
  // A drag on the legend rubber-bands the page: offsetTop swings both ways.
  assert.equal(shellViewportOffsetTop(-42, false, false), 0);
  assert.equal(shellViewportOffsetTop(37, false, false), 0);
});

test("keyboard and page zoom keep their offset, never negative", () => {
  assert.equal(shellViewportOffsetTop(120, true, false), 120);
  assert.equal(shellViewportOffsetTop(64, false, true), 64);
  assert.equal(shellViewportOffsetTop(-12, true, false), 0);
  assert.equal(shellViewportOffsetTop(Number.NaN, true, false), 0);
});

test("an installed iOS app's short layout viewport is measured, never assumed", async () => {
  const { iosStandaloneBottomGap } = await import("../src/app/visual-viewport-offset.ts");
  const se = { iosStandalone: true, screenHeight: 667, innerHeight: 647, innerWidth: 375, safeAreaTop: 20 };
  assert.equal(iosStandaloneBottomGap(se), 20);
  // Full-height viewport (no quirk), default-style install, landscape, browser tab, Android.
  assert.equal(iosStandaloneBottomGap({ ...se, innerHeight: 667 }), 0);
  assert.equal(iosStandaloneBottomGap({ ...se, safeAreaTop: 0 }), 0);
  assert.equal(iosStandaloneBottomGap({ ...se, innerWidth: 667, innerHeight: 375 }), 0);
  assert.equal(iosStandaloneBottomGap({ ...se, iosStandalone: false }), 0);
  // Never more than the status bar it stands in for.
  assert.equal(iosStandaloneBottomGap({ ...se, innerHeight: 600 }), 20);
});
