import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDisruptionDuration } from "../src/app/reliability-time.ts";

test("reliability durations retain precision and add day/week equivalents", () => {
  assert.equal(formatDisruptionDuration(20), "20 min");
  assert.equal(formatDisruptionDuration(59.9), "1 hr");
  assert.equal(formatDisruptionDuration(1440), "24 hrs (1 d)");
  assert.equal(formatDisruptionDuration(10080), "168 hrs (1 wk)");
  assert.equal(formatDisruptionDuration(2380 * 60 + 20), `${(2380).toLocaleString()} hrs 20 min (14 wk 1 d)`);
  for (const value of [null, undefined, NaN, Infinity, -1]) {
    assert.equal(formatDisruptionDuration(value), "0 min");
  }
});
