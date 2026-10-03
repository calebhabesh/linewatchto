import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  currentServiceSummary,
  regionalIncidentFacts,
  currentServiceIncidentPresentation,
  currentSurfaceNotices,
  getCanonicalAlertTitle,
  getLineStatusPresentation,
  lineStatusDescription,
  lineAdvisoryCountLabel,
  getPlannedClosureCountBadgeLabel,
  windowTime,
  windowCountdownStage,
} from "../src/app/current-service.ts";

const line = (id, status = "normal", statusLabel = "Normal Service") => ({
  id,
  number: id,
  name: `Line ${id}`,
  route: id,
  color: "#ffd100",
  status,
  statusLabel,
  summary: "",
  updatedAgo: "just now",
});
const impact = (id, lineId, extra = {}) => ({ id, lineId, lineNumber: lineId, title: id, location: "Jane to Keele", severity: "suspension", ...extra });
const data = (extra = {}) => ({ generatedAt: { live: true }, availability: "available", lineStatuses: [line("1"), line("2"), line("4")], activeAlerts: [], delays: [], reducedSpeedZones: [], plannedClosures: [], ...extra });

test("current service prioritizes severity, excludes RSZs, and stays stable through polling", () => {
  const input = data({ activeAlerts: [impact("s", "2")], delays: [impact("b", "1"), impact("a", "1")], reducedSpeedZones: [impact("r", "4", { location: "Bayview to Bessarion", displayDirection: "Westbound" })] });
  const first = currentServiceSummary(input);
  assert.deepEqual(first.rows.map((row) => row.id), ["s", "a", "b"]);
  input.delays[0].updatedAt = "2026-09-09T12:00:00Z";
  assert.deepEqual(currentServiceSummary(input).rows.map(row => row.id), first.rows.map(row => row.id));
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
  assert.deepEqual(summary.upcoming.map(row => row.id), ["future"]);
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

test("TTC surface preview fills three slots with service alerts before advisories", () => {
  const now = Date.parse("2026-09-09T16:00:00Z");
  const notice = (id, route, category, alertClass, updatedAt = "2026-09-09T15:00:00Z") => ({
    id, routeIds: [route], category, alertClass, updatedAt,
  });
  const rows = currentSurfaceNotices([
    notice("advisory-no-service", "1", "no-service", "service-advisory"),
    notice("alert-detour", "50", "detour", "service-alert"),
    notice("alert-no-service", "100", "no-service", "service-alert"),
    notice("advisory-bypass", "2", "bypass", "service-advisory"),
  ], now, true);

  assert.deepEqual(rows.slice(0, 3).map((row) => row.id), [
    "alert-no-service",
    "alert-detour",
    "advisory-no-service",
  ]);
});

test("published closure windows enter within 24 hours, transition, expire, and yield to active children", () => {
  const now = Date.parse("2026-09-09T16:00:00Z");
  const closure = impact("parent", "2", { nextWindowStart: "2026-09-10T16:00:00Z", nextWindowEnd: "2026-09-10T18:00:00Z" });
  const input = data({ plannedClosures: [closure] });
  assert.equal(currentServiceSummary(input, now - 1).rows.length, 0);
  assert.equal(currentServiceSummary(input, now - 1).upcoming.length, 1);
  assert.equal(currentServiceSummary(input, now).rows[0].condition, "Upcoming Closure");
  assert.equal(currentServiceSummary(input, now).rows[0].kind, "planned-closure");
  assert.equal(currentServiceSummary(input, now).upcoming.length, 0);
  assert.equal(currentServiceSummary(input, Date.parse(closure.nextWindowStart)).rows[0].condition, "Planned Closure in Effect");
  assert.equal(currentServiceSummary(input, Date.parse(closure.nextWindowEnd)).rows.length, 0);
  input.activeAlerts = [impact("child", "2", { relatedPlannedClosureId: "parent" })];
  assert.deepEqual(currentServiceSummary(input, now).rows.map((row) => row.id), ["child"]);
});

test("TTC and regional planned notices without structured windows remain line badges without becoming current incidents", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");
  for (const [networkId, lineId, otherLineId] of [["ttc", "2", "1"], ["regional", "regional-br", "regional-up"]]) {
    const closure = impact("undated-plan", lineId, {
      activeNow: false, timingStatus: "unknown", startedAt: "2026-10-03T04:00:00Z",
      nextWindowStart: null, nextWindowEnd: null,
    });
    const input = data({ networkId, lineStatuses: [line(lineId), line(otherLineId)], plannedClosures: [closure] });
    const summary = currentServiceSummary(input, now);
    assert.deepEqual(summary.upcoming.map(item => item.id), ["undated-plan"]);
    assert.deepEqual(summary.rows, []);
    assert.deepEqual(summary.unaffected.map(item => item.id), [lineId, otherLineId]);
    for (const freshness of [{ generatedAt: { live: false } }, { availability: "fixture" }, { availability: "unavailable" }]) {
      assert.deepEqual(currentServiceSummary({ ...input, ...freshness }, now).upcoming, []);
    }
    for (const activeAlert of [impact(closure.id, closure.lineId), impact("child", closure.lineId, { relatedPlannedClosureId: closure.id })]) {
      assert.deepEqual(currentServiceSummary({ ...input, activeAlerts: [activeAlert] }, now).upcoming, []);
    }
    assert.deepEqual(currentServiceSummary({ ...input, plannedClosures: [{ ...closure, activeNow: true }] }, now).upcoming, []);
  }
});

test("TTC advisory counts include dated and undated notices while excluding displayed planned entries", () => {
  const now = Date.parse("2026-09-30T03:34:00Z");
  const unknownTiming = { timingStatus: "unknown", nextWindowStart: null, nextWindowEnd: null };
  const input = data({
    networkId: "ttc",
    plannedClosures: [
      impact("oct-5", "2", { nextWindowStart: "2026-10-05T03:00:00Z", nextWindowEnd: "2026-10-09T09:00:00Z" }),
      impact("oct-13", "2", { nextWindowStart: "2026-10-13T03:00:00Z", nextWindowEnd: "2026-10-16T09:00:00Z" }),
      impact("kipling-jane", "2", unknownTiming),
      impact("st-george-broadview", "2", unknownTiming),
      impact("within-24h", "2", { nextWindowStart: "2026-09-30T04:00:00Z", nextWindowEnd: "2026-09-30T09:00:00Z" }),
      impact("other-line", "1", unknownTiming),
    ],
    reducedSpeedZones: [impact("group", "2", { sourceAlertIds: ["slow-a", "slow-b", "slow-c"] })],
  });
  const summary = currentServiceSummary(input, now);
  assert.equal(summary.upcoming.filter(item => item.lineId === "2").length, 4);
  assert.deepEqual(summary.rows.map(item => item.id), ["within-24h"]);
  const presentation = getLineStatusPresentation(input.lineStatuses[1], input, summary);
  assert.equal(presentation.advisoryCount, 7);
  assert.equal(input.plannedClosures[2].timingStatus, "unknown");
  assert.equal(input.plannedClosures[2].nextWindowStart, null);
});

test("TTC and regional badges respect structured windows and exclude expired or invalid windows", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");
  for (const [networkId, lineId] of [["ttc", "2"], ["regional", "regional-br"]]) {
    const input = data({ networkId, lineStatuses: [line(lineId)], plannedClosures: [
      impact("later", lineId, { nextWindowStart: "2026-10-03T04:00:00Z", nextWindowEnd: "2026-10-05T04:00:00Z" }),
      impact("within-24h", lineId, { nextWindowStart: "2026-09-27T04:00:00Z", nextWindowEnd: "2026-09-28T04:00:00Z" }),
      impact("expired", lineId, { nextWindowStart: "2026-09-24T04:00:00Z", nextWindowEnd: "2026-09-25T04:00:00Z" }),
      impact("invalid", lineId, { nextWindowStart: "invalid", nextWindowEnd: "invalid" }),
    ] });
    const summary = currentServiceSummary(input, now);
    assert.deepEqual(summary.upcoming.map(item => item.id), ["later"]);
    assert.deepEqual(summary.rows.map(item => item.id), ["within-24h"]);
  }
});

