import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyticsEmptyState,
  analyticsKpis,
  comparisonIsUneven,
  coverageDayTotals,
  coverageSegments,
  derivationIsBehind,
  formatHours,
  formatMinutes,
  pointsChange,
  segmentDates,
  showsSlowZones,
  sortAnalyticsRows,
} from "../src/app/reliability-analytics.ts";
import { demoAvailability, demoSummary } from "../src/app/reliability-analytics-fixture.ts";
import { defaultAnalyticsQuery, resolveAnalyticsRange } from "../src/app/reliability-range.ts";

const lines = [
  { id: "line-1", number: "1", name: "Yonge-University", stations: [{ id: "union", name: "Union" }, { id: "king", name: "King" }] },
  { id: "line-2", number: "2", name: "Bloor-Danforth", stations: [{ id: "kipling", name: "Kipling" }] },
];
const coverage = { pollingPercentage: 99, schedulePercentage: 100, effectivePercentage: 99, confidence: "high", analyzableDays: 30, totalDays: 30, label: "" };
const classes = (stopped, delays) => [
  { disruptionClass: "service-stopped", label: "Service Stopped", incidents: 3, uniqueMinutes: stopped, weightedSharePercentage: 1.5 },
  { disruptionClass: "delay", label: "Delays", incidents: delays, uniqueMinutes: 50, weightedSharePercentage: 0.4 },
  { disruptionClass: "slow-zone", label: "Slow Zones", incidents: 0, uniqueMinutes: 0, weightedSharePercentage: 0 },
];
const totals = (extra = {}) => ({
  observedMinutes: 30_000, incidents: 12, activeIncidents: 0, medianTimeToClearMinutes: 10, p90TimeToClearMinutes: 245,
  uniqueMinutes: 900, anyAlertPercentage: 39, incidentDisruptionMinutes: 1_000, weightedImpactMinutes: 300,
  weightedImpactPercentage: 11.6, classes: classes(90, 9), ...extra,
});
const summary = (extra = {}) => ({
  networkId: "ttc", methodologyVersion: 2, scope: "lines", lineId: null, stationId: null, coverage, totals: totals(), rows: [],
  range: { from: "2026-11-01", to: "2026-11-24", days: 24, firstAnalyzableDate: "2026-11-01", includesToday: true },
  previous: null, previousUnavailableReason: null, message: "", ...extra,
});
const scope = { networkId: "ttc", line: false, station: false };
const range = { requestedFrom: "2026-11-01", requestedTo: "2026-11-24", from: "2026-11-01", to: "2026-11-24", clipped: false };

describe("analytics KPIs", () => {
  it("shows no change without a previous period", () => {
    const kpis = analyticsKpis(summary(), scope);
    assert.deepEqual(kpis.map((kpi) => [kpi.label, kpi.value, kpi.change]), [
      ["Service-Stopped Hours", "1.5", null],
      ["Delay Incidents", "9", null],
      ["Median Time to Clear", "10 min", null],
      ["Line Share Affected", "11.6%", null],
      ["Coverage and Confidence", "99.0%", null],
    ]);
    assert.match(kpis[2].detail, /9 in 10 cleared within 4 hr 5 min/);
  });

  it("compares with the previous period and rounds before choosing a direction", () => {
    const previous = {
      from: "2026-10-08", to: "2026-10-31", rows: [],
      coverage: { ...coverage, effectivePercentage: 80 },
      totals: totals({ classes: classes(150, 9), medianTimeToClearMinutes: 8, weightedImpactPercentage: 11.58 }),
    };
    const kpis = analyticsKpis(summary({ previous }), scope);
    assert.deepEqual(kpis.map((kpi) => kpi.change), [
      { direction: "down", text: "1.0 hr" },
      { direction: "same", text: "No Change" },
      { direction: "up", text: "2 min" },
      { direction: "same", text: "No Change" },
      { direction: "up", text: "19.0 pts" },
    ]);
    assert.equal(comparisonIsUneven(summary({ previous })), true);
    assert.deepEqual(pointsChange(1.04, 1), { direction: "same", text: "No Change" });
  });

  it("has no values, rather than zeros, without observed service", () => {
    const kpis = analyticsKpis(summary({
      coverage: null,
      totals: totals({ observedMinutes: 0, incidents: 0, medianTimeToClearMinutes: null, p90TimeToClearMinutes: null, classes: [] }),
    }), scope);
    assert.deepEqual(kpis.map((kpi) => kpi.value), ["—", "—", "—", "—", "—"]);
  });

  it("names corridors and stations", () => {
    assert.equal(analyticsKpis(summary(), { ...scope, networkId: "regional" })[3].label, "Corridor Share Affected");
    assert.equal(analyticsKpis(summary(), { ...scope, line: true, station: true })[3].label, "Service Time Affected");
  });
});

