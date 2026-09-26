import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { formatPublicationTimestamp, formatImpactTimestamp, formatOperationalDateTime, formatRelativeImpactTime } from "../src/app/impact-time.ts";

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

  it("uses Title Case 'Not Reported' for missing impact timestamps", () => {
    const timestampSource = readFileSync(new URL("../src/components/ImpactTimestamp.tsx", import.meta.url), "utf8");
    const compactItemSource = readFileSync(new URL("../src/components/CompactImpactListItem.tsx", import.meta.url), "utf8");

    assert.match(timestampSource, /<>Not Reported<\/>/);
    assert.match(compactItemSource, /"Not Reported"/);
  });
});



it("publication timestamps include compact elapsed age without suggesting a fresh update", () => {
  const now = new Date("2026-09-26T16:00:00Z");
  assert.equal(formatPublicationTimestamp("2026-09-24T14:18:00Z", now), "Sep 24, 10:18 AM (2d)");
  assert.equal(formatPublicationTimestamp("2026-09-26T15:30:00Z", now), "Sep 26, 11:30 AM (30m)");
  assert.equal(formatPublicationTimestamp("2026-09-26T16:00:00Z", now), "Sep 26, 12:00 PM (<1m)");
  assert.equal(formatPublicationTimestamp("2026-09-27T16:00:00Z", now), "Sep 27, 12:00 PM");
});