test("active planned closures open active alerts under both canonical and child IDs", () => {
  const now = Date.parse("2026-09-10T04:00:00Z");
  for (const child of [false, true]) {
    const summary = currentServiceSummary(data({
      activeAlerts: [impact(child ? "child" : "parent", "1", { severity: child ? "suspension" : "planned", relatedPlannedClosureId: child ? "parent" : null })],
      plannedClosures: [impact("parent", "1", { activeNow: true, activeWindowEnd: "2026-09-10T05:00:00Z" })],
    }), now);
    assert.equal(summary.rows[0].condition, "Planned Closure in Effect");
    assert.equal(summary.rows[0].iconKind, "suspension");
    assert.match(summary.rows[0].timing, /^Ends .* at .+\(1h\)$/);
    assert.equal(summary.rows[0].kind, "suspension");
    assert.equal(summary.rows[0].id, child ? "child" : "parent");
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

test("service notices route badges use regional color-coded badges in GO/UP mode", () => {
  const currentServicePanelSource = readFileSync(new URL("../src/components/CurrentServicePanel.tsx", import.meta.url), "utf8");
  const desktopOverviewSource = readFileSync(new URL("../src/components/DesktopStatusOverview.tsx", import.meta.url), "utf8");

  assert.match(currentServicePanelSource, /goNoticeRouteBadgeStyle/);
  assert.match(currentServicePanelSource, /data\.networkId === "regional" \? goNoticeRouteBadgeStyle\(route\) : undefined/);
  assert.match(desktopOverviewSource, /goNoticeRouteBadgeStyle/);
  assert.match(desktopOverviewSource, /regional \? goNoticeRouteBadgeStyle\(route\) : undefined/);
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
  }), "Suspension");

  // Bypassing Station
  assert.equal(getCanonicalAlertTitle({
    id: "b1", kind: "suspension", lineId: "1", lineNumber: "1", condition: "Bypassing station", location: "Museum", shuttle: false, priority: 0,
  }), "Bypassing Station");

  // Snapshot preserved
  assert.equal(getCanonicalAlertTitle({
    id: "d2", kind: "delay", lineId: "1", lineNumber: "1", condition: "Last reported: Delays", location: "Warden", shuttle: false, priority: 1,
  }), "Last reported: Delay");
});

