import { describe, expect, it } from "@jest/globals";

import {
  applyElasticResistance,
  clamp,
  clampScale,
  clampTranslation,
  computeBoundedMapFrame,
  computeDefaultMapTransform,
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

    it("supports custom defaultTransform in computeResetTransform and isTransformAtDefault", () => {
      const customDefault = { scale: 1.0, translateX: 0, translateY: 12.29 };
      const reset = computeResetTransform(customDefault);
      expect(reset).toEqual(customDefault);
      expect(isTransformAtDefault(reset, customDefault)).toBe(true);

      // Sligtly panned away from custom default
      expect(isTransformAtDefault({ scale: 1.0, translateX: 5, translateY: 12.29 }, customDefault)).toBe(false);
    });
  });

  describe("C01: TTC default map framing and keepout clearance", () => {
    it("computes TTC default transform on golden 390dp width with golden ratio 0.435", () => {
      const transform = computeDefaultMapTransform(390, 844, "ttc");
      expect(transform.scale).toBe(1.0);
      expect(transform.translateX).toBe(0);
      // mapFittedHeight = 390 / 2.0625 = 189.0909; (0.5 - 0.435) = 0.065; 189.0909 * 0.065 = 12.2909
      expect(transform.translateY).toBeCloseTo(12.29, 1);
    });

    it("computes consistent TTC framing across standard portrait viewports", () => {
      // 360x780 (Compact Android)
      const t360 = computeDefaultMapTransform(360, 780, "ttc");
      expect(t360.scale).toBe(1.0);
      expect(t360.translateX).toBe(0);
      expect(t360.translateY).toBeCloseTo((360 / 2.0625) * 0.065, 1);

      // 412x915 (Standard Pixel)
      const t412 = computeDefaultMapTransform(412, 915, "ttc");
      expect(t412.scale).toBe(1.0);
      expect(t412.translateX).toBe(0);
      expect(t412.translateY).toBeCloseTo((412 / 2.0625) * 0.065, 1);

      // 430x932 (Large iPhone Pro Max)
      const t430 = computeDefaultMapTransform(430, 932, "ttc");
      expect(t430.scale).toBe(1.0);
      expect(t430.translateX).toBe(0);
      expect(t430.translateY).toBeCloseTo((430 / 2.0625) * 0.065, 1);
    });

    it("safely handles zero or non-positive dimensions", () => {
      expect(computeDefaultMapTransform(0, 0, "ttc")).toEqual({
        scale: 1.0,
        translateX: 0,
        translateY: 0,
      });
      expect(computeDefaultMapTransform(-100, 800, "ttc")).toEqual({
        scale: 1.0,
        translateX: 0,
        translateY: 0,
      });
    });

    it("verifies status peek does not obscure the operational transit center", () => {
      // On golden 390x844 viewport:
      const stageWidth = 390;
      const stageHeight = 844;
      const transform = computeDefaultMapTransform(stageWidth, stageHeight, "ttc");

      const mapHeight = stageWidth / 2.0625; // 189.09dp
      const mapTop = stageHeight / 2 - mapHeight * 0.5 + transform.translateY; // 339.75dp

      // Union Station (Line 1 southern loop terminus, y = 3597 in 4000 viewBox)
      const unionY = mapTop + (3597 / 4000) * mapHeight; // ~509.8dp

      // Status peek top boundary: status peek height (~136dp) + bottom nav offset (Math.max(96, insets.bottom + 84) = ~118dp) => ~254dp keepout
      const peekTop = stageHeight - 254; // 590dp

      // Union must be comfortably ABOVE the status peek top (positive clearance > 60dp)
      const clearance = peekTop - unionY;
      expect(clearance).toBeGreaterThan(60);
      expect(unionY).toBeLessThan(peekTop);

      // Bloor-Yonge / St. George (Line 1 & 2 interchange, y = 2602 in 4000 viewBox)
      const bloorYongeY = mapTop + (2602 / 4000) * mapHeight;
      // Operational core sits in prime central vertical window (between 45% and 60% of viewport)
      expect(bloorYongeY / stageHeight).toBeGreaterThan(0.45);
      expect(bloorYongeY / stageHeight).toBeLessThan(0.60);

      // Finch / Vaughan (Line 1 northern termini, y = 400 in 4000 viewBox)
      const finchY = mapTop + (400 / 4000) * mapHeight;
      // Top keepout is ~96dp (top chrome + safe area). Finch must sit comfortably below top chrome.
      expect(finchY).toBeGreaterThan(120);
    });

    it("clamps translations around baseOrigin offset", () => {
      const baseOrigin = { x: 0, y: 12.29 };
      // At scale 1.0, maxTranslation is 0, so coordinates should clamp to baseOrigin
      const clampedAtOne = clampTranslation(50, -50, 1.0, 390, 844, 0, baseOrigin);
      expect(clampedAtOne.translateX).toBe(0);
      expect(clampedAtOne.translateY).toBeCloseTo(12.29, 2);

      // At scale 2.0, allows panning around baseOrigin
      const { maxX, maxY } = computeMaxTranslation(2.0, 390, 844);
      const clampedAtTwo = clampTranslation(100, 100, 2.0, 390, 844, 0, baseOrigin);
      expect(clampedAtTwo.translateX).toBe(100);
      expect(clampedAtTwo.translateY).toBe(100);

      // Panning way beyond maxY
      const clampedExtreme = clampTranslation(0, 1000, 2.0, 390, 844, 0, baseOrigin);
      expect(clampedExtreme.translateY).toBeCloseTo(baseOrigin.y + maxY, 2);
    });

    it("computes bounded map frame matching PWA bounds containment", () => {
      const bounds = { x: 65, y: 120, width: 7835, height: 3700 };
      const frame = computeBoundedMapFrame(390, 844, bounds, {
        top: 96,
        bottom: 220,
      });

      expect(frame.scale).toBeGreaterThan(0);
      const artworkTop = frame.translateY + bounds.y * frame.scale;
      const artworkBottom = frame.translateY + (bounds.y + bounds.height) * frame.scale;

      expect(artworkTop).toBeGreaterThanOrEqual(95);
      expect(artworkBottom).toBeLessThanOrEqual(844 - 219);
    });
  });
});
