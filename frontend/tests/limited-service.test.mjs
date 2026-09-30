import { readFileSync } from "node:fs";
import { projectImpactedStations } from "../src/app/geographic-overlays.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { currentServiceSummary, currentServiceIncidentPresentation } from "../src/app/current-service.ts";
import { currentAdvisoryBucket, serviceEffectLabel, ALERT_CATEGORIES } from "../src/app/alert-categories.ts";
import { stationImpactSelection } from "../src/app/station-impact-types.ts";
import { searchDashboardImpacts, matchImpactCategories } from "../src/app/alert-search.ts";
import { normalizeActiveClosureMapImpact, getEligiblePlannedClosures, plannedAdvisoryStationImpacts } from "../src/app/map-alert-selector.ts";
import { normalizeEventTypeKey, formatAlertTypeName, isSameEventType, buildAlertHistoryTypeOptions } from "../src/components/alert-history-filters.ts";
import { getOverlappingImpactRefs } from "../src/components/impact-overlap-refs.ts";
import { plannedAdvisoryStatus } from "../src/app/planned-advisory-status.ts";

const parent = {
  id: "parent", lineId: "line-1", lineNumber: "1", title: "Limited nightly service",
  description: "There will be limited service due to planned track work.", location: "Vaughan to Finch West",
  cause: "Closure - Planned Track Work", previewSegmentIds: ["span"], source: "Synthetic test fixture",
  activeNow: true, timingStatus: "active-now", serviceEffect: "limited-service",
  activeWindowStart: "2026-09-29T03:00:00Z", activeWindowEnd: "2026-09-29T06:00:00Z",
};
const child = {
  ...parent, id: "child", title: "There is limited subway service", affectedSegmentIds: ["span"],
  relatedPlannedClosureId: "parent", activeWindowEnd: parent.activeWindowEnd,
};
const data = {
  activeAlerts: [], delays: [child], plannedClosures: [parent], reducedSpeedZones: [],
  networkSegments: [{ id: "span", lineId: "line-1", impacts: [{ kind: "delay", cardId: "child", sourceAlertIds: ["child"] }] }],
  stationNodeImpacts: [], lineStatuses: [], generatedAt: { live: true }, availability: "available",
};

test("limited service uses one delay row and retains its specific effect and nightly end", () => {
  const summary = currentServiceSummary(data, Date.parse("2026-09-29T04:00:00Z"));
  assert.equal(summary.rows.length, 1);
  assert.equal(summary.rows[0].kind, "delay");
  assert.equal(currentServiceIncidentPresentation(summary.rows[0]).title, "Limited Service");
  assert.equal(summary.rows[0].timingTarget, parent.activeWindowEnd);
  assert.equal(summary.rows[0].maximumDelayMinutes, undefined);
  assert.equal(summary.rows[0].shuttle, false);
  assert.equal(serviceEffectLabel(parent, true), "Planned limited service");
  assert.deepEqual(stationImpactSelection("parent", data), { kind: "delay", id: "child" });
});

test("effect-aware map normalization uses orange current impact and blue selected planned preview", () => {
  const impact = normalizeActiveClosureMapImpact({ kind: "planned-closure", cardId: "parent" }, new Map([["parent", "child"]]), [parent]);
  assert.equal(impact.kind, "delay");
  assert.equal(impact.cardId, "child");
  assert.equal(getEligiblePlannedClosures([parent], []).eligiblePlannedClosures.length, 0);
  assert.equal(getEligiblePlannedClosures([parent], [], { kind: "planned-closure", id: "parent" }).eligiblePlannedClosures.length, 1);
  assert.equal(currentAdvisoryBucket({}), "suspension");
  assert.equal(serviceEffectLabel({}), "Delay");
});

test("search preserves old category aliases while using new buckets and specific source effect", () => {
  assert.equal(matchImpactCategories("active alerts")[0].label, "Suspensions");
  assert.equal(matchImpactCategories("planned advisories")[0].label, "Planned Advisories");
  assert.equal(matchImpactCategories("planned closure")[0].label, "Planned Advisories");
  const groups = searchDashboardImpacts(data, [], "limited service");
  assert.ok(groups.some(group => group.label === "Delays" && group.results.some(result => result.selection.id === "child")));
  assert.equal(ALERT_CATEGORIES["reduced-speed-zone"].label, "Reduced Speed Zones");
});

test("linked planned parent is not a second overlapping current impact", () => {
  const refs = getOverlappingImpactRefs({ kind: "delay", id: "child", segmentIds: ["span"] }, data);
  assert.ok(!refs.some(ref => ref.selection.id === "parent"));
});