test("getLineStatusPresentation accurately classifies operational states", () => {
  const line1 = line("1", "normal", "Normal Service");
  const line2 = line("2", "normal", "Normal Service");
  const lineClosed = line("4", "closed", "Closed");
  const lineReady = line("5", "ready", "Opening Soon");
  const lineDelay = line("6", "delay", "Delays");

  const normalData = data({ lineStatuses: [line1, line2, lineClosed, lineReady, lineDelay] });
  const normalSummary = currentServiceSummary(normalData);

  // 1. Fresh normal line -> Normal Service with isNormal: true
  const resNormal = getLineStatusPresentation(line1, normalData, normalSummary);
  assert.equal(resNormal.state, "normal");
  assert.equal(resNormal.label, "Normal Service");
  assert.equal(resNormal.isNormal, true);
  assert.equal(resNormal.hasRsz, false);
  assert.equal(resNormal.advisoryCount, undefined);

  // 2. RSZ-only line keeps Normal Service copy with a distinct condition presentation.
  const rszData = data({
    lineStatuses: [line1, line2],
    reducedSpeedZones: [impact("rsz-1", "1", { location: "Lawrence to York Mills" })],
  });
  const rszSummary = currentServiceSummary(rszData);
  const resRsz = getLineStatusPresentation(line1, rszData, rszSummary);
  assert.equal(resRsz.state, "reduced-speed-zones");
  assert.equal(resRsz.label, "Normal Service");
  assert.equal(resRsz.isNormal, false);
  assert.equal(resRsz.hasRsz, true);
  assert.equal(resRsz.rszCount, 1);
  assert.equal(resRsz.advisoryCount, 1);
  assert.equal(lineStatusDescription(resRsz), "Normal Service, Speed zones, + 1 advisory");

  // 3. Closed line
  const resClosed = getLineStatusPresentation(lineClosed, normalData, normalSummary);
  assert.equal(resClosed.state, "closed");
  assert.equal(resClosed.label, "Closed");
  assert.equal(resClosed.isNormal, false);

  // 4. Ready / not running line
  const resReady = getLineStatusPresentation(lineReady, normalData, normalSummary);
  assert.equal(resReady.state, "ready");
  assert.equal(resReady.label, "Opening Soon");
  assert.equal(resReady.isNormal, false);

  // 5. Delay line
  const resDelay = getLineStatusPresentation(lineDelay, normalData, normalSummary);
  assert.equal(resDelay.state, "delay");
  assert.equal(resDelay.label, "Delays");
  assert.equal(resDelay.isNormal, false);

  // 6. Stale / offline / unavailable
  const unavailData = data({ availability: "unavailable" });
  const unavailSummary = currentServiceSummary(unavailData);
  const resUnavail = getLineStatusPresentation(line1, unavailData, unavailSummary);
  assert.equal(resUnavail.state, "unavailable");
  assert.equal(resUnavail.label, "Current status unavailable");
  assert.equal(resUnavail.isNormal, false);

  // 7. Fixture / demo
  const fixtureData = data({ availability: "fixture" });
  const fixtureSummary = currentServiceSummary(fixtureData);
  const resFixture = getLineStatusPresentation(line1, fixtureData, fixtureSummary);
  assert.equal(resFixture.state, "snapshot");
  assert.equal(resFixture.isNormal, false);

  // 8. Snapshot
  const snapData = data({ snapshot: { savedAt: 12345678 } });
  const snapSummary = currentServiceSummary(snapData);
  const resSnap = getLineStatusPresentation(line1, snapData, snapSummary);
  assert.equal(resSnap.state, "snapshot");
  assert.equal(resSnap.isNormal, false);
});

