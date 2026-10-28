import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FOCUS_REVEAL_MARGIN_PX,
  focusRevealSafeArea,
  focusRevealTranslation,
  logicalBoxFromClientRect,
} from "../src/app/map-focus-reveal.ts";

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

describe("keyboard focus reveal on the SVG maps", () => {
  const viewport = { width: 1200, height: 800 };
  // A 480 px desktop sidebar over the left of the map, a 72 px control rail on top.
  const insets = { left: 504, right: 40, top: 88, bottom: 40 };
  const safe = focusRevealSafeArea(viewport.width, viewport.height, insets);

  it("keeps the reveal margin inside the uncovered area", () => {
    assert.deepEqual(safe, {
      left: 504 + FOCUS_REVEAL_MARGIN_PX,
      top: 88 + FOCUS_REVEAL_MARGIN_PX,
      right: 1200 - 40 - FOCUS_REVEAL_MARGIN_PX,
      bottom: 800 - 40 - FOCUS_REVEAL_MARGIN_PX,
    });
  });

  it("moves the camera right to bring a station out from under the sidebar", () => {
    const station = { left: 300, top: 400, right: 340, bottom: 440 };
    assert.deepEqual(focusRevealTranslation(station, safe), { dx: safe.left - 300, dy: 0 });
  });

  it("moves the camera up for a target below the viewport", () => {
    const badge = { left: 700, top: 900, right: 740, bottom: 940 };
    assert.deepEqual(focusRevealTranslation(badge, safe), { dx: 0, dy: -(940 - safe.bottom) });
  });

  it("leaves the camera alone when the target already shows", () => {
    assert.equal(focusRevealTranslation({ left: 700, top: 400, right: 740, bottom: 440 }, safe), null);
  });

  it("leaves a long corridor alone while part of it shows", () => {
    assert.equal(focusRevealTranslation({ left: 100, top: 400, right: 1400, bottom: 420 }, safe), null);
  });

  it("measures in the logical frame on a rotated map", () => {
    // Rotated 90° clockwise in a 390 × 844 phone viewport: screen top is logical left,
    // and the screen's right edge is logical top.
    const box = logicalBoxFromClientRect(rect(300, 100, 40, 20), rect(0, 0, 390, 844), "rotated-landscape");
    assert.deepEqual(box, { left: 100, top: 50, right: 120, bottom: 90 });
  });

  it("measures relative to the viewport on a standard map", () => {
    const box = logicalBoxFromClientRect(rect(310, 120, 40, 20), rect(10, 20, 1200, 800));
    assert.deepEqual(box, { left: 300, top: 100, right: 340, bottom: 120 });
  });
});
