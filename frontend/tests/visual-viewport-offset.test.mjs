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
