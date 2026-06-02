import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatRelativeImpactTime } from "../src/app/impact-time.ts";

describe("impact timestamp formatting", () => {
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
      "just now",
    );
    assert.equal(
      formatRelativeImpactTime(
        "2026-06-01T18:00:00-04:00",
        new Date("2026-06-01T22:39:00-04:00"),
      ),
      "4 hrs 39 mins ago",
    );
  });
});