test("line status distinguishes future closures and speed zones together", () => {
  const now = Date.parse("2026-09-28T12:00:00Z");
  const input = data({
    plannedClosures: [impact("future", "1", {
      nextWindowStart: "2026-09-30T03:00:00Z",
      nextWindowEnd: "2026-09-30T06:00:00Z",
    })],
  });
  const closureOnly = getLineStatusPresentation(input.lineStatuses[0], input, currentServiceSummary(input, now));
  assert.equal(closureOnly.isNormal, false);
  assert.equal(closureOnly.state, "running");
  assert.equal(closureOnly.advisoryCount, 1);
  assert.equal(lineStatusDescription(closureOnly), "Normal Service, Advisory planned, + 1 advisory");

  input.reducedSpeedZones = [impact("speed-zone", "1")];
  const combined = getLineStatusPresentation(input.lineStatuses[0], input, currentServiceSummary(input, now));
  assert.equal(combined.isNormal, false);
  assert.equal(combined.advisoryCount, 2);
  assert.equal(lineStatusDescription(combined), "Normal Service, Speed zones, Advisory planned, + 2 advisories");
  assert.deepEqual(combined.qualifiers.map(({ kind }) => kind), ["reduced-speed-zones", "planned-closure"]);
  assert.equal(lineStatusDescription(getLineStatusPresentation(input.lineStatuses[1], input, currentServiceSummary(input, now))), "Normal Service");
});

test("unwindowed regional closure qualifies line status without inventing timing", () => {
  const input = data({ networkId: "regional", plannedClosures: [impact("notice", "1")] });
  const presentation = getLineStatusPresentation(input.lineStatuses[0], input, currentServiceSummary(input));
  assert.equal(presentation.isNormal, false);
  assert.equal(lineStatusDescription(presentation), "Normal Service, Advisory planned, + 1 advisory");
});

test("closure qualifiers never replace closed, disrupted, unavailable, or saved status", () => {
  for (const extra of [
    { availability: "unavailable" },
    { availability: "fixture" },
    { generatedAt: { live: false } },
    { snapshot: { savedAt: 1234 } },
    { lineStatuses: [line("1", "closed", "Closed")] },
    { lineStatuses: [line("1", "ready", "Not Running")] },
    { lineStatuses: [line("1", "delay", "Delays")] },
    { lineStatuses: [line("1", "suspension", "No Service")] },
  ]) {
    const input = data({ networkId: "regional", reducedSpeedZones: [impact("speed-zone", "1")], plannedClosures: [impact("notice", "1")], ...extra });
    const presentation = getLineStatusPresentation(input.lineStatuses[0], input, currentServiceSummary(input));
    assert.equal(presentation.isNormal, false);
    assert.equal(presentation.qualifiers, undefined);
    assert.equal(presentation.advisoryCount, undefined);
  }
});

