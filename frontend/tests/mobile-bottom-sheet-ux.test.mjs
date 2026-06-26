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
    assert.match(moreSheetSource, /LineWatchTO/);
    assert.match(moreSheetSource, /Sign In/);
    assert.match(moreSheetSource, /Create Account/);
    assert.match(moreSheetSource, /Demo Account/);
    assert.match(moreSheetSource, /onLinkGoogleAccount/);
    assert.match(moreSheetSource, /googleLinked/);
    assert.match(moreSheetSource, /Google Linked/);
    assert.match(moreSheetSource, /Link Google/);
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
    assert.match(globalCss, /--mobile-chrome-background:\s*rgb\(14,\s*16,\s*22\)/);
    assert.match(globalCss, /\.mobile-bottom-nav\s*\{[^}]*background:\s*var\(--mobile-chrome-background\)/s);
    assert.match(globalCss, /\.mobile-status-peek\s*\{[^}]*background:\s*var\(--mobile-chrome-background\)/s);
    assert.match(globalCss, /\.floating-panel-shell\[data-floating-panel="mobile-panel"\]\s*\.floating-panel-scroll\s*\{[^}]*background:\s*var\(--mobile-chrome-background\)/s);
    assert.match(globalCss, /\.mobile-legend-pill,[\s\S]*\.theme-toggle-btn,[\s\S]*\.rotate-map-btn,[\s\S]*\.site-guide-trigger,[\s\S]*\.mobile-status-peek\s*\{[^}]*background:\s*var\(--mobile-chrome-background\)\s*!important/s);
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

  it("keeps mobile chrome outside iPhone unsafe areas", () => {
    assert.match(globalCss, /--mobile-safe-top:\s*env\(safe-area-inset-top,\s*0px\)/);
    assert.match(globalCss, /--mobile-safe-right:\s*env\(safe-area-inset-right,\s*0px\)/);
    assert.match(globalCss, /--mobile-safe-left:\s*env\(safe-area-inset-left,\s*0px\)/);
    assert.match(globalCss, /--mobile-safe-bottom:\s*env\(safe-area-inset-bottom,\s*0px\)/);
    assert.match(globalCss, /\.linewatch-shell > header\s*\{[\s\S]*var\(--mobile-safe-top\)/);
    assert.match(globalCss, /\.linewatch-shell > header\s*\{[\s\S]*var\(--mobile-safe-right\)/);
    assert.match(globalCss, /\.linewatch-shell > header\s*\{[\s\S]*var\(--mobile-safe-left\)/);
    assert.match(globalCss, /data-safe-area-debug="iphone-dynamic-island"/);
  });

  it("uses the visual viewport to make mobile sheets keyboard-aware on iOS", () => {
    assert.match(shellSource, /--visual-viewport-offset-top/);
    assert.match(shellSource, /--visual-keyboard-inset/);
    assert.match(shellSource, /document\.documentElement\.dataset\.visualKeyboard/);
    assert.match(globalCss, /html\[data-visual-keyboard="open"\]\s+\.mobile-bottom-nav\s*\{[\s\S]*display:\s*none\s*!important/);
    assert.match(globalCss, /html\[data-visual-keyboard="open"\]\s+\.floating-panel-shell\s*\{[\s\S]*bottom:\s*max\(8px,\s*var\(--mobile-safe-bottom\)\)/);
    assert.match(globalCss, /html\[data-visual-keyboard="open"\]\s+\.commute-station-popover\s*\{[\s\S]*bottom:\s*max\(8px,\s*var\(--mobile-safe-bottom\)\)/);
  });

  it("makes mobile search a top-input sheet instead of a keyboard-covered bottom input", () => {
    assert.match(shellSource, /activeView !== "search"/);
    assert.match(globalCss, /\.station-search-panel\s*\{[\s\S]*top:\s*calc\([\s\S]*var\(--visual-viewport-offset-top/);
    assert.match(globalCss, /\.station-search-panel\s*\{[\s\S]*flex-direction:\s*column\s*!important/);
    assert.doesNotMatch(globalCss, /\.station-search-panel\s*\{[\s\S]*?flex-direction:\s*column-reverse\s*!important/s);
    assert.match(globalCss, /\.station-search-input-row\s*\{[\s\S]*position:\s*sticky/);
    assert.match(globalCss, /\.station-search-input-row\s*\{[\s\S]*top:\s*0/);
  });

  it("prevents iOS input-focus zoom without disabling user page zoom", () => {
    assert.match(globalCss, /input,\s*textarea,\s*select\s*\{[\s\S]*font-size:\s*16px\s*!important/);
    assert.match(globalCss, /button,\s*a,\s*input,\s*textarea,\s*select\s*\{[\s\S]*touch-action:\s*manipulation/);
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
