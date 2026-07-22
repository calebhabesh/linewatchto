import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const timelineSource = readFileSync(
  new URL("../src/components/AlertHistoryTimeline.tsx", import.meta.url),
  "utf8",
);
const filterSource = readFileSync(
  new URL("../src/components/alert-history-filters.ts", import.meta.url),
  "utf8",
);
const panelSource = readFileSync(
  new URL("../src/components/AlertHistoryPanel.tsx", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);

describe("alert history timeline UI", () => {
  it("renders period chips and lifecycle filters", () => {
    assert.match(timelineSource, /Today/);
    assert.match(timelineSource, /7 days/);
    assert.match(timelineSource, /30 days/);
    assert.match(timelineSource, /All/);
    assert.match(timelineSource, /Alerts/);
    assert.match(timelineSource, /Clearances/);
  });

  it("loads alert history from the data adapter", () => {
    assert.match(timelineSource, /getAlertHistory/);
    assert.match(timelineSource, /AlertHistoryPeriod/);
    assert.match(timelineSource, /durationMinutes/);
    assert.match(timelineSource, /clearedAt/);
  });

  it("is mounted inside the custom alert history panel", () => {
    assert.match(panelSource, /AlertHistoryTimeline/);
  });

  it("adds scoped timeline styles", () => {
    assert.match(cssSource, /\.alert-history-timeline/);
    assert.match(cssSource, /\.alert-history-event-cleared/);
    assert.match(cssSource, /\.alert-history-period-chip/);
    assert.match(cssSource, /\.alert-history-divider/);
  });

  it("uses compact card-like rows with simple filled TTC line badges", () => {
    assert.match(timelineSource, /lineColor/);
    assert.match(timelineSource, /formatCompactLocation/);
    assert.match(timelineSource, /min-h-6 max-w-full min-w-0 items-center gap-1\.5 rounded-full/);
    assert.match(timelineSource, /border-black\/10 px-2\.5 py-0\.5 text-\[11px\] font-black/);
    assert.match(timelineSource, /alert-history-line-identity/);
    assert.match(timelineSource, /alert-history-fact-grid/);
    assert.match(timelineSource, /alert-history-status-label/);
    assert.match(cssSource, /\.alert-history-line-identity/);
    assert.match(cssSource, /\.alert-history-fact-grid/);
    assert.match(cssSource, /\.alert-history-status-label/);
    assert.doesNotMatch(timelineSource, /alert-history-line-number/);
    assert.doesNotMatch(cssSource, /\.alert-history-line-number/);
    assert.doesNotMatch(cssSource, /\.alert-history-line-identity\s*\{[^}]*box-shadow/s);
  });

  it("keeps line and status pills at matching heights", () => {
    assert.match(timelineSource, /min-h-6/);
    assert.match(cssSource, /\.alert-history-status-label\s*\{[^}]*min-height:\s*1\.5rem;/s);
  });

  it("formats alert event labels in title case", () => {
    assert.match(timelineSource, /formatHistoryStatusLabel\(displayEvent\?\.label\)/);
    assert.doesNotMatch(timelineSource, /displayEvent\?\.label\s+\?\?\s+"Active"/);
  });

  it("uses the shared compact timestamp formatter for visible history times", () => {
    assert.match(timelineSource, /formatImpactTimestamp/);
    assert.match(timelineSource, /formatFullImpactTimestamp/);
    assert.match(timelineSource, /function HistoryTimestamp/);
    assert.doesNotMatch(timelineSource, /formatRelativeImpactTime/);
  });

  it("uses a plain inline checkmark for cleared history rows", () => {
    assert.match(timelineSource, /Check\s+size=\{12\}/);
    assert.doesNotMatch(timelineSource, /CheckCircle2/);
    assert.match(cssSource, /\.alert-history-status-label svg\s*\{[^}]*width:\s*0\.72rem;/s);
    assert.match(cssSource, /\.alert-history-status-label svg\s*\{[^}]*height:\s*0\.72rem;/s);
  });

  it("keeps thin card accents without the centered route strip", () => {
    assert.match(cssSource, /border-left:\s*2px solid/);
    assert.doesNotMatch(timelineSource, /HistoryRouteSummary/);
    assert.doesNotMatch(timelineSource, /historyRouteParts/);
    assert.doesNotMatch(timelineSource, /alert-history-route-summary/);
    assert.doesNotMatch(cssSource, /\.alert-history-route-stop/);
    assert.doesNotMatch(cssSource, /\.alert-history-route-arrow/);
  });

  it("renders search, transit line, and sort by alert type selector controls on two lines", () => {
    assert.match(timelineSource, /Search alert history/);
    assert.match(timelineSource, /Transit line/);
    assert.match(timelineSource, /Sort alert history/);
    assert.match(timelineSource, /Search\s+size=\{14\}/);
    assert.match(timelineSource, /buildAlertHistoryLineOptions/);
    assert.match(timelineSource, /buildAlertHistorySortOptions/);
    assert.match(timelineSource, /filterAndSortAlertHistory/);
    assert.match(cssSource, /\.alert-history-search-row/);
    assert.match(cssSource, /\.alert-history-selects-row/);
    assert.match(cssSource, /\.alert-history-search-field/);
    assert.match(cssSource, /\.alert-history-line-filter/);
    assert.match(cssSource, /\.alert-history-line-filter-trigger/);
    assert.match(cssSource, /\.alert-history-line-filter-options/);
    assert.match(cssSource, /\.alert-history-line-filter-option/);
  });

  it("uses event-aware lifecycle filtering instead of incident-only filtering", () => {
    assert.match(filterSource, /selectDisplayEvent/);
    assert.match(filterSource, /filter === "alerts"/);
    assert.match(filterSource, /event\.state !== "cleared"/);
    assert.match(filterSource, /filter === "clearances"/);
    assert.match(filterSource, /event\.state === "cleared"/);
    assert.doesNotMatch(timelineSource, /history\.filter\(\(incident\) => incident\.status === "cleared"\)/);
    assert.doesNotMatch(timelineSource, /incident\.events\.some\(\(event\) => event\.state !== "cleared"\)/);
  });
});
