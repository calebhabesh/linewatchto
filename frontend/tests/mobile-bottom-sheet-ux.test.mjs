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
const savedCommutePickerSource = readFileSync(new URL("../src/components/SavedCommuteStationPicker.tsx", import.meta.url), "utf8");
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
    assert.match(statusPeekSource, /data-category-count=\{categoryCount\}/);
    assert.match(statusPeekSource, /\.filter\(\(count\) => count > 0\)\.length/);
    assert.match(statusPeekSource, /Reduced Speed Zones/);
    assert.match(statusPeekSource, /onOpenStatus/);
    assert.match(statusPeekSource, /onRecenter/);
    assert.match(statusPeekSource, /aria-label="Open current service status"/);
    assert.match(globalCss, /\.mobile-status-peek/);
    assert.match(globalCss, /--mobile-bottom-nav-height/);
    assert.match(globalCss, /\.mobile-status-peek-info-btn\s*\{[^}]*gap:\s*4px/s);
    assert.match(globalCss, /\.mobile-status-peek-alert-icon\s*\{[^}]*top:\s*-1\.5px/s);
    assert.match(globalCss, /\.mobile-status-peek-source--updated\s*\{[^}]*margin-top:\s*0(?:px)?/s);
    assert.match(globalCss, /\.mobile-status-peek-info-btn\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0/s);
    assert.match(globalCss, /\.mobile-status-peek-counts\s*\{[^}]*flex-wrap:\s*wrap;[^}]*max-width:\s*100%;[^}]*width:\s*100%/s);
    assert.match(globalCss, /\.mobile-status-peek-count-badge\s*\{[^}]*flex:\s*0 0 auto/s);
    assert.match(globalCss, /\.mobile-status-peek-recenter-btn\s*\{[^}]*flex:\s*0 0 60px/s);
    assert.match(globalCss, /\.mobile-status-peek:is\(\[data-category-count="3"\], \[data-category-count="4"\]\)\s*\{[^}]*gap:\s*8px/s);
    assert.match(globalCss, /\.mobile-status-peek:is\(\[data-category-count="3"\], \[data-category-count="4"\]\) \.mobile-status-peek-counts\s*\{[^}]*gap:\s*4px/s);
    assert.match(globalCss, /\.mobile-status-peek:is\(\[data-category-count="3"\], \[data-category-count="4"\]\) \.mobile-status-peek-count-badge\s*\{[^}]*gap:\s*3px;[^}]*padding-inline:\s*7px/s);
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
    assert.match(statusSheetSource, /<h3>Alerts<\/h3>/);
    assert.match(statusSheetSource, /<h3>Line Status<\/h3>/);
    assert.match(statusSheetSource, /lineClosures\.length === 1 \? "Planned Closure" : "Planned Closures"/);
    assert.match(statusSheetSource, /bg-logo-blue[^\n]*shadow-\[0_0_4px_rgba\(129,201,255,0\.35\)\]/);
    assert.match(statusSheetSource, /className="mobile-line-status-planned-row"/);
    assert.match(globalCss, /\.mobile-status-section-heading\s*\{[^}]*align-items:\s*center;[^}]*display:\s*flex;[^}]*gap:\s*8px/s);
    assert.match(globalCss, /\.mobile-line-status-planned-row\s*\{[^}]*display:\s*flex;[^}]*flex-basis:\s*100%/s);
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
    assert.match(moreSheetSource, /Dot Background/);
    assert.match(moreSheetSource, /Reliability Analytics/);
    assert.match(moreSheetSource, /LogsDropdown/);
    assert.match(moreSheetSource, /Reset Local App Cache/);
    assert.match(moreSheetSource, /resetLineWatchLocalAppState/);
    assert.match(moreSheetSource, /process\.env\.NODE_ENV !== "production"/);
    assert.match(globalCss, /\.mobile-more-build-label/);
  });

  it("prioritizes mobile More sections without turning More into Settings", () => {
    assert.match(bottomNavSource, /MoreHorizontal/);
    assert.match(bottomNavSource, /\{ key: "more", label: "More", Icon: MoreHorizontal \}/);
    assert.doesNotMatch(bottomNavSource, /Settings/);
    assert.doesNotMatch(bottomNavSource, /Cog/);

    assert.ok(
      moreSheetSource.indexOf("Install LineWatchTO") < moreSheetSource.indexOf("<h3>Account</h3>"),
      "Install should remain first when install help is visible.",
    );
    assert.ok(
      moreSheetSource.indexOf("<h3>Account</h3>") < moreSheetSource.indexOf("<h3>Notifications</h3>"),
      "Account should appear before notifications.",
    );
    assert.ok(
      moreSheetSource.indexOf("<h3>Notifications</h3>") < moreSheetSource.indexOf("<h3>Operations</h3>"),
      "Notifications should appear before operational tools.",
    );
    assert.ok(
      moreSheetSource.indexOf("<h3>Notifications</h3>") < moreSheetSource.indexOf("Alert History"),
      "Alert History should live in Notifications.",
    );
    assert.ok(
      moreSheetSource.indexOf("Alert History") < moreSheetSource.indexOf("<h3>Operations</h3>"),
      "Alert History should appear before Operations.",
    );
    assert.ok(
      moreSheetSource.indexOf("<h3>Operations</h3>") < moreSheetSource.indexOf("Reliability Analytics"),
      "Reliability Analytics should live in Operations.",
    );
    assert.ok(
      moreSheetSource.indexOf("<h3>Operations</h3>") < moreSheetSource.indexOf("Source Health"),
      "Source Health should live in Operations.",
    );
    assert.ok(
      moreSheetSource.indexOf("Source Health") < moreSheetSource.indexOf("<h3>Display</h3>"),
      "Source Health should not remain buried at the bottom of More.",
    );
    assert.ok(
      moreSheetSource.indexOf("<h3>Display</h3>") < moreSheetSource.indexOf("Support & About"),
      "Display preferences should appear before support and about actions.",
    );
    assert.ok(
      moreSheetSource.indexOf("Support & About") < moreSheetSource.indexOf("Share LineWatchTO"),
      "Share should live in Support & About.",
    );
    assert.doesNotMatch(moreSheetSource, /<h3>Tools<\/h3>/);
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

  it("keeps mobile list endings compact with a thumb-only scrollbar indicator", () => {
    assert.doesNotMatch(globalCss, /padding-bottom:\s*56px\s*!important;[\s\S]{0,160}mask-image:\s*linear-gradient\(to bottom, black calc\(100% - 60px\)/);
    assert.match(globalCss, /\.mobile-more-content-scroll,[\s\S]*?\.mobile-status-content-scroll\s*\{[\s\S]*?scrollbar-width:\s*thin\s*!important/);
    assert.match(globalCss, /\.mobile-more-content-scroll::-webkit-scrollbar,[\s\S]*?\.mobile-status-content-scroll::-webkit-scrollbar\s*\{[\s\S]*?width:\s*4px/);
    assert.match(globalCss, /\.mobile-more-content-scroll::-webkit-scrollbar-track,[\s\S]*?\.mobile-status-content-scroll::-webkit-scrollbar-track\s*\{[\s\S]*?background:\s*transparent/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector-station \.station-detail-panel\s*\{[\s\S]*?height:\s*auto;[\s\S]*?max-height:\s*var\(--mobile-inspector-total-height\)/);
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
    assert.match(savedCommutePickerSource, /window\.visualViewport/);
    assert.match(savedCommutePickerSource, /visualViewport\?\.addEventListener\("resize",\s*updateCoords\)/);
    assert.match(savedCommutePickerSource, /position:\s*"fixed"/);
    assert.match(savedCommutePickerSource, /maxHeight:\s*`\$\{coords\.maxHeight\}px`/);
    assert.match(globalCss, /\.commute-station-search-row\s*\{[\s\S]*position:\s*sticky/);
    assert.match(globalCss, /\.commute-station-search-row\s*\{[\s\S]*top:\s*0/);
    assert.match(globalCss, /\.commute-station-popover > \.commute-station-options\s*\{[\s\S]*overflow-y:\s*auto/);
    assert.match(globalCss, /html\[data-visual-keyboard="open"\]\s+\.commute-station-popover > \.commute-station-options\s*\{[\s\S]*max-height:\s*none/);
  });

  it("uses touch scrolling with a compact mobile scrollbar thumb", () => {
    assert.doesNotMatch(globalCss, /:root\s*\{[^}]*\n\s*color-scheme:\s*dark;\n/);
    assert.match(globalCss, /:root\s*\{[\s\S]*?color-scheme:\s*light dark;/);
    assert.match(globalCss, /\.linewatch-shell\s*\{[\s\S]*?color-scheme:\s*light;/);
    assert.match(globalCss, /\.linewatch-shell\.dark\s*\{[\s\S]*?color-scheme:\s*dark;/);
    assert.match(globalCss, /--mobile-scroll-indicator-thumb:\s*rgba\(15,\s*23,\s*42,\s*0\.54\)/);
    assert.match(globalCss, /\.linewatch-shell\.dark\s*\{[\s\S]*?--mobile-scroll-indicator-thumb:\s*rgba\(148,\s*163,\s*184,\s*0\.72\)/);
    assert.doesNotMatch(globalCss, /--mobile-scroll-affordance-/);
    assert.doesNotMatch(shellSource, /MOBILE_SCROLLBAR_SELECTOR/);
    assert.doesNotMatch(shellSource, /linewatch-mobile-scrollbar/);
    assert.doesNotMatch(shellSource, /--mobile-scrollbar-thumb-top/);
    assert.doesNotMatch(shellSource, /--mobile-scrollbar-thumb-height/);
    assert.doesNotMatch(shellSource, /function isIosScrollbarHost\(\)/);
    assert.doesNotMatch(shellSource, /useMobileScrollbars/);
    assert.doesNotMatch(shellSource, /Math\.max\(48,\s*Math\.min\(72,\s*Math\.round\(element\.clientHeight\s*\*\s*0\.14\)\)\)/);
    assert.doesNotMatch(shellSource, /Math\.max\(22,\s*Math\.min\(30,\s*Math\.round\(element\.clientHeight\s*\*\s*0\.09\)\)\)/);
    const mobileScrollContainerRule = globalCss.match(/@media \(max-width:\s*767px\)\s*\{\s*\.floating-panel-scroll,[\s\S]*?\.mobile-status-content-scroll\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
    assert.match(mobileScrollContainerRule, /-webkit-overflow-scrolling:\s*touch/);
    assert.match(globalCss, /\*\s*\{\s*scrollbar-color:\s*var\(--mobile-scroll-indicator-thumb\)\s*transparent;\s*scrollbar-width:\s*thin;/);
    assert.match(globalCss, /@media\s*\(min-width:\s*768px\)\s*\{\s*\*::-webkit-scrollbar/);
    assert.match(globalCss, /\.mobile-status-content-scroll::-webkit-scrollbar\s*\{[\s\S]*?display:\s*block\s*!important/);
    assert.doesNotMatch(globalCss, /\.floating-panel-scroll::-webkit-scrollbar/);
    assert.doesNotMatch(globalCss, /--mobile-native-scrollbar-size/);
    assert.match(globalCss, /\.mobile-status-content-scroll\s*\{[\s\S]*?padding-right:\s*16px\s*!important/);
    assert.doesNotMatch(globalCss, /\.linewatch-mobile-scrollbar/);
    assert.doesNotMatch(globalCss, /--mobile-scrollbar-thumb-top/);
    assert.doesNotMatch(globalCss, /--mobile-scrollbar-thumb-height/);
    assert.doesNotMatch(globalCss, /background-image:[\s\S]*?mobile-scroll-affordance/);
    assert.doesNotMatch(globalCss, /radial-gradient\(circle,[\s\S]*?mobile-scroll-affordance/);
  });

  it("hides desktop-only chrome on mobile without deleting it", () => {
    assert.match(shellSource, /desktop-top-chrome/);
    assert.match(shellSource, /desktop-map-legend/);
    assert.match(shellSource, /desktop-map-legend fixed bottom-10 right-6/);
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
