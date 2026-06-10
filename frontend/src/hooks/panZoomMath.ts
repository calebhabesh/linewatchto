export type PanZoomTransform = {
  x: number;
  y: number;
  scale: number;
};

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

export function midpointBetweenPoints(a: PanZoomPoint, b: PanZoomPoint): PanZoomPoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function distanceBetweenPoints(a: PanZoomPoint, b: PanZoomPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
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
  return Math.min(Math.max(0.2 * fitScale, scale), 5 * fitScale);
}
