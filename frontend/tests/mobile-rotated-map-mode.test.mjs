import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { clientPointToLogicalViewportPoint } from "../src/hooks/panZoomMath.ts";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const controlsSource = readFileSync(new URL("../src/components/MobileMapControls.tsx", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("../src/hooks/usePanZoom.ts", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const rotatedSelectionSource = readFileSync(new URL("../src/components/RotatedMapSelectionCard.tsx", import.meta.url), "utf8");
const exclaimAlertAsset = new URL("../public/assets/linewatch/exclaim-alert-white.svg", import.meta.url);

describe("mobile rotated map mode", () => {
  it("maps visual pointer coordinates into the logical landscape viewport", () => {
    const visualRect = { left: 0, top: 0, width: 390, height: 844 };

    assert.deepEqual(
      clientPointToLogicalViewportPoint(
        { x: 20, y: 300 },
        visualRect,
        "rotated-landscape",
      ),
      { x: 300, y: 370 },
    );

    assert.deepEqual(
      clientPointToLogicalViewportPoint(
        { x: 20, y: 300 },
        visualRect,
        "standard",
      ),
      { x: 20, y: 300 },
    );
  });

  it("adds shell-owned map presentation mode and rotated mode classes", () => {
    assert.match(controlsSource, /export type MapPresentationMode = "standard" \| "rotated-landscape"/);
    assert.match(shellSource, /mapPresentationMode/);
    assert.match(shellSource, /setMapPresentationMode\("rotated-landscape"\)/);
    assert.match(shellSource, /setMapPresentationMode\("standard"\)/);
    assert.match(shellSource, /mobile-map-rotated/);
    assert.match(shellSource, /mapPresentationMode === "standard"/);
    assert.match(shellSource, /mapPresentationMode === "rotated-landscape"/);
  });

  it("renders rotated map controls with explicit exit and center actions", () => {
    assert.match(shellSource, /MobileMapControls/);
    assert.match(shellSource, /Rotate map/);
    assert.match(controlsSource, /Exit/);
    assert.match(controlsSource, /Center/);
    assert.doesNotMatch(controlsSource, /Details/);
    assert.match(shellSource, /aria-label="Rotate map"/);
    assert.match(controlsSource, /aria-label="Exit rotated map"/);
    assert.match(controlsSource, /aria-label="Center map"/);
  });

  it("renders selected stations and impacts in a rotated in-map preview card", () => {
    assert.match(shellSource, /RotatedMapSelectionCard/);
    assert.match(shellSource, /rotated-map-hud/);
    assert.match(rotatedSelectionSource, /data-rotated-map-selection-card/);
    assert.match(rotatedSelectionSource, /Selected/);
    assert.match(rotatedSelectionSource, /Station/);
    assert.match(rotatedSelectionSource, /Service Impact/);
    assert.match(rotatedSelectionSource, /getSelectedImpactDetails/);
    assert.match(rotatedSelectionSource, /onOpenDetails/);
    assert.match(rotatedSelectionSource, /onClearSelection/);
    assert.match(globalCss, /\.rotated-map-hud/);
    assert.match(globalCss, /\.rotated-map-selection-card/);
  });

  it("shows a rotated overlap selection menu before choosing a specific overlapping impact", () => {
    assert.match(mapSource, /onSelectOverlap/);
    assert.match(mapSource, /selectOverlapBadge/);
    assert.match(shellSource, /overlapSelection/);
    assert.match(shellSource, /handleMapSelectOverlap/);
    assert.match(shellSource, /overlapSelection=\{overlapSelection\}/);
    assert.match(rotatedSelectionSource, /overlapSelection/);
    assert.match(rotatedSelectionSource, /data-selection-kind="overlap"/);
    assert.match(rotatedSelectionSource, /Choose Impact/);
    assert.match(rotatedSelectionSource, /onSelectImpact\(impact\.selection\)/);
  });

  it("flags station schedule disruption in the rotated station preview", () => {
    assert.match(rotatedSelectionSource, /Schedule May Be Disrupted/);
    assert.match(rotatedSelectionSource, /rotated-map-selection-disruption/);
    assert.match(rotatedSelectionSource, /src="\/assets\/linewatch\/exclaim-alert-white\.svg"/);
    assert.match(rotatedSelectionSource, /className="rotated-map-selection-disruption-alert-icon"/);
    assert.match(rotatedSelectionSource, /className="rotated-map-selection-impact-icons"/);
    assert.match(rotatedSelectionSource, /rotated-map-selection-impact-icons[\s\S]*ImpactTypeIcon kind=\{impact\.kind\}/);
    assert.match(rotatedSelectionSource, /stationImpacts\.length > 0/);
    assert.match(rotatedSelectionSource, /toTitleCase\(getImpactLabel\(impact\.kind\)\)/);
    assert.match(globalCss, /\.rotated-map-selection-disruption \{[\s\S]*color: #ffffff;/);
    assert.match(globalCss, /\.rotated-map-selection-impact-icons/);
    assert.match(globalCss, /\.rotated-map-selection-disruption/);
    assert.equal(existsSync(exclaimAlertAsset), true);
  });

  it("derives rotated station disruption from adjacent impacted map segments", () => {
    assert.match(rotatedSelectionSource, /function stationPreviewImpactsFor/);
    assert.match(rotatedSelectionSource, /data\.networkSegments/);
    assert.match(rotatedSelectionSource, /segment\.stationAId === selectedStationId/);
    assert.match(rotatedSelectionSource, /segment\.stationBId === selectedStationId/);
    assert.match(rotatedSelectionSource, /segment\.impacts \?\? \[\]/);
    assert.match(rotatedSelectionSource, /impact\.cardId/);
    assert.match(rotatedSelectionSource, /getSelectedImpactDetails\(\{ kind: impact\.kind, id: impact\.cardId \}/);
  });

  it("does not render portrait mobile detail surfaces while rotated mode is active", () => {
    assert.match(shellSource, /!rotatedMapMode && selectedStationId/);
    assert.match(shellSource, /mapPresentationMode === "standard"/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated \.station-detail-panel/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated \.mobile-impact-inspector/);
  });

  it("passes viewport orientation into the pan zoom hook without rotating map data", () => {
    assert.match(mapSource, /viewportOrientation/);
    assert.match(mapSource, /usePanZoom\(\{ reducedMotion, viewportOrientation \}\)/);
    assert.match(hookSource, /viewportOrientation = "standard"/);
    assert.match(hookSource, /clientPointToLogicalViewportPoint/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated > main/);
    assert.doesNotMatch(mapSource, /rotate\(90deg\).*ttc-svg-container/s);
  });
});
