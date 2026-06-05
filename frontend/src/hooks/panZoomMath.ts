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
