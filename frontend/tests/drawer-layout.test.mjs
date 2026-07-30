import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const interactiveMapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const lineStatusSource = readFileSync(new URL("../src/components/LineStatusPanel.tsx", import.meta.url), "utf8");
const activeAlertsSource = readFileSync(new URL("../src/components/ActiveAlertsPanel.tsx", import.meta.url), "utf8");
const delaysPanelSource = readFileSync(new URL("../src/components/DelaysPanel.tsx", import.meta.url), "utf8");
const impactCardFieldsSource = readFileSync(new URL("../src/components/ImpactCardFields.tsx", import.meta.url), "utf8");
const reducedSpeedZonesSource = readFileSync(new URL("../src/components/ReducedSpeedZonesPanel.tsx", import.meta.url), "utf8");
const lineLegendSource = readFileSync(new URL("../src/components/LineLegend.tsx", import.meta.url), "utf8");
const plannedClosuresSource = readFileSync(new URL("../src/components/PlannedClosuresPanel.tsx", import.meta.url), "utf8");
const impactOverlapRefsSource = readFileSync(new URL("../src/components/ImpactOverlapRefs.tsx", import.meta.url), "utf8");
const impactOverlapRefsLogicSource = readFileSync(new URL("../src/components/impact-overlap-refs.ts", import.meta.url), "utf8");
const impactTypeIconSource = readFileSync(new URL("../src/components/ImpactTypeIcon.tsx", import.meta.url), "utf8");
const savedCommutesSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const reliabilitySource = readFileSync(new URL("../src/components/ReliabilityPanel.tsx", import.meta.url), "utf8");
const dashboardDataSource = readFileSync(new URL("../src/app/dashboard-data.ts", import.meta.url), "utf8");
const linewatchDataSource = readFileSync(new URL("../src/app/linewatch-data.ts", import.meta.url), "utf8");
const mobileImpactInspectorSource = readFileSync(new URL("../src/components/MobileImpactInspector.tsx", import.meta.url), "utf8");
const mobileStatusSheetSource = readFileSync(new URL("../src/components/MobileStatusSheet.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const subwayClosedSource = readFileSync(new URL("../src/components/SubwayClosedScreen.tsx", import.meta.url), "utf8");
const subwayHoursSource = readFileSync(new URL("../src/app/subway-hours.ts", import.meta.url), "utf8");
const stationSearchSource = readFileSync(new URL("../src/components/StationSearchPanel.tsx", import.meta.url), "utf8");
const stationOutageBadgeSource = readFileSync(new URL("../src/components/StationOutageBadge.tsx", import.meta.url), "utf8");
const selectedImpactScrollSource = readFileSync(new URL("../src/hooks/useScrollSelectedImpactCard.ts", import.meta.url), "utf8");


describe("floating menu layout", () => {
  it("opens alert submenus with a temporary line focus from desktop and mobile line status", () => {
    assert.match(shellSource, /openImpactCategory\(view,\s*lineId\)/);
    assert.match(shellSource, /openLegendImpactCategory[\s\S]*navigateForward\("menu"\);[\s\S]*openImpactCategory\(view, lineId\)/);
    assert.match(shellSource, /initialLineId=\{impactListLaunch\.lineId\}/);
    assert.match(lineLegendSource, /onReducedSpeedZoneClick\?\.\(dataLineId\)/);
    assert.match(mobileStatusSheetSource, /onOpenCategory\("reduced-speed-zones",\s*line\.id\)/);
    assert.match(mobileStatusSheetSource, /onOpenCategory\("closures",\s*line\.id\)/);
    assert.match(activeAlertsSource, /useState\(initialLineId \?\? "all"\)/);
    assert.match(delaysPanelSource, /useState\(initialLineId \?\? "all"\)/);
    assert.match(reducedSpeedZonesSource, /useState\(initialLineId \?\? "all"\)/);
    assert.match(plannedClosuresSource, /useState\(initialLineId \?\? "all"\)/);
    assert.match(shellSource, /activeView !== "alerts"[\s\S]*setImpactListLaunch\(\(current\) => current\.lineId === null \? current : \{ \.\.\.current, lineId: null \}\)/);
  });

  it("keeps the desktop panel chrome stable while animating keyed view content", () => {
    assert.match(shellSource, /<FloatingPanelShell key="desktop-panel" panel=\{activeView\}/);
    assert.match(shellSource, /<div key=\{activeView\} className="desktop-view-content-wrapper"/);
    assert.match(globalCss, /\.desktop-view-content-wrapper\s*\{[^}]*animation:\s*desktop-content-fade-in 380ms/s);
    assert.match(globalCss, /@keyframes desktop-content-fade-in/);
    assert.match(selectedImpactScrollSource, /addEventListener\("animationend", handleWrapperAnimationEnd\)/);
    assert.match(selectedImpactScrollSource, /event\.animationName !== expectedAnimationName/);
    assert.match(selectedImpactScrollSource, /highlightCard\(\);[\s\S]*const wrapper = /);
    assert.match(globalCss, /\.highlight-active-card\s*\{[^}]*var\(--selection-fast-cycle-duration\)/s);
  });

  it("keeps the map first while exposing floating menu and submenu states", () => {
    assert.match(shellSource, /type ActiveView = "map" \| "menu" \| "search" \| "status" \| "alerts" \| "delays" \| "reduced-speed-zones" \| "closures" \| "commutes" \| "notifications" \| "analytics" \| "more"/);
    assert.match(shellSource, /handleToggleMenu/);
    assert.match(shellSource, /Toggle menu/);
    assert.match(shellSource, /Floating Dropdown Menu/);
    assert.match(globalCss, /@keyframes menu-border-pulse/);
    assert.match(globalCss, /animation:\s*menu-border-pulse 2\.8s cubic-bezier\(0\.4, 0, 0\.2, 1\) infinite/);
    assert.match(shellSource, /const showMenuAttention = !menuVisible && !isDesktopPanel;/);
    assert.match(shellSource, /data-menu-attention=\{showMenuAttention \? "true" : "false"\}/);
    assert.match(globalCss, /\.menu-attention-beam\[data-menu-attention="false"\]::before\s*\{[^}]*animation:\s*none;[^}]*content:\s*none;/s);
    assert.doesNotMatch(globalCss, /\.menu-attention-beam:focus-visible::before\s*\{[^}]*opacity:\s*0;/s);
    assert.match(shellSource, /Floating Submenus/);
    assert.match(shellSource, /activeView === "alerts"/);
    assert.match(shellSource, /activeView === "delays"/);
    assert.match(shellSource, /\/assets\/linewatch\/delay-icon\.svg/);
    assert.match(delaysPanelSource, /data-impact-card-id=/);
    assert.match(delaysPanelSource, /MetadataGrid/);
    assert.match(impactCardFieldsSource, /\["Started"/);
    assert.match(impactCardFieldsSource, /"Updated"/);
    assert.match(lineLegendSource, /onDelayClick\?\.\(dataLineId\)/);
    assert.match(shellSource, /"reduced-speed-zones"/);
    assert.match(shellSource, /Reduced Speed Zones/);
    assert.match(reducedSpeedZonesSource, /Reduced Speed Zones/);
    assert.match(reducedSpeedZonesSource, /zone\.displayDirection/);
    assert.match(reducedSpeedZonesSource, /direction=\{zone\.displayDirection\}/);
    assert.match(reducedSpeedZonesSource, /Construction/);
    assert.match(lineLegendSource, /ImpactTypeIcon/);
    assert.match(lineLegendSource, /kind="reduced-speed-zone"/);
    assert.match(lineLegendSource, /View reduced speed zone/);
    assert.doesNotMatch(reducedSpeedZonesSource, />\s*Degraded\s*</);
    assert.doesNotMatch(shellSource, /> Slowdowns</);

    assert.match(shellSource, /activeView === "closures"/);
    assert.match(shellSource, /activeView === "commutes"/);
    assert.match(shellSource, /activeView === "notifications"/);
    assert.match(shellSource, /activeView === "analytics"/);
    assert.match(shellSource, /FloatingPanelShell/);
    assert.match(shellSource, /const activeFloatingPanel = /);
    assert.doesNotMatch(shellSource, /opacity-0 -translate-x-8 pointer-events-none/);
    assert.match(globalCss, /\.floating-panel-shell/);
    assert.match(interactiveMapSource, /layoutResetSignal/);
    assert.doesNotMatch(shellSource, /sidebarCollapsed/);
    assert.doesNotMatch(shellSource, /lg:left-\[520px\]/);
    assert.doesNotMatch(shellSource, /Collapse status sidebar/);

    assert.match(shellSource, /handleOpenSearch/);
    assert.match(shellSource, /Station Search/);
    assert.match(shellSource, /StationSearchPanel/);
    assert.match(shellSource, /activeView === "search"/);
    assert.match(stationSearchSource, /searchStations/);
    assert.match(stationSearchSource, /buildNetworkStationLineGroups/);
    assert.match(stationSearchSource, /onSelectStation/);
    assert.match(stationSearchSource, /<StationOutageBadge/);
    assert.match(stationOutageBadgeSource, /station-search-outage-badge/);
    assert.match(stationOutageBadgeSource, /width=\{22\}/);
    assert.match(stationOutageBadgeSource, /height=\{22\}/);
    assert.match(stationOutageBadgeSource, /\/assets\/linewatch\/outages\/elevator\.svg/);
    assert.match(stationOutageBadgeSource, /\/assets\/linewatch\/outages\/escalator\.svg/);
    assert.match(globalCss, /\.station-search-outage-badge\s*\{[^}]*width:\s*22px;[^}]*height:\s*22px;[^}]*flex:\s*0 0 22px;/s);
    assert.match(globalCss, /\.station-search-outage-count\s*\{[^}]*min-width:\s*14px;[^}]*height:\s*14px;[^}]*font-size:\s*8px;/s);
    assert.doesNotMatch(stationSearchSource, /station-search-flag-access/);
    assert.doesNotMatch(stationSearchSource, />\s*Access\s*</);

    assert.match(shellSource, /Demo Account/);
    assert.match(shellSource, /Create Account/);
    assert.match(shellSource, /Sign In/);
    assert.match(savedCommutesSource, /impact\.statusLabel/);
    assert.doesNotMatch(savedCommutesSource, /Impact matching pending/);

    assert.match(shellSource, /"status"/);
    assert.match(shellSource, /"more"/);
    assert.match(shellSource, /MobileBottomNav/);
    assert.match(shellSource, /MobileStatusSheet/);
    assert.match(shellSource, /MobileMoreSheet/);
    assert.match(globalCss, /\.mobile-bottom-nav/);
    assert.match(globalCss, /\.mobile-status-peek/);
  });

  it("shows the combined alert-category total on the hamburger badge", () => {
    assert.match(
      shellSource,
      /const totalAlertCount =\s*activeAlerts\.length\s*\+ delays\.length\s*\+ reducedSpeedZones\.length\s*\+ plannedClosures\.length;/,
    );
    assert.match(shellSource, /\{totalAlertCount > 0 && !menuVisible && \(/);
    assert.match(shellSource, /\{totalAlertCount\}/);
    assert.match(shellSource, /`Toggle menu, \$\{totalAlertCount\} total \$\{totalAlertCount === 1 \? "alert" : "alerts"\}`/);
  });

  it("allows alert and planned closure copy to wrap instead of collapsing into narrow columns", () => {
    assert.match(activeAlertsSource, /min-w-0/);
    assert.match(activeAlertsSource, /whitespace-normal/);
    assert.match(activeAlertsSource, /break-words/);
    assert.match(reducedSpeedZonesSource, /min-w-0/);
    assert.match(reducedSpeedZonesSource, /whitespace-normal/);
    assert.match(reducedSpeedZonesSource, /break-words/);
    assert.match(plannedClosuresSource, /min-w-0/);
    assert.match(plannedClosuresSource, /whitespace-normal/);
    assert.match(plannedClosuresSource, /break-words/);
    assert.doesNotMatch(globalCss, /\.alert-card\s*\{[^}]*display:\s*grid/s);
  });

  it("keeps equal route spacing across alert submenu cards", () => {
    for (const panelSource of [activeAlertsSource, delaysPanelSource, reducedSpeedZonesSource, plannedClosuresSource]) {
      assert.match(panelSource, /impact-card-heading/);
      assert.match(panelSource, /<ImpactRouteHeader/);
    }

    assert.match(activeAlertsSource, /impact-card-heading__badges/);
    assert.match(plannedClosuresSource, /impact-card-heading__badges/);
    assert.match(globalCss, /\.impact-card-heading__badges\s*\{[^}]*position:\s*absolute;[^}]*right:\s*0;[^}]*top:\s*0/s);
    assert.match(globalCss, /\.alert-card\s*>\s*\.impact-route,\s*\.closure-card\s*>\s*\.impact-route\s*\{[^}]*margin-block:\s*24px/s);
    assert.match(globalCss, /\.impact-route__bounds\s*\{[^}]*font-size:\s*1\.08rem;[^}]*gap:\s*11px;/s);
    assert.match(globalCss, /@media \(min-width:\s*768px\)\s*\{[^}]*\.impact-route__bounds\s*\{[^}]*font-size:\s*1\.55rem;[^}]*gap:\s*17px;/s);
    assert.match(globalCss, /\.impact-route__arrow\s*\{[^}]*height:\s*20px;[^}]*width:\s*40px;/s);
  });

  it("links TTC active closure children back to their canonical planned closure", () => {
    assert.match(linewatchDataSource, /relatedPlannedClosureId\?: string \| null/);
    assert.match(activeAlertsSource, /RelatedPlannedClosureButton/);
    assert.match(activeAlertsSource, /kind: "planned-closure", id: alert\.relatedPlannedClosureId/);
    assert.match(mobileImpactInspectorSource, /relatedPlannedClosureId/);
    assert.match(impactCardFieldsSource, /View Details/);
    assert.match(globalCss, /\.related-planned-closure-button\s*\{[^}]*background:\s*#1e293b;[^}]*border:\s*1px solid rgba\(59, 130, 246, 0\.35\);[^}]*color:\s*#ffffff;[^}]*min-height:\s*28px/s);
    assert.match(globalCss, /\.dark \.related-planned-closure-button\s*\{[^}]*background:\s*#1e293b;[^}]*color:\s*#ffffff/s);
    assert.match(interactiveMapSource, /kind === "suspension"/);
    assert.match(interactiveMapSource, /details\?\.categoryLabel \?\? "Active Alert"/);
    assert.match(plannedClosuresSource, /alert\.relatedPlannedClosureId === closure\.id/);
    assert.match(plannedClosuresSource, /closure\.activeNow && alert\.id === closure\.id/);
    assert.match(plannedClosuresSource, /label: "Status"/);
    assert.match(plannedClosuresSource, /trailingRows=\{\[/);
    assert.match(plannedClosuresSource, /kind: "suspension", id: activeAlert\.id/);
    assert.match(plannedClosuresSource, /<span>Active Now<\/span>/);
    assert.match(plannedClosuresSource, /Currently Inactive/);
    assert.match(globalCss, /\.planned-closure-status-button/);
    assert.match(globalCss, /\.planned-closure-status-button\s*\{[^}]*background:\s*rgba\(220, 38, 38, 0\.08\);[^}]*border:\s*1px solid rgba\(220, 38, 38, 0\.18\);[^}]*color:\s*#dc2626/s);
    assert.match(globalCss, /\.dark \.planned-closure-status-button\s*\{[^}]*background:\s*rgba\(239, 68, 68, 0\.16\);[^}]*color:\s*#f87171/s);
    assert.match(globalCss, /\.planned-closure-metadata \.is-status-row dt\s*\{[^}]*color:\s*var\(--color-logo-blue\);[^}]*text-shadow:/s);
    assert.match(globalCss, /\.planned-closure-status-inactive/);
  });

  it("presents planned closure schedule fields in the shared metadata grid", () => {
    assert.match(plannedClosuresSource, /closure\.windowHours/);
    assert.match(plannedClosuresSource, /closure\.windowDates/);
    assert.match(plannedClosuresSource, /Closure hours/);
    assert.match(plannedClosuresSource, /Closure dates/);
    assert.doesNotMatch(plannedClosuresSource, /closure\.nightly \? "Closure nights"/);
    assert.match(plannedClosuresSource, /Current window/);
    assert.match(plannedClosuresSource, /Next window/);
    assert.match(plannedClosuresSource, /function formatClosureScheduleValue/);
    assert.match(plannedClosuresSource, /replace\(\/\\s\*\[–—\]\\s\*\/g, " – "\)/);
    assert.match(plannedClosuresSource, /formatClosureScheduleValue\(specificWindowLabel\)/);
    assert.match(plannedClosuresSource, /<MetadataGrid[\s\S]*?leadingRows=\{\[/s);
    assert.match(plannedClosuresSource, /label:\s*"Closure hours"/);
    assert.match(plannedClosuresSource, /label:\s*"Closure dates"/);
    assert.match(plannedClosuresSource, /label:\s*specificWindowHeading/);
    assert.match(plannedClosuresSource, /label:\s*"Closure window"/);
    assert.doesNotMatch(plannedClosuresSource, /planned-closure-schedule/);
    assert.doesNotMatch(globalCss, /\.planned-closure-schedule/);
    assert.ok(
      plannedClosuresSource.indexOf('label: "Closure dates"')
        < plannedClosuresSource.indexOf('label: "Closure hours"'),
      "closure dates should be rendered before closure hours",
    );
    assert.match(impactCardFieldsSource, /\.\.\.renderedLeadingRows,[\s\S]*?causeValue \? \["Cause"/s);
    assert.match(impactCardFieldsSource, /index < renderedLeadingRows\.length \? "is-emphasized"/);
    assert.match(plannedClosuresSource, /className="no-border planned-closure-metadata"/);
    assert.match(globalCss, /\.planned-closure-metadata \.is-emphasized dt\s*\{[^}]*color:\s*var\(--color-logo-blue\);[^}]*text-shadow:\s*0 0 4px rgba\(129, 201, 255, 0\.35\)/s);
    assert.match(globalCss, /\.planned-closure-metadata \.is-emphasized dd\s*\{[^}]*font-size:\s*0\.84rem;[^}]*font-weight:\s*850/s);
    assert.match(globalCss, /data-active-view="closures"[^}]*\.panel-heading span\.whitespace-nowrap\s*\{[^}]*max-width:\s*none\s*!important;[^}]*overflow:\s*visible\s*!important/s);
  });

  it("keeps floating panels single-column even at desktop viewport widths", () => {
    assert.match(lineStatusSource, /flex-wrap/);
    assert.match(lineStatusSource, /min-w-0/);
    assert.match(savedCommutesSource, /grid-cols-1/);
    assert.match(savedCommutesSource, /flex-wrap/);
    assert.doesNotMatch(savedCommutesSource, /md:grid-cols-3/);
    assert.doesNotMatch(globalCss, /\.commute-grid\s*\{[^}]*repeat\(3/s);
    assert.match(reliabilitySource, /flex-col/);
    assert.doesNotMatch(reliabilitySource, /sm:flex-row/);
    assert.doesNotMatch(reliabilitySource, /sm:grid-cols-2/);
    assert.doesNotMatch(globalCss, /\.reliability-row\s*\{[^}]*display:\s*grid/s);
    assert.doesNotMatch(globalCss, /\.health-grid\s*\{[^}]*repeat\(2/s);
    assert.doesNotMatch(globalCss, /\.commute-card span,/);
  });

  it("keeps panel scrollbars visually quiet", () => {
    assert.match(globalCss, /scrollbar-width:\s*thin/);
    assert.match(globalCss, /scrollbar-color:\s*var\(--mobile-scroll-indicator-thumb\)\s*transparent/);
    assert.match(globalCss, /::-webkit-scrollbar-thumb/);
    assert.match(globalCss, /background:\s*var\(--mobile-scroll-indicator-thumb\)/);
  });

  it("keeps station detail separate from the left-side floating panels", () => {
    assert.match(shellSource, /StationDetailPanel/);
    assert.match(shellSource, /selectedStationId/);
    assert.match(shellSource, /setSelectedStationId\(null\)/);
  });

  it("labels fallback mode without claiming live TTC status", () => {
    assert.match(dashboardDataSource, /fixture mode/);
  });

  it("LineLegend calls onReducedSpeedZoneClick with the network-scoped line id", () => {
    assert.match(lineLegendSource, /onReducedSpeedZoneClick\?\.\(dataLineId\)/);
    assert.doesNotMatch(lineLegendSource, /onReducedSpeedZoneClick\?\.\(rsz\.id\)/);
  });

  it("LineLegend includes Regular Service and Limited Service items in a symmetrical 5x2 regional matrix grid", () => {
    assert.match(lineLegendSource, /grid-cols-2/);
    assert.match(lineLegendSource, /Regular Service/);
    assert.match(lineLegendSource, /Limited Service/);
    assert.match(lineLegendSource, /regular-service/);
    assert.match(lineLegendSource, /limited-service/);
  });

  it("LineLegend formats alert icons compactly depending on count in regional mode (vertical stack for 2, triangle for 3, 2x2 grid for 4)", () => {
    assert.match(lineLegendSource, /count === 2/);
    assert.match(lineLegendSource, /flex-col justify-center/);
    assert.match(lineLegendSource, /count === 3/);
    assert.match(lineLegendSource, /col-span-2 flex justify-center/);
    assert.match(lineLegendSource, /w-\[58px\]/);
  });

  it("Card actions are renamed properly", () => {
    assert.doesNotMatch(activeAlertsSource, /Preview on Map|Hide Map Preview/);
    assert.doesNotMatch(reducedSpeedZonesSource, /Preview Reduced Speed Zone|Hide Map Preview/);
    assert.doesNotMatch(plannedClosuresSource, /Preview on Map|Hide Map Preview/);
    assert.match(activeAlertsSource, /Show on Map/);
    assert.match(activeAlertsSource, /Unfocus/);
    assert.match(reducedSpeedZonesSource, /Show on Map/);
    assert.match(reducedSpeedZonesSource, /Unfocus/);
    assert.match(plannedClosuresSource, /Show on Map/);
    assert.match(plannedClosuresSource, /Unfocus/);
    assert.match(shellSource, /MobileImpactInspector/);
    assert.match(shellSource, /mobileImpactInspectorOpen/);
    assert.match(shellSource, /mobileStationInspectorOpen/);
  });

  it("asserts those panels pass displayDirection", () => {
    assert.match(activeAlertsSource, /direction=\{alert\.displayDirection\}/);
    assert.match(delaysPanelSource, /direction=\{delay\.displayDirection\}/);
    assert.match(plannedClosuresSource, /direction=\{closure\.displayDirection\}/);
  });

  it("uses displayDirection to force bidirectional route arrows on cards", () => {
    assert.match(impactCardFieldsSource, /function isBidirectionalRouteDirection/);
    assert.match(impactCardFieldsSource, /both way/);
    assert.match(impactCardFieldsSource, /northbound & southbound/);
    assert.match(impactCardFieldsSource, /eastbound & westbound/);
    assert.match(impactCardFieldsSource, /bounds\.twoWay \|\| isBidirectionalRouteDirection\(direction\)/);
    assert.match(impactCardFieldsSource, /showTwoWay \? <LongArrowLeftRight \/> : <LongArrowRight \/>/);
  });

  it("formats cause values into title case", () => {
    assert.match(impactCardFieldsSource, /export function formatCause/);
    assert.match(impactCardFieldsSource, /causeValue = formatCause/);
  });

  it("renders shared clickable overlapping impact refs on every alert card type", () => {
    assert.match(activeAlertsSource, /getOverlappingImpactRefs/);
    assert.match(activeAlertsSource, /OverlappingImpactRefs/);
    assert.match(activeAlertsSource, /Overlap:/);
    assert.doesNotMatch(activeAlertsSource, /Also overlapping:/);
    assert.match(delaysPanelSource, /getOverlappingImpactRefs/);
    assert.match(delaysPanelSource, /OverlappingImpactRefs/);
    assert.match(delaysPanelSource, /Overlap:/);
    assert.doesNotMatch(delaysPanelSource, /Also overlapping:/);
    assert.match(reducedSpeedZonesSource, /getOverlappingImpactRefs/);
    assert.match(reducedSpeedZonesSource, /OverlappingImpactRefs/);
    assert.match(plannedClosuresSource, /getOverlappingImpactRefs/);
    assert.match(plannedClosuresSource, /OverlappingImpactRefs/);
    assert.match(plannedClosuresSource, /previewSegmentIds/);
    assert.match(impactCardFieldsSource, /export function formatCompactLocation/);
    assert.match(impactCardFieldsSource, /bounds\.twoWay \? "↔" : "→"/);
    assert.match(impactOverlapRefsSource, /ImpactTypeIcon/);
    assert.match(impactTypeIconSource, /impact-type-icon/);
    assert.match(impactOverlapRefsSource, /overlap-impact-ref/);
    assert.doesNotMatch(impactOverlapRefsSource, /text-sky-500/);
    assert.match(impactOverlapRefsLogicSource, /if \(alert\.severity === "delay"\) return "delay";\s*return "suspension";/);
    assert.match(impactOverlapRefsLogicSource, /activePlannedClosureIds/);
    assert.match(impactOverlapRefsLogicSource, /activePlannedClosureIds\.has\(closure\.id\)/);
  });

  it("routes active planned closures through active alerts instead of upcoming closures", () => {
    const selectedActiveAlertIndex = interactiveMapSource.indexOf(
      "activeAlerts.find((alert) => alert.id === selection.id)?.affectedSegmentIds"
    );
    const selectedPlannedClosureIndex = interactiveMapSource.indexOf(
      "plannedClosures.find((closure) => closure.id === selection.id)?.previewSegmentIds"
    );
    const impactActiveAlertIndex = interactiveMapSource.indexOf(
      "activeAlerts.find((alert) => alert.id === impact.cardId)?.affectedSegmentIds"
    );
    const impactPlannedClosureIndex = interactiveMapSource.indexOf(
      "plannedClosures.find((closure) => closure.id === impact.cardId)?.previewSegmentIds"
    );

    assert.notEqual(selectedActiveAlertIndex, -1);
    assert.notEqual(selectedPlannedClosureIndex, -1);
    assert.notEqual(impactActiveAlertIndex, -1);
    assert.notEqual(impactPlannedClosureIndex, -1);
    assert.ok(selectedActiveAlertIndex < selectedPlannedClosureIndex);
    assert.ok(impactActiveAlertIndex < impactPlannedClosureIndex);
    assert.match(activeAlertsSource, /function impactKindForAlert/);
    assert.match(activeAlertsSource, /function impactKindForAlert\(alert: ActiveAlert\): ImpactKind/);
    assert.doesNotMatch(activeAlertsSource, /case "planned":\s*return "planned-closure"/);
    assert.doesNotMatch(activeAlertsSource, /useScrollSelectedImpactCard\(selection, "planned-closure"\)/);
    assert.match(shellSource, /function viewForImpactSelection|const viewForImpactSelection = useCallback/);
    assert.match(shellSource, /nextSelection\.kind === "planned-closure"/);
    assert.match(shellSource, /activeAlerts\.some\(\(alert\) => alert\.id === nextSelection\.id\)/);
    assert.match(shellSource, /setActiveView\(.*viewForImpactSelection\(nextSelection\)\)/);
    assert.match(interactiveMapSource, /activeAlerts\.find\(\(alert\) => alert\.id === selection\.id\)\?\.affectedSegmentIds/);
    assert.match(interactiveMapSource, /activeAlerts\.find\(\(alert\) => alert\.id === impact\.cardId\)\?\.affectedSegmentIds/);
  });

  it("defines a closed-hours screen with schedule, resume copy, and map peek action", () => {
    assert.match(subwayClosedSource, /SubwayClosedScreen/);
    assert.match(subwayClosedSource, /\/assets\/linewatch\/closed-alert\.svg/);
    assert.match(subwayClosedSource, /Subway Closed/);
    assert.match(subwayClosedSource, /Monday – Saturday/);
    assert.match(subwayClosedSource, /Sunday/);
    assert.match(subwayClosedSource, /nextResumeLabel/);
    assert.match(subwayClosedSource, /Peek at Map/);
    assert.match(subwayClosedSource, /operatingHours\.overnight/);
    assert.match(subwayHoursSource, /Blue Night Network/);
    assert.match(subwayHoursSource, /Exact first and last train times vary by station/);
    assert.match(shellSource, /useSubwayOperatingState/);
    assert.match(shellSource, /showClosedScreen/);
    assert.match(shellSource, /closedMapPeek/);
    assert.match(shellSource, /handlePeekClosedMap/);
    assert.match(shellSource, /SubwayClosedScreen/);
    assert.match(shellSource, /subway-closed-map-backdrop/);
    assert.match(shellSource, /subway-closed-peek-chip/);
    assert.match(shellSource, /Closed Screen/);
    assert.match(globalCss, /\.subway-closed-screen/);
    assert.match(globalCss, /\.subway-closed-map-backdrop/);
    assert.match(globalCss, /filter:\s*blur\(9px\) saturate\(0\.72\) brightness\(0\.42\)/);
    assert.match(globalCss, /\.subway-closed-peek-chip/);
    assert.match(globalCss, /#8B5CF6/);
    assert.match(globalCss, /#FACC15/);
  });

  it("shows the app version label under the ingestion status tiles in the desktop menu", () => {
    assert.match(shellSource, /lineWatchAppVersionLabel/);
    assert.match(shellSource, /aria-label=\{\`App version \$\{lineWatchAppVersionLabel\}\`\}/);
  });
});
