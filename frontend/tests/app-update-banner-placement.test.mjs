import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { placeUpdateBanner, UPDATE_BANNER_SHEET_GAP } from "../src/app/app-update-banner-placement.ts";

describe("app update banner placement on phones", () => {
  it("sits just above the service sheet when there is room", () => {
    assert.deepEqual(placeUpdateBanner({ sheetTop: 700, gridTop: 760, minTop: 170, bannerHeight: 120 }),
      { top: 700 - UPDATE_BANNER_SHEET_GAP - 120, placement: "above-sheet" });
  });

  it("covers the alert-type grid when the expanded sheet leaves no room above it", () => {
    assert.deepEqual(placeUpdateBanner({ sheetTop: 200, gridTop: 260, minTop: 170, bannerHeight: 120 }),
      { top: 260, placement: "over-sheet" });
  });

  it("never covers the search bar and shortcuts", () => {
    assert.deepEqual(placeUpdateBanner({ sheetTop: 150, gridTop: 120, minTop: 170, bannerHeight: 120 }),
      { top: 170, placement: "over-sheet" });
    // Without a grid (a sheet showing no categories) it covers the sheet's top edge.
    assert.deepEqual(placeUpdateBanner({ sheetTop: 240, gridTop: null, minTop: 170, bannerHeight: 120 }),
      { top: 240, placement: "over-sheet" });
  });
});
