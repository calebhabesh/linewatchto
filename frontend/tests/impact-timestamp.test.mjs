import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatImpactTimestamp, formatOperationalDateTime, formatRelativeImpactTime } from "../src/app/impact-time.ts";

describe("impact timestamp formatting", () => {
  it("formats card timestamp fields with an absolute anchor and compact age", () => {
    const now = new Date("2026-06-30T12:00:00-04:00");

    assert.equal(
      formatImpactTimestamp("2026-06-30T09:42:00-04:00", now),
      "9:42 AM (2h ago)",
    );
    assert.equal(
      formatImpactTimestamp("2026-06-25T07:00:00-04:00", now),
      "Jun 25, 7:00 AM (5d ago)",
    );
    assert.equal(
      formatImpactTimestamp("2025-06-25T07:00:00-04:00", now),
      "Jun 25, 2025, 7:00 AM (1y ago)",
    );
    assert.equal(
      formatImpactTimestamp("2026-07-06T23:00:00-04:00", now),
      "Jul 6, 11:00 PM (in 6d)",
    );
  });

  it("formats exact operational windows with clock time and year only when needed", () => {
    const now = new Date("2026-06-30T12:00:00-04:00");

    assert.equal(
      formatOperationalDateTime("2026-07-06T23:00:00-04:00", { now }),
      "Jul 6, 11:00 PM",
    );
    assert.equal(
      formatOperationalDateTime("2025-06-25T07:00:00-04:00", { now }),
      "Jun 25, 2025, 7:00 AM",
    );
  });

  it("formats minute-scale impact ages", () => {
    assert.equal(
      formatRelativeImpactTime(
        "2026-06-01T22:15:00-04:00",
        new Date("2026-06-01T22:39:00-04:00"),
      ),
      "24 mins ago",
    );
    assert.equal(
      formatRelativeImpactTime(
        "2026-06-01T22:39:00-04:00",
        new Date("2026-06-01T22:39:30-04:00"),
      ),
      "Just Now",
    );
    assert.equal(
      formatRelativeImpactTime(
        "2026-06-01T18:00:00-04:00",
        new Date("2026-06-01T22:39:00-04:00"),
      ),
      "4 hrs 39 mins ago",
    );
  });

  it("formats week and month-scale impact ages", () => {
    // 27 days ago (3 weeks)
    assert.equal(
      formatRelativeImpactTime(
        "2026-05-05T00:00:00-04:00",
        new Date("2026-06-01T00:00:00-04:00"),
      ),
      "3 weeks ago",
    );
    // 28 days ago (4 weeks)
    assert.equal(
      formatRelativeImpactTime(
        "2026-05-04T00:00:00-04:00",
        new Date("2026-06-01T00:00:00-04:00"),
      ),
      "4 weeks ago",
    );
    // 29 days ago (4 weeks)
    assert.equal(
      formatRelativeImpactTime(
        "2026-05-03T00:00:00-04:00",
        new Date("2026-06-01T00:00:00-04:00"),
      ),
      "4 weeks ago",
    );
    // 30 days ago (1 month)
    assert.equal(
      formatRelativeImpactTime(
        "2026-05-02T00:00:00-04:00",
        new Date("2026-06-01T00:00:00-04:00"),
      ),
      "1 month ago",
    );
    // 60 days ago (2 months)
    assert.equal(
      formatRelativeImpactTime(
        "2026-04-02T00:00:00-04:00",
        new Date("2026-06-01T00:00:00-04:00"),
      ),
      "2 months ago",
    );
  });
});
