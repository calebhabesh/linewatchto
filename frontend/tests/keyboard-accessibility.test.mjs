import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const stationSearchSource = readFileSync(new URL("../src/components/StationSearchPanel.tsx", import.meta.url), "utf8");
const lineLegendSource = readFileSync(new URL("../src/components/LineLegend.tsx", import.meta.url), "utf8");

describe("keyboard accessibility source", () => {
  it("manages hamburger menu focus and arrow-key movement", () => {
    assert.match(shellSource, /menuButtonRef/);
    assert.match(shellSource, /menuPanelRef/);
    assert.match(shellSource, /menuActionRefs/);
    assert.match(shellSource, /aria-controls="linewatch-main-menu"/);
    assert.match(shellSource, /aria-expanded=\{menuVisible\}/);
    assert.match(shellSource, /aria-label=\{menuPinned \? "Unpin main menu" : "Pin main menu open"\}/);
    assert.match(shellSource, /localStorage\.getItem\("linewatch-menu-pinned"\)/);
    assert.match(shellSource, /localStorage\.setItem\("linewatch-menu-pinned", String\(menuPinned\)\)/);
    assert.match(shellSource, /handleMenuKeyDown/);
    assert.match(shellSource, /event\.key === "Escape"/);
    assert.match(shellSource, /event\.key === "ArrowDown"/);
    assert.match(shellSource, /event\.key === "ArrowUp"/);
    assert.match(shellSource, /event\.key === "Home"/);
    assert.match(shellSource, /event\.key === "End"/);
    assert.match(shellSource, /aria-current=\{activeView === "alerts" \? "page" : undefined\}/);
    assert.match(shellSource, /aria-checked=\{highContrast\}/);
    assert.match(shellSource, /aria-checked=\{reducedMotion\}/);
  });

  it("keeps station search and legend controls explicitly keyboard accessible", () => {
    assert.match(stationSearchSource, /handleInputKeyDown/);
    assert.match(stationSearchSource, /focusItem/);
    assert.match(stationSearchSource, /ArrowDown/);
    assert.match(stationSearchSource, /ArrowUp/);
    assert.match(lineLegendSource, /aria-label=\{`View reduced speed zone for \$\{line\.name\}`\}/);
  });

  it("returns focus from station search and supports result cycling", () => {
    assert.match(shellSource, /stationSearchInputRef/);
    assert.match(shellSource, /aria-controls="station-search-panel"/);
    assert.match(shellSource, /onClosedFocusTarget/);
    assert.match(stationSearchSource, /resultButtonRefs/);
    assert.match(stationSearchSource, /lineTriggerRefs/);
    assert.match(stationSearchSource, /stationButtonRefs/);
    assert.match(stationSearchSource, /handleResultKeyDown/);
    assert.match(stationSearchSource, /handleLineTriggerKeyDown/);
    assert.match(stationSearchSource, /handleStationButtonKeyDown/);
  });

  it("keeps mobile navigation and sheets keyboard accessible", () => {
    assert.match(shellSource, /MobileBottomNav/);
    assert.match(shellSource, /aria-label="Primary mobile navigation"/);
    assert.match(shellSource, /onMobileNavSelect/);
    assert.match(shellSource, /handleMobileSheetClose/);
  });
});
