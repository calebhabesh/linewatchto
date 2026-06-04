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
const savedCommutesSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const reliabilitySource = readFileSync(new URL("../src/components/ReliabilityPanel.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const subwayClosedSource = readFileSync(new URL("../src/components/SubwayClosedScreen.tsx", import.meta.url), "utf8");
const subwayHoursSource = readFileSync(new URL("../src/app/subway-hours.ts", import.meta.url), "utf8");


describe("floating menu layout", () => {
  it("keeps the map first while exposing floating menu and submenu states", () => {
    assert.match(shellSource, /type ActiveView = "map" \| "menu" \| "alerts" \| "delays" \| "reduced-speed-zones" \| "closures" \| "commutes" \| "analytics"/);
    assert.match(shellSource, /handleToggleMenu/);
    assert.match(shellSource, /Toggle menu/);
    assert.match(shellSource, /Floating Dropdown Menu/);
    assert.match(shellSource, /Floating Submenus/);
    assert.match(shellSource, /activeView === "alerts"/);
    assert.match(shellSource, /activeView === "delays"/);
    assert.match(shellSource, /\/assets\/linewatch\/delay-icon\.svg/);
    assert.match(delaysPanelSource, /data-impact-card-id=/);
    assert.match(delaysPanelSource, /MetadataGrid/);
    assert.match(impactCardFieldsSource, /\["Started"/);
    assert.match(impactCardFieldsSource, /"Updated"/);
    assert.match(lineLegendSource, /onDelayClick\?\.\(line\.id\)/);
    assert.match(shellSource, /"reduced-speed-zones"/);
    assert.match(shellSource, /Reduced Speed Zones/);
    assert.match(reducedSpeedZonesSource, /Reduced Speed Zones/);
    assert.match(reducedSpeedZonesSource, /zone\.displayDirection/);
    assert.match(reducedSpeedZonesSource, /direction=\{zone\.displayDirection\}/);
    assert.match(reducedSpeedZonesSource, /Construction/);
    assert.match(lineLegendSource, /Construction/);
    assert.match(lineLegendSource, /View reduced speed zone/);
    assert.doesNotMatch(reducedSpeedZonesSource, />\s*Degraded\s*</);
    assert.doesNotMatch(shellSource, /> Slowdowns</);

    assert.match(shellSource, /activeView === "closures"/);
    assert.match(shellSource, /activeView === "commutes"/);
    assert.match(shellSource, /activeView === "analytics"/);
    assert.match(interactiveMapSource, /layoutResetSignal/);
    assert.doesNotMatch(shellSource, /sidebarCollapsed/);
    assert.doesNotMatch(shellSource, /lg:left-\[520px\]/);
    assert.doesNotMatch(shellSource, /Collapse status sidebar/);
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
    assert.match(globalCss, /scrollbar-color:\s*rgba\(148, 163, 184, 0\.28\) transparent/);
    assert.match(globalCss, /::-webkit-scrollbar-thumb/);
    assert.match(globalCss, /background:\s*rgba\(148, 163, 184, 0\.24\)/);
  });

  it("keeps station detail separate from the left-side floating panels", () => {
    assert.match(shellSource, /StationDetailPanel/);
    assert.match(shellSource, /selectedStationId/);
    assert.match(shellSource, /setSelectedStationId\(null\)/);
  });

  it("labels fallback mode without claiming live TTC status", () => {
    assert.match(pageSource, /fixture mode/);
  });

  it("LineLegend calls onReducedSpeedZoneClick with line.id", () => {
    assert.match(lineLegendSource, /onReducedSpeedZoneClick\?\.\(line\.id\)/);
    assert.doesNotMatch(lineLegendSource, /onReducedSpeedZoneClick\?\.\(rsz\.id\)/);
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
  });

  it("asserts those panels pass displayDirection", () => {
    assert.match(activeAlertsSource, /direction=\{alert\.displayDirection\}/);
    assert.match(delaysPanelSource, /direction=\{delay\.displayDirection\}/);
    assert.match(plannedClosuresSource, /direction=\{closure\.displayDirection\}/);
  });

  it("formats cause values into title case", () => {
    assert.match(impactCardFieldsSource, /export function formatCause/);
    assert.match(impactCardFieldsSource, /causeValue = formatCause/);
  });

  it("renders clickable overlapping impact refs on active alert and delay cards", () => {
    assert.match(activeAlertsSource, /overlappingImpacts\.length > 0/);
    assert.match(activeAlertsSource, /Overlapping:/);
    assert.doesNotMatch(activeAlertsSource, /Also overlapping:/);
    assert.match(activeAlertsSource, /onSelectImpact\(overlap\.selection\)/);
    assert.match(activeAlertsSource, /location: rsz\.location/);
    assert.match(activeAlertsSource, /location: delay\.location/);
    assert.match(activeAlertsSource, /formatCompactLocation\(overlap\.location\)/);
    assert.match(activeAlertsSource, /overlap-impact-location/);
    assert.match(activeAlertsSource, /<Construction/);
    assert.match(activeAlertsSource, /<DelayIcon/);
    assert.match(delaysPanelSource, /hasOverlappingRSZ/);
    assert.match(delaysPanelSource, /Overlapping:/);
    assert.doesNotMatch(delaysPanelSource, /Also overlapping:/);
    assert.match(delaysPanelSource, /onSelectImpact\(overlap\.selection\)/);
    assert.match(delaysPanelSource, /location: alert\.location/);
    assert.match(delaysPanelSource, /location: rsz\.location/);
    assert.match(delaysPanelSource, /formatCompactLocation\(overlap\.location\)/);
    assert.match(delaysPanelSource, /overlap-impact-location/);
    assert.match(delaysPanelSource, /<Construction/);
    assert.match(delaysPanelSource, /<AlertTriangle/);
    assert.match(delaysPanelSource, /Reduced Speed Zone/);
    assert.match(impactCardFieldsSource, /export function formatCompactLocation/);
    assert.match(impactCardFieldsSource, /bounds\.twoWay \? "↔" : "→"/);
  });

  it("routes active planned closures through active alerts instead of upcoming closures", () => {
    assert.match(activeAlertsSource, /function impactKindForAlert/);
    assert.match(activeAlertsSource, /alert\.severity === "planned" \? "planned-closure" : "suspension"/);
    assert.match(activeAlertsSource, /useScrollSelectedImpactCard\(selection, "planned-closure"\)/);
    assert.match(shellSource, /function viewForImpactSelection/);
    assert.match(shellSource, /nextSelection\.kind === "planned-closure"/);
    assert.match(shellSource, /activeAlerts\.some\(\(alert\) => alert\.id === nextSelection\.id\)/);
    assert.match(shellSource, /setActiveView\(viewForImpactSelection\(nextSelection\)\)/);
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
    assert.match(shellSource, /Closed screen/);
    assert.match(globalCss, /\.subway-closed-screen/);
    assert.match(globalCss, /\.subway-closed-map-backdrop/);
    assert.match(globalCss, /filter:\s*blur\(9px\) saturate\(0\.72\) brightness\(0\.42\)/);
    assert.match(globalCss, /\.subway-closed-peek-chip/);
    assert.match(globalCss, /#8B5CF6/);
    assert.match(globalCss, /#FACC15/);
  });
});

