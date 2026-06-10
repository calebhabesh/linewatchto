import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const inspectorSource = readFileSync(new URL("../src/components/MobileImpactInspector.tsx", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("mobile Show on Map inspector", () => {
  it("adds explicit mobile inspector state in the shell", () => {
    assert.match(shellSource, /MobileImpactInspector,\s*type MobileInspectorDetent/);
    assert.match(inspectorSource, /export type MobileInspectorDetent = "map-focus" \| "details-focus"/);
    assert.match(shellSource, /mobileInspectorDetent/);
    assert.match(shellSource, /setMobileInspectorDetent\("map-focus"\)/);
    assert.match(shellSource, /setMobileInspectorDetent\("details-focus"\)/);
    assert.match(shellSource, /mobileImpactInspectorOpen/);
    assert.match(shellSource, /mobileStationInspectorOpen/);
    assert.match(shellSource, /mobileInspectorOpen/);
    assert.match(shellSource, /mobile-map-inspector/);
    assert.match(shellSource, /mobile-map-inspector-impact/);
    assert.match(shellSource, /mobile-map-inspector-station/);
  });

  it("renders the selected impact in a mobile-only inspector instead of a tiny peek", () => {
    assert.match(shellSource, /MobileImpactInspector/);
    assert.match(shellSource, /onViewFullDetails=\{\(\) => setActiveView\(viewForImpactSelection\(selection\)\)\}/);
    assert.match(inspectorSource, /data-mobile-impact-inspector/);
    assert.match(inspectorSource, /aria-label="Selected map impact details"/);
    assert.match(inspectorSource, /getSelectedImpactDetails/);
    assert.match(inspectorSource, /View Full Details/);
    assert.match(inspectorSource, /Show more details/);
    assert.match(inspectorSource, /Show more map/);
    assert.match(inspectorSource, /Overlapping:/);
    assert.match(inspectorSource, /MetadataGrid/);
    assert.match(inspectorSource, /ImpactRouteHeader/);
  });

  it("resizes the actual mobile map viewport while preserving focused selection", () => {
    assert.match(shellSource, /mapLayoutSignal/);
    assert.match(shellSource, /layoutResetSignal=\{mapLayoutSignal\}/);
    assert.match(mapSource, /lastFocusLayoutSignalRef/);
    assert.match(mapSource, /layoutResetSignal \?\? 0/);
    assert.match(mapSource, /lastFocusLayoutSignalRef\.current === currentLayoutSignal/);
    assert.match(mapSource, /focusTargetKey/);
  });

  it("defines mobile split-view CSS for impact and station inspectors", () => {
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector/);
    assert.match(globalCss, /--mobile-inspector-height/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector > main/);
    assert.match(globalCss, /\.mobile-impact-inspector/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector-station \.station-detail-panel/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector \.mobile-bottom-nav/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector \.mobile-status-peek/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector \.mobile-legend-pill/);
  });
});
