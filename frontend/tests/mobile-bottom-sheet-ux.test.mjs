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
    assert.match(globalCss, /bottom:\s*var\(--mobile-bottom-nav-occupied-height\)/);
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

  it("keeps the mobile legend aligned below iPhone status chrome with top controls", () => {
    assert.match(globalCss, /\.mobile-legend-pill\s*\{[\s\S]*top:\s*calc\(var\(--mobile-safe-top\)\s*\+\s*var\(--mobile-edge-inset\)\)\s*!important/);
    assert.match(globalCss, /\.mobile-legend-pill\s*\{[\s\S]*left:\s*calc\(var\(--mobile-safe-left\)\s*\+\s*var\(--mobile-edge-inset\)\)\s*!important/);
    assert.match(globalCss, /\.mobile-legend-pill--announcement\s*\{[\s\S]*top:\s*calc\(var\(--mobile-safe-top\)\s*\+\s*var\(--mobile-edge-inset\)\s*\+\s*var\(--mobile-announcement-chip-height\)/);
  });

  it("keeps iPhone bottom navigation close to the bottom without compounding safe-area gaps", () => {
    assert.match(globalCss, /--mobile-bottom-nav-bottom-offset:\s*max\(10px,\s*calc\(var\(--mobile-safe-bottom\)\s*-\s*18px\)\)/);
    assert.match(globalCss, /--mobile-bottom-nav-occupied-height:\s*calc\(var\(--mobile-bottom-nav-height\)\s*\+\s*var\(--mobile-bottom-nav-bottom-offset\)\)/);
    assert.match(globalCss, /\.mobile-bottom-nav\s*\{[\s\S]*bottom:\s*var\(--mobile-bottom-nav-bottom-offset\)/);
    assert.doesNotMatch(globalCss, /\.mobile-bottom-nav\s*\{[\s\S]*bottom:\s*calc\(var\(--mobile-bottom-nav-margin-bottom\)\s*\+\s*var\(--mobile-safe-bottom\)\)/);
  });

  it("lets the Commutes mobile nav label fit without ellipsis on narrow iPhones", () => {
    assert.match(bottomNavSource, /data-nav-key=\{key\}/);
    assert.match(globalCss, /\.mobile-bottom-nav-label\s*\{[\s\S]*font-size:\s*9px/);
    assert.match(globalCss, /\.mobile-bottom-nav-label\s*\{[\s\S]*letter-spacing:\s*0/);
    assert.match(globalCss, /\.mobile-bottom-nav-item\[data-nav-key="commutes"\]\s+\.mobile-bottom-nav-label\s*\{[\s\S]*font-size:\s*8\.75px/);
  });

  it("uses the visual viewport to make mobile sheets keyboard-aware on iOS", () => {
    assert.match(shellSource, /--visual-viewport-offset-top/);
    assert.match(shellSource, /--visual-keyboard-inset/);
    assert.match(shellSource, /document\.documentElement\.dataset\.visualKeyboard/);
    assert.match(globalCss, /html\[data-visual-keyboard="open"\]\s+\.mobile-bottom-nav\s*\{[\s\S]*display:\s*none\s*!important/);
    assert.match(globalCss, /html\[data-visual-keyboard="open"\]\s+\.floating-panel-shell\s*\{[\s\S]*top:\s*calc\(var\(--visual-viewport-offset-top,\s*0px\)\s*\+\s*var\(--mobile-safe-top\)\s*\+\s*8px\)/);
    assert.match(globalCss, /html\[data-visual-keyboard="open"\]\s+\.floating-panel-shell\s*\{[\s\S]*bottom:\s*auto/);
    assert.match(globalCss, /html\[data-visual-keyboard="open"\]\s+\.commute-station-popover\s*\{[\s\S]*top:\s*calc\(var\(--visual-viewport-offset-top,\s*0px\)\s*\+\s*var\(--mobile-safe-top\)\s*\+\s*8px\)/);
    assert.match(globalCss, /html\[data-visual-keyboard="open"\]\s+\.commute-station-popover\s*\{[\s\S]*bottom:\s*auto\s*!important/);
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
    assert.match(globalCss, /\.saved-commute-form input\s*\{[\s\S]*font-size:\s*16px/);
    assert.match(globalCss, /\.commute-station-search-row input\s*\{[\s\S]*font-size:\s*16px/);
    assert.match(globalCss, /button,\s*a,\s*input,\s*textarea,\s*select\s*\{[\s\S]*touch-action:\s*manipulation/);
  });

  it("keeps saved commute station search results visible while the iOS keyboard is open", () => {
    assert.match(globalCss, /\.commute-station-search-row\s*\{[\s\S]*position:\s*sticky/);
    assert.match(globalCss, /\.commute-station-search-row\s*\{[\s\S]*top:\s*0/);
    assert.match(globalCss, /\.commute-station-popover > \.commute-station-options\s*\{[\s\S]*overflow-y:\s*auto/);
    assert.match(globalCss, /html\[data-visual-keyboard="open"\]\s+\.commute-station-popover > \.commute-station-options\s*\{[\s\S]*max-height:\s*none/);
  });

  it("uses medium smoky moving mobile scrollbars with content spacing and no static affordances", () => {
    assert.doesNotMatch(globalCss, /:root\s*\{[^}]*\n\s*color-scheme:\s*dark;\n/);
    assert.match(globalCss, /:root\s*\{[\s\S]*?color-scheme:\s*light dark;/);
    assert.match(globalCss, /\.linewatch-shell\s*\{[\s\S]*?color-scheme:\s*light;/);
    assert.match(globalCss, /\.linewatch-shell\.dark\s*\{[\s\S]*?color-scheme:\s*dark;/);
    assert.match(globalCss, /--mobile-scroll-indicator-thumb:\s*rgba\(15,\s*23,\s*42,\s*0\.54\)/);
    assert.match(globalCss, /\.linewatch-shell\.dark\s*\{[\s\S]*?--mobile-scroll-indicator-thumb:\s*rgba\(148,\s*163,\s*184,\s*0\.72\)/);
    assert.doesNotMatch(globalCss, /--mobile-scroll-affordance-/);
    assert.match(shellSource, /MOBILE_SCROLLBAR_SELECTOR/);
    assert.match(shellSource, /linewatch-mobile-scrollbar/);
    assert.match(shellSource, /--mobile-scrollbar-thumb-top/);
    assert.match(shellSource, /--mobile-scrollbar-thumb-height/);
    assert.match(shellSource, /Math\.max\(48,\s*Math\.min\(72,\s*Math\.round\(element\.clientHeight\s*\*\s*0\.14\)\)\)/);
    assert.doesNotMatch(shellSource, /Math\.max\(22,\s*Math\.min\(30,\s*Math\.round\(element\.clientHeight\s*\*\s*0\.09\)\)\)/);
    assert.match(shellSource, /requestAnimationFrame/);
    assert.match(globalCss, /@media \(max-width:\s*767px\)\s*\{[\s\S]*?\.floating-panel-scroll,[\s\S]*?\.station-search-results,[\s\S]*?\.commute-station-options[\s\S]*?\{[\s\S]*?scrollbar-color:\s*var\(--mobile-scroll-indicator-thumb\)\s*transparent/);
    assert.match(globalCss, /\.floating-panel-scroll::-webkit-scrollbar-thumb,[\s\S]*?\.station-search-results::-webkit-scrollbar-thumb,[\s\S]*?\.commute-station-options::-webkit-scrollbar-thumb[\s\S]*?\{[\s\S]*?background:\s*var\(--mobile-scroll-indicator-thumb\)[\s\S]*?border-radius:\s*999px/);
    assert.match(globalCss, /\.linewatch-mobile-scrollbar\s*\{[\s\S]*?scrollbar-width:\s*none/);
    assert.match(globalCss, /\.linewatch-mobile-scrollbar::-webkit-scrollbar\s*\{[\s\S]*?display:\s*none/);
    assert.match(globalCss, /\.linewatch-mobile-scrollbar::after\s*\{[\s\S]*?position:\s*absolute[\s\S]*?top:\s*var\(--mobile-scrollbar-thumb-top,[\s\S]*?right:\s*2px[\s\S]*?height:\s*var\(--mobile-scrollbar-thumb-height,[\s\S]*?width:\s*4px[\s\S]*?border-radius:\s*999px/);
    assert.doesNotMatch(globalCss, /background-image:[\s\S]*?mobile-scroll-affordance/);
    assert.doesNotMatch(globalCss, /radial-gradient\(circle,[\s\S]*?mobile-scroll-affordance/);
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
