import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { currentServiceRouteBadges } from "../src/app/route-badge-layout.ts";

// Nov 13, 2026: a notice for 11C, 11B, 52F and 124 stacked four badges in one column.
describe("currentServiceRouteBadges", () => {
  it("draws one route alone, larger", () => {
    assert.deepEqual(currentServiceRouteBadges(["24B"]), { layout: "single", shown: ["24B"], hidden: 0 });
  });

  it("arranges two to four routes in a grid, compact when a code has three characters", () => {
    assert.equal(currentServiceRouteBadges(["16", "17"]).layout, "grid");
    assert.equal(currentServiceRouteBadges(["7", "29", "41"]).layout, "grid");
    assert.deepEqual(currentServiceRouteBadges(["11C", "11B", "52F", "124"]), {
      layout: "grid-compact", shown: ["11C", "11B", "52F", "124"], hidden: 0,
    });
  });

  it("shows three and a +N past four routes", () => {
    assert.deepEqual(currentServiceRouteBadges(["7", "29", "41", "52", "63"]), {
      layout: "grid", shown: ["7", "29", "41"], hidden: 2,
    });
    // Thirteen routes: "+10" has three characters, so the grid is compact.
    const many = ["7", "29", "41", "52", "63", "71", "79", "84", "85", "86", "87", "89", "95"];
    assert.deepEqual(currentServiceRouteBadges(many), { layout: "grid-compact", shown: ["7", "29", "41"], hidden: 10 });
  });

  it("lets only a code too long to pair stand alone", () => {
    assert.equal(currentServiceRouteBadges(["29", "300A"]).layout, "stack");
  });
});