test("planned advisory excludes its linked delay while preserving independent overlapping incidents", () => {
  const otherDelay = { ...child, id: "independent", relatedPlannedClosureId: undefined };
  const refs = getOverlappingImpactRefs({ kind: "planned-closure", id: "parent", segmentIds: ["span"] }, { ...data, delays: [child, otherDelay] });
  assert.deepEqual(refs.map(ref => ref.selection), [{ kind: "delay", id: "independent" }]);
  const fromOther = getOverlappingImpactRefs({ kind: "delay", id: "independent", segmentIds: ["span"] }, { ...data, delays: [child, otherDelay] });
  assert.deepEqual(fromOther.map(ref => ref.selection), [{ kind: "delay", id: "child" }]);
});

test("nightly advisory status uses Toronto dates and keeps incomplete schedules explicit", () => {
  const nightly = { nightly: true, timingStatus: "upcoming", nextWindowStart: "2026-09-30T03:00:00Z" };
  assert.equal(plannedAdvisoryStatus(nightly, Date.parse("2026-09-29T16:00:00Z")), "Next Tonight");
  assert.equal(plannedAdvisoryStatus(nightly, Date.parse("2026-09-29T03:30:00Z")), "Next: Tue, Sep 29");
  assert.equal(plannedAdvisoryStatus({ ...nightly, nightly: false }, Date.parse("2026-09-29T16:00:00Z")), "Next: Tue, Sep 29");
  assert.equal(plannedAdvisoryStatus({ timingStatus: "unknown" }, null), "Schedule incomplete");
  assert.equal(plannedAdvisoryStatus({ nextWindowStart: "invalid" }, null), "Schedule incomplete");
});

test("legacy and offline payloads retain source-honest compatibility", () => {
  assert.equal(currentServiceSummary({ ...data, availability: "unavailable", generatedAt: { live: false } }).rows.length, 0);
  const saved = currentServiceSummary({ ...data, availability: "unavailable", generatedAt: { live: false }, snapshot: { savedAt: Date.parse("2026-09-29T04:00:00Z") } });
  assert.equal(currentServiceIncidentPresentation(saved.rows[0]).title, "Last Reported: Limited Service");
  assert.equal(saved.rows[0].timing, undefined);
});

test("limited history retains its effect label within the existing Delays filter", () => {
  assert.equal(normalizeEventTypeKey("limited-service"), "delay");
  assert.equal(formatAlertTypeName("limited-service"), "Limited service");
  assert.equal(isSameEventType("limited-service", "delay"), true);
  const options = buildAlertHistoryTypeOptions([{ eventType: "limited-service" }]);
  assert.equal(options.filter(option => option.value === "delay").length, 1);
  assert.ok(!options.some(option => option.value === "limited-service"));
});

test("station-only planned previews stay local and defer to their current delay", () => {
  const stationAdvisory = { ...parent, previewSegmentIds: [], previewStationIds: ["finch-west"] };
  assert.deepEqual(plannedAdvisoryStationImpacts([stationAdvisory], [], [child]), []);
  const selected = plannedAdvisoryStationImpacts([stationAdvisory], [], [child], { kind: "planned-closure", id: "parent" });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].stationId, "finch-west");
  assert.equal(selected[0].kind, "planned-closure");
  assert.equal(selected[0].cardId, "parent");
  assert.equal(plannedAdvisoryStationImpacts([{ ...stationAdvisory, activeNow: false, timingStatus: "upcoming" }])[0].stationId, "finch-west");
});

test("geographic station projections use orange current and blue planned colors at one station", () => {
  const catalog = JSON.parse(readFileSync(new URL("../public/assets/linewatch/geographic/ttc-catalog.json", import.meta.url), "utf8"));
  const current = projectImpactedStations(catalog, [{ stationId: "jane", kind: "delay", cardId: "child", title: "Limited service" }]);
  const preview = projectImpactedStations(catalog, plannedAdvisoryStationImpacts([
    { ...parent, activeNow: false, timingStatus: "upcoming", previewSegmentIds: [], previewStationIds: ["jane"] },
  ]));
  assert.equal(current.features.length, 1);
  assert.equal(current.features[0].properties.impactColor, "#f59e0b");
  assert.equal(preview.features.length, 1);
  assert.equal(preview.features[0].properties.impactColor, "#3b82f6");
  assert.deepEqual(preview.features[0].geometry.coordinates, current.features[0].geometry.coordinates);
});
