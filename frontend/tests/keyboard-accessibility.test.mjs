import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readShellSource } from "./helpers/shell-source.mjs";

const shellSource = readShellSource();
const stationSearchSource = readFileSync(new URL("../src/components/StationSearchPanel.tsx", import.meta.url), "utf8");
const lineLegendSource = readFileSync(new URL("../src/components/LineLegend.tsx", import.meta.url), "utf8");
const squishSwitchSource = readFileSync(new URL("../src/components/SquishSwitch.jsx", import.meta.url), "utf8");

describe("keyboard accessibility source", () => {
  it("lets SquishSwitch expose a role and checked state", () => {
    assert.match(squishSwitchSource, /role=\{role\}/);
    assert.match(squishSwitchSource, /aria-checked=\{on\}/);
    assert.match(squishSwitchSource, /ref=\{forwardedRef\}/);
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
    assert.match(shellSource, /<MobileStatusSheet[\s\S]*?onClose=\{handleClosePanel\}/);
  });
});
