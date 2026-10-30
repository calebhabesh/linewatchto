import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { plannedAdvisoryStatus } from "../src/app/planned-advisory-status.ts";

const morning = Date.parse("2026-10-30T09:00:00-04:00");

describe("planned advisory status", () => {
  it("calls a one-off evening closure later today tonight", () => {
    const closure = { nextWindowStart: "2026-10-30T22:00:00-04:00", nightly: false, timingStatus: "upcoming" };
    assert.equal(plannedAdvisoryStatus(closure, morning), "Next Tonight");
  });

  it("keeps a daytime window later today distinct from tonight", () => {
    const closure = { nextWindowStart: "2026-10-30T13:00:00-04:00", nightly: false, timingStatus: "upcoming" };
    assert.equal(plannedAdvisoryStatus(closure, morning), "Later Today");
  });

  it("names the date for windows on a later day", () => {
    const closure = { nextWindowStart: "2026-11-01T08:00:00-05:00", nightly: false, timingStatus: "upcoming" };
    assert.equal(plannedAdvisoryStatus(closure, morning), "Next: Sun, Nov 1");
  });

  it("reports an incomplete schedule instead of guessing", () => {
    assert.equal(plannedAdvisoryStatus({ nextWindowStart: null, nightly: true, timingStatus: "unknown" }, morning), "Schedule Incomplete");
  });
});
