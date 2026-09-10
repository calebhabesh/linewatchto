import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const networkMapLegendsSource = readFileSync(new URL("../src/components/NetworkMapLegends.tsx", import.meta.url), "utf8");
const bottomNavSource = readFileSync(new URL("../src/components/MobileBottomNav.tsx", import.meta.url), "utf8");
const statusPeekSource = readFileSync(new URL("../src/components/MobileStatusPeek.tsx", import.meta.url), "utf8");
const statusSheetSource = readFileSync(new URL("../src/components/MobileStatusSheet.tsx", import.meta.url), "utf8");
const networkPresentationSource = readFileSync(new URL("../src/app/network-presentation.ts", import.meta.url), "utf8");
const moreSheetSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
const backgroundPreferenceSource = readFileSync(new URL("../src/app/background-preference.ts", import.meta.url), "utf8");
const floatingPanelSource = readFileSync(new URL("../src/components/FloatingPanelShell.tsx", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const searchSource = readFileSync(new URL("../src/components/StationSearchPanel.tsx", import.meta.url), "utf8");
const savedCommutePickerSource = readFileSync(new URL("../src/components/SavedCommuteStationPicker.tsx", import.meta.url), "utf8");
const savedCommutePopoverSource = readFileSync(new URL("../src/components/commute-station-popover.ts", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

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
    assert.match(bottomNavSource, /Saved/);
    assert.doesNotMatch(bottomNavSource, /key: "search"/);
    assert.match(shellSource, /aria-label="Saved sections"/);
    assert.match(bottomNavSource, /More/);
  });

  it("keeps a compact status answer above mobile bottom navigation", () => {
    assert.match(statusPeekSource, /mobile-status-peek/);
    assert.match(statusPeekSource, /data-category-count=\{categoryCount\}/);
    assert.match(statusPeekSource, /\.filter\(\(count\) => count > 0\)\.length/);
    assert.match(statusPeekSource, /Reduced Speed Zones/);
    assert.match(statusPeekSource, /Trip Change/);
    assert.match(shellSource, /tripChangeCount=\{selectedNetwork === "regional" \? regionalTripChangeCount \?\? 0 : 0\}/);
    assert.match(statusPeekSource, /onOpenStatus/);
    assert.match(statusPeekSource, /onRecenter/);
    assert.match(statusPeekSource, /aria-label="Open current service status"/);
    assert.match(globalCss, /\.mobile-status-peek/);
    assert.match(globalCss, /--mobile-bottom-nav-height/);
    assert.match(globalCss, /\.mobile-status-peek-info-btn\s*\{[^}]*gap:\s*6px/s);
    assert.match(globalCss, /\.mobile-status-peek-alert-icon\s*\{[^}]*align-items:\s*center/s);
    assert.match(globalCss, /\.mobile-status-peek-source--updated\s*\{[^}]*margin-top:\s*0(?:px)?/s);
    assert.match(globalCss, /\.mobile-status-peek-info-btn\s*\{[^}]*backdrop-filter:\s*blur\((?:6|10|12|16)px\)/s);
    assert.match(globalCss, /\.mobile-status-peek-counts\s*\{[^}]*display:\s*grid/s);
    assert.match(globalCss, /\.mobile-status-peek-count-badge\s*\{[^}]*display:\s*flex/s);
    assert.match(globalCss, /\.mobile-map-recenter-btn\s*\{[^}]*width:\s*var\(--mobile-top-action-button-size\)/s);
    assert.match(globalCss, /\.mobile-map-zoom-capsule\s*\{[^}]*width:\s*var\(--mobile-top-action-button-size\)/s);
    assert.match(globalCss, /\.mobile-map-controls-group\s*\{[^}]*position:\s*fixed/s);
  });

  it("renders a mobile-specific status sheet that drills into existing alert categories", () => {
    assert.match(statusSheetSource, /System Status/);
    assert.match(statusSheetSource, /onOpenCategory/);
    assert.match(statusSheetSource, /"alerts"/);
    assert.match(statusSheetSource, /"delays"/);
    assert.match(statusSheetSource, /"reduced-speed-zones"/);
    assert.match(statusSheetSource, /"closures"/);
    assert.match(statusSheetSource, /clearServiceStatusLabel/);
    assert.match(networkPresentationSource, /Good Service/);
    assert.match(statusSheetSource, /useDashboardData/);
    assert.match(statusSheetSource, /<h3>Alerts<\/h3>/);
    assert.match(statusSheetSource, /<h3>Line Status<\/h3>/);
    assert.match(statusSheetSource, /lineClosures\.length === 1 \? "Planned Closure" : "Planned Closures"/);
    assert.match(statusSheetSource, /<h2[^>]*>System Status<\/h2>/);
    assert.match(statusSheetSource, /mobile-status-sheet-live-blip/);
    assert.match(globalCss, /\.mobile-sheet-heading h2\s*\{[^}]*font-size:\s*22px/s);
    assert.match(globalCss, /\.mobile-status-sheet-live-blip\s*\{[^}]*background:\s*#22c55e/s);
    assert.match(globalCss, /\.mobile-sheet-source--updated\s*\{[^}]*color:\s*#4ade80\s*!important/s);
    assert.match(globalCss, /\.mobile-status-section-heading\s*\{[^}]*align-items:\s*center;[^}]*display:\s*flex;[^}]*gap:\s*8px/s);
    assert.match(globalCss, /\.mobile-line-status-copy\s*\{[^}]*align-items:\s*center;[^}]*display:\s*flex;[^}]*flex-direction:\s*row;/s);
    assert.match(globalCss, /\.mobile-line-status-impacts\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/s);
    assert.match(globalCss, /\.mobile-line-status-impact-count\s*\{[^}]*margin-right:\s*3\.5px/s);
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
    assert.doesNotMatch(moreSheetSource, /mobile-more-accent-strip/);
    assert.match(globalCss, /\.floating-panel-scroll::before\s*\{[^}]*border-top:\s*5px solid transparent;/s);
    assert.match(moreSheetSource, /High Contrast Mode/);
    assert.match(moreSheetSource, /Reduced Motion/);
    assert.match(moreSheetSource, /BACKGROUND_PREFERENCE_LABEL/);
    assert.match(backgroundPreferenceSource, /BACKGROUND_PREFERENCE_LABEL = "Constellation Background"/);
    assert.match(moreSheetSource, /Reliability Analytics/);
    assert.match(moreSheetSource, /LogsDropdown/);
    assert.match(moreSheetSource, /Reset Local App Cache/);
    assert.match(moreSheetSource, /resetLineWatchLocalAppState/);
    assert.match(moreSheetSource, /process\.env\.NODE_ENV !== "production"/);
    assert.match(globalCss, /\.mobile-more-build-label/);
  });

  it("keeps desktop and mobile menu row typography uniform across links and buttons", () => {
    assert.match(
      globalCss,
      /\.desktop-top-chrome \[role="menuitem"\],\s*\.desktop-top-chrome \.main-menu-display-label\s*\{[^}]*font-family:\s*inherit;[^}]*font-size:\s*1rem;[^}]*font-weight:\s*500;[^}]*line-height:\s*1\.5rem;/s,
    );
    assert.match(
      globalCss,
      /\.mobile-more-row\s*\{[^}]*font-family:\s*inherit;[^}]*font-size:\s*14px;[^}]*font-weight:\s*500;[^}]*line-height:\s*1\.25rem;/s,
    );
    assert.equal((shellSource.match(/main-menu-display-label/g) ?? []).length, 3);
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
      moreSheetSource.indexOf("My Stations") < moreSheetSource.indexOf("Alert History"),
      "Alert History should appear after My Stations in Account.",
    );
    assert.ok(
      moreSheetSource.indexOf("Alert History") < moreSheetSource.indexOf("<h3>Notifications</h3>"),
      "Alert History should appear before Notifications.",
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
    assert.match(globalCss, /\.floating-panel-shell\[data-floating-panel="mobile-panel"\]\s*\.floating-panel-scroll\s*\{[^}]*background:\s*var\(--mobile-chrome-background\)/s);
    assert.match(globalCss, /\.mobile-legend-pill,[\s\S]*\.theme-toggle-btn,[\s\S]*\.rotate-map-btn,[\s\S]*\.site-guide-trigger\s*\{[^}]*background:\s*var\(--mobile-chrome-background\)\s*!important/s);
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
    assert.match(globalCss, /\.mobile-legend-pill--announcement\s*\{[\s\S]*top:\s*calc\(var\(--mobile-safe-top\)\s*\+\s*var\(--mobile-edge-inset\)\s*\+\s*var\(--mobile-announcement-top-offset\)\s*\+\s*var\(--mobile-announcement-chip-height\)/);
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
    assert.match(savedCommutePickerSource, /isVisualKeyboardOpen\(viewport, window\.innerHeight\)/);
    assert.match(savedCommutePickerSource, /calculateCommuteStationPopoverCoords/);
    assert.match(savedCommutePickerSource, /mobileInline\) return popover/);
    assert.match(savedCommutePickerSource, /data-mobile-inline=\{mobileInline \? "true" : "false"\}/);
    assert.match(savedCommutePickerSource, /calculateMobilePickerAlignmentScroll/);
    assert.match(savedCommutePickerSource, /picker\?\.closest<HTMLElement>\("\.commute-grid"\)/);
    assert.match(savedCommutePickerSource, /scrollArea\.scrollTop = targetScrollTop/);
    assert.match(savedCommutePickerSource, /setTimeout\(alignPickerToScrollTop, 80\)/);
    assert.match(savedCommutePickerSource, /setTimeout\(alignPickerToScrollTop, 240\)/);
    assert.doesNotMatch(savedCommutePickerSource, /visualViewport\?\.addEventListener\("scroll", scheduleAlignment\)/);
    assert.doesNotMatch(savedCommutePickerSource, /calculateMobileTriggerRevealScroll/);
    assert.match(savedCommutePickerSource, /inputFocused \|\| isVisualKeyboardOpen/);
    assert.match(savedCommutePickerSource, /mobileViewport\s*\? null\s*:\s*window\.setTimeout/);
    assert.match(savedCommutePopoverSource, /if \(mobile\)/);
    assert.match(savedCommutePopoverSource, /const top = trigger\.bottom \+ gap/);
    assert.match(savedCommutePopoverSource, /MOBILE_ACTIVE_BOTTOM_INSET = 16/);
    assert.match(savedCommutePopoverSource, /mobileSearchActive[\s\S]*viewportBottom - MOBILE_ACTIVE_BOTTOM_INSET/);
    assert.match(savedCommutePopoverSource, /mobileSearchActive[\s\S]*\? viewportLimit[\s\S]*Math\.min\(viewportLimit, containerLimit\)/);
    assert.doesNotMatch(savedCommutePopoverSource, /const containerBottom =/);
    assert.match(savedCommutePopoverSource, /placement:\s*"below"/);
    assert.match(savedCommutePickerSource, /position:\s*"fixed"/);
    assert.match(savedCommutePickerSource, /maxHeight:\s*`\$\{coords\.maxHeight\}px`/);
    assert.match(globalCss, /\.commute-station-search-row\s*\{[\s\S]*position:\s*sticky/);
    assert.match(globalCss, /\.commute-station-search-row\s*\{[\s\S]*top:\s*0/);
    assert.match(globalCss, /\.commute-station-popover > \.commute-station-options\s*\{[\s\S]*overflow-y:\s*auto/);
    assert.match(globalCss, /html\[data-visual-keyboard="open"\]\s+\.commute-station-popover > \.commute-station-options\s*\{[\s\S]*max-height:\s*none/);
    assert.match(globalCss, /\.commute-station-popover\[data-mobile-inline="true"\]\s*\{[\s\S]*position:\s*absolute\s*!important;[\s\S]*top:\s*calc\(100% \+ 6px\)\s*!important/);
    assert.doesNotMatch(globalCss, /\.commute-station-popover\[data-placement="viewport"\]/);
    assert.match(globalCss, /:has\(\.commute-station-popover\[data-input-focused="true"\]\)[\s\S]*\.floating-panel-shell/);
    assert.match(globalCss, /\.floating-panel-shell\[data-floating-panel="mobile-panel"\]:has\(\[data-active-view="commutes"\]\)\s*\{[\s\S]*height:\s*calc\(var\(--visual-viewport-height/);
    assert.match(globalCss, /\.mobile-view-content-wrapper\[data-active-view="commutes"\] \.commute-panel\s*\{[\s\S]*height:\s*100%\s*!important/);
    assert.match(globalCss, /\.mobile-view-content-wrapper\[data-active-view="commutes"\] \.commute-grid\s*\{[\s\S]*flex:\s*1 1 auto\s*!important;[\s\S]*min-height:\s*0\s*!important;[\s\S]*overflow-anchor:\s*none;[\s\S]*scroll-behavior:\s*auto\s*!important/);
  });

  it("uses touch scrolling with a compact mobile scrollbar thumb", () => {
    assert.doesNotMatch(globalCss, /:root\s*\{[^}]*\n\s*color-scheme:\s*dark;\n/);
    assert.match(globalCss, /:root\s*\{[\s\S]*?color-scheme:\s*light dark;/);
    assert.match(globalCss, /\.linewatch-shell\s*\{[\s\S]*?color-scheme:\s*light;/);
    assert.match(globalCss, /\.linewatch-shell\.dark\s*\{[\s\S]*?color-scheme:\s*dark;/);
    assert.match(globalCss, /--mobile-scroll-indicator-thumb:\s*#7d828c/);
    assert.match(globalCss, /\.linewatch-shell\.dark\s*\{[\s\S]*?--mobile-scroll-indicator-thumb:\s*#6e7789/);
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
    assert.match(shellSource, /<NetworkMap/);
    assert.match(networkMapLegendsSource, /desktop-map-legend absolute right-6/);
    assert.match(globalCss, /\.desktop-top-chrome/);
    assert.match(globalCss, /\.desktop-map-legend/);
  });

  it("ensures mobile submenu headers are below top URL bar and fit on a single line", () => {
    // Check chronological back navigation history state
    assert.match(shellSource, /viewHistoryRef/);
    assert.match(shellSource, /pushViewHistory/);
    assert.match(shellSource, /popViewHistory/);
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

  it("keeps a rotated preview HUD available for selected map items in both networks", () => {
    assert.match(shellSource, /RotatedMapSelectionCard/);
    assert.match(shellSource, /rotated-map-hud/);
    assert.match(shellSource, /rotatedSelectionVisible && !mobileInspectorOpen/);
    assert.match(globalCss, /\.rotated-map-selection-card/);
  });

  it("removes outlines around major containers on mobile while preserving high-contrast accessibility borders", () => {
    assert.match(globalCss, /--mobile-card-shadow:\s*0 2px 8px rgba\(0,\s*0,\s*0,\s*0\.32\);/);
    assert.match(globalCss, /\.mobile-bottom-nav\s*\{[^}]*border:\s*none;/s);
    assert.match(globalCss, /\.dark \.mobile-bottom-nav\s*\{[^}]*border:\s*none;/s);
    assert.match(globalCss, /\.high-contrast \.mobile-bottom-nav\s*\{[^}]*border:\s*1px solid #ffffff;/s);
    assert.match(globalCss, /\.mobile-status-peek\s*\{[^}]*border:\s*none/s);
    assert.match(globalCss, /\.high-contrast \.mobile-status-peek-count-badge,\s*\.linewatch-shell\.high-contrast \.mobile-status-peek-count-badge\s*\{[^}]*border:\s*1px solid #ffffff !important;/s);
    assert.match(globalCss, /\.floating-panel-scroll\s*\{[^}]*border:\s*none;[^}]*box-shadow:\s*0 -18px 44px rgba\(0,\s*0,\s*0,\s*0\.38\);/s);
    assert.match(globalCss, /\.station-detail-panel\s*\{[^}]*border:\s*none !important;/s);
    assert.match(globalCss, /\.high-contrast \.station-detail-panel,\s*\.linewatch-shell\.high-contrast \.station-detail-panel\s*\{[^}]*border:\s*1px solid #ffffff !important;/s);
    assert.match(globalCss, /\.alert-card,\s*\.closure-card,\s*\.compact-impact-list-item,\s*\.commute-card\s*\{[^}]*border-top-color:\s*transparent !important;[^}]*box-shadow:\s*var\(--mobile-card-shadow\);/s);
    assert.match(globalCss, /\.high-contrast \.alert-card,\s*\.linewatch-shell\.high-contrast \.alert-card,\s*\.high-contrast \.closure-card/s);
    assert.match(globalCss, /\.mobile-alert-history-shortcut,\s*\.mobile-my-stations-shortcut\s*\{[^}]*border:\s*none !important;/s);
    assert.match(globalCss, /\.high-contrast \.mobile-alert-history-shortcut,[\s\S]*?\.high-contrast \.mobile-my-stations-shortcut[\s\S]*?\{[^}]*border:\s*1px solid #ffffff !important;/s);
  });

  it("modernizes System Status and More menu containers without segmented outlines", () => {
    assert.match(globalCss, /\.mobile-status-actions button,[\s\S]*?\.mobile-line-status-row[\s\S]*?\{[\s\S]*?border:\s*none\s*!important;[\s\S]*?box-shadow:\s*var\(--mobile-card-shadow\);/);
    assert.match(globalCss, /\.mobile-status-btn-circle\s*\{[\s\S]*?border:\s*none\s*!important;/);
    assert.doesNotMatch(globalCss, /\.mobile-status-btn-circle\s*\{[^}]*border:\s*2px solid #000000/);
    assert.match(globalCss, /\.dark \.mobile-status-actions button\.mobile-status-btn-alerts\s*\{[\s\S]*?background:\s*#2d1414\s*!important;/);
    assert.match(globalCss, /\.mobile-more-row\s*\{[\s\S]*?border:\s*none\s*!important;[\s\S]*?border-radius:\s*12px;[\s\S]*?box-shadow:\s*var\(--mobile-card-shadow\);/);
    assert.match(globalCss, /\.high-contrast \.mobile-more-row[\s\S]*?\{[\s\S]*?border:\s*1px solid #ffffff/);
    assert.match(globalCss, /\.mobile-status-content-scroll\s*\{[\s\S]*?margin-top:\s*-12px\s*!important;[\s\S]*?padding-top:\s*12px\s*!important;/);
    assert.match(globalCss, /\.mobile-status-section-heading::before\s*\{[\s\S]*?height:\s*28px;/);
    assert.match(globalCss, /\.dark \.mobile-status-actions button\.mobile-status-btn-alerts \.mobile-status-btn-circle\[data-count="positive"\]/);
    assert.match(globalCss, /\.dark \.mobile-line-status-row[\s\S]*?inset 0 1px 0 rgba\(255,\s*255,\s*255,\s*0\.08\)/);

    // Increased text size in alert containers and line status names
    assert.match(globalCss, /\.mobile-status-btn-text\s*\{[\s\S]*?font-size:\s*13px;/);
    assert.match(globalCss, /\.mobile-line-status-copy strong\s*\{[\s\S]*?font-size:\s*15\.5px;/);
  });

  it("extends contemporary tactile container styling to desktop line status, menu, and chrome", () => {
    assert.match(shellSource, /desktop-line-status-row/);
    assert.match(shellSource, /desktop-menu-count-badge/);
    assert.match(globalCss, /\.desktop-line-status-row\s*\{[\s\S]*?box-shadow:\s*inset 0 1px 0 rgba\(255,\s*255,\s*255,\s*0\.85\)/);
    assert.match(globalCss, /\.dark \.desktop-line-status-row\s*\{[\s\S]*?box-shadow:\s*inset 0 1px 0 rgba\(255,\s*255,\s*255,\s*0\.08\)/);
    assert.match(globalCss, /\.desktop-menu-count-badge\s*\{[\s\S]*?box-shadow:\s*inset 0 1px 0 rgba\(255,\s*255,\s*255,\s*0\.15\);/);
    assert.match(globalCss, /@media \(min-width:\s*768px\)\s*\{[\s\S]*?\.dark \.floating-panel-scroll\s*\{[\s\S]*?inset 0 1px 0 rgba\(255,\s*255,\s*255,\s*0\.08\)/);
    assert.match(globalCss, /@media \(min-width:\s*768px\)\s*\{[\s\S]*?\.dark #linewatch-main-menu\s*\{[\s\S]*?inset 0 1px 0 rgba\(255,\s*255,\s*255,\s*0\.1\)/);
  });
});
