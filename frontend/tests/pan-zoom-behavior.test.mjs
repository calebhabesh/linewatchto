import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  distanceBetweenPoints,
  mapPointFromViewportPoint,
  midpointBetweenPoints,
  snapToDevicePixel,
  snapTransformToDevicePixels,
  transformForMapPointAtViewportPoint,
} from "../src/hooks/panZoomMath.ts";

const hookSource = readFileSync(new URL("../src/hooks/usePanZoom.ts", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("pan zoom behavior guardrails", () => {
  it("snaps default map translations to physical pixels without changing scale", () => {
    assert.equal(snapToDevicePixel(10.24, 2), 10);
    assert.equal(snapToDevicePixel(10.26, 2), 10.5);
    assert.equal(snapToDevicePixel(-3.24, 2), -3);

    const snapped = snapTransformToDevicePixels({ x: 22.26, y: -8.74, scale: 0.1733333333 }, 2);

    assert.deepEqual(snapped, { x: 22.5, y: -8.5, scale: 0.1733333333 });
  });

  it("cancels focus animation as soon as a drag starts", () => {
    assert.match(hookSource, /const cancelAnimation = useCallback/);
    assert.match(hookSource, /cancelAnimation\(\);.*startGestureInteraction\(e\.pointerType\)/s);
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
    assert.match(hookSource, /programmaticAnimationFrameRef\.current = requestAnimationFrame/);
    assert.match(hookSource, /writeMapTransform\(snapped\)/);
    assert.match(hookSource, /window\.setTimeout\(\(\) => \{[\s\S]*setTransform\(\{ \.\.\.transformRef\.current \}\)/);
    assert.doesNotMatch(hookSource, /commitTransform\(\{ x, y, scale \}\);\s*setFitScale\(scale\);\s*startAnimation\(\);/);
  });

  it("dragging disables transform transitions without React animation state", () => {
    assert.match(mapSource, /isDragging\s*\?\s*"none"\s*:\s*"transform 0\.1s ease-out"/s);
    assert.doesNotMatch(mapSource, /isAnimating/);
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
    assert.match(shellSource, /preserveCameraOnSelectionClear=\{isMobile\}/);
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
});
