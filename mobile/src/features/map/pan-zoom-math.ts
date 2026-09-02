/**
 * Pure math and clamping utilities for map pan, pinch-to-zoom, and reset controls.
 */

export type MapTransform = {
  scale: number;
  translateX: number;
  translateY: number;
};

export type Point = {
  x: number;
  y: number;
};

export const MAP_PAN_ZOOM_LIMITS = {
  minScale: 1.0,
  maxScale: 5.0,
  doubleTapScale: 2.5,
  zoomStepRatio: 1.5,
  defaultScale: 1.0,
} as const;

/**
 * Clamps a scalar value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  "worklet";
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  const res = Math.min(Math.max(value, lower), upper);
  return Object.is(res, -0) ? 0 : res;
}

/**
 * Clamps zoom scale within allowable minimum and maximum boundaries.
 */
export function clampScale(
  scale: number,
  minScale: number = MAP_PAN_ZOOM_LIMITS.minScale,
  maxScale: number = MAP_PAN_ZOOM_LIMITS.maxScale,
): number {
  "worklet";
  if (scale === Number.POSITIVE_INFINITY) {
    return maxScale;
  }
  if (!Number.isFinite(scale) || scale <= 0) {
    return minScale;
  }
  return clamp(scale, minScale, maxScale);
}

/**
 * Computes maximum allowable pan offset along X and Y axes given stage dimensions and scale.
 * When scale is 1.0 (or less), max translation is 0 (map is perfectly framed).
 * When scale > 1.0, the map can translate by half of the excess width/height.
 */
export function computeMaxTranslation(
  scale: number,
  stageWidth: number,
  stageHeight: number,
): { maxX: number; maxY: number } {
  "worklet";
  const safeScale = Math.max(1, Number.isFinite(scale) ? scale : 1);
  const safeWidth = Math.max(0, Number.isFinite(stageWidth) ? stageWidth : 0);
  const safeHeight = Math.max(0, Number.isFinite(stageHeight) ? stageHeight : 0);

  const maxX = (safeWidth * (safeScale - 1)) / 2;
  const maxY = (safeHeight * (safeScale - 1)) / 2;

  return {
    maxX: Object.is(maxX, -0) ? 0 : maxX,
    maxY: Object.is(maxY, -0) ? 0 : maxY,
  };
}

/**
 * Clamps translation coordinates within valid visible boundaries.
 */
export function clampTranslation(
  translateX: number,
  translateY: number,
  scale: number,
  stageWidth: number,
  stageHeight: number,
  overshoot = 0,
): { translateX: number; translateY: number } {
  "worklet";
  const { maxX, maxY } = computeMaxTranslation(scale, stageWidth, stageHeight);
  const safeOvershoot = Math.max(0, Number.isFinite(overshoot) ? overshoot : 0);

  const clampedX = clamp(
    Number.isFinite(translateX) ? translateX : 0,
    -maxX - safeOvershoot,
    maxX + safeOvershoot,
  );
  const clampedY = clamp(
    Number.isFinite(translateY) ? translateY : 0,
    -maxY - safeOvershoot,
    maxY + safeOvershoot,
  );

  return {
    translateX: Object.is(clampedX, -0) ? 0 : clampedX,
    translateY: Object.is(clampedY, -0) ? 0 : clampedY,
  };
}

/**
 * Calculates new transform when zooming into/out of a focal point (e.g. pinch center or tap).
 */
export function computeFocalZoomTransform(
  current: MapTransform,
  focalPoint: Point,
  nextScale: number,
  stageWidth: number,
  stageHeight: number,
): MapTransform {
  "worklet";
  const clampedNextScale = clampScale(nextScale);
  const currentScale = current.scale || 1;

  if (clampedNextScale === currentScale) {
    const { translateX, translateY } = clampTranslation(
      current.translateX,
      current.translateY,
      clampedNextScale,
      stageWidth,
      stageHeight,
    );
    return { scale: clampedNextScale, translateX, translateY };
  }

  // Focal point relative to stage center
  const centerX = stageWidth / 2;
  const centerY = stageHeight / 2;

  const focalRelX = focalPoint.x - centerX;
  const focalRelY = focalPoint.y - centerY;

  // Shift translation so the point under the focal center remains in place
  const scaleRatio = clampedNextScale / currentScale;
  const newTx = current.translateX + (focalRelX - current.translateX) * (1 - scaleRatio);
  const newTy = current.translateY + (focalRelY - current.translateY) * (1 - scaleRatio);

  const { translateX, translateY } = clampTranslation(
    newTx,
    newTy,
    clampedNextScale,
    stageWidth,
    stageHeight,
  );

  return {
    scale: clampedNextScale,
    translateX,
    translateY,
  };
}

/**
 * Default reset transform (1.0x scale, (0, 0) translation).
 */
export function computeResetTransform(): MapTransform {
  "worklet";
  return {
    scale: MAP_PAN_ZOOM_LIMITS.defaultScale,
    translateX: 0,
    translateY: 0,
  };
}

/**
 * Computes double-tap transform:
 * If currently zoomed in (> 1.25x), reset to 1.0x default.
 * Otherwise, zoom into the tapped point at targetScale (default 2.5x).
 */
export function computeDoubleTapTransform(
  current: MapTransform,
  tapPoint: Point,
  stageWidth: number,
  stageHeight: number,
  targetScale = MAP_PAN_ZOOM_LIMITS.doubleTapScale,
): MapTransform {
  "worklet";
  if (current.scale > 1.25) {
    return computeResetTransform();
  }

  return computeFocalZoomTransform(
    current,
    tapPoint,
    targetScale,
    stageWidth,
    stageHeight,
  );
}

/**
 * Computes step zoom transform (for + / - buttons) centered at the stage center.
 */
export function computeStepZoomTransform(
  current: MapTransform,
  zoomFactor: number,
  stageWidth: number,
  stageHeight: number,
): MapTransform {
  "worklet";
  const nextScale = current.scale * zoomFactor;
  return computeFocalZoomTransform(
    current,
    { x: stageWidth / 2, y: stageHeight / 2 },
    nextScale,
    stageWidth,
    stageHeight,
  );
}

/**
 * Checks if a transform is currently at the default 1.0x unpanned state.
 */
export function isTransformAtDefault(transform: MapTransform, epsilon = 0.01): boolean {
  "worklet";
  return (
    Math.abs(transform.scale - MAP_PAN_ZOOM_LIMITS.defaultScale) < epsilon &&
    Math.abs(transform.translateX) < epsilon &&
    Math.abs(transform.translateY) < epsilon
  );
}
