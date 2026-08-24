import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../src/components/SurfaceNoticesPanel.tsx", import.meta.url), "utf8");
const statusSheetSource = readFileSync(new URL("../src/components/MobileStatusSheet.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

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
  });

  it("shows route-wide notices in title case and includes a details hint on each notice row", () => {
    assert.match(panelSource, /Route-wide Notice/);
    assert.doesNotMatch(panelSource, /Route-wide notice/);
    assert.match(panelSource, /Info/);
    assert.match(panelSource, /Make sure to check details for more info on routes affected\./);
  });

  it("labels the expandable control as a dropdown instead of an outbound link", () => {
    assert.match(panelSource, /More Details/);
    assert.match(panelSource, /Less Details/);
    assert.match(panelSource, /Show more details for/);
    assert.match(panelSource, /Show fewer details for/);
    assert.match(panelSource, /ChevronDown/);
    assert.match(panelSource, /w-\[calc\(100%-1\.75rem\)\][^"]*rounded-lg border border-slate-300 bg-slate-100[^"]*dark:bg-white\/10/);
    assert.match(panelSource, /<span className="text-sm font-bold leading-none">\{expanded \? "Less Details" : "More Details"\}<\/span>/);
    assert.doesNotMatch(panelSource, /w-\[calc\(100%-1\.75rem\)\][^"]*uppercase/);
    assert.doesNotMatch(panelSource, /<ExternalLink className="h-3 w-3" aria-hidden="true" \/>/);
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
    assert.match(panelSource, /GO Bus \{routeId\}/);
    assert.match(panelSource, /regional \? "pt-3" : ""/);
    assert.match(panelSource, /Filter GO \/ UP notices by service/);
    assert.match(panelSource, /\["train", "Train"\]/);
    assert.match(panelSource, /\["bus", "Bus"\]/);
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
});
