import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

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
const shellSource = readFileSync(
  new URL("../src/components/LineWatchShell.tsx", import.meta.url),
  "utf8",
);
const moreSheetSource = readFileSync(
  new URL("../src/components/MobileMoreSheet.tsx", import.meta.url),
  "utf8",
);
const cssSource = readAppStylesheet();

describe("alert history timeline UI", () => {
  it("renders period chips and whole-incident status filters", () => {
    assert.match(timelineSource, /Today/);
    assert.match(timelineSource, /7 days/);
    assert.match(timelineSource, /30 days/);
    assert.match(timelineSource, /All/);
    assert.match(timelineSource, /Active/);
    assert.match(timelineSource, /Cleared/);
    assert.match(timelineSource, /aria-label="Incident status"/);
  });

  it("loads alert history from the data adapter", () => {
    assert.match(timelineSource, /getAlertHistory/);
    assert.match(timelineSource, /AlertHistoryPeriod/);
    assert.match(timelineSource, /durationMinutes/);
    assert.match(timelineSource, /clearedAt/);
  });

  it("loads the history for the active TTC or GO/UP map mode", () => {
    assert.match(panelSource, /network: NetworkId/);
    assert.match(panelSource, /<AlertHistoryTimeline network=\{network\}/);
    assert.match(timelineSource, /getAlertHistory\(period, network\)/);
    assert.match(shellSource, /<AlertHistoryPanel[\s\S]*network=\{selectedNetwork\}/);
  });

  it("offers Alert History in mobile and desktop menus for either map mode", () => {
    assert.doesNotMatch(moreSheetSource, /currentNetwork === "ttc" \? <div className="mobile-more-section">[\s\S]*?<h3>Notifications<\/h3>/);
    assert.match(moreSheetSource, /My Stations[\s\S]*?Alert History/);
    assert.match(shellSource, /Streetcar & Bus Notices[\s\S]*?Alert History/);
  });

  it("offers front-facing Alert History shortcuts without displacing the mobile edge shortcut", () => {
    assert.match(shellSource, /<LogsDropdown network=\{selectedNetwork\} \/>[\s\S]*?className="alert-history-shortcut[\s\S]*?aria-label="Open Alert History"[\s\S]*?aria-label="Toggle theme"/);
    assert.match(shellSource, /className="mobile-network-selector-slot"[\s\S]*?className="mobile-alert-history-shortcut md:hidden"[\s\S]*?className="mobile-my-stations-shortcut md:hidden"/);
    assert.match(cssSource, /\.mobile-alert-history-shortcut,[\s\S]*?\.mobile-my-stations-shortcut\s*\{[^}]*height:\s*var\(--mobile-top-action-button-size\) !important;/s);
    assert.match(panelSource, /<History className="[^"]*text-emerald-500[^"]*"/);
    assert.match(shellSource, /<History className="alert-history-shortcut-icon text-emerald-500"/);
    assert.match(cssSource, /\.alert-history-shortcut\s*\{[^}]*color:\s*#10b981;/s);
    assert.equal((shellSource.match(/alert-history-shortcut-icon/g) ?? []).length, 2);
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

  it("uses compact card-like rows with the authored TTC legend badges", () => {
    assert.match(timelineSource, /TransitLineBadge/);
    assert.match(timelineSource, /CompactImpactLocation/);
    assert.match(timelineSource, /<CompactImpactLocation location=\{incident\.location\}/);
    assert.match(cssSource, /\.compact-impact-location__arrow\s*\{[^}]*display:\s*block;[^}]*height:\s*0\.75rem;[^}]*width:\s*1\.25rem;/s);
    assert.match(timelineSource, /className="alert-history-line-badge"/);
    assert.match(timelineSource, /alert-history-line-name min-w-0 truncate/);
    assert.match(timelineSource, /alert-history-fact-grid/);
    assert.match(timelineSource, /alert-history-status-label/);
    assert.match(cssSource, /\.alert-history-fact-grid/);
    assert.match(cssSource, /\.alert-history-status-label/);
    assert.match(timelineSource, /alert-history-fact-location/);
    assert.match(cssSource, /\.alert-history-fact-location\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/s);
    assert.match(cssSource, /\.alert-history-fact-location\s*>\s*strong\s*\{[^}]*white-space:\s*normal;/s);
    assert.doesNotMatch(timelineSource, /alert-history-line-number/);
    assert.doesNotMatch(cssSource, /\.alert-history-line-number/);
  });

  it("keeps line and status pills at matching heights", () => {
    assert.match(timelineSource, /size=\{24\}/);
    assert.match(cssSource, /\.alert-history-status-label\s*\{[^}]*min-height:\s*1\.5rem;/s);
  });

  it("labels every history card with its alert type and matching icon", () => {
    assert.match(timelineSource, /<HistoryAlertType eventType=\{incident\.eventType\}/);
    assert.match(timelineSource, /formatAlertTypeName\(normalizedType\)/);
    assert.match(timelineSource, /renderSortOptionIcon\(normalizedType\)/);
    assert.match(cssSource, /\.alert-history-type-label/);
    assert.match(cssSource, /\.alert-history-type-suspension/);
    assert.match(cssSource, /\.alert-history-type-delay/);
    assert.match(cssSource, /\.alert-history-type-reduced-speed-zone/);
    assert.match(cssSource, /\.alert-history-type-planned-closure/);
  });

  it("uses the site-wide alert palette for history type badges", () => {
    assert.match(cssSource, /\.alert-history-type-delay\s*\{[^}]*rgba\(254, 236, 65,[^}]*#a16207;/s);
    assert.match(cssSource, /\.dark \.alert-history-type-delay\s*\{[^}]*#FEEC41;/s);
    assert.match(cssSource, /\.high-contrast \.alert-history-type-delay\s*\{[^}]*background:\s*#FEEC41;[^}]*color:\s*#000000;/s);
    assert.match(cssSource, /\.alert-history-type-suspension[\s\S]*?color:\s*var\(--danger\);/s);
    assert.match(cssSource, /\.alert-history-type-reduced-speed-zone\s*\{[^}]*var\(--impact-rsz-soft\);[^}]*var\(--impact-rsz-border\);/s);
    assert.match(cssSource, /\.alert-history-type-planned-closure\s*\{[^}]*var\(--planned\);/s);
  });

  it("uses a stable latest-state badge instead of changing the card for a filter", () => {
    assert.match(timelineSource, /formatHistoryStateLabel\(latestState\)/);
    assert.match(timelineSource, /incident\.latestState \|\| latestEvent\.state/);
    assert.match(timelineSource, /alert-history-status-\$\{latestState\}/);
    assert.match(cssSource, /\.alert-history-status-updated/);
  });

  it("uses the shared compact timestamp formatter for visible history times", () => {
    assert.match(timelineSource, /formatImpactTimestamp/);
    assert.match(timelineSource, /formatFullImpactTimestamp/);
    assert.match(timelineSource, /function HistoryTimestamp/);
    assert.doesNotMatch(timelineSource, /formatRelativeImpactTime/);
  });

  it("keeps short lifecycles open and collapses only long lifecycles by default", () => {
    assert.match(timelineSource, /formatAlertHistoryDuration\(incident\.durationMinutes\)/);
    assert.match(timelineSource, /primary \? " alert-history-primary-time"/);
    assert.match(timelineSource, /ClipboardList/);
    assert.match(timelineSource, /className="alert-history-details-heading"/);
    assert.match(timelineSource, /const COLLAPSED_LIFECYCLE_THRESHOLD = 4/);
    assert.match(timelineSource, /incident\.events\.length <= COLLAPSED_LIFECYCLE_THRESHOLD/);
    assert.match(timelineSource, /<details[\s\S]*?open=\{lifecycleExpanded\}/);
    assert.match(timelineSource, /onToggle=\{\(event\) => setLifecycleExpanded/);
    assert.match(timelineSource, /incident\.events\.length === 1 \? "event" : "events"/);
    assert.match(timelineSource, /alert-history-details-chevron/);
    assert.match(cssSource, /\.alert-history-details\[open\] \.alert-history-details-chevron/);
    assert.match(cssSource, /\.alert-history-primary-time\s*\{[^}]*font-weight:\s*750;/s);
    assert.match(cssSource, /\.alert-history-duration\s*>\s*strong\s*\{[^}]*font-size:\s*0\.82rem;/s);
    assert.match(timelineSource, /className=\{`impact-timestamp/);
    assert.match(cssSource, /\.impact-timestamp\s*\{[^}]*font-variant-numeric:\s*tabular-nums;[^}]*font-weight:\s*850;/s);
  });

  it("keeps the timestamp on the line axis and places badges below the line name", () => {
    assert.match(timelineSource, /alert-history-heading-top[\s\S]*?HistoryLineIdentity incident=\{incident\}[\s\S]*?HistoryTimestamp timestamp=\{time\} primary[\s\S]*?alert-history-heading-badges/);
    assert.match(timelineSource, /alert-history-heading-top[\s\S]*?flexDirection: "row"[\s\S]*?flexWrap: "nowrap"/);
    assert.match(cssSource, /\.alert-history-heading-top\s*\{[^}]*display:\s*flex;[^}]*flex-flow:\s*row nowrap;/s);
    assert.match(cssSource, /\.alert-history-line-identity\s*\{[^}]*align-items:\s*center;[^}]*display:\s*flex;/s);
    assert.doesNotMatch(cssSource, /\.alert-history-primary-time\s*\{[^}]*(?:background|border|border-radius|padding):/s);
    assert.doesNotMatch(timelineSource, /<span className="alert-history-primary-time">/);
  });

  it("gives the line identity and primary timestamp clear header emphasis", () => {
    assert.match(timelineSource, /primary \? <Clock3 size=\{13\}/);
    assert.match(cssSource, /\.alert-history-line-name\s*\{[^}]*font-size:\s*0\.94rem;[^}]*font-weight:\s*900;[^}]*line-height:\s*1\.25;/s);
    assert.match(cssSource, /\.alert-history-line-badge\s*\{[^}]*flex:\s*0 0 auto;/s);
    assert.match(cssSource, /\.alert-history-primary-time\s*\{[^}]*align-self:\s*center;[^}]*font-size:\s*0\.8rem;[^}]*line-height:\s*1;[^}]*margin-left:\s*auto;/s);
    assert.match(cssSource, /\.alert-history-primary-time svg\s*\{[^}]*height:\s*0\.8125rem;[^}]*width:\s*0\.8125rem;/s);
  });

  it("title-cases lifecycle event labels", () => {
    assert.match(timelineSource, /formatHistoryStatusLabel\(event\.label\)/);
    assert.doesNotMatch(timelineSource, /<span>\{event\.label\}<\/span>/);
  });

  it("adds status-colored dots to lifecycle events", () => {
    assert.match(timelineSource, /historyLifecycleTone\(event\.state\)/);
    assert.match(timelineSource, /state === "cleared"/);
    assert.match(timelineSource, /state === "opened"/);
    assert.match(cssSource, /\.alert-history-lifecycle-event::before/);
    assert.match(cssSource, /\.alert-history-lifecycle-opened::before/);
    assert.match(cssSource, /\.alert-history-lifecycle-cleared::before/);
  });

  it("uses occurrence identity for repeated source alert cards", () => {
    assert.match(timelineSource, /key=\{historyIncidentKey\(item\.incident\)\}/);
    assert.match(timelineSource, /incident\.incidentId/);
    assert.match(timelineSource, /incident\.events\.at\(-1\)\?\.id/);
  });

  it("uses a plain inline checkmark for cleared history rows", () => {
    assert.match(timelineSource, /Check\s+size=\{12\}/);
    assert.doesNotMatch(timelineSource, /CheckCircle2/);
    assert.match(cssSource, /\.alert-history-status-label svg\s*\{[^}]*width:\s*0\.72rem;/s);
    assert.match(cssSource, /\.alert-history-status-label svg\s*\{[^}]*height:\s*0\.72rem;/s);
  });

  it("keeps thin card accents without the centered route strip", () => {
    assert.match(cssSource, /border-left:\s*(?:1\.5|2)px solid/);
    assert.doesNotMatch(timelineSource, /HistoryRouteSummary/);
    assert.doesNotMatch(timelineSource, /historyRouteParts/);
    assert.doesNotMatch(timelineSource, /alert-history-route-summary/);
    assert.doesNotMatch(cssSource, /\.alert-history-route-stop/);
    assert.doesNotMatch(cssSource, /\.alert-history-route-arrow/);
  });

  it("renders search, transit line, alert type, and sort selector controls on two lines", () => {
    assert.match(timelineSource, /Search alert history/);
    assert.match(timelineSource, /Transit line/);
    assert.match(timelineSource, /Alert type/);
    assert.match(timelineSource, /Sort alert history/);
    assert.match(timelineSource, /Search\s+size=\{14\}/);
    assert.match(timelineSource, /buildAlertHistoryLineOptions/);
    assert.match(timelineSource, /buildAlertHistoryTypeOptions/);
    assert.match(timelineSource, /buildAlertHistorySortGroups/);
    assert.match(timelineSource, /buildAlertHistorySortOptions/);
    assert.match(timelineSource, /filterAndSortAlertHistory/);
    assert.match(cssSource, /\.alert-history-search-row/);
    assert.match(cssSource, /\.alert-history-selects-row/);
    assert.match(cssSource, /\.alert-history-search-field/);
    assert.match(cssSource, /\.alert-history-line-filter/);
    assert.match(cssSource, /\.alert-history-line-filter-trigger/);
    assert.match(cssSource, /\.alert-history-line-filter-options/);
    assert.match(cssSource, /\.alert-history-line-filter-option/);
    assert.match(cssSource, /\.alert-history-sort-group-header/);
  });

  it("qualifies occurrences by the selected period and filters whole cards by latest state", () => {
    assert.match(filterSource, /selectLatestEvent/);
    assert.match(filterSource, /incidentFallsWithinWindow/);
    assert.match(filterSource, /controls\.statusFilter === "active"/);
    assert.match(filterSource, /controls\.statusFilter === "cleared"/);
    assert.doesNotMatch(filterSource, /selectDisplayEvent/);
  });

  it("keeps 30-day search responsive with deferred, indexed, progressive rendering", () => {
    assert.match(timelineSource, /useDeferredValue\(searchQuery\)/);
    assert.match(timelineSource, /buildAlertHistorySearchIndex\(history\)/);
    assert.match(timelineSource, /const HISTORY_PAGE_SIZE = 50/);
    assert.match(timelineSource, /visibleItems\.slice\(0, visibleCount\)/);
    assert.match(timelineSource, /Show \{Math\.min\(HISTORY_PAGE_SIZE/);
    assert.match(timelineSource, /const HistoryIncident = memo/);
    assert.match(timelineSource, /events\.map\(\(event, index\) =>/);
    assert.match(cssSource, /\.alert-history-item\s*\{[^}]*content-visibility:\s*auto;/s);
  });
});

