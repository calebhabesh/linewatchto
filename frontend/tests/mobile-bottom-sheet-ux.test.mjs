import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const bottomNavSource = readFileSync(new URL("../src/components/MobileBottomNav.tsx", import.meta.url), "utf8");
const statusPeekSource = readFileSync(new URL("../src/components/MobileStatusPeek.tsx", import.meta.url), "utf8");
const statusSheetSource = readFileSync(new URL("../src/components/MobileStatusSheet.tsx", import.meta.url), "utf8");
const moreSheetSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
const floatingPanelSource = readFileSync(new URL("../src/components/FloatingPanelShell.tsx", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const searchSource = readFileSync(new URL("../src/components/StationSearchPanel.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("mobile bottom sheet UX", () => {
  it("adds mobile primary navigation without removing desktop active views", () => {
    assert.match(shellSource, /type ActiveView = .*"status".*"more"/s);
    assert.match(shellSource, /MobileBottomNav/);
    assert.match(shellSource, /MobileStatusPeek/);
    assert.match(shellSource, /MobileStatusSheet/);
    assert.match(shellSource, /MobileMoreSheet/);
    assert.match(bottomNavSource, /role="navigation"/);
    assert.match(bottomNavSource, /aria-label="Primary mobile navigation"/);
    assert.match(bottomNavSource, /Map/);
    assert.match(bottomNavSource, /Status/);
    assert.match(bottomNavSource, /Search/);
    assert.match(bottomNavSource, /Commutes/);
    assert.match(bottomNavSource, /More/);
  });

  it("keeps a compact status answer above mobile bottom navigation", () => {
    assert.match(statusPeekSource, /mobile-status-peek/);
    assert.match(statusPeekSource, /Reduced Speed Zones/);
    assert.match(statusPeekSource, /onOpenStatus/);
    assert.match(statusPeekSource, /onRecenter/);
    assert.match(statusPeekSource, /aria-label="Open current service status"/);
    assert.match(globalCss, /\.mobile-status-peek/);
    assert.match(globalCss, /--mobile-bottom-nav-height/);
  });

  it("renders a mobile-specific status sheet that drills into existing alert categories", () => {
    assert.match(statusSheetSource, /System Status/);
    assert.match(statusSheetSource, /onOpenCategory/);
    assert.match(statusSheetSource, /"alerts"/);
    assert.match(statusSheetSource, /"delays"/);
    assert.match(statusSheetSource, /"reduced-speed-zones"/);
    assert.match(statusSheetSource, /"closures"/);
    assert.match(statusSheetSource, /Good Service/);
    assert.match(statusSheetSource, /useDashboardData/);
  });

  it("moves secondary mobile utilities into More", () => {
    assert.match(moreSheetSource, /LineWatch TO/);
    assert.match(moreSheetSource, /Sign In/);
    assert.match(moreSheetSource, /Create Account/);
    assert.match(moreSheetSource, /Demo Account/);
    assert.match(moreSheetSource, /lineWatchAppVersionLabel/);
    assert.match(moreSheetSource, /mobile-more-build-label/);
    assert.match(moreSheetSource, /High Contrast Mode/);
    assert.match(moreSheetSource, /Reduced Motion/);
    assert.match(moreSheetSource, /Reliability Analytics/);
    assert.match(moreSheetSource, /LogsDropdown/);
    assert.match(moreSheetSource, /Reset Local App Cache/);
    assert.match(moreSheetSource, /resetLineWatchLocalAppState/);
    assert.match(moreSheetSource, /process\.env\.NODE_ENV !== "production"/);
    assert.match(globalCss, /\.mobile-more-build-label/);
  });

  it("turns floating panels into mobile bottom sheets only below tablet width", () => {
    assert.match(floatingPanelSource, /mobileSheetLabel/);
    assert.match(floatingPanelSource, /data-mobile-sheet-label/);
    assert.match(globalCss, /@media \(max-width:\s*767px\)/);
    assert.match(globalCss, /\.floating-panel-shell/);
    assert.match(globalCss, /bottom:\s*calc\(var\(--mobile-bottom-nav-height\)/);
    assert.match(globalCss, /border-radius:\s*8px 8px 0 0/);
  });

  it("simplifies mobile map controls and hides desktop map utilities on phones", () => {
    assert.match(mapSource, /map-utility-cluster/);
    assert.match(mapSource, /map-control-zoom-group/);
    assert.match(globalCss, /\.map-utility-cluster/);
    assert.match(globalCss, /\.map-control-zoom-group/);
    assert.match(globalCss, /display:\s*none\s*!important/);
  });

  it("makes station search a mobile bottom sheet with single-column browse behavior", () => {
    assert.match(searchSource, /data-station-search-panel/);
    assert.match(globalCss, /\.station-search-panel/);
    assert.match(globalCss, /\.station-search-browse-container/);
    assert.match(globalCss, /flex-direction:\s*column/);
    assert.match(globalCss, /\.station-search-stations-column/);
  });

  it("hides desktop-only chrome on mobile without deleting it", () => {
    assert.match(shellSource, /desktop-top-chrome/);
    assert.match(shellSource, /desktop-map-legend/);
    assert.match(globalCss, /\.desktop-top-chrome/);
    assert.match(globalCss, /\.desktop-map-legend/);
  });

  it("ensures mobile submenu headers are below top URL bar and fit on a single line", () => {
    // Check back navigation history state
    assert.match(shellSource, /previousView/);
    assert.match(shellSource, /handleSubmenuBack/);
    // Check css rules for single-line headers and top offset max-height constraint
    assert.match(globalCss, /\.floating-panel-shell \.panel-heading/);
    assert.match(globalCss, /flex-wrap:\s*nowrap/);
    assert.match(globalCss, /max-height:\s*min\(78dvh/);
    assert.match(globalCss, /-\s*88px/);
  });

  it("keeps Show on Map as a split inspector instead of a competing mobile sheet", () => {
    assert.match(shellSource, /MobileImpactInspector/);
    assert.match(shellSource, /mobileInspectorOpen/);
    assert.match(shellSource, /!mobileInspectorOpen && !selectedStationId && !accountDialogMode/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector > main/);
    assert.match(globalCss, /\.mobile-impact-inspector/);
  });

  it("hides competing mobile chrome while the rotated map mode is active", () => {
    assert.match(shellSource, /mobile-map-rotated/);
    assert.match(shellSource, /MobileMapControls/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated \.mobile-bottom-nav/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated \.mobile-status-peek/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated \.floating-panel-shell/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated \.mobile-legend-pill/);
  });

  it("keeps rotated-map selections in a rotated preview instead of portrait sheets", () => {
    assert.match(shellSource, /RotatedMapSelectionCard/);
    assert.match(shellSource, /rotated-map-hud/);
    assert.match(shellSource, /!rotatedMapMode && selectedStationId/);
    assert.match(globalCss, /\.rotated-map-selection-card/);
  });
});
