/**
 * Pure math and clamping utilities for map pan, pinch-to-zoom, and reset controls.
 */

import type {
  MapContentBounds,
  MapNetworkId,
  ViewportKeepouts,
} from "./map-plane-manifest";

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
  maxScale: 6.0,
  elasticMinScale: 0.82,
  elasticMaxScale: 7.0,
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
 * Applies smooth elastic rubber-band resistance when pulling beyond boundary limits.
 */
export function applyElasticResistance(
  value: number,
  min: number,
  max: number,
  resistanceFactor = 0.32,
): number {
  "worklet";
  if (value < min) {
    return min - (min - value) * resistanceFactor;
  }
  if (value > max) {
    return max + (value - max) * resistanceFactor;
  }
  return value;
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
 * Computes the default camera transform for the map given container dimensions,
 * network aspect ratio, and safe-area / chrome keepout constraints.
 * Uses the PWA golden verticalCenterRatio (0.435 for TTC) to eliminate unexplained
 * dead space and guarantee that the status peek does not obscure the operational center.
 */
export function computeDefaultMapTransform(
  stageWidth: number,
  stageHeight: number,
  network: MapNetworkId = "ttc",
  options?: {
    verticalCenterRatio?: number;
    keepouts?: ViewportKeepouts;
  },
): MapTransform {
  "worklet";
  if (stageWidth <= 0 || stageHeight <= 0) {
    return {
      scale: MAP_PAN_ZOOM_LIMITS.defaultScale,
      translateX: 0,
      translateY: 0,
    };
  }

  const verticalRatio = options?.verticalCenterRatio ?? (network === "ttc" ? 0.435 : 0.5);
  const aspectRatio = network === "ttc" ? 8250 / 4000 : 17036.959 / 9031.6719;

  // On standard portrait viewports, the overview fits to stage width
  const mapFittedHeight = stageWidth / aspectRatio;

  // With contain / preserveAspectRatio, the canvas centers the map at stageHeight * 0.5.
  // The target vertical position is stageHeight / 2 - mapFittedHeight * verticalRatio.
  // Therefore, the required translation is:
  const translateY = mapFittedHeight * (0.5 - verticalRatio);

  return {
    scale: MAP_PAN_ZOOM_LIMITS.defaultScale,
    translateX: 0,
    translateY: Object.is(translateY, -0) ? 0 : translateY,
  };
}

/**
 * Frames authored map artwork inside a bounded viewport with optional keepout insets.
 */
export function computeBoundedMapFrame(
  stageWidth: number,
  stageHeight: number,
  bounds: MapContentBounds,
  keepouts: ViewportKeepouts = {},
): MapTransform {
  "worklet";
  const left = Math.min(Math.max(keepouts.left ?? 0, 0), stageWidth);
  const right = Math.min(Math.max(keepouts.right ?? 0, 0), Math.max(stageWidth - left, 0));
  const top = Math.min(Math.max(keepouts.top ?? 0, 0), stageHeight);
  const bottom = Math.min(Math.max(keepouts.bottom ?? 0, 0), Math.max(stageHeight - top, 0));
  const availableWidth = Math.max(stageWidth - left - right, 1);
  const availableHeight = Math.max(stageHeight - top - bottom, 1);
  const scale = Math.min(
    availableWidth / Math.max(bounds.width, 1),
    availableHeight / Math.max(bounds.height, 1),
  );
  const framedWidth = bounds.width * scale;
  const framedHeight = bounds.height * scale;

  return {
    translateX: left + (availableWidth - framedWidth) / 2 - bounds.x * scale,
    translateY: top + (availableHeight - framedHeight) / 2 - bounds.y * scale,
    scale,
  };
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
 * Clamps translation coordinates within valid visible boundaries with optional overshoot allowance
 * and an optional baseOrigin point representing the default initial framing offset.
 */
export function clampTranslation(
  translateX: number,
  translateY: number,
  scale: number,
  stageWidth: number,
  stageHeight: number,
  overshoot = 0,
  baseOrigin?: Point,
): { translateX: number; translateY: number } {
  "worklet";
  const { maxX, maxY } = computeMaxTranslation(scale, stageWidth, stageHeight);
  const safeOvershoot = Math.max(0, Number.isFinite(overshoot) ? overshoot : 0);
  const originX = baseOrigin?.x ?? 0;
  const originY = baseOrigin?.y ?? 0;

  const clampedX = clamp(
    Number.isFinite(translateX) ? translateX : originX,
    originX - maxX - safeOvershoot,
    originX + maxX + safeOvershoot,
  );
  const clampedY = clamp(
    Number.isFinite(translateY) ? translateY : originY,
    originY - maxY - safeOvershoot,
    originY + maxY + safeOvershoot,
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
  baseOrigin?: Point,
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
      0,
      baseOrigin,
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
    0,
    baseOrigin,
  );

  return {
    scale: clampedNextScale,
    translateX,
    translateY,
  };
}

/**
 * Default reset transform. If a defaultTransform is provided, resets to that transform;
 * otherwise resets to (scale: 1.0, translateX: 0, translateY: 0).
 */
export function computeResetTransform(defaultTransform?: MapTransform): MapTransform {
  "worklet";
  if (defaultTransform) {
    return {
      scale: defaultTransform.scale,
      translateX: defaultTransform.translateX,
      translateY: defaultTransform.translateY,
    };
  }
  return {
    scale: MAP_PAN_ZOOM_LIMITS.defaultScale,
    translateX: 0,
    translateY: 0,
  };
}

/**
 * Computes double-tap transform:
 * If currently zoomed in (> 1.25x), reset to default.
 * Otherwise, zoom into the tapped point at targetScale (default 2.5x).
 */
export function computeDoubleTapTransform(
  current: MapTransform,
  tapPoint: Point,
  stageWidth: number,
  stageHeight: number,
  targetScale = MAP_PAN_ZOOM_LIMITS.doubleTapScale,
  defaultTransform?: MapTransform,
): MapTransform {
  "worklet";
  if (current.scale > 1.25) {
    return computeResetTransform(defaultTransform);
  }

  return computeFocalZoomTransform(
    current,
    tapPoint,
    targetScale,
    stageWidth,
    stageHeight,
    defaultTransform ? { x: defaultTransform.translateX, y: defaultTransform.translateY } : undefined,
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
  baseOrigin?: Point,
): MapTransform {
  "worklet";
  const nextScale = current.scale * zoomFactor;
  return computeFocalZoomTransform(
    current,
    { x: stageWidth / 2, y: stageHeight / 2 },
    nextScale,
    stageWidth,
    stageHeight,
    baseOrigin,
  );
}

/**
 * Checks if a transform is currently at the default unpanned/unzoomed state.
 */
export function isTransformAtDefault(
  transform: MapTransform,
  defaultTransform?: MapTransform,
  epsilon = 0.05,
): boolean {
  "worklet";
  const targetScale = defaultTransform?.scale ?? MAP_PAN_ZOOM_LIMITS.defaultScale;
  const targetTx = defaultTransform?.translateX ?? 0;
  const targetTy = defaultTransform?.translateY ?? 0;

  return (
    Math.abs(transform.scale - targetScale) < epsilon &&
    Math.abs(transform.translateX - targetTx) < 2 &&
    Math.abs(transform.translateY - targetTy) < 2
  );
}
