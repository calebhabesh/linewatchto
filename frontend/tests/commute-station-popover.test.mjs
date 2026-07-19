import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateMobilePickerAlignmentScroll,
  calculateCommuteStationPopoverCoords,
  isVisualKeyboardOpen,
} from "../src/components/commute-station-popover.ts";

describe("saved commute station popover geometry", () => {
  it("aligns the active picker label with the top of the Saved Commutes scroll area", () => {
    assert.equal(calculateMobilePickerAlignmentScroll(260, 62), 190);
    assert.equal(calculateMobilePickerAlignmentScroll(66, 62), -4);
  });

  it("stays below its lifted trigger inside an iPhone SE keyboard viewport", () => {
    const viewport = { top: 0, left: 0, width: 375, height: 347 };

    assert.equal(isVisualKeyboardOpen(viewport, 667), true);
    assert.deepEqual(calculateCommuteStationPopoverCoords({
      trigger: { top: 70, right: 359, bottom: 110, left: 16, width: 343 },
      viewport,
      container: { top: 8, right: 367, bottom: 339, left: 8, width: 359 },
      mobile: true,
      expanded: false,
      mobileSearchActive: true,
    }), {
      top: 116,
      left: 16,
      width: 343,
      maxHeight: 215,
      placement: "below",
    });
  });

  it("uses the stable shared sheet boundary during mobile keyboard animation", () => {
    const coords = calculateCommuteStationPopoverCoords({
      trigger: { top: 120, right: 359, bottom: 160, left: 16, width: 343 },
      viewport: { top: 0, left: 0, width: 375, height: 500 },
      container: { top: 8, right: 367, bottom: 360, left: 8, width: 359 },
      mobile: true,
      expanded: false,
      mobileSearchActive: true,
    });

    assert.equal(coords.top, 166);
    assert.equal(coords.maxHeight, 318);
    assert.equal(coords.placement, "below");
  });

  it("stays below its lifted trigger when Android search focus starts before resize", () => {
    const coords = calculateCommuteStationPopoverCoords({
      trigger: { top: 140, right: 396, bottom: 180, left: 16, width: 380 },
      viewport: { top: 0, left: 0, width: 412, height: 732 },
      container: { top: 120, right: 404, bottom: 650, left: 8, width: 396 },
      mobile: true,
      expanded: false,
      mobileSearchActive: true,
    });

    assert.equal(coords.placement, "below");
    assert.equal(coords.top, 186);
    assert.equal(coords.maxHeight, 320);
  });

  it("always stays below the trigger when the mobile keyboard is closed", () => {
    const coords = calculateCommuteStationPopoverCoords({
      trigger: { top: 420, right: 359, bottom: 460, left: 16, width: 343 },
      viewport: { top: 0, left: 0, width: 375, height: 667 },
      container: { top: 120, right: 367, bottom: 590, left: 8, width: 359 },
      mobile: true,
      expanded: false,
      mobileSearchActive: false,
    });

    assert.equal(coords.placement, "below");
    assert.equal(coords.top, 466);
    assert.equal(coords.maxHeight, 116);
  });
});
