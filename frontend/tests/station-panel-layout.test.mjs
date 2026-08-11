import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const panelSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");
const stationHeaderSource = readFileSync(new URL("../src/components/StationDetailHeader.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("station detail panel layout", () => {
  it("only lets a delayed panel close clear the station that started closing", () => {
    assert.match(
      shellSource,
      /onClose=\{\(\) => closeSelectedStation\(selectedStationId\)\}/,
    );
    assert.match(shellSource, /setSelectedStationId\(\(current\) => current === expectedStationId \? null : current\)/);
    assert.match(shellSource, /key=\{`\$\{selectedStationId\}:\$\{stationPanelActivationKey\}`\}/);
    assert.match(panelSource, /window\.clearTimeout\(closeTimeoutRef\.current\)/);
  });

  it("uses a right dock on desktop and a bottom sheet on mobile", () => {
    assert.match(panelSource, /station-detail-panel/);
    assert.match(panelSource, /md:right-6/);
    assert.match(panelSource, /md:top-\[104px\]/);
    assert.match(panelSource, /bottom-0/);
    assert.match(panelSource, /rounded-t-lg/);
  });

  it("renders schedule-aware arrivals and disruption warning", () => {
    assert.match(panelSource, /useSubwayOperatingState/);
    assert.match(panelSource, /subwayOperatingState\.status === "closed"/);
    assert.match(panelSource, /data-arrivals-subway-closed/);
    assert.match(panelSource, /Subway Closed/);
    assert.match(panelSource, /Arrivals Not Available/);
    assert.match(panelSource, /data-arrivals-subway-closed="true"[\s\S]*<h3/);
    assert.match(panelSource, /data-arrivals-subway-closed="true"[\s\S]*station\.arrivalsSource/);
    assert.match(panelSource, /data-arrivals-subway-closed="true"[\s\S]*text-sm font-semibold/);
    assert.match(panelSource, /Schedule May Be Disrupted/);
    assert.doesNotMatch(panelSource, /station\.arrivalContext\.reason/);
    assert.match(panelSource, /data-arrivals-disrupted/);
    assert.match(panelSource, /arrivalContext\.scheduleMayBeDisrupted/);
    assert.match(panelSource, /href=\{`#station-impact-\$\{impact\.id\}`\}/);
    assert.match(panelSource, /Jump to station impact:/);
    assert.match(panelSource, /station-impact-jump-actions/);
    assert.doesNotMatch(panelSource, /View impacts/);
    assert.match(panelSource, /station-impact-jump-button/);
    assert.match(panelSource, /station-impact-jump-button-label/);
    assert.match(panelSource, />Press</);
    assert.match(globalCss, /\.station-impact-jump-button/);
    assert.match(globalCss, /\.station-impact-jump-button-label/);
    assert.match(panelSource, /groupStationArrivals/);
    assert.match(panelSource, /stationId:\s*station\.id/);
    assert.match(panelSource, /data-arrival-group/);
    assert.match(panelSource, /data-arrival-due/);
    assert.match(panelSource, /formatArrivalDisclaimer/);
    assert.match(panelSource, /formatArrivalSourceSummary/);
    assert.match(panelSource, /formatArrivalSourceBadgeLabel/);
    assert.match(panelSource, /formatArrivalTileLabel/);
    assert.match(panelSource, /formatArrivalClockTime/);
    assert.match(panelSource, /arrivalTick/);
    assert.match(panelSource, /hasArrivalCountdownTicker/);
    assert.doesNotMatch(panelSource, /hasLiveArrivalCountdown/);
    assert.match(panelSource, /window\.setInterval\(\(\) => setArrivalTick\(Date\.now\(\)\), 3000\)/);
    assert.match(panelSource, /includeEmptyDirections:\s*hasLiveArrivals/);
    assert.match(panelSource, /Refreshing Live Arrivals/);
    assert.match(panelSource, /No live ETA for this direction right now\. Live updates may appear at any moment\./);
    assert.match(panelSource, /emptyLiveDirection/);
    assert.match(panelSource, /detailedCountdown/);
    assert.match(panelSource, /data-arrival-source/);
    assert.match(panelSource, /arrivalSourceBadgeClassName/);
    assert.match(panelSource, /arrivalSourceTitle/);
    assert.match(panelSource, /whitespace-nowrap/);
    assert.match(panelSource, /md:w-\[min\(calc\(100vw-48px\),460px\)\]/);
  });

  it("renders unavailable arrival data as muted section text instead of arrival cards", () => {
    assert.match(panelSource, /hasUnavailableArrivals/);
    assert.match(panelSource, /Arrival Data Unavailable/);
    assert.match(panelSource, /hasUnavailableArrivals\s*\?\s*\[\]\s*:\s*groupStationArrivals/);
    assert.doesNotMatch(panelSource, /Arrival predictions are currently unavailable\./);
  });

  it("separates transfer-station arrival groups only when the transit line changes", () => {
    assert.match(panelSource, /station-arrival-line-divider/);
    assert.match(panelSource, /data-arrival-line-divider/);
    assert.match(panelSource, /showLineDivider = sectionIndex > 0/);
    assert.match(globalCss, /\.station-arrival-line-divider\s*\{[^}]*height:\s*3px;/s);
    assert.match(globalCss, /\.station-arrival-line-divider\s*\{[^}]*linear-gradient/s);
    assert.doesNotMatch(panelSource, /border-t.*data-arrival-group/);
  });

  it("keeps line and platform details in the header and orders sections by rider priority", () => {
    const headerDetailsIndex = panelSource.indexOf('data-station-header-line-details');
    const arrivalsIndex = panelSource.indexOf('data-station-section="arrivals"');
    const accessibilityIndex = panelSource.indexOf('data-station-section="accessibility"');
    const impactsIndex = panelSource.indexOf('data-station-section="station-impacts"');
    const titleRowIndex = panelSource.indexOf("<StationDetailHeader");
    const accessibilityChipsIndex = panelSource.indexOf("isWheelchairAccessible || hasElevator");

    assert.notEqual(headerDetailsIndex, -1);
    assert.notEqual(arrivalsIndex, -1);
    assert.notEqual(accessibilityIndex, -1);
    assert.notEqual(impactsIndex, -1);
    assert.notEqual(titleRowIndex, -1);
    assert.notEqual(accessibilityChipsIndex, -1);
    assert.equal(panelSource.indexOf('data-station-section="line-details"'), -1);
    assert.ok(titleRowIndex < accessibilityChipsIndex);
    assert.ok(accessibilityChipsIndex < headerDetailsIndex);
    assert.ok(headerDetailsIndex < arrivalsIndex);
    assert.ok(arrivalsIndex < impactsIndex);
    assert.ok(impactsIndex < accessibilityIndex);
    assert.match(panelSource, /data-station-header-line-details[\s\S]*grid-cols-\[minmax\(0,1fr\)_auto\]/);
    assert.match(stationHeaderSource, /className="min-w-0 flex-1"/);
  });

  it("surfaces accessibility outage counts near the top of the station panel", () => {
    const outageSummaryIndex = panelSource.indexOf('data-station-access-outage-summary');
    const accessibilityChipsIndex = panelSource.indexOf("isWheelchairAccessible || hasElevator");
    const headerDetailsIndex = panelSource.indexOf('data-station-header-line-details');

    assert.notEqual(outageSummaryIndex, -1);
    assert.notEqual(accessibilityChipsIndex, -1);
    assert.notEqual(headerDetailsIndex, -1);
    assert.ok(accessibilityChipsIndex < outageSummaryIndex);
    assert.ok(outageSummaryIndex < headerDetailsIndex);
    assert.match(panelSource, /StationAccessOutageBadge/);
    assert.match(panelSource, /formatStationOutageLabel\("elevator", elevatorOutagesCount\)/);
    assert.match(panelSource, /formatStationOutageLabel\("escalator", escalatorOutagesCount\)/);
    assert.match(panelSource, /station-access-outage-badge/);
    assert.match(panelSource, /station-access-outage-count/);
    assert.match(globalCss, /\.station-access-outage-badge\s*\{[^}]*width:\s*30px;[^}]*height:\s*30px;[^}]*flex:\s*0 0 30px;/s);
    assert.match(globalCss, /\.station-access-outage-count\s*\{[^}]*min-width:\s*16px;[^}]*height:\s*16px;[^}]*font-size:\s*8px;/s);
  });

  it("defines station marker and reduced motion styles", () => {
    assert.match(globalCss, /\.station-hit-target/);
    assert.match(globalCss, /\.station-hit-target\.selected/);
    assert.match(globalCss, /prefers-reduced-motion:\s*reduce/);
  });

  it("keeps the station panel constrained and touch friendly", () => {
    assert.match(panelSource, /max-h-\[calc\(var\(--visual-viewport-height,100dvh\)\*0\.64\)\]/);
    assert.match(stationHeaderSource, /h-11 w-11/);
    assert.match(panelSource, /overflow-y-auto/);
    assert.doesNotMatch(panelSource, /backdrop-blur/);
  });

  it("lets the desktop station panel size to content with a viewport max height", () => {
    assert.match(panelSource, /md:bottom-auto/);
    assert.match(panelSource, /md:max-h-\[calc\(var\(--visual-viewport-height,100dvh\)-128px\)\]/);
    assert.doesNotMatch(panelSource, /md:bottom-6/);
    assert.doesNotMatch(panelSource, /md:max-h-none/);
  });

  it("renders authored accessibility icons with accessible warning state labels", () => {
    assert.match(panelSource, /wheel-chair-symbol\.svg/);
    assert.match(panelSource, /\/assets\/linewatch\/outages\/elevator\.svg/);
    assert.doesNotMatch(panelSource, /elevator-icon\.svg/);
    assert.match(panelSource, /Wheelchair accessible/);
    assert.match(panelSource, /Elevator available/);
    assert.match(panelSource, /width=\{37\}[\s\S]*height=\{37\}[\s\S]*w-\[37px\] h-\[37px\]/);
    assert.equal(
      panelSource.match(/drop-shadow-\[0_0_1\.5px_rgba\(0,130,201,0\.28\)\] dark:drop-shadow-\[0_0_2px_rgba\(0,130,201,0\.38\)\]/g)?.length,
      2,
    );
    assert.match(panelSource, /data-facility-warning/);
    assert.doesNotMatch(panelSource, /opacity-60 grayscale/);
    assert.match(panelSource, /<details[^>]+data-station-section="accessibility"/);
    assert.match(panelSource, /<summary/);
    assert.match(panelSource, /ChevronDown/);
    assert.match(panelSource, /station-accessibility-chevron/);
    assert.match(panelSource, /ml-auto/);
    assert.match(panelSource, /formatImpactTimestamp/);
    assert.doesNotMatch(panelSource, /formatRelativeImpactTime/);
  });

  it("renders source-linked detail buttons for typed station impacts only", () => {
    const activeAlertLookupIndex = panelSource.indexOf("const matchingAlert = activeAlerts.find");
    const plannedClosureLookupIndex = panelSource.indexOf("const plannedClosure = plannedClosures.find");

    assert.notEqual(activeAlertLookupIndex, -1);
    assert.notEqual(plannedClosureLookupIndex, -1);
    assert.ok(activeAlertLookupIndex < plannedClosureLookupIndex);
    assert.match(panelSource, /getStationImpactDetailsTarget/);
    assert.match(panelSource, /sourceAlertIds\?\.includes\(impact\.id\)/);
    assert.match(panelSource, /alert\.relatedPlannedClosureId === impact\.id/);
    assert.match(panelSource, /label:\s*"Active Closure"/);
    assert.match(panelSource, /label:\s*"Planned Closure"/);
    assert.doesNotMatch(panelSource, /"Upcoming Closure"/);
    assert.match(panelSource, /kind === "planned-closure" && tone === "active"[\s\S]*AlertTriangle/);
    assert.match(panelSource, /kind === "planned-closure"[\s\S]*PlannedClosureIcon/);
    assert.match(panelSource, /data-station-impact-classification/);
    assert.match(panelSource, /id=\{`station-impact-\$\{impact\.id\}`\}/);
    assert.match(panelSource, /detailsTarget && onSelectImpact/);
    assert.match(panelSource, /onSelectImpact\(detailsTarget\.selection\)/);
    assert.match(panelSource, /Open \$\{detailsTarget\.label\} details/);
    assert.match(panelSource, /<StationImpactDetailsIcon[\s\S]*kind=\{target\?\.selection\.kind \?\? stationImpactKind\(impact\)\}[\s\S]*tone=\{target\?\.tone\}/);
    assert.match(panelSource, /<BadgeInfo[\s\S]*View Details/);
    assert.match(panelSource, /ml-auto/);
    assert.doesNotMatch(panelSource, /self-end/);
    assert.match(panelSource, /View Details/);
  });

  it("supports updating state, animation, and prefers-reduced-motion overrides", () => {
    assert.match(panelSource, /updating\?: boolean/);
    assert.match(stationHeaderSource, /station-detail-updating/);
    assert.match(globalCss, /@keyframes station-detail-enter/);
    assert.match(globalCss, /\.motion-paused \.station-detail-panel/);
    assert.match(panelSource, /station-detail-body-wrapper/);
    assert.match(globalCss, /\.station-detail-body-wrapper/);
    assert.match(globalCss, /\.station-detail-body-updating/);
    assert.match(panelSource, /key=\{station\?\.id \?\? "empty"\}/);
    assert.match(panelSource, /station-detail-content-swap/);
    assert.doesNotMatch(globalCss, /filter:\s*blur\(1px\)/);
    assert.doesNotMatch(globalCss, /opacity:\s*0\.35/);
    assert.match(globalCss, /@keyframes station-detail-content-in/);
  });
});
