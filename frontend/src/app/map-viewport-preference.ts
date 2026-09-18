type Camera = { x: number; y: number; scale: number };
type Size = { width: number; height: number };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const mapViewportKey = (network: string) => `linewatch-map-viewport-v1:${network}`;

export function saveMapViewport(storage: StorageLike, network: string, camera: Camera, size: Size, fit: number) {
  if (![camera.x, camera.y, camera.scale, size.width, size.height, fit].every(Number.isFinite)
    || camera.scale <= 0 || fit <= 0 || size.width <= 0 || size.height <= 0) return;
  try {
    storage.setItem(mapViewportKey(network), JSON.stringify({ version: 1,
      centerX: (size.width / 2 - camera.x) / camera.scale,
      centerY: (size.height / 2 - camera.y) / camera.scale,
      zoom: camera.scale / fit,
    }));
  } catch { /* Storage may be unavailable or full. */ }
}

export function readMapViewport(storage: StorageLike, network: string, size: Size, fit: number): Camera | null {
  try {
    const value = JSON.parse(storage.getItem(mapViewportKey(network)) ?? "null");
    if (!value || value.version !== 1 || ![value.centerX, value.centerY, value.zoom].every(Number.isFinite)
      || Math.abs(value.centerX) > 1e7 || Math.abs(value.centerY) > 1e7
      || value.zoom <= 0 || value.zoom > 100 || ![fit, size.width, size.height].every(Number.isFinite) || fit <= 0
      || size.width <= 0 || size.height <= 0) return null;
    const scale = Math.min(8, Math.max(0.2, value.zoom)) * fit;
    return { x: size.width / 2 - value.centerX * scale, y: size.height / 2 - value.centerY * scale, scale };
  } catch { return null; }
}

export function clearMapViewport(network: string) {
  try { window.localStorage.removeItem(mapViewportKey(network)); } catch { /* Optional preference. */ }
  try { window.sessionStorage.removeItem(mapViewportKey(network)); } catch { /* Optional preference. */ }
}
