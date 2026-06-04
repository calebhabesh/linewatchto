import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

import {
  formatResumeDuration,
  formatSubwayClock,
  getSubwayOperatingState,
  isSubwayClosed,
} from "../src/app/subway-hours.ts";

describe("subway operating hours", () => {
  it("closes after 2 a.m. on weekdays until the 6 a.m. start", () => {
    const state = getSubwayOperatingState(new Date("2026-06-04T03:15:00-04:00"));

    assert.equal(state.status, "closed");
    assert.equal(state.title, "Subway closed overnight");
    assert.equal(state.nextResumeLabel, "Today at 6:00 AM");
    assert.equal(state.nextResumeTime, "6:00 AM");
    assert.equal(state.minutesUntilResume, 165);
    assert.equal(isSubwayClosed(new Date("2026-06-04T03:15:00-04:00")), true);
  });

  it("keeps service open before 2 a.m. because the previous service day is still ending", () => {
    const state = getSubwayOperatingState(new Date("2026-06-04T01:45:00-04:00"));

    assert.equal(state.status, "open");
    assert.equal(state.nextResumeLabel, null);
    assert.equal(state.minutesUntilResume, null);
  });

  it("uses the later Sunday start", () => {
    const closedState = getSubwayOperatingState(new Date("2026-06-07T07:30:00-04:00"));
    const openState = getSubwayOperatingState(new Date("2026-06-07T08:05:00-04:00"));

    assert.equal(closedState.status, "closed");
    assert.equal(closedState.nextResumeLabel, "Today at 8:00 AM");
    assert.equal(closedState.minutesUntilResume, 30);
    assert.equal(openState.status, "open");
  });

  it("shows Monday early morning as open before 2 a.m. and closed after 2 a.m.", () => {
    assert.equal(getSubwayOperatingState(new Date("2026-06-08T01:10:00-04:00")).status, "open");
    assert.equal(getSubwayOperatingState(new Date("2026-06-08T05:55:00-04:00")).status, "closed");
    assert.equal(getSubwayOperatingState(new Date("2026-06-08T05:55:00-04:00")).nextResumeLabel, "Today at 6:00 AM");
  });

  it("exposes exact copy used by the closed screen", () => {
    const state = getSubwayOperatingState(new Date("2026-06-04T03:15:00-04:00"));

    assert.equal(formatSubwayClock(360), "6:00 AM");
    assert.equal(formatSubwayClock(120), "2:00 AM");
    assert.equal(formatResumeDuration(165), "2 hr 45 min");
    assert.equal(state.operatingHours.weekdaySaturday, "Mon-Sat: about 6:00 a.m. to 2:00 a.m.");
    assert.equal(state.operatingHours.sunday, "Sun: about 8:00 a.m. to 2:00 a.m.");
    assert.match(state.operatingHours.caveat, /Exact first and last train times vary by station/);
    assert.match(state.operatingHours.overnight, /Blue Night Network/);
  });
});

describe("subway operating state hook source", () => {
  it("refreshes the closed-hours state on a timer", () => {
    const hookSource = readFileSync(new URL("../src/hooks/useSubwayOperatingState.ts", import.meta.url), "utf8");

    assert.match(hookSource, /"use client"/);
    assert.match(hookSource, /getSubwayOperatingState/);
    assert.match(hookSource, /window\.setInterval/);
    assert.match(hookSource, /30_000/);
  });
});
