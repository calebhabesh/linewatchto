type Camera = { x: number; y: number; scale: number };
type Size = { width: number; height: number };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const MAP_VIEWPORT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const mapViewportKey = (network: string) => `linewatch-map-viewport-v1:${network}`;

export function saveMapViewport(
  storage: StorageLike,
  network: string,
  camera: Camera,
  size: Size,
  fit: number,
  savedAt = Date.now(),
) {
  if (![camera.x, camera.y, camera.scale, size.width, size.height, fit].every(Number.isFinite)
    || !Number.isFinite(savedAt) || camera.scale <= 0 || fit <= 0 || size.width <= 0 || size.height <= 0) return;
  try {
    storage.setItem(mapViewportKey(network), JSON.stringify({ version: 2,
      centerX: (size.width / 2 - camera.x) / camera.scale,
      centerY: (size.height / 2 - camera.y) / camera.scale,
      zoom: camera.scale / fit,
      savedAt,
    }));
  } catch { /* Storage may be unavailable or full. */ }
}

export function readMapViewport(
  storage: StorageLike,
  network: string,
  size: Size,
  fit: number,
  now = Date.now(),
): Camera | null {
  try {
    const value = JSON.parse(storage.getItem(mapViewportKey(network)) ?? "null");
    if (!value || value.version !== 2 || ![value.centerX, value.centerY, value.zoom, value.savedAt, now].every(Number.isFinite)
      || Math.abs(value.centerX) > 1e7 || Math.abs(value.centerY) > 1e7
      || value.savedAt > now || now - value.savedAt > MAP_VIEWPORT_MAX_AGE_MS
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

export function saveGeographicMapViewport(
  storage: StorageLike,
  network: string,
  camera: GeographicCamera,
  savedAt = Date.now(),
) {
  if (
    ![camera.lng, camera.lat, camera.zoom, savedAt].every(Number.isFinite)
    || camera.lng < -82.0 || camera.lng > -77.0
    || camera.lat < 42.0 || camera.lat > 46.0
    || camera.zoom < 5 || camera.zoom > 20
  ) return;
  try {
    storage.setItem(geographicMapViewportKey(network), JSON.stringify({
      version: 2,
      lng: Math.round(camera.lng * 100000) / 100000,
      lat: Math.round(camera.lat * 100000) / 100000,
      zoom: Math.round(camera.zoom * 100) / 100,
      savedAt,
    }));
  } catch { /* Storage may be unavailable or full. */ }
}

export function readGeographicMapViewport(
  storage: StorageLike,
  network: string,
  now = Date.now(),
): GeographicCamera | null {
  try {
    const raw = storage.getItem(geographicMapViewportKey(network));
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (
      !value || value.version !== 2
      || ![value.lng, value.lat, value.zoom, value.savedAt, now].every(Number.isFinite)
      || value.savedAt > now || now - value.savedAt > MAP_VIEWPORT_MAX_AGE_MS
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
