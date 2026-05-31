import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const interactiveMapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const lineStatusSource = readFileSync(new URL("../src/components/LineStatusPanel.tsx", import.meta.url), "utf8");
const activeAlertsSource = readFileSync(new URL("../src/components/ActiveAlertsPanel.tsx", import.meta.url), "utf8");
const plannedClosuresSource = readFileSync(new URL("../src/components/PlannedClosuresPanel.tsx", import.meta.url), "utf8");
const savedCommutesSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const reliabilitySource = readFileSync(new URL("../src/components/ReliabilityPanel.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("drawer layout", () => {
  it("uses a wider desktop sidebar that can collapse back to the full map", () => {
    assert.match(shellSource, /sidebarCollapsed/);
    assert.match(shellSource, /mapLayoutSignal/);
    assert.match(interactiveMapSource, /layoutResetSignal/);
    assert.match(interactiveMapSource, /setTimeout\(\(\) => recenter\(\), 320\)/);
    assert.match(shellSource, /lg:w-\[520px\]/);
    assert.match(shellSource, /lg:translate-x-0/);
    assert.match(shellSource, /lg:left-\[520px\]/);
    assert.match(shellSource, /lg:left-0/);
    assert.match(shellSource, /Collapse status sidebar/);
    assert.match(shellSource, /Open status sidebar/);
  });

  it("allows alert and planned closure copy to wrap instead of collapsing into narrow columns", () => {
    assert.match(activeAlertsSource, /min-w-0/);
    assert.match(activeAlertsSource, /whitespace-normal/);
    assert.match(activeAlertsSource, /break-words/);
    assert.match(plannedClosuresSource, /min-w-0/);
    assert.match(plannedClosuresSource, /whitespace-normal/);
    assert.match(plannedClosuresSource, /break-words/);
    assert.doesNotMatch(globalCss, /\.alert-card\s*\{[^}]*display:\s*grid/s);
  });

  it("keeps drawer-only panels single-column even at desktop viewport widths", () => {
    assert.match(lineStatusSource, /flex-wrap/);
    assert.match(lineStatusSource, /min-w-0/);
    assert.match(savedCommutesSource, /grid-cols-1/);
    assert.match(savedCommutesSource, /flex-wrap/);
    assert.doesNotMatch(savedCommutesSource, /md:grid-cols-3/);
    assert.doesNotMatch(globalCss, /\.commute-grid\s*\{[^}]*repeat\(3/s);
    assert.match(reliabilitySource, /flex-col/);
    assert.doesNotMatch(reliabilitySource, /sm:flex-row/);
    assert.doesNotMatch(reliabilitySource, /sm:grid-cols-2/);
    assert.doesNotMatch(globalCss, /\.reliability-row\s*\{[^}]*display:\s*grid/s);
    assert.doesNotMatch(globalCss, /\.health-grid\s*\{[^}]*repeat\(2/s);
    assert.doesNotMatch(globalCss, /\.commute-card span,/);
  });

  it("keeps drawer scrollbars visually quiet", () => {
    assert.match(globalCss, /scrollbar-width:\s*thin/);
    assert.match(globalCss, /scrollbar-color:\s*rgba\(148, 163, 184, 0\.28\) transparent/);
    assert.match(globalCss, /::-webkit-scrollbar-thumb/);
    assert.match(globalCss, /background:\s*rgba\(148, 163, 184, 0\.24\)/);
  });
});
