import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../src/components/SurfaceNoticesPanel.tsx", import.meta.url), "utf8");
const statusSheetSource = readFileSync(new URL("../src/components/MobileStatusSheet.tsx", import.meta.url), "utf8");
const overviewSource = readFileSync(new URL("../src/components/DesktopStatusOverview.tsx", import.meta.url), "utf8");
const stylesSource = readAppStylesheet();

describe("surface notices panel and routing source verification", () => {
  it("verifies LineWatchShell.tsx includes surface-notices view and routing", () => {
    assert.match(shellSource, /"surface-notices"/);
    assert.match(shellSource, /<SurfaceNoticesPanel/);
    assert.match(shellSource, /surfaceNoticeCount/);
    assert.match(shellSource, /activeView === "surface-notices" \?/);
  });

  it("verifies SurfaceNoticesPanel includes search input, category controls, and compact route groups", () => {
    assert.match(panelSource, /type="text"/);
    assert.match(panelSource, /Search route, stop, or notice/);
    assert.match(panelSource, /setCategory/);
    assert.match(panelSource, /groupSurfaceNoticesByRoute/);
    assert.match(panelSource, /surface-notice-route-group/);
    assert.match(panelSource, /surface-notice-stop-row/);
    assert.match(panelSource, /Routes Affected/);
  });

  it("verifies SurfaceNoticesPanel uses a dynamic Stop or Stops field heading", () => {
    assert.match(panelSource, /stopFieldHeading/);
    assert.match(panelSource, /displayStops\.length > 1 \? "Stops" : "Stop"/);
    assert.match(panelSource, /renderCompactField\(stopFieldHeading\(notice\), stopFieldLabel\(notice\)/);
    assert.match(panelSource, /`\$\{stop\.stopId\} \$\{stop\.stopName\}`/);
  });

  it("shows full notice details above metadata with a plain footnote", () => {
    assert.match(panelSource, /surface-notice-description/);
    assert.match(panelSource, /surface-notice-footnote/);
    assert.doesNotMatch(panelSource, /More Details|Less Details|line-clamp-3|expandedNoticeIds/);
    assert.ok(panelSource.indexOf('className="surface-notice-description') < panelSource.indexOf('<dl className='));
    assert.match(panelSource, /Sort notices/);
    assert.match(panelSource, /Most Recent/);
  });

  it("uses compact timestamp formatting for notice update fields and exact formatting for active windows", () => {
    assert.match(panelSource, /formatImpactTimestamp/);
    assert.match(panelSource, /formatOperationalDateTime/);
    assert.doesNotMatch(panelSource, /formatRelativeImpactTime/);
    assert.doesNotMatch(panelSource, /const formatAbsoluteTime/);
  });

  it("verifies source detail links use target='_blank' and rel='noreferrer'", () => {
    assert.match(panelSource, /target="_blank"/);
    assert.match(panelSource, /rel="noreferrer"/);
    assert.match(panelSource, /View \{regional \? "Metrolinx" : "TTC"\} details/);
  });

  it("verifies MobileStatusSheet includes surface notices entry", () => {
    assert.match(statusSheetSource, /"surface-notices"/);
    assert.match(statusSheetSource, /mobile-status-btn-surface/);
    assert.doesNotMatch(statusSheetSource, /!regional \? <button[^>]+mobile-status-btn-surface/);
  });

  it("uses network-aware regional notice labels and requests", () => {
    assert.match(panelSource, /networkId/);
    assert.match(panelSource, /GO \/ UP Notices/);
    assert.match(shellSource, /networkId=\{selectedNetwork\}/);
    assert.match(panelSource, /Metrolinx notices/);
    assert.match(panelSource, /Search line, station, or notice/);
    assert.match(panelSource, /REGIONAL_STATION_SEARCH_LINES/);
    assert.match(panelSource, /visibleCategories/);
    assert.match(panelSource, /regional-line-identity/);
    assert.match(panelSource, /aria-hidden="true">·<\/span>/);
    assert.doesNotMatch(panelSource, /regional-line-identity[^\n]+rounded border/);
    assert.match(panelSource, /Station \/ Lines Affected/);
    assert.match(panelSource, /displayRouteGroups/);
    assert.match(panelSource, /notices: \[notice\]/);
    assert.match(panelSource, /group\.routeType !== "GO Bus"/);
    assert.match(panelSource, /goBusRouteColor\(routeId\)/);
    assert.match(panelSource, /regional \? "pt-3" : ""/);
    assert.match(panelSource, /Filter GO \/ UP notices by service/);
    assert.match(panelSource, /value: "train", label: "Train"/);
    assert.match(panelSource, /value: "bus", label: "Bus"/);
    assert.match(panelSource, /notice\.routeType === "GO Bus"/);
  });

  it("keeps GO trip changes in the regional notices panel while promoting a direct entry", () => {
    assert.match(panelSource, /Service Notices/);
    assert.match(panelSource, /Trip Changes/);
    assert.match(panelSource, /regional-notices-filter/);
    assert.match(panelSource, /regional-notices-glider/);
    assert.match(stylesSource, /\.regional-notices-filter/);
    assert.match(stylesSource, /\.regional-notices-glider/);
    assert.match(stylesSource, /\.regional-notices-filter\[data-content="trip-changes"\] \.regional-notices-glider/);
    assert.match(panelSource, /getRegionalTripChanges/);
    assert.match(panelSource, /Search train, corridor, or station/);
    assert.match(panelSource, /<RegionalTripChangesList/);
    assert.match(panelSource, /initialRegionalContent/);
    assert.match(shellSource, /openRegionalTripChanges/);
    assert.match(shellSource, /Trip Changes/);
    assert.match(statusSheetSource, /mobile-status-btn-trip-changes/);
  });

  it("uses Megaphone icon for regional Service Notices and Bus icon for TTC Streetcar & Bus Notices with grey menu icons and emerald panel heading", () => {
    assert.match(shellSource, /selectedNetwork === "regional" \? \(\s*<Megaphone size=\{18\} className="text-slate-500 dark:text-slate-400" \/>\s*\) : \(\s*<Bus size=\{18\} className="text-slate-500 dark:text-slate-400" \/>\s*\)/);
    assert.match(statusSheetSource, /regional \? \(\s*<Megaphone size=\{16\} className="text-emerald-600 dark:text-emerald-400 shrink-0" \/>\s*\) : \(\s*<Bus size=\{16\} className="text-emerald-600 dark:text-emerald-400 shrink-0" \/>\s*\)/);
    assert.match(panelSource, /regional \? \(\s*<Megaphone className="w-4 h-4 sm:w-6 sm:h-6 shrink-0 text-emerald-600 dark:text-emerald-400" \/>\s*\) : \(\s*<Bus className="w-4 h-4 sm:w-6 sm:h-6 shrink-0 text-emerald-600 dark:text-emerald-400" \/>\s*\)/);
  });

  it("styles the filter reset button as a flat button with no border outline", () => {
    assert.match(stylesSource, /\.filter-reset-button\s*\{[^}]*border:\s*none;/s);
    assert.doesNotMatch(stylesSource, /\.dark\s+\.filter-reset-button\s*\{[^}]*border-color:/s);
  });

  it("labels untagged regional notices clearly and highlights a directly opened notice", () => {
    assert.doesNotMatch(overviewSource, /Route not (?:specified|listed)/);
    assert.doesNotMatch(overviewSource, /regional \? "GO" : "TTC"/);
    assert.match(panelSource, /initialNoticeId/);
    assert.match(panelSource, /surface-notice-selection-glow/);
    assert.match(panelSource, /group\.notices\.some\(notice => notice\.id === initialNoticeId\)/);
    assert.match(stylesSource, /surface-notice-selection-glow[\s\S]*station-impact-card-highlight-pulse/);
  });
});
