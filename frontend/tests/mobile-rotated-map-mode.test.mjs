import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  clientPointToLogicalViewportPoint,
  clientRectToLogicalViewportBounds,
} from "../src/hooks/panZoomMath.ts";

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

  it("maps rotated HUD keepouts into the chooser's logical landscape coordinates", () => {
    const visualViewport = {
      left: 0,
      top: 0,
      right: 390,
      bottom: 844,
      width: 390,
      height: 844,
    };
    const visualHud = {
      left: 338,
      top: 10,
      right: 380,
      bottom: 834,
      width: 42,
      height: 824,
    };

    assert.deepEqual(
      clientRectToLogicalViewportBounds(visualHud, visualViewport, "rotated-landscape"),
      { x: 10, y: 10, width: 824, height: 42 },
    );
    assert.match(mapSource, /clientRectToLogicalViewportBounds\([\s\S]*?viewportOrientation/);
    assert.match(mapSource, /\.rotated-map-hud/);
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

  it("uses the same in-map overlap chooser in standard and rotated modes", () => {
    assert.match(mapSource, /data-overlap-chooser/);
    assert.match(mapSource, /Choose Alert/);
    assert.match(mapSource, /onSelectImpact\(\{ kind: impact\.kind, id: impact\.cardId \}\)/);
    assert.match(shellSource, /<InteractiveTtcMap[\s\S]*onSelectImpact=\{handleMapSelectImpact\}/);
    assert.doesNotMatch(shellSource, /onSelectOverlap=\{rotatedMapMode/);
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

  it("keeps rotated controls pinned while docking station previews below the map focus", () => {
    assert.match(shellSource, /rotatedMapSelectionHudClassName/);
    assert.match(shellSource, /rotated-map-selection-hud-station-selection/);
    assert.match(shellSource, /rotated-map-selection-hud-impact-selection/);
    assert.match(shellSource, /className="rotated-map-hud"/);
    assert.match(shellSource, /className=\{rotatedMapSelectionHudClassName\}/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated \.rotated-map-hud \{[\s\S]*top: max\(10px, var\(--mobile-safe-top\)\);/);
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-map-rotated \.rotated-map-selection-hud\.rotated-map-selection-hud-station-selection,\s*\.linewatch-shell\.mobile-map-rotated \.rotated-map-selection-hud\.rotated-map-selection-hud-impact-selection \{/,
    );
    assert.match(globalCss, /bottom: max\(10px, var\(--mobile-safe-bottom\)\);/);
    assert.match(globalCss, /top: auto;/);
    assert.doesNotMatch(globalCss, /\.rotated-map-hud\.rotated-map-hud-station-selection/);
  });

  it("anchors rotated Details actions bottom-right with a compact portrait cue", () => {
    assert.match(rotatedSelectionSource, /rotated-map-selection-card-with-action/);
    assert.match(rotatedSelectionSource, /rotated-map-selection-card-main/);
    assert.match(rotatedSelectionSource, /rotated-map-selection-action-column/);
    assert.match(rotatedSelectionSource, /rotated-map-selection-card-close/);
    assert.match(rotatedSelectionSource, /MoreDetailsIcon/);
    assert.match(rotatedSelectionSource, /PhoneRotateLandscapeIcon size=\{18\}/);
    assert.match(rotatedSelectionSource, /rotated-map-selection-portrait-cue/);
    assert.match(rotatedSelectionSource, /aria-label="Open details in portrait view"/);
    assert.doesNotMatch(rotatedSelectionSource, /data-portrait-reorientation-notice/);
    assert.doesNotMatch(rotatedSelectionSource, /Returns to portrait detail view/);
    assert.match(globalCss, /\.rotated-map-selection-card-with-action\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(112px, auto\);/);
    assert.match(globalCss, /\.rotated-map-selection-card-with-action\s*\{[\s\S]*position: relative;/);
    assert.match(globalCss, /\.rotated-map-selection-card-with-action \.rotated-map-selection-card-close\s*\{[\s\S]*position: absolute;/);
    assert.match(globalCss, /\.rotated-map-selection-card-with-action \.rotated-map-selection-card-close\s*\{[\s\S]*right: 10px;/);
    assert.match(globalCss, /\.rotated-map-selection-card-with-action \.rotated-map-selection-card-close\s*\{[\s\S]*top: 10px;/);
    assert.match(globalCss, /\.rotated-map-selection-action-column\s*\{[\s\S]*align-self: end;/);
    assert.match(globalCss, /\.rotated-map-selection-action-column\s*\{[\s\S]*justify-content: flex-end;/);
    assert.match(globalCss, /\.rotated-map-selection-action-column\s*\{[\s\S]*padding-top: 0;/);
    assert.match(globalCss, /\.rotated-map-selection-details-action\s*\{[\s\S]*position: relative;/);
    assert.match(globalCss, /\.rotated-map-selection-portrait-cue\s*\{[\s\S]*position: absolute;/);
    assert.match(globalCss, /\.rotated-map-selection-portrait-cue\s*\{[\s\S]*height: 28px;/);
    assert.match(globalCss, /\.rotated-map-selection-portrait-cue\s*\{[\s\S]*width: 28px;/);
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

  it("hides the portrait train toggle while rotated mode is active", () => {
    assert.match(shellSource, /!showClosedScreen && !rotatedMapMode && \(\s*<button[\s\S]*?className=\{`mobile-train-toggle/);
  });

  it("passes viewport orientation into the pan zoom hook without rotating map data", () => {
    assert.match(mapSource, /viewportOrientation/);
    assert.match(mapSource, /usePanZoom\(\{\s*reducedMotion,\s*viewportOrientation,\s*disableProgrammaticMotion:\s*mobilePerformanceMode,\s*\}\)/s);
    assert.match(hookSource, /viewportOrientation = "standard"/);
    assert.match(hookSource, /clientPointToLogicalViewportPoint/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated > main/);
    assert.doesNotMatch(mapSource, /rotate\(90deg\).*ttc-svg-container/s);
  });
});
