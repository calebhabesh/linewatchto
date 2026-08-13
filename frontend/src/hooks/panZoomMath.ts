export type PanZoomTransform = {
  x: number;
  y: number;
  scale: number;
};

export const PAN_ZOOM_MIN_RELATIVE_SCALE = 0.2;
export const PAN_ZOOM_MAX_RELATIVE_SCALE = 8;

export function computeMapFitScale(
  viewportWidth: number,
  viewportHeight: number,
  mapWidth = 4500,
  mapHeight = 2181.82,
): number {
  return Math.min(viewportWidth / mapWidth, viewportHeight / mapHeight);
}

export type ViewportInsets = {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
};

export type MapContentBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PanZoomViewportSize = {
  width: number;
  height: number;
};

const FITTED_CAMERA_FLY_IN_SCALE_RATIO = 0.82;

/**
 * Normalizes the initial fitted-camera trajectory across differently authored
 * map canvases by starting slightly zoomed out around the viewport center.
 */
export function computeFittedCameraFlyInStart(
  fittedCamera: PanZoomTransform,
  viewportWidth: number,
  viewportHeight: number,
  viewportFocus: PanZoomPoint = { x: viewportWidth / 2, y: viewportHeight / 2 },
): PanZoomTransform {
  return {
    x: viewportFocus.x - (viewportFocus.x - fittedCamera.x) * FITTED_CAMERA_FLY_IN_SCALE_RATIO,
    y: viewportFocus.y - (viewportFocus.y - fittedCamera.y) * FITTED_CAMERA_FLY_IN_SCALE_RATIO,
    scale: fittedCamera.scale * FITTED_CAMERA_FLY_IN_SCALE_RATIO,
  };
}

/**
 * Frames authored map artwork inside a bounded viewport. The artwork remains
 * fully contained between the controls and viewport edge, with equal remainder
 * on each axis instead of inheriting whitespace from the source SVG canvas.
 */
export function computeBoundedMapFrame(
  viewportWidth: number,
  viewportHeight: number,
  bounds: MapContentBounds,
  insets: ViewportInsets = {},
): PanZoomTransform {
  const left = Math.min(Math.max(insets.left ?? 0, 0), viewportWidth);
  const right = Math.min(Math.max(insets.right ?? 0, 0), Math.max(viewportWidth - left, 0));
  const top = Math.min(Math.max(insets.top ?? 0, 0), viewportHeight);
  const bottom = Math.min(Math.max(insets.bottom ?? 0, 0), Math.max(viewportHeight - top, 0));
  const availableWidth = Math.max(viewportWidth - left - right, 1);
  const availableHeight = Math.max(viewportHeight - top - bottom, 1);
  const scale = Math.min(
    availableWidth / Math.max(bounds.width, 1),
    availableHeight / Math.max(bounds.height, 1),
  );
  const framedWidth = bounds.width * scale;
  const framedHeight = bounds.height * scale;

  return {
    x: left + (availableWidth - framedWidth) / 2 - bounds.x * scale,
    y: top + (availableHeight - framedHeight) / 2 - bounds.y * scale,
    scale,
  };
}

export function computeInsetViewportFocus(
  viewportWidth: number,
  viewportHeight: number,
  insets: ViewportInsets = {},
) {
  const left = Math.min(Math.max(insets.left ?? 0, 0), viewportWidth);
  const right = Math.min(Math.max(insets.right ?? 0, 0), Math.max(viewportWidth - left, 0));
  const top = Math.min(Math.max(insets.top ?? 0, 0), viewportHeight);
  const bottom = Math.min(Math.max(insets.bottom ?? 0, 0), Math.max(viewportHeight - top, 0));
  const availableWidth = Math.max(viewportWidth - left - right, 1);
  const availableHeight = Math.max(viewportHeight - top - bottom, 1);

  return {
    focusX: left + availableWidth / 2,
    focusY: top + availableHeight / 2,
  };
}

export function currentDevicePixelRatio() {
  if (typeof window === "undefined") {
    return 1;
  }

  return normalizeDevicePixelRatio(window.devicePixelRatio);
}

export function snapToDevicePixel(value: number, devicePixelRatio = 1) {
  const ratio = normalizeDevicePixelRatio(devicePixelRatio);
  return Math.round(value * ratio) / ratio;
}

export function snapTransformToDevicePixels(
  transform: PanZoomTransform,
  devicePixelRatio = 1,
): PanZoomTransform {
  return {
    x: snapToDevicePixel(transform.x, devicePixelRatio),
    y: snapToDevicePixel(transform.y, devicePixelRatio),
    scale: transform.scale,
  };
}

function normalizeDevicePixelRatio(devicePixelRatio: number) {
  return Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
}

export type PanZoomPoint = {
  x: number;
  y: number;
};

export type MapViewportOrientation = "standard" | "rotated-landscape";

export type ViewportClientRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ClientRectBounds = ViewportClientRect & {
  right: number;
  bottom: number;
};

export type LogicalViewportBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function logicalViewportSizeForOrientation(
  physicalWidth: number,
  physicalHeight: number,
  orientation: MapViewportOrientation = "standard",
): { width: number; height: number } {
  return orientation === "rotated-landscape"
    ? { width: physicalHeight, height: physicalWidth }
    : { width: physicalWidth, height: physicalHeight };
}

