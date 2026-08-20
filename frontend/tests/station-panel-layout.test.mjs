import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const panelSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");
const regionalPanelSource = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");
const surfaceConnectionsSource = readFileSync(new URL("../src/components/SurfaceConnectionsSection.tsx", import.meta.url), "utf8");
const stationConnectionsSource = readFileSync(new URL("../src/components/StationConnectionBadges.tsx", import.meta.url), "utf8");
const arrivalPinSource = readFileSync(new URL("../src/components/ArrivalLinePinButton.tsx", import.meta.url), "utf8");
const navButtonsSource = readFileSync(new URL("../src/components/StationSubmenuNavButtons.tsx", import.meta.url), "utf8");
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
    assert.match(panelSource, /Train Arrivals/);
    assert.match(panelSource, /LRT Arrivals/);
    assert.match(panelSource, /Train & LRT Arrivals/);
    assert.match(panelSource, /<Train size=\{20\}/);
    assert.doesNotMatch(panelSource, /<Clock3 size=\{20\}/);
    assert.match(panelSource, /data-arrivals-subway-closed=\{subwayClosed \? "true" : undefined\}/);
    assert.match(panelSource, /<AlertCircle[^>]*animate-terminating-blink[^>]*\/>[\s\S]*Schedule May Be Disrupted/);
    assert.match(panelSource, /data-arrivals-disrupted/);
    assert.match(panelSource, /arrivalContext\.scheduleMayBeDisrupted/);
    assert.match(panelSource, /href=\{`#station-impact-\$\{impact\.id\}`\}/);
    assert.match(panelSource, /handleJumpToStationImpact/);
    assert.match(panelSource, /onClick=\{\(e\) => handleJumpToStationImpact\(impact\.id, e\)\}/);
    assert.match(panelSource, /data-station-impact-tone=\{impactTone\}/);
    assert.match(globalCss, /--highlight-color:\s*rgba\(239,\s*68,\s*68/);
    assert.match(globalCss, /--highlight-color:\s*rgba\(59,\s*130,\s*246/);
    assert.match(globalCss, /--highlight-color:\s*rgba\(245,\s*158,\s*11/);
    assert.match(globalCss, /--highlight-color:\s*rgba\(254,\s*236,\s*65/);
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
    assert.match(panelSource, /window\.setInterval\(\(\) => setArrivalTick\(Date\.now\(\)\), ARRIVAL_COUNTDOWN_TICK_MS\)/);
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
    const servicesAndAmenitiesIndex = panelSource.indexOf('data-station-section="services-and-amenities"');
    const arrivalsIndex = panelSource.indexOf('data-station-section="arrivals"');
    const accessibilityIndex = panelSource.indexOf('data-station-section="accessibility"');
    const impactsIndex = panelSource.indexOf('data-station-section="station-impacts"');
    const titleRowIndex = panelSource.indexOf("<StationDetailHeader");

    assert.notEqual(headerDetailsIndex, -1);
    assert.notEqual(servicesAndAmenitiesIndex, -1);
    assert.notEqual(arrivalsIndex, -1);
    assert.notEqual(accessibilityIndex, -1);
    assert.notEqual(impactsIndex, -1);
    assert.notEqual(titleRowIndex, -1);
    assert.equal(panelSource.indexOf('data-station-section="line-details"'), -1);
    assert.ok(titleRowIndex < headerDetailsIndex);
    assert.ok(headerDetailsIndex < servicesAndAmenitiesIndex);
    assert.ok(servicesAndAmenitiesIndex < arrivalsIndex);
    assert.ok(arrivalsIndex < impactsIndex);
    assert.ok(impactsIndex < accessibilityIndex);
    assert.match(panelSource, /data-station-header-line-details[\s\S]*station\.lines\.map/);
    assert.match(panelSource, /Services and Amenities/);
    assert.match(stationHeaderSource, /className="min-w-0 flex-1"/);
  });

  it("surfaces accessibility outage counts near the top of the station panel", () => {
    const outageSummaryIndex = panelSource.indexOf('data-station-access-outage-summary');
    const headerDetailsIndex = panelSource.indexOf('data-station-header-line-details');
    const arrivalsIndex = panelSource.indexOf('data-station-section="arrivals"');

    assert.notEqual(outageSummaryIndex, -1);
    assert.notEqual(headerDetailsIndex, -1);
    assert.ok(headerDetailsIndex < outageSummaryIndex);
    assert.ok(outageSummaryIndex < arrivalsIndex);
    assert.match(panelSource, /StationAccessOutageBadge/);
    assert.match(panelSource, /formatStationOutageLabel\("elevator", elevatorOutagesCount\)/);
    assert.match(panelSource, /formatStationOutageLabel\("escalator", escalatorOutagesCount\)/);
    assert.match(panelSource, /station-access-outage-badge/);
    assert.match(panelSource, /station-access-outage-count/);
    assert.match(globalCss, /\.station-access-outage-badge\s*\{[^}]*width:\s*30px;[^}]*height:\s*30px;[^}]*flex:\s*0 0 30px;/s);
    assert.match(globalCss, /\.station-access-outage-count\s*\{[^}]*min-width:\s*16px;[^}]*height:\s*16px;[^}]*font-size:\s*8px;/s);
  });

  it("surfaces accessibility outage counts near the top of the regional station panel", () => {
    const outageSummaryIndex = regionalPanelSource.indexOf('data-station-access-outage-summary');
    const headerDetailsIndex = regionalPanelSource.indexOf('data-station-header-line-details');
    const arrivalsIndex = regionalPanelSource.indexOf('data-station-section="arrivals"');

    assert.notEqual(outageSummaryIndex, -1);
    assert.notEqual(headerDetailsIndex, -1);
    assert.ok(headerDetailsIndex < outageSummaryIndex);
    assert.ok(outageSummaryIndex < arrivalsIndex);
    assert.match(regionalPanelSource, /StationAccessOutageBadge/);
    assert.match(regionalPanelSource, /formatStationOutageLabel\("elevator", elevatorOutagesCount\)/);
    assert.match(regionalPanelSource, /formatStationOutageLabel\("escalator", escalatorOutagesCount\)/);
    assert.match(regionalPanelSource, /station-access-outage-badge/);
    assert.match(regionalPanelSource, /handleJumpToAccessibility/);
    assert.match(regionalPanelSource, /ref=\{accessibilityDetailsRef\}/);
  });

  it("provides quick jump icon navigation for subsections in both TTC and Regional station panels", () => {
    assert.match(navButtonsSource, /Jump To/);
    assert.match(panelSource, /ConciergeBell/);
    assert.match(regionalPanelSource, /ConciergeBell/);

    assert.match(panelSource, /StationSubmenuNavButtons/);
    assert.match(panelSource, /data-station-section="connected-network"/);
    assert.match(panelSource, /data-station-section="services-and-amenities"/);
    assert.match(panelSource, /data-station-section="arrivals"/);
    assert.match(panelSource, /data-station-section="station-impacts"/);
    assert.match(panelSource, /data-station-section="accessibility"/);

    assert.match(regionalPanelSource, /StationSubmenuNavButtons/);
    assert.match(regionalPanelSource, /data-station-section="connected-network"/);
    assert.match(regionalPanelSource, /data-station-section="services-and-amenities"/);
    assert.match(regionalPanelSource, /data-station-section="arrivals"/);
    assert.match(regionalPanelSource, /data-station-section="station-impacts"/);
    assert.match(regionalPanelSource, /data-station-section="trip-changes"/);
    assert.match(regionalPanelSource, /data-station-section="notices"/);
    assert.match(regionalPanelSource, /data-station-section="accessibility"/);

    assert.match(panelSource, /shortLabel:\s*"Networks"/);
    assert.match(panelSource, /shortLabel:\s*arrivalsShortLabel/);
    assert.match(panelSource, /shortLabel:\s*"Buses"/);
    assert.match(regionalPanelSource, /shortLabel:\s*"Networks"/);
    assert.match(regionalPanelSource, /shortLabel:\s*"Trains"/);
    assert.match(regionalPanelSource, /shortLabel:\s*"Buses"/);

    const ttcLineHeaderIdx = panelSource.indexOf("data-station-header-line-details");
    const ttcNavIdx = panelSource.indexOf("<StationSubmenuNavButtons");
    const ttcScrollIdx = panelSource.indexOf("station-detail-scroll");
    assert.ok(ttcLineHeaderIdx !== -1 && ttcNavIdx !== -1 && ttcScrollIdx !== -1);
    assert.ok(ttcLineHeaderIdx < ttcNavIdx, "TTC nav buttons must be below line badges");
    assert.ok(ttcNavIdx < ttcScrollIdx, "TTC nav buttons must be above scrollable content stack");

    const regionalLineHeaderIdx = regionalPanelSource.indexOf("data-station-header-line-details");
    const regionalNavIdx = regionalPanelSource.indexOf("<StationSubmenuNavButtons");
    const regionalScrollIdx = regionalPanelSource.indexOf("station-detail-scroll");
    assert.ok(regionalLineHeaderIdx !== -1 && regionalNavIdx !== -1 && regionalScrollIdx !== -1);
    assert.ok(regionalLineHeaderIdx < regionalNavIdx, "Regional nav buttons must be below line badges");
    assert.ok(regionalNavIdx < regionalScrollIdx, "Regional nav buttons must be above scrollable content stack");
  });

  it("reopens the station submenu when pressing back from an impact details view", () => {
    assert.match(shellSource, /stationDrilldownOriginRef/);
    assert.match(shellSource, /handleStationSelectImpact/);
    assert.match(shellSource, /onSelectImpact=\{handleStationSelectImpact\}/);
    assert.match(shellSource, /if \(stationDrilldownOriginRef\.current\) \{/);
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
    assert.match(panelSource, /accessible\.svg/);
    assert.match(panelSource, /\/assets\/linewatch\/outages\/elevator\.svg/);
    assert.match(panelSource, /\/assets\/linewatch\/washroom\.svg/);
    assert.match(panelSource, /\/assets\/linewatch\/parking\.svg/);
    assert.match(panelSource, /\/assets\/linewatch\/bicycle-lockup\.svg/);
    assert.match(panelSource, /\/assets\/linewatch\/bicycle-repair\.svg/);
    assert.match(panelSource, /\/assets\/linewatch\/bike-share-toronto\.svg/);
    assert.match(panelSource, /\/assets\/linewatch\/passenger-pick-up\.svg/);
    assert.doesNotMatch(panelSource, /elevator-icon\.svg/);
    assert.match(panelSource, /Wheelchair accessible/);
    assert.match(panelSource, /Elevator available/);
    assert.match(panelSource, /Washrooms/);
    assert.match(panelSource, /Parking/);
    assert.match(panelSource, /Bike Lock-up/);
    assert.match(panelSource, /Bike Repair/);
    assert.match(panelSource, /Bike Share/);
    assert.match(panelSource, /Passenger Pick-up/);
    assert.match(panelSource, /width=\{28\}[\s\S]*height=\{28\}[\s\S]*w-\[24px\] h-\[24px\] sm:w-\[28px\] sm:h-\[28px\]/);
    assert.match(panelSource, /width=\{25\}[\s\S]*height=\{25\}[\s\S]*w-\[21px\] h-\[21px\] sm:w-\[25px\] sm:h-\[25px\]/);
    assert.equal(
      panelSource.match(/drop-shadow-\[0_0_1\.5px_rgba\(0,130,201,0\.28\)\] dark:drop-shadow-\[0_0_2px_rgba\(0,130,201,0\.38\)\]/g)?.length,
      2,
    );
    assert.equal(
      panelSource.match(/drop-shadow-\[0_0_1\.5px_rgba\(0,0,0,0\.28\)\] dark:drop-shadow-\[0_0_2px_rgba\(255,255,255,0\.25\)\]/g)?.length,
      4,
    );
    assert.match(panelSource, /grid grid-cols-3/);
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

  it("renders accent chips on section headers across station detail panels with uniform spacing", () => {
    const accentChipPattern = /<span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-\[0_0_4px_rgba\(129,201,255,0\.35\)\]" aria-hidden="true" \/>/;

    // TTC StationDetailPanel
    assert.match(panelSource, accentChipPattern);
    assert.match(panelSource, /data-station-section="services-and-amenities"[\s\S]*?<ConciergeBell size=\{14\}/);
    assert.match(panelSource, /data-station-section="services-and-amenities"[\s\S]*?items-center gap-2\.5/);
    assert.match(panelSource, /data-station-section="arrivals"[\s\S]*?<Train size=\{20\}/);
    assert.match(panelSource, /data-station-section="arrivals"[\s\S]*?items-center gap-2\.5/);
    assert.match(panelSource, /data-station-section="station-impacts"[\s\S]*?<AlertCircle size=\{20\}/);
    assert.match(panelSource, /data-station-section="station-impacts"[\s\S]*?items-center gap-2\.5/);
    assert.match(panelSource, /data-station-section="accessibility"[\s\S]*?accessibility-alert\.svg[\s\S]*?width=\{20\}/);
    assert.match(panelSource, /data-station-section="accessibility"[\s\S]*?items-center gap-2\.5/);

    // RegionalStationDetailPanel
    assert.match(regionalPanelSource, accentChipPattern);
    assert.match(regionalPanelSource, /data-station-section="services-and-amenities"[\s\S]*?<ConciergeBell size=\{14\}/);
    assert.match(regionalPanelSource, /data-station-section="services-and-amenities"[\s\S]*?items-center gap-2\.5/);
    assert.match(regionalPanelSource, /data-station-section="arrivals"[\s\S]*?<Train size=\{20\}/);
    assert.match(regionalPanelSource, /data-station-section="arrivals"[\s\S]*?items-center gap-2\.5/);
    assert.match(regionalPanelSource, /data-station-section="station-impacts"[\s\S]*?<AlertCircle size=\{20\}/);
    assert.match(regionalPanelSource, /data-station-section="station-impacts"[\s\S]*?items-center gap-2\.5/);
    assert.match(regionalPanelSource, /data-station-section="trip-changes"[\s\S]*?<AlertTriangle size=\{20\}/);
    assert.match(regionalPanelSource, /data-station-section="trip-changes"[\s\S]*?items-center gap-2\.5/);
    assert.match(regionalPanelSource, /data-station-section="notices"[\s\S]*?<FileText size=\{20\}/);
    assert.match(regionalPanelSource, /data-station-section="notices"[\s\S]*?items-center gap-2\.5/);
    assert.match(regionalPanelSource, /data-station-section="accessibility"[\s\S]*?accessibility-alert\.svg[\s\S]*?width=\{20\}/);
    assert.match(regionalPanelSource, /data-station-section="accessibility"[\s\S]*?items-center gap-2\.5/);

    // SurfaceConnectionsSection
    assert.match(surfaceConnectionsSource, accentChipPattern);
    assert.match(surfaceConnectionsSource, /data-station-section="surface-connections"[\s\S]*?<Bus size=\{20\}/);
    assert.match(surfaceConnectionsSource, /data-station-section="surface-connections"[\s\S]*?items-center gap-2\.5/);

    // StationConnectionBadges
    assert.match(stationConnectionsSource, accentChipPattern);
    assert.match(stationConnectionsSource, /<GitMerge size=\{14\}/);
    assert.match(stationConnectionsSource, /station-connections-title flex items-center gap-2\.5/);
    assert.match(globalCss, /\.station-connections-title\s*\{[^}]*gap:\s*10px;/s);
  });

  it("renders colored icons and header count badges for station impacts, notices, and trip changes", () => {
    // TTC StationDetailPanel
    assert.match(panelSource, /<AlertCircle size=\{20\} className="shrink-0 text-orange-500 dark:text-orange-400"/);
    assert.match(panelSource, /\{distinctImpacts\.length\}\s*<\/span>/);
    assert.match(panelSource, /icon: <AlertCircle size=\{13\} className="text-orange-500 dark:text-orange-400" aria-hidden="true" \/>/);
    assert.match(panelSource, /data-station-section="station-impacts"/);
    assert.match(panelSource, /data-station-section="accessibility"[\s\S]*justify-between/);

    // RegionalStationDetailPanel
    assert.match(regionalPanelSource, /<AlertCircle size=\{20\} className="shrink-0 text-orange-500 dark:text-orange-400"/);
    assert.match(regionalPanelSource, /\{impacts\.length\}\s*<\/span>/);
    assert.match(regionalPanelSource, /icon: <AlertCircle size=\{13\} className="text-orange-500 dark:text-orange-400" aria-hidden="true" \/>/);
    assert.match(regionalPanelSource, /\{tripChanges\.changes\.length\}\s*<\/span>/);
    assert.match(regionalPanelSource, /data-station-section="station-impacts"/);
    assert.match(regionalPanelSource, /data-station-section="trip-changes"/);
    assert.match(regionalPanelSource, /data-station-section="notices"[\s\S]*justify-between/);
    assert.match(regionalPanelSource, /data-station-section="accessibility"[\s\S]*justify-between/);
  });

  it("styles arrival line pin idle state with yellow outline and tinted fill, and pinned state with solid yellow fill", () => {
    assert.match(arrivalPinSource, /isFilled\s*\?\s*"currentColor"\s*:\s*"rgba\(251, 191, 36, 0\.15\)"/);
    assert.match(globalCss, /\.arrival-line-pin\s*\{[^}]*color:\s*rgb\(245,\s*158,\s*11\);/s);
    assert.match(globalCss, /\.arrival-line-pin svg,\s*\.arrival-line-pin svg polygon,\s*\.arrival-line-pin svg path\s*\{[^}]*fill:\s*rgba\(245,\s*158,\s*11,\s*0\.15\)\s*!important;/s);
    assert.match(globalCss, /\.arrival-line-pin\.is-pinned svg,[^}]*fill:\s*currentColor\s*!important;/s);
    assert.match(globalCss, /\.dark \.arrival-line-pin\s*\{[^}]*color:\s*rgb\(251,\s*191,\s*36\);/s);
  });

  it("renders a space-efficient 2-column grid that displays full readable badge text for search amenity chips", () => {
    assert.match(globalCss, /\.station-search-amenity-chips\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[^}]*gap:\s*6px;/s);
    assert.match(globalCss, /\.station-search-amenity-chip span:not\(\.station-search-amenity-chip-count\)\s*\{[^}]*white-space:\s*nowrap;/s);
  });
});
