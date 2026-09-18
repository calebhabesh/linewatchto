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

export type GeographicCamera = { lng: number; lat: number; zoom: number };

export const geographicMapViewportKey = (network: string) => `linewatch-geographic-map-viewport-v1:${network}`;

export function saveGeographicMapViewport(storage: StorageLike, network: string, camera: GeographicCamera) {
  if (
    ![camera.lng, camera.lat, camera.zoom].every(Number.isFinite)
    || camera.lng < -82.0 || camera.lng > -77.0
    || camera.lat < 42.0 || camera.lat > 46.0
    || camera.zoom < 5 || camera.zoom > 20
  ) return;
  try {
    storage.setItem(geographicMapViewportKey(network), JSON.stringify({
      version: 1,
      lng: Math.round(camera.lng * 100000) / 100000,
      lat: Math.round(camera.lat * 100000) / 100000,
      zoom: Math.round(camera.zoom * 100) / 100,
    }));
  } catch { /* Storage may be unavailable or full. */ }
}

export function readGeographicMapViewport(storage: StorageLike, network: string): GeographicCamera | null {
  try {
    const raw = storage.getItem(geographicMapViewportKey(network));
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (
      !value || value.version !== 1
      || ![value.lng, value.lat, value.zoom].every(Number.isFinite)
      || value.lng < -82.0 || value.lng > -77.0
      || value.lat < 42.0 || value.lat > 46.0
      || value.zoom < 5 || value.zoom > 20
    ) return null;
    return { lng: value.lng, lat: value.lat, zoom: value.zoom };
  } catch { return null; }
}

export function clearGeographicMapViewport(storageOrNetwork: StorageLike | string, maybeNetwork?: string) {
  if (typeof storageOrNetwork === "string") {
    const network = storageOrNetwork;
    try { window.localStorage.removeItem(geographicMapViewportKey(network)); } catch { /* Optional preference. */ }
    try { window.sessionStorage.removeItem(geographicMapViewportKey(network)); } catch { /* Optional preference. */ }
  } else if (maybeNetwork) {
    try { storageOrNetwork.removeItem(geographicMapViewportKey(maybeNetwork)); } catch { /* Optional preference. */ }
  }
}