test("line status counts underlying TTC slow orders instead of grouped map records", () => {
  const line1 = line("1", "normal", "Normal Service");
  const groupedZones = Array.from({ length: 10 }, (_, index) => impact(`rsz-${index}`, "1", {
    sourceAlertIds: index < 5
      ? [`rsz-${index}-northbound`, `rsz-${index}-southbound`]
      : [`rsz-${index}`],
  }));
  const input = data({ lineStatuses: [line1], reducedSpeedZones: groupedZones });

  const presentation = getLineStatusPresentation(line1, input, currentServiceSummary(input));

  assert.equal(groupedZones.length, 10);
  assert.equal(presentation.rszCount, 15);
  assert.equal(presentation.advisoryCount, 15);
});

test("advisory total sums underlying speed zones and upcoming closure badge counts", () => {
  const now = Date.parse("2026-09-28T12:00:00Z");
  const futureWindow = { nextWindowStart: "2026-09-30T03:00:00Z", nextWindowEnd: "2026-09-30T06:00:00Z" };
  const input = data({
    networkId: "ttc",
    reducedSpeedZones: [impact("group", "1", { sourceAlertIds: ["slow-order-a", "slow-order-b", "slow-order-c"] })],
    plannedClosures: [impact("closure-a", "1", futureWindow), impact("closure-b", "1", futureWindow), impact("other-line-closure", "2", futureWindow)],
  });
  const presentation = getLineStatusPresentation(input.lineStatuses[0], input, currentServiceSummary(input, now));
  assert.equal(presentation.advisoryCount, 5);
  assert.equal(lineAdvisoryCountLabel(presentation.advisoryCount), "5 advisories");
  assert.equal(lineAdvisoryCountLabel(1), "1 advisory");
});

