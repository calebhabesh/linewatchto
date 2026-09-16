import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { currentServiceSummary, currentSurfaceNotices, getCanonicalAlertTitle } from "../src/app/current-service.ts";

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
    assert.match(summary.rows[0].timing, /^Ends .* at .+\(1hr\)$/);
    assert.equal(summary.rows[0].kind, child ? "suspension" : "planned-closure");
  }
});

test("surface notices button text uses 'streetcar and bus notices' and CSS styles category icon colors", () => {
  const panelSource = readFileSync(new URL("../src/components/CurrentServicePanel.tsx", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../src/styles/shell/current-service.css", import.meta.url), "utf8");

  assert.match(panelSource, /data\.networkId === "ttc" \? "streetcar and bus notices" : "service notices"/);
  assert.doesNotMatch(panelSource, /surface alerts/);

  assert.match(stylesSource, /\.current-service-notice\s+\[data-category="service-change"\]\s+svg\s*\{\s*color:\s*#2563eb;\s*\}/);
  assert.match(stylesSource, /\.dark\s+\.current-service-notice\s+\[data-category="service-change"\]\s+svg\s*\{\s*color:\s*#60a5fa;\s*\}/);
  assert.match(stylesSource, /\.current-service-notice\s+\[data-category="bypass"\]\s+svg\s*\{\s*color:\s*#d97706;\s*\}/);
  assert.match(stylesSource, /\.current-service-notice\s+\[data-category="detour"\]\s+svg\s*\{\s*color:\s*#9333ea;\s*\}/);
  assert.match(stylesSource, /\.current-service-notice\s+\[data-category="no-service"\]\s+svg\s*\{\s*color:\s*#dc2626;\s*\}/);
});

test("historical service reports remain readable without an all-clear claim", () => {
  const result = currentServiceSummary(data({
    generatedAt: { live: false }, snapshot: { savedAt: Date.parse('2026-09-11T12:00:00Z') },
    activeAlerts: [impact('old-alert', '1')],
  }), Date.parse('2026-09-12T12:00:00Z'));
  assert.equal(result.fresh, false);
  assert.equal(result.rows.length, 1);
  assert.match(result.rows[0].condition, /^Last reported:/);
  assert.equal(result.rows[0].timing, undefined);
  assert.deepEqual(result.unaffected, []);
});

test("canonical alert type names match canonical specifications", () => {
  // Planned Closure (upcoming)
  assert.equal(getCanonicalAlertTitle({
    id: "p1", kind: "planned-closure", lineId: "1", lineNumber: "1", condition: "Upcoming Closure", location: "St Clair to College", shuttle: false, priority: 2,
  }), "Planned Closure");

  // Planned Closure in Effect (spawned from planned closure with active alert icon)
  assert.equal(getCanonicalAlertTitle({
    id: "p2", kind: "planned-closure", iconKind: "suspension", lineId: "1", lineNumber: "1", condition: "Planned Closure in Effect", location: "St Clair to College", shuttle: false, priority: 0,
  }), "Planned Closure in Effect");

  // Delay
  assert.equal(getCanonicalAlertTitle({
    id: "d1", kind: "delay", lineId: "2", lineNumber: "2", condition: "Delays", location: "Warden", shuttle: false, priority: 1,
  }), "Delay");

  // Active Alert (rapid-transit suspension/alert)
  assert.equal(getCanonicalAlertTitle({
    id: "s1", kind: "suspension", lineId: "1", lineNumber: "1", condition: "No Service", location: "Bloor to Eglinton", shuttle: true, priority: 0,
  }), "Active Alert");

  // Bypassing Station
  assert.equal(getCanonicalAlertTitle({
    id: "b1", kind: "suspension", lineId: "1", lineNumber: "1", condition: "Bypassing station", location: "Museum", shuttle: false, priority: 0,
  }), "Bypassing Station");

  // Snapshot preserved
  assert.equal(getCanonicalAlertTitle({
    id: "d2", kind: "delay", lineId: "1", lineNumber: "1", condition: "Last reported: Delays", location: "Warden", shuttle: false, priority: 1,
  }), "Last reported: Delay");
});

test("CurrentServicePanel implements exception-first layout with consolidated reassurance summary and all-clear states", () => {
  const panelSource = readFileSync(new URL("../src/components/CurrentServicePanel.tsx", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../src/styles/shell/current-service.css", import.meta.url), "utf8");

  assert.match(panelSource, /current-service-reassurance/);
  assert.match(panelSource, /current-service-reassurance-badges/);
  assert.match(panelSource, /current-service-all-clear/);
  assert.match(panelSource, /No other imminent alerts|No imminent alerts/);

  assert.match(stylesSource, /\.current-service-reassurance\s*\{/);
  assert.match(stylesSource, /\.current-service-reassurance-badges\s*\{/);
  assert.match(stylesSource, /\.current-service-all-clear\s*\{/);
});

test("CurrentServicePanel pull up sheet has an opaque mobile-style container and unified alert item body text size", () => {
  const panelSource = readFileSync(new URL("../src/components/CurrentServicePanel.tsx", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../src/styles/shell/current-service.css", import.meta.url), "utf8");

  // Bottom edge positioned closer to alert badges
  assert.match(stylesSource, /\.desktop-status-chip-row-container\s*>\s*\.current-service\s*\{[^}]*bottom:\s*calc\(100%\s*-\s*20px\);/s);

  // The desktop container is opaque like the mobile sheet.
  assert.match(stylesSource, /\.desktop-status-chip-row-container\s*>\s*\.current-service::before\s*\{[^}]*mask-image:\s*none;/s);

  // Surface notices item body text has dedicated class
  assert.match(panelSource, /className="current-service-notice-text"/);

  // Alert item body text for subway/light rail and streetcar/bus alerts share matching 12px font size
  assert.match(stylesSource, /\.current-service-impact-timing\s*\{[^}]*font-size:\s*12px;/s);
  assert.match(stylesSource, /\.current-service-impact-location\s*\{[^}]*font-size:\s*12px;/s);
  assert.match(stylesSource, /\.current-service-notice-text[^}]*\{[^}]*font-size:\s*12px;/s);
});

test("CurrentServicePanel desktop content animates on entrance and suppresses during network transitions", () => {
  const stylesSource = readFileSync(new URL("../src/styles/shell/current-service.css", import.meta.url), "utf8");

  assert.match(stylesSource, /@keyframes current-service-enter\s*\{/);
  assert.match(stylesSource, /\.current-service-columns\s*\{[^}]*animation:\s*current-service-enter\s+220ms/s);
  assert.match(stylesSource, /html\[data-network-transition-phase="fade-out"\]\s+\.current-service-columns/);
  assert.match(stylesSource, /html\[data-network-transition-direction\]\s+\.current-service-columns/);
});




 test("pull-up impact rows name the condition and put direction below the location", () => {
  const panel = readFileSync(new URL("../src/components/CurrentServicePanel.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles/shell/current-service.css", import.meta.url), "utf8");
  assert.ok(panel.includes('className="current-service-impact-location">{row.condition} · {row.location}</span>'));
  assert.ok(panel.includes('className="current-service-impact-direction">{row.direction}</span>'));
  assert.match(styles, /\.current-service-impact-direction\s*\{[^}]*display:\s*block;/);
});