/**
 * Keep the rotated map and its camera on one transform node. Android Chromium
 * can visibly retile a large camera layer when it is scaled inside a second,
 * full-viewport rotated compositor. Folding the orientation into the camera
 * matrix removes that nested transformed surface.
 */
export function orientedMapCameraTransform(
  transform: PanZoomTransform,
  orientation: MapViewportOrientation = "standard",
  physicalViewportWidth = 0,
): string {
  const camera = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
  return orientation === "rotated-landscape"
    ? `translate(${physicalViewportWidth}px, 0px) rotate(90deg) ${camera}`
    : camera;
}

type TransformMatrixComponents = {
  a: number;
  b: number;
  e: number;
  f: number;
};

export function cameraFromOrientedTransformMatrix(
  matrix: TransformMatrixComponents,
  orientation: MapViewportOrientation = "standard",
  physicalViewportWidth = 0,
): PanZoomTransform {
  if (orientation === "rotated-landscape") {
    return {
      x: matrix.f,
      y: physicalViewportWidth - matrix.e,
      scale: Math.abs(matrix.b),
    };
  }

  return {
    x: matrix.e,
    y: matrix.f,
    scale: Math.abs(matrix.a),
  };
}

export function clientPointToLogicalViewportPoint(
  clientPoint: PanZoomPoint,
  rect: ViewportClientRect,
  orientation: MapViewportOrientation = "standard",
): PanZoomPoint {
  const visualX = clientPoint.x - rect.left;
  const visualY = clientPoint.y - rect.top;

  if (orientation === "rotated-landscape") {
    return {
      x: visualY,
      y: rect.width - visualX,
    };
  }

  return {
    x: visualX,
    y: visualY,
  };
}

export function clientRectToLogicalViewportBounds(
  clientRect: ClientRectBounds,
  viewportRect: ClientRectBounds,
  orientation: MapViewportOrientation = "standard",
): LogicalViewportBounds | null {
  const left = Math.max(clientRect.left, viewportRect.left);
  const top = Math.max(clientRect.top, viewportRect.top);
  const right = Math.min(clientRect.right, viewportRect.right);
  const bottom = Math.min(clientRect.bottom, viewportRect.bottom);
  if (right <= left || bottom <= top) return null;

  if (orientation === "rotated-landscape") {
    return {
      x: top - viewportRect.top,
      y: viewportRect.width - (right - viewportRect.left),
      width: bottom - top,
      height: right - left,
    };
  }

  return {
    x: left - viewportRect.left,
    y: top - viewportRect.top,
    width: right - left,
    height: bottom - top,
  };
}

export function midpointBetweenPoints(a: PanZoomPoint, b: PanZoomPoint): PanZoomPoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function distanceBetweenPoints(a: PanZoomPoint, b: PanZoomPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function exceedsMapTapMovement(
  start: PanZoomPoint,
  current: PanZoomPoint,
  threshold = 8,
): boolean {
  return distanceBetweenPoints(start, current) > threshold;
}

export function mapPointFromViewportPoint(
  transform: PanZoomTransform,
  viewportPoint: PanZoomPoint,
): PanZoomPoint {
  return {
    x: (viewportPoint.x - transform.x) / transform.scale,
    y: (viewportPoint.y - transform.y) / transform.scale,
  };
}

export function transformForMapPointAtViewportPoint(
  mapPoint: PanZoomPoint,
  viewportPoint: PanZoomPoint,
  scale: number,
): PanZoomTransform {
  return {
    x: viewportPoint.x - mapPoint.x * scale,
    y: viewportPoint.y - mapPoint.y * scale,
    scale,
  };
}

/**
 * Keeps the same map point under the viewport center while the fitted scale
 * changes. Scaling x/y around the page origin is not reversible when a hidden
 * tab briefly reports a collapsed layout and can strand the map at top-left.
 */
export function transformForViewportResize(
  transform: PanZoomTransform,
  previousViewport: PanZoomViewportSize,
  nextViewport: PanZoomViewportSize,
  previousFitScale: number,
  nextFitScale: number,
): PanZoomTransform {
  const safeTransformScale = transform.scale || 1;
  const relativeScale = transform.scale / (previousFitScale || 1);
  const nextScale = relativeScale * nextFitScale;
  const mapPointAtPreviousCenter = mapPointFromViewportPoint(transform, {
    x: previousViewport.width / 2,
    y: previousViewport.height / 2,
  });

  return transformForMapPointAtViewportPoint(
    mapPointAtPreviousCenter,
    {
      x: nextViewport.width / 2,
      y: nextViewport.height / 2,
    },
    Number.isFinite(nextScale) && nextScale > 0
      ? nextScale
      : safeTransformScale,
  );
}

export function clampPanZoomScale(scale: number, fitScale: number): number {
  return Math.min(
    Math.max(PAN_ZOOM_MIN_RELATIVE_SCALE * fitScale, scale),
    PAN_ZOOM_MAX_RELATIVE_SCALE * fitScale,
  );
}