test("CurrentServicePanel renders individual remaining-line rows with route badges and accurate status text", () => {
  const panelSource = readFileSync(new URL("../src/components/CurrentServicePanel.tsx", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../src/styles/shell/current-service.css", import.meta.url), "utf8");

  assert.match(panelSource, /remainingLines/);
  assert.match(panelSource, /getLineStatusPresentation/);
  assert.match(panelSource, /current-service-line--\$\{presentation\.state\}/);
  assert.doesNotMatch(panelSource, /current-service-reassurance-badges/);

  assert.match(stylesSource, /\.current-service-line--normal/);
  assert.match(stylesSource, /\.current-service-line--reduced-speed-zones/);
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

  // Alert item body text for subway/light rail and streetcar/bus alerts
  assert.match(stylesSource, /\.current-service-impact-timing\s*\{[^}]*font-size:\s*10\.5px;/s);
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
  assert.ok(panel.includes('className="current-service-impact-location"><IncidentStationSpan location={row.location} /></span>'));
  assert.ok(panel.includes('className="current-service-impact-direction">{row.direction}</span>'));
  assert.match(styles, /\.current-service-impact-direction\s*\{[^}]*display:\s*block;/);
});

test("getPlannedClosureCountBadgeLabel formats planned closure count badge", () => {
  assert.equal(getPlannedClosureCountBadgeLabel(1), "1 Planned Advisory");
  assert.equal(getPlannedClosureCountBadgeLabel(2), "2 Planned Advisories");
  assert.equal(getPlannedClosureCountBadgeLabel(5), "5 Planned Advisories");
});

test("sub-badges and surface routes use flex alignment with safe wrapping", () => {
  const currentServiceStyles = readFileSync(new URL("../src/styles/shell/current-service.css", import.meta.url), "utf8");
  const desktopChromeStyles = readFileSync(new URL("../src/styles/shell/desktop-chrome.css", import.meta.url), "utf8");

  assert.match(currentServiceStyles, /\.current-service-routes\s*\{[^}]*display:\s*grid;/s);
  assert.match(currentServiceStyles, /\.current-service-route\s*\{[^}]*white-space:\s*nowrap;/s);
  assert.match(currentServiceStyles, /\.current-service-planned-pill\s*\{[^}]*white-space:\s*nowrap;/s);
  assert.match(currentServiceStyles, /\.current-service-sub-badges\s*\{[^}]*padding-left:\s*0;/s);
  assert.match(currentServiceStyles, /\.current-service-sub-badges\s*\{[^}]*flex-direction:\s*row;/s);
  assert.match(currentServiceStyles, /\.current-service-sub-badges\s*\{[^}]*flex-wrap:\s*wrap;/s);
  assert.match(currentServiceStyles, /\.current-service-sub-badges\s*\{[^}]*margin-top:\s*5px;/s);

  assert.match(desktopChromeStyles, /\.desktop-status-sub-badges\s*\{[^}]*flex-direction:\s*row;/s);
  assert.match(desktopChromeStyles, /\.desktop-status-sub-badges\s*\{[^}]*flex-wrap:\s*wrap;/s);
  assert.match(desktopChromeStyles, /\.desktop-status-sub-badges\s*\{[^}]*margin-top:\s*5px;/s);
  assert.match(desktopChromeStyles, /\.desktop-status-kicker-header\s*\{[^}]*margin-top:\s*-6px;/s);
  assert.match(desktopChromeStyles, /\.desktop-status-kicker-header\s*\{[^}]*margin-bottom:\s*-2px;/s);

  // Normal service text is white in dark mode
  assert.match(desktopChromeStyles, /\.dark \.desktop-status-remaining-status--normal strong\s*\{[^}]*color:\s*#ffffff;/s);
  assert.match(currentServiceStyles, /\.dark \.current-service-normal-label strong\s*\{[^}]*color:\s*#ffffff;/s);

  // Planned closure incident title is blue
  assert.match(desktopChromeStyles, /\.desktop-status-incident-title\[data-kind="planned-closure"\]\s*\{[^}]*color:\s*#2563eb;/s);
  assert.match(desktopChromeStyles, /\.dark \.desktop-status-incident-title\[data-kind="planned-closure"\]\s*\{[^}]*color:\s*#60a5fa;/s);

  // Title and section header font sizes (title 22px > section header 15.5px)
  assert.match(desktopChromeStyles, /\.desktop-status-title\s*\{[^}]*font-size:\s*22px;/s);
  assert.match(desktopChromeStyles, /\.desktop-status-section-title[^{]*\{[^}]*font-size:\s*15\.5px;/s);
  assert.match(desktopChromeStyles, /\.desktop-status-rail-kicker\s*\{[^}]*font-size:\s*11px;/s);
  assert.match(desktopChromeStyles, /\.desktop-status-rail-kicker\s*\{[^}]*opacity:\s*0\.75;/s);

  // Location leads; supporting direction and timing remain readable
  assert.match(desktopChromeStyles, /\.desktop-status-incident-title\s*\{[^}]*font-size:\s*14px;/s);
  assert.match(desktopChromeStyles, /\.desktop-status-incident-location\s*\{[^}]*font-size:\s*15px;/s);
  assert.match(desktopChromeStyles, /\.desktop-status-incident-direction\s*\{[^}]*font-size:\s*13px;/s);
  assert.match(desktopChromeStyles, /\.desktop-status-incident-timing\s*\{[^}]*font-size:\s*13px;/s);

  // Surface route badge column has 2-column grid layout (51px width)
  assert.match(currentServiceStyles, /\.current-service-routes\s*\{[^}]*display:\s*grid;/s);
  assert.match(currentServiceStyles, /\.current-service-routes\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*24px\);/s);
  assert.match(desktopChromeStyles, /\.desktop-status-surface-list \.current-service-routes\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*24px\);/s);

  // Surface notice descriptions are left-aligned with colored vertical indicator div (no colored container)
  assert.match(desktopChromeStyles, /\.desktop-status-surface-list \.current-service-notice-copy\s*\{[^}]*padding-left:\s*14px;/s);
  assert.match(desktopChromeStyles, /\.desktop-status-surface-list \.current-service-notice-copy\s*\{[^}]*position:\s*relative;/s);
  assert.doesNotMatch(desktopChromeStyles, /\.desktop-status-surface-list \.current-service-notice-copy\s*\{[^}]*border-radius:/s);
  assert.doesNotMatch(desktopChromeStyles, /\.desktop-status-surface-list \.current-service-notice-copy::before\s*\{[^}]*display:\s*none;/s);
  assert.match(desktopChromeStyles, /\.desktop-status-surface-list \.current-service-notice-text\s*\{[^}]*text-align:\s*left;/s);
  assert.match(currentServiceStyles, /\.current-service-notice\s*\{[^}]*text-align:\s*left;/s);

  // ElectricBorder stays on rail incidents; surface notices remain compact
  const desktopStatusSource = readFileSync(new URL("../src/components/DesktopStatusOverview.tsx", import.meta.url), "utf8");
  assert.match(desktopStatusSource, /<IncidentElectricBorder[\s\S]*?<button[^>]*className="desktop-status-incident-row"/);
  const surfaceSection = desktopStatusSource.slice(desktopStatusSource.indexOf('className="desktop-status-surface-list"'));
  assert.doesNotMatch(surfaceSection, /<IncidentElectricBorder/);
});

test("shared incident copy retains countdowns for active and upcoming closures", () => {
  const row = { id: "closure", kind: "planned-closure", iconKind: "suspension", condition: "Planned Closure in Effect", location: "Finch to Sheppard-Yonge", priority: 0, timing: "Ends Mon at 5:00 AM (2d 2h)", shuttle: true };
  assert.deepEqual(currentServiceIncidentPresentation(row), { title: "Planned Closure · In Effect", timing: "Ends Mon at 5:00 AM (2d 2h)" });
  assert.deepEqual(currentServiceIncidentPresentation({ ...row, condition: "Upcoming Closure", iconKind: undefined, priority: 2, timing: "today at 11:00 PM (30m)" }), { title: "Planned Closure · Upcoming", timing: "Starts today at 11:00 PM (30m)" });
  const saved = currentServiceSummary(data({ snapshot: { savedAt: Date.parse("2026-09-09T16:00:00Z") }, activeAlerts: [impact("closure", "1", { relatedPlannedClosureId: "parent" })] })).rows[0];
  assert.deepEqual(currentServiceIncidentPresentation(saved), { title: "Last Reported: Planned Closure · In Effect", timing: undefined });
  assert.equal(currentServiceIncidentPresentation({ ...row, kind: "suspension", condition: "No Service" }).title, "No Service");
});

test("window countdowns use compact units and truncate the smallest displayed unit", () => {
  const now = Date.parse("2026-09-28T16:00:00Z");
  for (const [milliseconds, expected] of [
    [1, "<1m"], [59_999, "<1m"], [60_000, "1m"], [12 * 60_000, "12m"],
    [60 * 60_000 - 1, "59m"], [60 * 60_000, "1h"], [200 * 60_000, "3h 20m"],
    [24 * 60 * 60_000 - 1, "23h 59m"], [24 * 60 * 60_000, "1d"],
    [48 * 60 * 60_000, "2d"], [51 * 60 * 60_000, "2d 3h"],
  ]) {
    assert.ok(windowTime(new Date(now + milliseconds).toISOString(), now).endsWith(` (${expected})`));
  }
  for (const value of [null, undefined, "", "invalid"]) assert.equal(windowTime(value, now), undefined);
  for (const reference of [0, now, now + 1]) {
    assert.doesNotMatch(windowTime(new Date(now).toISOString(), reference), /\([^)]*\)/);
  }
});

test("countdown colors reflect the exact time remaining without implying restoration", () => {
  const now = Date.parse("2026-09-28T16:00:00Z");
  for (const [remaining, expected] of [
    [60 * 60_000 + 1, "distant"], [60 * 60_000, "soon"],
    [15 * 60_000 + 1, "soon"], [15 * 60_000, "imminent"], [1, "imminent"],
    [0, undefined], [-1, undefined],
  ]) {
    assert.equal(windowCountdownStage(new Date(now + remaining).toISOString(), now), expected);
  }
  for (const value of [null, undefined, "invalid"]) assert.equal(windowCountdownStage(value, now), undefined);
  assert.equal(windowCountdownStage("2026-09-28T17:00:00Z", 0), undefined);
});

test("TTC and GO/UP countdowns track upcoming starts and the active occurrence's end", () => {
  const now = Date.parse("2026-09-28T16:00:00Z");
  for (const [networkId, lineId] of [["ttc", "1"], ["regional", "regional-lw"], ["regional", "regional-up"]]) {
    const closure = impact("parent", lineId, {
      nextWindowStart: "2026-09-28T19:20:00Z", nextWindowEnd: "2026-09-30T22:20:00Z",
    });
    const input = data({ networkId, lineStatuses: [line(lineId)], plannedClosures: [closure] });
    const upcoming = currentServiceIncidentPresentation(currentServiceSummary(input, now).rows[0]);
    assert.match(upcoming.timing, /^Starts today at 3:20 PM \(3h 20m\)$/);
    const active = currentServiceIncidentPresentation(currentServiceSummary(input, Date.parse(closure.nextWindowStart)).rows[0]);
    assert.match(active.timing, /^Ends Wed at 6:20 PM \(2d 3h\)$/);

    closure.activeNow = true;
    closure.activeWindowEnd = "2026-09-28T17:00:00Z";
    input.activeAlerts = [impact("child", lineId, { relatedPlannedClosureId: closure.id })];
    assert.match(currentServiceSummary(input, now).rows[0].timing, /\(1h\)$/);
    assert.equal(currentServiceSummary(input, now).rows[0].timingTarget, closure.activeWindowEnd);
    for (const endpoint of [null, "invalid", "2026-09-28T15:00:00Z"]) {
      closure.activeWindowEnd = endpoint;
      assert.doesNotMatch(currentServiceSummary(input, now).rows[0].timing || "", /\([^)]*\)/);
    }
    closure.activeWindowEnd = "2026-09-28T17:00:00Z";
    assert.equal(currentServiceSummary({ ...input, snapshot: { savedAt: now } }, now).rows[0].timing, undefined);
    assert.equal(currentServiceSummary({ ...input, snapshot: { savedAt: now } }, now).rows[0].timingTarget, undefined);
    input.activeAlerts = [impact("unscheduled", lineId, { startedAt: "2026-09-28T15:00:00Z", targetRemoval: "Tomorrow" })];
    input.plannedClosures = [];
    assert.equal(currentServiceSummary(input, now).rows[0].timing, undefined);
  }
});


test("regional rider facts survive summary projection, deduplication and saved snapshots", () => {
  const details = { cause: "Signal Problems", updatedAt: "2026-09-26T14:00:00Z", publishedAt: "2026-09-25T12:00:00Z", maximumDelayMinutes: 20, replacementService: "go-bus" };
  const input = data({ activeAlerts: [impact("a", "1", details)], delays: [impact("a", "1"), impact("b", "2", details)] });
  const rows = currentServiceSummary(input).rows;
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.deepEqual(regionalIncidentFacts(row), {
      cause: "Signal Problems", service: "Reported Delay: 20 min · GO Buses Replace Trains",
      publishedAt: details.publishedAt,
    });
  }
  const saved = currentServiceSummary({ ...input, snapshot: { savedAt: Date.parse(details.updatedAt) }, generatedAt: { live: false } });
  assert.match(saved.rows[0].condition, /^Last reported:/);
  assert.equal(saved.rows[0].updatedAt, details.updatedAt);
});

test("regional rider facts omit unknown, invalid and generic values", () => {
  const row = currentServiceSummary(data({ activeAlerts: [impact("a", "1")] })).rows[0];
  for (const cause of [undefined, null, " ", "Metrolinx service update", "Unknown", "Unknown Cause", "UNKNOWN_CAUSE", "Unknown   Cause", "Modified Trip"]) {
    assert.deepEqual(regionalIncidentFacts({ ...row, cause, maximumDelayMinutes: -1, replacementService: "unknown", updatedAt: "bad", publishedAt: "bad" }), {
      cause: undefined, service: "", publishedAt: undefined,
    });
  }
});


test("regional incident publication time never falls back to a fresh poll timestamp", () => {
  const input = data({ activeAlerts: [impact("a", "1", { updatedAt: "2026-09-26T14:00:00Z" })] });
  assert.equal(regionalIncidentFacts(currentServiceSummary(input).rows[0]).publishedAt, undefined);
  input.activeAlerts[0].publishedAt = "2026-09-24T12:00:00Z";
  input.activeAlerts[0].updatedAt = "2026-09-26T15:00:00Z";
  assert.equal(regionalIncidentFacts(currentServiceSummary(input).rows[0]).publishedAt, "2026-09-24T12:00:00Z");
});


test("regional incident facts never present a feed validity boundary as a scheduled service end", () => {
  const row = currentServiceSummary(data({ activeAlerts: [impact("a", "1")] })).rows[0];
  assert.equal(Object.hasOwn(regionalIncidentFacts({ ...row, scheduledEndAt: "2026-09-27T04:12:00Z" }), "scheduledEndAt"), false);
});
