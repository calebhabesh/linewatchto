import assert from "node:assert/strict";
import test from "node:test";

import {
  reducedSpeedZoneResolutionEntries,
  reducedSpeedZoneResolutionText,
} from "../src/app/reduced-speed-zone-resolution.ts";

const groupedZone = {
  lineId: "line-1",
  resolution: "Multiple Dates",
  directionalDetails: [
    { sourceAlertId: "nb-1", displayDirection: "Northbound", resolution: "Late August" },
    { sourceAlertId: "nb-2", displayDirection: "Northbound", resolution: "Late August" },
    { sourceAlertId: "sb-1", displayDirection: "Southbound", resolution: "Late August" },
    { sourceAlertId: "sb-2", displayDirection: "Southbound", resolution: "Late August" },
    { sourceAlertId: "sb-3", displayDirection: "Southbound", resolution: "Late August" },
  ],
};

test("lists the resolution count for each direction in travel order", () => {
  assert.deepEqual(reducedSpeedZoneResolutionEntries(groupedZone), [
    { resolution: "Late August", count: 2, direction: "Northbound" },
    { resolution: "Late August", count: 3, direction: "Southbound" },
  ]);
  assert.equal(reducedSpeedZoneResolutionText(groupedZone), "Late August (2), Late August (3)");
});

test("keeps one date per direction when individual source rows disagree", () => {
  const inconsistentZone = {
    ...groupedZone,
    directionalDetails: [
      { sourceAlertId: "nb-1", displayDirection: "Northbound", resolution: "Late September" },
      { sourceAlertId: "nb-2", displayDirection: "Northbound", resolution: "Late August" },
      { sourceAlertId: "sb-1", displayDirection: "Southbound", resolution: "Late August" },
      { sourceAlertId: "sb-2", displayDirection: "Southbound", resolution: "Late September" },
      { sourceAlertId: "sb-3", displayDirection: "Southbound", resolution: "Late August" },
    ],
  };

  assert.deepEqual(reducedSpeedZoneResolutionEntries(inconsistentZone), [
    { resolution: "Late August", count: 2, direction: "Northbound" },
    { resolution: "Late August", count: 3, direction: "Southbound" },
  ]);
});
