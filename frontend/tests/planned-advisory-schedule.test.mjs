import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatScheduleMoment, plannedAdvisorySchedule } from "../src/app/planned-advisory-schedule.ts";

// Moments keep each date and time on one line.
const moment = (value) => value.replace(/ /g, " ");
const rows = (view) => view.rows.map(({ label, value }) => [label, value]);

const nightlySeries = {
  serviceEffect: "suspension",
  activeNow: false,
  nightly: true,
  nextWindowStart: "2026-11-10T04:59:00Z",
  nextWindowEnd: "2026-11-10T08:30:00Z",
  windowDates: "Mon, Nov 9 – Thu, Nov 12",
  windowHours: "11:59 PM – 3:30 AM",
  windowCount: 4,
  lastWindowEnd: "2026-11-13T08:30:00Z",
};

describe("planned advisory schedule", () => {
  it("formats moments in Toronto time", () => {
    assert.equal(formatScheduleMoment("2026-11-10T04:59:00Z"), moment("Mon, Nov 9 · 11:59 PM"));
    assert.equal(formatScheduleMoment(null), null);
    assert.equal(formatScheduleMoment("not a date"), null);
  });

  it("shows a nightly series before its next night, and when regular service returns after the last night", () => {
    const view = plannedAdvisorySchedule(nightlySeries);
    assert.equal(view.heading, "Closure Schedule");
    assert.equal(view.windowLabel, "Next Closure");
    assert.deepEqual(rows(view), [
      ["Nights", "Mon, Nov 9 – Thu, Nov 12"],
      ["Each Night", "11:59 PM – 3:30 AM the next morning"],
      ["Next Closure", `${moment("Mon, Nov 9 · 11:59 PM")} – ${moment("Tue, Nov 10 · 3:30 AM")}`],
      ["Regular Service Resumes", moment("Fri, Nov 13 · 3:30 AM")],
    ]);
  });

  it("never names the next night's end as the return to regular service", () => {
    const view = plannedAdvisorySchedule({ ...nightlySeries, lastWindowEnd: null });
    assert.deepEqual(view.rows.map((row) => row.label), ["Nights", "Each Night", "Next Closure"]);
  });

  it("names every day a multi-day window covers before its start and end", () => {
    const view = plannedAdvisorySchedule({
      serviceEffect: "suspension",
      activeNow: false,
      nightly: false,
      nextWindowStart: "2026-11-14T05:00:00Z",
      nextWindowEnd: "2026-11-16T11:00:00Z",
      windowDates: "Sat, Nov 14 – Sun, Nov 15",
      windowHours: "All Day · Resumes Mon 6:00 AM",
      windowCount: 1,
      lastWindowEnd: "2026-11-16T11:00:00Z",
    });
    assert.equal(view.heading, "Next Closure");
    assert.deepEqual(rows(view), [
      ["Closed", "All day, Sat, Nov 14 – Sun, Nov 15"],
      ["Starts", moment("Sat, Nov 14 · 12:00 AM")],
      ["Regular Service Resumes", moment("Mon, Nov 16 · 6:00 AM")],
    ]);
  });

  it("names the current window of a dated limited service series", () => {
    const view = plannedAdvisorySchedule({
      serviceEffect: "limited-service",
      activeNow: true,
      nightly: false,
      activeWindowStart: "2026-11-09T14:00:00Z",
      activeWindowEnd: "2026-11-09T20:00:00Z",
      windowCount: 2,
      windowDates: "Mon, Nov 9; Wed, Nov 11",
      windowHours: "9:00 AM – 3:00 PM",
    });
    assert.equal(view.heading, "Limited Service Schedule");
    assert.deepEqual(view.rows.map((row) => row.label), ["Dates", "Each Day", "Current Limited Service"]);
    assert.equal(view.rows[1].value, "9:00 AM – 3:00 PM");
  });

  it("leaves a one-day window to its start and end", () => {
    const view = plannedAdvisorySchedule({
      serviceEffect: "suspension", nightly: false, windowCount: 1, windowDates: "Fri, Oct 30", windowHours: "10:00 PM – 6:00 AM",
      nextWindowStart: "2026-10-31T02:00:00Z", nextWindowEnd: "2026-10-31T10:00:00Z",
    });
    assert.deepEqual(view.rows.map((row) => row.label), ["Starts", "Regular Service Resumes"]);
  });

  it("says a multi-day window without whole days runs continuously", () => {
    const view = plannedAdvisorySchedule({
      serviceEffect: "limited-service", nightly: false, windowCount: 1, windowDates: "Fri, Nov 13 – Sun, Nov 15", windowHours: "10:00 PM – 5:00 AM",
      nextWindowStart: "2026-11-14T03:00:00Z", nextWindowEnd: "2026-11-16T10:00:00Z",
    });
    assert.deepEqual(view.rows[0], { label: "Limited Service", value: "Continuously, Fri, Nov 13 – Sun, Nov 15" });
  });

  it("promises no regular service when the effect is unknown", () => {
    const view = plannedAdvisorySchedule({ serviceEffect: null, nextWindowStart: "2026-11-14T15:00:00Z", nextWindowEnd: null });
    assert.equal(view.heading, "Next Window");
    assert.deepEqual(view.rows.map((row) => row.label), ["Starts"]);
  });

  it("treats a nightly advisory as a series when the window count is missing", () => {
    const view = plannedAdvisorySchedule({ ...nightlySeries, windowCount: undefined, lastWindowEnd: undefined });
    assert.equal(view.heading, "Closure Schedule");
  });

  it("returns null without an exact window so cards keep the published labels", () => {
    assert.equal(plannedAdvisorySchedule({ serviceEffect: "suspension", windowDates: "Sat, Nov 14" }), null);
  });
});
