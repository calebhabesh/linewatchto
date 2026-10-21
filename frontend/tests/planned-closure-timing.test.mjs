import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { plannedClosureTiming } from "../src/app/planned-closure-timing.ts";

describe("planned closure timing", () => {
  it("labels nightly series with their nightly hours", () => {
    assert.deepEqual(
      plannedClosureTiming({ windowDates: "Wed, Oct 21 – Fri, Oct 23", windowHours: "11:59 PM – 3:30 AM", window: "Nightly closure windows", nightly: true }),
      { dates: "Wed, Oct 21 – Fri, Oct 23", time: "Nightly 11:59 PM – 3:30 AM" },
    );
  });

  it("keeps one-off and whole-day hours explicit", () => {
    assert.deepEqual(
      plannedClosureTiming({ windowDates: "Fri, Oct 30", windowHours: "10:00 PM – 6:00 AM", window: "Fri, Oct 30 · 10:00 PM – Sat, Oct 31 6:00 AM", nightly: false }),
      { dates: "Fri, Oct 30", time: "10:00 PM – 6:00 AM" },
    );
    assert.deepEqual(
      plannedClosureTiming({ windowDates: "Sun, Oct 25", windowHours: "All Day · Resumes Mon 6:00 AM", window: "Sun, Oct 25 · All Day · Resumes Mon 6:00 AM", nightly: true }),
      { dates: "Sun, Oct 25", time: "All Day · Resumes Mon 6:00 AM" },
    );
  });

  it("uses the full window for multi-day closures without daily hours", () => {
    assert.deepEqual(
      plannedClosureTiming({ windowDates: "Fri, Sep 25 – Sun, Sep 27", windowHours: null, window: "Fri, Sep 25 · 11:59 PM – Sun, Sep 27 · End of Day", nightly: false }),
      { dates: "Fri, Sep 25 · 11:59 PM – Sun, Sep 27 · End of Day", time: null },
    );
  });

  it("does not present placeholder windows as timing", () => {
    assert.deepEqual(
      plannedClosureTiming({ windowDates: null, windowHours: null, window: "Closure timing unavailable", nightly: false }),
      { dates: null, time: null },
    );
  });

  it("says when hours differ between dates", () => {
    assert.equal(
      plannedClosureTiming({ windowDates: "Mon, Aug 24; Sun, Aug 30", windowHours: "Varies by advisory date", window: "x", nightly: false }).time,
      "Times Vary by Date",
    );
  });
});
