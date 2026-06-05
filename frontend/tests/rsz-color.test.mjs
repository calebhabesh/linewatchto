import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const rszPanelSource = readFileSync(new URL("../src/components/ReducedSpeedZonesPanel.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const legendSource = readFileSync(new URL("../src/components/LineLegend.tsx", import.meta.url), "utf8");
const stationDetailSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");

describe("Reduced Speed Zone mint color", () => {
  it("defines shared mint tokens and applies them to reduced-speed-zone selectors", () => {
    assert.match(globalCss, /--impact-rsz:\s*#A6FBB2;/);
    assert.match(globalCss, /--impact-rsz-ink:\s*#14532d;/);
    assert.match(globalCss, /\.asset-alert-path-glow\.reduced-speed-zone\s*\{[^}]*var\(--impact-rsz\)/s);
    assert.match(globalCss, /\.rsz-chevron\s*\{[^}]*stroke:\s*var\(--impact-rsz-ink\)/s);
    assert.match(globalCss, /\.overlap-indicator-badge\.reduced-speed-zone\s*\{[^}]*var\(--impact-rsz\)/s);
    assert.match(globalCss, /\.impact-type-icon\.reduced-speed-zone\s*\{[^}]*var\(--impact-rsz\)/s);
    assert.match(globalCss, /\.overlap-impact-ref\.reduced-speed-zone\s*\{[^}]*var\(--impact-rsz-border\)/s);
  });

  it("keeps delays amber while RSZ references use mint classes or tokens", () => {
    assert.match(globalCss, /\.overlap-indicator-badge\.delay\s*\{[^}]*#f59e0b/s);
    assert.match(mapSource, /RSZ_IMPACT_COLOR/);
    assert.match(rszPanelSource, /rsz-tone/);
    assert.match(shellSource, /rsz-tone/);
    assert.match(legendSource, /legend-rsz-button/);
    assert.match(stationDetailSource, /rsz-tone/);
    assert.doesNotMatch(rszPanelSource, /border-l-amber-500/);
    assert.doesNotMatch(rszPanelSource, /!bg-amber-50/);
  });
});
