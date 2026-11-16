import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dashboardDisruptionFacts,
  matchedImpactFacts,
  plannedClosureWhen,
} from "../src/app/disruption-row-facts.ts";

const nightlySeries = {
  id: "closure-ym-eg",
  serviceEffect: "suspension",
  activeNow: false,
  nightly: true,
  nextWindowStart: "2026-11-17T04:00:00Z",
  nextWindowEnd: "2026-11-17T08:30:00Z",
  windowDates: "Mon, Nov 16 – Wed, Nov 18",
  windowHours: "11:00 PM – 3:30 AM",
  windowCount: 3,
  lastWindowEnd: "2026-11-19T08:30:00Z",
  window: "Nightly, Nov 16 – 18",
  cause: "CLOSURE - Structural Maintenance",
  shuttle: true,
};

const emptyDashboard = { activeAlerts: [], delays: [], reducedSpeedZones: [], plannedClosures: [] };

describe("Active Disruptions row facts", () => {
  it("gives a nightly series its nights and hours", () => {
    assert.equal(plannedClosureWhen(nightlySeries), "Nights Mon, Nov 16 – Wed, Nov 18 · 11:00 PM – 3:30 AM");
  });

  it("gives one window its start, or its end once in effect", () => {
    const single = {
      ...nightlySeries, nightly: false, windowCount: 1, windowDates: null, windowHours: null, lastWindowEnd: null,
    };
    assert.match(plannedClosureWhen(single), /^Starts Mon,\sNov\s16\s·\s11:00\sPM$/);
    const inEffect = { ...single, activeNow: true, activeWindowStart: single.nextWindowStart, activeWindowEnd: single.nextWindowEnd };
    assert.match(plannedClosureWhen(inEffect), /^Until Tue,\sNov\s17\s·\s3:30\sAM$/);
  });

  it("falls back to the published window text without exact times", () => {
    assert.equal(plannedClosureWhen({ window: "Weekend of Nov 21" }), "Weekend of Nov 21");
  });

  it("reads a planned advisory's schedule, cause and shuttle from the dashboard", () => {
    const facts = dashboardDisruptionFacts("closure-ym-eg", { ...emptyDashboard, plannedClosures: [nightlySeries] });
    assert.deepEqual(facts, {
      when: "Nights Mon, Nov 16 – Wed, Nov 18 · 11:00 PM – 3:30 AM",
      cause: "Structural Maintenance",
      shuttle: true,
      reducedSpeed: null,
    });
  });

  it("gives an alert standing for an advisory in effect the advisory's schedule", () => {
    const alert = { id: "alert-1", relatedPlannedClosureId: "closure-ym-eg", startedAt: "2026-11-17T04:01:00Z", cause: null, shuttle: false };
    const facts = dashboardDisruptionFacts("alert-1", { ...emptyDashboard, activeAlerts: [alert], plannedClosures: [nightlySeries] });
    assert.equal(facts.when, "Nights Mon, Nov 16 – Wed, Nov 18 · 11:00 PM – 3:30 AM");
    assert.equal(facts.cause, "Structural Maintenance");
    assert.equal(facts.shuttle, true);
  });

  it("gives a current alert its start and cause", () => {
    const delay = { id: "delay-1", startedAt: "2026-11-16T23:12:00Z", cause: "Signal Problem" };
    const facts = dashboardDisruptionFacts("delay-1", { ...emptyDashboard, delays: [delay] });
    assert.match(facts.when, /^Started Mon,\sNov\s16\s·\s6:12\sPM$/);
    assert.equal(facts.cause, "Signal Problem");
    assert.equal(facts.shuttle, false);
  });

  it("gives a slow zone its reduced speed, found by a source alert id too", () => {
    // The feed publishes a bare number; the row adds the unit (the reduced speed only, not the usual one).
    const zone = { id: "rsz-1", sourceAlertIds: ["src-9"], startedAt: null, cause: null, reducedSpeed: "25", averageSpeed: "60" };
    const facts = dashboardDisruptionFacts("src-9", { ...emptyDashboard, reducedSpeedZones: [zone] });
    assert.deepEqual(facts, { when: null, cause: null, shuttle: false, reducedSpeed: "25 km/h" });
    assert.equal(dashboardDisruptionFacts("rsz-1", { ...emptyDashboard, reducedSpeedZones: [{ ...zone, averageSpeed: null }] }).reducedSpeed, "25 km/h");
    assert.equal(dashboardDisruptionFacts("rsz-1", { ...emptyDashboard, reducedSpeedZones: [{ ...zone, reducedSpeed: "25 km/h", averageSpeed: null }] }).reducedSpeed, "25 km/h");
  });

  it("returns nothing when the record is unknown or says nothing", () => {
    assert.equal(dashboardDisruptionFacts("missing", emptyDashboard), null);
  });

  it("uses a commute's own published dates and hours when the dashboard is another network's", () => {
    assert.deepEqual(matchedImpactFacts({
      kind: "planned-closure", status: "planned", closureDates: "Mon, Nov 16 – Wed, Nov 18", closureHours: "11:00 PM – 3:30 AM",
    }), { when: "Mon, Nov 16 – Wed, Nov 18 · 11:00 PM – 3:30 AM", cause: null, shuttle: false, reducedSpeed: null });
    assert.match(matchedImpactFacts({ kind: "delay", status: "current", startedAt: "2026-11-16T23:12:00Z" }).when, /^Started /);
    assert.equal(matchedImpactFacts({ kind: "delay", status: "current" }), null);
  });
});
