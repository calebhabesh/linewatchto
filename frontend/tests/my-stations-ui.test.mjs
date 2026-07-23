import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shell = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/MyStationsPanel.tsx", import.meta.url), "utf8");
const stationDetail = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");
const stationSearch = readFileSync(new URL("../src/components/StationSearchPanel.tsx", import.meta.url), "utf8");
const mobileMore = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("My Stations UI", () => {
  it("adds an account-owned shell view with desktop and mobile navigation", () => {
    assert.match(shell, /"my-stations"/);
    assert.match(shell, /<MyStationsPanel/);
    assert.match(shell, /onClick=\{\(\) => setActiveView\("my-stations"\)\}/);
    assert.match(mobileMore, /Saved Commutes/);
    assert.match(mobileMore, /My Stations/);
    assert.ok(mobileMore.indexOf("Saved Commutes") < mobileMore.indexOf("My Stations"));
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
    assert.match(styles, /\.my-stations-panel\.my-stations-panel-empty\s*\{[^}]*min-height:\s*0;/s);
  });

  it("animates add mode and nudges its shared submenu search field", () => {
    assert.match(panel, /my-stations-mode-action/);
    assert.match(panel, /my-stations-mode-action-content/);
    assert.match(panel, /picker-nudge/);
    assert.match(styles, /@keyframes my-stations-mode-swap/);
    assert.match(styles, /@keyframes my-stations-search-nudge/);
    assert.match(styles, /\.my-stations-done\s*\{[^}]*width:\s*54px !important;/s);
    assert.match(styles, /@keyframes my-stations-search-nudge\s*\{[\s\S]*?21%, 63%/s);
    assert.match(styles, /\.submenu-search-input::placeholder\s*\{[^}]*font-size:\s*0\.78rem;[^}]*font-weight:\s*750;/s);
  });

  it("uses prominent line headers, opaque rows, and Save bookmark controls", () => {
    assert.match(styles, /\.my-stations-picker-section-heading\s*\{[^}]*font-size:\s*14px;[^}]*min-height:\s*48px;/s);
    assert.match(styles, /\.dark \.my-stations-row,[\s\S]*?background-color:\s*rgb\(21, 24, 33\) !important;/s);
    assert.match(panel, /has-line-accent/);
    assert.match(panel, /borderLeftColor: group\.line\.color/);
    assert.match(panel, /<Bookmark size=\{24\}/);
    assert.match(panel, /saved \? "Saved" : "Save"/);
    assert.match(styles, /\.my-stations-picker-action\s*\{[^}]*border:\s*1\.5px[^}]*flex:\s*0 0 64px;[^}]*height:\s*64px;[^}]*min-height:\s*64px;[^}]*text-transform:\s*uppercase;[^}]*width:\s*64px;/s);
  });

  it("uses the same bookmark semantics in detail, search, and panel surfaces", () => {
    for (const source of [panel, stationDetail, stationSearch]) {
      assert.match(source, /Bookmark/);
      assert.match(source, /aria-pressed/);
    }
    assert.match(stationDetail, /\{saved \? "Saved" : "Save"\}/);
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

  it("places the uppercase save label inside the station bookmark button", () => {
    assert.match(stationDetail, /<Bookmark[\s\S]*<span>\{saved \? "Saved" : "Save"\}<\/span>[\s\S]*<\/button>/);
    assert.match(styles, /\.station-detail-save-control button > span\s*\{[^}]*text-transform:\s*uppercase;/s);
  });

  it("keeps fixed touch targets and high-contrast bookmark treatment", () => {
    assert.match(styles, /\.my-stations-picker-action[\s\S]*min-height: 64px/);
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
