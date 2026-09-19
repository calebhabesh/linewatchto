import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  cameraFromOrientedTransformMatrix,
  clientPointToLogicalViewportPoint,
  clientRectToLogicalViewportBounds,
  logicalViewportSizeForOrientation,
  orientedMapCameraTransform,
} from "../src/hooks/panZoomMath.ts";
import { computeRotatedScrollDelta } from "../src/hooks/useRotatedListDragScroll.ts";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const controlsSource = readFileSync(new URL("../src/components/MobileMapControls.tsx", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const chooserKeepoutsSource = readFileSync(new URL("../src/components/map-chooser-keepouts.ts", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("../src/hooks/usePanZoom.ts", import.meta.url), "utf8");
const globalCss = readAppStylesheet();
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
    assert.match(chooserKeepoutsSource, /\.rotated-map-hud/);
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

  it("flattens rotated orientation into the map camera instead of nesting the map in a rotated compositor", () => {
    assert.match(shellSource, /const \[rotatedMapViewportFrame, setRotatedMapViewportFrame\]/);
    assert.match(shellSource, /visualViewport\?\.width \?\? window\.innerWidth/);
    assert.match(shellSource, /visualViewport\?\.height \?\? window\.innerHeight/);
    assert.match(shellSource, /--rotated-map-viewport-width/);
    assert.match(shellSource, /--rotated-map-viewport-height/);
    assert.match(shellSource, /mobileMapPerformanceMode = mobilePerformanceMode \|\| rotatedMapMode/);
    assert.match(shellSource, /mobilePerformanceMode=\{mobileMapPerformanceMode\}/);
    assert.deepEqual(
      logicalViewportSizeForOrientation(390, 844, "rotated-landscape"),
      { width: 844, height: 390 },
    );
    assert.equal(
      orientedMapCameraTransform(
        { x: 12, y: 34, scale: 2 },
        "rotated-landscape",
        390,
      ),
      "translate(390px, 0px) rotate(90deg) translate(12px, 34px) scale(2)",
    );
    assert.deepEqual(
      cameraFromOrientedTransformMatrix(
        { a: 0, b: 2, e: 356, f: 12 },
        "rotated-landscape",
        390,
      ),
      { x: 12, y: 34, scale: 2 },
    );
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-map-rotated > main\s*\{(?=[^}]*contain:\s*layout paint size;)(?=[^}]*transform:\s*none;)[^}]*\}/s,
    );
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated \.rotated-map-ui-surface\s*\{[^}]*transform:\s*translate\(-50%, -50%\) rotate\(90deg\);/s);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode :is\(\.ttc-map-stage, \.regional-map-stage\) \.raster-map-plane\s*\{[^}]*backface-visibility:\s*visible;[^}]*transform:\s*none;/s);
    assert.match(shellSource, /className="rotated-map-ui-surface"/);
    assert.doesNotMatch(globalCss, /\.linewatch-shell\.mobile-map-rotated > main\s*\{[^}]*rotate\(90deg\)/s);
    assert.match(hookSource, /orientedMapCameraTransform/);
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
    assert.match(shellSource, /<NetworkMap[\s\S]*onSelectImpact=\{handleMapSelectImpact\}/);
    assert.doesNotMatch(shellSource, /onSelectOverlap=\{rotatedMapMode/);
  });

  it("enables touch drag-scrolling for rotated overlap choosers", () => {
    assert.equal(computeRotatedScrollDelta(20, 5), 20);
    assert.equal(computeRotatedScrollDelta(-20, 5), -20);
    assert.equal(computeRotatedScrollDelta(5, -20), 20);
    assert.equal(computeRotatedScrollDelta(5, 20), -20);
    assert.match(mapSource, /useRotatedListDragScroll/);
    assert.match(mapSource, /<div className="overlap-chooser-list" \{\.\.\.scrollContainerProps\}/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated \.overlap-chooser-list\s*\{[^}]*touch-action:\s*none;/s);
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
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated \.rotated-map-hud \{[\s\S]*top: max\(10px, var\(--rotated-map-safe-top\)\);/);
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-map-rotated \.rotated-map-selection-hud\.rotated-map-selection-hud-station-selection,\s*\.linewatch-shell\.mobile-map-rotated \.rotated-map-selection-hud\.rotated-map-selection-hud-impact-selection \{/,
    );
    assert.match(globalCss, /bottom: max\(10px, var\(--rotated-map-safe-bottom\)\);/);
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
    assert.match(
      globalCss,
      /\.mobile-sheet-icon-button,\s*\.mobile-impact-inspector-icon-button,\s*\.rotated-map-selection-icon-button,\s*\.panel-header-btn\s*\{[^}]*border:\s*none;[^}]*border-radius:\s*8px;/s,
    );
    assert.match(
      globalCss,
      /\.dark \.mobile-sheet-icon-button,\s*\.dark \.mobile-impact-inspector-icon-button,\s*\.dark \.rotated-map-selection-icon-button,\s*\.dark \.panel-header-btn\s*\{[^}]*background:\s*#161a23;/s,
    );
    assert.doesNotMatch(
      globalCss,
      /\.rotated-map-selection-icon-button\s*\{[^}]*border:\s*1px solid/s,
    );
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

  it("hides portrait detail panels for both TTC and GO/UP regional mode while rotated mode is active", () => {
    assert.match(shellSource, /!showClosedScreen && !rotatedMapMode && selectedNetwork === "ttc" && selectedStationId/);
    assert.match(shellSource, /!showClosedScreen && !rotatedMapMode && selectedNetwork === "regional" && selectedStationId/);
    assert.match(shellSource, /rotatedSelectionVisible && !mobileInspectorOpen/);
    assert.doesNotMatch(shellSource, /mapPresentationMode === "standard" \|\| selectedNetwork === "regional"/);
  });

  it("hides the portrait train toggle while rotated mode is active", () => {
    assert.match(shellSource, /!showClosedScreen && !rotatedMapMode && \(\s*<div className="mobile-train-left-cluster md:hidden"[\s\S]*?className=\{`mobile-train-toggle/);
  });

  it("passes viewport orientation into the pan zoom hook without rotating map data", () => {
    assert.match(mapSource, /viewportOrientation/);
    assert.match(mapSource, /usePanZoom\(\{\s*persistenceKey: "ttc",\s*persistenceBlocked: Boolean\(selection \|\| selectedStationId \|\| commutePathPreview\),\s*reducedMotion,\s*viewportOrientation,\s*disableProgrammaticMotion:\s*mobilePerformanceMode,\s*defaultFrame:\s*defaultMapFrame,\s*animateInitialEntrance,\s*\}\)/s);
    assert.match(hookSource, /viewportOrientation = "standard"/);
    assert.match(hookSource, /clientPointToLogicalViewportPoint/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated > main/);
    assert.doesNotMatch(mapSource, /rotate\(90deg\).*ttc-svg-container/s);
  });
});
