/**
 * Loads the tiles just outside a MapLibre map's view once it settles, so a
 * pan into them draws from cache instead of showing empty tiles while they
 * download. MapLibre itself only requests the tiles in view.
 */
import type { Map as MapLibreMap } from "maplibre-gl";

export type PrefetchSource = {
  /** Namespaces this source's tiles in the "already fetched" set. */
  key: string;
  tileSize: number;
  minzoom: number;
  maxzoom: number;
  /** Raster sources round the zoom to pick a tile level; vector sources floor it. */
  roundZoom: boolean;
  /** Most tiles one settle loads, nearest the centre first (default MAX_TILES_PER_SOURCE). */
  maxTiles?: number;
  /** "view": the tiles in view (for a source the map does not draw yet); default "ring": just outside it. */
  area?: "ring" | "view";
  /** Fetches one tile into a cache (HTTP, service worker, or memory). */
  load: (z: number, x: number, y: number) => Promise<unknown>;
};

/** How far past each edge of the view to load, as a share of the view's size. */
const MARGIN = 0.5;
/** Most tiles one settle loads per source, nearest the centre first. */
const MAX_TILES_PER_SOURCE = 48;
const CONCURRENCY = 4;
/** Waits this long after the camera stops, so a flick of pans loads once. */
const SETTLE_MS = 250;
const MAX_REMEMBERED = 8000;

type TileRange = { z: number; minX: number; maxX: number; minY: number; maxY: number };

const lngToX = (lng: number, n: number) => ((lng + 180) / 360) * n;
const latToY = (lat: number, n: number) => {
  const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
};

/** The tile level MapLibre draws a source at (its coveringZoomLevel). */
export function prefetchTileZoom(mapZoom: number, source: Pick<PrefetchSource, "tileSize" | "minzoom" | "maxzoom" | "roundZoom">) {
  const z = mapZoom + Math.log2(512 / source.tileSize);
  return Math.max(source.minzoom, Math.min(source.maxzoom, source.roundZoom ? Math.round(z) : Math.floor(z)));
}

export function tileRange(bounds: { west: number; south: number; east: number; north: number }, z: number): TileRange {
  const n = 2 ** z;
  const clamp = (value: number) => Math.max(0, Math.min(n - 1, Math.floor(value)));
  return {
    z,
    minX: clamp(lngToX(bounds.west, n)),
    maxX: clamp(lngToX(bounds.east, n)),
    minY: clamp(latToY(bounds.north, n)),
    maxY: clamp(latToY(bounds.south, n)),
  };
}

/** Tiles in `outer` but not `inner` (MapLibre already loads those), nearest the middle first. */
export function ringTiles(outer: TileRange, inner: TileRange, limit: number) {
  const cx = (inner.minX + inner.maxX) / 2;
  const cy = (inner.minY + inner.maxY) / 2;
  const tiles: Array<{ x: number; y: number; d: number }> = [];
  for (let x = outer.minX; x <= outer.maxX; x++) {
    for (let y = outer.minY; y <= outer.maxY; y++) {
      if (x >= inner.minX && x <= inner.maxX && y >= inner.minY && y <= inner.maxY) continue;
      tiles.push({ x, y, d: Math.hypot(x - cx, y - cy) });
    }
  }
  return tiles.sort((a, b) => a.d - b.d).slice(0, limit);
}

/**
 * Orders one pyramid level's tiles nearest the point first (in the art's
 * units; a level is 2^level square tiles across the view box's width).
 */
export function sortTilesNearest<T extends { column: number; row: number }>(
  tiles: T[],
  point: { x: number; y: number } | null,
  level: number,
  viewBox: { x: number; y: number; width: number },
) {
  if (!point) return tiles;
  const across = 2 ** level;
  const cx = ((point.x - viewBox.x) / viewBox.width) * across;
  const cy = ((point.y - viewBox.y) / viewBox.width) * across;
  const distance = ({ column, row }: T) => Math.hypot(column + 0.5 - cx, row + 0.5 - cy);
  return tiles.sort((a, b) => distance(a) - distance(b));
}

type ConnectionInfo = { saveData?: boolean; effectiveType?: string };
const connectionInfo = () => (navigator as Navigator & { connection?: ConnectionInfo }).connection;

/** Skips prefetching where the person asked to save data or the link is very slow. */
export function connectionAllowsPrefetch(connection: ConnectionInfo | undefined = connectionInfo()) {
  return !connection?.saveData && !/(^|-)2g$/.test(connection?.effectiveType ?? "");
}

/**
 * Whether a large download (a whole map's sharpest tiles) is reasonable: not
 * on data saver or a 2G/3G-class link. Safari reports no connection, so it
 * counts as allowed.
 */
export function connectionAllowsBulkDownload(connection: ConnectionInfo | undefined = connectionInfo()) {
  return connectionAllowsPrefetch(connection) && !/^3g$/.test(connection?.effectiveType ?? "");
}

export function installTilePrefetch(map: MapLibreMap, sources: () => PrefetchSource[]) {
  const fetched = new Set<string>();
  let timer: number | null = null;
  let round = 0;

  const run = async () => {
    timer = null;
    if (document.visibilityState === "hidden" || !connectionAllowsPrefetch()) return;
    const current = ++round;
    const view = map.getBounds();
    const [west, south, east, north] = [view.getWest(), view.getSouth(), view.getEast(), view.getNorth()];
    const dx = (east - west) * MARGIN;
    const dy = (north - south) * MARGIN;
    const queue: Array<() => Promise<unknown>> = [];
    for (const source of sources()) {
      const z = prefetchTileZoom(map.getZoom(), source);
      const inner = tileRange({ west, south, east, north }, z);
      const outer = tileRange({ west: west - dx, south: south - dy, east: east + dx, north: north + dy }, z);
      const area = source.area === "view"
        ? ringTiles(inner, { z, minX: 0, maxX: -1, minY: 0, maxY: -1 }, source.maxTiles ?? MAX_TILES_PER_SOURCE)
        : ringTiles(outer, inner, source.maxTiles ?? MAX_TILES_PER_SOURCE);
      for (const { x, y } of area) {
        const id = `${source.key}/${z}/${x}/${y}`;
        if (fetched.has(id)) continue;
        queue.push(() => {
          if (fetched.size >= MAX_REMEMBERED) fetched.clear();
          fetched.add(id);
          return source.load(z, x, y).catch(() => fetched.delete(id));
        });
      }
    }
    // A few at a time, and none once the camera moves again (MapLibre's own
    // requests for the new view come first).
    const worker = async () => {
      while (queue.length > 0 && current === round) await queue.shift()!();
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  };

  const onMoveStart = () => {
    round++;
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };
  // Nothing before the first view's own tiles are in: camera jumps while the
  // map loads (its entrance) end moves too, and prefetching then would compete
  // with the tiles the first view is waiting for.
  let firstViewDrawn = false;
  const onMoveEnd = () => {
    if (!firstViewDrawn) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => { void run(); }, SETTLE_MS);
  };
  const onFirstIdle = () => {
    firstViewDrawn = true;
    onMoveEnd();
  };
  map.on("movestart", onMoveStart);
  map.on("moveend", onMoveEnd);
  map.once("idle", onFirstIdle);
  return () => {
    round++;
    if (timer !== null) window.clearTimeout(timer);
    map.off("movestart", onMoveStart);
    map.off("moveend", onMoveEnd);
    map.off("idle", onFirstIdle);
  };
}
