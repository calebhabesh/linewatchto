import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("desktop status capsule", () => {
  it("extends the desktop time capsule with clickable impact chips and icons", () => {
    assert.match(shellSource, /desktop-status-stack/);
    assert.match(shellSource, /desktop-status-capsule/);
    assert.match(shellSource, /desktop-status-chip-row/);
    assert.match(shellSource, /desktop-status-chip desktop-status-chip--alerts/);
    assert.match(shellSource, /desktop-status-chip desktop-status-chip--delays/);
    assert.match(shellSource, /desktop-status-chip desktop-status-chip--reduced-speed-zone/);
    assert.match(shellSource, /desktop-status-chip desktop-status-chip--closures/);
    assert.match(shellSource, /AlertTriangle size=\{18\}/);
    assert.match(shellSource, /DelayIcon size=\{18\}/);
    assert.match(shellSource, /Construction size=\{18\}/);
    assert.match(shellSource, /Calendar size=\{18\}/);
    assert.match(shellSource, /Reduced Speed Zone/);
    assert.doesNotMatch(shellSource, /desktop-status-chip[\s\S]{0,800}>RSZ</);
  });

  it("places impact chips in the bottom-left corner of the viewport", () => {
    const searchBarIndex = shellSource.indexOf("stationSearchInputRef");
    const containerIndex = shellSource.indexOf('desktop-status-chip-row-container');
    const centeredCapsuleIndex = shellSource.indexOf("Floating Desktop Status Capsule");

    assert.notEqual(searchBarIndex, -1);
    assert.notEqual(containerIndex, -1);
    assert.notEqual(centeredCapsuleIndex, -1);
    assert.ok(searchBarIndex < containerIndex);
    assert.ok(centeredCapsuleIndex < containerIndex);
  });

  it("styles the desktop status capsule as a compact primary surface with search-adjacent chips", () => {
    assert.match(globalCss, /\.desktop-status-capsule-anchor/);
    assert.match(globalCss, /\.desktop-status-stack/);
    assert.match(globalCss, /\.desktop-status-stack\s*\{[\s\S]*align-items:\s*center/);
    assert.match(globalCss, /\.desktop-status-stack\s*\{[\s\S]*flex-direction:\s*column/);
    assert.match(globalCss, /\.desktop-status-capsule/);
    assert.match(globalCss, /\.desktop-status-capsule\s*\{[\s\S]*width:\s*max-content/);
    assert.match(globalCss, /\.desktop-status-primary-row/);
    assert.match(globalCss, /\.desktop-status-primary-row\s*\{[\s\S]*justify-content:\s*center/);
    assert.match(globalCss, /\.desktop-status-chip-row/);
    assert.match(globalCss, /\.desktop-header-impact-chips/);
    assert.match(globalCss, /\.desktop-status-chip--reduced-speed-zone/);
    assert.match(
      globalCss,
      /\.desktop-header-impact-chips \.desktop-status-chip-count\s*\{(?=[^}]*display:\s*inline-grid;)(?=[^}]*place-items:\s*center;)(?=[^}]*box-sizing:\s*border-box;)(?=[^}]*width:\s*32px;)(?=[^}]*height:\s*32px;)(?=[^}]*min-width:\s*32px;)(?=[^}]*font-family:\s*inherit;)(?=[^}]*font-variant-numeric:\s*tabular-nums;)[^}]*\}/s,
    );
    assert.doesNotMatch(globalCss, /\.desktop-header-impact-chips \.desktop-status-chip-count\s*\{[^}]*font-family:\s*Arial/s);
    assert.match(
      globalCss,
      /\.desktop-status-chip-count-value\s*\{(?=[^}]*display:\s*block;)(?=[^}]*line-height:\s*1;)(?=[^}]*transform:\s*translateY\(-0\.5px\);)[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.desktop-status-chip-count\[data-digit-count="multiple"\] \.desktop-status-chip-count-value\s*\{[^}]*transform:\s*translate\(-0\.75px, -0\.5px\);[^}]*\}/s,
    );
    assert.equal((shellSource.match(/data-digit-count=\{/g) ?? []).length, 4);
    assert.equal((shellSource.match(/desktop-status-chip-count-value/g) ?? []).length, 4);
  });

  it("keeps the desktop TTC map controls centered below the status capsule and regional controls on the right", () => {
    assert.match(mapSource, /desktop-map-control-rail/);
    assert.match(globalCss, /@media \(min-width:\s*1024px\)\s*\{[\s\S]*\.desktop-map-control-rail\s*\{[\s\S]*top:\s*96px\s*!important/);
    assert.match(globalCss, /\.regional-map-control-rail\s*\{[\s\S]*right:\s*24px\s*!important/);
  });
});
