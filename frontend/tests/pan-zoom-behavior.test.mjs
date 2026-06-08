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
    assert.match(hookSource, /cancelAnimation\(\);\s*setIsDragging\(true\)/s);
  });

  it("commits programmatic transforms to the ref synchronously", () => {
    assert.match(hookSource, /function commitTransform|const commitTransform = useCallback/);
    assert.match(hookSource, /const snapped = snapTransform\(next\)/);
    assert.match(hookSource, /transformRef\.current = snapped/);
    assert.match(hookSource, /setTransform\(snapped\)/);
  });

  it("dragging disables transform transitions before animation state is considered", () => {
    assert.match(mapSource, /isDragging\s*\?\s*"none"\s*:\s*isAnimating/s);
  });

  it("only promotes the map transform layer while it is actively moving", () => {
    assert.match(mapSource, /willChange:\s*isDragging\s*\|\|\s*isAnimating\s*\?\s*"transform"\s*:\s*"auto"/);
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
});
