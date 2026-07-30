import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shell = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/MyStationsPanel.tsx", import.meta.url), "utf8");
const stationDetail = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");
const stationDetailHeader = readFileSync(new URL("../src/components/StationDetailHeader.tsx", import.meta.url), "utf8");
const stationSearch = readFileSync(new URL("../src/components/StationSearchPanel.tsx", import.meta.url), "utf8");
const mobileMore = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const transitLineBadge = readFileSync(new URL("../src/components/TransitLineBadge.tsx", import.meta.url), "utf8");

describe("My Stations UI", () => {
  it("adds an account-owned shell view with desktop and mobile navigation", () => {
    assert.match(shell, /"my-stations"/);
    assert.match(shell, /<MyStationsPanel/);
    assert.match(shell, /onClick=\{\(\) => navigateForward\("my-stations"\)\}/);
    assert.match(mobileMore, /My Commutes/);
    assert.match(mobileMore, /My Stations/);
    assert.ok(mobileMore.indexOf("My Commutes") < mobileMore.indexOf("My Stations"));
  });

  it("links successful save toasts and the mobile map shortcut to My Stations", () => {
    assert.match(shell, /station\.name\} added to/);
    assert.match(shell, /className="saved-station-notice-action"[\s\S]*My Stations/);
    assert.match(shell, /className="site-guide-network-stack"[\s\S]*className="mobile-network-selector-slot"[\s\S]*className="mobile-my-stations-shortcut md:hidden"/);
    assert.match(shell, /aria-label="Open My Stations"/);
    assert.match(shell, /navigateForward\("my-stations"\)/);
    assert.match(styles, /\.mobile-my-stations-shortcut\s*\{[\s\S]*width:\s*var\(--mobile-top-action-button-size\) !important;/);
    assert.match(styles, /\.saved-station-notice-action\s*\{/);
  });

  it("renders a signed-out account prompt blurb with feature benefits", () => {
    assert.match(panel, /!authenticated/);
    assert.match(panel, /Save Favorite Stations/);
    assert.match(panel, /Personal Station Watchlist/);
    assert.match(panel, /onRequestSignIn/);
    assert.match(panel, /onRequestCreateAccount/);
  });

  it("renders requested controls, empty states, mini picker, and undo", () => {
    assert.match(panel, /Search saved stations\.\.\./);
    assert.match(panel, /Add Station/);
    assert.match(panel, /All Lines/);
    assert.match(panel, /Needs Attention/);
    assert.match(panel, /No Saved Stations/);
    assert.match(panel, /No Saved Stations Match/);
    assert.match(panel, /Search All Stations\.\.\./);
    assert.match(panel, /My Stations<\/span>/);
    assert.doesNotMatch(panel, /mode === "add" \? "Add Station" : "My Stations"/);
    assert.match(panel, /my-stations-picker-section/);
    assert.match(panel, /pickerGroups\.map/);
    assert.match(panel, />Undo</);
    assert.match(panel, /my-stations-panel-empty/);
    assert.match(panel, /const compactEmpty = authenticated && mode === "list" && !loading && !error && savedStations\.length === 0;/);
    assert.match(panel, /savedStations\.length === 0 \? \([\s\S]*?No Saved Stations[\s\S]*?lastRemoved \? \(/);
    assert.doesNotMatch(panel, /savedStations\.length === 0 && !lastRemoved/);
    assert.match(styles, /\.my-stations-panel\.my-stations-panel-empty\s*\{[^}]*min-height:\s*0;/s);
    assert.match(styles, /\.my-stations-panel\s*\{[^}]*transition:\s*min-height 280ms cubic-bezier\(0\.16, 1, 0\.3, 1\);/s);
  });

  it("shows account-wide stations with network-qualified actions and filtering", () => {
    assert.match(panel, /type AccountNetworkFilter = "all" \| NetworkId/);
    assert.match(panel, /aria-label="Filter My Stations by network"/);
    assert.match(panel, /saved\.networkId === networkFilter/);
    assert.match(panel, /stationCatalogs\[networkId\]/);
    assert.match(panel, /dashboards\[saved\.networkId\]/);
    assert.match(panel, /`\$\{saved\.networkId\}:\$\{saved\.station\.id\}`/);
    assert.match(panel, /onSelectStation\(saved\.station\.id, saved\.networkId\)/);
    assert.match(panel, /account-network-badge/);
    assert.match(shell, /savedStations=\{savedStations\}/);
    assert.match(shell, /savedStationCount=\{savedStations\.length\}/);
  });

  it("animates add mode and nudges its shared submenu search field", () => {
    assert.match(panel, /my-stations-mode-action/);
    assert.match(panel, /my-stations-mode-action-content/);
    assert.match(panel, /picker-nudge/);
    assert.match(styles, /@keyframes my-stations-mode-swap/);
    assert.match(styles, /@keyframes my-stations-search-nudge/);
    assert.match(styles, /\.my-stations-done\s*\{[^}]*width:\s*54px !important;/s);
    assert.match(styles, /\.my-stations-add\s*\{[^}]*padding-left:\s*12px;[^}]*padding-right:\s*18px;[^}]*width:\s*110px;/s);
    assert.match(styles, /\.my-stations-done\s*\{[^}]*background:\s*rgb\(5, 150, 105\);/s);
    assert.match(styles, /\.my-stations-done:hover\s*\{[^}]*background:\s*rgb\(4, 120, 87\);/s);
    assert.match(styles, /@keyframes my-stations-search-nudge\s*\{[\s\S]*?21%, 63%/s);
    assert.match(styles, /\.submenu-search-input::placeholder\s*\{[^}]*font-size:\s*0\.78rem;[^}]*font-weight:\s*750;/s);
  });

  it("uses prominent line headers, opaque rows, and standalone bookmark controls", () => {
    assert.match(styles, /\.my-stations-picker-section-heading\s*\{[^}]*font-size:\s*14px;[^}]*min-height:\s*48px;/s);
    assert.match(styles, /\.dark \.my-stations-row,[\s\S]*?background-color:\s*rgb\(21, 24, 33\) !important;/s);
    assert.match(panel, /has-line-accent/);
    assert.match(panel, /borderLeftColor: group\.line\.color/);
    assert.match(panel, /<Bookmark size=\{28\} fill=\{saved \? "currentColor" : "none"\}/);
    assert.doesNotMatch(panel, /pending \? \(saved \? "Removing\.\.\."/);
    assert.match(styles, /\.my-stations-picker-action\s*\{[^}]*flex:\s*0 0 44px;[^}]*height:\s*44px;[^}]*min-height:\s*44px;[^}]*width:\s*44px;/s);
    assert.doesNotMatch(styles, /\.my-stations-picker-action\s*\{[^}]*(?:border|border-radius|background):/s);
    assert.match(styles, /\.my-stations-picker-row\s*\{[^}]*min-height:\s*0;/s);
    assert.match(styles, /\.my-stations-picker-section-heading\.has-line-accent\s*\{[^}]*border-left-width:\s*2px;/s);
  });

  it("enriches saved rows with condensed disruptions and source-labeled arrivals", () => {
    assert.match(panel, /getStationDetail/);
    assert.doesNotMatch(panel, /StationImpactBadge/);
    assert.doesNotMatch(styles, /\.my-stations-impact-badge/);
    assert.match(panel, /Active Disruptions/);
    assert.match(panel, /List View/);
    assert.match(panel, /Hide List/);
    assert.doesNotMatch(panel, />Condensed</);
    assert.match(panel, /saved-commute-impact-summary/);
    assert.match(panel, /saved-commute-impact-summary-chip/);
    assert.match(styles, /\.saved-station-disruption-chips > span\s*\{[^}]*border-radius:\s*6px;[^}]*font-size:\s*0\.78rem;[^}]*gap:\s*0\.35rem;[^}]*line-height:\s*1;[^}]*min-height:\s*29px;[^}]*padding:\s*0\.35rem 0\.65rem;/s);
    assert.match(panel, /SAVED_STATION_OUTAGE_ICON_SRC/);
    assert.match(panel, /\/assets\/linewatch\/outages\/elevator\.svg/);
    assert.match(panel, /\/assets\/linewatch\/outages\/escalator\.svg/);
    assert.match(panel, /saved-station-outage-icon-mark">×/);
    assert.match(styles, /\.saved-station-outage-icon-mark\s*\{[^}]*background:\s*rgb\(220, 38, 38\);[^}]*border-radius:\s*999px;/s);
    assert.match(panel, /saved-commute-impact-kind-label/);
    assert.match(panel, /className=\{`kind-\$\{disruptionKindClassName/);
    assert.match(panel, /disruptionKindCountLabel/);
    assert.match(panel, /stationImpactContext/);
    assert.match(panel, /Line \$\{match\.lineNumber\}: \$\{match\.location\}/);
    assert.match(panel, /Station: \$\{stationName\}/);
    assert.doesNotMatch(panel, /<span>\{impact\.title\}<\/span>/);
    assert.doesNotMatch(panel, /<small>\{impact\.summary\}<\/small>/);
    assert.doesNotMatch(panel, /<small>\{outage\.description\}<\/small>/);
    assert.match(panel, /saved-station-arrivals/);
    assert.match(panel, /formatArrivalSourceSummary/);
    assert.match(panel, /groupStationArrivals/);
    assert.match(panel, /getRegionalStationArrivals/);
    assert.match(panel, /groupRegionalStationArrivals/);
    assert.match(panel, /isRegionalArrivalDue/);
    assert.match(panel, /isRegionalArrivalSoon/);
    assert.match(panel, /getAccessibilityOutages\(undefined, \{ networkId: "regional" \}\)/);
    assert.match(panel, /regionalAccessibility\?\.fresh/);
    assert.match(panel, /regionalArrivalSnapshot\.source/);
    assert.match(panel, /Published regional schedule/);
    assert.doesNotMatch(panel, /unavailable in regional demo mode/);
    assert.match(panel, /shouldUseDetailedArrivalCountdown/);
    assert.match(panel, /detailedCountdown: detailed/);
    assert.match(panel, /formatCondensedArrivalDirection/);
    assert.match(panel, /saved-station-arrival-destination/);
    assert.match(panel, /<strong>Arrivals<\/strong>/);
    assert.match(panel, /isArrivalDue/);
    assert.match(panel, /is-due/);
    assert.match(panel, /is-soon/);
    assert.match(styles, /\.saved-station-rich-row/);
    assert.match(styles, /\.saved-station-rich-heading\s*\{[^}]*flex:\s*0 0 68px;[^}]*height:\s*68px;[^}]*min-height:\s*68px;/s);
    assert.match(panel, /saved-station-rich-row \$\{displayedDisruptionCount > 0 \? "is-affected" : "is-clear"\}/);
    assert.match(styles, /\.saved-station-rich-row\s*\{[^}]*border-width:\s*2px;/s);
    assert.match(styles, /\.saved-station-rich-row\.is-affected\s*\{[^}]*border-left:\s*3px solid var\(--warning\);/s);
    assert.match(styles, /\.saved-station-rich-row\.is-clear\s*\{[^}]*border-left:\s*3px solid var\(--ok\);/s);
    assert.match(styles, /\.saved-station-rich-heading \.my-stations-bookmark\s*\{[^}]*border-left-width:\s*2px;/s);
    assert.match(styles, /\.saved-station-rich-heading \.my-stations-row-main\s*\{[^}]*padding-block:\s*8px;/s);
    assert.match(styles, /\.saved-station-rich-heading \.my-stations-row-heading strong\s*\{[^}]*font-size:\s*25px;[^}]*font-weight:\s*750;[^}]*line-height:\s*1;/s);
    assert.match(panel, /<TransitLineBadge key=\{id\} lineId=\{id\} lineNumber=\{line\.number\} size=\{28\}/);
    assert.match(panel, /lineName=\{group\.line\?\.name\}[\s\S]*?size=\{27\}[\s\S]*?className="saved-station-arrival-line-badge"/);
    assert.match(styles, /@media \(max-width:\s*30rem\)[\s\S]*?\.saved-station-rich-heading \.my-stations-row-heading strong\s*\{[^}]*font-size:\s*18px;/s);
    assert.match(styles, /@media \(max-width:\s*30rem\)[\s\S]*?\.saved-station-rich-heading\s*\{[^}]*flex-basis:\s*auto;[^}]*height:\s*auto;/s);
    assert.match(styles, /\.saved-station-rich-heading \.my-stations-row-heading\s*\{[^}]*align-items:\s*center;[^}]*flex-wrap:\s*nowrap;[^}]*justify-content:\s*flex-start;/s);
    assert.match(styles, /\.saved-station-rich-heading \.my-stations-line-badges\s*\{[^}]*align-items:\s*center;[^}]*flex:\s*0 0 auto;/s);
    assert.doesNotMatch(styles, /\.saved-station-rich-heading \.my-stations-row-heading\s*\{[^}]*grid-template-columns:/s);
    assert.match(transitLineBadge, /\/assets\/linewatch\/\$\{assetId\}-legend\.svg\?v=3/);
    assert.match(styles, /\.saved-station-disruption-total\s*\{[^}]*height:\s*22px;[^}]*min-width:\s*22px;/s);
    assert.match(styles, /\.saved-station-arrival-groups/);
    assert.match(panel, /station-arrival-line-divider saved-station-section-divider/);
    assert.match(styles, /\.station-arrival-line-divider\s*\{[^}]*linear-gradient/s);
    assert.match(styles, /\.saved-station-section-divider\s*\{[^}]*height:\s*4px;[^}]*margin:\s*0 2px 5px;/s);
    assert.match(styles, /\.saved-station-arrivals\s*\{[^}]*background:\s*transparent;[^}]*border-radius:\s*0;[^}]*box-shadow:\s*none;/s);
    assert.match(styles, /\.saved-station-disruption-summary\s*\{[^}]*padding:\s*14px 8px;/s);
    assert.match(styles, /\.saved-station-arrival-source::after\s*\{[^}]*height:\s*18px/s);
    assert.match(styles, /\.saved-station-arrival-times strong\.is-due/);
    assert.match(styles, /\.saved-station-arrival-times strong\.is-soon/);
    assert.match(styles, /\.saved-station-arrival-group\s*\{[^}]*min-height:\s*44px/s);
    assert.match(styles, /\.saved-station-arrival-line-badge\s*\{[^}]*height:\s*24px !important;[^}]*width:\s*24px !important;/s);
    assert.match(styles, /@media \(min-width:\s*768px\)[\s\S]*?\.saved-station-arrival-group\s*\{[^}]*min-height:\s*52px/s);
    assert.match(styles, /@media \(min-width:\s*768px\)[\s\S]*?\.saved-station-arrival-line-badge\s*\{[^}]*height:\s*27px !important;[^}]*width:\s*27px !important;/s);
    assert.match(styles, /\.saved-commute-impact-disclosure\.saved-station-disruption-disclosure\s*\{[^}]*border:\s*0;[^}]*margin-top:\s*0;/s);
    assert.match(styles, /\.saved-station-rich-content\s*\{[^}]*padding:\s*0 12px 14px;/s);
    assert.match(styles, /\.saved-station-rich-content\s*\{[^}]*border-top:\s*2px solid/s);
    assert.doesNotMatch(styles, /\.saved-station-disruption-list\s*\{[^}]*border-top:/s);
  });

  it("labels saved-station navigation and disruption actions explicitly", () => {
    assert.match(panel, />Open Station</);
    assert.match(panel, /saved-station-open-action/);
    assert.doesNotMatch(panel, /> View on Map/);
    assert.match(panel, /> View Details/);
    assert.match(panel, /<FileText size=\{12\} aria-hidden="true" \/>/);
    assert.match(panel, /stationImpactSelection/);
    assert.match(panel, /if \(selection\) onSelectImpactDetails\(selection\)/);
    assert.match(panel, /aria-label=\{`View \$\{saved\.station\.name\} alert details`\}/);
    assert.match(panel, /onSelectAccessibilityOutageDetails\(outage\.assetType, saved\.station\.id\)/);
    assert.match(panel, /saved-commute-impact-map-button/);
    assert.match(shell, /onSelectImpactDetails=\{handleMyStationsSelectImpactDetails\}/);
    assert.match(shell, /onSelectAccessibilityOutageDetails=\{handleMyStationsSelectAccessibilityOutageDetails\}/);
    assert.match(shell, /navigateForward\(viewForImpactSelection\(nextSelection\)\)/);
    assert.match(shell, /initialTarget=\{accessibilityOutageTarget\}/);
    assert.match(shell, /navigateForward\("accessibility-outages"\)/);
    assert.match(shell, /expandedDisruptionStationIds=\{expandedMyStationDisruptionIds\}/);
    assert.match(panel, /open=\{disruptionExpanded\}/);
    assert.match(panel, /onToggle=\{\(event\) => onDisruptionExpandedChange\(event\.currentTarget\.open\)\}/);
    assert.doesNotMatch(panel, /<span>Station: \{saved\.station\.name\}<\/span>/);
  });

  it("keeps removal undo feedback inline at the deleted row position", () => {
    assert.match(panel, /lastRemoved\.index/);
    assert.match(panel, /saved-station-inline-undo/);
    assert.match(panel, /\{lastRemoved\.saved\.station\.name\} Removed/g);
    assert.doesNotMatch(panel, /\{lastRemoved\.saved\.station\.name\} removed/);
    assert.doesNotMatch(panel, /className="my-stations-undo"/);
    assert.doesNotMatch(panel, /saved-station-empty-after-removal/);
    assert.match(styles, /\.saved-station-inline-undo/);
    assert.doesNotMatch(styles, /\.saved-station-empty-after-removal/);
  });

  it("uses the same bookmark semantics in detail, search, and panel surfaces", () => {
    for (const source of [panel, stationDetailHeader, stationSearch]) {
      assert.match(source, /Bookmark/);
      assert.match(source, /aria-pressed/);
    }
    assert.match(stationDetail, /<StationDetailHeader/);
    assert.match(stationDetailHeader, /\{saved \? "Saved" : "Save"\}/);
    assert.match(stationSearch, /station-search-station-row/);
    assert.match(stationSearch, /station-search-bookmark/);
  });

  it("uses neutral menu icons and shared alert-panel heading typography", () => {
    assert.match(shell, /<Bookmark size=\{18\} className="text-slate-500 dark:text-slate-400" \/>/);
    assert.match(mobileMore, /<Bookmark size=\{18\} className="text-slate-500 dark:text-slate-400" \/>/);
    assert.match(panel, /<Bookmark[^>]+fill="none"/);
    assert.match(panel, /text-\[clamp\(10px,3\.5cqw,18px\)\] font-bold/);
    assert.match(panel, /flex items-center gap-1 sm:gap-3 whitespace-nowrap/);
    assert.match(panel, /my-stations-heading-actions[\s\S]*my-stations-count[\s\S]*my-stations-close/);
  });

  it("fills the submenu shell and uses compact history-sized controls", () => {
    assert.match(styles, /\.my-stations-panel\s*\{[^}]*width:\s*100%;/s);
    assert.match(styles, /\.my-stations-search\s*\{[^}]*height:\s*34px;[^}]*min-height:\s*34px;/s);
    assert.match(styles, /\.my-stations-add,[\s\S]*height:\s*34px;[\s\S]*min-height:\s*34px;/);
    assert.match(panel, /<ToolbarSelectMenu/);
    assert.doesNotMatch(panel, /<select/);
    assert.match(styles, /\.my-stations-selects\s*\{[^}]*display:\s*flex;/s);
    assert.match(styles, /@media \(max-width: 767px\)[\s\S]*\.my-stations-add-wide\s*\{[^}]*display:\s*inline;/s);
  });

  it("keeps the mobile title descender visible and the picker scrollbar clear of rows", () => {
    assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.my-stations-title h2 > span\s*\{[^}]*line-height:\s*1\.2 !important;/s);
    assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.my-stations-list\s*\{[^}]*padding-right:\s*8px;/s);
    assert.match(styles, /\.my-stations-list::-webkit-scrollbar\s*\{[\s\S]*?width:\s*4px/);
    assert.match(styles, /\.my-stations-list::-webkit-scrollbar-thumb\s*\{[\s\S]*?background:\s*var\(--mobile-scroll-indicator-thumb\)/);
  });

  it("places the uppercase save label inside the station bookmark button", () => {
    assert.match(stationDetailHeader, /<Bookmark[\s\S]*<span>\{saved \? "Saved" : "Save"\}<\/span>[\s\S]*<\/button>/);
    assert.match(styles, /\.station-detail-save-control button\s*\{[^}]*gap:\s*4px;/s);
    assert.match(styles, /\.station-detail-save-control button > span\s*\{[^}]*text-transform:\s*uppercase;/s);
  });

  it("keeps fixed touch targets and high-contrast bookmark treatment", () => {
    assert.match(styles, /\.my-stations-picker-action[\s\S]*min-height: 44px/);
    assert.match(styles, /\.station-search-bookmark[\s\S]*min-height: 44px/);
    assert.match(styles, /\.station-detail-save-control button,[\s\S]*height: 44px/);
    assert.match(styles, /\.high-contrast \.my-stations-bookmark/);
  });

  it("fades transient station and commute save confirmations before removal", () => {
    assert.match(styles, /@keyframes linewatch-toast-lifecycle[\s\S]*100%\s*\{[^}]*opacity:\s*0;/s);
    assert.match(styles, /\.saved-station-global-notice\s*\{[^}]*animation:\s*linewatch-toast-lifecycle 3s/s);
    assert.match(styles, /\.commute-toast-success\s*\{[^}]*animation:\s*linewatch-toast-lifecycle 3s/s);
    assert.match(shell, /key=\{savedStationNoticeKey\}/);
  });
});
