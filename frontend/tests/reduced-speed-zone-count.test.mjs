import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countReducedSpeedZones } from "../src/app/reduced-speed-zone-count.ts";

function zone(id, sourceAlertIds) {
  return { id, sourceAlertIds };
}

describe("TTC Reduced Speed Zone counting", () => {
  it("counts underlying TTC slow orders instead of grouped map cards", () => {
    const groupedLocations = [
      zone("wilson-sheppard-west", ["wilson-1", "wilson-2"]),
      zone("cedarvale-st-clair-west", [
        "cedarvale-north-1",
        "cedarvale-north-2",
        "cedarvale-south-1",
        "cedarvale-south-2",
        "cedarvale-south-3",
      ]),
      zone("college-wellesley", ["college-north", "wellesley-south"]),
      zone("king-union", ["king-south", "union-north"]),
      ...Array.from({ length: 10 }, (_, index) => zone(`single-${index}`, [`single-${index}`])),
    ];

    assert.equal(groupedLocations.length, 14);
    assert.equal(countReducedSpeedZones(groupedLocations), 21);
  });

  it("deduplicates repeated source IDs and treats legacy groups without IDs as one zone", () => {
    assert.equal(countReducedSpeedZones([
      zone("first", ["shared", "shared"]),
      zone("second", ["shared", "unique"]),
      zone("legacy", []),
    ]), 3);
  });
});
