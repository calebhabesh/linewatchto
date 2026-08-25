import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAlertHistoryDuration } from "../src/app/alert-history-time.ts";

describe("alert history duration formatting", () => {
  it("uses minutes for short incidents", () => {
    assert.equal(formatAlertHistoryDuration(0), "0 min");
    assert.equal(formatAlertHistoryDuration(43), "43 min");
  });

  it("rolls long minute counts into hours while retaining minute precision", () => {
    assert.equal(formatAlertHistoryDuration(60), "1 hr");
    assert.equal(formatAlertHistoryDuration(1_343), "22 hr 23 min");
  });

  it("uses days, hours, and minutes for multi-day incidents", () => {
    assert.equal(formatAlertHistoryDuration(1_440), "1 day");
    assert.equal(formatAlertHistoryDuration(3_065), "2 days 3 hr 5 min");
  });
});
