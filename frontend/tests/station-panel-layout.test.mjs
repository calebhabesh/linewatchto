import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const panelSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("station detail panel layout", () => {
  it("uses a right dock on desktop and a bottom sheet on mobile", () => {
    assert.match(panelSource, /station-detail-panel/);
    assert.match(panelSource, /md:right-6/);
    assert.match(panelSource, /md:top-\[104px\]/);
    assert.match(panelSource, /bottom-0/);
    assert.match(panelSource, /rounded-t-lg/);
  });

  it("renders schedule-aware arrivals and disruption warning", () => {
    assert.match(panelSource, /Schedule may be disrupted/);
    assert.match(panelSource, /data-arrivals-disrupted/);
    assert.match(panelSource, /arrivalContext\.scheduleMayBeDisrupted/);
    assert.match(panelSource, /Line \{arrivalLine\?\.number/);
  });

  it("defines station marker and reduced motion styles", () => {
    assert.match(globalCss, /\.station-hit-target/);
    assert.match(globalCss, /\.station-hit-target\.selected/);
    assert.match(globalCss, /prefers-reduced-motion:\s*reduce/);
  });

  it("keeps the station panel constrained and touch friendly", () => {
    assert.match(panelSource, /max-h-\[64vh\]/);
    assert.match(panelSource, /h-11 w-11/);
    assert.match(panelSource, /overflow-y-auto/);
    assert.doesNotMatch(panelSource, /backdrop-blur/);
  });

  it("renders authored accessibility icons with accessible warning state labels", () => {
    assert.match(panelSource, /wheel-chair-symbol\.svg/);
    assert.match(panelSource, /elevator-icon\.svg/);
    assert.match(panelSource, /Wheelchair accessible/);
    assert.match(panelSource, /Elevator available/);
    assert.match(panelSource, /data-facility-warning/);
    assert.match(panelSource, /formatRelativeImpactTime/);
  });

  it("renders source-linked detail buttons for typed station impacts only", () => {
    assert.match(panelSource, /getStationImpactDetailsTarget/);
    assert.match(panelSource, /sourceAlertIds\?\.includes\(impact\.id\)/);
    assert.match(panelSource, /detailsTarget && onSelectImpact/);
    assert.match(panelSource, /onSelectImpact\(detailsTarget\.selection\)/);
    assert.match(panelSource, /Open \$\{detailsTarget\.label\} details/);
    assert.match(panelSource, /<StationImpactDetailsIcon kind=\{detailsTarget\.selection\.kind\}/);
    assert.match(panelSource, /View Details/);
  });
});
