import assert from "node:assert/strict";
import test from "node:test";

import { reducedSpeedZoneTimingEntries } from "../src/app/reduced-speed-zone-timing.ts";

const groupedZone = {
  lineId: "line-1",
  directionalDetails: [
    { sourceAlertId: "nb-1", displayDirection: "Northbound", startedAt: "2026-08-20T08:00:00-04:00", updatedAt: "2026-08-24T10:00:00-04:00" },
    { sourceAlertId: "nb-2", displayDirection: "Northbound", startedAt: "2026-08-20T08:00:00-04:00", updatedAt: "2026-08-24T11:00:00-04:00" },
    { sourceAlertId: "sb-1", displayDirection: "Southbound", startedAt: "2026-08-23T09:00:00-04:00", updatedAt: "2026-08-24T11:00:00-04:00" },
  ],
};

test("groups equal per-zone start times by direction and preserves later starts", () => {
  assert.deepEqual(reducedSpeedZoneTimingEntries(groupedZone, "startedAt"), [
    { direction: "northbound", timestamp: "2026-08-20T08:00:00-04:00", count: 2 },
    { direction: "southbound", timestamp: "2026-08-23T09:00:00-04:00", count: 1 },
  ]);
});

test("uses the latest update once per direction and keeps each direction's zone count", () => {
  assert.deepEqual(reducedSpeedZoneTimingEntries(groupedZone, "updatedAt"), [
    { direction: "northbound", timestamp: "2026-08-24T11:00:00-04:00", count: 2 },
    { direction: "southbound", timestamp: "2026-08-24T11:00:00-04:00", count: 1 },
  ]);
});

test("uses the earliest start once per direction when zones in one direction disagree", () => {
  const staggeredDirectionZone = {
    ...groupedZone,
    directionalDetails: [
      { sourceAlertId: "nb-1", displayDirection: "Northbound", startedAt: "2026-08-20T08:05:00-04:00" },
      { sourceAlertId: "nb-2", displayDirection: "Northbound", startedAt: "2026-08-20T08:00:00-04:00" },
      { sourceAlertId: "sb-1", displayDirection: "Southbound", startedAt: "2026-08-23T09:00:00-04:00" },
    ],
  };
  assert.deepEqual(reducedSpeedZoneTimingEntries(staggeredDirectionZone, "startedAt"), [
    { direction: "northbound", timestamp: "2026-08-20T08:00:00-04:00", count: 2 },
    { direction: "southbound", timestamp: "2026-08-23T09:00:00-04:00", count: 1 },
  ]);
});

test("keeps the compact canonical field when all source timestamps match", () => {
  const sameTimeZone = {
    ...groupedZone,
    directionalDetails: groupedZone.directionalDetails.map((detail) => ({
      ...detail,
      startedAt: "2026-08-20T08:00:00-04:00",
    })),
  };
  assert.deepEqual(reducedSpeedZoneTimingEntries(sameTimeZone, "startedAt"), []);
});
