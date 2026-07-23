import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatEstimateDuration,
  formatEstimateRange,
  formatExtraTimeRange,
  formatTravelTimeHeadline,
} from "../src/app/commute-duration.ts";

describe("saved commute duration formatting", () => {
  it("uses minutes for trips shorter than one hour", () => {
    assert.equal(formatEstimateDuration(59 * 60), "59 min");
  });

  it("uses hours and remaining minutes for longer trips", () => {
    assert.equal(formatEstimateDuration(60 * 60), "1 hr");
    assert.equal(formatEstimateDuration(63 * 60), "1 hr 3 min");
    assert.equal(formatEstimateDuration(125 * 60), "2 hr 5 min");
  });

  it("formats impacted travel-time ranges with human-readable endpoints", () => {
    assert.equal(formatEstimateRange(63 * 60, 71 * 60), "1 hr 3 min\u00a0–\u00a01 hr 11 min");
    assert.equal(formatEstimateRange(59 * 60, 63 * 60), "59 min\u00a0–\u00a01 hr 3 min");
  });

  it("keeps short extra-time ranges compact", () => {
    assert.equal(formatExtraTimeRange(4 * 60, 12 * 60), "+4\u00a0–\u00a012 min");
    assert.equal(formatExtraTimeRange(63 * 60, 71 * 60), "+1 hr 3 min\u00a0–\u00a01 hr 11 min");
  });

  it("handles unavailable and zero-duration estimates", () => {
    assert.equal(formatEstimateDuration(null), "Unavailable");
    assert.equal(formatEstimateRange(null, null), "Unavailable");
    assert.equal(formatExtraTimeRange(null, null), "+0 min");
  });

  it("leads affected commute summaries with the current impacted estimate", () => {
    assert.deepEqual(formatTravelTimeHeadline({
      status: "estimated",
      baselineSeconds: 59 * 60,
      estimatedLowSeconds: 63 * 60,
      estimatedHighSeconds: 71 * 60,
      confidence: "low",
    }), {
      value: "1 hr 3 min\u00a0–\u00a01 hr 11 min",
      context: "Estimated Now · Low Confidence",
    });
  });

  it("uses the typical time as the current headline only when the route is clear", () => {
    assert.deepEqual(formatTravelTimeHeadline({
      status: "standard",
      baselineSeconds: 59 * 60,
      estimatedLowSeconds: 59 * 60,
      estimatedHighSeconds: 59 * 60,
      confidence: "high",
    }), {
      value: "About 59 min",
      context: "Typical Scheduled Time",
    });
  });

  it("does not invent a duration for unreliable or unavailable routes", () => {
    assert.deepEqual(formatTravelTimeHeadline({
      status: "unreliable",
      baselineSeconds: 59 * 60,
      estimatedLowSeconds: null,
      estimatedHighSeconds: null,
      confidence: "none",
    }), {
      value: "Travel Time Unreliable",
      context: "Major Disruption on Route",
    });
    assert.deepEqual(formatTravelTimeHeadline({
      status: "unavailable",
      baselineSeconds: 0,
      estimatedLowSeconds: null,
      estimatedHighSeconds: null,
      confidence: "none",
    }), {
      value: "Estimate unavailable",
      context: "No route time available",
    });
  });
});
