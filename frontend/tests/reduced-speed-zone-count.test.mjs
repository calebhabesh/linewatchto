import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countReducedSpeedZones,
  countReducedSpeedZonesByDirection,
} from "../src/app/reduced-speed-zone-count.ts";

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

  it("counts grouped TTC zones by their cardinal direction", () => {
    const cedarvale = {
      ...zone("cedarvale-st-clair-west", ["nb-1", "nb-2", "sb-1", "sb-2", "sb-3"]),
      displayDirection: "Northbound & Southbound",
      directionalDetails: [
        { sourceAlertId: "nb-1", displayDirection: "Northbound", location: "St Clair West to Cedarvale" },
        { sourceAlertId: "nb-2", displayDirection: "Northbound", location: "St Clair West to Cedarvale" },
        { sourceAlertId: "sb-1", displayDirection: "Southbound", location: "Cedarvale to St Clair West" },
        { sourceAlertId: "sb-2", displayDirection: "Southbound", location: "Cedarvale to St Clair West" },
        { sourceAlertId: "sb-3", displayDirection: "Southbound", location: "Cedarvale to St Clair West" },
      ],
    };

    assert.deepEqual(countReducedSpeedZonesByDirection(cedarvale), [
      { direction: "northbound", count: 2, destination: "Cedarvale" },
      { direction: "southbound", count: 3, destination: "St Clair West" },
    ]);
  });
});
