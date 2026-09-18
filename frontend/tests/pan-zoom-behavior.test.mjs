import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  cameraFromOrientedTransformMatrix,
  clampPanZoomScale,
  computeBoundedMapFrame,
  computeDesktopMapFrame,
  computeFittedCameraFlyInStart,
  computeMapFitScale,
  computeInsetViewportFocus,
  distanceBetweenPoints,
  exceedsMapTapMovement,
  mapPointFromViewportPoint,
  midpointBetweenPoints,
  logicalViewportSizeForOrientation,
  orientedMapCameraTransform,
  PAN_ZOOM_MAX_RELATIVE_SCALE,
  snapToDevicePixel,
  snapTransformToDevicePixels,
  transformForMapPointAtViewportPoint,
  transformForViewportResize,
} from "../src/hooks/panZoomMath.ts";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const hookSource = readFileSync(new URL("../src/hooks/usePanZoom.ts", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const regionalMapSource = readFileSync(new URL("../src/components/InteractiveRegionalMap.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

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

  it("centers mobile TTC artwork horizontally between the left and right viewport with equal padding", () => {
    const scaleFactor = 4500 / 8250;
    const ttcBounds = {
      x: 65 * scaleFactor,
      y: 120 * scaleFactor,
      width: (7925 - 65) * scaleFactor,
      height: (3840 - 120) * scaleFactor,
    };
    const mobileWidth = 390;
    const mobileHeight = 844;
    const horizontalInset = 12;
    const frame = computeBoundedMapFrame(mobileWidth, mobileHeight, ttcBounds, {
      left: horizontalInset,
      right: horizontalInset,
      top: 0,
      bottom: 0,
    });
    const artworkLeft = frame.x + ttcBounds.x * frame.scale;
    const artworkRight = frame.x + (ttcBounds.x + ttcBounds.width) * frame.scale;
    const paddingLeft = artworkLeft;
    const paddingRight = mobileWidth - artworkRight;

    assert.ok(Math.abs(paddingLeft - paddingRight) < 1e-9);
    assert.ok(Math.abs(paddingLeft - horizontalInset) < 1e-9);
  });

  it("centers mobile Regional artwork horizontally between the left and right viewport with equal padding", () => {
    const regionalBounds = {
      x: 53.08,
      y: 110.78,
      width: 4620.46,
      height: 2395.26,
    };
    const mobileWidth = 390;
    const mobileHeight = 844;
    const horizontalInset = Math.min(32, Math.max(12, mobileWidth * 0.025));
    const insets = {
      left: horizontalInset,
      right: horizontalInset,
      top: mobileHeight * 0.05,
      bottom: mobileHeight * 0.05,
    };
    const frame = computeBoundedMapFrame(mobileWidth, mobileHeight, regionalBounds, insets);
    const focus = computeInsetViewportFocus(mobileWidth, mobileHeight, insets);
    const defaultFrameScale = 1.0;
    const defaultFrame = {
      x: focus.focusX - (focus.focusX - frame.x) * defaultFrameScale,
      y: focus.focusY - (focus.focusY - frame.y) * defaultFrameScale,
      scale: frame.scale * defaultFrameScale,
    };
    const artworkLeft = defaultFrame.x + regionalBounds.x * defaultFrame.scale;
    const artworkRight = defaultFrame.x + (regionalBounds.x + regionalBounds.width) * defaultFrame.scale;
    const paddingLeft = artworkLeft;
    const paddingRight = mobileWidth - artworkRight;

    assert.ok(Math.abs(paddingLeft - paddingRight) < 1e-9);
    assert.ok(paddingLeft >= 12);
  });

  it("centers desktop Regional artwork in the stable workspace with balanced margins", () => {
    const regionalBounds = {
      x: 53.08,
      y: 110.78,
      width: 4620.46,
      height: 2395.26,
    };
    const desktopWidth = 1920;
    const desktopHeight = 1080;
    const frame = computeDesktopMapFrame({
      viewportWidth: desktopWidth,
      viewportHeight: desktopHeight,
      bounds: regionalBounds,
    });

    const workspaceCenterX = desktopWidth / 2;
    const workspaceCenterY = desktopHeight / 2;
    const boundsCenterX = regionalBounds.x + regionalBounds.width / 2;
    const boundsCenterY = regionalBounds.y + regionalBounds.height / 2;

    const transformedCenterX = frame.x + boundsCenterX * frame.scale;
    const transformedCenterY = frame.y + boundsCenterY * frame.scale;

    assert.ok(Math.abs(transformedCenterX - workspaceCenterX) < 1e-9);
    assert.ok(Math.abs(transformedCenterY - workspaceCenterY) < 1e-9);

    const leftGap = frame.x + regionalBounds.x * frame.scale;
    const rightGap = desktopWidth - (frame.x + (regionalBounds.x + regionalBounds.width) * frame.scale);
    assert.ok(Math.abs(leftGap - rightGap) < 1e-9);

    const topGap = frame.y + regionalBounds.y * frame.scale;
    const bottomGap = desktopHeight - (frame.y + (regionalBounds.y + regionalBounds.height) * frame.scale);
    assert.ok(Math.abs(topGap - bottomGap) < 1e-9);

    assert.match(regionalMapSource, /x:\s*53\.08/);
    assert.match(regionalMapSource, /y:\s*110\.78/);
    assert.match(regionalMapSource, /width:\s*4620\.46/);
    assert.match(regionalMapSource, /height:\s*2395\.26/);
    assert.match(regionalMapSource, /const REGIONAL_MAP_DESKTOP_FRAME_SCALE = 1/);
    assert.match(regionalMapSource, /const REGIONAL_MAP_MOBILE_INSET_RATIO = 0\.025/);
    assert.match(regionalMapSource, /computeDesktopMapFrame/);
  });

  it("centers desktop TTC artwork in the available workspace beside sidebar with balanced opposite gaps", () => {
    const scaleFactor = 4500 / 8250;
    const ttcBounds = {
      x: 65 * scaleFactor,
      y: 120 * scaleFactor,
      width: (7925 - 65) * scaleFactor,
      height: (3840 - 120) * scaleFactor,
    };
    const desktopWidth = 1440;
    const desktopHeight = 900;
    const overlayLeft = 0; // docked or collapsed sidebar
    const frame = computeDesktopMapFrame({
      viewportWidth: desktopWidth,
      viewportHeight: desktopHeight,
      bounds: ttcBounds,
      overlayLeft,
    });

    const workspaceCenterX = desktopWidth / 2;
    const workspaceCenterY = desktopHeight / 2;
    const boundsCenterX = ttcBounds.x + ttcBounds.width / 2;
    const boundsCenterY = ttcBounds.y + ttcBounds.height / 2;

    const transformedCenterX = frame.x + boundsCenterX * frame.scale;
    const transformedCenterY = frame.y + boundsCenterY * frame.scale;

    assert.ok(Math.abs(transformedCenterX - workspaceCenterX) < 1e-9);
    assert.ok(Math.abs(transformedCenterY - workspaceCenterY) < 1e-9);

    const leftGap = frame.x + ttcBounds.x * frame.scale;
    const rightGap = desktopWidth - (frame.x + (ttcBounds.x + ttcBounds.width) * frame.scale);
    assert.ok(Math.abs(leftGap - rightGap) < 1e-9);

    const topGap = frame.y + ttcBounds.y * frame.scale;
    const bottomGap = desktopHeight - (frame.y + (ttcBounds.y + ttcBounds.height) * frame.scale);
    assert.ok(Math.abs(topGap - bottomGap) < 1e-9);

    assert.match(hookSource, /computeDesktopMapFrame/);
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

  it("keeps resize camera updates centered and reversible", () => {
    const original = { x: -740, y: -315, scale: 0.42 };
    const previousViewport = { width: 2048, height: 1160 };
    const collapsedViewport = { width: 320, height: 180 };
    const collapsed = transformForViewportResize(
      original,
      previousViewport,
      collapsedViewport,
      0.4,
      0.06,
    );
    const restored = transformForViewportResize(
      collapsed,
      collapsedViewport,
      previousViewport,
      0.06,
      0.4,
    );

    assert.ok(Math.abs(restored.x - original.x) < 1e-9);
    assert.ok(Math.abs(restored.y - original.y) < 1e-9);
    assert.ok(Math.abs(restored.scale - original.scale) < 1e-9);
    assert.match(hookSource, /document\.visibilityState === "hidden"/);
    assert.match(hookSource, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
    assert.match(hookSource, /transformForViewportResize\(/);
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

  it("lets overlap chooser content consume wheel scrolling before either map zooms", () => {
    const ttcWheelHandler = hookSource.match(
      /const handleWheel = useCallback\(([\s\S]*?)\n  \}, \[[\s\S]*?\n  \]\);/,
    )?.[1] ?? "";
    const regionalWheelHandler = regionalMapSource.match(
      /const onWheel = useCallback\(([\s\S]*?)\n  \}, \[[^\]]*\]\);/,
    )?.[1] ?? "";

    assert.match(ttcWheelHandler, /if \(isMapWheelScrollRegionTarget\(e\.target\)\) return;[\s\S]*e\.preventDefault\(\)/);
    assert.match(regionalWheelHandler, /if \(isMapWheelScrollRegionTarget\(event\.target\)\) return;[\s\S]*event\.preventDefault\(\)/);
    assert.match(mapSource, /const preventScroll = \(e: WheelEvent\) => \{[\s\S]*isMapWheelScrollRegionTarget\(e\.target\)[\s\S]*e\.preventDefault\(\)/);
  });

  it("commits programmatic transforms to the ref synchronously", () => {
    assert.match(hookSource, /function commitTransform|const commitTransform = useCallback/);
    assert.match(hookSource, /const snapped = snapTransform\(next\)/);
    assert.match(hookSource, /transformRef\.current = snapped/);
    assert.match(hookSource, /setTransform\(snapped\)/);
  });

  it("snaps recenter with paint-only feedback instead of a compositor fade layer", () => {
    assert.match(hookSource, /const animateTransformTo = useCallback/);
    assert.match(hookSource, /setMapTransition\(`transform \$\{durationMs\}ms \$\{easing\}`\)/);
    assert.match(hookSource, /const snapTransformToDefault = useCallback[\s\S]*setMapTransition\("none"\)[\s\S]*writeMapTransform\(snapped\)[\s\S]*commitTransform\(snapped\)/);
    assert.match(hookSource, /const recenter[\s\S]*defaultTransformForViewport\(width, height\)[\s\S]*snapTransformToDefault\(next, next\.scale\)/);
    assert.doesNotMatch(hookSource, /useMapRecenterFade|recenterVeilRef|RECENTER_FADE_ANIMATION_ID|playRecenterFade/);
    assert.doesNotMatch(mapSource, /map-recenter-veil/);
    assert.doesNotMatch(globalCss, /map-recenter-veil|data-map-recenter-effect/);
    assert.match(hookSource, /const recenterWithFeedback[\s\S]*recenter\(\) && !reducedMotion[\s\S]*setRecenterFeedbackKey/);
    assert.match(mapSource, /onClick=\{recenterWithFeedback\}/);
    assert.match(mapSource, /recenterSignal[\s\S]*recenterWithFeedback\(\)/);
    assert.match(mapSource, /className="map-center-feedback"[\s\S]*data-map-center-feedback="ttc"/);
    assert.match(globalCss, /\.map-center-feedback\s*\{[^}]*background-color:\s*transparent;[^}]*animation:\s*map-center-feedback-fade/s);
    assert.match(globalCss, /animation:\s*map-center-feedback-fade 420ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
    assert.match(globalCss, /@keyframes map-center-feedback-fade\s*\{[^}]*background-color:[^}]*rgb\([^}]*\}[^}]*background-color:\s*transparent/s);
    assert.doesNotMatch(globalCss, /\.map-center-feedback\s*\{[^}]*(?:opacity|will-change):/s);
    assert.match(globalCss, /\.motion-paused \.map-center-feedback,[\s\S]*animation:\s*none/);
    assert.match(globalCss, /mobile-performance-mode :is\(\.ttc-map-stage, \.regional-map-stage\)\s*\{[^}]*will-change:\s*auto/s);
    assert.doesNotMatch(globalCss, /mobile-performance-mode :is\(\.ttc-map-stage, \.regional-map-stage\)\s*\{[^}]*will-change:\s*transform/s);
    assert.doesNotMatch(hookSource, /RECENTER_CAMERA_MOTION/);
    const animateTransformHandler = hookSource.match(
      /const animateTransformTo = useCallback\(([\s\S]*?)\n  \}, \[/,
    )?.[1] ?? "";
    assert.doesNotMatch(animateTransformHandler, /requestAnimationFrame/);
    assert.match(hookSource, /writeMapTransform\(snapped\)/);
    assert.match(hookSource, /window\.setTimeout\(\(\) => \{[\s\S]*setTransform\(\{ \.\.\.transformRef\.current \}\)/);
    assert.doesNotMatch(hookSource, /commitTransform\(\{ x, y, scale \}\);\s*setFitScale\(scale\);\s*startAnimation\(\);/);
  });


  it("can initialize without an entrance animation", () => {
    assert.match(
      hookSource,
      /moveToDefaultCamera\(animateInitialEntrance, animateInitialEntrance\)/,
    );
    assert.match(hookSource, /programmaticAnimationFrameRef\.current = window\.requestAnimationFrame/);
  });

  it("limits the fitted-camera entrance to initial page load", () => {
    assert.doesNotMatch(shellSource, /mapEntranceSignal|previousEntranceViewRef/);
    assert.doesNotMatch(shellSource, /entranceSignal=/);
    assert.match(shellSource, /animateInitialEntrance=\{!initialMapReady && !mobileMapPerformanceMode\}/);
  });

  it("uses a paint-only mobile entrance reveal without animating map-stage opacity", () => {
    assert.match(shellSource, /selectedNetwork === "ttc" && \(!initialMapReady \|\| mobileMapPerformanceMode\)/);
    assert.match(shellSource, /initialMapReady \? " ttc-map-entrance-reveal--ready" : ""/);
    assert.match(globalCss, /@media \(max-width: 767px\), \(pointer: coarse\)\s*\{[\s\S]*?\.ttc-map-entrance-reveal:not\(\.ttc-map-entrance-reveal--ready\)[\s\S]*?background-color:/s);
    assert.match(globalCss, /\.ttc-map-entrance-reveal--ready\s*\{[^}]*animation:\s*ttc-map-mobile-entrance-reveal 280ms/s);
    assert.match(globalCss, /@keyframes ttc-map-mobile-entrance-reveal\s*\{[\s\S]*?from\s*\{[^}]*background-color:[^}]*\}[\s\S]*?to\s*\{[^}]*background-color:\s*transparent/s);
    assert.doesNotMatch(globalCss, /\.ttc-map-stage[^}]*opacity/s);
    assert.match(globalCss, /\.motion-paused \.ttc-map-entrance-reveal--ready\s*\{[^}]*animation:\s*none/s);
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
    assert.match(hookSource, /animateInitialEntrance[\s\S]*computeFittedCameraFlyInStart\(fittedTransform, width, height\)[\s\S]*snapTransform\(fittedTransform\)/);
    assert.match(hookSource, /const completeStagedEntrance = useCallback/);
    assert.match(hookSource, /moveToDefaultCamera\(animateInitialEntrance, false\)/);
    assert.match(mapSource, /focusTargetKey === null[\s\S]*animateInitialEntrance[\s\S]*!geometryReady \|\| !rasterMapReady/);
    assert.match(mapSource, /initialCameraPositionedRef\.current[\s\S]*focusTargetKey === null/);
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

  it("pauses TTC effects during camera flights and removes expensive direct-input paint", () => {
    assert.match(mapSource, /data-map-camera-moving="false"/);
    assert.match(mapSource, /data-map-gesture-active="false"/);
    assert.match(mapSource, /data-map-zoom-active="false"/);
    assert.match(hookSource, /containerRef\.current\.dataset\.mapCameraMoving = active \? "true" : "false"/);
    assert.match(hookSource, /containerRef\.current\.dataset\.mapGestureActive = active \? "true" : "false"/);
    assert.match(hookSource, /containerRef\.current\.dataset\.mapZoomActive = active \? "true" : "false"/);
    assert.match(hookSource, /setProgrammaticCameraMotion\(true\);[\s\S]*setMapTransition\(`transform \$\{durationMs\}ms \$\{easing\}`\)/);
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
    assert.doesNotMatch(programmaticCameraRules, /\.asset-alert-path-glow:not\(\.map-selection-attention\)[\s\S]*?opacity:\s*0\s*!important/s);
    assert.match(
      globalCss,
      /:is\(\.map-gesture-active, \[data-map-gesture-active="true"\], \[data-map-zoom-active="true"\]\) \.asset-alert-path-glow:not\(\.map-selection-attention\)[\s\S]*?:is\(\.map-gesture-active, \[data-map-gesture-active="true"\], \[data-map-zoom-active="true"\]\) \.asset-alert-path\.planned-preview,[\s\S]*?animation-play-state:\s*paused\s*!important;[\s\S]*?transition:\s*none\s*!important;/s,
    );
    assert.match(
      globalCss,
      /:is\(\[data-map-gesture-active="true"\], \[data-map-zoom-active="true"\]\) :is\([\s\S]*?\.asset-alert-path-glow,[\s\S]*?filter:\s*none\s*!important;/s,
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
    assert.doesNotMatch(programmaticCameraRules, /\.ttc-svg-container[^}]*shape-rendering/);
    assert.doesNotMatch(programmaticCameraRules, /#ttc-map-(?:base|foreground)-root/);
    const directCameraRules = globalCss.slice(
      globalCss.indexOf('/* Direct pan and user-zoom overlay simplification'),
      globalCss.indexOf('/* Programmatic camera flights, including Center'),
    );
    assert.doesNotMatch(directCameraRules, /\.ttc-svg-container[^}]*shape-rendering/);
    assert.doesNotMatch(directCameraRules, /#ttc-map-(?:base|foreground)-root/);
    assert.match(
      globalCss,
      /:is\(\[data-map-gesture-active="true"\], \[data-map-zoom-active="true"\]\) :is\([\s\S]*?\.asset-alert-path-glow:not\(\.map-selection-attention\),[\s\S]*?opacity:\s*0\s*!important;/s,
    );
    assert.doesNotMatch(globalCss, /\[data-map-camera-moving="true"\] \.ttc-map-stage[^{]*\{[^}]*will-change:\s*transform/s);
  });

  it("marks user zoom so expensive glows can be suppressed", () => {
    assert.match(hookSource, /setUserZoomMotion\(true\)/);
    assert.match(hookSource, /setUserZoomMotion\(false\)/);
    assert.match(hookSource, /const scheduleUserZoomMotionEnd = useCallback/);
    assert.match(globalCss, /\[data-map-zoom-active="true"\]/);
    assert.match(globalCss, /\) \.raster-station-label-text-hover\s*\{\s*filter: none;/s);
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

  it("exposes gesture-active state imperatively without a gesture-boundary React render", () => {
    assert.doesNotMatch(hookSource, /const \[isGestureActive, setIsGestureActive\] = useState\(false\)/);
    assert.doesNotMatch(hookSource, /const \[isDragging, setIsDragging\] = useState\(false\)/);
    assert.match(hookSource, /const setUserGestureMotion = useCallback/);
    assert.match(hookSource, /const setPointerDragging = useCallback/);
    assert.match(hookSource, /dataset\.mapGestureActive = active \? "true" : "false"/);
    assert.match(hookSource, /dataset\.mapPointerDragging = active \? "true" : "false"/);
    assert.match(hookSource, /setUserGestureMotion\(true\)/);
    assert.match(hookSource, /setUserGestureMotion\(false\)/);
    assert.match(hookSource, /isGestureActive,/);
    assert.match(mapSource, /data-map-gesture-active="false"/);
    assert.match(mapSource, /data-map-pointer-dragging="false"/);
  });

  it("defers programmatic selected-target focus while the user is gesturing", () => {
    assert.match(mapSource, /if \(isGestureActive\(\)\) return/);
    assert.match(mapSource, /isGestureActive,/);
    assert.match(hookSource, /if \(isGestureActiveRef\.current\) \{\s*return;\s*\}/s);
  });

  it("uses logical viewport dimensions for rotated map recenter and zoom", () => {
    assert.match(hookSource, /const logicalViewportSize = useCallback/);
    assert.match(hookSource, /clientWidth/);
    assert.match(hookSource, /clientHeight/);
    assert.match(hookSource, /viewportOrientation/);
    assert.deepEqual(logicalViewportSizeForOrientation(412, 915, "rotated-landscape"), {
      width: 915,
      height: 412,
    });
    assert.equal(
      orientedMapCameraTransform({ x: 20, y: -15, scale: 1.5 }, "rotated-landscape", 412),
      "translate(412px, 0px) rotate(90deg) translate(20px, -15px) scale(1.5)",
    );
    assert.deepEqual(
      cameraFromOrientedTransformMatrix(
        { a: 0, b: 1.5, e: 427, f: 20 },
        "rotated-landscape",
        412,
      ),
      { x: 20, y: -15, scale: 1.5 },
    );
    assert.match(hookSource, /orientedMapCameraTransform/);
    assert.match(regionalMapSource, /orientedMapCameraTransform/);
  });

  it("biases rotated station and impact focus away from their preview cards", () => {
    assert.match(hookSource, /type ZoomToPointOptions/);
    assert.match(hookSource, /viewportFocusRatio/);
    assert.match(hookSource, /focusX = options\?\.viewportFocusRatio[\s\S]*width \* options\.viewportFocusRatio\.x[\s\S]*insetViewport\.focusX/);
    assert.match(hookSource, /focusY = options\?\.viewportFocusRatio[\s\S]*height \* options\.viewportFocusRatio\.y[\s\S]*insetViewport\.focusY/);
    assert.match(mapSource, /const rotatedPreviewFocusRatio/);
    assert.match(mapSource, /viewportOrientation === "rotated-landscape"/);
    assert.ok(
      Array.from(mapSource.matchAll(/\}, targetScale, focusViewportOptions\)/g)).length >= 3,
    );
  });

  it("reliably pans to selected impact overlays during cross-network transitions with consistent focus zoom", () => {
    assert.match(regionalMapSource, /if \(focusTargetKey\) \{[\s\S]*cameraRef\.current = fitted\.camera/);
    assert.match(regionalMapSource, /tryFocus = \(\) => \{[\s\S]*if \(focusSelectedMapElements\(\)\)/);
    assert.match(regionalMapSource, /rect\.left - viewportRect\.left/);
    assert.match(regionalMapSource, /preferredTargetScale = clampPanZoomScale\(effectiveFitScale \* \(isMobile \? 3\.8 : 1\.8\), effectiveFitScale\)/);
    assert.match(mapSource, /else if \(focusTargetKey === null\) \{[\s\S]*initializeCamera\(\)[\s\S]*else \{[\s\S]*moveToDefaultCamera\(false, false\);/);
    assert.match(mapSource, /tryFocus = \(\) => \{[\s\S]*if \(focusSelectedMapElements\(\)\)/);
    assert.match(mapSource, /const liveFittedTransform = defaultTransformForViewport\(logicalWidth, logicalHeight\);/);
    assert.match(mapSource, /const effectiveFitScale = liveFittedTransform\.scale \|\| fitScale \|\| 1;/);
    assert.match(mapSource, /preferredTargetScale = clampPanZoomScale\(effectiveFitScale \* \(isMobile \? 3\.8 : 1\.8\), effectiveFitScale\)/);
    assert.match(mapSource, /animateTransformTo\(\{[\s\S]*scale: targetScale,[\s\S]*\}, effectiveFitScale\);/);
    assert.match(hookSource, /animateTransformTo\(\{ x: newX, y: newY, scale: targetAbsoluteScale \}, currentFitScale\);/);
    assert.match(hookSource, /animateTransformTo\(\{[\s\S]*scale: targetAbsoluteScale,[\s\S]*\}, currentFitScale\);/);
  });

  it("keeps one desktop default frame while sidebar mode and width change", () => {
    const scaleFactor = 4500 / 8250;
    const ttcBounds = {
      x: 65 * scaleFactor,
      y: 120 * scaleFactor,
      width: (7925 - 65) * scaleFactor,
      height: (3840 - 120) * scaleFactor,
    };
    const boundsCenterX = ttcBounds.x + ttcBounds.width / 2;
    const boundsCenterY = ttcBounds.y + ttcBounds.height / 2;

    const testCases = [
      { name: "compact sidebar", width: 1360, height: 900 },
      { name: "detail sidebar", width: 1360, height: 900 },
      { name: "collapsed sidebar", width: 1360, height: 900 },
    ];

    for (const tc of testCases) {
      const frame = computeDesktopMapFrame({
        viewportWidth: tc.width,
        viewportHeight: tc.height,
        bounds: ttcBounds,
      });

      const workspaceCenterX = tc.width / 2;
      const workspaceCenterY = tc.height / 2;
      const transformedCenterX = frame.x + boundsCenterX * frame.scale;
      const transformedCenterY = frame.y + boundsCenterY * frame.scale;

      assert.ok(
        Math.abs(transformedCenterX - workspaceCenterX) < 1e-9,
        `${tc.name}: transformed center X (${transformedCenterX}) should equal workspace center X (${workspaceCenterX})`,
      );
      assert.ok(
        Math.abs(transformedCenterY - workspaceCenterY) < 1e-9,
        `${tc.name}: transformed center Y (${transformedCenterY}) should equal workspace center Y (${workspaceCenterY})`,
      );

      const leftGap = frame.x + ttcBounds.x * frame.scale;
      const rightGap = tc.width - (frame.x + (ttcBounds.x + ttcBounds.width) * frame.scale);
      assert.ok(
        Math.abs(leftGap - rightGap) < 1e-9,
        `${tc.name}: left gap (${leftGap}) should equal right gap (${rightGap})`,
      );

      const topGap = frame.y + ttcBounds.y * frame.scale;
      const bottomGap = tc.height - (frame.y + (ttcBounds.y + ttcBounds.height) * frame.scale);
      assert.ok(
        Math.abs(topGap - bottomGap) < 1e-9,
        `${tc.name}: top gap (${topGap}) should equal bottom gap (${bottomGap})`,
      );
    }
  });

  it("does not observe or measure the desktop sidebar from the base camera hook", () => {
    assert.doesNotMatch(hookSource, /readDesktopOverlayInsets/);
    assert.doesNotMatch(hookSource, /observer\.observe\(sidebar\)/);
    assert.doesNotMatch(hookSource, /diffOverlay/);
  });
});
