import { describe, expect, it } from "@jest/globals";

import {
  applyElasticResistance,
  clamp,
  clampScale,
  clampTranslation,
  computeDoubleTapTransform,
  computeFocalZoomTransform,
  computeMaxTranslation,
  computeResetTransform,
  computeStepZoomTransform,
  isTransformAtDefault,
  MAP_PAN_ZOOM_LIMITS,
} from "@/features/map/pan-zoom-math";

describe("pan-zoom-math", () => {
  describe("clamp", () => {
    it("clamps values between lower and upper bounds", () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it("handles inverted min and max gracefully", () => {
      expect(clamp(5, 10, 0)).toBe(5);
      expect(clamp(-5, 10, 0)).toBe(0);
      expect(clamp(15, 10, 0)).toBe(10);
    });
  });

  describe("applyElasticResistance", () => {
    it("returns original value when within min and max", () => {
      expect(applyElasticResistance(3.0, 1.0, 6.0)).toBe(3.0);
      expect(applyElasticResistance(1.0, 1.0, 6.0)).toBe(1.0);
      expect(applyElasticResistance(6.0, 1.0, 6.0)).toBe(6.0);
    });

    it("applies resistance below min", () => {
      // 0.5 is 0.5 below min 1.0 => 1.0 - 0.5 * 0.32 = 0.84
      expect(applyElasticResistance(0.5, 1.0, 6.0, 0.32)).toBeCloseTo(0.84);
    });

    it("applies resistance above max", () => {
      // 8.0 is 2.0 above max 6.0 => 6.0 + 2.0 * 0.32 = 6.64
      expect(applyElasticResistance(8.0, 1.0, 6.0, 0.32)).toBeCloseTo(6.64);
    });
  });

  describe("clampScale", () => {
    it("clamps scale within default min (1.0) and max (6.0)", () => {
      expect(clampScale(0.5)).toBe(1.0);
      expect(clampScale(2.5)).toBe(2.5);
      expect(clampScale(7.0)).toBe(6.0);
    });

    it("handles non-finite or negative values safely", () => {
      expect(clampScale(Number.NaN)).toBe(1.0);
      expect(clampScale(-2)).toBe(1.0);
      expect(clampScale(Number.POSITIVE_INFINITY)).toBe(6.0);
    });

    it("respects custom minScale and maxScale", () => {
      expect(clampScale(0.8, 0.5, 3.0)).toBe(0.8);
      expect(clampScale(0.3, 0.5, 3.0)).toBe(0.5);
      expect(clampScale(4.0, 0.5, 3.0)).toBe(3.0);
    });
  });

  describe("computeMaxTranslation & clampTranslation", () => {
    const stageWidth = 400;
    const stageHeight = 200;

    it("returns 0 max translation when scale is 1.0", () => {
      const { maxX, maxY } = computeMaxTranslation(1.0, stageWidth, stageHeight);
      expect(maxX).toBe(0);
      expect(maxY).toBe(0);
    });

    it("calculates correct max translation when zoomed in", () => {
      // At scale 2.0: excess width = 400, excess height = 200 => maxX = 200, maxY = 100
      const { maxX, maxY } = computeMaxTranslation(2.0, stageWidth, stageHeight);
      expect(maxX).toBe(200);
      expect(maxY).toBe(100);
    });

    it("clamps translation within valid max translation bounds", () => {
      const clamped = clampTranslation(300, -150, 2.0, stageWidth, stageHeight);
      expect(clamped.translateX).toBe(200);
      expect(clamped.translateY).toBe(-100);
    });

    it("clamps translation to (0, 0) when scale is <= 1.0", () => {
      const clamped = clampTranslation(50, -50, 1.0, stageWidth, stageHeight);
      expect(clamped.translateX).toBe(0);
      expect(clamped.translateY).toBe(0);
    });

    it("handles overshoot when provided", () => {
      const clamped = clampTranslation(250, 150, 2.0, stageWidth, stageHeight, 20);
      expect(clamped.translateX).toBe(220);
      expect(clamped.translateY).toBe(120);
    });
  });

  describe("computeFocalZoomTransform", () => {
    const stageWidth = 400;
    const stageHeight = 200;
    const current = { scale: 1.0, translateX: 0, translateY: 0 };

    it("zooms into center without panning", () => {
      const result = computeFocalZoomTransform(
        current,
        { x: 200, y: 100 }, // Center
        2.0,
        stageWidth,
        stageHeight,
      );

      expect(result.scale).toBe(2.0);
      expect(result.translateX).toBe(0);
      expect(result.translateY).toBe(0);
    });

    it("shifts translation when zooming into off-center focal point", () => {
      // Focal point at top-left: x = 100, y = 50 (relX = -100, relY = -50)
      const result = computeFocalZoomTransform(
        current,
        { x: 100, y: 50 },
        2.0,
        stageWidth,
        stageHeight,
      );

      expect(result.scale).toBe(2.0);
      // relX = -100, scaleRatio = 2.0 => newTx = 0 + (-100 - 0) * (1 - 2) = +100
      expect(result.translateX).toBe(100);
      // relY = -50 => newTy = +50
      expect(result.translateY).toBe(50);
    });

    it("clamps scale to limits and clamps translation to bounded region", () => {
      const result = computeFocalZoomTransform(
        current,
        { x: 0, y: 0 },
        10.0, // Exceeds max 5.0
        stageWidth,
        stageHeight,
      );

      expect(result.scale).toBe(6.0);
      const { maxX, maxY } = computeMaxTranslation(6.0, stageWidth, stageHeight);
      expect(result.translateX).toBe(maxX);
      expect(result.translateY).toBe(maxY);
    });
  });

  describe("computeDoubleTapTransform", () => {
    const stageWidth = 400;
    const stageHeight = 200;

    it("zooms in to doubleTapScale (2.5x) when currently at default 1.0x", () => {
      const current = { scale: 1.0, translateX: 0, translateY: 0 };
      const tapPoint = { x: 200, y: 100 };

      const result = computeDoubleTapTransform(current, tapPoint, stageWidth, stageHeight);
      expect(result.scale).toBe(MAP_PAN_ZOOM_LIMITS.doubleTapScale);
      expect(result.translateX).toBe(0);
      expect(result.translateY).toBe(0);
    });

    it("resets to default 1.0x when currently zoomed in (> 1.25x)", () => {
      const current = { scale: 2.5, translateX: 50, translateY: 25 };
      const tapPoint = { x: 200, y: 100 };

      const result = computeDoubleTapTransform(current, tapPoint, stageWidth, stageHeight);
      expect(result.scale).toBe(1.0);
      expect(result.translateX).toBe(0);
      expect(result.translateY).toBe(0);
    });
  });

  describe("computeStepZoomTransform", () => {
    const stageWidth = 400;
    const stageHeight = 200;
    const current = { scale: 1.0, translateX: 0, translateY: 0 };

    it("multiplies scale by zoomFactor centered at stage midpoint", () => {
      const zoomedIn = computeStepZoomTransform(current, 1.5, stageWidth, stageHeight);
      expect(zoomedIn.scale).toBe(1.5);
      expect(zoomedIn.translateX).toBe(0);
      expect(zoomedIn.translateY).toBe(0);

      const zoomedOut = computeStepZoomTransform(zoomedIn, 1 / 1.5, stageWidth, stageHeight);
      expect(zoomedOut.scale).toBe(1.0);
      expect(zoomedOut.translateX).toBe(0);
      expect(zoomedOut.translateY).toBe(0);
    });
  });

  describe("computeResetTransform & isTransformAtDefault", () => {
    it("returns default 1.0x scale and zero offsets", () => {
      const reset = computeResetTransform();
      expect(reset).toEqual({ scale: 1.0, translateX: 0, translateY: 0 });
      expect(isTransformAtDefault(reset)).toBe(true);
    });

    it("detects when transform is not at default", () => {
      expect(isTransformAtDefault({ scale: 1.5, translateX: 0, translateY: 0 })).toBe(false);
      expect(isTransformAtDefault({ scale: 1.0, translateX: 10, translateY: 0 })).toBe(false);
      expect(isTransformAtDefault({ scale: 1.0, translateX: 0, translateY: -5 })).toBe(false);
    });
  });
});
