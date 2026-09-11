import assert from "node:assert/strict";
import { test } from "node:test";
import { currentServiceSummary, currentSurfaceNotices } from "../src/app/current-service.ts";

const line = (id, status = "normal") => ({ id, number: id, status });
const impact = (id, lineId, extra = {}) => ({ id, lineId, lineNumber: lineId, title: id, location: "Jane to Keele", severity: "suspension", ...extra });
const data = (extra = {}) => ({ generatedAt: { live: true }, availability: "available", lineStatuses: [line("1"), line("2"), line("4")], activeAlerts: [], delays: [], reducedSpeedZones: [], plannedClosures: [], ...extra });

test("current service prioritizes severity, excludes RSZs, and stays stable through polling", () => {
  const input = data({ activeAlerts: [impact("s", "2")], delays: [impact("b", "1"), impact("a", "1")], reducedSpeedZones: [impact("r", "4", { location: "Bayview to Bessarion", displayDirection: "Westbound" })] });
  const first = currentServiceSummary(input);
  assert.deepEqual(first.rows.map((row) => row.id), ["s", "a", "b"]);
  input.delays[0].updatedAt = "2026-09-09T12:00:00Z";
  assert.deepEqual(currentServiceSummary(input).rows, first.rows);
  assert.deepEqual(first.unaffected.map((line) => line.id), []);
});

test("lines with active RSZs are marked affected and excluded from Good Service unaffected list", () => {
  const input = data({
    lineStatuses: [line("1"), line("2"), line("4")],
    reducedSpeedZones: [impact("r", "4", { location: "Bayview to Bessarion" })],
  });
  const summary = currentServiceSummary(input);
  assert.deepEqual(summary.unaffected.map((l) => l.id), ["1", "2"]);
  assert.ok(!summary.unaffected.some((l) => l.id === "4"));
});

test("active closure appears once under its linked child identity; planned closures are excluded", () => {
  const summary = currentServiceSummary(data({ activeAlerts: [impact("child", "2", { relatedPlannedClosureId: "parent" })], plannedClosures: [impact("parent", "2", { activeNow: true }), impact("future", "1", { activeNow: false })] }));
  assert.deepEqual(summary.rows.map((row) => row.id), ["child"]);
  assert.deepEqual(summary.upcoming, []);
  assert.deepEqual(summary.unaffected.map((row) => row.id), ["1", "4"]);
});

test("planned-closure collection is excluded even when activeNow", () => {
  const summary = currentServiceSummary(data({ plannedClosures: [impact("active", "1", { activeNow: true })] }));
  assert.equal(summary.rows.length, 0);
});

test("unavailable, stale, and fixture snapshots never imply all-clear or expose stale rows", () => {
  for (const state of [{ availability: "unavailable" }, { availability: "fixture" }, { generatedAt: { live: false } }]) {
    const summary = currentServiceSummary(data({ ...state, activeAlerts: [impact("stale", "1")], plannedClosures: [impact("stale-plan", "1")] }));
    assert.equal(summary.fresh, false);
    assert.deepEqual(summary.rows, []);
    assert.deepEqual(summary.unaffected, []);
    assert.deepEqual(summary.upcoming, []);
  }
});

test("lines without included impacts receive the scoped clear message, including regional corridors", () => {
  const summary = currentServiceSummary(data({ lineStatuses: [line("go-lw"), line("go-le", "delay"), line("up-express", "ready")] }));
  assert.deepEqual(summary.unaffected.map((row) => row.id), ["go-lw", "go-le", "up-express"]);
});

test("delay alerts keep delay navigation and duplicate rows are omitted", () => {
  const summary = currentServiceSummary(data({ activeAlerts: [impact("same", "1", { severity: "delay" })], delays: [impact("same", "1")] }));
  assert.equal(summary.rows.length, 1);
  assert.equal(summary.rows[0].kind, "delay");
});

test("surface preview omits future and expired notices and uses stable numeric route order", () => {
  const now = Date.parse("2026-09-09T16:00:00Z");
  const notice = (id, route, extra = {}) => ({ id, routeIds: [route], ...extra });
  assert.deepEqual(currentSurfaceNotices([
    notice("a", "112"), notice("b", "42"),
    notice("future", "1", { startAt: "2026-09-10T16:00:00Z" }),
    notice("expired", "2", { endAt: "2026-09-09T16:00:00Z" }),
  ], now).map((row) => row.id), ["b", "a"]);
});

test("published closure windows enter within 24 hours, transition, expire, and yield to active children", () => {
  const now = Date.parse("2026-09-09T16:00:00Z");
  const closure = impact("parent", "2", { nextWindowStart: "2026-09-10T16:00:00Z", nextWindowEnd: "2026-09-10T18:00:00Z" });
  const input = data({ plannedClosures: [closure] });
  assert.equal(currentServiceSummary(input, now - 1).rows.length, 0);
  assert.equal(currentServiceSummary(input, now).rows[0].condition, "Upcoming Closure");
  assert.equal(currentServiceSummary(input, Date.parse(closure.nextWindowStart)).rows[0].condition, "Planned Closure in Effect");
  assert.equal(currentServiceSummary(input, Date.parse(closure.nextWindowEnd)).rows.length, 0);
  input.activeAlerts = [impact("child", "2", { relatedPlannedClosureId: "parent" })];
  assert.deepEqual(currentServiceSummary(input, now).rows.map((row) => row.id), ["child"]);
});

test("active planned closures use the active icon and published end while keeping detail navigation", () => {
  const now = Date.parse("2026-09-10T04:00:00Z");
  for (const child of [false, true]) {
    const summary = currentServiceSummary(data({
      activeAlerts: [impact(child ? "child" : "parent", "1", { severity: child ? "suspension" : "planned", relatedPlannedClosureId: child ? "parent" : null })],
      plannedClosures: [impact("parent", "1", { activeNow: true, activeWindowEnd: "2026-09-10T05:00:00Z" })],
    }), now);
    assert.equal(summary.rows[0].condition, "Planned Closure in Effect");
    assert.equal(summary.rows[0].iconKind, "suspension");
    assert.match(summary.rows[0].timing, /^Ends .*\(1 hr\)$/);
    assert.equal(summary.rows[0].kind, child ? "suspension" : "planned-closure");
  }
});
