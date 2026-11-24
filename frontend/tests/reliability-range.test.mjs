import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addServiceDays,
  addServiceMonths,
  analyticsQueryForOtherNetwork,
  defaultAnalyticsQuery,
  formatDatesInMessage,
  formatServiceDateRange,
  isServiceDate,
  parseAnalyticsQuery,
  resolveAnalyticsRange,
  serializeAnalyticsQuery,
  serviceDayCount,
} from "../src/app/reliability-range.ts";

const lines = [
  { id: "line-1", number: "1", name: "Yonge-University", stations: [{ id: "union", name: "Union" }] },
  { id: "line-2", number: "2", name: "Bloor-Danforth", stations: [{ id: "kipling", name: "Kipling" }] },
];
const resolve = (preset, today, firstAnalyzableDate = "2020-01-01", extra = {}) =>
  resolveAnalyticsRange({ ...defaultAnalyticsQuery, preset, ...extra }, { today, firstAnalyzableDate });

describe("analytics range presets", () => {
  it("resolves each preset to inclusive service dates ending today", () => {
    const today = "2026-11-24";
    assert.deepEqual(resolve("30d", today), {
      requestedFrom: "2026-10-26", requestedTo: today, from: "2026-10-26", to: today, clipped: false,
    });
    assert.equal(resolve("90d", today).from, "2026-08-27");
    assert.equal(resolve("6m", today).from, "2026-05-25");
    assert.equal(resolve("12m", today).from, "2025-11-25");
    assert.equal(resolve("ytd", today).from, "2026-01-01");
    assert.equal(resolve("all", today).from, "2020-01-01");
    assert.equal(serviceDayCount(resolve("30d", today).from, today), 30);
    assert.equal(serviceDayCount(resolve("90d", today).from, today), 90);
  });

  it("is one day long year to date on January 1", () => {
    const range = resolve("ytd", "2027-01-01");
    assert.equal(range.from, "2027-01-01");
    assert.equal(range.to, "2027-01-01");
  });

  it("counts daylight-saving change days as one day each", () => {
    assert.equal(addServiceDays("2026-03-07", 2), "2026-03-09");
    assert.equal(addServiceDays("2026-11-02", -2), "2026-10-31");
    assert.equal(serviceDayCount("2026-03-07", "2026-03-09"), 3);
    assert.equal(serviceDayCount("2026-10-31", "2026-11-02"), 3);
    assert.equal(resolve("30d", "2026-03-08").from, "2026-02-07");
    assert.equal(resolve("30d", "2026-11-01").from, "2026-10-03");
  });

  it("handles leap days and short months", () => {
    assert.equal(addServiceDays("2028-02-28", 1), "2028-02-29");
    assert.equal(addServiceMonths("2028-02-29", -12), "2027-02-28");
    assert.equal(addServiceMonths("2026-08-31", -6), "2026-02-28");
    assert.equal(resolve("12m", "2028-02-29").from, "2027-03-01");
    assert.equal(resolve("30d", "2028-03-01").from, "2028-02-01");
    assert.equal(isServiceDate("2028-02-29"), true);
    assert.equal(isServiceDate("2027-02-29"), false);
    assert.equal(isServiceDate("0002-11-01"), false);
  });

  it("clips to the first analyzable date and reports a range wholly before it", () => {
    assert.deepEqual(resolve("12m", "2026-11-24", "2026-11-01"), {
      requestedFrom: "2025-11-25", requestedTo: "2026-11-24", from: "2026-11-01", to: "2026-11-24", clipped: true,
    });
    const before = resolve("custom", "2026-11-24", "2026-11-01", { from: "2026-10-01", to: "2026-10-20" });
    assert.equal(before.from, null);
    assert.equal(before.requestedFrom, "2026-10-01");
    assert.equal(resolve("all", "2026-11-24", null).from, null);
    assert.equal(resolve("30d", "2026-11-24", null).from, null);
  });

  it("ends a custom range at today", () => {
    const range = resolve("custom", "2026-11-24", "2026-11-01", { from: "2026-11-20", to: "2026-12-25" });
    assert.equal(range.to, "2026-11-24");
    const ahead = resolve("custom", "2026-11-24", "2026-11-01", { from: "2026-12-01", to: "2026-12-25" });
    assert.deepEqual([ahead.from, ahead.to], ["2026-11-24", "2026-11-24"]);
  });
});

describe("analytics URL state", () => {
  it("round-trips every filter and leaves defaults out", () => {
    assert.equal(serializeAnalyticsQuery(defaultAnalyticsQuery), "");
    for (const query of [
      defaultAnalyticsQuery,
      { ...defaultAnalyticsQuery, preset: "ytd", compare: true },
      { ...defaultAnalyticsQuery, preset: "custom", from: "2026-11-01", to: "2026-11-09", line: "line-1", station: "union" },
      { ...defaultAnalyticsQuery, preset: "all", line: "line-2" },
    ]) {
      assert.deepEqual(parseAnalyticsQuery(serializeAnalyticsQuery(query), lines), query);
    }
    assert.equal(
      serializeAnalyticsQuery({ ...defaultAnalyticsQuery, preset: "custom", from: "2026-11-01", to: "2026-11-09", line: "line-1", compare: true }),
      "?range=custom&from=2026-11-01&to=2026-11-09&line=line-1&compare=1",
    );
  });

  it("falls back on values it does not know", () => {
    assert.deepEqual(parseAnalyticsQuery("?range=decade&line=line-9&station=union&compare=yes", lines), defaultAnalyticsQuery);
    assert.equal(parseAnalyticsQuery("?range=custom&from=2026-02-30&to=2026-03-02", lines).preset, "30d");
    assert.equal(parseAnalyticsQuery("?range=custom&from=2026-02-01", lines).preset, "30d");
    assert.equal(parseAnalyticsQuery("?line=line-1&station=kipling", lines).station, null);
    assert.equal(parseAnalyticsQuery("?station=union", lines).station, null);
    const swapped = parseAnalyticsQuery("?range=custom&from=2026-11-09&to=2026-11-01", lines);
    assert.deepEqual([swapped.from, swapped.to], ["2026-11-01", "2026-11-09"]);
  });

  it("keeps the range and comparison, not the line, on the other network", () => {
    const other = analyticsQueryForOtherNetwork({ ...defaultAnalyticsQuery, preset: "90d", line: "line-1", station: "union", compare: true });
    assert.equal(serializeAnalyticsQuery(other), "?range=90d&compare=1");
  });
});

describe("analytics date text", () => {
  it("writes ranges without repeating the month or year", () => {
    assert.equal(formatServiceDateRange("2026-11-01", "2026-11-24"), "Nov 1–24, 2026");
    assert.equal(formatServiceDateRange("2026-10-26", "2026-11-24"), "Oct 26–Nov 24, 2026");
    assert.equal(formatServiceDateRange("2025-12-02", "2026-01-04"), "Dec 2, 2025–Jan 4, 2026");
    assert.equal(formatServiceDateRange("2026-11-24", "2026-11-24"), "Nov 24, 2026");
    assert.equal(formatDatesInMessage("History starts on 2026-11-01."), "History starts on Nov 1, 2026.");
  });
});