describe("analytics states", () => {
  it("separates no history from no disruptions", () => {
    assert.equal(analyticsEmptyState({ ...range, from: null, to: null }, null), "not-enough-history");
    assert.equal(analyticsEmptyState(range, summary({ totals: totals({ observedMinutes: 0, incidents: 0 }) })), "not-enough-history");
    assert.equal(analyticsEmptyState(range, summary({ totals: totals({ incidents: 0 }) })), "no-disruptions");
    assert.equal(analyticsEmptyState(range, summary()), null);
  });

  it("reports a derive job more than the live slice behind", () => {
    const availability = { firstAnalyzableDate: "2026-11-01", today: "2026-11-24", derivedThrough: "2026-11-22" };
    assert.equal(derivationIsBehind(availability), false);
    assert.equal(derivationIsBehind({ ...availability, derivedThrough: "2026-11-21" }), true);
    assert.equal(derivationIsBehind({ ...availability, derivedThrough: null }), false);
  });

  it("hides empty Slow Zones on GO/UP only", () => {
    assert.equal(showsSlowZones("ttc", summary()), true);
    assert.equal(showsSlowZones("regional", summary()), false);
  });
});

describe("analytics coverage strip", () => {
  it("marks days before history, gaps, partly observed days and today, never as counted", () => {
    const day = (date, pollingPercentage, analyzable = true, today = false) =>
      ({ date, pollingPercentage, scheduleDay: true, analyzable, today });
    const segments = coverageSegments(
      { ...range, requestedFrom: "2026-10-30", requestedTo: "2026-11-06" },
      {
        firstAnalyzableDate: "2026-11-01",
        days: [day("2026-11-01", 100), day("2026-11-02", 99), day("2026-11-03", 60), day("2026-11-04", 0, false), day("2026-11-06", 40, true, true)],
      },
    );
    assert.deepEqual(segments.map(({ state, days }) => [state, days]), [
      ["before-history", 2], ["counted", 2], ["partial", 1], ["excluded", 2], ["today", 1],
    ]);
    assert.deepEqual(coverageDayTotals(segments), { "before-history": 2, counted: 2, partial: 1, excluded: 2, today: 1 });
    assert.deepEqual(segmentDates(segments, "excluded"), ["Nov 4–5, 2026"]);
  });
});

describe("analytics table order", () => {
  const row = (id, share, median, number = null) => ({ ...totals({ weightedImpactPercentage: share, medianTimeToClearMinutes: median }), id, number, label: id, lineId: null });
  const rows = [row("a", 2, null, "10"), row("b", 9, 4, "2"), row("c", 5, 30, "1")];
  const ids = (sort, previous) => sortAnalyticsRows(rows, sort, previous).map((item) => item.id).join("");

  it("sorts numbers both ways and keeps missing values last", () => {
    assert.equal(ids({ key: "share", descending: true }), "bca");
    assert.equal(ids({ key: "share", descending: false }), "acb");
    assert.equal(ids({ key: "median", descending: true }), "cba");
    assert.equal(ids({ key: "median", descending: false }), "bca");
    assert.equal(ids({ key: "name", descending: false }), "cba");
    assert.equal(ids({ key: "change", descending: true }, [row("c", 1, 1), row("b", 8, 1)]), "cba");
  });
});

describe("analytics formatting", () => {
  it("formats minutes and hours", () => {
    assert.equal(formatMinutes(null), "—");
    assert.equal(formatMinutes(59), "59 min");
    assert.equal(formatMinutes(120), "2 hr");
    assert.equal(formatMinutes(1_155), "19 hr 15 min");
    assert.equal(formatMinutes(3_120), "2 d 4 hr");
    assert.equal(formatHours(72_240), "1,204.0");
  });
});

describe("analytics demo data", () => {
  it("covers both networks, with and without a previous period", () => {
    for (const networkId of ["ttc", "regional"]) {
      const availability = demoAvailability(networkId, "2026-11-24");
      const resolved = resolveAnalyticsRange(defaultAnalyticsQuery, availability);
      const data = demoSummary(networkId, lines, defaultAnalyticsQuery, resolved, availability);
      assert.equal(data.rows.length, 2);
      assert.ok(data.previous);
      assert.ok(data.totals.weightedImpactPercentage < 100);
      const query = { ...defaultAnalyticsQuery, preset: "all", line: "line-1" };
      const all = demoSummary(networkId, lines, query, resolveAnalyticsRange(query, availability), availability);
      assert.equal(all.scope, "stations");
      assert.equal(all.previous, null);
    }
  });
});
