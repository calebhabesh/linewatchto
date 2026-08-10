import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  clampPanZoomScale,
  computeBoundedMapFrame,
  computeFittedCameraFlyInStart,
  computeMapFitScale,
  computeInsetViewportFocus,
  distanceBetweenPoints,
  exceedsMapTapMovement,
  mapPointFromViewportPoint,
  midpointBetweenPoints,
  PAN_ZOOM_MAX_RELATIVE_SCALE,
  snapToDevicePixel,
  snapTransformToDevicePixels,
  transformForMapPointAtViewportPoint,
} from "../src/hooks/panZoomMath.ts";

const hookSource = readFileSync(new URL("../src/hooks/usePanZoom.ts", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const regionalMapSource = readFileSync(new URL("../src/components/InteractiveRegionalMap.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("pan zoom behavior guardrails", () => {
  it("centers desktop artwork within the space below the controls", () => {
    const bounds = { x: 100, y: 100, width: 4200, height: 1940 };
    const frame = computeBoundedMapFrame(2048, 1163, bounds, {
      left: 48,
      right: 48,
      top: 145,
    });
    const artworkLeft = frame.x + bounds.x * frame.scale;
    const artworkRight = frame.x + (bounds.x + bounds.width) * frame.scale;
    const artworkTop = frame.y + bounds.y * frame.scale;
    const artworkBottom = frame.y + (bounds.y + bounds.height) * frame.scale;

    assert.ok(Math.abs(artworkLeft - (2048 - artworkRight)) < 1e-9);
    assert.ok(Math.abs(artworkLeft - 48) < 1e-9);
    assert.ok(Math.abs((artworkTop - 145) - (1163 - artworkBottom)) < 1e-9);
    assert.ok(artworkTop >= 145);
    assert.ok(artworkBottom <= 1163);
  });

  it("keeps the cardinal north marker inside the transformed map layer", () => {
    assert.match(
      mapSource,
      /ref=\{mapRef\}[\s\S]*aria-label="Cardinal North Compass"/,
    );
  });

  it("allows detailed selection zoom up to eight times the fitted map scale", () => {
    assert.equal(PAN_ZOOM_MAX_RELATIVE_SCALE, 8);
    assert.equal(clampPanZoomScale(9, 1), 8);
    assert.equal(clampPanZoomScale(7.5, 1), 7.5);
    assert.match(mapSource, /max=\{PAN_ZOOM_MAX_RELATIVE_SCALE\}/);
  });

  it("derives programmatic focus scale from the live viewport on initial deep links", () => {
    assert.equal(computeMapFitScale(900, 600), 0.2);
    assert.match(
      hookSource,
      /const currentFitScale = defaultTransformForViewport\(width, height\)\.scale;[\s\S]*targetAbsoluteScale = targetRelativeScale \* currentFitScale/,
    );
  });

  it("frames selections inside the unobscured desktop map viewport", () => {
    assert.deepEqual(
      computeInsetViewportFocus(1536, 864, { left: 720 }),
      { focusX: 1128, focusY: 432 },
    );
    assert.match(mapSource, /desktopMenuPinned/);
    assert.match(mapSource, /#linewatch-main-menu/);
    assert.match(mapSource, /\.floating-panel-shell/);
    assert.match(
      mapSource,
      /selectionFocusInsets\.left = Math\.max\(selectionFocusInsets\.left, Math\.min/,
    );
    assert.match(mapSource, /viewportInsets: selectionFocusInsets/);
    assert.match(shellSource, /desktopMenuPinned=\{menuPinned\}/);
  });

  it("fits the complete selected overlay within the unobscured viewport", () => {
    assert.match(hookSource, /const zoomToBounds = useCallback/);
    assert.match(hookSource, /targetAbsoluteScale = Math\.min\([\s\S]*clampPanZoomScale\(preferredAbsoluteScale[\s\S]*fittingScale/);
    assert.match(mapSource, /pathCorridorCollisionBoxes\(pathD, 80\)/);
    assert.match(mapSource, /zoomToBounds\(\{/);
    assert.match(regionalMapSource, /const selectionFit = computeBoundedMapFrame/);
    assert.match(regionalMapSource, /REGIONAL_SELECTION_FIT_COMFORT_RATIO = 0\.82/);
    assert.match(regionalMapSource, /targetScale = Math\.min\([\s\S]*clampPanZoomScale\(preferredTargetScale[\s\S]*selectionFit\.scale \* REGIONAL_SELECTION_FIT_COMFORT_RATIO/);
  });

  it("keeps small pointer jitter as a tap and promotes deliberate movement to navigation", () => {
    assert.equal(exceedsMapTapMovement({ x: 10, y: 10 }, { x: 16, y: 15 }), false);
    assert.equal(exceedsMapTapMovement({ x: 10, y: 10 }, { x: 19, y: 10 }), true);
  });

  it("snaps default map translations to physical pixels without changing scale", () => {
    assert.equal(snapToDevicePixel(10.24, 2), 10);
    assert.equal(snapToDevicePixel(10.26, 2), 10.5);
    assert.equal(snapToDevicePixel(-3.24, 2), -3);

    const snapped = snapTransformToDevicePixels({ x: 22.26, y: -8.74, scale: 0.1733333333 }, 2);

    assert.deepEqual(snapped, { x: 22.5, y: -8.5, scale: 0.1733333333 });
  });

  it("starts the fitted-camera entrance slightly zoomed out around the viewport center", () => {
    const fitted = { x: 100, y: 80, scale: 0.2 };
    const entrance = computeFittedCameraFlyInStart(fitted, 1000, 600);
    assert.equal(entrance.x, 172);
    assert.ok(Math.abs(entrance.y - 119.6) < 1e-9);
    assert.equal(entrance.scale, 0.164);
    assert.ok(entrance.scale < fitted.scale);
    const insetEntrance = computeFittedCameraFlyInStart(fitted, 1000, 600, { x: 500, y: 240 });
    assert.equal(insetEntrance.x, 172);
    assert.ok(Math.abs(insetEntrance.y - 108.8) < 1e-9);
    assert.equal(insetEntrance.scale, 0.164);
    assert.match(hookSource, /computeFittedCameraFlyInStart\(next, width, height\)/);
  });

  it("cancels focus animation as soon as a drag starts", () => {
    assert.match(hookSource, /const cancelAnimation = useCallback/);
    assert.match(hookSource, /cancelAnimation\(\);.*startGestureInteraction\(e\.pointerType\)/s);
  });

  it("continues wheel and button zoom from the rendered point of an interrupted camera flight", () => {
    const wheelHandler = hookSource.match(
      /const handleWheel = useCallback\(([\s\S]*?)\n  \}, \[[^\]]*\]\);/,
    )?.[1] ?? "";
    const zoomInHandler = hookSource.match(
      /const zoomIn = useCallback\(([\s\S]*?)\n  \}, \[[^\]]*\]\);/,
    )?.[1] ?? "";

    assert.match(wheelHandler, /cancelAnimation\(\)/);
    assert.match(wheelHandler, /const current = transformRef\.current/);
    assert.match(wheelHandler, /commitTransformRef\(\{ x: newX, y: newY, scale: newScale \}\)/);
    assert.match(zoomInHandler, /cancelAnimation\(\)/);
    assert.match(zoomInHandler, /const current = transformRef\.current/);
  });

  it("keeps continuous TTC wheel zoom DOM-owned with short notch smoothing", () => {
    const wheelHandler = hookSource.match(
      /const handleWheel = useCallback\(([\s\S]*?)\n  \}, \[[\s\S]*?\n  \]\);/,
    )?.[1] ?? "";

    assert.match(wheelHandler, /if \(wheelCommitTimeoutRef\.current === null\) \{[\s\S]*?cancelAnimation\(\)/);
    assert.match(wheelHandler, /setMapTransition\(shouldAnimateProgrammaticTransform \? "transform 0\.1s ease-out" : "none"\)/);
    assert.match(wheelHandler, /commitTransformRef\(\{ x: newX, y: newY, scale: newScale \}\)/);
    assert.match(wheelHandler, /window\.setTimeout\(\(\) => \{[\s\S]*?setTransform\(\{ \.\.\.transformRef\.current \}\)/);
    assert.doesNotMatch(wheelHandler, /commitTransform\(/);
  });

  it("commits programmatic transforms to the ref synchronously", () => {
    assert.match(hookSource, /function commitTransform|const commitTransform = useCallback/);
    assert.match(hookSource, /const snapped = snapTransform\(next\)/);
    assert.match(hookSource, /transformRef\.current = snapped/);
    assert.match(hookSource, /setTransform\(snapped\)/);
  });

  it("animates recenter without an immediate React transform render", () => {
    assert.match(hookSource, /const animateTransformTo = useCallback/);
    assert.match(hookSource, /setMapTransition\("transform 0\.8s cubic-bezier\(0\.25, 1, 0\.5, 1\)"\)/);
    const animateTransformHandler = hookSource.match(
      /const animateTransformTo = useCallback\(([\s\S]*?)\n  \}, \[/,
    )?.[1] ?? "";
    assert.doesNotMatch(animateTransformHandler, /requestAnimationFrame/);
    assert.match(hookSource, /writeMapTransform\(snapped\)/);
    assert.match(hookSource, /window\.setTimeout\(\(\) => \{[\s\S]*setTransform\(\{ \.\.\.transformRef\.current \}\)/);
    assert.doesNotMatch(hookSource, /commitTransform\(\{ x, y, scale \}\);\s*setFitScale\(scale\);\s*startAnimation\(\);/);
  });

  it("starts the initial map entrance without a loading hold", () => {
    assert.match(
      hookSource,
      /moveToDefaultCamera\(animateInitialEntrance, animateInitialEntrance\)/,
    );
    assert.match(hookSource, /programmaticAnimationFrameRef\.current = window\.requestAnimationFrame/);
  });

  it("refits an untouched TTC map after resize but preserves manual camera changes", () => {
    assert.match(hookSource, /const cameraAdjustedByUserRef = useRef\(false\)/);
    assert.match(hookSource, /const refitIfCameraUntouched = useCallback/);
    assert.match(hookSource, /if \(!cameraInitializedRef\.current \|\| cameraAdjustedByUserRef\.current\) return/);
    assert.match(mapSource, /automaticResizeRefitBlockedRef\.current = Boolean\(selection \|\| selectedStationId \|\| commutePathPreview\)/);
    assert.match(mapSource, /const handleWindowResize = \(\) => \{[\s\S]*?!automaticResizeRefitBlockedRef\.current[\s\S]*?refitIfCameraUntouched\(\)/);
    assert.match(hookSource, /const handleWheel[\s\S]*?cameraAdjustedByUserRef\.current = true/);
    assert.match(hookSource, /const recenter[\s\S]*?cameraAdjustedByUserRef\.current = false/);
  });

  it("stages a covered map at the zoomed-out entrance before completing it", () => {
    assert.match(hookSource, /const stageInitialEntrance = useCallback/);
    assert.match(hookSource, /computeFittedCameraFlyInStart\(fittedTransform, width, height\)/);
    assert.match(hookSource, /const completeStagedEntrance = useCallback/);
    assert.match(hookSource, /moveToDefaultCamera\(true, false\)/);
  });

  it("keeps the TTC camera transform outside React render reconciliation", () => {
    const ttcStage = mapSource.match(
      /className="ttc-map-stage[\s\S]*?style=\{\{([\s\S]*?)\}\}/,
    )?.[1] ?? "";

    assert.doesNotMatch(ttcStage, /transform:/);
    assert.doesNotMatch(ttcStage, /transition:/);
    assert.match(hookSource, /useLayoutEffect\(\(\) => \{[\s\S]*writeMapTransform\(transform\)/);
    assert.doesNotMatch(mapSource, /isAnimating/);
  });

  it("sizes the transformed TTC stage to the authored canvas like the regional map", () => {
    const ttcStage = mapSource.match(
      /className="ttc-map-stage([^\"]*)"[\s\S]*?style=\{\{([\s\S]*?)\}\}/,
    );

    assert.ok(ttcStage);
    assert.doesNotMatch(ttcStage[1], /\bw-full\b|\bh-full\b/);
    assert.match(ttcStage[2], /width:\s*"4500px"/);
    assert.match(ttcStage[2], /height:\s*"2181\.8px"/);
    assert.match(regionalMapSource, /className="regional-map-stage relative"[\s\S]*?width:\s*`\$\{MAP_WIDTH\}px`[\s\S]*?height:\s*`\$\{MAP_HEIGHT\}px`/);
  });

  it("simplifies TTC rendering without dropping authored effects during camera motion", () => {
    assert.match(mapSource, /data-map-camera-moving="false"/);
    assert.match(mapSource, /data-map-zoom-active="false"/);
    assert.match(hookSource, /containerRef\.current\.dataset\.mapCameraMoving = active \? "true" : "false"/);
    assert.match(hookSource, /containerRef\.current\.dataset\.mapZoomActive = active \? "true" : "false"/);
    assert.match(hookSource, /setProgrammaticCameraMotion\(true\);[\s\S]*setMapTransition\("transform 0\.8s cubic-bezier/);
    assert.match(hookSource, /setTransform\(\{ \.\.\.transformRef\.current \}\);[\s\S]*setProgrammaticCameraMotion\(false\)/);
    assert.match(
      globalCss,
      /\[data-map-camera-moving="true"\] \.asset-alert-path-glow:not\(\.map-selection-attention\)[\s\S]*?animation-play-state:\s*paused\s*!important;[\s\S]*?transition:\s*none\s*!important;/s,
    );
    const programmaticCameraRules = globalCss.slice(
      globalCss.indexOf('/* Programmatic camera flights, including Center'),
      globalCss.indexOf('/* ============================================================\n   Mobile map controls'),
    );
    assert.doesNotMatch(programmaticCameraRules, /filter:\s*none\s*!important/);
    assert.doesNotMatch(programmaticCameraRules, /\.asset-alert-path-glow[^}]*opacity:\s*0\s*!important/s);
    assert.match(
      globalCss,
      /:is\(\.map-gesture-active, \[data-map-zoom-active="true"\]\) \.asset-alert-path-glow:not\(\.map-selection-attention\)[\s\S]*?:is\(\.map-gesture-active, \[data-map-zoom-active="true"\]\) \.asset-alert-path\.planned-preview,[\s\S]*?animation-play-state:\s*paused\s*!important;[\s\S]*?transition:\s*none\s*!important;/s,
    );
    assert.doesNotMatch(
      globalCss,
      /:is\(\.map-gesture-active, \[data-map-zoom-active="true"\]\) \.asset-alert-path-glow:not\(\.map-selection-attention\)[^{]*\{[^}]*filter:\s*none\s*!important;/s,
    );
    assert.doesNotMatch(
      globalCss,
      /\[data-map-camera-moving="true"\] \.map-selection-attention\s*\{/,
    );
    assert.doesNotMatch(
      globalCss,
      /\[data-map-camera-moving="true"\] \.ttc-svg-container svg \*\s*\{/,
    );
    assert.doesNotMatch(
      globalCss,
      /\.map-gesture-active \.ttc-svg-container svg \*\s*\{/,
    );
    assert.match(
      globalCss,
      /\[data-map-camera-moving="true"\] \.ttc-svg-container svg,[\s\S]*?shape-rendering:\s*auto;[\s\S]*?text-rendering:\s*optimizeLegibility;/,
    );
    assert.match(
      globalCss,
      /:is\(\.map-gesture-active, \[data-map-zoom-active="true"\]\) \.ttc-svg-container svg,[\s\S]*?shape-rendering:\s*auto;[\s\S]*?text-rendering:\s*optimizeLegibility;/,
    );
    assert.match(
      globalCss,
      /:is\(\.map-gesture-active, \[data-map-zoom-active="true"\]\) \.ttc-svg-container :is\([\s\S]*?#ttc-map-base-root \*[\s\S]*?#ttc-map-foreground-root \*[\s\S]*?shape-rendering:\s*auto !important;[\s\S]*?text-rendering:\s*optimizeLegibility !important;/,
    );
    assert.match(
      globalCss,
      /\[data-map-camera-moving="true"\] \.ttc-svg-container :is\([\s\S]*?#ttc-map-base-root \*[\s\S]*?#ttc-map-foreground-root \*[\s\S]*?shape-rendering:\s*auto !important;[\s\S]*?text-rendering:\s*optimizeLegibility !important;/,
    );
    assert.doesNotMatch(
      globalCss,
      /:is\(\.map-gesture-active, \[data-map-zoom-active="true"\]\) \.asset-alert-path-glow:not\(\.map-selection-attention\)\s*\{[^}]*opacity:\s*0\s*!important;/s,
    );
    assert.doesNotMatch(globalCss, /\[data-map-camera-moving="true"\] \.ttc-map-stage[^{]*\{[^}]*will-change:\s*transform/s);
  });

  it("keeps TTC zoom glows visible while pausing overlay pulses", () => {
    assert.match(hookSource, /setUserZoomMotion\(true\)/);
    assert.match(hookSource, /setUserZoomMotion\(false\)/);
    assert.match(hookSource, /const scheduleUserZoomMotionEnd = useCallback/);
    assert.match(globalCss, /\[data-map-zoom-active="true"\]/);
  });

  it("does not toggle compositor promotion on the huge SVG map layer during gestures", () => {
    assert.doesNotMatch(mapSource, /willChange:\s*isDragging\s*\|\|\s*isAnimating\s*\?\s*"transform"\s*:\s*"auto"/);
    assert.doesNotMatch(mapSource, /willChange:\s*"transform"/);
  });

  it("keeps inline SVG map and overlay edges on geometric precision rendering", () => {
    assert.match(globalCss, /\.ttc-svg-container svg\s*\{[^}]*shape-rendering:\s*geometricPrecision;/s);
    assert.match(globalCss, /\.asset-alert-path,\s*\.asset-alert-path-glow\s*\{[^}]*shape-rendering:\s*geometricPrecision;/s);
  });

  it("guards focus zoom by selected target key instead of every data refresh", () => {
    assert.match(mapSource, /useLayoutEffect\(\(\) => \{[\s\S]*const currentLayoutKey =/);
    assert.match(mapSource, /const focusBoxesBySegmentId = useMemo/);
    assert.match(mapSource, /lastFocusedTargetKeyRef/);
    assert.match(mapSource, /focusTargetKey/);
    assert.match(mapSource, /lastFocusedTargetKeyRef\.current === focusTargetKey/);
  });

  it("preserves the camera when the selected focus target is cleared", () => {
    const noTargetBranch = mapSource.match(
      /if \(!focusTargetKey\) \{([\s\S]*?)\n    \}/,
    )?.[1] ?? "";

    assert.match(noTargetBranch, /lastFocusedTargetKeyRef\.current = null/);
    assert.match(mapSource, /preserveCameraOnSelectionClear/);
    assert.match(noTargetBranch, /if \(!preserveCameraOnSelectionClear\) \{[\s\S]*recenter\(\)/);
    assert.match(shellSource, /preserveCameraOnSelectionClear\s/);
  });

  it("uses camera-preserving close paths for standard and rotated mobile selections", () => {
    const standardCloseHandler = shellSource.match(
      /const handleClearMobileImpactSelection = useCallback\(\(\) => \{([\s\S]*?)\n  \},/,
    )?.[1] ?? "";
    const rotatedCloseHandler = shellSource.match(
      /const handleClearRotatedSelection = useCallback\(\(\) => \{([\s\S]*?)\n  \},/,
    )?.[1] ?? "";

    assert.match(standardCloseHandler, /setSelection\(null\)/);
    assert.match(rotatedCloseHandler, /setSelection\(null\)/);
    assert.match(rotatedCloseHandler, /setSelectedStationId\(null\)/);
    assert.doesNotMatch(standardCloseHandler, /setRecenterSignal/);
    assert.doesNotMatch(rotatedCloseHandler, /setRecenterSignal/);
    assert.match(shellSource, /onUnfocus=\{handleClearMobileImpactSelection\}/);
    assert.match(shellSource, /onClearSelection=\{handleClearRotatedSelection\}/);
  });

  it("computes two-pointer pinch geometry without DOM access", () => {
    assert.deepEqual(
      midpointBetweenPoints({ x: 10, y: 20 }, { x: 30, y: 60 }),
      { x: 20, y: 40 },
    );
    assert.equal(distanceBetweenPoints({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  });

  it("keeps the same map point under the pinch midpoint when scale changes", () => {
    const start = { x: -100, y: -50, scale: 2 };
    const viewportPoint = { x: 300, y: 250 };
    const mapPoint = mapPointFromViewportPoint(start, viewportPoint);

    assert.deepEqual(mapPoint, { x: 200, y: 150 });

    const next = transformForMapPointAtViewportPoint(mapPoint, viewportPoint, 3);

    assert.deepEqual(next, { x: -300, y: -200, scale: 3 });
    assert.deepEqual(mapPointFromViewportPoint(next, viewportPoint), mapPoint);
  });

  it("uses active pointer bookkeeping for pinch zoom", () => {
    assert.match(hookSource, /activePointersRef/);
    assert.match(hookSource, /pinchGestureRef/);
    assert.match(hookSource, /pointerPointFromEvent/);
    assert.match(hookSource, /handlePointerCancel/);
    assert.match(hookSource, /distanceBetweenPoints/);
    assert.match(hookSource, /transformForMapPointAtViewportPoint/);
  });

  it("lets map targets participate in pan and pinch gestures without accidental selection", () => {
    assert.match(hookSource, /pointerStartPointsRef/);
    assert.match(hookSource, /shouldSuppressMapClick/);
    assert.match(hookSource, /exceedsMapTapMovement/);
    assert.doesNotMatch(mapSource, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  });

  it("keeps touch gestures on refs instead of React drag state during pointer moves", () => {
    assert.match(hookSource, /const isGestureActiveRef = useRef\(false\)/);
    assert.match(hookSource, /if \(!isGestureActiveRef\.current\) return/);
    assert.doesNotMatch(hookSource, /if \(!isDragging\) return/);
  });

  it("exposes gesture-active state without depending on every pointer move", () => {
    assert.match(hookSource, /const \[isGestureActive, setIsGestureActive\] = useState\(false\)/);
    assert.match(hookSource, /setIsGestureActive\(true\)/);
    assert.match(hookSource, /setIsGestureActive\(false\)/);
    assert.match(hookSource, /isGestureActive,/);
    assert.match(mapSource, /map-gesture-active/);
  });

  it("defers programmatic selected-target focus while the user is gesturing", () => {
    assert.match(mapSource, /if \(isGestureActive\) return/);
    assert.match(mapSource, /isGestureActive,/);
    assert.match(hookSource, /if \(isGestureActiveRef\.current\) \{\s*return;\s*\}/s);
  });

  it("uses logical viewport dimensions for rotated map recenter and zoom", () => {
    assert.match(hookSource, /const logicalViewportSize = useCallback/);
    assert.match(hookSource, /clientWidth/);
    assert.match(hookSource, /clientHeight/);
    assert.match(hookSource, /viewportOrientation/);
  });

  it("biases rotated station and impact focus away from their preview cards", () => {
    assert.match(hookSource, /type ZoomToPointOptions/);
    assert.match(hookSource, /viewportFocusRatio/);
    assert.match(hookSource, /focusX = options\?\.viewportFocusRatio[\s\S]*width \* options\.viewportFocusRatio\.x[\s\S]*insetViewport\.focusX/);
    assert.match(hookSource, /focusY = options\?\.viewportFocusRatio[\s\S]*height \* options\.viewportFocusRatio\.y[\s\S]*insetViewport\.focusY/);
    assert.match(mapSource, /const rotatedPreviewFocusRatio/);
    assert.match(mapSource, /viewportOrientation === "rotated-landscape"/);
    assert.equal(
      Array.from(mapSource.matchAll(/\}, targetScale, focusViewportOptions\)/g)).length,
      3,
    );
  });
});
