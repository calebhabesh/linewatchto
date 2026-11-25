import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyticsEmptyState,
  analyticsKpis,
  buildEpisodesPath,
  buildExportPath,
  calendarRange,
  comparisonIsUneven,
  coverageDayTotals,
  coverageSegments,
  defaultSeriesGranularity,
  derivationIsBehind,
  describeDrilldown,
  formatCauseLabel,
  formatHours,
  formatHourOfWeek,
  formatMinutes,
  granularityAllowed,
  intensityLevel,
  pointsChange,
  segmentDates,
  showsSlowZones,
  sortAnalyticsRows,
  shareScaleSteps,
} from "../src/app/reliability-analytics.ts";
import {
  demoAvailability,
  demoCancellations,
  demoEpisodes,
  demoHotspots,
  demoPatterns,
  demoSeries,
  demoSummary,
} from "../src/app/reliability-analytics-fixture.ts";
import { defaultAnalyticsQuery, emptyAnalyticsDrilldown, resolveAnalyticsRange } from "../src/app/reliability-range.ts";

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
  it("covers both networks, with and without a previous period, across all A9 modules", () => {
    for (const networkId of ["ttc", "regional"]) {
      const availability = demoAvailability(networkId, "2026-11-24");
      const resolved = resolveAnalyticsRange(defaultAnalyticsQuery, availability);
      const data = demoSummary(networkId, lines, defaultAnalyticsQuery, resolved, availability);
      assert.equal(data.rows.length, 2);
      assert.ok(data.previous);
      assert.ok(data.totals.weightedImpactPercentage < 100);
      assert.ok(data.breakdown.length > 0);
      assert.equal(data.causes.length > 0, networkId === "ttc");
      assert.equal(data.trainCancellations !== null, networkId === "regional");
      assert.equal(data.durations.buckets.length, 7);

      const series = demoSeries(networkId, lines, defaultAnalyticsQuery, resolved, availability, "day", true);
      assert.equal(series.buckets.length, 30);
      // Excluded demo gap days (indices 112 and 113) have null metrics, never zero.
      const gaps = series.buckets.filter((b) => b.analyzableDays === 0);
      assert.ok(gaps.length >= 2);
      assert.equal(gaps[0].weightedMinutes, null);
      assert.equal(gaps[0].incidents, null);
      const observed = series.buckets.find((b) => b.analyzableDays > 0);
      assert.equal(observed.lines.length, 2);

      const patterns = demoPatterns(networkId, defaultAnalyticsQuery, resolved, availability);
      assert.equal(patterns.cells.length, 168);

      const hotspots = demoHotspots(networkId, lines, defaultAnalyticsQuery, resolved, availability, "service-stopped", "minutes", 5);
      assert.ok(hotspots.stations.length > 0);
      assert.equal(hotspots.disruptionClass, "service-stopped");

      const episodes = demoEpisodes(networkId, lines, defaultAnalyticsQuery, resolved, availability, {
        ...emptyAnalyticsDrilldown,
        disruptionClass: "delay",
      }, null, 10);
      assert.ok(episodes.episodes.every((ep) => ep.disruptionClass === "delay"));

      const cancels = demoCancellations(networkId, lines, defaultAnalyticsQuery, resolved, availability, "day");
      assert.equal(cancels.buckets.length > 0, networkId === "regional");
      if (networkId === "regional") {
        const untracked = cancels.buckets.find((b) => b.trackedDays === 0);
        assert.ok(untracked);
        assert.equal(untracked.cancellations, null);
      }

      const query = { ...defaultAnalyticsQuery, preset: "all", line: "line-1" };
      const all = demoSummary(networkId, lines, query, resolveAnalyticsRange(query, availability), availability);
      assert.equal(all.scope, "stations");
      assert.equal(all.previous, null);
    }
  });
});

describe("analytics A9 chart helpers", () => {
  it("picks default granularity, enforces 400-bucket cap, and caps calendar to 366 days", () => {
    assert.equal(defaultSeriesGranularity(30), "day");
    assert.equal(defaultSeriesGranularity(90), "week");
    assert.equal(defaultSeriesGranularity(500), "month");
    assert.equal(granularityAllowed(400, "day"), true);
    assert.equal(granularityAllowed(401, "day"), false);
    assert.equal(granularityAllowed(500, "week"), true);

    assert.deepEqual(calendarRange("2026-11-01", "2026-11-24"), {
      from: "2026-11-01", to: "2026-11-24", days: 24, capped: false,
    });
    const capped = calendarRange("2024-01-01", "2026-11-24");
    assert.equal(capped.capped, true);
    assert.equal(capped.days, 366);
    assert.equal(capped.to, "2026-11-24");
  });

  it("formats hours, causes, intensity levels, drill-down chips, and API paths", () => {
    assert.equal(formatHourOfWeek(1, 0), "Mon · 12 AM");
    assert.equal(formatHourOfWeek(5, 17), "Fri · 5 PM");
    assert.equal(formatCauseLabel("MEDICAL_EMERGENCY"), "Medical Emergency");
    assert.equal(intensityLevel(0, 10), 0);
    assert.equal(intensityLevel(2, 10), 1);
    assert.equal(intensityLevel(5, 10), 2);
    assert.equal(intensityLevel(7, 10), 3);
    assert.equal(intensityLevel(10, 10), 4);

    const chips = describeDrilldown({
      ...emptyAnalyticsDrilldown,
      from: "2026-11-20", to: "2026-11-20",
      line: "line-1", station: "union",
      disruptionClass: "service-stopped",
      cause: "TECHNICAL_PROBLEM",
      planned: false,
      completed: true,
      minMinutes: 15, maxMinutes: 29,
      dayOfWeek: 5, hour: 8,
      sort: "longest",
    }, "ttc", lines);
    assert.deepEqual(chips.map((c) => c.label), [
      "Nov 20, 2026", "Line 1 Yonge-University", "Union", "Service Stopped",
      "Technical Problem", "Unplanned", "Cleared: 15 min – 29 min", "Fri · 8 AM", "Sort: Longest Counted",
    ]);

    assert.equal(
      buildExportPath("ttc", "2026-11-01", "2026-11-24", "line-1", "union"),
      "/api/reliability/export?network=ttc&from=2026-11-01&to=2026-11-24&line=line-1&station=union",
    );
    const epPath = buildEpisodesPath("ttc", "2026-11-01", "2026-11-24", null, null, {
      ...emptyAnalyticsDrilldown,
      from: "2026-11-20", to: "2026-11-20", disruptionClass: "slow-zone", sort: "longest",
    }, { limit: 25 });
    assert.match(epPath, /from=2026-11-20&to=2026-11-20/);
    assert.match(epPath, /class=slow-zone/);
    assert.match(epPath, /sort=longest/);
  });
});

describe("heatmap share scale", () => {
  it("names the largest share of every colour step", () => {
    const steps = shareScaleSteps(40);
    assert.deepEqual(steps, [10, 20, 30, 40]);
    steps.forEach((limit, index) => {
      assert.equal(intensityLevel(limit, 40), index + 1);
      if (index < 3) assert.equal(intensityLevel(limit + 0.1, 40), index + 2);
    });
    assert.deepEqual(shareScaleSteps(0), []);
  });
});
