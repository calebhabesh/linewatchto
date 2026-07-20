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

export function clampPanZoomScale(scale: number, fitScale: number): number {
  return Math.min(
    Math.max(PAN_ZOOM_MIN_RELATIVE_SCALE * fitScale, scale),
    PAN_ZOOM_MAX_RELATIVE_SCALE * fitScale,
  );
}
